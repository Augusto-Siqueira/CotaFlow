// Roda uma vez quando o servidor do CotaFlow sobe.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Leitura dos CT-e no Gmail do ERP: só em produção (no localhost, use "Ler e-mails agora").
  if (process.env.NODE_ENV !== "production" || process.env.CTE_GMAIL_POLL === "0") return;
  const { startCteMailPolling } = await import("./lib/kmExato/cteMailPoll");
  startCteMailPolling();
}
