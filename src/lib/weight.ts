// Peso das cargas: sempre em TONELADAS, guardado só como número ("28", "28,5")
// para o dashboard conseguir somar. Quem digitou "28 ton" no passado é lido
// pelo mesmo extrator.

const NUMBER = /\d+(?:[.,]\d+)?/;

/**
 * Deixa só o número, em toneladas, com vírgula:
 *  "28 ton" → "28", "28.5t" → "28,5", "abc" → "".
 * Nenhuma carga passa de 1.000 t, então 1000 ou mais só pode ser quilo
 * digitado sem vírgula: "32560" → "32,56" (32 t e 560 kg).
 */
export function normalizeWeight(value: string | null | undefined): string {
  const match = (value ?? "").match(NUMBER);
  if (!match) return "";
  let tons = Number(match[0].replace(",", "."));
  if (!Number.isFinite(tons)) return "";
  if (tons >= 1000) tons /= 1000;
  return String(Math.round(tons * 1000) / 1000).replace(".", ",");
}

/** Filtro de digitação: só dígitos e uma vírgula ("." vira ","). */
export function sanitizeWeightInput(value: string): string {
  const cleaned = value.replace(/[^\d.,]/g, "").replace(/\./g, ",");
  const [int, ...rest] = cleaned.split(",");
  return rest.length > 0 ? `${int},${rest.join("")}` : int;
}

/** Toneladas como número, ou null se não houver número no texto. */
export function parseTons(value: string | null | undefined): number | null {
  const n = normalizeWeight(value);
  return n ? Number(n.replace(",", ".")) : null;
}

export function formatTons(tons: number, maxDecimals = 1): string {
  return tons.toLocaleString("pt-BR", { maximumFractionDigits: maxDecimals });
}
