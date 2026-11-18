"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { buttonClasses } from "@/components/Button";
import { StepperControl } from "@/components/StepperControl";
import { PlateBadge } from "@/components/PlateBadge";
import { FLEET_KINDS, normalizePlate } from "@/lib/fleet";
import { loadingStatusBadge, loadingStatusLabel } from "@/lib/loadingStatus";

// Disponibilidade de motoristas, caminhões e carretas num dia.
// Ocupado = está numa carga do dia que ainda não foi entregue (Programado,
// Carregando ou Em viagem), ou numa carga de dia anterior que ainda está
// Carregando/Em viagem (não voltou). Caminhão e carreta na oficina também
// ficam indisponíveis. O resto está disponível.

const FREE_WINDOW_DAYS = 30;

interface Load {
  id: string;
  schedule_date: string;
  client_name: string;
  plate: string | null;
  trailer_plate: string | null;
  driver: string | null;
  status: string;
  loading_time: string | null;
  delivered_at: string | null;
}

interface Driver {
  id: string;
  name: string;
  nickname: string | null;
}

interface Unit {
  plate: string;
  kind: string;
  agregado_id: string | null;
}

interface Workshop {
  plate: string;
  entry_at: string;
  workshop: string;
}

interface Data {
  date: string;
  drivers: Driver[];
  units: Unit[];
  loads: Load[];
  workshop: Map<string, Workshop>;
  error: string | null;
}

