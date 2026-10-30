"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { loadingStatusBadge, loadingStatusLabel } from "@/lib/loadingStatus";
import { baseCity, splitDestinations } from "@/components/Destinations";
import { DeliveryProofDestinations } from "@/components/DeliveryProofDestinations";

// Gestão dos comprovantes de entrega: quais cargas já têm comprovante, quais
// ainda não, e o alerta das viagens concluídas há 3 dias ou mais sem todos os
// comprovantes. Uma carga só está completa quando TODOS os destinos têm comprovante.

const ALERT_DAYS = 3;

const selectCls =
  "rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

interface Load {
  id: string;
  schedule_date: string;
  client_name: string;
  cargo: string;
  destination: string | null;
  plate: string | null;
  driver: string | null;
  status: string;
  delivered_at: string | null;
}

type Situation = "completa" | "parcial" | "pendente";
type Filter = "todas" | "alerta" | "pendente" | "parcial" | "completa";

interface ProofDoc {
  id: string;
  destination: string;
  nf: string;
  cte: string | null;
  /** Último envio por e-mail pelo CotaFlow (ou null). */
  emailedAt: string | null;
}

interface Row extends Load {
  /** NF e CTE de cada comprovante já enviado. */
  docs: ProofDoc[];
  dests: string[];
  sent: string[];
  situation: Situation;
  /** Dias corridos desde a conclusão (só para cargas concluídas). */
  daysSince: number | null;
  alert: boolean;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}
// Só letras e números, minúsculo: "30625.30626" e "3062530626" são o mesmo número.
function norm(v: string | null | undefined): string {
  return (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR");
}

// Carga concluída antes da migration não tem o momento exato: vale a data da carga.
function concludedOn(l: Load): string {
  return l.delivered_at ? localDate(new Date(l.delivered_at)) : l.schedule_date;
}

function daysBetween(fromIso: string, to: Date): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

// Histórico do período, em páginas (o servidor devolve no máximo 1.000 linhas por vez).
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const all: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await build(offset, offset + 999);
    if (error) throw new Error(error.message);
    all.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return all;
}

