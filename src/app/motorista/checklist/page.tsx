"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ButtonLink } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { compressImage } from "@/lib/photos";
import { agoLabel, cached, must } from "@/lib/offline/refdata";
import { enqueue, getOutboxItem, newPhotoPath, syncNow, type OutboxPhoto } from "@/lib/offline/outbox";
import { useOffline } from "@/lib/offline/OfflineProvider";
import { clearDraft, draftKey, loadDraft, saveDraft } from "@/lib/offline/drafts";
import { PhotoPicker } from "@/components/PhotoPicker";
import { useFeedback } from "@/components/Feedback";

const SEND_WAIT_MS = 12000;

interface Item {
  id: string;
  stage: string;
  text: string;
  periodicity: string;
  category: string;
}

type Answer = "ok" | "prob" | "na";

// Rascunho do check-list em andamento (IndexedDB). Em celular com pouca memória
// o Android fecha o navegador enquanto a câmera está aberta; ao voltar, a página
// recarrega e o motorista cairia de novo na tela da placa, perdendo as respostas.
interface ChecklistDraft {
  cavalo: string;
  carreta: string;
  startedAt: string;
  pos: { lat: number; lon: number } | null;
  photoItems: string[];
  answers: Record<string, Answer>;
  notes: Record<string, string>;
  /** Item -> caminhos das fotos (as fotos vão na lista do rascunho). */
  photoOf: Record<string, string[]>;
}
// Check-list começado há mais tempo que isso não é retomado: vale um novo.
const DRAFT_MAX_MS = 12 * 60 * 60 * 1000;
// Foto da galeria só vale se foi tirada perto do início do check-list.
const PHOTO_MARGIN_MS = 30 * 60 * 1000;

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function pickRandom(ids: string[], n: number): Set<string> {
  const pool = [...ids];
  const out = new Set<string>();
  while (out.size < n && pool.length > 0) {
    out.add(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

const fieldCls =
  "w-full rounded-lg border border-navy-300 bg-white px-3 py-2.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function ChecklistPage() {
  const { user, isDriver, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null);
  const [loadsPlates, setLoadsPlates] = useState<{ plate: string | null; trailer: string | null }[]>([]);
  const [step, setStep] = useState<"start" | "items" | "done">("start");
  const [cavalo, setCavalo] = useState("");
  const [carreta, setCarreta] = useState("");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [photoItems, setPhotoItems] = useState<Set<string>>(new Set());
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, OutboxPhoto[]>>({});
  const { offline } = useOffline();
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ ncs: number; minutes: number; saved: boolean } | null>(null);
  const [draftChecked, setDraftChecked] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [photoErr, setPhotoErr] = useState<{ id: string; msg: string } | null>(null);
  const { confirm: askConfirm } = useFeedback();

  // Ao abrir: retoma o check-list que ficou pela metade (página recarregada).
  // Uma vez só por motorista: a renovação do login troca o objeto "user".
  const uid = user?.id ?? null;
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!uid || !isDriver || restoredFor.current === uid) return;
    restoredFor.current = uid;
    loadDraft<ChecklistDraft>(draftKey("checklist", uid))
      .then((d) => {
        if (!d) return;
        const f = d.fields;
        if (!f?.startedAt || Date.now() - new Date(f.startedAt).getTime() > DRAFT_MAX_MS) {
          clearDraft(d.key);
          return;
        }
        const byPath = new Map(d.photos.map((ph) => [ph.path, ph]));
        const fl: Record<string, OutboxPhoto[]> = {};
        for (const [id, paths] of Object.entries(f.photoOf ?? {})) {
          const list = paths.map((x) => byPath.get(x)).filter((x): x is OutboxPhoto => Boolean(x));
          if (list.length) fl[id] = list;
        }
        setCavalo(f.cavalo);
        setCarreta(f.carreta);
        setStartedAt(new Date(f.startedAt));
        setPos(f.pos);
        setPhotoItems(new Set(f.photoItems));
        setAnswers(f.answers ?? {});
        setNotes(f.notes ?? {});
        setFiles(fl);
        setResumed(true);
        setStep("items");
      })
      .finally(() => setDraftChecked(true));
  }, [uid, isDriver]);

  // Grava o rascunho a cada resposta e antes de abrir a câmera.
  const dKey = user ? draftKey("checklist", user.id) : null;
  const latest = useRef<{ fields: ChecklistDraft; photos: OutboxPhoto[] } | null>(null);
  useEffect(() => {
    latest.current =
      step === "items" && startedAt
        ? {
            fields: {
              cavalo,
              carreta,
              startedAt: startedAt.toISOString(),
              pos,
              photoItems: [...photoItems],
              answers,
              notes,
              photoOf: Object.fromEntries(Object.entries(files).map(([id, l]) => [id, l.map((x) => x.path)])),
            },
            photos: Object.values(files).flat(),
          }
        : null;
  });
  const submitted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushDraft = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const l = latest.current;
    if (!l || !dKey || submitted.current) return;
    saveDraft(dKey, l.fields, l.photos).catch(() => undefined);
  }, [dKey]);
  useEffect(() => {
    if (step !== "items") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flushDraft, 400);
  }, [step, answers, notes, files, photoItems, pos, flushDraft]);
  useEffect(
    () => () => {
      if (timer.current) flushDraft();
    },
    [flushDraft]
  );

  async function restart() {
    if (!(await askConfirm("Apagar as respostas e começar o check-list de novo?", { confirmLabel: "Começar de novo" }))) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (dKey) await clearDraft(dKey);
    setAnswers({});
    setNotes({});
    setFiles({});
    setPhotoItems(new Set());
    setStartedAt(null);
    setPos(null);
    setResumed(false);
    setPhotoErr(null);
    setError(null);
    setStep("start");
  }

  useEffect(() => {
    if (!user || !isDriver) return;
    cached<Item[]>(`${user.id}:checklist-items`, async () =>
      must(
        await supabase
          .from("checklist_items")
          .select("id, stage, text, periodicity, category")
          .eq("active", true)
          .order("position")
      ) as Item[]
    )
      .then((r) => {
        setItems(r.data);
        setStaleAt(r.stale ? r.at : null);
      })
      .catch(() => setItems([]));
    cached<{ plate: string | null; trailer: string | null }[]>(`${user.id}:checklist-today`, async () =>
      (
        (must(
          await supabase
            .from("loading_schedules")
            .select("plate, trailer_plate")
            .eq("schedule_date", localDate(new Date()))
        ) ?? []) as { plate: string | null; trailer_plate: string | null }[]
      ).map((l) => ({ plate: l.plate, trailer: l.trailer_plate }))
    )
      .then(({ data: list }) => {
        setLoadsPlates(list);
        const first = list.find((l) => l.plate);
        if (first) {
          setCavalo((c) => c || first.plate!);
          setCarreta((c) => c || first.trailer || "");
        }
      })
      .catch(() => {});
  }, [user, isDriver]);

  function start() {
    const c = cavalo.trim().replace(/[\s-]/g, "").toUpperCase();
    if (!c) {
      setError("Informe a placa do caminhão.");
      return;
    }
    setCavalo(c);
    setError(null);
    submitted.current = false;
    setStartedAt(new Date());
    setPhotoItems(pickRandom((items ?? []).map((i) => i.id), 2));
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setPos({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => {},
        { timeout: 6000, maximumAge: 60000 }
      );
    }
    setStep("items");
  }

  // Reduz a foto agora (a câmera gera vários MB) e já define o nome com que ela vai subir.
  async function addFile(id: string, list: FileList | null) {
    if (!list || !user || !startedAt) return;
    // A foto comprova a inspeção: da galeria, só serve a tirada durante o check-list.
    const oldest = startedAt.getTime() - PHOTO_MARGIN_MS;
    const all = Array.from(list);
    const picked = all.filter((f) => !f.lastModified || f.lastModified >= oldest);
    setPhotoErr(
      picked.length < all.length ? { id, msg: "Essa foto é antiga. Use uma foto tirada agora, olhando o item." } : null
    );
    if (picked.length === 0) return;
    try {
      const added: OutboxPhoto[] = [];
      for (const f of picked) added.push({ path: newPhotoPath(user.id), blob: await compressImage(f) });
      setFiles((prev) => ({ ...prev, [id]: [...(prev[id] ?? []), ...added].slice(0, 3) }));
    } catch {
      setError("Não foi possível usar essa foto. Tire outra.");
    }
  }

  const needsPhoto = (id: string) => photoItems.has(id) && answers[id] && answers[id] !== "na";
  const answered = (id: string) =>
    Boolean(answers[id]) && (!needsPhoto(id) || (files[id]?.length ?? 0) > 0);
  const total = items?.length ?? 0;
  const done = (items ?? []).filter((i) => answered(i.id)).length;

  async function submit() {
    if (!user || !items || !startedAt) return;
    setSaving(true);
    setError(null);
    try {
      const photos: Record<string, string[]> = {};
      const blobs: OutboxPhoto[] = [];
      for (const [id, list] of Object.entries(files)) {
        if (list.length === 0) continue;
        photos[id] = list.map((f) => f.path);
        blobs.push(...list);
      }
      const problems = items.filter((i) => answers[i.id] === "prob");
      const id = crypto.randomUUID();
      const trailer = carreta.trim() ? carreta.trim().replace(/[\s-]/g, "").toUpperCase() : null;
      // Cada "Problema" vira um defeito na triagem da manutenção (com código próprio: reenvio não duplica).
      const reports = problems.map((item) => ({
        id: crypto.randomUUID(),
        plate: cavalo,
        category: item.category,
        severity: item.category === "Freios" ? 3 : 2,
        description: `[Check-list] ${item.text}${notes[item.id] ? ` — ${notes[item.id]}` : ""}`,
        source: "checklist",
        photos: photos[item.id] ?? [],
        reported_at: new Date().toISOString(),
      }));
      const payload = {
        checklist: {
          id,
          plate: cavalo,
          trailer_plate: trailer,
          started_at: startedAt.toISOString(),
          finished_at: new Date().toISOString(),
          answers,
          notes,
          photos,
          nonconformities: problems.length,
          lat: pos?.lat ?? null,
          lon: pos?.lon ?? null,
        },
        reports,
      };
      const summary = `Check-list · ${cavalo}${problems.length ? ` · ${problems.length} problema(s)` : ""}`;
      await enqueue({ id, userId: user.id, kind: "checklist", createdAt: Date.now(), summary, driverName: null, payload, photos: blobs });
      // Já está na fila do celular: o rascunho não é mais necessário.
      submitted.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (dKey) await clearDraft(dKey);
      await Promise.race([syncNow(user.id, true), new Promise((r) => setTimeout(r, SEND_WAIT_MS))]);
      const left = await getOutboxItem(id);
      if (left?.status === "rejected") {
        setError(
          `O servidor não aceitou o check-list: ${left.reason} Ele ficou na fila da tela inicial, onde você corrige as placas. A equipe foi avisada.`
        );
        setSaving(false);
        return;
      }
      setResult({
        ncs: problems.length,
        minutes: Math.max(1, Math.round((Date.now() - startedAt.getTime()) / 60000)),
        saved: Boolean(left),
      });
      setStep("done");
    } catch (ex) {
      setError(`Não foi possível salvar no celular (${ex instanceof Error ? ex.message : "erro"}). Libere espaço e tente de novo.`);
    }
    setSaving(false);
  }

  if (authLoading || !isDriver || !draftChecked) return null;

  if (step === "done" && result) {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-10 text-center">
        <div className="text-5xl" aria-hidden="true">
          ✅
        </div>
        <h1 className="mt-3 text-lg font-semibold text-navy-900">Check-list concluído!</h1>
        <p className="mt-1 text-sm text-navy-500">
          Tempo: {result.minutes} min ·{" "}
          {result.ncs > 0
            ? `${result.ncs} problema(s) ${result.saved ? "para enviar" : "enviado(s)"} à manutenção`
            : "nenhum problema encontrado. Boa viagem!"}
        </p>
        {result.saved && (
          <p className="mt-2 text-sm text-amber-800">
            💾 Salvo no celular. Será enviado assim que houver sinal.
          </p>
        )}
        <Link
          href="/motorista"
          className="mt-6 inline-block rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-800"
        >
          Voltar ao início
        </Link>
      </div>
    );
  }

  if (step === "start") {
    return (
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        <ButtonLink href="/motorista" variant="secondary" size="sm" aria-label="Voltar para Voltar">Voltar</ButtonLink>
        <h1 className="mt-3 text-xl font-semibold text-navy-900">Check-list diário</h1>
        <p className="mt-1 text-sm text-navy-500">
          Obrigatório antes de iniciar a viagem. Responda cada item olhando o veículo, e não de
          memória.
        </p>
        {staleAt && <p className="mt-1 text-xs text-amber-700">Dados guardados no celular ({agoLabel(staleAt)}).</p>}
        <div className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-navy-700" htmlFor="c-cavalo">
              Placa do caminhão
            </label>
            <input
              id="c-cavalo"
              type="text"
              list="c-cavalo-list"
              value={cavalo}
              onChange={(e) => setCavalo(e.target.value)}
              className={`${fieldCls} uppercase tracking-wide`}
              placeholder="ABC1D23"
            />
            <datalist id="c-cavalo-list">
              {Array.from(new Set(loadsPlates.map((l) => l.plate).filter(Boolean))).map((p) => (
                <option key={p} value={p!} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-navy-700" htmlFor="c-carreta">
              Placa da carreta <span className="font-normal text-navy-500">(se houver)</span>
            </label>
            <input
              id="c-carreta"
              type="text"
              list="c-carreta-list"
              value={carreta}
              onChange={(e) => setCarreta(e.target.value)}
              className={`${fieldCls} uppercase tracking-wide`}
              placeholder="ABC1D23"
            />
            <datalist id="c-carreta-list">
              {Array.from(new Set(loadsPlates.map((l) => l.trailer).filter(Boolean))).map((p) => (
                <option key={p} value={p!} />
              ))}
            </datalist>
          </div>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
            ⚠ 2 itens sorteados pedirão uma foto, para comprovar que a inspeção foi feita. A hora e
            a posição do celular são registradas.
          </p>
        </div>
        {error && (
          <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={start}
          disabled={items === null || items.length === 0}
          className="mt-5 w-full rounded-lg bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {items === null ? "Carregando..." : items.length === 0 ? "Sem itens cadastrados" : "Iniciar check-list"}
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <div className="sticky top-0 z-10 -mx-4 mb-3 border-b border-navy-200 bg-navy-50 px-4 py-2">
        <div className="flex items-center justify-between text-xs text-navy-600">
          <span>
            {cavalo}
            {carreta.trim() ? ` + ${carreta.trim().toUpperCase()}` : ""}
          </span>
          <span>
            {done}/{total}
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-navy-200">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
      </div>

      {resumed && (
        <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Check-list retomado de onde você parou. Confira as fotos: a que estava sendo tirada
          pode não ter sido salva.{" "}
          <button type="button" onClick={restart} className="font-semibold underline">
            Começar de novo
          </button>
        </div>
      )}

      {(items ?? []).map((it, index, all) => {
        const a = answers[it.id];
        const stageHeader = index === 0 || all[index - 1].stage !== it.stage;
        return (
          <div key={it.id}>
            {stageHeader && (
              <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-navy-500">
                {it.stage}
              </h2>
            )}
            <div
              className={`mb-3 rounded-xl border p-3 ${
                a === "prob"
                  ? "border-red-300 bg-red-50"
                  : a === "ok"
                    ? "border-brand-300 bg-brand-50"
                    : "border-navy-200 bg-white"
              }`}
            >
              <p className="text-sm font-medium text-navy-900">{it.text}</p>
              <p className="mt-0.5 text-[11px] text-navy-500">
                🗓 {it.periodicity}
                {photoItems.has(it.id) && (
                  <span className="ml-2 font-medium text-amber-700">📸 foto obrigatória</span>
                )}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    ["ok", "✓ OK"],
                    ["prob", "✗ Problema"],
                    ["na", "— N/A"],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={a === v}
                    onClick={() => setAnswers((prev) => ({ ...prev, [it.id]: v }))}
                    className={`rounded-lg border px-1 py-2.5 text-xs font-semibold transition-colors ${
                      a === v
                        ? v === "ok"
                          ? "border-transparent bg-brand-600 text-white"
                          : v === "prob"
                            ? "border-transparent bg-red-600 text-white"
                            : "border-transparent bg-navy-600 text-white"
                        : "border-navy-300 text-navy-700 hover:bg-navy-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {a === "prob" && (
                <textarea
                  rows={2}
                  value={notes[it.id] ?? ""}
                  onChange={(e) => setNotes((prev) => ({ ...prev, [it.id]: e.target.value }))}
                  aria-label={`Descreva o problema: ${it.text}`}
                  className={`${fieldCls} mt-2`}
                  placeholder="Descreva o problema encontrado"
                />
              )}
              {a && a !== "na" && (photoItems.has(it.id) || a === "prob") && (
                <div className="mt-2">
                  {(files[it.id]?.length ?? 0) > 0 && (
                    <p className="mb-1.5 text-xs font-medium text-brand-700">📷 {files[it.id].length} foto(s) ✓</p>
                  )}
                  {(files[it.id]?.length ?? 0) < 3 && (
                    <PhotoPicker
                      cameraLabel={
                        (files[it.id]?.length ?? 0) > 0
                          ? "Adicionar outra"
                          : photoItems.has(it.id)
                            ? "Tirar foto do item (obrigatório)"
                            : "Tirar foto do problema"
                      }
                      onFiles={(l) => addFile(it.id, l)}
                      onBeforeOpen={flushDraft}
                    />
                  )}
                  {photoErr?.id === it.id && <p className="mt-1 text-xs text-red-700">{photoErr.msg}</p>}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <p className="mt-4 rounded-lg bg-navy-100 px-3 py-2 text-xs text-navy-700">
        Declaro serem verdadeiras todas as informações deste check-list e que avaliei cada item na
        prática, sem apenas preenchê-los.
      </p>

      {error && (
        <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={saving || done < total}
        className="mt-4 w-full rounded-lg bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {saving
          ? "Salvando..."
          : done < total
            ? `Responda todos os itens (${done}/${total})`
            : offline
              ? "Assinar e salvar (envia com sinal)"
              : "Assinar e enviar check-list"}
      </button>
    </div>
  );
}
