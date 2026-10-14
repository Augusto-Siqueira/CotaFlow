"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { buttonClasses } from "@/components/Button";
import { DataTable, type Column } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { ChecklistTodayAlert } from "@/components/ChecklistTodayAlert";
import { photoUrl } from "@/lib/photos";
import { formatDateTime } from "@/lib/maintenance";
import {
  FAST_MINUTES,
  checklistMinutes,
  expectedDays,
  fetchChecklists,
  fetchDrivers,
  fetchLoadDays,
  localDate,
  type ChecklistDriver,
  type ChecklistLoad,
  type ChecklistRow,
} from "@/lib/checklists";

interface ItemInfo {
  id: string;
  stage: string;
  text: string;
}

const ANSWER_LABEL: Record<string, { label: string; cls: string }> = {
  ok: { label: "OK", cls: "bg-brand-200 text-brand-900" },
  prob: { label: "Problema", cls: "bg-red-100 text-red-700" },
  na: { label: "N/A", cls: "bg-navy-200 text-navy-700" },
};

function minutesLabel(min: number): string {
  if (min < 1) return "menos de 1 min";
  return `${Math.round(min)} min`;
}

interface DriverStat {
  label: string;
  hasAccess: boolean;
  expectedDays: number;
  doneDays: number;
  total: number;
  last: string | null;
}

/**
 * Check-lists dos motoristas no período: alerta de pendentes hoje, aderência
 * (dias com carga em que o check-list foi feito), ranking por motorista e
 * histórico com detalhe e fotos.
 */
