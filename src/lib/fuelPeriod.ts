// Filtro de período do abastecimento (mesmo nas telas de lançamentos e dashboard).

export type Preset = "mes" | "mes_anterior" | "3meses" | "personalizado";

export const PRESET_OPTIONS: { value: Preset; label: string }[] = [
  { value: "mes", label: "Este mês" },
  { value: "mes_anterior", label: "Mês anterior" },
  { value: "3meses", label: "Últimos 3 meses" },
  { value: "personalizado", label: "Personalizado" },
];

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Dias (de/até, ambos incluídos) de cada período pronto. */
export function presetRange(p: Exclude<Preset, "personalizado">): { from: string; to: string } {
  const now = new Date();
  if (p === "mes") return { from: isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDay(now) };
  if (p === "mes_anterior") {
    return {
      from: isoDay(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: isoDay(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  return { from: isoDay(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to: isoDay(now) };
}

/** Dias (de/até) -> intervalo [início, fim) em horário local. */
export function dayRange(from: string, to: string): { start: Date; end: Date } {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return { start: new Date(fy, fm - 1, fd), end: new Date(ty, tm - 1, td + 1) };
}
