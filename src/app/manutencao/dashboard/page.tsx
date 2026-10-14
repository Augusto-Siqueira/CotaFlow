"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { buttonClasses } from "@/components/Button";
import { DataTable, type Column } from "@/components/DataTable";
import {
  ORDER_COLUMNS,
  SERVICE_TYPES,
  formatDateTime,
  formatDuration,
  formatMoney,
  serviceTypeBadge,
  serviceTypeLabel,
  type MaintenanceOrder,
} from "@/lib/maintenance";

const PAGE = 1000;

function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fromIso(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(v: string, n: number): string {
  const d = fromIso(v);
  d.setDate(d.getDate() + n);
  return toIso(d);
}
function mondayOf(v: string): string {
  return addDays(v, -((fromIso(v).getDay() + 6) % 7));
}
function br(v: string): string {
  return v.split("-").reverse().join("/");
}

// Período = entradas entre 00:00 do dia inicial e 23:59 do dia final (hora local).
async function fetchRange(
  from: string,
  to: string
): Promise<{ rows: MaintenanceOrder[]; error: string | null }> {
  const start = fromIso(from).toISOString();
  const end = fromIso(addDays(to, 1)).toISOString();
  const rows: MaintenanceOrder[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("maintenance_orders")
      .select(ORDER_COLUMNS)
      .gte("entry_at", start)
      .lt("entry_at", end)
      .order("entry_at", { ascending: false })
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { rows: [], error: error.message };
    rows.push(...((data as unknown as MaintenanceOrder[] | null) ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

const fieldCls =
  "rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm font-medium text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

type View = "placas" | "oficinas";
type OfficeSort = "count" | "avg";

export default function ManutencaoDashboardPage() {
  const today = toIso(new Date());
  const [now] = useState(() => Date.now());
  const [from, setFrom] = useState(() => `${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [plate, setPlate] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [type, setType] = useState("");
  const [view, setView] = useState<View>("placas");
  const [officeSort, setOfficeSort] = useState<OfficeSort>("count");
  const [data, setData] = useState<{
    key: string;
    rows: MaintenanceOrder[];
    error: string | null;
  } | null>(null);
  const [openNow, setOpenNow] = useState<number | null>(null);
  const latestKey = useRef("");

  const key = `${from}|${to}`;
  const invalidRange = from > to;

  useEffect(() => {
    if (invalidRange) return;
    latestKey.current = key;
    fetchRange(from, to).then((res) => {
      if (latestKey.current !== key) return;
      setData({ key, rows: res.rows, error: res.error });
    });
  }, [from, to, key, invalidRange]);

  // "Em manutenção agora" não depende do período escolhido.
  useEffect(() => {
    supabase
      .from("maintenance_orders")
      .select("id", { count: "exact", head: true })
      .is("exit_at", null)
      .then(({ count }) => setOpenNow(count ?? 0));
  }, []);

  const loading = !invalidRange && (data === null || data.key !== key);
  const periodRows = useMemo(
    () => (loading || invalidRange ? [] : data?.rows ?? []),
    [loading, invalidRange, data]
  );

  const plateOptions = useMemo(
    () => Array.from(new Set(periodRows.map((r) => r.plate))).sort(),
    [periodRows]
  );
  const workshopOptions = useMemo(
    () =>
      Array.from(
        new Set(periodRows.map((r) => r.maintenance_workshops?.name ?? "—"))
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [periodRows]
  );
  const activePlate = plateOptions.includes(plate) ? plate : "";
  const activeWorkshop = workshopOptions.includes(workshop) ? workshop : "";

  const duration = (r: MaintenanceOrder) =>
    (r.exit_at ? new Date(r.exit_at).getTime() : now) -
    new Date(r.entry_at).getTime();
  const workshopName = (r: MaintenanceOrder) => r.maintenance_workshops?.name ?? "—";

  const rows = useMemo(
    () =>
      periodRows.filter(
        (r) =>
          (!activePlate || r.plate === activePlate) &&
          (!activeWorkshop || workshopName(r) === activeWorkshop) &&
          (!type || r.service_type === type)
      ),
    [periodRows, activePlate, activeWorkshop, type]
  );

  const totals = useMemo(() => {
    let stopped = 0;
    let cost = 0;
    let withCost = 0;
    const byType = new Map<string, { count: number; ms: number }>();
    for (const r of rows) {
      const ms = duration(r);
      stopped += ms;
      if (r.cost !== null) {
        cost += Number(r.cost);
        withCost++;
      }
      const t = byType.get(r.service_type) ?? { count: 0, ms: 0 };
      t.count++;
      t.ms += ms;
      byType.set(r.service_type, t);
    }
    return { stopped, cost, withCost, byType };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, now]);

  // Ranking de placas: usa o período todo (sem o filtro de placa) para
  // continuar útil depois de escolher uma.
  const plateRanking = useMemo(() => {
    const map = new Map<string, { count: number; ms: number }>();
    for (const r of periodRows) {
      if ((activeWorkshop && workshopName(r) !== activeWorkshop) || (type && r.service_type !== type)) continue;
      const c = map.get(r.plate) ?? { count: 0, ms: 0 };
      c.count++;
      c.ms += duration(r);
      map.set(r.plate, c);
    }
    return Array.from(map, ([name, v]) => ({ name, ...v })).sort(
      (a, b) => b.ms - a.ms || b.count - a.count
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodRows, activeWorkshop, type, now]);

  const officeRanking = useMemo(() => {
    const map = new Map<string, { count: number; closed: number; closedMs: number }>();
    for (const r of periodRows) {
      if ((activePlate && r.plate !== activePlate) || (type && r.service_type !== type)) continue;
      const name = workshopName(r);
      const c = map.get(name) ?? { count: 0, closed: 0, closedMs: 0 };
      c.count++;
      if (r.exit_at) {
        c.closed++;
        c.closedMs += duration(r);
      }
      map.set(name, c);
    }
    const list = Array.from(map, ([name, v]) => ({
      name,
      count: v.count,
      closed: v.closed,
      avgMs: v.closed > 0 ? v.closedMs / v.closed : null,
    }));
    return list.sort((a, b) =>
      officeSort === "count"
        ? b.count - a.count
        : (a.avgMs ?? Infinity) - (b.avgMs ?? Infinity) || b.count - a.count
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodRows, activePlate, type, officeSort]);

  const plateMax = Math.max(1, ...plateRanking.map((p) => p.ms));
  const officeMax = Math.max(
    1,
    ...officeRanking.map((o) => (officeSort === "count" ? o.count : o.avgMs ?? 0))
  );

  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthEnd = addDays(monthStart, -1);
  const shortcuts = [
    { label: "Este mês", from: monthStart, to: today },
    { label: "Mês passado", from: `${prevMonthEnd.slice(0, 8)}01`, to: prevMonthEnd },
    { label: "Esta semana", from: mondayOf(today), to: addDays(mondayOf(today), 6) },
    { label: "Últimos 30 dias", from: addDays(today, -29), to: today },
    { label: "Últimos 90 dias", from: addDays(today, -89), to: today },
    { label: "Este ano", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];

  const columns: Column<MaintenanceOrder>[] = [
    {
      key: "plate",
      header: "Placa",
      mobile: "title",
      className: "font-semibold tracking-wide text-navy-900",
      cell: (r) => r.plate,
    },
    {
      key: "type",
      header: "Tipo",
      mobile: "badge",
      cell: (r) => (
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${serviceTypeBadge(r.service_type)}`}
        >
          {serviceTypeLabel(r.service_type)}
        </span>
      ),
    },
    { key: "workshop", header: "Oficina", mobile: "subtitle", cell: workshopName },
    { key: "service", header: "Serviço", mobile: "wideField", cell: (r) => r.service },
    { key: "entry", header: "Entrada", mobile: "field", cell: (r) => formatDateTime(r.entry_at) },
    {
      key: "exit",
      header: "Saída",
      mobile: "field",
      cell: (r) =>
        r.exit_at ? (
          formatDateTime(r.exit_at)
        ) : (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
            Em manutenção
          </span>
        ),
    },
    {
      key: "time",
      header: "Tempo parado",
      mobile: "field",
      className: "font-medium",
      cell: (r) => formatDuration(duration(r)),
    },
    {
      key: "km",
      header: "Km",
      mobile: "field",
      cell: (r) => (r.odometer_km !== null ? r.odometer_km.toLocaleString("pt-BR") : "—"),
    },
    {
      key: "cost",
      header: "Custo",
      mobile: "field",
      cell: (r) => (r.cost !== null ? formatMoney(Number(r.cost)) : "—"),
    },
    { key: "notes", header: "Observações", mobile: "wideField", cell: (r) => r.notes || "" },
  ];

  const tabCls = (active: boolean) =>
    `px-3 py-1.5 text-xs font-medium transition-colors ${
      active ? "bg-brand-100 text-brand-800" : "text-navy-600 hover:bg-navy-50"
    }`;

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
            Dashboard de manutenção
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Histórico, tempo parado por placa e desempenho das oficinas.
          </p>
        </div>
        <Link href="/manutencao" className={buttonClasses("secondary", "md")}>
          Lançamentos
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <label htmlFor="mdash-from" className="mb-1 block text-xs font-medium text-navy-600">
            De
          </label>
          <input
            id="mdash-from"
            type="date"
            value={from}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div>
          <label htmlFor="mdash-to" className="mb-1 block text-xs font-medium text-navy-600">
            Até
          </label>
          <input
            id="mdash-to"
            type="date"
            value={to}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div>
          <label htmlFor="mdash-plate" className="mb-1 block text-xs font-medium text-navy-600">
            Placa
          </label>
          <select
            id="mdash-plate"
            value={activePlate}
            onChange={(e) => setPlate(e.target.value)}
            className={`${fieldCls} min-w-36`}
          >
            <option value="">Todas</option>
            {plateOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mdash-shop" className="mb-1 block text-xs font-medium text-navy-600">
            Oficina
          </label>
          <select
            id="mdash-shop"
            value={activeWorkshop}
            onChange={(e) => setWorkshop(e.target.value)}
            className={`${fieldCls} min-w-44`}
          >
            <option value="">Todas</option>
            {workshopOptions.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mdash-type" className="mb-1 block text-xs font-medium text-navy-600">
            Tipo
          </label>
          <select
            id="mdash-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={fieldCls}
          >
            <option value="">Todos</option>
            {SERVICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {shortcuts.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => {
              setFrom(s.from);
              setTo(s.to);
            }}
            aria-pressed={from === s.from && to === s.to}
            className={`${buttonClasses("secondary", "compact")} ${
              from === s.from && to === s.to ? "!border-brand-500 !text-brand-700" : ""
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {invalidRange ? (
        <div className="mt-6 rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-red-600">
          A data inicial não pode ser depois da data final.
        </div>
      ) : data?.error ? (
        <div className="mt-6 rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-red-600">
          Erro ao carregar: {data.error}
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-navy-500">
            Entradas de {from === to ? br(from) : `${br(from)} a ${br(to)}`}
            {loading && " · carregando..."}
          </p>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-navy-200 bg-white px-4 py-3">
              <div className="text-xs font-medium uppercase text-navy-500">Manutenções</div>
              <div className="mt-1 text-2xl font-semibold text-navy-900">{rows.length}</div>
              <div className="mt-0.5 text-xs text-navy-500">
                {SERVICE_TYPES.map(
                  (t) => `${totals.byType.get(t.value)?.count ?? 0} ${t.label.toLowerCase()}`
                ).join(" · ")}
              </div>
            </div>
            <div className="rounded-xl border border-navy-200 bg-white px-4 py-3">
              <div className="text-xs font-medium uppercase text-navy-500">Tempo parado</div>
              <div className="mt-1 text-2xl font-semibold text-navy-900">
                {formatDuration(totals.stopped)}
              </div>
              <div className="mt-0.5 text-xs text-navy-500">
                {rows.length > 0
                  ? `média de ${formatDuration(totals.stopped / rows.length)} por entrada`
                  : "sem entradas"}
              </div>
            </div>
            <div
              className={`rounded-xl border px-4 py-3 ${
                (openNow ?? 0) > 0
                  ? "border-red-300 bg-red-50 text-red-800"
                  : "border-navy-200 bg-white text-navy-900"
              }`}
            >
              <div className="text-xs font-medium uppercase">Em manutenção agora</div>
              <div className="mt-1 text-2xl font-semibold">{openNow ?? "—"}</div>
              <div className="mt-0.5 text-xs">
                <Link href="/manutencao" className="underline">
                  ver placas
                </Link>
              </div>
            </div>
            <div className="rounded-xl border border-navy-200 bg-white px-4 py-3">
              <div className="text-xs font-medium uppercase text-navy-500">Custo</div>
              <div className="mt-1 text-2xl font-semibold text-navy-900">
                {totals.withCost > 0 ? formatMoney(totals.cost) : "—"}
              </div>
              <div className="mt-0.5 text-xs text-navy-500">
                {totals.withCost > 0
                  ? `${totals.withCost} de ${rows.length} com custo informado`
                  : "nenhum custo informado"}
              </div>
            </div>
          </div>

          <section className="mt-6 rounded-xl border border-navy-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label="Tipo de ranking"
                className="inline-flex overflow-hidden rounded-lg border border-navy-300"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "placas"}
                  onClick={() => setView("placas")}
                  className={tabCls(view === "placas")}
                >
                  Tempo parado por placa
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "oficinas"}
                  onClick={() => setView("oficinas")}
                  className={tabCls(view === "oficinas")}
                >
                  Ranking de oficinas
                </button>
              </div>
              {view === "oficinas" && (
                <div className="flex items-center gap-2 text-xs text-navy-500">
                  Ordenar por
                  <div className="inline-flex overflow-hidden rounded-lg border border-navy-300">
                    <button
                      type="button"
                      aria-pressed={officeSort === "count"}
                      onClick={() => setOfficeSort("count")}
                      className={tabCls(officeSort === "count")}
                    >
                      Nº de serviços
                    </button>
                    <button
                      type="button"
                      aria-pressed={officeSort === "avg"}
                      onClick={() => setOfficeSort("avg")}
                      className={tabCls(officeSort === "avg")}
                    >
                      Mais rápidas
                    </button>
                  </div>
                </div>
              )}
            </div>

            {view === "placas" ? (
              plateRanking.length === 0 ? (
                <p className="py-8 text-center text-sm text-navy-500">
                  {loading ? "Carregando..." : "Nenhuma manutenção no período."}
                </p>
              ) : (
                <ol className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1">
                  {plateRanking.map((p, i) => {
                    const selected = activePlate === p.name;
                    return (
                      <li key={p.name}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setPlate(selected ? "" : p.name)}
                          title={selected ? "Mostrar todas as placas" : `Filtrar pela placa ${p.name}`}
                          className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-navy-50 ${
                            selected ? "bg-brand-50 ring-1 ring-brand-300" : ""
                          } ${activePlate && !selected ? "opacity-60" : ""}`}
                        >
                          <span className="w-6 shrink-0 text-right text-xs text-navy-500">{i + 1}º</span>
                          <span className="w-24 shrink-0 font-semibold tracking-wide text-navy-900">
                            {p.name}
                          </span>
                          <span className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-navy-100">
                            <span
                              className="block h-full rounded bg-amber-400"
                              style={{ width: `${Math.max((p.ms / plateMax) * 100, 2)}%` }}
                            />
                          </span>
                          <span className="w-40 shrink-0 text-right text-xs text-navy-700">
                            {formatDuration(p.ms)} · {p.count} {p.count === 1 ? "entrada" : "entradas"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )
            ) : officeRanking.length === 0 ? (
              <p className="py-8 text-center text-sm text-navy-500">
                {loading ? "Carregando..." : "Nenhuma manutenção no período."}
              </p>
            ) : (
              <ol className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1">
                {officeRanking.map((o, i) => {
                  const selected = activeWorkshop === o.name;
                  const value = officeSort === "count" ? o.count : o.avgMs ?? 0;
                  return (
                    <li key={o.name}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setWorkshop(selected ? "" : o.name)}
                        title={selected ? "Mostrar todas as oficinas" : `Filtrar por ${o.name}`}
                        className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-navy-50 ${
                          selected ? "bg-brand-50 ring-1 ring-brand-300" : ""
                        } ${activeWorkshop && !selected ? "opacity-60" : ""}`}
                      >
                        <span className="w-6 shrink-0 text-right text-xs text-navy-500">{i + 1}º</span>
                        <span className="w-40 shrink-0 truncate font-medium text-navy-900 sm:w-56">
                          {o.name}
                        </span>
                        <span className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-navy-100">
                          <span
                            className="block h-full rounded bg-brand-400"
                            style={{ width: `${Math.max((value / officeMax) * 100, 2)}%` }}
                          />
                        </span>
                        <span className="w-44 shrink-0 text-right text-xs text-navy-700">
                          {o.count} {o.count === 1 ? "serviço" : "serviços"} ·{" "}
                          {o.avgMs !== null ? `média ${formatDuration(o.avgMs)}` : "sem saída"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {view === "oficinas" && (
              <p className="mt-3 text-xs text-navy-500">
                A média considera só as manutenções que já tiveram saída.
              </p>
            )}
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-sm font-medium text-navy-900">
              Histórico <span className="font-normal text-navy-500">({rows.length})</span>
            </h2>
            {rows.length === 0 ? (
              <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
                {loading ? "Carregando..." : "Nenhuma manutenção encontrada."}
              </div>
            ) : (
              <div className="rounded-xl border border-navy-200 bg-white">
                <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
