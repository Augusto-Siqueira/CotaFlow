// CIOT dos agregados (migration 0081): tipos, prefill e contas da ficha.

export type CiotStatus = "rascunho" | "emitido" | "cancelado";

export interface CiotInvoice {
  number: string;
  date: string | null;
  value: number | null;
}

export interface Ciot {
  id: string;
  mode: "viagem" | "mensal";
  schedule_id: string | null;
  agregado_id: string;
  driver_id: string | null;
  plates: string[];
  recipient_client_id: string | null;
  trip_start: string | null;
  trip_end: string | null;
  origin: string | null;
  destination: string | null;
  distance_km: number | null;
  packaging: string | null;
  weight_kg: number | null;
  cargo_code: string | null;
  cargo_description: string | null;
  antt_cargo_type: string | null;
  high_performance: boolean;
  empty_return: boolean;
  vehicle_composition: boolean;
  invoices: CiotInvoice[];
  freight_value: number | null;
  toll_value: number;
  fuel_value: number;
  insurance_value: number;
  irrf: number;
  inss: number;
  sest_senat: number;
  issqn: number;
  other_taxes: number;
  other_taxes_desc: string | null;
  payment_date: string | null;
  payment_value: number | null;
  status: CiotStatus;
  ciot_number: string | null;
  issued_at: string | null;
  notes: string | null;
  created_by_name: string | null;
  updated_at: string;
}

export const CIOT_COLUMNS =
  "id, mode, schedule_id, agregado_id, driver_id, plates, recipient_client_id, trip_start, trip_end, origin, destination, distance_km, packaging, weight_kg, cargo_code, cargo_description, antt_cargo_type, high_performance, empty_return, vehicle_composition, invoices, freight_value, toll_value, fuel_value, insurance_value, irrf, inss, sest_senat, issqn, other_taxes, other_taxes_desc, payment_date, payment_value, status, ciot_number, issued_at, notes, created_by_name, updated_at";

export const CIOT_STATUS_LABEL: Record<CiotStatus, string> = {
  rascunho: "Rascunho",
  emitido: "Emitido",
  cancelado: "Cancelado",
};

// Contratante e tomador do serviço são sempre a própria Transbochnia.
export const TRANSBOCHNIA = {
  cnpj: "86959426000192",
  name: "TRANSBOCHNIA TRANSPORTES LTDA",
};

// Embalagens mais usadas (o campo aceita qualquer texto).
export const PACKAGING_SUGGESTIONS = ["Tanque", "Granel", "Big bag", "Sacaria", "Tambor", "IBC / Contêiner", "Palete", "Caixa"];

export function totalTaxes(c: Pick<Ciot, "irrf" | "inss" | "sest_senat" | "issqn" | "other_taxes">): number {
  return (c.irrf ?? 0) + (c.inss ?? 0) + (c.sest_senat ?? 0) + (c.issqn ?? 0) + (c.other_taxes ?? 0);
}

/** Valor líquido da parcela única: frete menos as retenções. */
export function netPayment(
  c: Pick<Ciot, "freight_value" | "irrf" | "inss" | "sest_senat" | "issqn" | "other_taxes">
): number | null {
  if (c.freight_value === null) return null;
  return Math.max(0, Math.round((c.freight_value - totalTaxes(c)) * 100) / 100);
}

/** "Curitiba/PR; Araucária/PR" -> ["Curitiba/PR", "Araucária/PR"]. */
export function splitDestinations(text: string | null): string[] {
  return (text ?? "")
    .split(/[;\n]/)
    .map((s) => s.trim().replace(/\s*\(\d+\)\s*$/, ""))
    .filter(Boolean);
}

/** Texto para conferir/copiar: valores em reais com vírgula, sem "R$". */
export function moneyPlain(v: number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
