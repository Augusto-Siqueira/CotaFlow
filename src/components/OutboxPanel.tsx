"use client";

import { useState } from "react";
import Link from "next/link";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { discardItem, reviseChecklistPlates, type OutboxKind } from "@/lib/offline/outbox";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";

const REDO_HREF: Record<Exclude<OutboxKind, "checklist">, string> = {
  fuel: "/motorista/abastecimento",
  defect: "/motorista/defeito",
  proof: "/motorista/entrega",
};

/** Check-list recusado: o erro é sempre de placa, então corrige aqui mesmo. */
function ChecklistFix({ id, plate, trailer }: { id: string; plate: string; trailer: string }) {
  const [p, setP] = useState(plate);
  const [t, setT] = useState(trailer);
  const input = "w-28 rounded-lg border border-navy-300 px-2 py-1 text-sm uppercase";
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label className="text-xs text-navy-600">
        Cavalo
        <input value={p} onChange={(e) => setP(e.target.value.toUpperCase())} className={`${input} block`} />
      </label>
      <label className="text-xs text-navy-600">
        Carreta
        <input value={t} onChange={(e) => setT(e.target.value.toUpperCase())} className={`${input} block`} />
      </label>
      <button
        type="button"
        disabled={!p.trim()}
        onClick={() => reviseChecklistPlates(id, p.trim(), t.trim() || null)}
        className={buttonClasses("soft", "sm")}
      >
        Corrigir placas e reenviar
      </button>
    </div>
  );
}

/**
 * Fila de envio do motorista: o que está aguardando sinal e o que o servidor
 * recusou. Recusado = o motorista corrige (lança de novo) ou descarta; a equipe
 * já foi avisada automaticamente.
 */
export function OutboxPanel() {
  const { items, offline, sendNow, syncing } = useOffline();
  const { confirm: askConfirm } = useFeedback();
  if (items.length === 0) return null;

  return (
    <section className="mt-6" aria-label="Fila de envio">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-navy-900">Fila de envio</h2>
        {items.some((i) => i.status === "pending") && !offline && (
          <button type="button" onClick={sendNow} disabled={syncing} className={buttonClasses("secondary", "sm")}>
            {syncing ? "Enviando..." : "Enviar agora"}
          </button>
        )}
      </div>
      <ul className="mt-2 space-y-2">
        {items.map((i) => (
          <li
            key={i.id}
            className={`rounded-xl border px-4 py-2.5 text-sm ${
              i.status === "rejected" ? "border-red-300 bg-red-50" : "border-navy-200 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium text-navy-900">{i.summary}</span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  i.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                }`}
              >
                {i.status === "rejected" ? "Recusado" : offline ? "Aguardando sinal" : "Aguardando envio"}
              </span>
            </div>
            <div className="text-xs text-navy-500">
              Preenchido em{" "}
              {new Date(i.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            </div>
            {i.status === "rejected" && (
              <>
                <p className="mt-1 text-xs text-red-700">{i.reason} A equipe já foi avisada.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {i.kind !== "checklist" && (
                    <Link href={`${REDO_HREF[i.kind]}?refazer=${i.id}`} className={buttonClasses("soft", "sm")}>
                      Corrigir e lançar de novo
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      if (await askConfirm("Descartar este lançamento? Ele não será enviado.", { confirmLabel: "Descartar" })) {
                        await discardItem(i.id);
                      }
                    }}
                    className={buttonClasses("danger", "sm")}
                  >
                    Descartar
                  </button>
                </div>
                {i.kind === "checklist" && (
                  <ChecklistFix
                    id={i.id}
                    plate={String((i.payload as { checklist: { plate?: string } }).checklist.plate ?? "")}
                    trailer={String((i.payload as { checklist: { trailer_plate?: string } }).checklist.trailer_plate ?? "")}
                  />
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
