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

// ---------- Capacitações (CIV, CIPP e cronotacógrafo) ----------

export type CertKey = "civ" | "cipp" | "crono";

export const CERTS: { key: CertKey; label: string }[] = [
  { key: "civ", label: "CIV" },
  { key: "cipp", label: "CIPP" },
  { key: "crono", label: "Cronotacógrafo" },
];

/** Colunas de fleet_units que as telas de capacitação leem. */
export const FLEET_CERT_COLUMNS = "plate, kind, civ_due, civ_na, cipp_due, cipp_na, crono_due, crono_stage";

/** Avisa a partir de quantos dias antes do vencimento. */
export const CERT_ALERT_DAYS = 7;

/**
 * CIV: todos. CIPP: tudo, menos cavalo mecânico. Cronotacógrafo: só quem tem
 * motor (cavalo, truck e bitruck), nunca o semi-reboque.
 */
export function requiredCerts(kind: FleetKind): CertKey[] {
  if (kind === "cavalo") return ["civ", "crono"];
  if (kind === "semirreboque") return ["civ", "cipp"];
  return ["civ", "cipp", "crono"];
}

export type CronoStage = "preliminar" | "definitivo";

export interface FleetCertFields {
  plate: string;
  kind: FleetKind;
  civ_due: string | null;
  civ_na: boolean;
  cipp_due: string | null;
  cipp_na: boolean;
  /** Vencimento do cronotacógrafo; no preliminar é o fim dos 30 dias dele. */
  crono_due: string | null;
  crono_stage: CronoStage | null;
}

export type CertLevel = "vencida" | "vencendo" | "ok" | "na" | "sem_data";

export interface CertStatus {
  cert: CertKey;
  label: string;
  due: string | null;
  level: CertLevel;
  /** Dias até vencer (negativo = vencida há N dias). */
  days: number | null;
  /** Só do cronotacógrafo. */
  stage: CronoStage | null;
}

function today0(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function certStatuses(u: FleetCertFields): CertStatus[] {
  const t = today0();
  return requiredCerts(u.kind).map((cert) => {
    const label = CERTS.find((c) => c.key === cert)!.label;
    const stage = cert === "crono" ? u.crono_stage : null;
    const na = cert === "civ" ? u.civ_na : cert === "cipp" ? u.cipp_na : false;
    const due = cert === "civ" ? u.civ_due : cert === "cipp" ? u.cipp_due : u.crono_due;
    if (na) return { cert, label, due: null, level: "na", days: null, stage };
    if (!due) return { cert, label, due: null, level: "sem_data", days: null, stage };
    const days = Math.round((new Date(`${due}T00:00:00`).getTime() - t) / 86400000);
    const level: CertLevel = days < 0 ? "vencida" : days <= CERT_ALERT_DAYS ? "vencendo" : "ok";
    return { cert, label, due, level, days, stage };
  });
}

/** Só o que precisa de atenção (vencida ou vencendo), da mais urgente para a menos. */
export function certAlerts(u: FleetCertFields): CertStatus[] {
  return certStatuses(u)
    .filter((s) => s.level === "vencida" || s.level === "vencendo")
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
}

/** "CIV vence em 3 dias (23/10/2026)"; o cronotacógrafo preliminar acrescenta o que fazer. */
export function certText(s: CertStatus): string {
  if (s.days === null || s.due === null) return s.label;
  const date = new Date(`${s.due}T12:00:00`).toLocaleDateString("pt-BR");
  const crono = s.cert === "crono";
  const name = crono && s.stage === "preliminar" ? `${s.label} preliminar` : s.label;
  const expired = crono ? "vencido" : "vencida";
  const tail = crono && s.stage === "preliminar" ? " — emitir o definitivo" : "";
  if (s.days < 0) return `${name} ${expired} em ${date} (há ${-s.days} ${-s.days === 1 ? "dia" : "dias"})${tail}`;
  if (s.days === 0) return `${name} vence hoje (${date})${tail}`;
  return `${name} vence em ${s.days} ${s.days === 1 ? "dia" : "dias"} (${date})${tail}`;
}
