// Comprovante de entrega: pesos em QUILOS (como saem na NF e no ticket).

/** "32.560", "32560" ou "32560,5" → 32560.5; vazio/zero/inválido → null. */
export function parseKg(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  // Ponto só de milhar ("32.560") vira nada; vírgula é o decimal.
  const normalized = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(v)
    ? v.replace(/\./g, "").replace(",", ".")
    : v.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatKg(kg: number): string {
  return Number(kg).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
