"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { FLEET_KINDS } from "@/lib/fleet";
import {
  formatAverage,
  formatKm,
  formatLiters,
  formatMoney,
  fuelIntervals,
  type FuelEntry,
} from "@/lib/fuel";

// Dashboard do abastecimento. A média é sempre a do DIESEL pelo método do
// tanque cheio (soma dos km entre tanques cheios ÷ soma dos litros desses
// intervalos). Cada intervalo conta para a placa e para o motorista do
// abastecimento que COMPLETOU o tanque. O filtro por tipo existe porque a média
// de um truck ou bitruck não se compara à de um cavalo mecânico.

const MONTHS_BACK = 8; // histórico buscado (o período escolhido e a evolução saem dele)
const EVOLUTION_MONTHS = 6;
const TYPES = FLEET_KINDS.filter((k) => k.value !== "semirreboque");

const selectCls =
  "rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

type Preset = "mes" | "mes_anterior" | "3meses" | "personalizado";

function presetRange(p: Exclude<Preset, "personalizado">): { from: string; to: string } {
  const now = new Date();
  if (p === "mes") return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
  if (p === "mes_anterior") {
    return {
      from: isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: isoDay(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  return { from: isoDay(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: isoDay(now) };
}

interface Agg {
  key: string;
  label: string;
  sub: string;
  km: number;
  liters: number;
  stops: number;
  avg: number | null;
}

// Histórico completo, em páginas (o servidor devolve no máximo 1.000 linhas).
async function fetchHistory(): Promise<FuelEntry[]> {
  const from = new Date();
  from.setMonth(from.getMonth() - MONTHS_BACK);
  from.setDate(1);
  from.setHours(0, 0, 0, 0);
  const all: FuelEntry[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("fuel_entries")
      .select("*")
      .gte("fueled_at", from.toISOString())
      .order("fueled_at")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    all.push(...((data as FuelEntry[]) ?? []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

function kindLabel(kind: string | undefined): string {
  return FLEET_KINDS.find((k) => k.value === kind)?.label ?? "Tipo não informado";
}

function pct(value: number, base: number): number {
  return ((value - base) / base) * 100;
}

function Bars({ rows, base, unit }: { rows: Agg[]; base: number | null; unit: string }) {
  const max = Math.max(...rows.map((r) => r.avg ?? 0), 0.01);
  return (
    <ol className="divide-y divide-navy-100">
      {rows.map((r, i) => {
        const vs = r.avg !== null && base ? pct(r.avg, base) : null;
        return (
          <li key={r.key} className="grid grid-cols-[1.75rem_minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5 text-sm">
            <span className="text-xs tabular-nums text-navy-500">{r.avg === null ? "" : i + 1}º</span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-navy-900" title={r.label}>
                {r.label}
              </span>
              <span className="block truncate text-xs text-navy-500">{r.sub}</span>
            </span>
            <span
              className="relative h-3 overflow-hidden rounded-full bg-navy-100"
              role="img"
              aria-label={r.avg === null ? "sem média" : `${r.label}: ${formatAverage(r.avg)}`}
              title={
                r.avg === null
                  ? "Sem média no período"
                  : `${formatAverage(r.avg)} · ${formatKm(r.km)} km em ${formatLiters(r.liters)} L (${r.stops} tanque(s) cheio(s))`
              }
            >
              {r.avg !== null && (
                <span className="absolute inset-y-0 left-0 rounded-full bg-brand-600" style={{ width: `${(r.avg / max) * 100}%` }} />
              )}
            </span>
            <span className="w-40 text-right tabular-nums">
              {r.avg === null ? (
                <span className="text-xs text-navy-500">sem tanque cheio</span>
              ) : (
                <>
                  <span className="font-semibold text-navy-900">{formatAverage(r.avg)}</span>
                  {vs !== null && Math.abs(vs) >= 0.5 && (
                    <span className="ml-2 text-xs text-navy-500" title={`Comparado à média do grupo (${base ? formatAverage(base) : ""})`}>
                      {vs > 0 ? "▲" : "▼"} {Math.abs(vs).toFixed(0)}%
                    </span>
                  )}
                </>
              )}
            </span>
            <span className="sr-only">{unit}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function AbastecimentoDashboardPage() {
  const { role, loading: authLoading } = useAuth();
  const allowed = role === "admin" || role === "abastecimento";

  const [history, setHistory] = useState<FuelEntry[] | null>(null);
  const [kinds, setKinds] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [preset, setPreset] = useState<Preset>("mes");
  const [range, setRange] = useState(() => presetRange("mes"));
  const [typeFilter, setTypeFilter] = useState("");

  useEffect(() => {
    if (!allowed) return;
    let cancel = false;
    Promise.all([
      fetchHistory(),
      supabase.from("fleet_units").select("plate, kind"),
    ])
      .then(([entries, fleet]) => {
        if (cancel) return;
        setKinds(new Map(((fleet.data ?? []) as { plate: string; kind: string }[]).map((f) => [f.plate, f.kind])));
        setHistory(entries);
      })
      .catch((e) => {
        if (!cancel) {
          setError(e instanceof Error ? e.message : "erro");
          setHistory([]);
        }
      });
    return () => {
      cancel = true;
    };
  }, [allowed]);

  function choosePreset(p: Preset) {
    setPreset(p);
    if (p !== "personalizado") setRange(presetRange(p));
  }

  // Só diesel entra na média; o filtro por tipo vale já aqui.
  const diesel = useMemo(
    () => (history ?? []).filter((e) => e.fuel_type === "diesel" && (!typeFilter || kinds.get(e.plate) === typeFilter)),
    [history, kinds, typeFilter]
  );
  const intervals = useMemo(() => fuelIntervals(diesel), [diesel]);

  const fromMs = new Date(`${range.from}T00:00:00`).getTime();
  const toMs = new Date(`${range.to}T23:59:59`).getTime();
  const inRange = useCallback(
    (e: FuelEntry) => {
      const t = new Date(e.fueled_at).getTime();
      return t >= fromMs && t <= toMs;
    },
    [fromMs, toMs]
  );

  const periodDiesel = useMemo(() => diesel.filter(inRange), [diesel, inRange]);

  // Agrupa os intervalos que FECHAM dentro do período.
  const { trucks, drivers, total } = useMemo(() => {
    const t = new Map<string, Agg>();
    const d = new Map<string, Agg>();
    let km = 0;
    let liters = 0;
    for (const e of periodDiesel) {
      const iv = intervals.get(e.id);
      const plateAgg =
        t.get(e.plate) ??
        ({ key: e.plate, label: e.plate, sub: kindLabel(kinds.get(e.plate)), km: 0, liters: 0, stops: 0, avg: null } as Agg);
      const name = e.driver_name ?? "Sem nome";
      const drvAgg =
        d.get(name) ?? ({ key: name, label: name, sub: "", km: 0, liters: 0, stops: 0, avg: null } as Agg);
      if (iv) {
        for (const a of [plateAgg, drvAgg]) {
          a.km += iv.km;
          a.liters += iv.liters;
          a.stops += 1;
        }
        km += iv.km;
        liters += iv.liters;
      }
      t.set(e.plate, plateAgg);
      d.set(name, drvAgg);
    }
    const finish = (m: Map<string, Agg>) =>
      [...m.values()]
        .map((a) => ({ ...a, avg: a.stops > 0 ? a.km / a.liters : null }))
        .sort((x, y) => (y.avg ?? -1) - (x.avg ?? -1) || x.label.localeCompare(y.label, "pt-BR"));
    const drv = finish(d).map((a) => {
      // Tipos de caminhão que o motorista usou no período (contexto do ranking).
      const kindsUsed = [
        ...new Set(periodDiesel.filter((e) => (e.driver_name ?? "Sem nome") === a.key).map((e) => kindLabel(kinds.get(e.plate)))),
      ];
      return { ...a, sub: kindsUsed.join(", ") };
    });
    return { trucks: finish(t), drivers: drv, total: { km, liters } };
  }, [periodDiesel, intervals, kinds]);

  const groupAvg = total.liters > 0 ? total.km / total.liters : null;

  // Média por tipo de veículo no período (sempre os três, ignorando o filtro de tipo).
  const byType = useMemo(() => {
    const all = (history ?? []).filter((e) => e.fuel_type === "diesel");
    return TYPES.map((k) => {
      const list = all.filter((e) => kinds.get(e.plate) === k.value);
      const iv = fuelIntervals(list);
      let km = 0;
      let liters = 0;
      for (const e of list.filter(inRange)) {
        const x = iv.get(e.id);
        if (x) {
          km += x.km;
          liters += x.liters;
        }
      }
      return { kind: k, km, liters, avg: liters > 0 ? km / liters : null };
    });
  }, [history, kinds, inRange]);

  // Evolução mensal da média (últimos meses), com o filtro de tipo aplicado.
  const evolution = useMemo(() => {
    const now = new Date();
    const out: { label: string; avg: number | null }[] = [];
    for (let i = EVOLUTION_MONTHS - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      let km = 0;
      let liters = 0;
      for (const e of diesel) {
        const t = new Date(e.fueled_at);
        if (t < start || t >= end) continue;
        const x = intervals.get(e.id);
        if (x) {
          km += x.km;
          liters += x.liters;
        }
      }
      out.push({
        label: start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        avg: liters > 0 ? km / liters : null,
      });
    }
    return out;
  }, [diesel, intervals]);

  const spent = useMemo(
    () => periodDiesel.reduce((s, e) => s + (e.price_per_liter ? Number(e.price_per_liter) * Number(e.liters) : 0), 0),
    [periodDiesel]
  );
  const dieselLiters = periodDiesel.reduce((s, e) => s + Number(e.liters), 0);
  const arlaLiters = useMemo(
    () =>
      (history ?? [])
        .filter((e) => e.fuel_type === "arla" && inRange(e) && (!typeFilter || kinds.get(e.plate) === typeFilter))
        .reduce((s, e) => s + Number(e.liters), 0),
    [history, kinds, typeFilter, inRange]
  );

  if (authLoading) return null;
  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-navy-900">Acesso restrito</h1>
        <p className="mt-2 text-sm text-navy-500">Esta tela é do perfil Abastecimento.</p>
      </div>
    );
  }

  const evMax = Math.max(...evolution.map((m) => m.avg ?? 0), 0.01);
  const noData = history !== null && periodDiesel.length === 0;
  const typeTitle = typeFilter ? FLEET_KINDS.find((k) => k.value === typeFilter)?.plural : "todos os tipos";

  const kpis: { label: string; value: string; hint?: string }[] = [
    { label: "Média do grupo", value: groupAvg ? formatAverage(groupAvg) : "—", hint: `Diesel · ${typeTitle}` },
    { label: "Km rodados (tanque cheio)", value: formatKm(total.km), hint: "Soma dos intervalos entre tanques cheios" },
    { label: "Diesel abastecido", value: `${formatLiters(dieselLiters)} L` },
    { label: "ARLA abastecido", value: `${formatLiters(arlaLiters)} L` },
    { label: "Gasto fora do pátio", value: spent > 0 ? formatMoney(spent) : "—", hint: "Só abastecimentos com preço informado" },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Dashboard do abastecimento</h1>
      <p className="mt-1 text-sm text-navy-500">
        Médias de diesel (km/l) pelo método do tanque cheio. Compare dentro do mesmo tipo de veículo.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="db-periodo" className="mb-1 block text-xs font-medium text-navy-600">
            Período
          </label>
          <select id="db-periodo" value={preset} onChange={(e) => choosePreset(e.target.value as Preset)} className={selectCls}>
            <option value="mes">Este mês</option>
            <option value="mes_anterior">Mês anterior</option>
            <option value="3meses">Últimos 3 meses</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>
        {preset === "personalizado" && (
          <>
            <div>
              <label htmlFor="db-de" className="mb-1 block text-xs font-medium text-navy-600">
                De
              </label>
              <input id="db-de" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} className={selectCls} />
            </div>
            <div>
              <label htmlFor="db-ate" className="mb-1 block text-xs font-medium text-navy-600">
                Até
              </label>
              <input id="db-ate" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} className={selectCls} />
            </div>
          </>
        )}
        <div>
          <label htmlFor="db-tipo" className="mb-1 block text-xs font-medium text-navy-600">
            Tipo do veículo
          </label>
          <select id="db-tipo" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls}>
            <option value="">Todos os tipos</option>
            {TYPES.map((k) => (
              <option key={k.value} value={k.value}>
                {k.plural}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar ({error}).
        </div>
      )}

      {history === null ? (
        <p className="mt-6 text-sm text-navy-500">Carregando...</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-navy-200 bg-white px-4 py-3 shadow-sm" title={k.hint}>
                <div className="text-xs text-navy-500">{k.label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums text-navy-900">{k.value}</div>
              </div>
            ))}
          </div>

          {noData && (
            <div className="mt-6 rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
              Nenhum abastecimento de diesel neste período{typeFilter ? " para esse tipo de veículo" : ""}.
            </div>
          )}

          {!noData && (
            <>
              <section className="mt-6 rounded-xl border border-navy-200 bg-white shadow-sm">
                <h2 className="border-b border-navy-200 px-5 py-3 text-sm font-medium text-navy-900">
                  Média por tipo de veículo no período
                </h2>
                <div className="grid gap-px bg-navy-100 sm:grid-cols-3">
                  {byType.map((t) => (
                    <div key={t.kind.value} className="bg-white px-5 py-3">
                      <div className="text-xs text-navy-500">{t.kind.plural}</div>
                      <div className="mt-0.5 text-lg font-semibold tabular-nums text-navy-900">
                        {t.avg ? formatAverage(t.avg) : "—"}
                      </div>
                      <div className="text-xs text-navy-500">
                        {t.liters > 0 ? `${formatKm(t.km)} km em ${formatLiters(t.liters)} L` : "sem tanque cheio no período"}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <div className="mt-6 grid gap-6 xl:grid-cols-2">
                <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
                  <h2 className="border-b border-navy-200 px-5 py-3 text-sm font-medium text-navy-900">
                    Ranking de caminhões · melhor média (km/l)
                  </h2>
                  <div className="max-h-[32rem] overflow-y-auto">
                    <Bars rows={trucks} base={groupAvg} unit="km/l" />
                  </div>
                </section>
                <section className="rounded-xl border border-navy-200 bg-white shadow-sm">
                  <h2 className="border-b border-navy-200 px-5 py-3 text-sm font-medium text-navy-900">
                    Ranking de motoristas · melhor média (km/l)
                  </h2>
                  <div className="max-h-[32rem] overflow-y-auto">
                    <Bars rows={drivers} base={groupAvg} unit="km/l" />
                  </div>
                </section>
              </div>

              <section className="mt-6 rounded-xl border border-navy-200 bg-white shadow-sm">
                <h2 className="border-b border-navy-200 px-5 py-3 text-sm font-medium text-navy-900">
                  Média mensal da frota · {typeTitle} · últimos {EVOLUTION_MONTHS} meses
                </h2>
                <div className="flex h-48 items-end gap-3 px-5 pb-3 pt-6">
                  {evolution.map((m) => (
                    <div key={m.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-xs tabular-nums text-navy-700">{m.avg ? m.avg.toFixed(2).replace(".", ",") : "—"}</span>
                      <div
                        className="w-full max-w-14 rounded-t bg-brand-600"
                        style={{ height: m.avg ? `${(m.avg / evMax) * 100}%` : "2px", opacity: m.avg ? 1 : 0.3 }}
                        role="img"
                        aria-label={`${m.label}: ${m.avg ? formatAverage(m.avg) : "sem média"}`}
                        title={m.avg ? formatAverage(m.avg) : "Sem tanque cheio no mês"}
                      />
                      <span className="text-xs text-navy-500">{m.label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <p className="mt-4 text-xs text-navy-500">
                Como a média é calculada: km rodados entre dois tanques cheios ÷ litros colocados nesse intervalo. Cada
                intervalo conta para o caminhão e para o motorista do abastecimento que completou o tanque. Quem não tem
                tanque cheio no período fica sem média. As setas comparam com a média do grupo filtrado.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
