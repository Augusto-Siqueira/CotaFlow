// Ordens de Serviço da Manutenção (aba própria: salvar e imprimir).

export interface ServiceOrder {
  id: string;
  number: number;
  service_date: string; // AAAA-MM-DD
  plate: string;
  km: number | null;
  services: string;
  parts: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export const SERVICE_ORDER_COLUMNS =
  "id, number, service_date, plate, km, services, parts, created_by_name, created_at, updated_at";

/** Nº da OS com zeros à esquerda: 7 -> "0007". */
export function formatOsNumber(n: number): string {
  return String(n).padStart(4, "0");
}

/** "2026-11-04" -> "04/11/2026". */
export function formatOsDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
