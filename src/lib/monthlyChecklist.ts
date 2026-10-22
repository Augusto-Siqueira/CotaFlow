// Check-list mensal das placas: tipos e regras compartilhadas (telas e PDF).

export type MonthlyTemplate = "semi" | "motor";
export type MonthlyAnswer = "S" | "N" | "NA";

export const MONTHLY_TEMPLATE_LABEL: Record<MonthlyTemplate, string> = {
  semi: "Semirreboques",
  motor: "Truck e outros",
};

/** Semirreboque usa o modelo de semirreboques; truck, bitruck e cavalo, o "Truck e outros". */
export function templateOf(kind: string): MonthlyTemplate {
  return kind === "semirreboque" ? "semi" : "motor";
}

/** Nova inspeção a cada 30 dias; avisa a partir de 7 dias antes. */
export const MONTHLY_CYCLE_DAYS = 30;

/**
 * Itens de manutenção com N viram defeito na triagem? Desligado por decisão da
 * empresa (mesma chave no banco: v_create_defects em submit_monthly_checklist).
 */
export const MONTHLY_CREATES_DEFECTS = false;
export const MONTHLY_ALERT_DAYS = 7;

export interface MonthlyItem {
  id: string;
  template: MonthlyTemplate;
  section: string;
  subsection: string | null;
  number: string;
  text: string;
  extra: "due" | "due2" | "cnh" | "date" | null;
  cert_key: "civ" | "cipp" | "crono" | null;
  maintenance: boolean;
  category: string | null;
  position: number;
}

export interface MonthlyExtra {
  due?: string;
  due2?: string;
  points?: string;
  validity?: string;
  date?: string;
}

export interface MonthlyDivergence {
  item: string;
  cert: "civ" | "cipp" | "crono";
  checklist: string | null;
  cadastro: string | null;
}

export interface MonthlyChecklist {
  id: string;
  plate: string;
  template: MonthlyTemplate;
  inspector_name: string | null;
  driver_name: string | null;
  driver_absent: boolean;
  driver_absent_reason: string | null;
  answers: Record<string, MonthlyAnswer>;
  item_notes: Record<string, string>;
  extras: Record<string, MonthlyExtra>;
  photos: Record<string, string[]>;
  observations: string | null;
  divergences: MonthlyDivergence[];
  nonconformities: number;
  defects_created: number;
  inspector_signature: string;
  driver_signature: string | null;
  started_at: string | null;
  finished_at: string;
}

export const CERT_LABEL: Record<string, string> = { civ: "CIV", cipp: "CIPP", crono: "Cronotacógrafo" };

export type MonthlyLevel = "atrasado" | "vencendo" | "em_dia" | "nunca";

export interface MonthlyStatus {
  level: MonthlyLevel;
  /** Último check-list (data/hora) ou null. */
  last: string | null;
  /** Data limite do próximo (AAAA-MM-DD) ou null. */
  due: string | null;
  /** Dias até o limite (negativo = atrasado). */
  days: number | null;
}

function day0(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function monthlyStatus(lastFinishedAt: string | null, now = new Date()): MonthlyStatus {
  if (!lastFinishedAt) return { level: "nunca", last: null, due: null, days: null };
  const last = new Date(lastFinishedAt);
  const due = new Date(last.getFullYear(), last.getMonth(), last.getDate() + MONTHLY_CYCLE_DAYS);
  const days = Math.round((due.getTime() - day0(now)) / 86400000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    level: days < 0 ? "atrasado" : days <= MONTHLY_ALERT_DAYS ? "vencendo" : "em_dia",
    last: lastFinishedAt,
    due: `${due.getFullYear()}-${p(due.getMonth() + 1)}-${p(due.getDate())}`,
    days,
  };
}

export function statusText(s: MonthlyStatus): string {
  if (s.level === "nunca" || s.days === null) return "nunca feito";
  if (s.days < 0) return `atrasado há ${-s.days} ${-s.days === 1 ? "dia" : "dias"}`;
  if (s.days === 0) return "vence hoje";
  return `vence em ${s.days} ${s.days === 1 ? "dia" : "dias"}`;
}

export function fmtDateBr(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR");
}
