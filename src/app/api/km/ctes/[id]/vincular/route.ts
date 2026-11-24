import { requireRole, supabaseAdmin } from "@/lib/supabaseAdmin";
import { linkToTrip, loadInboxRow } from "@/lib/kmExato/cteInbox";

export const runtime = "nodejs";

// KM Btech: a equipe escolhe a viagem de um CT-e que ficou sem viagem.

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "logistica"], "Seu perfil não vincula CT-e.");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  let tripId: unknown;
  try {
    tripId = (await request.json()).tripId;
  } catch {
    return Response.json({ error: "Envio inválido." }, { status: 400 });
  }
  if (typeof tripId !== "string" || !/^[0-9a-f-]{36}$/i.test(tripId)) return Response.json({ error: "Escolha a viagem." }, { status: 400 });

  const db = supabaseAdmin();
  try {
    const row = await loadInboxRow(db, id);
    if (!row) return Response.json({ error: "CT-e não encontrado." }, { status: 404 });
    if (row.status !== "sem_viagem" && row.status !== "descartado") return Response.json({ error: "Este CT-e já está vinculado ou cancelado." }, { status: 409 });
    const { data: trip } = await db.from("km_trips").select("id, status").eq("id", tripId).maybeSingle();
    if (!trip || trip.status === "cancelada") return Response.json({ error: "Viagem não encontrada." }, { status: 404 });
    const u = auth.user;
    const byName = ((u.user_metadata?.name as string | undefined) ?? u.email ?? "equipe") || "equipe";
    await linkToTrip(db, row, tripId, byName, "vinculado à mão");
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha ao vincular." }, { status: 500 });
  }
}
