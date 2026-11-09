import type { SupabaseClient } from "@supabase/supabase-js";
import type { KmDelivery, KmHistMonth, KmState, KmTariff, KmTripDoc } from "./engine";

// Monta o KmState (formato do motor) a partir das tabelas km_* (migration 0082).

const n = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

async function all<T>(q: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, label: string): Promise<T[]> {
  const { data, error } = await q();
  if (error) throw new Error(`${label}: ${error.message}`);
  return data ?? [];
}

/** Lê uma tabela inteira em páginas de 1000 (o PostgREST corta em 1000). */
async function paged<T>(db: SupabaseClient, table: string, columns: string, order: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).range(from, from + 999);
    for (const o of order) q = q.order(o);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

export interface KmTripRow {
  id: string;
  legacy_id: string | null;
  plate: string;
  type_id: string | null;
  tractor_plate: string | null;
  schedule_id?: string | null;
  mode: "dedicado" | "rota" | "spot";
  route_name: string | null;
  loaded_on: string;
  km_est: number | null;
  km_route: number | null;
  km_comp: number | null;
  km_billed: number | null;
  odo_out: number | null;
  odo_in: number | null;
  status: "aberta" | "fechada" | "cancelada";
  closed_at: string | null;
  reason: string | null;
  reason_note: string | null;
  origin: string | null;
  freight_cte: number | null;
}
export interface KmDeliveryRow {
  id: string;
  trip_id: string;
  position: number;
  client: string;
  nf: string | null;
  cte: string | null;
  weight_kg: number | null;
  freight_cte: number | null;
  delivered_on: string | null;
  proof_sent: boolean;
  proof_sent_at: string | null;
  proof_sent_by: string | null;
  proof_before: boolean;
  proof_file: string | null;
}

export const KM_TRIP_COLUMNS =
  "id, legacy_id, plate, type_id, tractor_plate, mode, route_name, loaded_on, km_est, km_route, km_comp, km_billed, odo_out, odo_in, status, closed_at, reason, reason_note, origin, freight_cte, schedule_id";
export const KM_DELIVERY_COLUMNS =
  "id, trip_id, position, client, nf, cte, weight_kg, freight_cte, delivered_on, proof_sent, proof_sent_at, proof_sent_by, proof_before, proof_file";

export function deliveryDoc(d: KmDeliveryRow): KmDelivery {
  return {
    id: d.id,
    cliente: d.client,
    nf: d.nf,
    cte: d.cte,
    peso: n(d.weight_kg),
    freteCte: n(d.freight_cte),
    entregue: d.delivered_on,
    comp: { env: d.proof_sent, em: d.proof_sent_at, por: d.proof_sent_by, antes: d.proof_before, arq: d.proof_file },
  };
}

export function tripDoc(t: KmTripRow, deliveries: KmDeliveryRow[]): KmTripDoc {
  return {
    placa: t.plate,
    tipo: t.type_id,
    cavalo: t.tractor_plate,
    scheduleId: t.schedule_id ?? null,
    modo: t.mode,
    rotaNome: t.route_name,
    carreg: t.loaded_on,
    kmEst: n(t.km_est),
    kmRota: n(t.km_route),
    kmComp: n(t.km_comp),
    kmFat: n(t.km_billed),
    odoSaida: n(t.odo_out),
    odoChegada: n(t.odo_in),
    status: t.status,
    motivo: t.reason,
    motivoObs: t.reason_note,
    origem: t.origin,
    freteCte: n(t.freight_cte),
    entregas: deliveries.sort((a, b) => a.position - b.position).map(deliveryDoc),
  };
}

