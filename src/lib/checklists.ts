import { supabase } from "@/lib/supabase";

export interface ChecklistDriver {
  userId: string | null;
  label: string;
  name: string;
}

export interface ChecklistRow {
  id: string;
  user_id: string;
  plate: string | null;
  trailer_plate: string | null;
  started_at: string;
  finished_at: string;
  answers: Record<string, string>;
  notes: Record<string, string>;
  photos: Record<string, string[]>;
  nonconformities: number;
  lat: number | null;
  lon: number | null;
}

export interface ChecklistLoad {
  driver: string | null;
  schedule_date: string;
}

const PAGE = 1000;

export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Check-list que levou menos que isto provavelmente não foi feito de verdade. */
export const FAST_MINUTES = 2;

export function checklistMinutes(c: { started_at: string; finished_at: string }): number {
  return (new Date(c.finished_at).getTime() - new Date(c.started_at).getTime()) / 60000;
}

export async function fetchDrivers(): Promise<ChecklistDriver[]> {
  const { data } = await supabase.from("drivers").select("name, nickname, user_id");
  return ((data ?? []) as { name: string; nickname: string | null; user_id: string | null }[]).map(
    (d) => ({ userId: d.user_id, label: d.nickname?.trim() || d.name, name: d.name })
  );
}

/** Cargas (motorista + dia) do período, para saber quem DEVERIA ter feito o check-list. */
export async function fetchLoadDays(from: string, to: string): Promise<ChecklistLoad[]> {
  const rows: ChecklistLoad[] = [];
  for (let page = 0; ; page++) {
    const { data } = await supabase
      .from("loading_schedules")
      .select("driver, schedule_date")
      .gte("schedule_date", from)
      .lte("schedule_date", to)
      .order("schedule_date")
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    rows.push(...((data as ChecklistLoad[] | null) ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function fetchChecklists(fromDate: string, toDate: string): Promise<ChecklistRow[]> {
  const [y1, m1, d1] = fromDate.split("-").map(Number);
  const [y2, m2, d2] = toDate.split("-").map(Number);
  const start = new Date(y1, m1 - 1, d1).toISOString();
  const end = new Date(y2, m2 - 1, d2 + 1).toISOString();
  const rows: ChecklistRow[] = [];
  for (let page = 0; ; page++) {
    const { data } = await supabase
      .from("driver_checklists")
      .select(
        "id, user_id, plate, trailer_plate, started_at, finished_at, answers, notes, photos, nonconformities, lat, lon"
      )
      .gte("finished_at", start)
      .lt("finished_at", end)
      .order("finished_at", { ascending: false })
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    rows.push(...((data as ChecklistRow[] | null) ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export interface TodayStatus {
  label: string;
  hasAccess: boolean;
  done: boolean;
  ncs: number;
}

/** Motoristas com carga hoje e se já fizeram o check-list. */
export async function fetchTodayStatus(): Promise<TodayStatus[]> {
  const today = localDate(new Date());
  const [loads, drivers, lists] = await Promise.all([
    fetchLoadDays(today, today),
    fetchDrivers(),
    fetchChecklists(today, today),
  ]);
  const labels = new Set(loads.map((l) => l.driver).filter(Boolean));
  return drivers
    .filter((d) => labels.has(d.label) || labels.has(d.name))
    .map((d) => {
      const mine = lists.filter((c) => d.userId !== null && c.user_id === d.userId);
      return {
        label: d.label,
        hasAccess: d.userId !== null,
        done: mine.length > 0,
        ncs: mine.reduce((sum, c) => sum + c.nonconformities, 0),
      };
    })
    .sort((a, b) => Number(a.done) - Number(b.done) || a.label.localeCompare(b.label, "pt-BR"));
}
