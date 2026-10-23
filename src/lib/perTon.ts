// Cotação por tonelada: os valores da cotação divididos pela lotação mínima.

/** 33 -> "33 t"; 27,5 -> "27,5 t". */
export function tonsLabel(tons: number): string {
  return `${tons.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} t`;
}

/** Valor por tonelada (ou o valor da carga, quando não há lotação mínima). */
export function perTon(value: number | null, tons: number | null): number | null {
  if (value === null || value === undefined) return null;
  return tons ? value / tons : value;
}

export function minLoadNote(tons: number): string {
  return `Valores por tonelada. Lotação mínima de ${tonsLabel(tons)}: se carregado abaixo de ${tonsLabel(tons)}, será faturado com a lotação mínima de ${tonsLabel(tons)}.`;
}

/** Aceita "33", "27,5" ou "27.5"; devolve null se vazio ou inválido. */
export function parseTonsInput(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 && n <= 200 ? n : null;
}
