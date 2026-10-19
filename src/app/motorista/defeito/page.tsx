"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { REPORT_CATEGORIES, SEVERITIES } from "@/lib/maintenance";
import { compressImage } from "@/lib/photos";
import { SearchSelect, type SearchOption } from "@/components/SearchSelect";
import { loadPlateOptions } from "@/lib/offline/plates";
import { agoLabel } from "@/lib/offline/refdata";
import { enqueue, getOutboxItem, newPhotoPath, reviseItem, syncNow, type OutboxItem, type OutboxPhoto } from "@/lib/offline/outbox";
import { useOffline } from "@/lib/offline/OfflineProvider";

const MAX_PHOTOS = 3;
const SEND_WAIT_MS = 12000;

export default function RelatarDefeitoPage() {
  const { user, isDriver, loading: authLoading } = useAuth();
  // Placas de hoje primeiro (com o papel na carga), depois o resto da frota.
  const [plateOptions, setPlateOptions] = useState<SearchOption[]>([]);
  const [plate, setPlate] = useState("");
  const [category, setCategory] = useState("Freios");
  const [severity, setSeverity] = useState(2);
  const [description, setDescription] = useState("");
  const { offline } = useOffline();
  const [files, setFiles] = useState<OutboxPhoto[]>([]);
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [redo, setRedo] = useState<OutboxItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"sent" | "saved" | null>(null);

  useEffect(() => {
    if (!user || !isDriver) return;
    loadPlateOptions(user.id)
      .then((r) => {
        setPlateOptions(r.options);
        setStaleAt(r.stale ? r.at : null);
        if (r.options[0]) setPlate((cur) => cur || r.options[0].value);
      })
      .catch(() => {});
  }, [user, isDriver]);

  // Abriu pelo botão "Corrigir e lançar de novo" da fila de envio.
  useEffect(() => {
    if (!user) return;
    const id = new URLSearchParams(window.location.search).get("refazer");
    if (!id) return;
    getOutboxItem(id).then((item) => {
      if (!item || item.userId !== user.id || item.kind !== "defect") return;
      const p = item.payload as Record<string, unknown>;
      setRedo(item);
      setPlate(String(p.plate ?? ""));
      setCategory(String(p.category ?? "Freios"));
      setSeverity(Number(p.severity) || 2);
      setDescription(String(p.description ?? ""));
      setFiles(item.photos);
    });
  }, [user]);

  const chosenPlate = useMemo(() => plate.trim().replace(/[\s-]/g, "").toUpperCase(), [plate]);
  const knownPlate =
    plateOptions.length === 0 || plateOptions.some((o) => o.value === chosenPlate);

  // Reduz a foto agora (a câmera gera vários MB) e já define o nome com que ela vai subir.
  async function addFiles(list: FileList | null) {
    if (!list || !user) return;
    const picked = Array.from(list);
    try {
      const added: OutboxPhoto[] = [];
      for (const f of picked) added.push({ path: newPhotoPath(user.id), blob: await compressImage(f) });
      setFiles((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    } catch {
      setError("Não foi possível usar essa foto. Tire outra.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!chosenPlate) {
      setError("Informe a placa do veículo.");
      return;
    }
    if (!knownPlate) {
      setError(`A placa ${chosenPlate} não está cadastrada na frota. Escolha uma da lista.`);
      return;
    }
    if (description.trim().length < 5) {
      setError("Descreva o que está acontecendo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = redo?.id ?? crypto.randomUUID();
      const payload = {
        id,
        plate: chosenPlate,
        category,
        severity,
        description: description.trim(),
        source: "motorista",
        photos: files.map((f) => f.path),
        reported_at: redo ? (redo.payload.reported_at as string) : new Date().toISOString(),
      };
      const summary = `Defeito · ${category} · ${chosenPlate}`;
      if (redo) await reviseItem(id, { summary, payload, photos: files });
      else await enqueue({ id, userId: user.id, kind: "defect", createdAt: Date.now(), summary, driverName: null, payload, photos: files });
      await Promise.race([syncNow(user.id, true), new Promise((r) => setTimeout(r, SEND_WAIT_MS))]);
      const left = await getOutboxItem(id);
      if (left?.status === "rejected") {
        setError(`O servidor não aceitou este relato: ${left.reason} Corrija e envie de novo. A equipe foi avisada.`);
        setSaving(false);
        return;
      }
      if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
      setDone(left ? "saved" : "sent");
    } catch (ex) {
      setError(`Não foi possível salvar no celular (${ex instanceof Error ? ex.message : "erro"}). Libere espaço e tente de novo.`);
    }
    setSaving(false);
  }

  if (authLoading) return null;
  if (!isDriver) return null;

  if (done) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-10 text-center">
        <div className="text-5xl" aria-hidden="true">
          ✅
        </div>
        <h1 className="mt-3 text-lg font-semibold text-navy-900">
          {done === "sent" ? "Relato enviado!" : "Relato salvo no celular"}
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          {done === "sent"
            ? "A manutenção já foi avisada e vai avaliar. Você acompanha o andamento na tela inicial."
            : "Será enviado para a manutenção assim que houver sinal. Você acompanha na tela inicial."}
        </p>
        <Link
          href="/motorista"
          className="mt-6 inline-block rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Voltar ao início
        </Link>
      </div>
    );
  }

  const fieldCls =
    "w-full rounded-lg border border-navy-300 bg-white px-3 py-2.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
  const labelCls = "mb-1.5 block text-sm font-medium text-navy-700";

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <ButtonLink href="/motorista" variant="secondary" size="sm" aria-label="Voltar para Voltar">Voltar</ButtonLink>
      <h1 className="mt-3 text-xl font-semibold text-navy-900">Relatar defeito</h1>
      {staleAt && <p className="mt-1 text-xs text-amber-700">Dados guardados no celular ({agoLabel(staleAt)}).</p>}
      {redo && (
        <div role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Corrigindo um relato recusado: {redo.reason}
        </div>
      )}

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelCls} htmlFor="d-plate">
            Veículo
          </label>
          <SearchSelect
            id="d-plate"
            value={plate}
            onChange={(v) => setPlate(v.toUpperCase())}
            options={plateOptions}
            placeholder="Digite a placa"
            className={`${fieldCls} uppercase tracking-wide`}
          />
          {chosenPlate.length >= 7 && !knownPlate && (
            <p className="mt-1 text-xs text-red-600">Placa não cadastrada. Escolha uma da lista.</p>
          )}
        </div>

        <div>
          <span className={labelCls}>Qual é o problema?</span>
          <div className="grid grid-cols-4 gap-2">
            {REPORT_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`rounded-lg border px-1 py-2.5 text-xs font-medium transition-colors ${
                  category === c
                    ? "border-transparent bg-brand-200 text-brand-900 ring-2 ring-brand-600"
                    : "border-navy-300 text-navy-700 hover:bg-navy-50"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={labelCls}>Gravidade</span>
          <div className="grid grid-cols-3 gap-2">
            {SEVERITIES.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={severity === s.value}
                onClick={() => setSeverity(s.value)}
                className={`rounded-lg border px-2 py-2.5 text-center text-sm font-medium transition-colors ${
                  severity === s.value
                    ? `${s.badge} border-transparent ring-2 ring-brand-600`
                    : "border-navy-300 text-navy-700 hover:bg-navy-50"
                }`}
              >
                {s.label}
                <span className="block text-[11px] font-normal opacity-80">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="d-desc">
            Descreva o que está acontecendo
          </label>
          <textarea
            id="d-desc"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={fieldCls}
            placeholder="Ex.: barulho no freio quando piso com o caminhão carregado"
          />
        </div>

        <div>
          <span className={labelCls}>
            Fotos <span className="font-normal text-navy-500">(até {MAX_PHOTOS})</span>
          </span>
          {files.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li
                  key={f.path}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-800"
                >
                  📷 Foto {i + 1}
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((x) => x.path !== f.path))}
                    aria-label={`Remover foto ${i + 1}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand-200"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {files.length < MAX_PHOTOS && (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-navy-300 px-3 py-3 text-sm font-medium text-navy-700 hover:border-brand-500">
              📷 Tirar foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="mt-5 w-full rounded-lg bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {saving ? "Salvando..." : redo ? "Enviar correção" : offline ? "Salvar (envia quando tiver sinal)" : "Enviar relato"}
      </button>
    </form>
  );
}
