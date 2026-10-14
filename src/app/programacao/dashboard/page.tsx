"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  LOADING_STATUSES,
  loadingStatusBadge,
  loadingStatusLabel,
} from "@/lib/loadingStatus";
import { formatTons, parseTons } from "@/lib/weight";
import { buttonClasses } from "@/components/Button";
import { DataTable, type Column } from "@/components/DataTable";
import { DestinationsCell } from "@/components/Destinations";

interface Load {
  id: string;
  schedule_date: string;
  client_name: string;
  cargo: string;
  origin: string | null;
  destination: string | null;
  weight: string | null;
  plate: string | null;
  trailer_plate: string | null;
  driver: string | null;
  loading_time: string | null;
  status: string;
}

const COLUMNS =
  "id, schedule_date, client_name, cargo, origin, destination, weight, plate, trailer_plate, driver, loading_time, status";
const PAGE = 1000;
const LATE = "atrasadas";
const NOT_DEPARTED = new Set(["programado", "lavando", "carregando"]);

// ---------- datas (sempre no calendário local, como "YYYY-MM-DD") ----------

function toIso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
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
  const d = fromIso(v);
  return addDays(v, -((d.getDay() + 6) % 7));
}
function br(v: string): string {
  const [y, m, d] = v.split("-");
  return `${d}/${m}/${y}`;
}
function brShort(v: string): string {
  const [, m, d] = v.split("-");
  return `${d}/${m}`;
}

