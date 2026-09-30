export function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("pt-BR");
}

// Pra colunas `date` do Postgres (sem hora nem timezone, ex: validity_date),
// não pro formatDate acima: "2026-10-30" passado por `new Date(...)` é
// interpretado como meia-noite UTC, e formatar de volta no fuso do Brasil
// (UTC-3) devolveria "29/10/2026" — um dia a menos. Aqui é manipulação de
// string pura, sem conversão de fuso nenhuma.
export function formatDateOnly(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}