export default function ComprovantesPage() {
  const { canEditSchedule } = useAuth();
  const [from, setFrom] = useState(() => localDate(addDays(new Date(), -30)));
  const [to, setTo] = useState(() => localDate(new Date()));
  const [client, setClient] = useState("");
  const [destFilter, setDestFilter] = useState("");
  const [status, setStatus] = useState<"" | "em_viagem" | "entregue">("");
  const [filter, setFilter] = useState<Filter>("todas");
  const [search, setSearch] = useState("");
  const [loads, setLoads] = useState<Load[] | null>(null);
  const [proofs, setProofs] = useState<Map<string, ProofDoc[]>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Só cargas que já saíram (em viagem ou concluídas) têm comprovante a cobrar.
      const rows = await fetchAll<Load>((a, b) =>
        supabase
          .from("loading_schedules")
          .select("id, schedule_date, client_name, cargo, destination, plate, driver, status, delivered_at")
          .in("status", ["em_viagem", "entregue"])
          .gte("schedule_date", from)
          .lte("schedule_date", to)
          .order("schedule_date", { ascending: false })
          .range(a, b)
      );
      const ids = rows.map((r) => r.id);
      const map = new Map<string, ProofDoc[]>();
      for (let i = 0; i < ids.length; i += 200) {
        const part = await fetchAll<{ id: string; schedule_id: string; destination: string; invoice_number: string; cte_number: string | null }>((a, b) =>
          supabase
            .from("delivery_proofs")
            .select("id, schedule_id, destination, invoice_number, cte_number")
            .in("schedule_id", ids.slice(i, i + 200))
            .range(a, b)
        );
        // Envios por e-mail feitos pelo CotaFlow (o mais recente de cada comprovante).
        const sent = new Map<string, string>();
        const proofIds = part.map((p) => p.id);
        for (let j = 0; j < proofIds.length; j += 200) {
          const mails = await fetchAll<{ proof_id: string; sent_at: string }>((a, b) =>
            supabase
              .from("delivery_proof_emails")
              .select("proof_id, sent_at")
              .in("proof_id", proofIds.slice(j, j + 200))
              .range(a, b)
          );
          for (const m of mails) if (!sent.has(m.proof_id) || sent.get(m.proof_id)! < m.sent_at) sent.set(m.proof_id, m.sent_at);
        }
        for (const p of part) {
          map.set(p.schedule_id, [
            ...(map.get(p.schedule_id) ?? []),
            { id: p.id, destination: p.destination, nf: p.invoice_number, cte: p.cte_number, emailedAt: sent.get(p.id) ?? null },
          ]);
        }
      }
      setProofs(map);
      setLoads(rows);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
      setLoads([]);
    }
  }, [from, to]);

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, [load]);

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    return (loads ?? []).map((l) => {
      const d = splitDestinations(l.destination);
      const dests = d.length > 0 ? d : [""];
      const docs = proofs.get(l.id) ?? [];
      const sent = dests.filter((x) => docs.some((p) => p.destination === x));
      const situation: Situation = sent.length === dests.length ? "completa" : sent.length === 0 ? "pendente" : "parcial";
      const daysSince = l.status === "entregue" ? daysBetween(concludedOn(l), now) : null;
      return { ...l, docs, dests, sent, situation, daysSince, alert: situation !== "completa" && daysSince !== null && daysSince >= ALERT_DAYS };
    });
  }, [loads, proofs]);

  const clients = useMemo(() => Array.from(new Set(rows.map((r) => r.client_name))).sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);

  // Cidades de entrega do período (sem o "(2)" das entregas repetidas), para o filtro de destino.
  const destinations = useMemo(
    () =>
      Array.from(new Set(rows.flatMap((r) => r.dests.map(baseCity)).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [rows]
  );

  // Filtros comuns (cliente, status da carga e busca): os indicadores e a lista usam o mesmo recorte.
  const scoped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDoc = norm(search);
    return rows.filter(
      (r) =>
        (!client || r.client_name === client) &&
        (!destFilter || r.dests.some((d) => baseCity(d).toLowerCase() === destFilter.toLowerCase())) &&
        (!status || r.status === status) &&
        (!q ||
          [r.plate, r.driver, r.cargo, r.destination].some((v) => (v ?? "").toLowerCase().includes(q)) ||
          // NF e CTE: compara só os dígitos/letras, para achar mesmo com ponto ou espaço de diferença.
          (qDoc.length >= 3 && r.docs.some((p) => [p.nf, p.cte].some((v) => norm(v).includes(qDoc)))))
    );
  }, [rows, client, destFilter, status, search]);

  const counts = useMemo(
    () => ({
      completa: scoped.filter((r) => r.situation === "completa").length,
      parcial: scoped.filter((r) => r.situation === "parcial").length,
      pendente: scoped.filter((r) => r.situation === "pendente").length,
      alerta: scoped.filter((r) => r.alert).length,
    }),
    [scoped]
  );

  const list = useMemo(() => {
    const f = scoped.filter((r) => {
      if (filter === "alerta") return r.alert;
      if (filter === "todas") return true;
      return r.situation === filter;
    });
    // Em alerta primeiro (mais antigos antes), depois por data da carga, mais recente primeiro.
    return f.sort((a, b) => Number(b.alert) - Number(a.alert) || (b.alert && a.alert ? (b.daysSince ?? 0) - (a.daysSince ?? 0) : 0) || b.schedule_date.localeCompare(a.schedule_date));
  }, [scoped, filter]);

  const kpis: { label: string; value: number; tone: string; hint: string }[] = [
    { label: "Em alerta", value: counts.alerta, tone: "text-red-700", hint: `Viagens concluídas há ${ALERT_DAYS} dias ou mais sem todos os comprovantes` },
    { label: "Sem comprovante", value: counts.pendente, tone: "text-amber-700", hint: "Nenhum destino com comprovante" },
    { label: "Parciais", value: counts.parcial, tone: "text-navy-900", hint: "Alguns destinos com comprovante, outros não" },
    { label: "Completas", value: counts.completa, tone: "text-teal-700", hint: "Todos os destinos com comprovante" },
  ];
  const filters: { value: Filter; label: string }[] = [
    { value: "todas", label: `Todas (${scoped.length})` },
    { value: "alerta", label: `Em alerta (${counts.alerta})` },
    { value: "pendente", label: `Sem comprovante (${counts.pendente})` },
    { value: "parcial", label: `Parciais (${counts.parcial})` },
    { value: "completa", label: `Completas (${counts.completa})` },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Comprovantes de entrega</h1>
      <p className="mt-1 text-sm text-navy-500">
        Cargas em viagem e concluídas: quais já têm comprovante e quais faltam. Uma carga só está completa quando todos os
        destinos têm comprovante. Viagens concluídas há {ALERT_DAYS} dias ou mais sem todos os comprovantes ficam em alerta.
      </p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cp-de" className="mb-1 block text-xs font-medium text-navy-600">
            De (data da carga)
          </label>
          <input id="cp-de" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={selectCls} />
        </div>
        <div>
          <label htmlFor="cp-ate" className="mb-1 block text-xs font-medium text-navy-600">
            Até
          </label>
          <input id="cp-ate" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className={selectCls} />
        </div>
        <div>
          <label htmlFor="cp-cliente" className="mb-1 block text-xs font-medium text-navy-600">
            Cliente
          </label>
          <select id="cp-cliente" value={client} onChange={(e) => setClient(e.target.value)} className={selectCls}>
            <option value="">Todos os clientes</option>
            {clients.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cp-destino" className="mb-1 block text-xs font-medium text-navy-600">
            Destino
          </label>
          <select id="cp-destino" value={destFilter} onChange={(e) => setDestFilter(e.target.value)} className={selectCls}>
            <option value="">Todos os destinos</option>
            {destinations.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cp-status" className="mb-1 block text-xs font-medium text-navy-600">
            Status da carga
          </label>
          <select id="cp-status" value={status} onChange={(e) => setStatus(e.target.value as "" | "em_viagem" | "entregue")} className={selectCls}>
            <option value="">Em viagem e concluídas</option>
            <option value="em_viagem">Carregado em viagem</option>
            <option value="entregue">Entrega concluída</option>
          </select>
        </div>
        <div>
          <label htmlFor="cp-busca" className="mb-1 block text-xs font-medium text-navy-600">
            Buscar
          </label>
          <input id="cp-busca" type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Placa, motorista, destino, NF ou CTE" className={`${selectCls} w-64`} />
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
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="rounded-xl border border-navy-200 bg-white px-4 py-3 shadow-sm" title={k.hint}>
                <div className="text-xs text-navy-500">{k.label}</div>
                <div className={`mt-1 text-2xl font-semibold tabular-nums ${k.tone}`}>{k.value}</div>
              </div>
            ))}
          </div>

          <section className="mt-6 rounded-xl border border-navy-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-navy-200 px-5 py-3">
              <h2 className="text-sm font-medium text-navy-900">Cargas · alertas primeiro</h2>
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
              <p className="px-5 py-8 text-center text-sm text-navy-500">Nenhuma carga nesta situação.</p>
            ) : (
              <div className="max-h-[40rem] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-navy-50 text-xs uppercase text-navy-500">
                    <tr>
                      <th className="px-5 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">Cliente</th>
                      <th className="px-3 py-2 font-medium">Carga</th>
                      <th className="px-3 py-2 font-medium">Placa / motorista</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Comprovantes</th>
                      <th className="px-3 py-2 font-medium">NF / CTE</th>
                      <th className="px-5 py-2 font-medium">Destinos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {list.map((r) => (
                      <tr key={r.id} className={r.alert ? "bg-red-50/60" : undefined}>
                        <td className="whitespace-nowrap px-5 py-2 tabular-nums text-navy-800">{fmtDate(r.schedule_date)}</td>
                        <td className="px-3 py-2 font-medium text-navy-900">{r.client_name}</td>
                        <td className="px-3 py-2 text-navy-800">{r.cargo}</td>
                        <td className="px-3 py-2 text-navy-700">
                          <span className="font-medium tracking-wide">{r.plate || "—"}</span>
                          <span className="block text-xs text-navy-500">{r.driver || "—"}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${loadingStatusBadge(r.status)}`}>
                            {loadingStatusLabel(r.status)}
                          </span>
                          {r.daysSince !== null && (
                            <span className="mt-0.5 block text-xs text-navy-500">
                              concluída {r.daysSince === 0 ? "hoje" : `há ${r.daysSince} ${r.daysSince === 1 ? "dia" : "dias"}`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              r.alert
                                ? "bg-red-100 text-red-800"
                                : r.situation === "completa"
                                  ? "bg-teal-100 text-teal-800"
                                  : r.situation === "parcial"
                                    ? "bg-navy-100 text-navy-700"
                                    : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {r.sent.length}/{r.dests.length}
                            {r.alert ? " · ⚠ em alerta" : r.situation === "completa" ? " · completa" : r.situation === "parcial" ? " · parcial" : " · sem comprovante"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-navy-700">
                          {r.docs.length === 0 ? (
                            <span className="text-navy-400">—</span>
                          ) : (
                            r.docs.map((p) => (
                              <span key={p.destination} className="block whitespace-nowrap">
                                {r.docs.length > 1 && <span className="text-navy-500">{p.destination || "Entrega"}: </span>}
                                NF {p.nf}
                                {p.cte ? ` · CTE ${p.cte}` : ""}
                                {p.emailedAt ? (
                                  <span className="ml-1 text-teal-700" title="Enviado por e-mail pelo CotaFlow">
                                    · ✉ {new Date(p.emailedAt).toLocaleDateString("pt-BR")}
                                  </span>
                                ) : (
                                  <span className="ml-1 text-navy-400">· não enviado</span>
                                )}
                              </span>
                            ))
                          )}
                        </td>
                        <td className="px-5 py-2">
                          <DeliveryProofDestinations
                            scheduleId={r.id}
                            destination={r.destination}
                            proofDestinations={r.sent}
                            canDelete={canEditSchedule}
                            onChanged={load}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="mt-3 text-xs text-navy-500">
            O alerta conta {ALERT_DAYS} dias corridos a partir da conclusão da viagem (status Entrega Concluída). Para as cargas
            concluídas antes de esta tela existir, vale a data da carga.
          </p>
        </>
      )}
    </div>
  );
}
