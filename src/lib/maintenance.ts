// Manutenção da frota: tipos, rótulos e formatadores de data/tempo.

export const SERVICE_TYPES = [
  { value: "preventiva", label: "Preventiva", badge: "bg-sky-200 text-sky-900" },
  { value: "corretiva", label: "Corretiva", badge: "bg-amber-200 text-amber-900" },
] as const;

export function serviceTypeLabel(value: string): string {
  return SERVICE_TYPES.find((t) => t.value === value)?.label ?? value;
}
export function serviceTypeBadge(value: string): string {
  return (
    SERVICE_TYPES.find((t) => t.value === value)?.badge ??
    "bg-navy-200 text-navy-800"
  );
}

export interface MaintenanceOrder {
  id: string;
  plate: string;
  workshop_id: string;
  service_type: string;
  service: string;
  entry_at: string;
  expected_exit_at: string | null;
  exit_at: string | null;
  odometer_km: number | null;
  cost: number | null;
  notes: string | null;
  maintenance_workshops: { name: string } | null;
}

export const ORDER_COLUMNS =
  "id, plate, workshop_id, service_type, service, entry_at, expected_exit_at, exit_at, odometer_km, cost, notes, maintenance_workshops(name)";

/** "2d 5h", "5h 30min", "40min". */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const min = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return min > 0 ? `${hours}h ${min}min` : `${hours}h`;
  return `${min}min`;
}

/** 14/10/2026 08:30 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Valor para <input type="datetime-local"> (hora local). */
export function toLocalInput(iso: string | Date | null): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Hora local digitada → ISO (com fuso) para gravar. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Aceita "1.234,56", "1234,56" ou "1234.56". */
export function parseMoney(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const normalized = v.includes(",")
    ? v.replace(/\./g, "").replace(",", ".")
    : v;
  const n = Number(normalized.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ---------- Defeitos relatados (v1.06) ----------

export const REPORT_CATEGORIES = [
  "Freios",
  "Motor",
  "Elétrica",
  "Pneus",
  "Suspensão",
  "Cabine",
  "Carroceria",
  "Outros",
] as const;

// 1 = pode rodar, 2 = atenção, 3 = veículo parado (bloqueia viagem).
export const SEVERITIES = [
  { value: 1, label: "Pode rodar", hint: "agendar depois", badge: "bg-brand-200 text-brand-900" },
  { value: 2, label: "Atenção", hint: "ver em breve", badge: "bg-amber-200 text-amber-900" },
  { value: 3, label: "Parado", hint: "não pode rodar", badge: "bg-red-100 text-red-700" },
] as const;

export function severityLabel(value: number): string {
  return SEVERITIES.find((s) => s.value === value)?.label ?? String(value);
}
export function severityBadge(value: number): string {
  return SEVERITIES.find((s) => s.value === value)?.badge ?? "bg-navy-200 text-navy-800";
}

export const REPORT_STAGES = [
  { value: "triagem", label: "Triagem", dot: "bg-amber-400" },
  { value: "agendada", label: "Agendada", dot: "bg-sky-400" },
  { value: "em_oficina", label: "Em oficina", dot: "bg-red-500" },
  { value: "concluida", label: "Concluída", dot: "bg-brand-500" },
] as const;

export function reportStageLabel(value: string): string {
  if (value === "recusada") return "Recusada";
  return REPORT_STAGES.find((s) => s.value === value)?.label ?? value;
}

// Meta de tempo na triagem (horas): depois disso o cartão fica em alerta.
export const TRIAGE_SLA_HOURS = 4;

export interface MaintenanceReport {
  id: string;
  plate: string;
  category: string;
  severity: number;
  description: string;
  status: string;
  source: string;
  reported_at: string;
  scheduled_for: string | null;
  workshop_id: string | null;
  order_id: string | null;
  stage_since: string;
  closed_at: string | null;
  photos: string[] | null;
}

export const REPORT_COLUMNS =
  "id, plate, category, severity, description, status, source, reported_at, scheduled_for, workshop_id, order_id, stage_since, closed_at, photos";
