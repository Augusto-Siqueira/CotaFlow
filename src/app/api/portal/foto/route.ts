import { requireRole, supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const SOURCE_BUCKET = "driver-photos";
const CLIENT_BUCKET = "client-proofs";

/** Pasta da empresa no armazenamento dos clientes: "BTECH - S J DOS PINHAIS" -> "btech-s-j-dos-pinhais". */
function folderOf(clientName: string): string {
  return (
    clientName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "cliente"
  );
}

// Foto de um comprovante para o portal do cliente.
//   /api/portal/foto?proof=<id>&n=<0..>          -> abre
//   /api/portal/foto?proof=<id>&n=<0..>&download=1 -> baixa
// Só passa se o comprovante for de uma empresa ligada ao usuário. A foto é
// copiada (uma vez) para a pasta da empresa no armazenamento dos clientes, e o
// link entregue é SEMPRE dessa pasta: o cliente nunca recebe link do
// armazenamento interno (check-lists, abastecimentos, defeitos...).
export async function GET(request: Request) {
  const auth = await requireRole(["cliente"], "Acesso restrito ao portal do cliente.");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const proofId = url.searchParams.get("proof") ?? "";
  const n = Number(url.searchParams.get("n") ?? "0");
  const download = url.searchParams.get("download") === "1";
  if (!/^[0-9a-f-]{36}$/i.test(proofId) || !Number.isInteger(n) || n < 0 || n > 20) {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: proof } = await admin
    .from("delivery_proofs")
    .select("id, photos, invoice_number, cte_number, destination, loading_schedules(client_name)")
    .eq("id", proofId)
    .maybeSingle();
  const clientName = (proof?.loading_schedules as unknown as { client_name: string } | null)?.client_name ?? null;
  if (!proof || !clientName) return Response.json({ error: "Comprovante não encontrado." }, { status: 404 });

  const { data: link } = await admin
    .from("client_portal_links")
    .select("client_name")
    .eq("user_id", auth.user.id)
    .eq("client_name", clientName)
    .maybeSingle();
  // Mesmo erro de "não encontrado": não revela que o comprovante existe para outra empresa.
  if (!link) return Response.json({ error: "Comprovante não encontrado." }, { status: 404 });

  const photos = (proof.photos as string[] | null) ?? [];
  const source = photos[n];
  if (!source) return Response.json({ error: "Foto não encontrada." }, { status: 404 });

  const target = `${folderOf(clientName)}/${proof.id}/${n + 1}.jpg`;
  const store = admin.storage.from(CLIENT_BUCKET);

  // Já copiada? Se não, copia agora do armazenamento interno.
  const { data: existing } = await store.list(`${folderOf(clientName)}/${proof.id}`, { search: `${n + 1}.jpg` });
  if (!existing?.some((f) => f.name === `${n + 1}.jpg`)) {
    const { data: blob, error: dlError } = await admin.storage.from(SOURCE_BUCKET).download(source);
    if (dlError || !blob) return Response.json({ error: "Foto indisponível no momento." }, { status: 502 });
    const { error: upError } = await store.upload(target, blob, { contentType: "image/jpeg", upsert: true });
    if (upError) return Response.json({ error: "Foto indisponível no momento." }, { status: 502 });
  }

  const doc = (proof.cte_number || proof.invoice_number || "comprovante").replace(/[^A-Za-z0-9.-]+/g, "_");
  const dest = (proof.destination || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const filename = `comprovante-${doc}${dest ? `-${dest}` : ""}${photos.length > 1 ? `-${n + 1}` : ""}.jpg`;
  const { data: signed } = await store.createSignedUrl(target, 300, download ? { download: filename } : undefined);
  if (!signed?.signedUrl) return Response.json({ error: "Foto indisponível no momento." }, { status: 502 });

  return new Response(null, {
    status: 302,
    headers: { Location: signed.signedUrl, "Cache-Control": "private, no-store" },
  });
}
