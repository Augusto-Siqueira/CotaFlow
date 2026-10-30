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

export interface ProofMailData {
  destination: string;
  client_name: string;
  invoice_number: string;
  cte_number?: string | null;
  invoice_weight_kg: number;
  unloaded_weight_kg: number;
}

const esc = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * E-mail do comprovante. O Outlook na web não aceita HTML pelo endereço de
 * "novo e-mail", então o corpo (`html`, com as fotos como texto clicável
 * "Link da imagem N") é copiado para a área de transferência e o usuário cola
 * no corpo; só o assunto vai pelo endereço (`composeUrl`). `text` é o mesmo
 * corpo sem formatação, para quando a cópia rica não for possível.
 */
/** "a@x.com; b@y.com" -> ["a@x.com", "b@y.com"] (só os que parecem e-mail). */
export function parseEmailList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[;,\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

/** Cópia de todo comprovante enviado pelo CotaFlow. */
export const PROOF_EMAIL_CC = ["atendimento@transbochnia.com.br"];

/** Assunto e texto do e-mail enviado pelo CotaFlow (as fotos vão anexadas). */
export function proofEmailDraft(proof: ProofMailData): { subject: string; text: string } {
  const diff = Number(proof.unloaded_weight_kg) - Number(proof.invoice_weight_kg);
  const lines = [
    `Cliente: ${proof.client_name}`,
    `Destino: ${proof.destination || "—"}`,
    `Nota fiscal: ${proof.invoice_number}`,
    ...(proof.cte_number ? [`CTE: ${proof.cte_number}`] : []),
    `Peso da NF: ${formatKg(proof.invoice_weight_kg)} kg`,
    `Peso descarregado: ${formatKg(proof.unloaded_weight_kg)} kg`,
    `Diferença: ${diff > 0 ? "+" : ""}${formatKg(diff)} kg`,
  ];
  return {
    subject: proof.cte_number ? `CANHOTO CTE ${proof.cte_number}` : `CANHOTO NF ${proof.invoice_number}`,
    text: ["Prezados,", "", "Segue o comprovante de entrega:", "", ...lines, "", "Fotos do canhoto e do ticket de pesagem em anexo.", "", "Atenciosamente,", "Transbochnia Transportes"].join("\n"),
  };
}

export function buildProofEmail(proof: ProofMailData, photoLinks: string[], to: string[] = []) {
  const diff = Number(proof.unloaded_weight_kg) - Number(proof.invoice_weight_kg);
  const rows: [string, string][] = [
    ["Cliente", proof.client_name],
    ["Destino", proof.destination || "—"],
    ["Nota fiscal", proof.invoice_number],
    ...(proof.cte_number ? ([["CTE", proof.cte_number]] as [string, string][]) : []),
    ["Peso da NF", `${formatKg(proof.invoice_weight_kg)} kg`],
    ["Peso descarregado", `${formatKg(proof.unloaded_weight_kg)} kg`],
    ["Diferença", `${diff > 0 ? "+" : ""}${formatKg(diff)} kg`],
  ];
  // Assunto no padrão usado pela empresa: "CANHOTO CTE 132275".
  const subject = proof.cte_number
    ? `CANHOTO CTE ${proof.cte_number}`
    : `CANHOTO NF ${proof.invoice_number}`;

  const intro = "Segue o comprovante de entrega:";
  const photosTitle = "Fotos do canhoto e do ticket de pesagem (links válidos por 7 dias):";
  const html =
    `<div>Prezados,<br><br>${intro}<br><br>` +
    rows.map(([k, v]) => `${k}: ${esc(v)}`).join("<br>") +
    (photoLinks.length > 0
      ? `<br><br>${photosTitle}<br>` +
        photoLinks.map((l, i) => `<a href="${esc(l)}">Link da imagem ${i + 1}</a>`).join("<br>")
      : "") +
    "<br><br>Atenciosamente,</div>";
  const text = [
    "Prezados,",
    "",
    intro,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(photoLinks.length > 0
      ? ["", photosTitle, ...photoLinks.map((l, i) => `Imagem ${i + 1}: ${l}`)]
      : []),
    "",
    "Atenciosamente,",
  ].join("\n");

  // Destinatário já preenchido: o e-mail para comprovantes do cadastro do cliente.
  const composeUrl =
    "https://outlook.office.com/mail/deeplink/compose" +
    `?subject=${encodeURIComponent(subject)}` +
    (to.length > 0 ? `&to=${encodeURIComponent(to.join(","))}` : "");
  return { subject, html, text, composeUrl };
}
