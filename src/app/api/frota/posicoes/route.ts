import { requireRole } from "@/lib/supabaseAdmin";
import { a52Configured, fleetPositions } from "@/lib/a52";

export const runtime = "nodejs";

// Posição atual da frota (rastreador Maxtrack, via API da A52) para o Mapa da
// frota. Só a equipe interna; o login da A52 fica no servidor.
export async function GET() {
  const auth = await requireRole(["admin", "logistica", "comercial", "manutencao"], "Seu perfil não vê o mapa da frota.");
  if (!auth.ok) return auth.response;
  if (!a52Configured()) {
    return Response.json(
      { error: "Rastreador não configurado no servidor (A52_API_URL, A52_USERNAME e A52_PASSWORD)." },
      { status: 503 }
    );
  }
  try {
    const positions = await fleetPositions();
    return Response.json({ positions, fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha ao consultar o rastreador." }, { status: 502 });
  }
}
