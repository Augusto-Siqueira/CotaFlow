// Peso das cargas: sempre em TONELADAS, guardado só como número ("28", "28,5")
// para o dashboard conseguir somar. Quem digitou "28 ton" no passado é lido
// pelo mesmo extrator.

const NUMBER = /\d+(?:[.,]\d+)?/;

/** Deixa só o número: "28 ton" → "28", "28.5t" → "28,5", "abc" → "". */
export function normalizeWeight(value: string | null | undefined): string {
  const match = (value ?? "").match(NUMBER);
  return match ? match[0].replace(".", ",") : "";
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

export function formatTons(tons: number): string {
  return tons.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}
