import { requireRole, supabaseAdmin } from "@/lib/supabaseAdmin";
import { clientProofFolder } from "@/lib/deliveryProof";

export const runtime = "nodejs";

// Apaga UMA foto de um comprovante de entrega (ex.: o motorista mandou foto
// repetida ou errada). Só quem edita a programação (admin e logística), e o
// comprovante nunca fica sem foto.
//   DELETE /api/comprovantes/<id>/fotos   body: { path: "<caminho da foto>" }
// A foto sai do comprovante e do armazenamento interno (driver-photos), e as
// cópias do portal do cliente (client-proofs/<empresa>/<id>/n.jpg, numeradas
// pela posição) são apagadas para serem refeitas na ordem nova.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(["admin", "logistica"], "Seu perfil não apaga fotos de comprovante.");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Pedido inválido." }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { path?: unknown } | null;
  const path = String(body?.path ?? "");
  if (!path) return Response.json({ error: "Informe a foto." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: proof } = await admin
    .from("delivery_proofs")
    .select("id, photos, loading_schedules(client_name)")
    .eq("id", id)
    .maybeSingle();
  if (!proof) return Response.json({ error: "Comprovante não encontrado." }, { status: 404 });

  const photos = (proof.photos as string[] | null) ?? [];
  if (!photos.includes(path)) return Response.json({ error: "Foto não encontrada neste comprovante." }, { status: 404 });
  if (photos.length <= 1) return Response.json({ error: "O comprovante precisa ficar com pelo menos uma foto." }, { status: 400 });

  const next = photos.filter((p) => p !== path);
  // Só grava se as fotos não mudaram desde a leitura (dois cliques ao mesmo tempo).
  const { data: updated, error: upErr } = await admin
    .from("delivery_proofs")
    .update({ photos: next })
    .eq("id", id)
    .eq("photos", `{${photos.map((p) => `"${p}"`).join(",")}}`)
    .select("id");
  if (upErr) return Response.json({ error: "Não foi possível apagar a foto." }, { status: 500 });
  if (!updated?.length) return Response.json({ error: "O comprovante mudou enquanto isso. Abra de novo." }, { status: 409 });

  await admin.storage.from("driver-photos").remove([path]);
  const clientName = (proof.loading_schedules as unknown as { client_name: string } | null)?.client_name;
  if (clientName) {
    const folder = `${clientProofFolder(clientName)}/${id}`;
    const { data: copies } = await admin.storage.from("client-proofs").list(folder);
    if (copies?.length) await admin.storage.from("client-proofs").remove(copies.map((f) => `${folder}/${f.name}`));
  }

  return Response.json({ ok: true, photos: next });
}
