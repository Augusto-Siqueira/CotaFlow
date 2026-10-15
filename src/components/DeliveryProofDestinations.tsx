"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { photoUrl } from "@/lib/photos";
import { buildProofEmail, formatKg } from "@/lib/deliveryProof";
import { splitDestinations } from "@/components/Destinations";
import { Modal } from "@/components/Modal";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";

interface ProofDetail {
  client_name: string;
  invoice_number: string;
  cte_number: string | null;
  invoice_weight_kg: number;
  unloaded_weight_kg: number;
  photos: string[];
  created_at: string;
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
        title={has ? "Comprovante enviado — clique para ver" : "Sem comprovante"}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-left text-xs font-medium ${
          has
            ? "border-transparent bg-teal-200 text-teal-900 hover:brightness-110"
            : "border-amber-400 text-navy-700 hover:bg-amber-50"
        }`}
      >
        {d}
        {has && <span aria-label="comprovante enviado">✓</span>}
      </button>
    );
  };

  return (
    <>
      <span className="hidden print:inline">{dests.join(", ")}</span>
      <span className="print:hidden">
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
              <span className="mt-1.5 flex flex-col items-start gap-1">{dests.map(chip)}</span>
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
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { confirm: askConfirm } = useFeedback();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("delivery_proofs")
        .select("client_name, invoice_number, cte_number, invoice_weight_kg, unloaded_weight_kg, photos, created_at")
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

  async function sendByEmail() {
    if (!proof) return;
    const mail = buildProofEmail({ ...proof, destination }, mailLinks);
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
          {proof && (
            <button
              type="button"
              onClick={sendByEmail}
              disabled={mailLinks.length === 0}
              title="Copia o texto e abre um e-mail novo no Outlook na web"
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
