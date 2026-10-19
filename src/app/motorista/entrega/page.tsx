"use client";

import { useCallback, useEffect, useState } from "react";
import { ButtonLink } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { splitDestinations } from "@/components/Destinations";
import { loadingStatusBadge, loadingStatusLabel } from "@/lib/loadingStatus";
import { compressImage } from "@/lib/photos";
import { formatKg, parseKg } from "@/lib/deliveryProof";
import { agoLabel, cached } from "@/lib/offline/refdata";
import {
  enqueue,
  getOutboxItem,
  listOutbox,
  newPhotoPath,
  reviseItem,
  subscribeOutbox,
  syncNow,
  type OutboxItem,
  type OutboxPhoto,
} from "@/lib/offline/outbox";
import { useOffline } from "@/lib/offline/OfflineProvider";

const MAX_PHOTOS = 4;
const SEND_WAIT_MS = 12000;

interface Load {
  id: string;
  schedule_date: string;
  client_name: string;
  cargo: string;
  origin: string | null;
  destination: string | null;
  plate: string | null;
  status: string;
}

interface LoadNote {
  id: string;
  schedule_id: string;
  body: string;
  source: string;
  created_at: string;
}

interface Proof {
  schedule_id: string;
  destination: string;
  client_name: string;
  invoice_number: string;
  cte_number: string | null;
  invoice_weight_kg: number;
  unloaded_weight_kg: number;
}

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const fieldCls =
  "w-full rounded-lg border border-navy-300 bg-white px-3 py-2.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "mb-1.5 block text-sm font-medium text-navy-700";

interface EntregaData {
  loads: Load[];
  proofs: Proof[];
  notes: LoadNote[];
}

