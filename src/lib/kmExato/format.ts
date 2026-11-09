// KM Exato — formatação (mesmas convenções do app original).

const nfmt = (v: number, d = 0) =>
  (isFinite(v) ? v : 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export const nf = nfmt;
export const brl = (v: number) => "R$ " + nfmt(Math.abs(v), 2);
/** Valor com sinal: "−R$ 1.234,56" / "+R$ ..." */
export const sbrl = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "—" : (v < 0 ? "−" : v > 0 ? "+" : "") + brl(v);
export const km = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : nfmt(v, 0));
export const skm = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + nfmt(Math.abs(v), 0);
export const pct = (v: number | null | undefined, d = 1) =>
  v == null || !isFinite(v) ? "—" : (v > 0 ? "+" : v < 0 ? "−" : "") + nfmt(Math.abs(v * 100), d) + "%";
export const ton = (kg: number) => (kg > 0 ? nfmt(kg / 1000, 1) + " t" : "—");

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESF = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const monLab = (m: string) => {
  const p = m.split("-");
  return MES[+p[1] - 1] + "/" + p[0].slice(2);
};
export const monFull = (m: string) => {
  const p = m.split("-");
  return MESF[+p[1] - 1] + " de " + p[0];
};
export const dBR = (s: string | null | undefined) => {
  if (!s) return "—";
  const p = String(s).slice(0, 10).split("-");
  return p[2] + "/" + p[1] + "/" + p[0].slice(2);
};

/** Quem o saldo favorece. Negativo = Transbochnia. */
export const favor = (v: number) => (Math.abs(v) < 0.005 ? null : v < 0 ? "Transbochnia" : "Btech");
export const favTxt = (v: number) => {
  const f = favor(v);
  return f ? "a favor da " + f : "zerado";
};

/** Aceita "1.234,5", "1234.5", "1.234" (milhar) — igual ao num() do app. */
export function parseNum(s: unknown): number | null {
  let t = String(s == null ? "" : s).trim();
  if (!t) return null;
  t = t.replace(/[^\d,.\-]/g, "");
  if (t.indexOf(",") > -1) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const v = parseFloat(t);
  return isFinite(v) ? v : null;
}

export const MOTIVOS = [
  "Desvio de rota a pedido do cliente",
  "Entrega ou coleta adicional",
  "Deslocamento da base não previsto",
  "Manutenção ou socorro",
  "Estimativa de km incorreta",
  "Outro",
];
