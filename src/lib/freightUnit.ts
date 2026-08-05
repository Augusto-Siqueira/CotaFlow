// Os fretes são sempre calculados e gravados por viagem. Apresentá-los como
// preço por tonelada é só uma forma de exibição (tela, PDF e Excel), derivada
// da lotação mínima de cada rota — nada é convertido no banco.

export type FreightUnit = "viagem" | "tonelada";

export function parseFreightUnit(value: string | null | undefined): FreightUnit {
  return value === "tonelada" ? "tonelada" : "viagem";
}

/**
 * Converte um frete por viagem em preço por tonelada. Sem lotação mínima
 * informada não existe divisor, então o valor não é representável nessa
 * unidade e vira `null` (exibido como "—") em vez de um número enganoso.
 */
export function freightByUnit(
  value: number | null,
  minLoadTon: number | null,
  unit: FreightUnit
): number | null {
  if (unit === "viagem") return value;
  if (value === null || minLoadTon === null || minLoadTon <= 0) return null;
  return value / minLoadTon;
}

export const FREIGHT_UNIT_LABEL: Record<FreightUnit, string> = {
  viagem: "R$/viagem",
  tonelada: "R$/ton",
};
