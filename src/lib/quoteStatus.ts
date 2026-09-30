// Catálogo fechado de status de cotação — mantido em sincronia com o CHECK
// constraint quotes_status_check (ver migration 0033_quote_status_options).
// Fonte única pra telas de listagem, filtro e edição não divergirem do que
// o banco de fato aceita.

export const QUOTE_STATUSES = [
  { value: "rascunho", label: "Rascunho" },
  { value: "vigente", label: "Vigente" },
  { value: "obsoleta", label: "Obsoleta" },
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]["value"];

const LABEL_BY_VALUE = new Map(QUOTE_STATUSES.map((s) => [s.value, s.label]));

// Cores por status — fallback pro estilo neutro (rascunho) caso apareça um
// valor fora do catálogo (ex: dado antigo pré-migration ainda não migrado).
const BADGE_CLASS_BY_VALUE: Record<QuoteStatus, string> = {
  rascunho: "bg-navy-100 text-navy-700",
  vigente: "bg-brand-50 text-brand-800",
  obsoleta: "bg-amber-50 text-amber-800",
};

export function quoteStatusLabel(status: string): string {
  return LABEL_BY_VALUE.get(status as QuoteStatus) ?? status;
}

export function quoteStatusBadgeClass(status: string): string {
  return BADGE_CLASS_BY_VALUE[status as QuoteStatus] ?? BADGE_CLASS_BY_VALUE.rascunho;
}
