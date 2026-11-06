"use client";

import { useMemo, useState } from "react";
import { useKm } from "@/lib/kmExato/useKm";
import { useTabCounts } from "@/lib/kmExato/useTabCounts";
import { addDays, daysBetween, todayISO } from "@/lib/kmExato/engine";
import { dBR, ton } from "@/lib/kmExato/format";
import { updateDelivery } from "@/lib/kmExato/actions";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";
import { DataTable, type Column } from "@/components/DataTable";
import { KmPage, Panel, Pill, Plate } from "@/components/km/KmUi";
import { TripDialogs, type TripDialog } from "@/components/km/KmTripModals";
import { ProofModal } from "@/components/DeliveryProofDestinations";

// KM Exato · Entregas: data de cada entrega e envio do comprovante (prazo em Ajustes).

type Seg = "atrasado" | "pendente" | "aguardando" | "enviado";
const SEGS: [Seg, string][] = [
  ["atrasado", "Comprovante atrasado"],
  ["pendente", "Comprovante no prazo"],
  ["aguardando", "Em trânsito"],
  ["enviado", "Concluídas"],
];

export default function KmEntregasPage() {
  const km$ = useKm();
  const E = km$.engine;
  const counts = useTabCounts(E);
  const { toastError, toastSuccess, confirm: askConfirm } = useFeedback();
  const [cf, setCf] = useState<Seg>("atrasado");
  const [dates, setDates] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<TripDialog>(null);
  const [proofOpen, setProofOpen] = useState<{ scheduleId: string; destination: string } | null>(null);

  const C = useMemo(() => (E ? E.comps() : []), [E]);
  const d60 = addDays(todayISO(), -60);
  const recent = (c: (typeof C)[number]) => (c.e.entregue || c.v.carreg) >= d60;
  const cnt = useMemo(() => {
    const o: Record<Seg, number> = { atrasado: 0, pendente: 0, aguardando: 0, enviado: 0 };
    C.forEach((c) => {
      if (c.st === "enviado" && !recent(c)) return;
      o[c.st]++;
    });
    return o;
  }, [C]); // eslint-disable-line react-hooks/exhaustive-deps
  const L = useMemo(
    () =>
      C.filter((c) => c.st === cf && (cf !== "enviado" || recent(c))).sort((a, b) => {
        const x = a.e.entregue || a.v.carreg;
        const y = b.e.entregue || b.v.carreg;
        return cf === "enviado" ? (x < y ? 1 : -1) : x < y ? -1 : 1;
      }),
    [C, cf] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const prazo = E ? +E.R().prazoComp || 1 : 1;

  async function run(key: string, fn: () => Promise<void>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toastSuccess(ok);
      km$.reload();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<(typeof C)[number]>[] = [
    {
      key: "data",
      header: "Entrega",
      mobile: "badge",
      cell: (c) => (c.e.entregue ? <span className="font-mono">{dBR(c.e.entregue)}</span> : <span className="text-navy-500">saiu {dBR(c.v.carreg)}</span>),
    },
    { key: "placa", header: "Placa", mobile: "field", cell: (c) => <Plate plate={c.v.placa} /> },
    {
      key: "cliente",
      header: "Cliente / destino",
      mobile: "title",
      cell: (c) => (
        <button type="button" className="text-left text-navy-900 hover:text-brand-700 hover:underline" onClick={() => setDialog({ kind: "detail", id: c.vid })}>
          {c.e.cliente}
        </button>
      ),
    },
    { key: "nf", header: "NF", mobile: "field", cell: (c) => <span className="font-mono">{c.e.nf || "—"}</span> },
    { key: "cte", header: "CT-e", mobile: "field", cell: (c) => <span className="font-mono">{c.e.cte || "—"}</span> },
    { key: "peso", header: "Peso", mobile: "field", className: "text-right", cell: (c) => ton(+(c.e.peso ?? 0) || 0) },
    {
      key: "comp",
      header: "Comprovante",
      mobile: "field",
      cell: (c) => {
        if (!c.e.entregue) return <Pill tone="mute">em trânsito</Pill>;
        if (c.e.comp?.env) return <span className="inline-flex flex-wrap items-center gap-1.5"><Pill tone="ok">{c.e.comp.auto ? "enviado por e-mail" : "enviado"}</Pill>{!c.e.comp.antes && c.e.comp.em && <span className="text-xs text-navy-500">{dBR(c.e.comp.em)}</span>}</span>;
        const late = daysBetween(addDays(c.e.entregue, prazo), todayISO());
        return c.st === "atrasado" ? <Pill tone="risk">{late} dia{late > 1 ? "s" : ""} de atraso</Pill> : <Pill tone="ok">no prazo</Pill>;
      },
    },
    {
      key: "acao",
      header: "",
      mobile: "actions",
      cell: (c) => {
        const key = c.e.id;
        const proofBtn = c.e.proof ? (
          <button
            type="button"
            className={buttonClasses(c.e.comp?.env ? "soft" : "primary", "sm")}
            onClick={() => setProofOpen({ scheduleId: c.e.proof!.scheduleId, destination: c.e.proof!.destination })}
            title="Comprovante lançado pelo motorista no app (NF/CT-e iguais aos desta entrega)"
          >
            {c.e.comp?.env ? "Ver comprovante" : "Ver e enviar"}
          </button>
        ) : null;
        if (proofBtn && (c.e.comp?.env || c.e.comp?.auto)) return proofBtn;
        if (proofBtn && c.e.entregue)
          return (
            <span className="inline-flex items-center gap-2">
              {proofBtn}
              <button
                type="button"
                disabled={busy === key}
                className={buttonClasses("secondary", "sm")}
                title="Marca como enviado sem usar o e-mail do CotaFlow"
                onClick={() => run(key, () => updateDelivery(key, c.vid, { proof_sent: true, proof_sent_at: new Date().toISOString() }, `Comprovante enviado: ${c.e.cliente}`, km$.userName), "Comprovante marcado como enviado.")}
              >
                Enviado
              </button>
            </span>
          );
        if (!c.e.entregue)
          return (
            <span className="inline-flex items-center gap-2">
              <input
                type="date"
                max={todayISO()}
                aria-label={`Data da entrega de ${c.e.cliente}`}
                value={dates[key] ?? ""}
                onChange={(ev) => setDates((d) => ({ ...d, [key]: ev.target.value }))}
                className="rounded-md border border-navy-300 px-2 py-1 text-xs text-navy-900"
              />
              <button
                type="button"
                disabled={busy === key}
                className={buttonClasses("secondary", "sm")}
                onClick={() => {
                  const dt = dates[key];
                  if (!dt) {
                    toastError("Informe a data da entrega.");
                    return;
                  }
                  run(key, () => updateDelivery(key, c.vid, { delivered_on: dt }, `Entrega em ${dBR(dt)}: ${c.e.cliente}`, km$.userName), "Entrega registrada.");
                }}
              >
                Entregue
              </button>
            </span>
          );
        if (c.e.comp?.env)
          return km$.isAdmin && !c.e.comp.antes && !c.e.comp.auto ? (
            <button
              type="button"
              disabled={busy === key}
              className={buttonClasses("secondary", "sm")}
              onClick={async () => {
                if (!(await askConfirm(`Desfazer o envio do comprovante de ${c.e.cliente}?`, { confirmLabel: "Desfazer" }))) return;
                run(key, () => updateDelivery(key, c.vid, { proof_sent: false, proof_sent_at: null, proof_sent_by: null }, `Envio desfeito: ${c.e.cliente}`, km$.userName), "Envio desfeito.");
              }}
            >
              Desfazer
            </button>
          ) : null;
        return (
          <button
            type="button"
            disabled={busy === key}
            className={buttonClasses("primary", "sm")}
            onClick={() => run(key, () => updateDelivery(key, c.vid, { proof_sent: true, proof_sent_at: new Date().toISOString() }, `Comprovante enviado: ${c.e.cliente}`, km$.userName), "Comprovante marcado como enviado.")}
          >
            Enviado
          </button>
        );
      },
    },
  ];

  const common = E ? { engine: E, userName: km$.userName, isAdmin: km$.isAdmin, onChanged: km$.reload } : null;

  return (
    <KmPage
      title="Entregas"
      subtitle={`Data de cada entrega e envio do comprovante (prazo de ${prazo} dia${prazo > 1 ? "s" : ""}). Comprovantes do app do motorista com a mesma NF ou CT-e entram sozinhos.`}
      active="/km-exato/entregas"
      isAdmin={km$.isAdmin}
      canView={km$.canView}
      authLoading={km$.authLoading}
      error={km$.error}
      loading={!E}
      counts={counts}
    >
      <Panel>
        <div className="mb-4 flex flex-wrap overflow-hidden rounded-lg border border-navy-300 text-sm sm:w-fit">
          {SEGS.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setCf(v)} className={`px-3 py-2 font-medium ${cf === v ? "bg-brand-700 text-white" : "bg-white text-navy-600 hover:bg-navy-50"}`}>
              {l} <span className="ml-1 font-mono text-xs opacity-75">{cnt[v]}</span>
            </button>
          ))}
        </div>
        {L.length === 0 ? <p className="py-10 text-center text-sm text-navy-500">Nada aqui.</p> : <DataTable rows={L.slice(0, 300)} columns={columns} rowKey={(c) => c.e.id} />}
        {cf === "enviado" && <p className="mt-3 text-xs text-navy-500">Concluídas dos últimos 60 dias.</p>}
      </Panel>
      {common && <TripDialogs {...common} dialog={dialog} setDialog={setDialog} />}
      {proofOpen && (
        <ProofModal
          scheduleId={proofOpen.scheduleId}
          destination={proofOpen.destination}
          canDelete
          onClose={() => setProofOpen(null)}
          onChanged={km$.reload}
          onEmailed={km$.reload}
        />
      )}
    </KmPage>
  );
}
