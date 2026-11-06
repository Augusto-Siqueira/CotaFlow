import { createTransport } from "nodemailer";
import { requireRole, supabaseAdmin } from "@/lib/supabaseAdmin";
import { PROOF_EMAIL_CC, parseEmailList, proofEmailDraft } from "@/lib/deliveryProof";

export const runtime = "nodejs";

// Envia o comprovante de entrega por e-mail pelo Gmail da empresa, com as fotos
// do canhoto e do ticket ANEXADAS, e cópia fixa para o atendimento.
// Configuração no servidor (Railway, serviço do site): GMAIL_USER e
// GMAIL_APP_PASSWORD (senha de app do Google, nunca a senha normal da conta).
const STAFF = ["admin", "comercial", "logistica", "manutencao", "abastecimento"];

// O cliente do portal também envia, mas com travas no servidor: só comprovante
// das empresas ligadas a ele, SEMPRE para o e-mail de comprovantes do cadastro
// do cliente (não escolhe destinatário) e com o assunto/texto padrão.
type Admin = ReturnType<typeof supabaseAdmin>;

async function clientProofEmails(admin: Admin, clientName: string): Promise<string[]> {
  const name = clientName.trim();
  if (!name) return [];
  const { data } = await admin.from("clients").select("name, trade_name, proof_email");
  const found = ((data ?? []) as { name: string; trade_name: string | null; proof_email: string | null }[]).find(
    (c) => (c.trade_name ?? "").trim() === name || c.name.trim() === name
  );
  return parseEmailList(found?.proof_email);
}

async function portalCanSee(admin: Admin, userId: string, clientName: string) {
  const { data } = await admin.from("client_portal_links").select("client_name").eq("user_id", userId).eq("client_name", clientName).maybeSingle();
  return Boolean(data);
}

/** Para o portal: para quem o comprovante vai e quando foi o último envio. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole([...STAFF, "cliente"], "Seu perfil não envia comprovantes.");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const admin = supabaseAdmin();
  const { data: proof } = await admin.from("delivery_proofs").select("id, loading_schedules(client_name)").eq("id", id).maybeSingle();
  const clientName = (proof?.loading_schedules as unknown as { client_name: string } | null)?.client_name ?? "";
  if (!proof || (auth.user.app_metadata?.role === "cliente" && !(await portalCanSee(admin, auth.user.id, clientName)))) {
    return Response.json({ error: "Comprovante não encontrado." }, { status: 404 });
  }
  const to = await clientProofEmails(admin, clientName);
  const { data: last } = await admin
    .from("delivery_proof_emails")
    .select("sent_at, to_addresses")
    .eq("proof_id", id)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Response.json(
    { to, cc: PROOF_EMAIL_CC.filter((c) => !to.includes(c)), lastSent: last ?? null, configured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function htmlFromText(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:Arial,sans-serif;font-size:14px">${esc.replace(/\n/g, "<br>")}</div>`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole([...STAFF, "cliente"], "Seu perfil não envia comprovantes.");
  if (!auth.ok) return auth.response;
  const isPortal = auth.user.app_metadata?.role === "cliente";

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

  const admin = supabaseAdmin();
  const { data: proof } = await admin
    .from("delivery_proofs")
    .select("id, schedule_id, destination, client_name, invoice_number, cte_number, invoice_weight_kg, unloaded_weight_kg, photos, loading_schedules(client_name)")
    .eq("id", id)
    .maybeSingle();
  if (!proof) return Response.json({ error: "Comprovante não encontrado." }, { status: 404 });

  let to: string[];
  let subject: string;
  let text: string;
  if (isPortal) {
    const company = (proof.loading_schedules as unknown as { client_name: string } | null)?.client_name ?? "";
    if (!(await portalCanSee(admin, auth.user.id, company))) return Response.json({ error: "Comprovante não encontrado." }, { status: 404 });
    to = await clientProofEmails(admin, company);
    if (to.length === 0) {
      return Response.json({ error: "Esta empresa não tem e-mail de comprovantes cadastrado. Fale com a Transbochnia." }, { status: 400 });
    }
    ({ subject, text } = proofEmailDraft({
      destination: proof.destination,
      client_name: proof.client_name,
      invoice_number: proof.invoice_number,
      cte_number: proof.cte_number,
      invoice_weight_kg: proof.invoice_weight_kg,
      unloaded_weight_kg: proof.unloaded_weight_kg,
    }));
  } else {
    to = parseEmailList(Array.isArray(body?.to) ? body!.to.join(";") : String(body?.to ?? ""));
    subject = String(body?.subject ?? "").trim();
    text = String(body?.text ?? "").trim();
    if (to.length === 0) return Response.json({ error: "Informe pelo menos um destinatário válido." }, { status: 400 });
    if (!subject) return Response.json({ error: "Informe o assunto." }, { status: 400 });
  }

  // Fotos do armazenamento interno, anexadas ao e-mail.
  const photos = (proof.photos as string[] | null) ?? [];
  // Nome do anexo = número da nota fiscal digitado pelo motorista (só o número).
  const nf = String(proof.invoice_number ?? "").trim().replace(/[\/:*?"<>|\s]+/g, "") || "comprovante";
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
  for (let i = 0; i < photos.length; i++) {
    const { data: blob, error } = await admin.storage.from("driver-photos").download(photos[i]);
    if (error || !blob) return Response.json({ error: "Não foi possível ler as fotos do comprovante." }, { status: 502 });
    attachments.push({
      // Mais de uma foto: a primeira leva só o número; as outras, "-2", "-3"...
      filename: `${nf}${i > 0 ? `-${i + 1}` : ""}.jpg`,
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

  const who = (auth.user.user_metadata?.name as string | undefined) ?? auth.user.email ?? null;
  const name = isPortal && who ? `${who} (portal do cliente)` : who;
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
