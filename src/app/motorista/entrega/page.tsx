"use client";

import { useCallback, useEffect, useState } from "react";
import { ButtonLink } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { splitDestinations } from "@/components/Destinations";
import { loadingStatusBadge, loadingStatusLabel } from "@/lib/loadingStatus";
import { uploadPhoto } from "@/lib/photos";
import { formatKg, parseKg } from "@/lib/deliveryProof";

const MAX_PHOTOS = 4;

interface Load {
  id: string;
  schedule_date: string;
  client_name: string;
  cargo: string;
  origin: string | null;
  destination: string | null;
  plate: string | null;
  status: string;
  notes: string | null;
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

export default function ComprovanteEntregaPage() {
  const { user, isDriver, loading: authLoading } = useAuth();
  const [loads, setLoads] = useState<Load[] | null>(null);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [error, setError] = useState<string | null>(null);
  // "<id da carga>|<destino>" do formulário aberto.
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Cargas de hoje + as de dias anteriores que ainda não foram concluídas
    // (viagem que atravessa a virada do dia).
    const today = localDate(new Date());
    const [l, p] = await Promise.all([
      supabase
        .from("loading_schedules")
        .select("id, schedule_date, client_name, cargo, origin, destination, plate, status, notes")
        .or(`schedule_date.eq.${today},and(schedule_date.lt.${today},status.neq.entregue)`)
        .order("schedule_date", { ascending: false })
        .order("loading_time", { ascending: true, nullsFirst: false }),
      supabase
        .from("delivery_proofs")
        .select("schedule_id, destination, client_name, invoice_number, cte_number, invoice_weight_kg, unloaded_weight_kg"),
    ]);
    if (l.error) setError(l.error.message);
    setLoads((l.data as Load[] | null) ?? []);
    setProofs((p.data as Proof[] | null) ?? []);
  }, []);

  useEffect(() => {
    if (!user || !isDriver) return;
    queueMicrotask(() => {
      load();
    });
  }, [user, isDriver, load]);

  if (authLoading || !isDriver) return null;

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <ButtonLink href="/motorista" variant="secondary" size="sm" aria-label="Voltar para Voltar">Voltar</ButtonLink>
      <h1 className="mt-3 text-xl font-semibold text-navy-900">Comprovante de entrega</h1>
      <p className="text-sm text-navy-500">
        Para cada destino, lance os dados e a foto do canhoto e do ticket de pesagem.
      </p>

      {error && (
        <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar suas cargas ({error}).
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

                {l.notes?.trim() && (
                  <div className="mt-3 whitespace-pre-line rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <span className="block text-[11px] font-medium uppercase text-amber-800">
                      Observações
                    </span>
                    {l.notes}
                  </div>
                )}
                <ul className="mt-3 space-y-2">
                  {list.map((dest) => {
                    const key = `${l.id}|${dest}`;
                    const proof = proofs.find((p) => p.schedule_id === l.id && p.destination === dest);
                    const label = dest || "Destino da carga";
                    return (
                      <li key={key} className="rounded-lg border border-navy-200 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-navy-900">{label}</span>
                          {proof ? (
                            <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-800">
                              ✓ enviado
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
                        {!proof && openKey === key && user && (
                          <ProofForm
                            userId={user.id}
                            scheduleId={l.id}
                            destination={dest}
                            onSaved={() => {
                              setOpenKey(null);
                              load();
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
  onSaved,
}: {
  userId: string;
  scheduleId: string;
  destination: string;
  onSaved: () => void;
}) {
  const [clientName, setClientName] = useState("");
  const [invoice, setInvoice] = useState("");
  const [cte, setCte] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceKg, setInvoiceKg] = useState("");
  const [unloadedKg, setUnloadedKg] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copia os arquivos AGORA: a lista do campo é "viva" e esvazia quando o
  // campo é limpo (mesmo cuidado do relato de defeito).
  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
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
      const paths: string[] = [];
      for (const f of files) paths.push(await uploadPhoto(userId, f));
      const { error: err } = await supabase.from("delivery_proofs").insert({
        schedule_id: scheduleId,
        destination,
        client_name: clientName.trim(),
        invoice_number: invoice.trim(),
        cte_number: cte.trim(),
        notes: notes.trim() || null,
        invoice_weight_kg: invKg,
        unloaded_weight_kg: unlKg,
        photos: paths,
      });
      if (err) {
        setError(
          /duplicate|unique/i.test(err.message)
            ? "Este destino já tem comprovante enviado."
            : `Não foi possível enviar (${err.message}).`
        );
        setSaving(false);
        return;
      }
      onSaved();
    } catch (ex) {
      setError(
        `Não foi possível enviar. Confira o sinal e tente de novo (${
          ex instanceof Error ? ex.message : "erro"
        }).`
      );
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
        {saving ? "Enviando..." : "Enviar comprovante"}
      </button>
    </form>
  );
}
