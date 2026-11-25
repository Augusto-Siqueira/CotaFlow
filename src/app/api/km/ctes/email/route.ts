import { requireRole, supabaseAdmin } from "@/lib/supabaseAdmin";
import { cteMailConfigured, readCteMail } from "@/lib/kmExato/cteMail";

export const runtime = "nodejs";
export const maxDuration = 300;

// KM Btech: "Ler e-mails agora" — a mesma leitura que o servidor faz a cada 15 minutos.

export async function POST() {
  const auth = await requireRole(["admin", "logistica"], "Seu perfil não lê os e-mails do ERP.");
  if (!auth.ok) return auth.response;
  if (!cteMailConfigured()) return Response.json({ error: "E-mail do ERP não configurado no servidor (variáveis CTE_GMAIL_*)." }, { status: 503 });
  try {
    const summary = await readCteMail(supabaseAdmin());
    if (summary.error) return Response.json({ error: "Falha ao ler o e-mail: " + summary.error, summary }, { status: 502 });
    return Response.json(summary);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha ao ler o e-mail." }, { status: 500 });
  }
}
