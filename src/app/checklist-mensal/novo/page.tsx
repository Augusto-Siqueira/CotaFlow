"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { uploadPhoto } from "@/lib/photos";
import { ButtonLink, buttonClasses } from "@/components/Button";
import { SearchSelect } from "@/components/SearchSelect";
import { SignaturePad } from "@/components/SignaturePad";
import { FLEET_KINDS, normalizePlate, type FleetCertFields } from "@/lib/fleet";
import {
  CERT_LABEL,
  MONTHLY_CREATES_DEFECTS,
  MONTHLY_TEMPLATE_LABEL,
  fmtDateBr,
  templateOf,
  type MonthlyAnswer,
  type MonthlyExtra,
  type MonthlyItem,
} from "@/lib/monthlyChecklist";

const inputCls =
  "w-full rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const dateCls =
  "rounded-lg border border-navy-300 bg-white px-2 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

type FleetRow = FleetCertFields & { kind: string };

export default function NewMonthlyChecklist() {
  const router = useRouter();
  const { user, canDoMonthlyChecklist, loading: authLoading } = useAuth();
  const [fleet, setFleet] = useState<FleetRow[]>([]);
  const [items, setItems] = useState<MonthlyItem[]>([]);
  const [drivers, setDrivers] = useState<{ value: string; hint?: string }[]>([]);
  const [plate, setPlate] = useState("");
  const [driver, setDriver] = useState("");
  const [driverAbsent, setDriverAbsent] = useState(false);
  const [absentReason, setAbsentReason] = useState("");
  const [answers, setAnswers] = useState<Record<string, MonthlyAnswer>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Record<string, MonthlyExtra>>({});
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [observations, setObservations] = useState("");
  const [inspectorSig, setInspectorSig] = useState<string | null>(null);
  const [driverSig, setDriverSig] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (!canDoMonthlyChecklist) return;
    const q = new URLSearchParams(window.location.search).get("placa");
    if (q) queueMicrotask(() => setPlate(normalizePlate(q)));
    Promise.all([
      supabase.from("fleet_units").select("plate, kind, civ_due, civ_na, cipp_due, cipp_na, crono_due, crono_stage").order("plate"),
      supabase.from("monthly_checklist_items").select("*").eq("active", true).order("position"),
      supabase.rpc("monthly_checklist_drivers"),
    ]).then(([f, i, d]) => {
      setFleet((f.data as FleetRow[] | null) ?? []);
      setItems((i.data as MonthlyItem[] | null) ?? []);
      setDrivers(
        ((d.data ?? []) as { name: string; nickname: string | null }[]).map((x) => ({
          value: x.nickname?.trim() || x.name,
          hint: x.nickname?.trim() ? x.name : undefined,
        }))
      );
      if (f.error || i.error) setError((f.error ?? i.error)!.message);
    });
  }, [canDoMonthlyChecklist]);

  const unit = fleet.find((f) => f.plate === plate) ?? null;
  const template = unit ? templateOf(unit.kind) : null;
  const shown = useMemo(() => items.filter((i) => i.template === template), [items, template]);

  // Ao trocar a placa: vencimentos do cadastro já preenchidos (o inspetor confere).
  useEffect(() => {
    if (!unit) return;
    const pre: Record<string, MonthlyExtra> = {};
    for (const it of items) {
      if (it.template !== templateOf(unit.kind) || !it.cert_key) continue;
      const due = it.cert_key === "civ" ? unit.civ_due : it.cert_key === "cipp" ? unit.cipp_due : unit.crono_due;
      if (due) pre[it.id] = { due };
    }
    queueMicrotask(() => {
      setAnswers({});
      setNotes({});
      setPhotos({});
      setExtras(pre);
    });
  }, [unit, items]);

  function setExtra(id: string, patch: MonthlyExtra) {
    setExtras((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function addPhoto(id: string, list: FileList | null) {
    if (!list || !user) return;
    const picked = Array.from(list);
    setUploading(id);
    try {
      const paths: string[] = [];
      for (const f of picked) paths.push(await uploadPhoto(user.id, f));
      setPhotos((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), ...paths].slice(0, 3) }));
    } catch (e) {
      setError(`Não foi possível enviar a foto (${e instanceof Error ? e.message : "erro"}).`);
    }
    setUploading(null);
  }

  const answered = shown.filter((i) => answers[i.id]).length;
  const missingNotes = shown.filter((i) => answers[i.id] === "N" && i.maintenance && !notes[i.id]?.trim());
  const driverOk = driverAbsent ? absentReason.trim().length > 0 : Boolean(driver.trim()) && Boolean(driverSig);
  const ready = Boolean(unit) && answered === shown.length && shown.length > 0 && missingNotes.length === 0 && Boolean(inspectorSig) && driverOk;

  function certFromCadastro(it: MonthlyItem): string | null {
    if (!unit || !it.cert_key) return null;
    return it.cert_key === "civ" ? unit.civ_due : it.cert_key === "cipp" ? unit.cipp_due : unit.crono_due;
  }

  async function submit() {
    if (!ready || !unit || !user) return;
    setSaving(true);
    setError(null);
    const id = crypto.randomUUID();
    const inspectorName = (user.user_metadata?.name as string | undefined) ?? user.email ?? null;
    const { error: err } = await supabase.rpc("submit_monthly_checklist", {
      p: {
        id,
        plate: unit.plate,
        inspector_name: inspectorName,
        driver_name: driverAbsent ? null : driver.trim(),
        driver_absent: driverAbsent,
        driver_absent_reason: driverAbsent ? absentReason.trim() : null,
        answers,
        item_notes: notes,
        extras,
        photos,
        observations: observations.trim() || null,
        inspector_signature: inspectorSig,
        driver_signature: driverAbsent ? null : driverSig,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      },
    });
    setSaving(false);
    if (err) {
      setError(`Não foi possível salvar (${err.message}). Confira a conexão e tente de novo.`);
      return;
    }
    router.push(`/checklist-mensal/${id}?novo=1`);
  }

  if (authLoading) return null;
  if (!canDoMonthlyChecklist) {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-navy-900">Acesso restrito</h1>
        <p className="mt-2 text-sm text-navy-500">Seu perfil só consulta os check-lists mensais.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <ButtonLink href="/checklist-mensal" variant="secondary" size="sm">
        Voltar
      </ButtonLink>
      <h1 className="mt-3 text-xl font-semibold text-navy-900">Check-list mensal</h1>
      <p className="text-sm text-navy-500">
        Responda cada item olhando o veículo: S (atende), N (defeito) ou N/A (não se aplica a este implemento).
      </p>

      <div className="mt-4 grid gap-3 rounded-xl border border-navy-200 bg-white p-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cm-placa" className="mb-1 block text-sm font-medium text-navy-700">
            Placa
          </label>
          <SearchSelect
            id="cm-placa"
            value={plate}
            onChange={(v) => setPlate(normalizePlate(v))}
            options={fleet.map((f) => ({ value: f.plate, hint: FLEET_KINDS.find((k) => k.value === f.kind)?.label }))}
            placeholder="Escolha a placa"
            className={`${inputCls} uppercase tracking-wide`}
          />
          {unit && template && (
            <p className="mt-1 text-xs text-navy-500">
              Modelo: {MONTHLY_TEMPLATE_LABEL[template]} ({FLEET_KINDS.find((k) => k.value === unit.kind)?.label})
            </p>
          )}
          {plate.length === 7 && !unit && <p className="mt-1 text-xs text-red-600">Placa não cadastrada na frota.</p>}
        </div>
        <div>
          <label htmlFor="cm-motorista" className="mb-1 block text-sm font-medium text-navy-700">
            Motorista que acompanhou
          </label>
          <SearchSelect
            id="cm-motorista"
            value={driver}
            onChange={setDriver}
            options={drivers}
            placeholder={driverAbsent ? "Motorista ausente" : "Escolha o motorista"}
            className={inputCls}
          />
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-navy-700">
            <input type="checkbox" checked={driverAbsent} onChange={(e) => setDriverAbsent(e.target.checked)} />
            O motorista não participou / estava ausente
          </label>
          {driverAbsent && (
            <input
              aria-label="Motivo da ausência do motorista"
              value={absentReason}
              onChange={(e) => setAbsentReason(e.target.value)}
              placeholder="Motivo (obrigatório)"
              className={`${inputCls} mt-2`}
            />
          )}
        </div>
      </div>

      {unit && (
        <>
          <div className="sticky top-0 z-10 -mx-4 mt-4 border-b border-navy-200 bg-navy-50 px-4 py-2">
            <div className="flex items-center justify-between text-xs text-navy-600">
              <span className="font-medium tracking-wide">{unit.plate}</span>
              <span>
                {answered}/{shown.length} respondidos
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-navy-200">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${shown.length ? (answered / shown.length) * 100 : 0}%` }} />
            </div>
          </div>

          {shown.map((it, index, all) => {
            const prev = index > 0 ? all[index - 1] : null;
            const header = !prev || prev.section !== it.section;
            const subHeader = Boolean(it.subsection) && (!prev || prev.subsection !== it.subsection);
            const a = answers[it.id];
            const ex = extras[it.id] ?? {};
            const reg = certFromCadastro(it);
            const diverges = it.cert_key && (ex.due ?? "") !== (reg ?? "") && Boolean(ex.due || reg);
            return (
              <div key={it.id}>
                {header && <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-navy-600">{it.section}</h2>}
                {subHeader && <h3 className="mb-2 mt-3 text-[11px] font-semibold uppercase text-navy-500">{it.subsection}</h3>}
                <div
                  className={`mb-2 rounded-xl border p-3 ${
                    a === "N" ? "border-red-300 bg-red-50" : a === "S" ? "border-brand-300 bg-brand-50" : "border-navy-200 bg-white"
                  }`}
                >
                  <p className="text-sm text-navy-900">
                    <span className="font-semibold">{it.number}</span> {it.text}
                  </p>
                  {it.extra && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-navy-700">
                      {(it.extra === "due" || it.extra === "due2") && (
                        <label className="flex items-center gap-1">
                          Vencimento
                          <input type="date" value={ex.due ?? ""} onChange={(e) => setExtra(it.id, { due: e.target.value })} className={dateCls} />
                        </label>
                      )}
                      {it.extra === "due2" && (
                        <label className="flex items-center gap-1">
                          2º vencimento
                          <input type="date" value={ex.due2 ?? ""} onChange={(e) => setExtra(it.id, { due2: e.target.value })} className={dateCls} />
                        </label>
                      )}
                      {it.extra === "cnh" && (
                        <>
                          <label className="flex items-center gap-1">
                            Pontos na CNH
                            <input
                              inputMode="numeric"
                              value={ex.points ?? ""}
                              onChange={(e) => setExtra(it.id, { points: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                              className={`${dateCls} w-16`}
                            />
                          </label>
                          <label className="flex items-center gap-1">
                            Validade
                            <input type="date" value={ex.validity ?? ""} onChange={(e) => setExtra(it.id, { validity: e.target.value })} className={dateCls} />
                          </label>
                        </>
                      )}
                      {it.extra === "date" && (
                        <label className="flex items-center gap-1">
                          Data da última regulagem de freios
                          <input type="date" value={ex.date ?? ""} onChange={(e) => setExtra(it.id, { date: e.target.value })} className={dateCls} />
                        </label>
                      )}
                    </div>
                  )}
                  {diverges && (
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      ⚠ Diferente do cadastro da placa ({CERT_LABEL[it.cert_key!]}: {reg ? fmtDateBr(reg) : "sem data"}). A equipe será avisada para
                      conferir.
                    </p>
                  )}
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(
                      [
                        ["S", "✓ S"],
                        ["N", "✗ N"],
                        ["NA", "— N/A"],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={a === v}
                        onClick={() => setAnswers((prev) => ({ ...prev, [it.id]: v }))}
                        className={`rounded-lg border px-1 py-2 text-xs font-semibold transition-colors ${
                          a === v
                            ? v === "S"
                              ? "border-transparent bg-brand-600 text-white"
                              : v === "N"
                                ? "border-transparent bg-red-600 text-white"
                                : "border-transparent bg-navy-600 text-white"
                            : "border-navy-300 text-navy-700 hover:bg-navy-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {a === "N" && (
                    <div className="mt-2">
                      {it.maintenance && MONTHLY_CREATES_DEFECTS && (
                        <p className="mb-1 text-xs font-medium text-red-700">Vai para a triagem da Manutenção como defeito ({it.category}).</p>
                      )}
                      <textarea
                        rows={2}
                        value={notes[it.id] ?? ""}
                        onChange={(e) => setNotes((prev) => ({ ...prev, [it.id]: e.target.value }))}
                        aria-label={`Descreva o problema: ${it.number}`}
                        placeholder={it.maintenance ? "Descreva o defeito (obrigatório)" : "Descreva o que está errado (opcional)"}
                        className={inputCls}
                      />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {(photos[it.id] ?? []).map((p, i) => (
                          <span key={p} className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-800">
                            📷 Foto {i + 1}
                            <button
                              type="button"
                              aria-label={`Remover foto ${i + 1}`}
                              onClick={() => setPhotos((prev) => ({ ...prev, [it.id]: (prev[it.id] ?? []).filter((x) => x !== p) }))}
                              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand-200"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        {(photos[it.id]?.length ?? 0) < 3 && (
                          <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-navy-300 px-3 py-1.5 text-xs font-medium text-navy-700 hover:border-brand-500">
                            {uploading === it.id ? "Enviando..." : "📷 Foto (opcional)"}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="sr-only"
                              disabled={uploading !== null}
                              onChange={(e) => {
                                addPhoto(it.id, e.target.files);
                                e.target.value = "";
                              }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-navy-600">Observações</h2>
          <textarea
            rows={3}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            aria-label="Observações"
            placeholder="Irregularidades, comentários ou o que mais for preciso registrar"
            className={inputCls}
          />

          <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-navy-600">Resultado da avaliação</h2>
          <p className="rounded-lg bg-navy-100 px-3 py-2 text-xs text-navy-700">
            Declaro serem verdadeiras todas as informações contidas no presente documento, assim como, permaneço ciente que, em 30
            (trinta) dias devo inspecionar novamente os veículos aqui tratados.
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <SignaturePad label="Assinatura do responsável" onChange={setInspectorSig} />
            {driverAbsent ? (
              <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Motorista ausente: o check-list registra a ausência e o motivo, sem a assinatura dele.
              </div>
            ) : (
              <SignaturePad label="Assinatura do motorista" onChange={setDriverSig} />
            )}
          </div>

          {error && (
            <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {!ready && (
            <p className="mt-4 text-xs text-navy-500">
              Para enviar: responda os {shown.length} itens
              {missingNotes.length > 0 ? `, descreva os defeitos (${missingNotes.map((i) => i.number).join(", ")})` : ""}, escolha o
              motorista (ou marque a ausência com o motivo) e colha as assinaturas.
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!ready || saving}
            className={`${buttonClasses("primary")} mt-4 w-full py-3 disabled:cursor-not-allowed`}
          >
            {saving ? "Salvando..." : `Assinar e enviar (${answered}/${shown.length})`}
          </button>
        </>
      )}
    </div>
  );
}
