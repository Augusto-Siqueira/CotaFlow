import { supabase } from "@/lib/supabase";
import { fetchAllCityNames, isCityWithUf, normalizeCityText } from "@/lib/cities";
import { isBlankLine, type OrderLine } from "@/lib/loadingOrder";

// KM Btech → Programação. A viagem da Btech é lançada no KM Btech (antes do
// carregamento) e cria a carga na Programação, com a ordem de embarque. O KM
// manda: editar a viagem atualiza a carga; cancelar exclui a carga se ela
// ainda não começou.

export interface ScheduleOptions {
  /** Unidades Btech cadastradas (como aparecem na Programação). */
  units: string[];
  tractors: string[];
  trailers: string[];
  drivers: { value: string; hint?: string }[];
  cities: string[];
  /** Produtos já usados nas cargas da Btech. */
  cargos: string[];
  /** Última carga de cada unidade: sugere origem, produto e horário. */
  lastByUnit: Record<string, { origin: string | null; cargo: string; loading_time: string | null }>;
}

export async function loadScheduleOptions(): Promise<ScheduleOptions> {
  const [clients, fleet, drivers, recent, cities] = await Promise.all([
    supabase.from("clients").select("name, trade_name"),
    supabase.from("fleet_units").select("plate, kind").order("plate"),
    supabase.from("drivers").select("name, nickname").order("nickname"),
    supabase
      .from("loading_schedules")
      .select("client_name, cargo, origin, loading_time, schedule_date")
      .ilike("client_name", "BTECH%")
      .order("schedule_date", { ascending: false })
      .limit(300),
    fetchAllCityNames().catch(() => [] as string[]),
  ]);
  const units = (clients.data ?? [])
    .map((c) => c.trade_name?.trim() || c.name)
    .filter((n) => /^BTECH\b/i.test(n))
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  const lastByUnit: ScheduleOptions["lastByUnit"] = {};
  const cargos = new Set<string>();
  for (const r of recent.data ?? []) {
    if (!lastByUnit[r.client_name]) lastByUnit[r.client_name] = { origin: r.origin, cargo: r.cargo, loading_time: r.loading_time };
    if (r.cargo?.trim()) cargos.add(r.cargo.trim());
  }
  const f = (fleet.data ?? []) as { plate: string; kind: string }[];
  return {
    units,
    tractors: f.filter((x) => x.kind !== "semirreboque").map((x) => x.plate),
    trailers: f.filter((x) => x.kind === "semirreboque").map((x) => x.plate),
    drivers: (drivers.data ?? []).map((d) => {
      const nick = d.nickname?.trim() || d.name;
      return { value: nick, hint: nick !== d.name ? d.name : undefined };
    }),
    cities: cities.filter(isCityWithUf),
    cargos: [...cargos].sort((a, b) => a.localeCompare(b, "pt-BR")),
    lastByUnit,
  };
}

/** Valor cadastrado igual ao digitado (sem diferença de maiúsculas), "" se vazio, null se não existe. */
export function pick(value: string, options: string[]): string | null {
  const v = value.trim();
  if (!v) return "";
  return options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? null;
}

/** Nome oficial da cidade (Cidade/UF) ou null. */
export function cityOf(text: string, cities: string[]): string | null {
  const n = normalizeCityText(text);
  return cities.find((c) => normalizeCityText(c) === n) ?? null;
}

/** Peso da carga para a Programação (toneladas, "32,5"): soma da ordem. */
export function orderWeight(lines: OrderLine[]): string | null {
  const t = lines.filter((l) => !isBlankLine(l)).reduce((a, l) => a + (l.tons ?? 0), 0);
  return t > 0 ? String(Math.round(t * 1000) / 1000).replace(".", ",") : null;
}

export interface ScheduleInput {
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
}

function fail(label: string, error: { message: string } | null) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

/** Grava a ordem de embarque da carga (apaga se não sobrar linha). */
export async function saveOrderLines(scheduleId: string, lines: OrderLine[]) {
  const filled = lines.filter((l) => !isBlankLine(l));
  const res = filled.length
    ? await supabase
        .from("loading_orders")
        .upsert({ schedule_id: scheduleId, lines: filled, updated_at: new Date().toISOString() }, { onConflict: "schedule_id" })
    : await supabase.from("loading_orders").delete().eq("schedule_id", scheduleId);
  fail("ordem de embarque", res.error);
}