export async function loadKmState(db: SupabaseClient): Promise<{ state: KmState; tripRows: KmTripRow[] }> {
  const [settings, types, fleet, tariffs, routes, hist, trips, deliveries, settlements, waivers] = await Promise.all([
    all<Record<string, unknown>>(() => db.from("km_settings").select("*").eq("id", 1), "km_settings"),
    all<{ id: string; name: string; axles: number | null }>(() => db.from("km_equipment_types").select("id, name, axles").order("position"), "km_equipment_types"),
    all<{ plate: string; type_id: string; opening_balance: number }>(() => db.from("km_fleet").select("plate, type_id, opening_balance").eq("active", true).order("position"), "km_fleet"),
    all<{ id: string; valid_from: string; method: "km" | "piso"; reference: string | null; values: KmTariff["v"] }>(() => db.from("km_tariffs").select("id, valid_from, method, reference, values").order("valid_from"), "km_tariffs"),
    all<{ id: string; name: string; km: number }>(() => db.from("km_routes").select("id, name, km").order("position"), "km_routes"),
    paged<{ month: string; loaded_on: string; plate: string; km_est: number | null; km_billed: number | null; km_real: number | null; value_per_km: number | null; diff_value: number | null; destinations: string | null; deliveries_count: number | null }>(
      db, "km_history_trips", "month, position, loaded_on, plate, km_est, km_billed, km_real, value_per_km, diff_value, destinations, deliveries_count", ["month", "position"]),
    paged<KmTripRow>(db, "km_trips", KM_TRIP_COLUMNS, ["loaded_on"]),
    paged<KmDeliveryRow>(db, "km_deliveries", KM_DELIVERY_COLUMNS, ["trip_id", "position"]),
    all<{ id: string; settled_on: string; plate: string | null; paid_to: string | null; value: number | null; effect: number | null; note: string | null }>(() => db.from("km_settlements").select("id, settled_on, plate, paid_to, value, effect, note"), "km_settlements"),
    all<{ month: string; plate: string; reason: string }>(() => db.from("km_waivers").select("month, plate, reason"), "km_waivers"),
  ]);

  const s = settings[0] ?? {};
  const histByMonth = new Map<string, KmHistMonth>();
  for (const h of hist) {
    const m = histByMonth.get(h.month) ?? { mes: h.month, viagens: [] };
    m.viagens.push({ d: h.loaded_on, p: h.plate, est: n(h.km_est), fat: n(h.km_billed), real: n(h.km_real), vkm: n(h.value_per_km), dif: n(h.diff_value), dst: h.destinations, ne: n(h.deliveries_count) });
    histByMonth.set(h.month, m);
  }
  const delivByTrip = new Map<string, KmDeliveryRow[]>();
  for (const d of deliveries) delivByTrip.set(d.trip_id, [...(delivByTrip.get(d.trip_id) ?? []), d]);
  const viag: Record<string, KmTripDoc> = {};
  for (const t of trips) viag[t.id] = tripDoc(t, delivByTrip.get(t.id) ?? []);

  const state: KmState = {
    cfg: {
      regras: {
        metaKm: Number(s.min_km_month ?? 8000),
        compMax: Number(s.comp_max_km ?? 600),
        limite: Number(s.deviation_limit ?? 0.1),
        prazoComp: Number(s.proof_deadline_days ?? 1),
        diasAberta: Number(s.open_alert_days ?? 10),
        fator: Number(s.estimate_factor ?? 1),
        kmMinPolitica: s.min_km_policy === "cobrar" ? "cobrar" : "registrar",
        retorno: Number(s.return_factor ?? 0.92),
      },
      tipos: types.map((t) => ({ id: t.id, nome: t.name, eixos: n(t.axles) })),
      frota: fleet.map((f) => ({ placa: f.plate, tipo: f.type_id, abertura: Number(f.opening_balance) })),
      tarifas: tariffs.map((t) => ({ id: t.id, desde: t.valid_from, metodo: t.method, ref: t.reference, v: t.values ?? {} })),
      rotas: routes.map((r) => ({ id: r.id, nome: r.name, km: Number(r.km) })),
    },
    hist: [...histByMonth.values()].sort((a, b) => (a.mes < b.mes ? -1 : 1)),
    viag,
    acertos: settlements.map((a) => ({ id: a.id, data: a.settled_on, placa: a.plate, pagoPara: a.paid_to, valor: n(a.value), efeito: n(a.effect), obs: a.note })),
    abonos: Object.fromEntries(waivers.map((w) => [`${w.month}_${w.plate}`, { motivo: w.reason }])),
  };
  return { state, tripRows: trips };
}
