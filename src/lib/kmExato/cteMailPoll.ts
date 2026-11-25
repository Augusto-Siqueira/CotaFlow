import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cteMailConfigured, readCteMail } from "./cteMail";

// Leitura automática do Gmail do ERP a cada 15 minutos, dentro do próprio
// servidor do CotaFlow (iniciada em src/instrumentation.ts, só em produção).
// A trava em km_cte_mail_state impede duas leituras ao mesmo tempo.

const EVERY_MS = 15 * 60e3;
const FIRST_MS = 60e3;

const g = globalThis as { __cteMailPoll?: boolean };

export function startCteMailPolling() {
  if (g.__cteMailPoll || !cteMailConfigured()) return;
  g.__cteMailPoll = true;
  const run = async () => {
    try {
      const s = await readCteMail(supabaseAdmin());
      if (s.error) console.error("[CT-e e-mail]", s.error);
      else if (s.xmls) console.log(`[CT-e e-mail] ${s.emails} e-mails, ${s.xmls} XML`, JSON.stringify(s.counts));
    } catch (e) {
      console.error("[CT-e e-mail]", e instanceof Error ? e.message : e);
    }
  };
  setTimeout(() => {
    void run();
    setInterval(() => void run(), EVERY_MS);
  }, FIRST_MS);
}
