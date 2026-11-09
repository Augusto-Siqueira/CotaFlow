import { supabase } from "@/lib/supabase";

// KM Exato — gravações. Toda alteração de viagem vai para km_trip_log e toda
// alteração de configuração para km_config_log, como no app original.

export interface DeliveryInput {
  id?: string;
  client: string;
  nf: string | null;
  cte: string | null;
  weight_kg: number | null;
  freight_cte: number | null;
  delivered_on?: string | null;
  proof_sent?: boolean;
  proof_sent_at?: string | null;
  proof_before?: boolean;
  proof_file?: string | null;
}

export interface TripInput {
  plate: string;
  type_id: string | null;
  mode: "dedicado" | "rota" | "spot";
  route_name: string | null;
  loaded_on: string;
  km_est: number | null;
  km_route: number | null;
  km_comp: number;
  km_billed: number | null;
  odo_out: number | null;
  status?: "aberta" | "fechada";
  /** Carga da Programação criada junto com a viagem. */
  schedule_id?: string | null;
}

function fail(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function logTrip(tripId: string, action: string, byName: string | null) {
  const { error } = await supabase.from("km_trip_log").insert({ trip_id: tripId, action, by_name: byName });
  fail("histórico", error);
}

export async function logConfig(action: string, byName: string | null) {
  const { error } = await supabase.from("km_config_log").insert({ action, by_name: byName });
  fail("histórico", error);
}

/** Grava as entregas de uma viagem: atualiza as que têm id, cria as novas, apaga as removidas. */
async function saveDeliveries(tripId: string, list: DeliveryInput[]) {
  const { data: cur, error } = await supabase.from("km_deliveries").select("id").eq("trip_id", tripId);
  fail("entregas", error);
  const keep = new Set(list.filter((d) => d.id).map((d) => d.id));
  const gone = (cur ?? []).map((d) => d.id as string).filter((id) => !keep.has(id));
  if (gone.length) fail("entregas", (await supabase.from("km_deliveries").delete().in("id", gone)).error);
  for (const [i, d] of list.entries()) {
    const row = {
      trip_id: tripId,
      position: i,
      client: d.client,
      nf: d.nf,
      cte: d.cte,
      weight_kg: d.weight_kg,
      freight_cte: d.freight_cte,
      delivered_on: d.delivered_on ?? null,
      proof_sent: d.proof_sent ?? false,
      proof_sent_at: d.proof_sent_at ?? null,
      proof_before: d.proof_before ?? false,
      proof_file: d.proof_file ?? null,
    };
    const res = d.id
      ? await supabase.from("km_deliveries").update(row).eq("id", d.id)
      : await supabase.from("km_deliveries").insert(row);
    fail("entregas", res.error);
  }
}

export async function createTrip(input: TripInput, deliveries: DeliveryInput[], action: string, byName: string | null) {
  const { data, error } = await supabase
    .from("km_trips")
    .insert({ ...input, status: input.status ?? "aberta", origin: "app", ...(input.status === "fechada" ? { closed_at: new Date().toISOString() } : {}) })
    .select("id")
    .single();
  fail("viagem", error);
  await saveDeliveries(data!.id, deliveries);
  await logTrip(data!.id, action, byName);
  return data!.id as string;
}

export async function updateTrip(
  id: string,
  patch: Record<string, unknown>,
  action: string,
  byName: string | null,
  deliveries?: DeliveryInput[]
) {
  const { error } = await supabase.from("km_trips").update(patch).eq("id", id);
  fail("viagem", error);
  if (deliveries) await saveDeliveries(id, deliveries);
  await logTrip(id, action, byName);
}

export async function updateDelivery(deliveryId: string, tripId: string, patch: Record<string, unknown>, action: string, byName: string | null) {
  const { error } = await supabase.from("km_deliveries").update(patch).eq("id", deliveryId);
  fail("entrega", error);
  await logTrip(tripId, action, byName);
}

export async function tripLog(tripId: string) {
  const { data, error } = await supabase
    .from("km_trip_log")
    .select("at, by_name, action")
    .eq("trip_id", tripId)
    .order("at", { ascending: false });
  fail("histórico", error);
  return (data ?? []) as { at: string; by_name: string | null; action: string }[];
}
