import { supabase } from "@/lib/supabase";

export interface ChecklistDriver {
  userId: string | null;
  label: string;
  name: string;
  /** Desde quando o motorista tem acesso ao app (yyyy-mm-dd). */
  accessSince: string | null;
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

export function addDays(value: string, n: number): string {
  const [y, m, d] = value.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n));
}

function isSunday(value: string): boolean {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
}

/**
 * O check-list é obrigatório todos os dias, para TODO motorista com acesso ao
 * app, tenha ou não carga. Domingo só conta se o motorista tinha carga.
 */
export function expectedDays(
  driver: ChecklistDriver,
  loadDays: Set<string>,
  from: string,
  to: string
): Set<string> {
  const out = new Set<string>();
  if (!driver.userId) return out;
  const last = to < localDate(new Date()) ? to : localDate(new Date());
  const first = driver.accessSince && driver.accessSince > from ? driver.accessSince : from;
  for (let day = first, i = 0; day <= last && i < 800; day = addDays(day, 1), i++) {
    if (!isSunday(day) || loadDays.has(day)) out.add(day);
  }
  return out;
}

/** Check-list que levou menos que isto provavelmente não foi feito de verdade. */
export const FAST_MINUTES = 2;

export function checklistMinutes(c: { started_at: string; finished_at: string }): number {
  return (new Date(c.finished_at).getTime() - new Date(c.started_at).getTime()) / 60000;
}

export async function fetchDrivers(): Promise<ChecklistDriver[]> {
  const { data } = await supabase
    .from("drivers")
    .select("name, nickname, user_id, app_access_since");
  return (
    (data ?? []) as {
      name: string;
      nickname: string | null;
      user_id: string | null;
      app_access_since: string | null;
    }[]
  ).map((d) => ({
    userId: d.user_id,
    label: d.nickname?.trim() || d.name,
    name: d.name,
    accessSince: d.app_access_since,
  }));
}

/** Cargas (motorista + dia) do período. */
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
  /** Tem carga programada hoje. */
  hasLoad: boolean;
  /** O check-list é esperado hoje (domingo só com carga). */
  expected: boolean;
  done: boolean;
  ncs: number;
}

/** Todos os motoristas cadastrados e a situação do check-list de hoje. */
export async function fetchTodayStatus(): Promise<TodayStatus[]> {
  const today = localDate(new Date());
  const [loads, drivers, lists] = await Promise.all([
    fetchLoadDays(today, today),
    fetchDrivers(),
    fetchChecklists(today, today),
  ]);
  const withLoad = new Set(loads.map((l) => l.driver).filter(Boolean));
  return drivers
    .map((d) => {
      const hasLoad = withLoad.has(d.label) || withLoad.has(d.name);
      const mine = lists.filter((c) => d.userId !== null && c.user_id === d.userId);
      return {
        label: d.label,
        hasAccess: d.userId !== null,
        hasLoad,
        expected:
          d.userId !== null &&
          (!d.accessSince || d.accessSince <= today) &&
          (!isSunday(today) || hasLoad),
        done: mine.length > 0,
        ncs: mine.reduce((sum, c) => sum + c.nonconformities, 0),
      };
    })
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        Number(b.hasLoad) - Number(a.hasLoad) ||
        a.label.localeCompare(b.label, "pt-BR")
    );
}
