"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  FLEET_CERT_COLUMNS,
  FLEET_KINDS,
  certStatuses,
  normalizePlate,
  type CertKey,
  type CertLevel,
  type FleetCertFields,
} from "@/lib/fleet";

// Painel das capacitações (CIV e CIPP) da frota: quanto está vencido, vencendo e
// em dia, e quando vencem nos próximos meses. As datas são editadas na tela
// Veículos; aqui é só acompanhamento.

const MONTHS_AHEAD = 6;
const SOON_DAYS = 30;

const selectCls =
  "rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

interface Item {
  plate: string;
  kindLabel: string;
  kind: string;
  cert: CertKey;
  label: string;
  stage: "preliminar" | "definitivo" | null;
  due: string | null;
  days: number | null;
  level: CertLevel;
}

type Filter = "todas" | "vencidas" | "7" | "30" | "sem_data";

const LEVEL_BADGE: Record<CertLevel, string> = {
  vencida: "bg-red-100 text-red-800",
  vencendo: "bg-amber-100 text-amber-800",
  ok: "bg-teal-100 text-teal-800",
  na: "bg-navy-100 text-navy-600",
  sem_data: "bg-navy-100 text-navy-500",
};

function fmtDate(d: string): string {
  return new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR");
}

function situation(i: Item): string {
  if (i.level === "sem_data") return "sem data";
  if (i.days === null) return "";
  if (i.days < 0) return `vencida há ${-i.days} ${-i.days === 1 ? "dia" : "dias"}`;
  if (i.days === 0) return "vence hoje";
  return `vence em ${i.days} ${i.days === 1 ? "dia" : "dias"}`;
}

