"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { loadingStatusBadge, loadingStatusLabel } from "@/lib/loadingStatus";
import { formatKg } from "@/lib/deliveryProof";
import { baseCity, splitDestinations } from "@/components/Destinations";
import { Modal } from "@/components/Modal";
import { buttonClasses } from "@/components/Button";

// Portal do cliente: comprovantes de entrega das empresas ligadas ao usuário.
// Os dados vêm só da função client_portal_loads (o banco nega qualquer outra
// leitura a este perfil) e as fotos só pela rota /api/portal/foto.

interface PortalProof {
  id: string;
  destination: string;
  client_name: string;
  invoice_number: string;
  cte_number: string | null;
  invoice_weight_kg: number;
  unloaded_weight_kg: number;
  notes: string | null;
  created_at: string;
  photo_count: number;
}

interface PortalLoad {
  id: string;
  schedule_date: string;
  client_name: string;
  destination: string | null;
  plate: string | null;
  trailer_plate: string | null;
  driver: string | null;
  status: string;
  delivered_at: string | null;
  proofs: PortalProof[];
}

type Situation = "completa" | "parcial" | "pendente";
type Filter = "todas" | Situation;

const selectCls =
  "rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
}
function norm(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export default function PortalPage() {
  const { isPortalClient, loading: authLoading } = useAuth();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return localDate(d);
  });
  const [to, setTo] = useState(() => localDate(new Date()));
  const [company, setCompany] = useState("");
  const [dest, setDest] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [search, setSearch] = useState("");
  const [loads, setLoads] = useState<PortalLoad[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ load: PortalLoad; destination: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc("client_portal_loads", { p_from: from, p_to: to });
    if (err) {
      setError(err.message);
      setLoads([]);
      return;
    }
    setError(null);
    setLoads((data as PortalLoad[] | null) ?? []);
  }, [from, to]);

  useEffect(() => {
    if (!isPortalClient) return;
    queueMicrotask(() => {
      load();
    });
  }, [isPortalClient, load]);

  const rows = useMemo(
    () =>
      (loads ?? []).map((l) => {
        const d = splitDestinations(l.destination);
        const dests = d.length > 0 ? d : [""];
        const sent = dests.filter((x) => l.proofs.some((p) => p.destination === x));
        const situation: Situation = sent.length === dests.length ? "completa" : sent.length === 0 ? "pendente" : "parcial";
        return { ...l, dests, sent, situation };
      }),
    [loads]
  );

  const companies = useMemo(() => Array.from(new Set(rows.map((r) => r.client_name))).sort(), [rows]);
  const destinations = useMemo(
    () => Array.from(new Set(rows.flatMap((r) => r.dests.map(baseCity)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows]
  );

  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDoc = norm(search);
    return rows.filter(
      (r) =>
        (!company || r.client_name === company) &&
        (!dest || r.dests.some((d) => baseCity(d).toLowerCase() === dest.toLowerCase())) &&
        (!q ||
          [r.plate, r.trailer_plate, r.driver, r.destination].some((v) => (v ?? "").toLowerCase().includes(q)) ||
          (qDoc.length >= 3 && r.proofs.some((p) => [p.invoice_number, p.cte_number].some((v) => norm(v).includes(qDoc)))))
    );
  }, [rows, company, dest, search]);

  const counts = {
    completa: scoped.filter((r) => r.situation === "completa").length,
    parcial: scoped.filter((r) => r.situation === "parcial").length,
    pendente: scoped.filter((r) => r.situation === "pendente").length,
  };
  const list = scoped.filter((r) => filter === "todas" || r.situation === filter);

  if (authLoading) return null;
  if (!isPortalClient) {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-navy-900">Portal do cliente</h1>
        <p className="mt-2 text-sm text-navy-500">Esta área é dos clientes da Transbochnia.</p>
      </div>
    );
  }

  const filters: { value: Filter; label: string }[] = [
    { value: "todas", label: `Todas (${scoped.length})` },
    { value: "completa", label: `Com comprovante (${counts.completa})` },
    { value: "parcial", label: `Parciais (${counts.parcial})` },
    { value: "pendente", label: `Sem comprovante (${counts.pendente})` },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Comprovantes de entrega</h1>
      <p className="mt-1 text-sm text-navy-500">
        Cargas em viagem e entregues{companies.length > 0 ? ` de ${companies.join(", ")}` : ""}. Clique na entrega para ver o
        comprovante e baixar as fotos.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="pt-de" className="mb-1 block text-xs font-medium text-navy-600">
            De (data da carga)
          </label>
          <input id="pt-de" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={selectCls} />
        </div>
        <div>
          <label htmlFor="pt-ate" className="mb-1 block text-xs font-medium text-navy-600">
            Até
          </label>
          <input id="pt-ate" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={selectCls} />
        </div>
        {companies.length > 1 && (
          <div>
            <label htmlFor="pt-empresa" className="mb-1 block text-xs font-medium text-navy-600">
              Empresa
            </label>
            <select id="pt-empresa" value={company} onChange={(e) => setCompany(e.target.value)} className={selectCls}>
              <option value="">Todas as empresas</option>
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label htmlFor="pt-destino" className="mb-1 block text-xs font-medium text-navy-600">
            Destino
          </label>
          <select id="pt-destino" value={dest} onChange={(e) => setDest(e.target.value)} className={selectCls}>
            <option value="">Todos os destinos</option>
            {destinations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pt-busca" className="mb-1 block text-xs font-medium text-navy-600">
            Buscar
          </label>
          <input
            id="pt-busca"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="NF, CTE, placa ou motorista"
            className={`${selectCls} w-64`}
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar ({error}).
        </div>
      )}

      {loads === null ? (
        <p className="mt-6 text-sm text-navy-500">Carregando...</p>
      ) : (
        <section className="mt-6 rounded-xl border border-navy-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-200 px-5 py-3">
            <h2 className="text-sm font-medium text-navy-900">Cargas</h2>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação">
              {filters.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    filter === f.value
                      ? "border-transparent bg-brand-200 text-brand-900 ring-1 ring-brand-600"
                      : "border-navy-300 text-navy-700 hover:bg-navy-50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {list.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-navy-500">Nenhuma carga neste período e filtro.</p>
          ) : (
            <div className="max-h-[40rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-navy-50 text-xs uppercase text-navy-500">
                  <tr>
                    <th className="px-5 py-2 font-medium">Data</th>
                    <th className="px-3 py-2 font-medium">Empresa</th>
                    <th className="px-3 py-2 font-medium">Placa / motorista</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">NF / CTE</th>
                    <th className="px-5 py-2 font-medium">Entregas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {list.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-5 py-2 tabular-nums text-navy-800">{fmtDate(r.schedule_date)}</td>
                      <td className="px-3 py-2 font-medium text-navy-900">{r.client_name}</td>
                      <td className="px-3 py-2 text-navy-700">
                        <span className="font-medium tracking-wide">
                          {r.plate || "—"}
                          {r.trailer_plate ? ` / ${r.trailer_plate}` : ""}
                        </span>
                        <span className="block text-xs text-navy-500">{r.driver || "—"}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${loadingStatusBadge(r.status)}`}>
                          {loadingStatusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-navy-700">
                        {r.proofs.length === 0 ? (
                          <span className="text-navy-400">—</span>
                        ) : (
                          r.proofs.map((p) => (
                            <span key={p.id} className="block whitespace-nowrap">
                              NF {p.invoice_number}
                              {p.cte_number ? ` · CTE ${p.cte_number}` : ""}
                            </span>
                          ))
                        )}
                      </td>
                      <td className="px-5 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {r.dests.map((d) => {
                            const has = r.sent.includes(d);
                            return (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setOpen({ load: r, destination: d })}
                                title={has ? "Ver comprovante" : "Comprovante ainda não enviado"}
                                className={`rounded-md border px-2 py-0.5 text-xs font-medium ${
                                  has
                                    ? "border-transparent bg-teal-200 text-teal-900 hover:brightness-110"
                                    : "border-amber-400 text-navy-700 hover:bg-amber-50"
                                }`}
                              >
                                {has ? "✓ " : ""}
                                {d || "Entrega"}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {open && <ProofDetail load={open.load} destination={open.destination} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ProofDetail({ load, destination, onClose }: { load: PortalLoad; destination: string; onClose: () => void }) {
  const proof = load.proofs.find((p) => p.destination === destination) ?? null;
  const diff = proof ? Number(proof.unloaded_weight_kg) - Number(proof.invoice_weight_kg) : 0;
  const photo = (n: number, download = false) => `/api/portal/foto?proof=${proof?.id}&n=${n}${download ? "&download=1" : ""}`;

  async function downloadAll() {
    if (!proof) return;
    for (let i = 0; i < proof.photo_count; i++) {
      const a = document.createElement("a");
      a.href = photo(i, true);
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 600));
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="portal-proof-title" className="max-w-xl">
      <h2 id="portal-proof-title" className="text-base font-medium">
        Comprovante de entrega · {destination || "Entrega"}
      </h2>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <Field label="Empresa" value={load.client_name} />
        <Field label="Data da carga" value={fmtDate(load.schedule_date)} />
        <Field label="Placa" value={`${load.plate || "—"}${load.trailer_plate ? ` / ${load.trailer_plate}` : ""}`} />
        <Field label="Motorista" value={load.driver || "—"} />
        {proof && (
          <>
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
              label="Enviado em"
              value={new Date(proof.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            />
          </>
        )}
      </dl>
      {!proof ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          O comprovante desta entrega ainda não foi enviado pelo motorista.
        </p>
      ) : (
        <>
          {proof.notes?.trim() && (
            <div className="mt-4">
              <span className="text-[11px] uppercase text-navy-500">Observação do motorista</span>
              <p className="mt-0.5 whitespace-pre-line text-sm text-navy-900">{proof.notes}</p>
            </div>
          )}
          <div className="mt-4">
            <span className="text-[11px] uppercase text-navy-500">Fotos (canhoto e ticket)</span>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {Array.from({ length: proof.photo_count }).map((_, i) => (
                <a key={i} href={photo(i)} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo(i)} alt={`Foto ${i + 1} do comprovante`} className="h-44 w-full rounded-lg border border-navy-200 object-cover" />
                </a>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="mt-5 flex justify-end gap-2">
        {proof && proof.photo_count > 0 && (
          <button type="button" onClick={downloadAll} className={buttonClasses("soft")}>
            {proof.photo_count > 1 ? `Baixar (${proof.photo_count} fotos)` : "Baixar"}
          </button>
        )}
        <button type="button" onClick={onClose} className={buttonClasses("secondary")}>
          Fechar
        </button>
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