export default function ComprovanteEntregaPage() {
  const { user, isDriver, loading: authLoading } = useAuth();
  const { offline } = useOffline();
  const [data, setData] = useState<{ data: EntregaData; at: number; stale: boolean } | null>(null);
  const [queued, setQueued] = useState<OutboxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; saved: boolean } | null>(null);
  // "<id da carga>|<destino>" do formulário aberto.
  const [openKey, setOpenKey] = useState<string | null>(null);
  // Corrigindo um comprovante recusado da fila.
  const [redo, setRedo] = useState<OutboxItem | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const res = await cached<EntregaData>(`${user.id}:entrega`, async () => {
        // Cargas de hoje + as de dias anteriores que ainda não foram concluídas
        // (viagem que atravessa a virada do dia).
        const today = localDate(new Date());
        const [l, p] = await Promise.all([
          supabase
            .from("loading_schedules")
            .select("id, schedule_date, client_name, cargo, origin, destination, plate, status")
            .or(`schedule_date.eq.${today},and(schedule_date.lt.${today},status.neq.entregue)`)
            .order("schedule_date", { ascending: false })
            .order("loading_time", { ascending: true, nullsFirst: false }),
          supabase
            .from("delivery_proofs")
            .select("schedule_id, destination, client_name, invoice_number, cte_number, invoice_weight_kg, unloaded_weight_kg"),
        ]);
        if (l.error) throw new Error(l.error.message);
        if (p.error) throw new Error(p.error.message);
        const list = (l.data as Load[] | null) ?? [];
        const ids = list.map((x) => x.id);
        const n = ids.length
          ? await supabase
              .from("loading_schedule_notes")
              .select("id, schedule_id, body, source, created_at")
              .in("schedule_id", ids)
              .order("created_at")
          : { data: [] };
        return {
          loads: list,
          proofs: (p.data as Proof[] | null) ?? [],
          notes: (n.data as LoadNote[] | null) ?? [],
        };
      });
      setData(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
    }
  }, [user]);

  const loadQueue = useCallback(async () => {
    if (!user) return;
    setQueued((await listOutbox(user.id).catch(() => [])).filter((i) => i.kind === "proof"));
  }, [user]);

  useEffect(() => {
    if (!user || !isDriver) return;
    queueMicrotask(() => {
      load();
      loadQueue();
    });
    return subscribeOutbox(() => {
      loadQueue();
      load();
    });
  }, [user, isDriver, load, loadQueue]);

  // Abriu pelo botão "Corrigir e lançar de novo" da fila de envio.
  useEffect(() => {
    if (!user) return;
    const id = new URLSearchParams(window.location.search).get("refazer");
    if (!id) return;
    getOutboxItem(id).then((item) => {
      if (!item || item.userId !== user.id || item.kind !== "proof") return;
      setRedo(item);
      setOpenKey(`${item.payload.schedule_id}|${item.payload.destination}`);
    });
  }, [user]);

  if (authLoading || !isDriver) return null;

  const loads = data?.data.loads ?? null;
  const proofs = data?.data.proofs ?? [];
  const loadNotes = data?.data.notes ?? [];
  const staleNote = data?.stale ? `Dados guardados no celular (${agoLabel(data.at)}).` : null;

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <ButtonLink href="/motorista" variant="secondary" size="sm" aria-label="Voltar para Voltar">Voltar</ButtonLink>
      <h1 className="mt-3 text-xl font-semibold text-navy-900">Comprovante de entrega</h1>
      <p className="text-sm text-navy-500">
        Para cada destino, lance os dados e a foto do canhoto e do ticket de pesagem.
      </p>

      {staleNote && <p className="mt-1 text-xs text-amber-700">{staleNote}</p>}
      {error && !data && (
        <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar suas cargas ({error}).
        </div>
      )}
      {notice && (
        <div
          role="status"
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${notice.saved ? "bg-amber-50 text-amber-900" : "bg-teal-50 text-teal-800"}`}
        >
          {notice.saved ? "💾" : "✓"} {notice.text}
        </div>
      )}
      {redo && (
        <div role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Corrigindo um comprovante recusado: {redo.reason}
        </div>
      )}

      <div className="mt-4 space-y-4">
        {loads === null ? (
          <p className="text-sm text-navy-500">Carregando...</p>
        ) : loads.length === 0 ? (
          <div className="rounded-xl border border-navy-200 bg-white px-4 py-6 text-center text-sm text-navy-500">
            Nenhuma carga em aberto para você.
          </div>
        ) : (
          loads.map((l) => {
            const dests = splitDestinations(l.destination);
            const list = dests.length > 0 ? dests : [""];
            return (
              <section key={l.id} className="rounded-xl border border-navy-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold text-navy-900">{l.cargo}</div>
                    <div className="text-sm text-navy-600">{l.client_name}</div>
                    <div className="text-xs text-navy-500">
                      {l.plate || "—"} · {new Date(`${l.schedule_date}T12:00:00`).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${loadingStatusBadge(l.status)}`}
                  >
                    {loadingStatusLabel(l.status)}
                  </span>
                </div>

                {loadNotes.some((n) => n.schedule_id === l.id) && (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <span className="block text-[11px] font-medium uppercase text-amber-800">
                      Suas observações
                    </span>
                    <ul className="mt-1 list-disc space-y-1 pl-4">
                      {loadNotes
                        .filter((n) => n.schedule_id === l.id)
                        .map((n) => (
                          <li key={n.id} className="whitespace-pre-line">
                            {n.body}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
                <ul className="mt-3 space-y-2">
                  {list.map((dest) => {
                    const key = `${l.id}|${dest}`;
                    const proof = proofs.find((p) => p.schedule_id === l.id && p.destination === dest);
                    const wait = queued.find((q) => q.payload.schedule_id === l.id && q.payload.destination === dest);
                    // Na fila e sem recusa: já foi lançado (só falta enviar). Recusado: só reabre pela correção.
                    const waiting = !proof && wait && wait.status !== "rejected";
                    const label = dest || "Destino da carga";
                    return (
                      <li key={key} className="rounded-lg border border-navy-200 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-navy-900">{label}</span>
                          {proof ? (
                            <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-800">
                              ✓ enviado
                            </span>
                          ) : waiting ? (
                            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              {offline ? "💾 aguardando sinal" : "💾 aguardando envio"}
                            </span>
                          ) : (
                            <button
                              type="button"
                              aria-expanded={openKey === key}
                              onClick={() => setOpenKey(openKey === key ? null : key)}
                              className="shrink-0 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-800"
                            >
                              {openKey === key ? "Fechar" : "Lançar"}
                            </button>
                          )}
                        </div>
                        {proof && (
                          <p className="mt-1 text-xs text-navy-500">
                            {proof.client_name} · NF {proof.invoice_number}{proof.cte_number ? ` · CTE ${proof.cte_number}` : ""} · peso NF{" "}
                            {formatKg(proof.invoice_weight_kg)} kg · descarregado{" "}
                            {formatKg(proof.unloaded_weight_kg)} kg
                          </p>
                        )}
                        {!proof && !waiting && openKey === key && user && (
                          <ProofForm
                            userId={user.id}
                            scheduleId={l.id}
                            destination={dest}
                            redo={redo && `${redo.payload.schedule_id}|${redo.payload.destination}` === key ? redo : null}
                            onSaved={(text, saved) => {
                              setOpenKey(null);
                              setRedo(null);
                              setNotice({ text, saved });
                              if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
                              load();
                              loadQueue();
                            }}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function ProofForm({
  userId,
  scheduleId,
  destination,
  redo,
  onSaved,
}: {
  userId: string;
  scheduleId: string;
  destination: string;
  redo: OutboxItem | null;
  onSaved: (text: string, saved: boolean) => void;
}) {
  const rp = (redo?.payload ?? {}) as Record<string, unknown>;
  const kgText = (v: unknown) => (v === undefined || v === null ? "" : String(v).replace(".", ","));
  const [clientName, setClientName] = useState(String(rp.client_name ?? ""));
  const [invoice, setInvoice] = useState(String(rp.invoice_number ?? ""));
  const [cte, setCte] = useState(String(rp.cte_number ?? ""));
  const [notes, setNotes] = useState(String(rp.notes ?? ""));
  const [invoiceKg, setInvoiceKg] = useState(kgText(rp.invoice_weight_kg));
  const [unloadedKg, setUnloadedKg] = useState(kgText(rp.unloaded_weight_kg));
  const [files, setFiles] = useState<OutboxPhoto[]>(redo?.photos ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reduz a foto agora (a câmera gera vários MB) e já define o nome com que ela vai subir.
  async function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    try {
      const added: OutboxPhoto[] = [];
      for (const f of picked) added.push({ path: newPhotoPath(userId), blob: await compressImage(f) });
      setFiles((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    } catch {
      setError("Não foi possível usar essa foto. Tire outra.");
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
    if (files.length === 0)
      return setError("Tire a foto do canhoto e do ticket de pesagem.");
    setSaving(true);
    setError(null);
    try {
      const id = redo?.id ?? crypto.randomUUID();
      const payload = {
        id,
        schedule_id: scheduleId,
        destination,
        client_name: clientName.trim(),
        invoice_number: invoice.trim(),
        cte_number: cte.trim(),
        notes: notes.trim() || null,
        invoice_weight_kg: invKg,
        unloaded_weight_kg: unlKg,
        photos: files.map((f) => f.path),
        created_at: redo ? (redo.payload.created_at as string) : new Date().toISOString(),
      };
      const summary = `Comprovante · NF ${invoice.trim()} · ${destination || "destino da carga"}`;
      if (redo) await reviseItem(id, { summary, payload, photos: files });
      else await enqueue({ id, userId, kind: "proof", createdAt: Date.now(), summary, driverName: null, payload, photos: files });
      await Promise.race([syncNow(userId, true), new Promise((r) => setTimeout(r, SEND_WAIT_MS))]);
      const left = await getOutboxItem(id);
      if (left?.status === "rejected") {
        setError(`O servidor não aceitou este comprovante: ${left.reason} Corrija e envie de novo. A equipe foi avisada.`);
        setSaving(false);
        return;
      }
      onSaved(
        left ? `${summary} salvo no celular. Será enviado quando houver sinal.` : `${summary} enviado.`,
        Boolean(left)
      );
    } catch (ex) {
      setError(`Não foi possível salvar no celular (${ex instanceof Error ? ex.message : "erro"}). Libere espaço e tente de novo.`);
      setSaving(false);
    }
  }

  const id = `p-${scheduleId}-${destination}`;

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border-t border-navy-100 pt-3">
      <div>
        <label className={labelCls} htmlFor={`${id}-cli`}>
          Nome do cliente
        </label>
        <input
          id={`${id}-cli`}
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          className={fieldCls}
          autoComplete="off"
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${id}-nf`}>
          Nota fiscal
        </label>
        <input
          id={`${id}-nf`}
          type="text"
          inputMode="numeric"
          value={invoice}
          onChange={(e) => setInvoice(e.target.value)}
          className={fieldCls}
          autoComplete="off"
        />
      </div>
      <div>
        <label className={labelCls} htmlFor={`${id}-cte`}>
          CTE
        </label>
        <input
          id={`${id}-cte`}
          type="text"
          inputMode="numeric"
          value={cte}
          onChange={(e) => setCte(e.target.value)}
          className={fieldCls}
          autoComplete="off"
        />
      </div>
      <div className="space-y-3">
        <div>
          <label className={labelCls} htmlFor={`${id}-pnf`}>
            Peso da NF (kg)
          </label>
          <input
            id={`${id}-pnf`}
            type="text"
            inputMode="decimal"
            value={invoiceKg}
            onChange={(e) => setInvoiceKg(e.target.value)}
            className={fieldCls}
            placeholder="32560"
          />
        </div>
        <div>
          <label className={labelCls} htmlFor={`${id}-pdesc`}>
            Peso descarregado (kg)
          </label>
          <input
            id={`${id}-pdesc`}
            type="text"
            inputMode="decimal"
            value={unloadedKg}
            onChange={(e) => setUnloadedKg(e.target.value)}
            className={fieldCls}
            placeholder="32480"
          />
        </div>
      </div>

      <div>
        <span className={labelCls}>
          Foto do canhoto e do ticket de pesagem{" "}
          <span className="font-normal text-red-700">(obrigatória)</span>
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
            📷 {files.length === 0 ? "Tirar foto" : "Tirar outra foto"}
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
        <p className="mt-1 text-xs text-navy-500">
          Pode ser uma foto só mostrando os dois, ou uma de cada (até {MAX_PHOTOS}).
        </p>
      </div>

      <div>
        <label className={labelCls} htmlFor={`${id}-obs`}>
          Observação <span className="font-normal text-navy-500">(opcional)</span>
        </label>
        <textarea
          id={`${id}-obs`}
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={fieldCls}
          placeholder="Ex.: cliente pediu para reentregar a sobra amanhã"
        />
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Salvando..." : redo ? "Enviar correção" : "Enviar comprovante"}
      </button>
    </form>
  );
}