function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function shiftDate(value: string, days: number): string {
  const d = new Date(`${value}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}
function dm(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}
const driverKey = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const kindLabel = (k: string) => FLEET_KINDS.find((x) => x.value === k)?.label ?? k;

/** Motivo de estar ocupado, a partir da carga. */
function busyText(l: Load, date: string): string {
  if (l.schedule_date < date) return `${loadingStatusLabel(l.status)} desde ${dm(l.schedule_date)}`;
  return `${loadingStatusLabel(l.status)}${l.loading_time ? ` · ${l.loading_time.slice(0, 5)}` : ""}`;
}

interface Row {
  key: string;
  title: React.ReactNode;
  sub?: string;
  search: string;
  busy: Load | null;
  workshop: Workshop | null;
  freeSince: string | null;
}

export default function DisponibilidadePage() {
  const today = toIsoDate(new Date());
  const [date, setDate] = useState(today);
  const [data, setData] = useState<Data | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    const since = shiftDate(date, -FREE_WINDOW_DAYS);
    const cols = "id, schedule_date, client_name, plate, trailer_plate, driver, status, loading_time, delivered_at";
    Promise.all([
      supabase.from("drivers").select("id, name, nickname").order("name"),
      supabase.from("fleet_units").select("plate, kind, agregado_id").order("plate"),
      // Cargas do dia (qualquer status).
      supabase.from("loading_schedules").select(cols).eq("schedule_date", date),
      // Cargas de dias anteriores que ainda não voltaram.
      supabase.from("loading_schedules").select(cols).lt("schedule_date", date).in("status", ["carregando", "em_viagem"]),
      // Entregues recentes: para o "livre desde".
      supabase
        .from("loading_schedules")
        .select(cols)
        .gte("schedule_date", since)
        .lt("schedule_date", date)
        .eq("status", "entregue")
        .order("schedule_date", { ascending: false })
        .limit(1000),
      supabase
        .from("maintenance_orders")
        .select("plate, entry_at, maintenance_workshops(name)")
        .is("exit_at", null),
    ]).then(([dr, fu, day, open, done, mo]) => {
      if (!alive) return;
      const err = [dr, fu, day, open, done, mo].find((r) => r.error)?.error?.message ?? null;
      const workshop = new Map<string, Workshop>();
      for (const o of (mo.data ?? []) as unknown as { plate: string; entry_at: string; maintenance_workshops: { name: string } | null }[]) {
        workshop.set(normalizePlate(o.plate), {
          plate: o.plate,
          entry_at: o.entry_at,
          workshop: o.maintenance_workshops?.name ?? "oficina",
        });
      }
      setData({
        date,
        drivers: (dr.data ?? []) as Driver[],
        units: (fu.data ?? []) as Unit[],
        loads: [...((day.data ?? []) as Load[]), ...((open.data ?? []) as Load[]), ...((done.data ?? []) as Load[])],
        workshop,
        error: err,
      });
    });
    return () => {
      alive = false;
    };
  }, [date]);

  const loading = !data || data.date !== date;

  const { drivers, trucks, trailers } = useMemo(() => {
    if (!data || loading) return { drivers: [] as Row[], trucks: [] as Row[], trailers: [] as Row[] };
    // Ocupação e último dia livre por motorista e por placa.
    const busyBy = new Map<string, Load>();
    const freeBy = new Map<string, string>();
    const mark = (key: string, l: Load) => {
      if (!key) return;
      const active = l.status !== "entregue" && (l.schedule_date === date || l.status !== "programado");
      if (active) {
        // Vale a carga mais recente (a do dia, se houver).
        const cur = busyBy.get(key);
        if (!cur || cur.schedule_date < l.schedule_date) busyBy.set(key, l);
      } else if (l.status === "entregue") {
        const when = (l.delivered_at ? toIsoDate(new Date(l.delivered_at)) : l.schedule_date).slice(0, 10);
        const cur = freeBy.get(key);
        if (!cur || cur < when) freeBy.set(key, when);
      }
    };
    for (const l of data.loads) {
      mark("d:" + driverKey(l.driver), l);
      if (l.plate) mark("p:" + normalizePlate(l.plate), l);
      if (l.trailer_plate) mark("p:" + normalizePlate(l.trailer_plate), l);
    }

    const driverRows: Row[] = data.drivers.map((d) => {
      const nick = d.nickname?.trim() || null;
      const key = "d:" + driverKey(nick ?? d.name);
      return {
        key: d.id,
        title: nick ?? d.name,
        sub: nick && nick.toLowerCase() !== d.name.trim().toLowerCase() ? d.name : undefined,
        search: `${d.name} ${nick ?? ""}`.toLowerCase(),
        busy: busyBy.get(key) ?? null,
        workshop: null,
        freeSince: freeBy.get(key) ?? null,
      };
    });
    const unitRow = (u: Unit): Row => {
      const p = normalizePlate(u.plate);
      return {
        key: p,
        title: <PlateBadge plate={p} />,
        sub: `${kindLabel(u.kind)}${u.agregado_id ? " · agregado" : ""}`,
        search: `${p} ${kindLabel(u.kind)}`.toLowerCase(),
        busy: busyBy.get("p:" + p) ?? null,
        workshop: data.workshop.get(p) ?? null,
        freeSince: freeBy.get("p:" + p) ?? null,
      };
    };
    return {
      drivers: driverRows,
      trucks: data.units.filter((u) => u.kind !== "semirreboque").map(unitRow),
      trailers: data.units.filter((u) => u.kind === "semirreboque").map(unitRow),
    };
  }, [data, loading, date]);

  const q = search.trim().toLowerCase();

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <h1 className="text-xl font-semibold text-navy-900">Disponibilidade</h1>
      <p className="mt-1 text-sm text-navy-500">
        Motoristas, caminhões e carretas livres no dia: sem carga programada, carregando ou em viagem.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <StepperControl
          onPrev={() => setDate(shiftDate(date, -1))}
          onNext={() => setDate(shiftDate(date, 1))}
          prevLabel="Dia anterior"
          nextLabel="Próximo dia"
        >
          <input
            type="date"
            value={date}
            aria-label="Data"
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="bg-transparent px-3 py-2 text-sm font-medium text-navy-900 outline-none focus:bg-brand-50"
          />
        </StepperControl>
        <button type="button" onClick={() => setDate(today)} disabled={date === today} className={buttonClasses("secondary", "md")}>
          Hoje
        </button>
        <button
          type="button"
          onClick={() => setDate(shiftDate(today, 1))}
          disabled={date === shiftDate(today, 1)}
          className={buttonClasses("secondary", "md")}
        >
          Amanhã
        </button>
        <label className="ml-auto w-full sm:w-64">
          <span className="sr-only">Buscar motorista ou placa</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar motorista ou placa"
            className="w-full rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </label>
      </div>

      {data?.error && !loading && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Erro ao carregar: {data.error}
        </div>
      )}

      {loading ? (
        <div className="mt-6 rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
          Carregando disponibilidade...
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 items-start gap-3 lg:grid-cols-3">
          <Column title="Motoristas" rows={drivers} date={date} q={q} />
          <Column title="Caminhões" rows={trucks} date={date} q={q} />
          <Column title="Carretas" rows={trailers} date={date} q={q} />
        </div>
      )}
    </div>
  );
}

function Column({ title, rows, date, q }: { title: string; rows: Row[]; date: string; q: string }) {
  const shown = q ? rows.filter((r) => r.search.includes(q)) : rows;
  // Livre há mais tempo primeiro (sem carga no período = mais tempo livre).
  const free = shown
    .filter((r) => !r.busy && !r.workshop)
    .sort((a, b) => (a.freeSince ?? "").localeCompare(b.freeSince ?? "") || a.search.localeCompare(b.search));
  const busy = shown.filter((r) => r.busy || r.workshop).sort((a, b) => a.search.localeCompare(b.search));

  return (
    <section aria-label={title} className="rounded-xl border border-navy-200 bg-white p-3">
      <header className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
        <span className="ml-auto rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-800">
          {free.length} {free.length === 1 ? "disponível" : "disponíveis"}
        </span>
        <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs text-navy-600">{busy.length} ocupados</span>
      </header>

      <h3 className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wide text-teal-700">Disponíveis</h3>
      {free.length === 0 ? (
        <p className="rounded-lg bg-navy-50 px-3 py-3 text-center text-xs text-navy-500">Nenhum disponível.</p>
      ) : (
        <ul className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1">
          {free.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2 rounded-lg border border-navy-200 border-l-4 border-l-teal-500 px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-navy-900">{r.title}</span>
                {r.sub && <span className="block truncate text-[11px] text-navy-500">{r.sub}</span>}
              </span>
              <span className="shrink-0 text-right text-[11px] text-navy-600">
                {r.freeSince ? `livre desde ${dm(r.freeSince)}` : `sem carga há ${FREE_WINDOW_DAYS}+ dias`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3" open>
        <summary className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-500">Ocupados ({busy.length})</summary>
        {busy.length === 0 ? (
          <p className="rounded-lg bg-navy-50 px-3 py-3 text-center text-xs text-navy-500">Ninguém ocupado.</p>
        ) : (
          <ul className="max-h-[24rem] space-y-1.5 overflow-y-auto pr-1">
            {busy.map((r) => (
              <li key={r.key} className="rounded-lg border border-navy-200 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-navy-900">{r.title}</span>
                    {r.sub && <span className="block truncate text-[11px] text-navy-500">{r.sub}</span>}
                  </span>
                  {r.busy ? (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${loadingStatusBadge(r.busy.status)}`}>
                      {loadingStatusLabel(r.busy.status)}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">Na oficina</span>
                  )}
                </div>
                {r.busy && (
                  <p className="mt-1 text-[11px] text-navy-600">
                    {r.busy.client_name} · {busyText(r.busy, date)} ·{" "}
                    <Link href={`/programacao?date=${r.busy.schedule_date}`} className="font-medium text-brand-700 underline">
                      ver carga
                    </Link>
                  </p>
                )}
                {r.workshop && (
                  <p className="mt-1 text-[11px] text-red-700">
                    🔧 {r.workshop.workshop} desde {dm(r.workshop.entry_at)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}
