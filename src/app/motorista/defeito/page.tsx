"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { REPORT_CATEGORIES, SEVERITIES } from "@/lib/maintenance";
import { uploadPhoto } from "@/lib/photos";

const MAX_PHOTOS = 3;

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function RelatarDefeitoPage() {
  const { user, isDriver, loading: authLoading } = useAuth();
  const [plates, setPlates] = useState<{ plate: string; label: string }[]>([]);
  const [plate, setPlate] = useState("");
  const [otherPlate, setOtherPlate] = useState("");
  const [category, setCategory] = useState("Freios");
  const [severity, setSeverity] = useState(2);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user || !isDriver) return;
    supabase
      .from("loading_schedules")
      .select("plate, trailer_plate")
      .eq("schedule_date", localDate(new Date()))
      .then(({ data }) => {
        const list: { plate: string; label: string }[] = [];
        for (const l of (data ?? []) as { plate: string | null; trailer_plate: string | null }[]) {
          if (l.plate && !list.some((p) => p.plate === l.plate))
            list.push({ plate: l.plate, label: `${l.plate} (cavalo)` });
          if (l.trailer_plate && !list.some((p) => p.plate === l.trailer_plate))
            list.push({ plate: l.trailer_plate, label: `${l.trailer_plate} (carreta)` });
        }
        setPlates(list);
        if (list[0]) setPlate((cur) => cur || list[0].plate);
        else setPlate("outra");
      });
  }, [user, isDriver]);

  const chosenPlate = useMemo(
    () =>
      plate === "outra"
        ? otherPlate.trim().replace(/[\s-]/g, "").toUpperCase()
        : plate,
    [plate, otherPlate]
  );

  // Copia os arquivos AGORA: a lista do campo é "viva" e fica vazia assim que o
  // campo é limpo (o que acontece logo depois, no onChange).
  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!chosenPlate) {
      setError("Informe a placa do veículo.");
      return;
    }
    if (description.trim().length < 5) {
      setError("Descreva o que está acontecendo.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const paths: string[] = [];
      for (const f of files) paths.push(await uploadPhoto(user.id, f));
      const { error: err } = await supabase.from("maintenance_reports").insert({
        plate: chosenPlate,
        category,
        severity,
        description: description.trim(),
        source: "motorista",
        photos: paths,
      });
      if (err) {
        setError(
          /foreign key|violates/i.test(err.message)
            ? `A placa ${chosenPlate} não está cadastrada na frota.`
            : `Não foi possível enviar (${err.message}).`
        );
        setSaving(false);
        return;
      }
      setDone(true);
    } catch (ex) {
      setError(
        `Não foi possível enviar. Confira o sinal e tente de novo (${
          ex instanceof Error ? ex.message : "erro"
        }).`
      );
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
        <h1 className="mt-3 text-lg font-semibold text-navy-900">Relato enviado!</h1>
        <p className="mt-1 text-sm text-navy-500">
          A manutenção já foi avisada e vai avaliar. Você acompanha o andamento na tela inicial.
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
      <Link href="/motorista" className="text-sm text-navy-500">
        ← Voltar
      </Link>
      <h1 className="mt-1 text-xl font-semibold text-navy-900">Relatar defeito</h1>

      <div className="mt-4 space-y-4">
        <div>
          <label className={labelCls} htmlFor="d-plate">
            Veículo
          </label>
          <select
            id="d-plate"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            className={fieldCls}
          >
            {plates.map((p) => (
              <option key={p.plate} value={p.plate}>
                {p.label}
              </option>
            ))}
            <option value="outra">Outra placa...</option>
          </select>
          {plate === "outra" && (
            <input
              type="text"
              aria-label="Placa"
              value={otherPlate}
              onChange={(e) => setOtherPlate(e.target.value)}
              className={`${fieldCls} mt-2 uppercase tracking-wide`}
              placeholder="ABC1D23"
            />
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
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-800"
                >
                  📷 Foto {i + 1}
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
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
        {saving ? "Enviando..." : "Enviar relato"}
      </button>
    </form>
  );
}
