// Abastecimentos (diesel e ARLA), lançados pelo motorista no app.

export type FuelType = "diesel" | "arla";

export interface FuelEntry {
  id: string;
  user_id: string;
  driver_name: string | null;
  plate: string;
  fuel_type: FuelType;
  fueled_at: string;
  location_type: "patio" | "externo";
  location: string | null;
  price_per_liter: number | null;
  liters: number;
  odometer_km: number;
  full_tank: boolean;
  photos: string[];
  notes: string | null;
  created_at: string;
  edited_at: string | null;
}

export const FUEL_LABEL: Record<FuelType, string> = { diesel: "Diesel", arla: "ARLA" };

/**
 * Média (km/l) no método do tanque cheio, como na folha: em cada abastecimento
 * com o tanque completado, km rodados desde o tanque cheio anterior (mesma placa
 * e mesmo combustível) ÷ litros colocados depois dele, incluindo este.
 * Devolve id -> média (só para os que fecham média).
 */
export function fuelAverages(entries: FuelEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [id, i] of fuelIntervals(entries)) out.set(id, i.km / i.liters);
  return out;
}

/**
 * Intervalos entre tanques cheios (mesma placa e combustível): id do
 * abastecimento que fecha o intervalo -> km rodados e litros colocados nele.
 * A média de um período é a soma dos km ÷ a soma dos litros dos intervalos.
 */
export function fuelIntervals(entries: FuelEntry[]): Map<string, { km: number; liters: number }> {
  const out = new Map<string, { km: number; liters: number }>();
  const groups = new Map<string, FuelEntry[]>();
  for (const e of entries) {
    const k = `${e.plate}|${e.fuel_type}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.fueled_at.localeCompare(b.fueled_at) || a.odometer_km - b.odometer_km);
    let lastFull: FuelEntry | null = null;
    let litersSince = 0;
    for (const e of list) {
      litersSince += Number(e.liters);
      if (!e.full_tank) continue;
      if (lastFull) {
        const km = e.odometer_km - lastFull.odometer_km;
        if (km > 0 && litersSince > 0) out.set(e.id, { km, liters: litersSince });
      }
      lastFull = e;
      litersSince = 0;
    }
  }
  return out;
}

export function formatLiters(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function formatKm(n: number): string {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

export function formatMoney(n: number): string {
  return Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatAverage(n: number): string {
  return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km/l`;
}

/** "1.234,5" / "1234.5" / "1234,5" -> 1234.5; inválido -> null. */
/**
 * Campo com máscara: aceita só números; a vírgula e os pontos de milhar entram
 * sozinhos, da direita para a esquerda, com casas decimais fixas.
 * 3 casas: "279071" -> "279,071"; "4" -> "0,004"; "1200000" -> "1.200,000".
 */
export function maskDecimalInput(text: string, decimals = 3): string {
  const digits = text.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return "";
  const padded = digits.padStart(decimals + 1, "0");
  const intPart = Number(padded.slice(0, -decimals)).toLocaleString("pt-BR");
  return `${intPart},${padded.slice(-decimals)}`;
}

/** Só números com ponto de milhar automático: "256197" -> "256.197". */
export function maskIntegerInput(text: string): string {
  const digits = text.replace(/\D/g, "").replace(/^0+/, "");
  return digits ? Number(digits).toLocaleString("pt-BR") : "";
}

/** Número já gravado para o campo com máscara (ex.: 279.07 -> "279,070"). */
export function toMaskedInput(value: number | string | null | undefined, decimals = 3): string {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : "";
}

export function parseDecimal(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  const normalized = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)
    ? v.replace(/\./g, "").replace(",", ".")
    : v.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Km rodado entre abastecimentos (método "km total"): para cada abastecimento,
 * quantos km a placa andou desde o abastecimento anterior (a diferença das
 * leituras do painel). O primeiro registro da placa não tem anterior e conta 0.
 * Leitura menor que a anterior (erro de digitação) conta 0 e não derruba as
 * seguintes. A soma dos deltas de um período = último km do período − último km
 * antes dele. Devolve id do abastecimento -> km rodado.
 */
export function fuelKmDeltas(entries: FuelEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  const byPlate = new Map<string, FuelEntry[]>();
  for (const e of entries) byPlate.set(e.plate, [...(byPlate.get(e.plate) ?? []), e]);
  for (const list of byPlate.values()) {
    list.sort((a, b) => a.fueled_at.localeCompare(b.fueled_at) || a.odometer_km - b.odometer_km);
    let prevMax: number | null = null;
    for (const e of list) {
      out.set(e.id, prevMax === null ? 0 : Math.max(0, e.odometer_km - prevMax));
      prevMax = prevMax === null ? e.odometer_km : Math.max(prevMax, e.odometer_km);
    }
  }
  return out;
}
