"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/photos";
import { parseKg } from "@/lib/deliveryProof";
import { PhotoPicker } from "@/components/PhotoPicker";
import { buttonClasses } from "@/components/Button";

// A equipe (logística e admin) anexa o comprovante de um destino quando o
// motorista não lançou na estrada. Mesmos campos e regras do app do motorista;
// o comprovante fica no nome do motorista da carga e o banco registra quem da
// equipe anexou (migration 0087).

const MAX_PHOTOS = 4;
const BUCKET = "driver-photos";
const fieldCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "mb-1 block text-sm font-medium text-navy-700";

interface Photo {
  blob: Blob;
  url: string;
}

export function AttachProofForm({
  scheduleId,
  destination,
  onSaved,
  onCancel,
}: {
  scheduleId: string;
  destination: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [clientName, setClientName] = useState("");
  const [invoice, setInvoice] = useState("");
  const [cte, setCte] = useState("");
  const [invoiceKg, setInvoiceKg] = useState("");
  const [unloadedKg, setUnloadedKg] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Motorista da carga: o comprovante fica no nome dele (aparece no app dele).
  const [driver, setDriver] = useState<{ name: string; userId: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: load } = await supabase.from("loading_schedules").select("driver").eq("id", scheduleId).maybeSingle();
      const nick = (load?.driver ?? "").trim();
      if (!nick) return;
      const { data: d } = await supabase.from("drivers").select("user_id").eq("nickname", nick).maybeSingle();
      if (alive) setDriver({ name: nick, userId: (d?.user_id as string | null) ?? null });
    })();
    return () => {
      alive = false;
    };
  }, [scheduleId]);

  // Libera as miniaturas ao sair.
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function addFiles(list: FileList | null) {
    if (!list) return;
    try {
      const added: Photo[] = [];
      for (const f of Array.from(list).slice(0, MAX_PHOTOS)) {
        const blob = await compressImage(f);
        added.push({ blob, url: URL.createObjectURL(blob) });
      }
      setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    } catch {
      setError("Não foi possível usar essa foto. Escolha outra.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const invKg = parseKg(invoiceKg);
    const unlKg = parseKg(unloadedKg);
    if (!clientName.trim()) return setError("Informe o nome do cliente.");
    if (!invoice.trim()) return setError("Informe o número da nota fiscal.");
    if (!cte.trim()) return setError("Informe o número do CTE.");
    if (invKg === null) return setError("Informe o peso da nota fiscal, em quilos.");
    if (unlKg === null) return setError("Informe o peso descarregado, em quilos.");
    if (photos.length === 0) return setError("Anexe a foto do canhoto e do ticket de pesagem.");
    setSaving(true);
    setError(null);
    const uploaded: string[] = [];
    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Sessão expirada. Entre de novo.");
      // Fotos na pasta de quem anexou (regra do armazenamento); a equipe lê todas.
      const month = new Date().toISOString().slice(0, 7);
      for (const p of photos) {
        const path = `${uid}/${month}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, p.blob, { contentType: "image/jpeg" });
        if (upErr) throw new Error(`foto: ${upErr.message}`);
        uploaded.push(path);
      }
      const { error: insErr } = await supabase.from("delivery_proofs").insert({
        schedule_id: scheduleId,
        destination,
        client_name: clientName.trim(),
        invoice_number: invoice.trim(),
        cte_number: cte.trim(),
        notes: notes.trim() || null,
        invoice_weight_kg: invKg,
        unloaded_weight_kg: unlKg,
        photos: uploaded,
        user_id: driver?.userId ?? uid,
      });
      if (insErr) {
        throw new Error(
          insErr.code === "23505"
            ? "O motorista acabou de lançar o comprovante deste destino. Feche e abra de novo para ver."
            : insErr.message
        );
      }
      onSaved();
    } catch (ex) {
      // Não deixa foto solta no armazenamento quando o comprovante não foi gravado.
      if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded).catch(() => undefined);
      setError(`Não foi possível anexar: ${ex instanceof Error ? ex.message : "erro"}`);
      setSaving(false);
    }
  }

  const id = `ap-${scheduleId}`;
  return (
    <form onSubmit={submit} className="mt-4 space-y-3 text-sm">
      <p className="text-xs text-navy-500">
        Comprovante anexado pela equipe
        {driver ? <> no nome do motorista <b>{driver.name}</b></> : null}. Fica registrado quem anexou.
      </p>
      <div>
        <label className={labelCls} htmlFor={`${id}-cli`}>Nome do cliente</label>
        <input id={`${id}-cli`} className={fieldCls} value={clientName} onChange={(e) => setClientName(e.target.value)} autoComplete="off" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor={`${id}-nf`}>Nota fiscal</label>
          <input id={`${id}-nf`} inputMode="numeric" className={fieldCls} value={invoice} onChange={(e) => setInvoice(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label className={labelCls} htmlFor={`${id}-cte`}>CTE</label>
          <input id={`${id}-cte`} inputMode="numeric" className={fieldCls} value={cte} onChange={(e) => setCte(e.target.value)} autoComplete="off" />
        </div>
        <div>
          <label className={labelCls} htmlFor={`${id}-pnf`}>Peso da NF (kg)</label>
          <input id={`${id}-pnf`} inputMode="decimal" className={fieldCls} value={invoiceKg} onChange={(e) => setInvoiceKg(e.target.value)} placeholder="32560" />
        </div>
        <div>
          <label className={labelCls} htmlFor={`${id}-pdesc`}>Peso descarregado (kg)</label>
          <input id={`${id}-pdesc`} inputMode="decimal" className={fieldCls} value={unloadedKg} onChange={(e) => setUnloadedKg(e.target.value)} placeholder="32480" />
        </div>
      </div>
      <div>
        <span className={labelCls}>Foto do canhoto e do ticket de pesagem</span>
        {photos.length > 0 && (
          <ul className="mb-2 grid grid-cols-4 gap-2">
            {photos.map((p, i) => (
              <li key={p.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Foto ${i + 1}`} className="h-20 w-full rounded-lg border border-navy-200 object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(p.url);
                    setPhotos((prev) => prev.filter((x) => x.url !== p.url));
                  }}
                  aria-label={`Remover foto ${i + 1}`}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-navy-700 shadow hover:bg-red-50 hover:text-red-700"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {photos.length < MAX_PHOTOS && <PhotoPicker cameraLabel={photos.length === 0 ? "Tirar foto" : "Tirar outra foto"} onFiles={addFiles} />}
        <p className="mt-1 text-xs text-navy-500">Uma foto mostrando os dois, ou uma de cada (até {MAX_PHOTOS}).</p>
      </div>
      <div>
        <label className={labelCls} htmlFor={`${id}-obs`}>Observação</label>
        <textarea id={`${id}-obs`} rows={2} className={fieldCls} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={saving} className={buttonClasses("secondary", "sm")}>
          Cancelar
        </button>
        <button type="submit" disabled={saving} className={`${buttonClasses("primary", "sm")} disabled:cursor-not-allowed`}>
          {saving ? "Enviando..." : "Anexar comprovante"}
        </button>
      </div>
    </form>
  );
}
