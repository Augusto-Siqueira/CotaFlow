// Catálogo fechado de layouts de PDF por cliente — mantido em sincronia com
// o CHECK constraint clients_pdf_layout_check (ver migration 0034). Fonte
// única pra tela de Clientes e pro gerador de PDF não divergirem.

export const PDF_LAYOUTS = [
  { value: "padrao", label: "Padrão CotaFlow" },
  { value: "kemin", label: "KEMIN" },
] as const;

export type PdfLayout = (typeof PDF_LAYOUTS)[number]["value"];

const LABEL_BY_VALUE = new Map(PDF_LAYOUTS.map((l) => [l.value, l.label]));

export function pdfLayoutLabel(layout: string): string {
  return LABEL_BY_VALUE.get(layout as PdfLayout) ?? layout;
}
