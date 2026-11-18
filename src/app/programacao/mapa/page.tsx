"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase";
import { buttonClasses } from "@/components/Button";
import { PlateBadge } from "@/components/PlateBadge";
import { normalizePlate } from "@/lib/fleet";
import { loadingStatusBadge, loadingStatusLabel } from "@/lib/loadingStatus";
import type { FleetMarker } from "@/components/FleetMapClient";

// Mapa da frota: posição atual dos veículos com rastreador (Maxtrack, Positron;
// via A52),
// cruzada com a carga da Programação e com a oficina. Atualiza sozinho.

const FleetMapClient = dynamic(() => import("@/components/FleetMapClient"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[24rem] items-center justify-center rounded-xl bg-navy-50 text-sm text-navy-500">
      Carregando mapa...
    </div>
  ),
});

const REFRESH_MS = 60 * 1000;
const NO_SIGNAL_MS = 2 * 60 * 60 * 1000;
const MOVING_KMH = 5;

interface Position {
  plate: string;
  kind: string;
  lat: number;
  lon: number;
  speed: number;
  ignition: boolean | null;
  at: string;
  tracker: string;
}

interface Load {
  schedule_date: string;
  client_name: string;
  plate: string | null;
  trailer_plate: string | null;
  driver: string | null;
  status: string;
  destination: string | null;
}

type State = "movendo" | "ligado" | "desligado" | "sem_sinal";
const STATE: Record<State, { label: string; color: string; dot: string }> = {
  movendo: { label: "Em movimento", color: "#059669", dot: "bg-emerald-500" },
  ligado: { label: "Parado ligado", color: "#d97706", dot: "bg-amber-500" },
  desligado: { label: "Desligado", color: "#475569", dot: "bg-slate-500" },
  sem_sinal: { label: "Sem sinal", color: "#dc2626", dot: "bg-red-500" },
};

function toIsoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function ago(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} dias`;
}

function stateOf(p: Position, now: number): State {
  if (now - new Date(p.at).getTime() > NO_SIGNAL_MS) return "sem_sinal";
  if (p.speed >= MOVING_KMH) return "movendo";
  return p.ignition ? "ligado" : "desligado";
}

export default function MapaFrotaPage() {
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [loads, setLoads] = useState<Load[]>([]);
  const [workshop, setWorkshop] = useState<Map<string, string>>(new Map());
  const [filter, setFilter] = useState<"" | State>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/frota/posicoes", { cache: "no-store" });
      const body = (await res.json().catch(() => null)) as { positions?: Position[]; error?: string } | null;
      if (!res.ok || !body?.positions) {
        setError(body?.error ?? `Falha ao consultar o rastreador (HTTP ${res.status}).`);
      } else {
        setPositions(body.positions);
        setError(null);
        setFetchedAt(Date.now());
      }
    } catch {
      setError("Sem conexão com o servidor.");
    }
    // Carga e oficina de cada placa (dados do CotaFlow).
    const today = toIsoDate(new Date());
    const cols = "schedule_date, client_name, plate, trailer_plate, driver, status, destination";
    const [day, open, mo] = await Promise.all([
      supabase.from("loading_schedules").select(cols).eq("schedule_date", today).neq("status", "entregue"),
      supabase.from("loading_schedules").select(cols).lt("schedule_date", today).in("status", ["carregando", "em_viagem"]),
      supabase.from("maintenance_orders").select("plate, maintenance_workshops(name)").is("exit_at", null),
    ]);
    setLoads([...((day.data ?? []) as Load[]), ...((open.data ?? []) as Load[])]);
    setWorkshop(
      new Map(
        ((mo.data ?? []) as unknown as { plate: string; maintenance_workshops: { name: string } | null }[]).map((o) => [
          normalizePlate(o.plate),
          o.maintenance_workshops?.name ?? "oficina",
        ])
      )
    );
    setRefreshing(false);
  }, []);

  useEffect(() => {
    // Primeira leitura logo ao abrir; depois a cada minuto (pausa com a aba escondida).
    const first = setTimeout(load, 0);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  // Carga mais recente de cada placa (cavalo ou carreta).
  const loadBy = useMemo(() => {
    const m = new Map<string, Load>();
    for (const l of loads) {
      for (const p of [l.plate, l.trailer_plate]) {
        if (!p) continue;
        const k = normalizePlate(p);
        const cur = m.get(k);
        if (!cur || cur.schedule_date < l.schedule_date) m.set(k, l);
      }
    }
    return m;
  }, [loads]);

  const now = fetchedAt ?? 0;
  const rows = useMemo(
    () =>
      (positions ?? [])
        .map((p) => ({ p, state: stateOf(p, now), load: loadBy.get(p.plate) ?? null, shop: workshop.get(p.plate) ?? null }))
        .sort((a, b) => a.p.plate.localeCompare(b.p.plate)),
    [positions, now, loadBy, workshop]
  );
  const counts = useMemo(() => {
    const c: Record<State, number> = { movendo: 0, ligado: 0, desligado: 0, sem_sinal: 0 };
    for (const r of rows) c[r.state]++;
    return c;
  }, [rows]);

  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!filter || r.state === filter) &&
          (!q || `${r.p.plate} ${r.load?.driver ?? ""} ${r.load?.client_name ?? ""}`.toLowerCase().includes(q))
      ),
    [rows, filter, q]
  );

  const markers = useMemo<FleetMarker[]>(
    () =>
      shown.map((r) => ({
        id: r.p.plate,
        lat: r.p.lat,
        lon: r.p.lon,
        label: r.p.plate,
        color: STATE[r.state].color,
        title: `${r.p.plate} · ${r.p.kind} · ${r.p.tracker}`,
        lines: [
          `${STATE[r.state].label}${r.state === "movendo" ? ` · ${r.p.speed} km/h` : ""} · posição ${ago(r.p.at, now)}`,
          r.load
            ? `${r.load.client_name} · ${loadingStatusLabel(r.load.status)}${r.load.driver ? ` · ${r.load.driver}` : ""}`
            : "Sem carga na Programação",
          ...(r.load?.destination ? [`Destino: ${r.load.destination}`] : []),
          ...(r.shop ? [`Na oficina: ${r.shop}`] : []),
        ],
      })),
    [shown, now]
  );

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-navy-900">Mapa da frota</h1>
          <p className="mt-1 text-sm text-navy-500">
            Posição atual dos veículos com rastreador (Maxtrack e Positron). Atualiza sozinho a cada minuto.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {fetchedAt && (
            <span className="text-xs text-navy-500">
              Atualizado às {new Date(fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button
            type="button"
            onClick={() => void load()}
            disabled={refreshing}
            className={`${buttonClasses("secondary", "md")} disabled:cursor-not-allowed`}
          >
            {refreshing ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["movendo", "ligado", "desligado", "sem_sinal"] as State[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(filter === s ? "" : s)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter === s ? "border-brand-600 ring-2 ring-brand-600" : filter ? "border-navy-200 opacity-60 hover:opacity-100" : "border-navy-200"
            } text-navy-700`}
          >
            <span className={`h-2 w-2 rounded-full ${STATE[s].dot}`} aria-hidden="true" />
            {STATE[s].label}: {counts[s]}
          </button>
        ))}
        <label className="ml-auto w-full sm:w-64">
          <span className="sr-only">Buscar placa, motorista ou cliente</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar placa, motorista ou cliente"
            className="w-full rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 lg:h-[72vh] lg:grid-cols-[22rem_1fr]">
        <section aria-label="Veículos" className="flex min-h-0 flex-col rounded-xl border border-navy-200 bg-white p-3 max-lg:order-2">
          <h2 className="mb-2 text-sm font-semibold text-navy-900">
            Veículos <span className="font-normal text-navy-500">({shown.length} de {rows.length})</span>
          </h2>
          {positions === null && !error ? (
            <p className="py-6 text-center text-sm text-navy-500">Consultando o rastreador...</p>
          ) : shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-navy-500">Nenhum veículo.</p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 max-lg:max-h-[28rem]">
              {shown.map((r) => (
                <li key={r.p.plate}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.p.plate)}
                    aria-pressed={selected === r.p.plate}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      selected === r.p.plate ? "border-brand-500 ring-1 ring-brand-500" : "border-navy-200 hover:bg-navy-50"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <PlateBadge plate={r.p.plate} />
                        <span className="text-[11px] text-navy-500">
                          {r.p.kind} · {r.p.tracker}
                        </span>
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-navy-600">
                        <span className={`h-2 w-2 rounded-full ${STATE[r.state].dot}`} aria-hidden="true" />
                        {r.state === "movendo" ? `${r.p.speed} km/h` : STATE[r.state].label}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-2 text-[11px]">
                      {r.load ? (
                        <span className="min-w-0 truncate text-navy-700">
                          {r.load.client_name}
                          {r.load.driver ? ` · ${r.load.driver}` : ""}
                        </span>
                      ) : (
                        <span className="text-navy-400">Sem carga</span>
                      )}
                      <span className="shrink-0 text-navy-500">{ago(r.p.at, now)}</span>
                    </span>
                    {(r.load || r.shop) && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {r.load && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${loadingStatusBadge(r.load.status)}`}>
                            {loadingStatusLabel(r.load.status)}
                          </span>
                        )}
                        {r.shop && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">🔧 {r.shop}</span>
                        )}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="h-[60vh] min-h-0 lg:h-full">
          <FleetMapClient markers={markers} selectedId={selected} onSelect={setSelected} />
        </div>
      </div>
    </div>
  );
}
