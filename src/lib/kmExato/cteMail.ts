import "server-only";
import { ImapFlow, type MessageStructureObject } from "imapflow";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ingestXml, retryPending, type IngestResult } from "./cteInbox";

// KM Btech — leitura do Gmail do ERP. O ERP envia os CT-e (XML + PDF) a partir
// desta conta, então eles ficam nos "Enviados"; lemos a pasta "Todos os e-mails"
// (enviados e recebidos). Só leitura: não apaga, não move, não marca como lido.
// Para não ler duas vezes, km_cte_mail_state guarda o último UID lido.
//
// Variáveis: CTE_GMAIL_USER, CTE_GMAIL_APP_PASSWORD (senha de app, com ou sem
// espaços) e, se precisar, CTE_GMAIL_MAILBOX (outra pasta).

/** Primeira leitura (ou pasta trocada): e-mails dos últimos dias. */
const FIRST_DAYS = 10;
/** E-mails por leitura; o resto fica para a próxima. */
const MAX_MESSAGES = 300;
const LOCK_MINUTES = 10;

export function cteMailConfigured() {
  return Boolean(process.env.CTE_GMAIL_USER && process.env.CTE_GMAIL_APP_PASSWORD);
}

export interface MailRunSummary {
  skipped?: string;
  mailbox?: string;
  emails: number;
  xmls: number;
  counts: Partial<Record<IngestResult["result"], number>>;
  retried: number;
  more: boolean;
  error?: string;
}

interface State {
  mailbox: string | null;
  uid_validity: string | null;
  last_uid: number | null;
}

function xmlParts(node: MessageStructureObject | undefined, out: { part: string; name: string }[] = []) {
  if (!node) return out;
  if (node.childNodes?.length) node.childNodes.forEach((c) => xmlParts(c, out));
  else {
    const name = node.dispositionParameters?.filename || node.parameters?.name || "";
    // MDF-e vem junto nos envios do ERP: não é CT-e, nem baixa.
    if ((/\.xml$/i.test(name) || /xml/i.test(node.type || "")) && !/mdfe/i.test(name)) out.push({ part: node.part || "1", name });
  }
  return out;
}

async function readAll(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(typeof c === "string" ? Buffer.from(c) : (c as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

/** Lê os e-mails novos com XML de CT-e e grava os da Btech. Uma leitura por vez. */
export async function readCteMail(db: SupabaseClient): Promise<MailRunSummary> {
  const summary: MailRunSummary = { emails: 0, xmls: 0, counts: {}, retried: 0, more: false };
  if (!cteMailConfigured()) return { ...summary, skipped: "E-mail do ERP não configurado (CTE_GMAIL_*)." };

  // Trava: outra leitura em andamento (outro processo ou o botão) não roda junto.
  const { data: got, error: lockErr } = await db.rpc("km_cte_mail_lock", { minutes: LOCK_MINUTES });
  if (lockErr) throw new Error("leitura do e-mail: " + lockErr.message);
  if (!Array.isArray(got) || !got.length) return { ...summary, skipped: "Já existe uma leitura em andamento." };
  const st = got[0] as State;

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.CTE_GMAIL_USER!, pass: process.env.CTE_GMAIL_APP_PASSWORD!.replace(/\s+/g, "") },
    logger: false,
  });
  let lastUid = st.last_uid != null ? Number(st.last_uid) : null;
  let validity = st.uid_validity;
  let mailbox = st.mailbox;
  try {
    await client.connect();
    const boxes = await client.list();
    mailbox = process.env.CTE_GMAIL_MAILBOX || boxes.find((b) => b.specialUse === "\\All")?.path || "INBOX";
    summary.mailbox = mailbox;
    const lock = await client.getMailboxLock(mailbox, { readOnly: true });
    try {
      const v = String(client.mailbox && typeof client.mailbox === "object" ? client.mailbox.uidValidity : "");
      const fresh = !lastUid || validity !== v || st.mailbox !== mailbox;
      if (fresh) lastUid = 0;
      validity = v;
      // Só e-mails com anexo .xml (busca do próprio Gmail).
      const found = fresh
        ? await client.search({ since: new Date(Date.now() - FIRST_DAYS * 864e5), gmraw: "filename:xml" }, { uid: true })
        : await client.search({ uid: `${lastUid! + 1}:*`, gmraw: "filename:xml" }, { uid: true });
      const uids = (found || []).filter((u) => u > (lastUid ?? 0)).sort((a, b) => a - b);
      const batch = uids.slice(0, MAX_MESSAGES);
      summary.more = uids.length > batch.length;

      for (const uid of batch) {
        const msg = await client.fetchOne(String(uid), { uid: true, envelope: true, bodyStructure: true }, { uid: true });
        if (msg) {
          summary.emails++;
          for (const p of xmlParts(msg.bodyStructure)) {
            const dl = await client.download(String(uid), p.part, { uid: true });
            const xml = await readAll(dl.content);
            summary.xmls++;
            const r = await ingestXml(db, xml, "email", msg.envelope?.messageId ?? null);
            summary.counts[r.result] = (summary.counts[r.result] ?? 0) + 1;
          }
        }
        lastUid = uid; // e-mail inteiro processado
      }
      // Busca vazia: guarda o ponto atual para não reler os antigos.
      if (fresh && !batch.length) lastUid = Math.max(0, Number(client.mailbox && typeof client.mailbox === "object" ? client.mailbox.uidNext : 1) - 1);
    } finally {
      lock.release();
    }
    summary.retried = (await retryPending(db)).filter((r) => r.result === "vinculado").length;
  } catch (e) {
    summary.error = e instanceof Error ? e.message : String(e);
  } finally {
    await client.logout().catch(() => client.close());
    const at = new Date().toISOString();
    await db
      .from("km_cte_mail_state")
      .update({
        mailbox,
        uid_validity: validity,
        last_uid: lastUid,
        running_until: null,
        last_run_at: at,
        ...(summary.error ? {} : { last_ok_at: at }),
        last_error: summary.error ?? null,
        last_summary: summary,
      })
      .eq("id", 1);
  }
  return summary;
}
