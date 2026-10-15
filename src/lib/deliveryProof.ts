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

// Tamanho máximo do endereço do Outlook (navegadores e o Outlook cortam acima disso).
const MAX_MAIL_URL = 1950;

export interface ProofMailData {
  destination: string;
  client_name: string;
  invoice_number: string;
  cte_number?: string | null;
  invoice_weight_kg: number;
  unloaded_weight_kg: number;
}

/**
 * Endereço que abre um e-mail novo, já preenchido, no Outlook na web (conta
 * Microsoft 365). Não anexa arquivos: as fotos vão como links no texto, quantas
 * couberem no limite do endereço. Devolve também quantas ficaram de fora.
 */
export function buildOutlookComposeUrl(
  proof: ProofMailData,
  photoLinks: string[]
): { url: string; omittedPhotos: number } {
  const diff = Number(proof.unloaded_weight_kg) - Number(proof.invoice_weight_kg);
  const head = [
    "Prezados,",
    "",
    "Segue o comprovante de entrega:",
    "",
    `Cliente: ${proof.client_name}`,
    `Destino: ${proof.destination || "—"}`,
    `Nota fiscal: ${proof.invoice_number}`,
    ...(proof.cte_number ? [`CTE: ${proof.cte_number}`] : []),
    `Peso da NF: ${formatKg(proof.invoice_weight_kg)} kg`,
    `Peso descarregado: ${formatKg(proof.unloaded_weight_kg)} kg`,
    `Diferença: ${diff > 0 ? "+" : ""}${formatKg(diff)} kg`,
  ];
  const tail = ["", "Atenciosamente,"];
  // Assunto no padrão usado pela empresa: "CANHOTO CTE 132275".
  const subject = proof.cte_number
    ? `CANHOTO CTE ${proof.cte_number}`
    : `CANHOTO NF ${proof.invoice_number}`;

  const make = (links: string[]) => {
    const lines = [...head];
    if (links.length > 0) {
      lines.push("", "Fotos do canhoto e do ticket de pesagem (links válidos por 7 dias):");
      links.forEach((l, i) => lines.push(`${i + 1}) ${l}`));
    }
    lines.push(...tail);
    return (
      "https://outlook.office.com/mail/deeplink/compose" +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(lines.join("\r\n"))}`
    );
  };

  let used = [...photoLinks];
  let url = make(used);
  while (url.length > MAX_MAIL_URL && used.length > 0) {
    used = used.slice(0, -1);
    url = make(used);
  }
  return { url, omittedPhotos: photoLinks.length - used.length };
}
