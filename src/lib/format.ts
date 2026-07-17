export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}
