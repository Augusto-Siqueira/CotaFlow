"use client";

import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { photoUrl } from "@/lib/photos";
import { ButtonLink, buttonClasses } from "@/components/Button";
import {
  CERT_LABEL,
  MONTHLY_CREATES_DEFECTS,
  MONTHLY_TEMPLATE_LABEL,
  fmtDateBr,
  monthlyStatus,
  statusText,
  type MonthlyChecklist,
  type MonthlyItem,
} from "@/lib/monthlyChecklist";

const ANSWER_BADGE: Record<string, string> = {
  S: "bg-brand-100 text-brand-800",
  N: "bg-red-100 text-red-800",
  NA: "bg-navy-100 text-navy-600",
};

export default function MonthlyChecklistView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { role, loading: authLoading } = useAuth();
  const allowed = ["admin", "manutencao", "logistica", "inspetor"].includes(role ?? "");
  const [data, setData] = useState<{ c: MonthlyChecklist; items: MonthlyItem[] } | null | undefined>(undefined);
  const [photoLinks, setPhotoLinks] = useState<Record<string, string>>({});
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    queueMicrotask(() => setIsNew(new URLSearchParams(window.location.search).get("novo") === "1"));
    (async () => {
      const { data: c } = await supabase.from("monthly_checklists").select("*").eq("id", id).maybeSingle();
      if (!c) {
        setData(null);
        return;
      }
      const checklist = c as MonthlyChecklist;
      const { data: items } = await supabase
        .from("monthly_checklist_items")
        .select("*")
        .eq("template", checklist.template)
        .order("position");
      setData({ c: checklist, items: (items as MonthlyItem[] | null) ?? [] });
      const links: Record<string, string> = {};
      for (const p of Object.values(checklist.photos ?? {}).flat()) {
        const u = await photoUrl(p);
        if (u) links[p] = u;
      }
      setPhotoLinks(links);
    })();
  }, [allowed, id]);

  if (authLoading) return null;
  if (!allowed) return null;
  if (data === undefined) return <p className="px-6 py-10 text-sm text-navy-500">Carregando...</p>;
  if (data === null) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-navy-900">Check-list não encontrado</h1>
        <ButtonLink href="/checklist-mensal" variant="secondary" size="sm" className="mt-4">
          Voltar
        </ButtonLink>
      </div>
    );
  }

  const { c, items } = data;
  const status = monthlyStatus(c.finished_at);
  const nItems = items.filter((i) => c.answers[i.id] === "N");

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ButtonLink href="/checklist-mensal" variant="secondary" size="sm">
          Voltar
        </ButtonLink>
        <a href={`/api/checklist-mensal/${c.id}/pdf`} target="_blank" rel="noopener" className={buttonClasses("soft", "sm")}>
          Baixar PDF
        </a>
      </div>

      {isNew && (
        <div role="status" className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
          ✓ Check-list salvo.
          {c.defects_created > 0
            ? ` ${c.defects_created} ${c.defects_created === 1 ? "defeito foi enviado" : "defeitos foram enviados"} para a triagem da Manutenção.`
            : c.nonconformities > 0
              ? ` ${c.nonconformities} ${c.nonconformities === 1 ? "item ficou" : "itens ficaram"} com N.`
              : " Nenhum item com N."}
        </div>
      )}

      <h1 className="mt-4 text-xl font-semibold text-navy-900">
        Check-list mensal · <span className="tracking-wide">{c.plate}</span>
      </h1>
      <p className="text-sm text-navy-500">
        {MONTHLY_TEMPLATE_LABEL[c.template]} · {new Date(c.finished_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · próximo
        até {fmtDateBr(status.due)} ({statusText(status)})
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-navy-200 bg-white p-4 text-sm">
        <div>
          <dt className="text-[11px] uppercase text-navy-500">Responsável</dt>
          <dd className="font-medium text-navy-900">{c.inspector_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase text-navy-500">Motorista</dt>
          <dd className="font-medium text-navy-900">
            {c.driver_absent ? `Ausente — ${c.driver_absent_reason ?? ""}` : (c.driver_name ?? "—")}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase text-navy-500">Itens com N</dt>
          <dd className={`font-medium ${c.nonconformities > 0 ? "text-red-700" : "text-navy-900"}`}>{c.nonconformities}</dd>
        </div>
        {MONTHLY_CREATES_DEFECTS || c.defects_created > 0 ? (
          <div>
            <dt className="text-[11px] uppercase text-navy-500">Defeitos na manutenção</dt>
            <dd className="font-medium text-navy-900">{c.defects_created}</dd>
          </div>
        ) : null}
      </dl>

      {c.divergences.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span className="font-medium">⚠ Vencimentos diferentes do cadastro da placa (conferir):</span>
          <ul className="mt-1 list-disc pl-5">
            {c.divergences.map((d) => (
              <li key={d.item}>
                {d.item} {CERT_LABEL[d.cert]}: check-list {fmtDateBr(d.checklist)} · cadastro {fmtDateBr(d.cadastro)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {nItems.length > 0 && (
        <section className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <h2 className="text-sm font-medium text-red-800">Itens com N</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {nItems.map((i) => (
              <li key={i.id}>
                <span className="font-semibold">{i.number}</span> {i.text}
                {i.maintenance && <span className="ml-1 text-xs text-red-700">(manutenção: {i.category})</span>}
                {c.item_notes[i.id] && <span className="block text-red-900">— {c.item_notes[i.id]}</span>}
                {(c.photos[i.id] ?? []).length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-2">
                    {(c.photos[i.id] ?? []).map((p) =>
                      photoLinks[p] ? (
                        <a key={p} href={photoLinks[p]} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photoLinks[p]} alt={`Foto do item ${i.number}`} className="h-24 w-32 rounded border border-red-200 object-cover" />
                        </a>
                      ) : null
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-4 rounded-xl border border-navy-200 bg-white">
        <ul className="divide-y divide-navy-100 text-sm">
          {items.map((i, index, all) => {
            const header = index === 0 || all[index - 1].section !== i.section;
            const ex = c.extras[i.id] ?? {};
            const extraText = [
              ex.due && `venc. ${fmtDateBr(ex.due)}`,
              ex.due2 && `2º venc. ${fmtDateBr(ex.due2)}`,
              ex.validity && `validade ${fmtDateBr(ex.validity)}`,
              ex.date && `última regulagem ${fmtDateBr(ex.date)}`,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={i.id}>
                {header && <div className="bg-navy-50 px-4 py-1.5 text-[11px] font-semibold uppercase text-navy-600">{i.section}</div>}
                <div className="flex items-start justify-between gap-3 px-4 py-2">
                  <span className="text-navy-800">
                    <span className="font-semibold">{i.number}</span> {i.text}
                    {extraText && <span className="block text-xs text-navy-500">{extraText}</span>}
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${ANSWER_BADGE[c.answers[i.id] ?? "NA"]}`}>
                    {c.answers[i.id] === "NA" ? "N/A" : (c.answers[i.id] ?? "—")}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {c.observations && (
        <div className="mt-4 rounded-xl border border-navy-200 bg-white p-4 text-sm">
          <span className="text-[11px] uppercase text-navy-500">Observações</span>
          <p className="mt-1 whitespace-pre-line text-navy-900">{c.observations}</p>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <figure className="rounded-xl border border-navy-200 bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.inspector_signature} alt="Assinatura do responsável" className="h-24 w-full object-contain" />
          <figcaption className="mt-1 text-center text-xs text-navy-500">Assinatura do responsável</figcaption>
        </figure>
        <figure className="rounded-xl border border-navy-200 bg-white p-3">
          {c.driver_signature ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.driver_signature} alt="Assinatura do motorista" className="h-24 w-full object-contain" />
          ) : (
            <p className="flex h-24 items-center justify-center text-sm text-amber-800">Motorista ausente</p>
          )}
          <figcaption className="mt-1 text-center text-xs text-navy-500">Assinatura do motorista</figcaption>
        </figure>
      </div>
    </div>
  );
}