export function ChecklistSection({ from, to }: { from: string; to: string }) {
  const [data, setData] = useState<{
    key: string;
    drivers: ChecklistDriver[];
    loads: ChecklistLoad[];
    lists: ChecklistRow[];
  } | null>(null);
  const [items, setItems] = useState<ItemInfo[]>([]);
  const [tab, setTab] = useState<"motorista" | "historico">("motorista");
  const [driverFilter, setDriverFilter] = useState("");
  const [detail, setDetail] = useState<ChecklistRow | null>(null);
  const [detailPhotos, setDetailPhotos] = useState<Record<string, string[]>>({});

  const key = `${from}|${to}`;
  const invalid = from > to;

  useEffect(() => {
    if (invalid) return;
    let cancelled = false;
    Promise.all([fetchDrivers(), fetchLoadDays(from, to), fetchChecklists(from, to)]).then(
      ([drivers, loads, lists]) => {
        if (!cancelled) setData({ key, drivers, loads, lists });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [from, to, key, invalid]);

  useEffect(() => {
    supabase
      .from("checklist_items")
      .select("id, stage, text")
      .order("position")
      .then(({ data: rows }) => setItems((rows as ItemInfo[] | null) ?? []));
  }, []);

  const loading = !invalid && (data === null || data.key !== key);
  const driverByUser = useMemo(() => {
    const m = new Map<string, ChecklistDriver>();
    for (const d of data?.drivers ?? []) if (d.userId) m.set(d.userId, d);
    return m;
  }, [data]);

  const stats = useMemo<DriverStat[]>(() => {
    if (!data || data.key !== key) return [];
    return data.drivers
      .map((d) => {
        // Obrigatório todo dia (domingo só com carga), desde que ganhou acesso.
        const loadDays = new Set(
          data.loads
            .filter((l) => l.driver === d.label || l.driver === d.name)
            .map((l) => l.schedule_date)
        );
        const expected = expectedDays(d, loadDays, from, to);
        const mine = data.lists.filter((c) => d.userId !== null && c.user_id === d.userId);
        const doneDays = new Set(mine.map((c) => localDate(new Date(c.finished_at))));
        let expectedDone = 0;
        for (const day of expected) if (doneDays.has(day)) expectedDone++;
        return {
          label: d.label,
          hasAccess: d.userId !== null,
          expectedDays: expected.size,
          doneDays: expectedDone,
          total: mine.length,
          last: mine[0]?.finished_at ?? null,
        };
      })
      .filter((s) => s.hasAccess || s.total > 0)
      .sort(
        (a, b) =>
          (a.expectedDays ? a.doneDays / a.expectedDays : 1) -
            (b.expectedDays ? b.doneDays / b.expectedDays : 1) ||
          a.label.localeCompare(b.label, "pt-BR")
      );
  }, [data, key, from, to]);

  const adherence = useMemo(() => {
    const withApp = stats.filter((s) => s.hasAccess);
    const expected = withApp.reduce((sum, s) => sum + s.expectedDays, 0);
    const done = withApp.reduce((sum, s) => sum + s.doneDays, 0);
    return expected > 0 ? { pct: (done / expected) * 100, done, expected } : null;
  }, [stats]);

  const lists = useMemo(
    () =>
      (data && data.key === key ? data.lists : []).filter(
        (c) =>
          !driverFilter || driverByUser.get(c.user_id)?.label === driverFilter
      ),
    [data, key, driverFilter, driverByUser]
  );

  const summary = useMemo(() => {
    const mins = lists.map(checklistMinutes);
    return {
      total: lists.length,
      withProblems: lists.filter((c) => c.nonconformities > 0).length,
      avg: mins.length ? mins.reduce((a, b) => a + b, 0) / mins.length : null,
      fast: mins.filter((m) => m < FAST_MINUTES).length,
    };
  }, [lists]);

  async function openDetail(c: ChecklistRow) {
    setDetail(c);
    setDetailPhotos({});
    const entries = await Promise.all(
      Object.entries(c.photos ?? {}).map(async ([id, paths]) => {
        const urls = await Promise.all(paths.map((p) => photoUrl(p)));
        return [id, urls.filter((u): u is string => Boolean(u))] as const;
      })
    );
    setDetailPhotos(Object.fromEntries(entries));
  }

  const photoCount = (c: ChecklistRow) =>
    Object.values(c.photos ?? {}).reduce((sum, list) => sum + list.length, 0);

  const columns: Column<ChecklistRow>[] = [
    {
      key: "when",
      header: "Data e hora",
      mobile: "title",
      cell: (c) => formatDateTime(c.finished_at),
    },
    {
      key: "driver",
      header: "Motorista",
      mobile: "subtitle",
      className: "font-medium text-navy-900",
      cell: (c) => driverByUser.get(c.user_id)?.label ?? "—",
    },
    {
      key: "plates",
      header: "Placas",
      mobile: "field",
      className: "font-medium tracking-wide",
      cell: (c) => [c.plate, c.trailer_plate].filter(Boolean).join(" + ") || "—",
    },
    {
      key: "dur",
      header: "Duração",
      mobile: "field",
      cell: (c) => {
        const m = checklistMinutes(c);
        return m < FAST_MINUTES ? (
          <span className="font-medium text-amber-700" title="Muito rápido: confira se foi feito de verdade">
            ⚠ {minutesLabel(m)}
          </span>
        ) : (
          minutesLabel(m)
        );
      },
    },
    {
      key: "prob",
      header: "Problemas",
      mobile: "badge",
      cell: (c) =>
        c.nonconformities > 0 ? (
          <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
            {c.nonconformities} {c.nonconformities === 1 ? "problema" : "problemas"}
          </span>
        ) : (
          <span className="rounded-full bg-brand-200 px-2.5 py-1 text-xs font-medium text-brand-900">
            Sem problemas
          </span>
        ),
    },
    { key: "photos", header: "Fotos", mobile: "field", cell: (c) => photoCount(c) || "—" },
    {
      key: "actions",
      header: "Detalhes",
      mobile: "actions",
      cell: (c) => (
        <button type="button" onClick={() => openDetail(c)} className={buttonClasses("soft", "sm")}>
          Ver
        </button>
      ),
    },
  ];

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? "bg-brand-100 text-brand-800" : "text-navy-600 hover:bg-navy-50"
    }`;

  const detailByStage = useMemo(() => {
    if (!detail) return [];
    const known = items.filter((i) => detail.answers[i.id] !== undefined);
    const stages: { stage: string; rows: ItemInfo[] }[] = [];
    for (const it of known) {
      const last = stages[stages.length - 1];
      if (last && last.stage === it.stage) last.rows.push(it);
      else stages.push({ stage: it.stage, rows: [it] });
    }
    return stages;
  }, [detail, items]);

  if (invalid) return null;

  return (
    <section className="mt-8" aria-label="Check-lists dos motoristas">
      <h2 className="text-base font-semibold text-navy-900">Check-lists dos motoristas</h2>
      <p className="mt-0.5 text-xs text-navy-500">
        O check-list é obrigatório todo dia para todo motorista com acesso ao app, tenha ou não
        carga (domingo só conta se houver carga).
      </p>

      <div className="mt-3">
        <ChecklistTodayAlert />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-navy-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase text-navy-500">Aderência</div>
          <div
            className={`mt-1 text-2xl font-semibold ${
              adherence && adherence.pct < 90 ? "text-amber-700" : "text-navy-900"
            }`}
          >
            {adherence ? `${Math.round(adherence.pct)}%` : "—"}
          </div>
          <div className="mt-0.5 text-xs text-navy-500">
            {adherence
              ? `${adherence.done} de ${adherence.expected} dias esperados`
              : loading
                ? "calculando..."
                : "sem dias esperados no período"}
          </div>
        </div>
        <div className="rounded-xl border border-navy-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase text-navy-500">Check-lists feitos</div>
          <div className="mt-1 text-2xl font-semibold text-navy-900">{summary.total}</div>
          <div className="mt-0.5 text-xs text-navy-500">
            {summary.withProblems} com problema relatado
          </div>
        </div>
        <div className="rounded-xl border border-navy-200 bg-white px-4 py-3">
          <div className="text-xs font-medium uppercase text-navy-500">Tempo médio</div>
          <div className="mt-1 text-2xl font-semibold text-navy-900">
            {summary.avg !== null ? minutesLabel(summary.avg) : "—"}
          </div>
          <div className="mt-0.5 text-xs text-navy-500">meta: pelo menos {FAST_MINUTES} min</div>
        </div>
        <div
          className={`rounded-xl border px-4 py-3 ${
            summary.fast > 0
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-navy-200 bg-white text-navy-900"
          }`}
        >
          <div className="text-xs font-medium uppercase">Muito rápidos</div>
          <div className="mt-1 text-2xl font-semibold">{summary.fast}</div>
          <div className="mt-0.5 text-xs">menos de {FAST_MINUTES} min: vale conferir</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-navy-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="tablist"
            aria-label="Visão dos check-lists"
            className="inline-flex overflow-hidden rounded-lg border border-navy-300"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "motorista"}
              onClick={() => setTab("motorista")}
              className={tabCls(tab === "motorista")}
            >
              Por motorista
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "historico"}
              onClick={() => setTab("historico")}
              className={tabCls(tab === "historico")}
            >
              Histórico
            </button>
          </div>
          {tab === "historico" && (
            <select
              aria-label="Filtrar por motorista"
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="rounded-lg border border-navy-300 bg-white px-3 py-1.5 text-xs font-medium text-navy-900 outline-none focus:border-brand-500"
            >
              <option value="">Todos os motoristas</option>
              {(data?.drivers ?? [])
                .filter((d) => d.userId)
                .map((d) => (
                  <option key={d.label} value={d.label}>
                    {d.label}
                  </option>
                ))}
            </select>
          )}
        </div>

        {tab === "motorista" ? (
          stats.length === 0 ? (
            <p className="py-8 text-center text-sm text-navy-500">
              {loading ? "Carregando..." : "Nenhum motorista com acesso ao app ou check-list no período."}
            </p>
          ) : (
            <ul className="mt-3 max-h-96 space-y-1 overflow-y-auto pr-1">
              {stats.map((s) => {
                const pct = s.expectedDays ? (s.doneDays / s.expectedDays) * 100 : null;
                return (
                  <li
                    key={s.label}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-sm"
                  >
                    <span className="w-40 shrink-0 truncate font-medium text-navy-900 sm:w-52">
                      {s.label}
                    </span>
                    {!s.hasAccess ? (
                      <span className="rounded-full bg-navy-200 px-2 py-0.5 text-[11px] text-navy-700">
                        sem acesso ao app
                      </span>
                    ) : (
                      <>
                        <span className="h-3.5 min-w-24 flex-1 overflow-hidden rounded bg-navy-100">
                          <span
                            className={`block h-full rounded ${
                              pct !== null && pct < 90 ? "bg-amber-400" : "bg-brand-400"
                            }`}
                            style={{ width: `${Math.max(pct ?? 0, 2)}%` }}
                          />
                        </span>
                        <span className="w-40 shrink-0 text-right text-xs text-navy-700">
                          {pct !== null
                            ? `${Math.round(pct)}% · ${s.doneDays} de ${s.expectedDays} dias`
                            : `${s.total} feito(s)`}
                          {s.last && (
                            <span className="block text-[11px] text-navy-500">
                              último: {formatDateTime(s.last)}
                            </span>
                          )}
                        </span>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        ) : lists.length === 0 ? (
          <p className="py-8 text-center text-sm text-navy-500">
            {loading ? "Carregando..." : "Nenhum check-list no período."}
          </p>
        ) : (
          <div className="mt-3">
            <DataTable rows={lists} columns={columns} rowKey={(c) => c.id} />
          </div>
        )}
      </div>

      {detail && (
        <Modal onClose={() => setDetail(null)} labelledBy="ck-detail-title" className="max-w-lg">
          <h2 id="ck-detail-title" className="text-base font-medium">
            Check-list de {driverByUser.get(detail.user_id)?.label ?? "motorista"}
          </h2>
          <p className="mt-0.5 text-xs text-navy-500">
            {formatDateTime(detail.finished_at)} ·{" "}
            {[detail.plate, detail.trailer_plate].filter(Boolean).join(" + ") || "sem placa"} ·{" "}
            {minutesLabel(checklistMinutes(detail))}
            {detail.lat !== null && detail.lon !== null && (
              <>
                {" · "}
                <a
                  href={`https://www.google.com/maps?q=${detail.lat},${detail.lon}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  ver local
                </a>
              </>
            )}
          </p>
          <div className="mt-4 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {detailByStage.map((g) => (
              <div key={g.stage}>
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-navy-500">
                  {g.stage}
                </h3>
                <ul className="space-y-1.5">
                  {g.rows.map((it) => {
                    const a = ANSWER_LABEL[detail.answers[it.id]] ?? ANSWER_LABEL.na;
                    return (
                      <li
                        key={it.id}
                        className={`rounded-lg border px-3 py-2 text-sm ${
                          detail.answers[it.id] === "prob"
                            ? "border-red-300 bg-red-50"
                            : "border-navy-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-navy-800">{it.text}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${a.cls}`}
                          >
                            {a.label}
                          </span>
                        </div>
                        {detail.notes?.[it.id] && (
                          <p className="mt-1 text-xs text-navy-700">“{detail.notes[it.id]}”</p>
                        )}
                        {(detailPhotos[it.id]?.length ?? 0) > 0 && (
                          <ul className="mt-1.5 flex flex-wrap gap-2">
                            {detailPhotos[it.id].map((u, i) => (
                              <li key={u}>
                                <a href={u} target="_blank" rel="noreferrer" title="Abrir a foto">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={u}
                                    alt={`Foto ${i + 1} do item`}
                                    className="h-16 w-16 rounded-lg border border-navy-200 object-cover"
                                  />
                                </a>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setDetail(null)}
              className={buttonClasses("secondary", "md")}
            >
              Fechar
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
