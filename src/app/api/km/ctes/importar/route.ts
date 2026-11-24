import { requireRole, supabaseAdmin } from "@/lib/supabaseAdmin";
import { ingestXml, retryPending, type IngestResult } from "@/lib/kmExato/cteInbox";

export const runtime = "nodejs";

// KM Btech: recebe XML de CT-e enviados à mão (a mesma leitura do e-mail do
// ERP). Guarda só os da Btech e grava cada um como entrega da viagem em aberto
// da placa. Sem arquivos: só tenta de novo os CT-e que estavam sem viagem.

const MAX_FILES = 100;
const MAX_BYTES = 1_000_000;

export async function POST(request: Request) {
  const auth = await requireRole(["admin", "logistica"], "Seu perfil não importa CT-e.");
  if (!auth.ok) return auth.response;

  let body: { files?: { name?: unknown; xml?: unknown }[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Envio inválido." }, { status: 400 });
  }
  const files = Array.isArray(body.files) ? body.files : [];
  if (files.length > MAX_FILES) return Response.json({ error: `Envie até ${MAX_FILES} XML por vez.` }, { status: 400 });

  const db = supabaseAdmin();
  const results: IngestResult[] = [];
  try {
    for (const f of files) {
      const name = typeof f.name === "string" ? f.name.slice(0, 200) : "arquivo";
      if (typeof f.xml !== "string" || f.xml.length > MAX_BYTES) {
        results.push({ file: name, result: "invalido", reason: "Arquivo vazio ou grande demais." });
        continue;
      }
      results.push({ file: name, ...(await ingestXml(db, f.xml, "manual")) });
    }
    const retried = (await retryPending(db)).filter((r) => r.result === "vinculado");
    return Response.json({ results, retried });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Falha ao importar.", results }, { status: 500 });
  }
}