export default function CapacitacoesPage() {
  const [rows, setRows] = useState<FleetCertFields[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [cert, setCert] = useState<"" | CertKey>("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");

  useEffect(() => {
    supabase
      .from("fleet_units")
      .select(FLEET_CERT_COLUMNS)
      .order("plate")
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        setRows((data as FleetCertFields[] | null) ?? []);
      });
  }, []);

  // Uma linha por placa × capacitação exigida (N/A fica de fora: não é controlado).
  const items = useMemo<Item[]>(() => {
    const q = normalizePlate(search);
    const out: Item[] = [];
    for (const u of rows ?? []) {
      if (kind && u.kind !== kind) continue;
      if (q && !u.plate.includes(q)) continue;
      const kindLabel = FLEET_KINDS.find((k) => k.value === u.kind)?.label ?? u.kind;
      for (const s of certStatuses(u)) {
        if (s.level === "na") continue;
        if (cert && s.cert !== cert) continue;
        out.push({ plate: u.plate, kind: u.kind, kindLabel, cert: s.cert, label: s.label, stage: s.stage, due: s.due, days: s.days, level: s.level });
      }
    }
    return out;
  }, [rows, kind, cert, search]);

  const counts = useMemo(() => {
    const c = { vencida: 0, d7: 0, d30: 0, ok: 0, sem: 0 };
    for (const i of items) {
      if (i.level === "vencida") c.vencida++;
      else if (i.level === "sem_data") c.sem++;
      else if (i.days! <= 7) c.d7++;
      else if (i.days! <= SOON_DAYS) c.d30++;
      else c.ok++;
    }
    return c;
  }, [items]);

  // Vencimentos por mês: vencidas primeiro, depois os próximos meses (CIV e CIPP separados).
  const months = useMemo(() => {
    const now = new Date();
    const cols: { label: string; civ: number; cipp: number; crono: number; tone: "red" | "brand" }[] = [
      { label: "Vencidas", civ: 0, cipp: 0, crono: 0, tone: "red" },
    ];
    for (let i = 0; i < MONTHS_AHEAD; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      cols.push({ label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", ""), civ: 0, cipp: 0, crono: 0, tone: "brand" });
    }
    cols.push({ label: "Depois", civ: 0, cipp: 0, crono: 0, tone: "brand" });
    for (const i of items) {
      if (i.due === null || i.days === null) continue;
      let idx: number;
      if (i.days < 0) idx = 0;
      else {
        const d = new Date(`${i.due}T12:00:00`);
        const diff = (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth();
        idx = diff >= MONTHS_AHEAD ? MONTHS_AHEAD + 1 : diff + 1;
      }
      cols[idx][i.cert]++;
    }
    return cols;
  }, [items]);
  const monthMax = Math.max(...months.map((m) => m.civ + m.cipp + m.crono), 1);

  // Situação por tipo de veículo.
  const byKind = useMemo(
    () =>
      FLEET_KINDS.map((k) => {
        const mine = items.filter((i) => i.kind === k.value);
        return {
          kind: k,
          total: mine.length,
          vencida: mine.filter((i) => i.level === "vencida").length,
          vencendo: mine.filter((i) => i.level === "vencendo").length,
          ok: mine.filter((i) => i.level === "ok").length,
          sem: mine.filter((i) => i.level === "sem_data").length,
        };
      }).filter((k) => k.total > 0),
    [items]
  );

  const list = useMemo(() => {
    const f = items.filter((i) => {
      if (filter === "vencidas") return i.level === "vencida";
      if (filter === "7") return i.level === "vencendo" || i.level === "vencida";
      if (filter === "30") return i.days !== null && i.days <= SOON_DAYS;
      if (filter === "sem_data") return i.level === "sem_data";
      return true;
    });
    return f.sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999) || a.plate.localeCompare(b.plate));
  }, [items, filter]);

  const kpis: { label: string; value: number; tone: string; hint: string }[] = [
    { label: "Vencidas", value: counts.vencida, tone: "text-red-700", hint: "Passaram da data de vencimento" },
    { label: "Vencem em até 7 dias", value: counts.d7, tone: "text-amber-700", hint: "Já geram alerta na Programação" },
    { label: `Vencem em 8 a ${SOON_DAYS} dias`, value: counts.d30, tone: "text-navy-900", hint: "Para agendar a inspeção" },
    { label: "Em dia", value: counts.ok, tone: "text-teal-700", hint: `Vencem em mais de ${SOON_DAYS} dias` },
    { label: "Sem data", value: counts.sem, tone: "text-navy-500", hint: "Exigem a capacitação, mas sem vencimento lançado" },
  ];

  const filters: { value: Filter; label: string }[] = [
    { value: "todas", label: `Todas (${items.length})` },
    { value: "vencidas", label: `Vencidas (${counts.vencida})` },
    { value: "7", label: `Até 7 dias (${counts.vencida + counts.d7})` },
    { value: "30", label: `Até ${SOON_DAYS} dias (${counts.vencida + counts.d7 + counts.d30})` },
    { value: "sem_data", label: `Sem data (${counts.sem})` },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Capacitações</h1>
      <p className="mt-1 text-sm text-navy-500">
        CIV, CIPP e cronotacógrafo da frota. As datas são lançadas na tela{" "}
        <Link href="/vehicles/frota" className="font-medium underline">
          Veículos
        </Link>
        . Cavalo mecânico: CIV e cronotacógrafo. Truck e bitruck: CIV, CIPP e cronotacógrafo. Semi-reboque: CIV e CIPP.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cap-tipo" className="mb-1 block text-xs font-medium text-navy-600">
            Tipo do veículo
          </label>
          <select id="cap-tipo" value={kind} onChange={(e) => setKind(e.target.value)} className={selectCls}>
            <option value="">Todos os tipos</option>
            {FLEET_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.plural}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cap-cert" className="mb-1 block text-xs font-medium text-navy-600">
            Capacitação
          </label>
          <select id="cap-cert" value={cert} onChange={(e) => setCert(e.target.value as "" | CertKey)} className={selectCls}>
            <option value="">Todas</option>
            <option value="civ">Só CIV</option>
            <option value="cipp">Só CIPP</option>
            <option value="crono">Só cronotacógrafo</option>
          </select>
        </div>
        <div>
          <label htmlFor="cap-placa" className="mb-1 block text-xs font-medium text-navy-600">
            Placa
          </label>
          <input
            id="cap-placa"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar placa..."
            className={`${selectCls} uppercase`}
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar ({error}).
        </div>
      )}

      {rows === null ? (
        <p className="mt-6 text-sm text-navy-500">Carregando...</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-navy-200 bg-white px-4 py-3 shadow-sm" title={k.hint}>
                <div className="text-xs text-navy-500">{k.label}</div>
                <div className={`mt-1 text-2xl font-semibold tabular-nums ${k.tone}`}>{k.value}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
              <h2 className="border-b border-navy-200 px-5 py-3 text-sm font-medium text-navy-900">
                Vencimentos por mês
              </h2>
              <div className="flex h-56 items-end gap-2 px-5 pb-3 pt-6">
                {months.map((m) => {
                  const total = m.civ + m.cipp + m.crono;
                  return (
                    <div key={m.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-xs tabular-nums text-navy-700">{total || ""}</span>
                      <div
                        className="flex w-full max-w-14 flex-col-reverse overflow-hidden rounded-t"
                        style={{ height: total ? `${(total / monthMax) * 100}%` : "2px", opacity: total ? 1 : 0.3 }}
                        role="img"
                        aria-label={`${m.label}: ${m.civ} CIV, ${m.cipp} CIPP e ${m.crono} cronotacógrafo`}
                        title={`${m.label}: ${m.civ} CIV · ${m.cipp} CIPP · ${m.crono} cronotacógrafo`}
                      >
                        <div className={m.tone === "red" ? "bg-red-600" : "bg-brand-600"} style={{ flex: m.civ }} />
                        <div className={m.tone === "red" ? "bg-red-300" : "bg-brand-300"} style={{ flex: m.cipp }} />
                        <div className={m.tone === "red" ? "bg-red-400" : "bg-sky-500"} style={{ flex: m.crono }} />
                      </div>
                      <span className={`text-xs ${m.tone === "red" ? "font-medium text-red-700" : "text-navy-500"}`}>{m.label}</span>
                    </div>
                  );
                })}
              </div>
              <p className="border-t border-navy-100 px-5 py-2 text-xs text-navy-500">
                Verde escuro = CIV, verde claro = CIPP, azul = cronotacógrafo. “Vencidas” soma tudo o que já passou da data.
              </p>
            </section>

            <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
              <h2 className="border-b border-navy-200 px-5 py-3 text-sm font-medium text-navy-900">
                Situação por tipo de veículo
              </h2>
              <div className="space-y-4 px-5 py-4">
                {byKind.length === 0 && <p className="text-sm text-navy-500">Nada para mostrar com esses filtros.</p>}
                {byKind.map((k) => {
                  const seg = [
                    { n: k.vencida, cls: "bg-red-500", name: k.vencida === 1 ? "vencida" : "vencidas" },
                    { n: k.vencendo, cls: "bg-amber-400", name: "vencendo" },
                    { n: k.ok, cls: "bg-teal-500", name: "em dia" },
                    { n: k.sem, cls: "bg-navy-200", name: "sem data" },
                  ];
                  return (
                    <div key={k.kind.value}>
                      <div className="flex items-baseline justify-between text-sm">
                        <span className="font-medium text-navy-900">{k.kind.plural}</span>
                        <span className="text-xs text-navy-500">{k.total} {k.total === 1 ? "capacitação" : "capacitações"}</span>
                      </div>
                      <div className="mt-1 flex h-4 overflow-hidden rounded-full bg-navy-100" role="img" aria-label={seg.map((s) => `${s.n} ${s.name}`).join(", ")}>
                        {seg.map((s) => (
                          <div key={s.name} className={s.cls} style={{ width: `${(s.n / k.total) * 100}%` }} title={`${s.n} ${s.name}`} />
                        ))}
                      </div>
                      <div className="mt-1 text-xs text-navy-500">{seg.map((s) => `${s.n} ${s.name}`).join(" · ")}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <section className="mt-6 rounded-xl border border-navy-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-200 px-5 py-3">
              <h2 className="text-sm font-medium text-navy-900">Vencimentos · do mais urgente ao mais distante</h2>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
                {filters.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={filter === f.value}
                    onClick={() => setFilter(f.value)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      filter === f.value
                        ? "border-transparent bg-brand-200 text-brand-900 ring-1 ring-brand-600"
                        : "border-navy-300 text-navy-700 hover:bg-navy-50"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            {list.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-navy-500">Nenhuma capacitação nesta situação.</p>
            ) : (
              <div className="max-h-[36rem] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-navy-50 text-xs uppercase text-navy-500">
                    <tr>
                      <th className="px-5 py-2 font-medium">Placa</th>
                      <th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 font-medium">Capacitação</th>
                      <th className="px-3 py-2 font-medium">Vencimento</th>
                      <th className="px-5 py-2 font-medium">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {list.map((i) => (
                      <tr key={`${i.plate}-${i.cert}`}>
                        <td className="px-5 py-2 font-medium tracking-wide text-navy-900">{i.plate}</td>
                        <td className="px-3 py-2 text-navy-600">{i.kindLabel}</td>
                        <td className="px-3 py-2 text-navy-800">
                          {i.label}
                          {i.stage && <span className="ml-1.5 rounded bg-navy-100 px-1.5 py-0.5 text-[11px] text-navy-600">{i.stage === "preliminar" ? "Preliminar" : "Definitivo"}</span>}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-navy-800">{i.due ? fmtDate(i.due) : "—"}</td>
                        <td className="px-5 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL_BADGE[i.level]}`}>{situation(i)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