export async function createSchedule(input: ScheduleInput, lines: OrderLine[]): Promise<string> {
  const { data, error } = await supabase
    .from("loading_schedules")
    .insert({ ...input, status: "programado" })
    .select("id")
    .single();
  fail("Programação", error);
  const id = data!.id as string;
  try {
    await saveOrderLines(id, lines);
  } catch (e) {
    await supabase.from("loading_schedules").delete().eq("id", id);
    throw e;
  }
  return id;
}

export async function deleteSchedule(id: string) {
  await supabase.from("loading_schedules").delete().eq("id", id);
}

export async function updateSchedule(id: string, patch: Partial<ScheduleInput>, lines?: OrderLine[]) {
  if (Object.keys(patch).length) fail("Programação", (await supabase.from("loading_schedules").update(patch).eq("id", id)).error);
  if (lines) await saveOrderLines(id, lines);
}

/** Carga da Btech já lançada na Programação, ainda sem viagem do KM ligada. */
export interface ExistingSchedule {
  id: string;
  schedule_date: string;
  client_name: string;
  destination: string | null;
  driver: string | null;
  plate: string | null;
  trailer_plate: string | null;
  status: string;
}

const isoPlus = (iso: string, days: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Cargas da Btech com a placa (cavalo ou semi-reboque) carregando até 3 dias
 * antes ou depois da data, que ainda não têm viagem do KM. Evita criar a carga
 * de novo quando a equipe já lançou na Programação. A mais próxima vem primeiro.
 */
export async function findExistingSchedules(plate: string, date: string): Promise<ExistingSchedule[]> {
  const p = plate.trim().toUpperCase();
  if (!/^[A-Z0-9]{7}$/.test(p) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const { data, error } = await supabase
    .from("loading_schedules")
    .select("id, schedule_date, client_name, destination, driver, plate, trailer_plate, status")
    .ilike("client_name", "BTECH%")
    .or(`plate.eq.${p},trailer_plate.eq.${p}`)
    .gte("schedule_date", isoPlus(date, -3))
    .lte("schedule_date", isoPlus(date, 3));
  fail("Programação", error);
  const list = (data ?? []) as ExistingSchedule[];
  if (!list.length) return [];
  const { data: used } = await supabase.from("km_trips").select("schedule_id").in("schedule_id", list.map((s) => s.id));
  const taken = new Set((used ?? []).map((u) => u.schedule_id as string));
  const dist = (s: ExistingSchedule) => Math.abs(new Date(s.schedule_date).getTime() - new Date(date).getTime());
  return list.filter((s) => !taken.has(s.id)).sort((a, b) => dist(a) - dist(b));
}

export interface LinkedSchedule {
  id: string;
  client_name: string;
  destination: string | null;
  plate: string | null;
  trailer_plate: string | null;
  status: string;
  lines: OrderLine[];
}

export async function loadLinkedSchedule(id: string): Promise<LinkedSchedule | null> {
  const [s, o] = await Promise.all([
    supabase.from("loading_schedules").select("id, client_name, destination, plate, trailer_plate, status").eq("id", id).maybeSingle(),
    supabase.from("loading_orders").select("lines").eq("schedule_id", id).maybeSingle(),
  ]);
  if (!s.data) return null;
  return { ...s.data, lines: ((o.data?.lines as OrderLine[] | undefined) ?? []).filter((l) => !isBlankLine(l)) };
}

/**
 * Viagem cancelada no KM: a carga sai da Programação se ainda está
 * "Programado" e sem comprovante. Senão fica, e a equipe ajusta por lá.
 */
export async function dropScheduleOnCancel(id: string): Promise<"excluida" | "mantida" | "sem carga"> {
  const { data } = await supabase.from("loading_schedules").select("status").eq("id", id).maybeSingle();
  if (!data) return "sem carga";
  const { count } = await supabase.from("delivery_proofs").select("id", { count: "exact", head: true }).eq("schedule_id", id);
  if (data.status !== "programado" || (count ?? 0) > 0) return "mantida";
  fail("Programação", (await supabase.from("loading_schedules").delete().eq("id", id)).error);
  return "excluida";
}
