import { createTransport } from "nodemailer";
import { requireRole, supabaseAdmin } from "@/lib/supabaseAdmin";
import { PROOF_EMAIL_CC, parseEmailList } from "@/lib/deliveryProof";

export const runtime = "nodejs";

// Envia o comprovante de entrega por e-mail pelo Gmail da empresa, com as fotos
// do canhoto e do ticket ANEXADAS, e cópia fixa para o atendimento.
// Configuração no servidor (Railway, serviço do site): GMAIL_USER e
// GMAIL_APP_PASSWORD (senha de app do Google, nunca a senha normal da conta).
const STAFF = ["admin", "comercial", "logistica", "manutencao", "abastecimento"];

function htmlFromText(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,sans-serif;font-size:14px">${esc.replace(/\n/g, "<br>")}</div>`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(STAFF, "Seu perfil não envia comprovantes.");
  if (!auth.ok) return auth.response;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    return Response.json(
      { error: "Envio de e-mail ainda não configurado no servidor (GMAIL_USER e GMAIL_APP_PASSWORD).", notConfigured: true },
      { status: 503 }
    );
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { to?: unknown; subject?: unknown; text?: unknown } | null;
  const to = parseEmailList(Array.isArray(body?.to) ? body!.to.join(";") : String(body?.to ?? ""));
  const subject = String(body?.subject ?? "").trim();
  const text = String(body?.text ?? "").trim();
  if (to.length === 0) return Response.json({ error: "Informe pelo menos um destinatário válido." }, { status: 400 });
  if (!subject) return Response.json({ error: "Informe o assunto." }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: proof } = await admin
    .from("delivery_proofs")
    .select("id, schedule_id, destination, invoice_number, cte_number, photos")
    .eq("id", id)
    .maybeSingle();
  if (!proof) return Response.json({ error: "Comprovante não encontrado." }, { status: 404 });

  // Fotos do armazenamento interno, anexadas ao e-mail.
  const photos = (proof.photos as string[] | null) ?? [];
  const doc = (proof.cte_number || proof.invoice_number || "comprovante").replace(/[^A-Za-z0-9.-]+/g, "_");
  const dest = (proof.destination || "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  for (let i = 0; i < photos.length; i++) {
    const { data: blob, error } = await admin.storage.from("driver-photos").download(photos[i]);
    if (error || !blob) return Response.json({ error: "Não foi possível ler as fotos do comprovante." }, { status: 502 });
    attachments.push({
      filename: `comprovante-${doc}${dest ? `-${dest}` : ""}${photos.length > 1 ? `-${i + 1}` : ""}.jpg`,
      content: Buffer.from(await blob.arrayBuffer()),
      contentType: "image/jpeg",
    });
  }

  const cc = PROOF_EMAIL_CC.filter((c) => !to.includes(c));
  let messageId: string | null = null;
  try {
    const transport = createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
    const info = await transport.sendMail({
      from: `"Transbochnia - Comprovantes" <${user}>`,
      to,
      cc,
      subject,
      text,
      html: htmlFromText(text),
      attachments,
    });
    messageId = info.messageId ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro";
    return Response.json(
      {
        error: /auth|credentials|password|535/i.test(msg)
          ? "O Gmail recusou o login. Confira GMAIL_USER e a senha de app no Railway."
          : `O e-mail não foi enviado (${msg}).`,
      },
      { status: 502 }
    );
  }

  const name = (auth.user.user_metadata?.name as string | undefined) ?? auth.user.email ?? null;
  const { data: row } = await admin
    .from("delivery_proof_emails")
    .insert({
      proof_id: proof.id,
      schedule_id: proof.schedule_id,
      sent_by: auth.user.id,
      sent_by_name: name,
      to_addresses: to,
      cc_addresses: cc,
      subject,
      attachments: attachments.length,
      message_id: messageId,
    })
    .select("sent_at")
    .single();

  return Response.json({ ok: true, sent_at: row?.sent_at ?? new Date().toISOString(), to, cc, attachments: attachments.length });
}
