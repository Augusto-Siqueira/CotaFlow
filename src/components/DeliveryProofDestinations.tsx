"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { photoDownloadUrl, photoUrl } from "@/lib/photos";
import { PROOF_EMAIL_CC, buildProofEmail, formatKg, parseEmailList, proofEmailDraft } from "@/lib/deliveryProof";
import { splitDestinations } from "@/components/Destinations";
import { Modal } from "@/components/Modal";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";

interface ProofDetail {
  id: string;
  client_name: string;
  invoice_number: string;
  cte_number: string | null;
  invoice_weight_kg: number;
  unloaded_weight_kg: number;
  photos: string[];
  created_at: string;
  notes: string | null;
}

/**
 * Destinos de uma carga na programação. Cada destino é clicável e abre o
 * comprovante que o motorista lançou no app (✓ = já enviado). Na impressão
 * sai só o texto dos destinos.
 */
export function DeliveryProofDestinations({
  scheduleId,
  destination,
  proofDestinations,
  canDelete,
  onChanged,
}: {
  scheduleId: string;
  destination: string | null;
  /** Destinos desta carga que já têm comprovante. */
  proofDestinations: string[];
  canDelete: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const dests = splitDestinations(destination);
  if (dests.length === 0) return <>—</>;

  const done = dests.filter((d) => proofDestinations.includes(d)).length;
  const chip = (d: string) => {
    const has = proofDestinations.includes(d);
    return (
      <button
        key={d}
        type="button"
        onClick={() => setOpen(d)}
        title={`${d} — ${has ? "comprovante enviado (clique para ver)" : "sem comprovante"}`}
        className={`inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-left text-xs font-medium ${
          has
            ? "border-transparent bg-teal-200 text-teal-900 hover:brightness-110"
            : "border-amber-400 text-navy-700 hover:bg-amber-50"
        }`}
      >
        <span className="truncate">{d}</span>
        {has && <span aria-label="comprovante enviado">✓</span>}
      </button>
    );
  };

  return (
    <>
      <span className="hidden print:inline">{dests.join(", ")}</span>
      <span className="block min-w-0 print:hidden">
        {dests.length === 1 ? (
          chip(dests[0])
        ) : (
          <>
            <button
              type="button"
              aria-expanded={listOpen}
              onClick={() => setListOpen((v) => !v)}
              title={`${dests.length} destinos · ${done} com comprovante`}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${
                done === dests.length
                  ? "border-transparent bg-teal-200 text-teal-900 hover:brightness-110"
                  : "border-amber-400 text-navy-700 hover:bg-amber-50"
              }`}
            >
              Diversos
              <span className="text-[10px] font-normal">
                {done}/{dests.length}
              </span>
              <span aria-hidden="true" className="text-[10px]">
                {listOpen ? "▲" : "▼"}
              </span>
            </button>
            {listOpen && (
              <span className="mt-1.5 flex min-w-0 flex-col items-start gap-1">{dests.map(chip)}</span>
            )}
          </>
        )}
      </span>
      {open !== null && (
        <ProofModal
          scheduleId={scheduleId}
          destination={open}
          canDelete={canDelete}
          onClose={() => setOpen(null)}
          onChanged={onChanged}
        />
      )}
    </>
  );
}

function ProofModal({
  scheduleId,
  destination,
  canDelete,
  onClose,
  onChanged,
}: {
  scheduleId: string;
  destination: string;
  canDelete: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [proof, setProof] = useState<ProofDetail | null | undefined>(undefined);
  const [photos, setPhotos] = useState<string[]>([]);
  // Links de 7 dias para o e-mail (os de 1 h acima são só para a tela).
  const [mailLinks, setMailLinks] = useState<string[]>([]);
  const [mailNote, setMailNote] = useState<string | null>(null);
  // E-mail para comprovantes do cliente da carga (cadastro de clientes).
  const [mailTo, setMailTo] = useState<string[]>([]);
  // Envio direto pelo CotaFlow (Gmail), com as fotos anexadas.
  const [compose, setCompose] = useState<{ to: string; subject: string; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState<{ text: string; notConfigured?: boolean } | null>(null);
  const [lastSent, setLastSent] = useState<{ sent_at: string; to_addresses: string[]; sent_by_name: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { confirm: askConfirm } = useFeedback();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("delivery_proofs")
        .select("id, client_name, invoice_number, cte_number, invoice_weight_kg, unloaded_weight_kg, photos, created_at, notes")
        .eq("schedule_id", scheduleId)
        .eq("destination", destination)
        .maybeSingle();
      if (cancelled) return;
      if (err) setError(err.message);
      const p = (data as ProofDetail | null) ?? null;
      setProof(p);
      if (p) {
        const urls = await Promise.all(p.photos.map((x) => photoUrl(x)));
        if (!cancelled) setPhotos(urls.filter((u): u is string => Boolean(u)));
        const long = await Promise.all(p.photos.map((x) => photoUrl(x, 7 * 24 * 3600)));
        if (!cancelled) setMailLinks(long.filter((u): u is string => Boolean(u)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scheduleId, destination]);

  // Cliente da carga -> e-mail para comprovantes do cadastro (nome fantasia ou razão social).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: load } = await supabase.from("loading_schedules").select("client_name").eq("id", scheduleId).maybeSingle();
      const name = (load?.client_name ?? "").trim();
      if (!name) return;
      const { data: rows } = await supabase
        .from("clients")
        .select("name, trade_name, proof_email")
        .or(`trade_name.eq."${name.replace(/"/g, "")}",name.eq."${name.replace(/"/g, "")}"`);
      const found = ((rows ?? []) as { name: string; trade_name: string | null; proof_email: string | null }[]).find(
        (c) => (c.trade_name ?? "").trim() === name || c.name.trim() === name
      );
      if (!cancelled) setMailTo(parseEmailList(found?.proof_email));
    })();
    return () => {
      cancelled = true;
    };
  }, [scheduleId]);

  async function remove() {
    if (!(await askConfirm("Apagar este comprovante? O motorista poderá lançar de novo."))) return;
    setDeleting(true);
    const { error: err } = await supabase
      .from("delivery_proofs")
      .delete()
      .eq("schedule_id", scheduleId)
      .eq("destination", destination);
    setDeleting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onChanged();
    onClose();
  }

  // Baixa as fotos do canhoto/ticket (uma por vez, com nome de arquivo identificável).
  async function download() {
    if (!proof) return;
    setDownloading(true);
    const base = `comprovante-${(proof.cte_number || proof.invoice_number || "entrega").replace(/[^A-Za-z0-9.-]+/g, "_")}-${destination
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")}`;
    for (let i = 0; i < proof.photos.length; i++) {
      const name = `${base}${proof.photos.length > 1 ? `-${i + 1}` : ""}.jpg`;
      const url = await photoDownloadUrl(proof.photos[i], name);
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Pequena pausa: o navegador ignora downloads disparados todos no mesmo instante.
        await new Promise((r) => setTimeout(r, 400));
      }
    }
    setDownloading(false);
  }

  // Último envio deste comprovante pelo CotaFlow.
  useEffect(() => {
    if (!proof) return;
    let cancelled = false;
    supabase
      .from("delivery_proof_emails")
      .select("sent_at, to_addresses, sent_by_name")
      .eq("proof_id", proof.id)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setLastSent(data as typeof lastSent);
      });
    return () => {
      cancelled = true;
    };
  }, [proof]);

  function openCompose() {
    if (!proof) return;
    const draft = proofEmailDraft({ ...proof, destination });
    setComposeError(null);
    setCompose({ to: mailTo.join("; "), subject: draft.subject, text: draft.text });
  }

  async function sendDirect() {
    if (!proof || !compose) return;
    const to = parseEmailList(compose.to);
    if (to.length === 0) {
      setComposeError({ text: "Informe pelo menos um destinatário válido." });
      return;
    }
    setSending(true);
    setComposeError(null);
    const r = await fetch(`/api/comprovantes/${proof.id}/email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to, subject: compose.subject, text: compose.text }),
    });
    const res = await r.json().catch(() => ({}));
    setSending(false);
    if (!r.ok) {
      setComposeError({ text: res.error ?? `Erro ${r.status}`, notConfigured: Boolean(res.notConfigured) });
      return;
    }
    setCompose(null);
    setLastSent({ sent_at: res.sent_at, to_addresses: res.to, sent_by_name: null });
    setMailNote(`E-mail enviado para ${res.to.join(", ")} (cópia: ${res.cc.join(", ") || "—"}), com ${res.attachments} ${res.attachments === 1 ? "foto anexada" : "fotos anexadas"}.`);
  }

  async function sendByEmail() {
    if (!proof) return;
    const mail = buildProofEmail({ ...proof, destination }, mailLinks, mailTo);
    // Copia o corpo formatado (link clicável) e abre o e-mail novo só com o
    // assunto: o usuário cola o corpo com Ctrl+V.
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([mail.html], { type: "text/html" }),
          "text/plain": new Blob([mail.text], { type: "text/plain" }),
        }),
      ]);
      setMailNote("Texto do e-mail copiado. No Outlook, clique no corpo da mensagem e cole (Ctrl+V).");
    } catch {
      setMailNote("Não foi possível copiar o texto automaticamente. Copie os dados desta janela e cole no e-mail.");
    }
    window.open(mail.composeUrl, "_blank", "noopener");
  }

  const diff = proof ? Number(proof.unloaded_weight_kg) - Number(proof.invoice_weight_kg) : 0;

  return (
    <Modal onClose={onClose} labelledBy="proof-title" className="max-w-xl">
      <h2 id="proof-title" className="text-base font-medium">
        Comprovante de entrega · {destination}
      </h2>
      {error && (
        <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {proof === undefined ? (
        <p className="mt-3 text-sm text-navy-500">Carregando...</p>
      ) : proof === null ? (
        <p className="mt-3 text-sm text-navy-500">
          O motorista ainda não lançou o comprovante deste destino.
        </p>
      ) : (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Cliente" value={proof.client_name} />
            <Field label="Nota fiscal" value={proof.invoice_number} />
            <Field label="CTE" value={proof.cte_number || "—"} />
            <Field label="Peso da NF" value={`${formatKg(proof.invoice_weight_kg)} kg`} />
            <Field label="Peso descarregado" value={`${formatKg(proof.unloaded_weight_kg)} kg`} />
            <Field
              label="Diferença"
              value={`${diff > 0 ? "+" : ""}${formatKg(diff)} kg`}
              tone={diff === 0 ? undefined : diff < 0 ? "text-red-700" : "text-amber-700"}
            />
            <Field
              label="Lançado em"
              value={new Date(proof.created_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            />
          </dl>
          {proof.notes?.trim() && (
            <div className="mt-4">
              <span className="text-[11px] uppercase text-navy-500">Observação do motorista</span>
              <p className="mt-0.5 whitespace-pre-line text-sm text-navy-900">{proof.notes}</p>
            </div>
          )}
          <div className="mt-4">
            <span className="text-[11px] uppercase text-navy-500">
              Fotos (canhoto e ticket)
            </span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {photos.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Foto do comprovante"
                    className="h-44 w-full rounded-lg border border-navy-200 object-cover"
                  />
                </a>
              ))}
              {photos.length === 0 && (
                <p className="col-span-2 text-sm text-navy-500">Carregando fotos...</p>
              )}
            </div>
          </div>
        </>
      )}
      {lastSent && !compose && (
        <p className="mt-3 text-xs text-navy-500">
          ✉ Último envio pelo CotaFlow: {new Date(lastSent.sent_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          {lastSent.sent_by_name ? ` por ${lastSent.sent_by_name}` : ""} para {lastSent.to_addresses.join(", ")}.
        </p>
      )}
      {compose && (
        <div className="mt-4 space-y-2 rounded-lg border border-navy-200 p-3 text-sm">
          <div>
            <label htmlFor="pe-to" className="mb-1 block text-xs font-medium text-navy-600">
              Para
            </label>
            <input
              id="pe-to"
              value={compose.to}
              onChange={(e) => setCompose({ ...compose, to: e.target.value })}
              placeholder="email@cliente.com.br; outro@cliente.com.br"
              className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {mailTo.length === 0 && (
              <p className="mt-1 text-xs text-amber-700">Este cliente não tem e-mail para comprovantes no cadastro: digite o destinatário.</p>
            )}
          </div>
          <p className="text-xs text-navy-500">Cópia: {PROOF_EMAIL_CC.join(", ")}</p>
          <div>
            <label htmlFor="pe-subject" className="mb-1 block text-xs font-medium text-navy-600">
              Assunto
            </label>
            <input
              id="pe-subject"
              value={compose.subject}
              onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
              className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="pe-text" className="mb-1 block text-xs font-medium text-navy-600">
              Mensagem
            </label>
            <textarea
              id="pe-text"
              rows={9}
              value={compose.text}
              onChange={(e) => setCompose({ ...compose, text: e.target.value })}
              className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <p className="text-xs text-navy-500">
            📎 {proof?.photos.length ?? 0} {(proof?.photos.length ?? 0) === 1 ? "foto anexada" : "fotos anexadas"} (canhoto e ticket).
          </p>
          {composeError && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {composeError.text}
              {composeError.notConfigured && (
                <button type="button" onClick={sendByEmail} className="ml-1 font-medium underline">
                  Abrir no Outlook sem anexo
                </button>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCompose(null)} className={buttonClasses("secondary", "sm")}>
              Cancelar
            </button>
            <button type="button" onClick={sendDirect} disabled={sending} className={`${buttonClasses("primary", "sm")} disabled:cursor-not-allowed`}>
              {sending ? "Enviando..." : "Enviar"}
            </button>
          </div>
        </div>
      )}
      {mailNote && (
        <div role="status" className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
          {mailNote}
        </div>
      )}
      <div className="mt-5 flex flex-wrap justify-between gap-2">
        {canDelete && proof ? (
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            className={buttonClasses("danger")}
          >
            {deleting ? "Apagando..." : "Apagar comprovante"}
          </button>
        ) : (
          <span />
        )}
        <span className="flex gap-2">
          {proof && proof.photos.length > 0 && (
            <button
              type="button"
              onClick={download}
              disabled={downloading}
              title="Baixa a foto do canhoto e do ticket de pesagem"
              className={buttonClasses("soft")}
            >
              {downloading ? "Baixando..." : proof.photos.length > 1 ? `Baixar (${proof.photos.length} fotos)` : "Baixar"}
            </button>
          )}
          {proof && (
            <button
              type="button"
              onClick={openCompose}
              disabled={Boolean(compose)}
              title={
                mailTo.length > 0
                  ? `Envia com as fotos anexadas para ${mailTo.join(", ")} (cópia: ${PROOF_EMAIL_CC.join(", ")})`
                  : "Envia com as fotos anexadas (cliente sem e-mail para comprovantes no cadastro: digite o destinatário)"
              }
              className={buttonClasses("soft")}
            >
              Enviar por e-mail
            </button>
          )}
          <button type="button" onClick={onClose} className={buttonClasses("secondary")}>
            Fechar
          </button>
        </span>
      </div>
    </Modal>
  );
}

function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase text-navy-500">{label}</dt>
      <dd className={`font-medium ${tone ?? "text-navy-900"}`}>{value}</dd>
    </div>
  );
}
