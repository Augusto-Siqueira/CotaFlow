// Ordem de embarque da Btech (São José dos Pinhais): tipos, regras e formatação.
// Usado pela janela de lançamento (Programação), pelo PDF e pelo app do motorista.

/** Como o cliente aparece na Programação (client_name da carga). Só ele tem ordem de embarque. */
export const ORDER_CLIENT = "BTECH - S J DOS PINHAIS";

export function hasLoadingOrder(clientName: string | null | undefined): boolean {
  return (clientName ?? "").trim().replace(/\s+/g, " ").toUpperCase() === ORDER_CLIENT;
}

export const ORDER_MAX_LINES = 6;

export interface OrderLine {
  oc: string;
  nature: string;
  compartments: string;
  /** Peso em toneladas. */
  tons: number | null;
  city: string;
  uf: string;
}

export const EMPTY_LINE: OrderLine = { oc: "", nature: "", compartments: "", tons: null, city: "", uf: "" };

/** Produtos conhecidos e a cor da linha no PDF (os demais saem sem cor). */
export const ORDER_NATURES: { value: string; fill: string | null }[] = [
  { value: "BETA BACTER", fill: "#FFFF00" },
  { value: "BETA BACTER 33", fill: "#00B0F0" },
  { value: "SALMEX", fill: null },
];

export function natureFill(nature: string): string | null {
  const n = nature.trim().replace(/\s+/g, " ").toUpperCase();
  return ORDER_NATURES.find((x) => x.value === n)?.fill ?? null;
}

/** Linha vazia = nada preenchido (não vai para a ordem). */
export function isBlankLine(l: OrderLine): boolean {
  return !l.oc.trim() && !l.nature.trim() && !l.compartments.trim() && l.tons === null && !l.city.trim() && !l.uf.trim();
}

/** Aceita "10", "10,5" e "10.500". Devolve toneladas ou null. */
export function parseTons(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** 3 -> "3,000" (como na planilha). */
export function formatTons(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function formatCpf(cpf: string | null | undefined): string {
  const d = (cpf ?? "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (cpf ?? "");
}

/** Sugestão inicial das linhas a partir dos destinos da carga ("Cidade/UF; Cidade/UF"). */
export function linesFromDestination(destination: string | null): OrderLine[] {
  const parts = (destination ?? "")
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, ORDER_MAX_LINES);
  if (parts.length === 0) return [{ ...EMPTY_LINE }];
  return parts.map((p) => {
    const m = p.match(/^(.*?)[\s]*\/[\s]*([A-Za-z]{2})$/);
    return { ...EMPTY_LINE, city: (m ? m[1] : p).toUpperCase(), uf: m ? m[2].toUpperCase() : "" };
  });
}
