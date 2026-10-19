// Mantido em sincronia com fleet_units_kind_check (migrations 0040 e 0041).
export const FLEET_KINDS = [
  { value: "cavalo", label: "Cavalo mecânico", plural: "Cavalos mecânicos" },
  { value: "semirreboque", label: "Semi-reboque", plural: "Semi-reboques" },
  { value: "truck", label: "Truck", plural: "Trucks" },
  { value: "bitruck", label: "Bitruck", plural: "Bitrucks" },
] as const;

export type FleetKind = (typeof FLEET_KINDS)[number]["value"];

// ABC1D23 / ABC1234 — sempre 7 caracteres, maiúsculas, sem hífen nem espaço.
export function normalizePlate(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

export function isValidPlate(value: string): boolean {
  return /^[A-Z0-9]{7}$/.test(value);
}

// ---------- Capacitações (CIV e CIPP) ----------

export type CertKey = "civ" | "cipp";

export const CERTS: { key: CertKey; label: string }[] = [
  { key: "civ", label: "CIV" },
  { key: "cipp", label: "CIPP" },
];

/** Avisa a partir de quantos dias antes do vencimento. */
export const CERT_ALERT_DAYS = 7;

/** Cavalo mecânico só tem CIV; truck, bitruck e semi-reboque têm CIV e CIPP. */
export function requiredCerts(kind: FleetKind): CertKey[] {
  return kind === "cavalo" ? ["civ"] : ["civ", "cipp"];
}

export interface FleetCertFields {
  plate: string;
  kind: FleetKind;
  civ_due: string | null;
  civ_na: boolean;
  cipp_due: string | null;
  cipp_na: boolean;
}

export type CertLevel = "vencida" | "vencendo" | "ok" | "na" | "sem_data";

export interface CertStatus {
  cert: CertKey;
  label: string;
  due: string | null;
  level: CertLevel;
  /** Dias até vencer (negativo = vencida há N dias). */
  days: number | null;
}

function today0(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function certStatuses(u: FleetCertFields): CertStatus[] {
  const t = today0();
  return requiredCerts(u.kind).map((cert) => {
    const label = cert === "civ" ? "CIV" : "CIPP";
    const na = cert === "civ" ? u.civ_na : u.cipp_na;
    const due = cert === "civ" ? u.civ_due : u.cipp_due;
    if (na) return { cert, label, due: null, level: "na", days: null };
    if (!due) return { cert, label, due: null, level: "sem_data", days: null };
    const days = Math.round((new Date(`${due}T00:00:00`).getTime() - t) / 86400000);
    const level: CertLevel = days < 0 ? "vencida" : days <= CERT_ALERT_DAYS ? "vencendo" : "ok";
    return { cert, label, due, level, days };
  });
}

/** Só o que precisa de atenção (vencida ou vencendo), da mais urgente para a menos. */
export function certAlerts(u: FleetCertFields): CertStatus[] {
  return certStatuses(u)
    .filter((s) => s.level === "vencida" || s.level === "vencendo")
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
}

export function certText(s: CertStatus): string {
  if (s.days === null || s.due === null) return s.label;
  const date = new Date(`${s.due}T12:00:00`).toLocaleDateString("pt-BR");
  if (s.days < 0) return `${s.label} vencida em ${date} (há ${-s.days} ${-s.days === 1 ? "dia" : "dias"})`;
  if (s.days === 0) return `${s.label} vence hoje (${date})`;
  return `${s.label} vence em ${s.days} ${s.days === 1 ? "dia" : "dias"} (${date})`;
}
