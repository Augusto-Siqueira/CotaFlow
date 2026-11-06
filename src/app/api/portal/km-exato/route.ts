import { requireRole, supabaseAdmin } from "@/lib/supabaseAdmin";
import { KmEngine } from "@/lib/kmExato/engine";
import { loadKmState } from "@/lib/kmExato/load";
import { isBtechClient, sanitizeForPortal } from "@/lib/kmExato/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// KM Exato para o portal do cliente.
//   GET /api/portal/km-exato?probe=1 -> { ok: true } se o usuário pode ver (aba no portal)
//   GET /api/portal/km-exato         -> dados já calculados, sem dados internos
// Só passa usuário do perfil cliente ligado a uma empresa BTECH. Os dados são
// lidos com a chave de serviço (o perfil cliente não lê tabela nenhuma) e
// limpos em sanitizeForPortal antes de sair do servidor.
export async function GET(request: Request) {
  const auth = await requireRole(["cliente"], "Acesso restrito ao portal do cliente.");
  if (!auth.ok) return auth.response;

  const admin = supabaseAdmin();
  const { data: links } = await admin.from("client_portal_links").select("client_name").eq("user_id", auth.user.id);
  const allowed = ((links ?? []) as { client_name: string }[]).some((l) => isBtechClient(l.client_name));
  if (!allowed) return Response.json({ error: "Controle de km não disponível para esta empresa." }, { status: 404 });

  if (new URL(request.url).searchParams.get("probe") === "1") {
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { state } = await loadKmState(admin);
    const payload = sanitizeForPortal(new KmEngine(state));
    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("portal km-exato", e);
    return Response.json({ error: "Não foi possível carregar o controle de km." }, { status: 500 });
  }
}