// Traz o período inteiro: o Supabase devolve no máximo 1000 linhas por consulta.
async function fetchRange(
  from: string,
  to: string
): Promise<{ rows: Load[]; error: string | null }> {
  const rows: Load[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("loading_schedules")
      .select(COLUMNS)
      .gte("schedule_date", from)
      .lte("schedule_date", to)
      .order("schedule_date", { ascending: false })
      .order("loading_time", { ascending: true, nullsFirst: false })
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { rows: [], error: error.message };
    rows.push(...((data as Load[] | null) ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows, error: null };
}

const dateInputCls =
  "rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm font-medium text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function DashboardPage() {
  const today = toIso(new Date());
  const [from, setFrom] = useState(() => `${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [client, setClient] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  // Gráfico do painel: cargas por dia ou ranking de clientes.
  const [chartView, setChartView] = useState<"dia" | "ranking">("dia");
  const [rankBy, setRankBy] = useState<"count" | "tons">("count");
  const [data, setData] = useState<{
    key: string;
    rows: Load[];
    error: string | null;
  } | null>(null);
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

  const loading = !invalidRange && (data === null || data.key !== key);
  const periodRows = useMemo(
    () => (loading || invalidRange ? [] : data?.rows ?? []),
    [loading, invalidRange, data]
  );

  const clientOptions = useMemo(
    () =>
      Array.from(
        new Set(periodRows.map((r) => r.client_name.trim() || "Sem cliente"))
      ).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [periodRows]
  );
  // Se o cliente escolhido não tem cargas no período novo, volta para "todos".
  const activeClient = clientOptions.includes(client) ? client : "";

  const rows = useMemo(
    () =>
      activeClient
        ? periodRows.filter(
            (r) => (r.client_name.trim() || "Sem cliente") === activeClient
          )
        : periodRows,
    [periodRows, activeClient]
  );

  // Atrasada = dia já passou e a carga ainda não saiu (Programado, Lavando ou
  // Carregando). Em viagem ou entregue não é atraso.
  const isLate = (r: Load) =>
    r.schedule_date < today && NOT_DEPARTED.has(r.status);

  const stats = useMemo(() => {
    let tons = 0;
    let noWeight = 0;
    const byStatus = new Map<string, { count: number; tons: number }>();
    let late = { count: 0, tons: 0 };
    for (const r of rows) {
      const t = parseTons(r.weight);
      if (t === null) noWeight++;
      else tons += t;
      const s = byStatus.get(r.status) ?? { count: 0, tons: 0 };
      s.count++;
      s.tons += t ?? 0;
      byStatus.set(r.status, s);
      if (isLate(r)) {
        late = { count: late.count + 1, tons: late.tons + (t ?? 0) };
      }
    }
    return { tons, noWeight, byStatus, late };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, today]);

  // Barras: um dia por barra; períodos longos agrupam por semana.
  const buckets = useMemo(() => {
    if (invalidRange) return [];
    const days: string[] = [];
    for (let d = from; d <= to && days.length < 800; d = addDays(d, 1)) days.push(d);
    const weekly = days.length > 45;
    const map = new Map<string, { count: number; tons: number }>();
    const keys: string[] = [];
    for (const d of days) {
      const k = weekly ? mondayOf(d) : d;
      if (!map.has(k)) {
        map.set(k, { count: 0, tons: 0 });
        keys.push(k);
      }
    }
    for (const r of rows) {
      const k = weekly ? mondayOf(r.schedule_date) : r.schedule_date;
      const b = map.get(k);
      if (!b) continue;
      b.count++;
      b.tons += parseTons(r.weight) ?? 0;
    }
    return keys.map((k) => ({
      key: k,
      weekly,
      ...map.get(k)!,
      isToday: weekly ? mondayOf(today) === k : today === k,
    }));
  }, [rows, from, to, today, invalidRange]);
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  // Ranking usa o período todo (sem o filtro de cliente), para continuar
  // útil mesmo depois de escolher um cliente.
  const ranking = useMemo(() => {
    const map = new Map<string, { count: number; tons: number }>();
    for (const r of periodRows) {
      const name = r.client_name.trim() || "Sem cliente";
      const c = map.get(name) ?? { count: 0, tons: 0 };
      c.count++;
      c.tons += parseTons(r.weight) ?? 0;
      map.set(name, c);
    }
    return Array.from(map, ([name, v]) => ({ name, ...v })).sort(
      (a, b) =>
        b[rankBy] - a[rankBy] ||
        b.count - a.count ||
        a.name.localeCompare(b.name, "pt-BR")
    );
  }, [periodRows, rankBy]);
  const rankMax = Math.max(1, ...ranking.map((c) => c[rankBy]));

  const listRows = useMemo(
    () =>
      rows.filter((r) =>
        !statusFilter
          ? true
          : statusFilter === LATE
            ? isLate(r)
            : r.status === statusFilter
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, statusFilter, today]
  );

  function setPeriod(a: string, b: string) {
    setFrom(a);
    setTo(b);
  }
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthEnd = addDays(monthStart, -1);
  const shortcuts: { label: string; from: string; to: string }[] = [
    { label: "Hoje", from: today, to: today },
    { label: "Esta semana", from: mondayOf(today), to: addDays(mondayOf(today), 6) },
    { label: "Este mês", from: monthStart, to: today },
    { label: "Mês passado", from: `${prevMonthEnd.slice(0, 8)}01`, to: prevMonthEnd },
    { label: "Últimos 30 dias", from: addDays(today, -29), to: today },
  ];

  const columns: Column<Load>[] = [
    {
      key: "date",
      header: "Data",
      mobile: "field",
      cell: (r) => (
        <div>
          <Link
            href={`/programacao?date=${r.schedule_date}`}
            className="font-medium text-brand-700 hover:underline"
            title="Abrir este dia na programação"
          >
            {br(r.schedule_date)}
          </Link>
          {isLate(r) && (
            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
              Atrasada
            </span>
          )}
        </div>
      ),
    },
    { key: "client", header: "Cliente", mobile: "subtitle", cell: (r) => r.client_name || "—" },
    { key: "cargo", header: "Carga", mobile: "title", className: "font-medium text-navy-900", cell: (r) => r.cargo },
    { key: "origin", header: "Origem", mobile: "field", cell: (r) => r.origin || "—" },
    { key: "dest", header: "Destino", mobile: "field", cell: (r) => <DestinationsCell value={r.destination} /> },
    {
      key: "weight",
      header: "Peso (t)",
      mobile: "field",
      cell: (r) => {
        const t = parseTons(r.weight);
        return t === null ? "—" : formatTons(t, 3);
      },
    },
    { key: "plate", header: "Cavalo", mobile: "field", className: "font-medium", cell: (r) => r.plate || "—" },
    { key: "trailer", header: "Carreta", mobile: "field", className: "font-medium", cell: (r) => r.trailer_plate || "—" },
    { key: "driver", header: "Motorista", mobile: "field", cell: (r) => r.driver || "—" },
    {
      key: "status",
      header: "Status",
      mobile: "badge",
      cell: (r) => (
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${loadingStatusBadge(r.status)}`}
        >
          {loadingStatusLabel(r.status)}
        </span>
      ),
    },
  ];

  const filterLabel =
    statusFilter === LATE ? "Atrasadas" : statusFilter ? loadingStatusLabel(statusFilter) : "";

  const cardBase =
    "rounded-xl border px-4 py-3 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700";
  function cardState(value: string) {
    const active = statusFilter === value;
    return active
      ? "ring-2 ring-brand-600 ring-offset-1"
      : statusFilter
        ? "opacity-60 hover:opacity-100"
        : "hover:brightness-105";
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
          Dashboard da programação
        </h1>
        <p className="text-sm text-navy-500">
          Cargas por período, cliente e status. Clique num status para ver só
          aquelas cargas.
        </p>
      </div>

      {/* Filtros */}
      <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-3 print:hidden">
        <div>
          <label htmlFor="dash-from" className="mb-1 block text-xs font-medium text-navy-600">
            De
          </label>
          <input
            id="dash-from"
            type="date"
            value={from}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            className={dateInputCls}
          />
        </div>
        <div>
          <label htmlFor="dash-to" className="mb-1 block text-xs font-medium text-navy-600">
            Até
          </label>
          <input
            id="dash-to"
            type="date"
            value={to}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className={dateInputCls}
          />
        </div>
        <div>
          <label htmlFor="dash-client" className="mb-1 block text-xs font-medium text-navy-600">
            Cliente
          </label>
          <select
            id="dash-client"
            value={activeClient}
            onChange={(e) => setClient(e.target.value)}
            className={`${dateInputCls} min-w-52`}
          >
            <option value="">Todos os clientes</option>
            {clientOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {shortcuts.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setPeriod(s.from, s.to)}
              aria-pressed={from === s.from && to === s.to}
              className={`${buttonClasses("secondary", "compact")} ${
                from === s.from && to === s.to ? "!border-brand-500 !text-brand-700" : ""
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
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
            {from === to ? br(from) : `${br(from)} a ${br(to)}`}
            {activeClient ? ` · ${activeClient}` : " · todos os clientes"}
            {loading && " · carregando..."}
          </p>

          {/* Resumo */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-navy-200 bg-white px-4 py-3">
              <div className="text-xs font-medium uppercase text-navy-500">Cargas</div>
              <div className="mt-1 text-2xl font-semibold text-navy-900">{rows.length}</div>
            </div>
            <div className="rounded-xl border border-navy-200 bg-white px-4 py-3">
              <div className="text-xs font-medium uppercase text-navy-500">Toneladas</div>
              <div className="mt-1 text-2xl font-semibold text-navy-900">
                {formatTons(stats.tons)} t
              </div>
              {stats.noWeight > 0 && (
                <div className="mt-0.5 text-xs text-amber-700">
                  {stats.noWeight} {stats.noWeight === 1 ? "carga sem peso" : "cargas sem peso"} (fora da soma)
                </div>
              )}
            </div>
            <button
              type="button"
              aria-pressed={statusFilter === LATE}
              onClick={() => setStatusFilter(statusFilter === LATE ? "" : LATE)}
              title="Cargas de dias anteriores que ainda não saíram (Programado, Lavando ou Carregando)"
              className={`${cardBase} ${
                stats.late.count > 0
                  ? "border-red-300 bg-red-50 text-red-800"
                  : "border-navy-200 bg-white text-navy-700"
              } ${cardState(LATE)}`}
            >
              <div className="text-xs font-medium uppercase">Atrasadas</div>
              <div className="mt-1 text-2xl font-semibold">{stats.late.count}</div>
              <div className="mt-0.5 text-xs">
                {stats.late.count > 0
                  ? `${formatTons(stats.late.tons)} t que ainda não saíram`
                  : "Nenhuma carga atrasada"}
              </div>
            </button>
          </div>

          {/* Status */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {LOADING_STATUSES.map((s) => {
              const v = stats.byStatus.get(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={statusFilter === s.value}
                  onClick={() => setStatusFilter(statusFilter === s.value ? "" : s.value)}
                  title={statusFilter === s.value ? "Mostrar todos" : `Ver só ${s.label}`}
                  className={`${cardBase} border-transparent ${s.badge} ${cardState(s.value)}`}
                >
                  <div className="text-xs font-medium">{s.label}</div>
                  <div className="mt-1 text-2xl font-semibold">{v?.count ?? 0}</div>
                  <div className="mt-0.5 text-xs opacity-80">{formatTons(v?.tons ?? 0)} t</div>
                </button>
              );
            })}
          </div>

          {/* Gráfico: cargas por dia ou ranking de clientes */}
          <section className="mt-6 rounded-xl border border-navy-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label="Tipo de gráfico"
                className="inline-flex overflow-hidden rounded-lg border border-navy-300"
              >
                {(
                  [
                    ["dia", `Cargas por ${buckets[0]?.weekly ? "semana" : "dia"}`],
                    ["ranking", "Ranking de clientes"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={chartView === value}
                    onClick={() => setChartView(value)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      chartView === value
                        ? "bg-brand-100 text-brand-800"
                        : "text-navy-600 hover:bg-navy-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {chartView === "ranking" && (
                <div className="flex items-center gap-2 text-xs text-navy-500">
                  Ordenar por
                  <div className="inline-flex overflow-hidden rounded-lg border border-navy-300">
                    {(
                      [
                        ["count", "Cargas"],
                        ["tons", "Toneladas"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={rankBy === value}
                        onClick={() => setRankBy(value)}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          rankBy === value
                            ? "bg-brand-100 text-brand-800"
                            : "text-navy-600 hover:bg-navy-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {chartView === "ranking" ? (
              ranking.length === 0 ? (
                <p className="py-8 text-center text-sm text-navy-500">
                  {loading ? "Carregando..." : "Nenhuma carga no período."}
                </p>
              ) : (
                <ol className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1">
                  {ranking.map((c, i) => {
                    const selected = activeClient === c.name;
                    return (
                      <li key={c.name}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setClient(selected ? "" : c.name)}
                          title={selected ? "Mostrar todos os clientes" : `Filtrar por ${c.name}`}
                          className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-navy-50 ${
                            selected ? "bg-brand-50 ring-1 ring-brand-300" : ""
                          } ${activeClient && !selected ? "opacity-60" : ""}`}
                        >
                          <span className="w-6 shrink-0 text-right text-xs text-navy-500">
                            {i + 1}º
                          </span>
                          <span className="w-40 shrink-0 truncate font-medium text-navy-900 sm:w-56">
                            {c.name}
                          </span>
                          <span className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-navy-100">
                            <span
                              className="block h-full rounded bg-brand-400"
                              style={{ width: `${Math.max((c[rankBy] / rankMax) * 100, 2)}%` }}
                            />
                          </span>
                          <span className="w-32 shrink-0 text-right text-xs text-navy-700">
                            {c.count} {c.count === 1 ? "carga" : "cargas"} · {formatTons(c.tons)} t
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )
            ) : rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-navy-500">
                {loading ? "Carregando..." : "Nenhuma carga no período."}
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto pb-1">
                <div
                  className="flex h-40 items-end gap-1"
                  style={{ minWidth: `${Math.min(buckets.length * 22, 1400)}px` }}
                >
                  {buckets.map((b) => (
                    <div
                      key={b.key}
                      className="flex h-full min-w-0 flex-1 flex-col justify-end"
                      title={`${b.weekly ? "Semana de " : ""}${br(b.key)}: ${b.count} ${b.count === 1 ? "carga" : "cargas"} · ${formatTons(b.tons)} t`}
                    >
                      <div className="mb-0.5 text-center text-[10px] text-navy-500">
                        {b.count > 0 ? b.count : ""}
                      </div>
                      <div
                        className={`w-full rounded-t ${b.isToday ? "bg-brand-700" : "bg-brand-400"}`}
                        style={{
                          height: `${b.count === 0 ? 2 : Math.max((b.count / maxCount) * 100, 4)}%`,
                          opacity: b.count === 0 ? 0.35 : 1,
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div
                  className="mt-1 flex gap-1"
                  style={{ minWidth: `${Math.min(buckets.length * 22, 1400)}px` }}
                >
                  {buckets.map((b, i) => (
                    <div
                      key={b.key}
                      className="min-w-0 flex-1 text-center text-[10px] text-navy-500"
                    >
                      {buckets.length <= 16 || i % Math.ceil(buckets.length / 16) === 0
                        ? brShort(b.key)
                        : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Lista */}
          <section className="mt-6">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium text-navy-900">
                {filterLabel ? `Cargas: ${filterLabel}` : "Todas as cargas do período"}{" "}
                <span className="font-normal text-navy-500">({listRows.length})</span>
              </h2>
              {statusFilter && (
                <button
                  type="button"
                  onClick={() => setStatusFilter("")}
                  className={buttonClasses("secondary", "sm")}
                >
                  Limpar filtro
                </button>
              )}
            </div>
            {listRows.length === 0 ? (
              <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
                {loading ? "Carregando..." : "Nenhuma carga encontrada."}
              </div>
            ) : (
              <div className="rounded-xl border border-navy-200 bg-white">
                <DataTable rows={listRows} columns={columns} rowKey={(r) => r.id} />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
