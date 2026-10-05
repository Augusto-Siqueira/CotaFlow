"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { normalizePlate } from "@/lib/fleet";
import {
  LOADING_STATUSES,
  loadingStatusBadge,
  loadingStatusLabel,
} from "@/lib/loadingStatus";

interface Load {
  id: string;
  schedule_date: string;
  client_name: string;
  cargo: string;
  origin: string | null;
  destination: string | null;
  weight: string | null;
  plate: string | null;
  trailer_plate: string | null;
  driver: string | null;
  loading_time: string | null;
  status: string;
  quote_id: string | null;
  quotes: { client_quote_number: string | null } | null;
}

interface QuoteOption {
  id: string;
  client_quote_number: string | null;
  origin: string | null;
  destination: string | null;
  clients: { name: string } | null;
}

interface FormState {
  schedule_date: string;
  client_name: string;
  cargo: string;
  origin: string;
  destination: string;
  weight: string;
  plate: string;
  trailer_plate: string;
  driver: string;
  loading_time: string;
  status: string;
  quote_id: string;
}

function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftDate(value: string, days: number): string {
  const d = fromIsoDate(value);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

function emptyForm(date: string): FormState {
  return {
    schedule_date: date,
    client_name: "",
    cargo: "",
    origin: "",
    destination: "",
    weight: "",
    plate: "",
    trailer_plate: "",
    driver: "",
    loading_time: "",
    status: "programado",
    quote_id: "",
  };
}

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function ProgramacaoPage() {
  const { canEditSchedule } = useAuth();
  const today = toIsoDate(new Date());

  const [date, setDate] = useState(today);
  const [data, setData] = useState<{
    date: string;
    rows: Load[];
    error: string | null;
  } | null>(null);
  const latestDate = useRef(date);

  const [clients, setClients] = useState<{ label: string; name: string }[]>([]);
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [tractorPlates, setTractorPlates] = useState<string[]>([]);
  const [trailerPlates, setTrailerPlates] = useState<string[]>([]);
  const [drivers, setDrivers] = useState<{ nickname: string; name: string }[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(today));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function fetchRows(d: string) {
    const { data: rows, error } = await supabase
      .from("loading_schedules")
      .select(
        "id, schedule_date, client_name, cargo, origin, destination, weight, plate, trailer_plate, driver, loading_time, status, quote_id, quotes(client_quote_number)"
      )
      .eq("schedule_date", d)
      .order("loading_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (d !== latestDate.current) return;
    setData({
      date: d,
      rows: (rows as Load[] | null) ?? [],
      error: error?.message ?? null,
    });
  }

  useEffect(() => {
    latestDate.current = date;
    fetchRows(date);
  }, [date]);

  useEffect(() => {
    async function loadOptions() {
      const [clientsRes, quotesRes, fleetRes, driversRes] = await Promise.all([
        supabase.from("clients").select("name, trade_name").order("name"),
        supabase
          .from("quotes")
          .select("id, client_quote_number, origin, destination, clients(name)")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase.from("fleet_units").select("plate, kind").order("plate"),
        supabase.from("drivers").select("name, nickname").order("nickname"),
      ]);
      setDrivers(
        (driversRes.data ?? []).map((d) => ({
          nickname: d.nickname?.trim() || d.name,
          name: d.name,
        }))
      );
      setClients(
        (clientsRes.data ?? [])
          .map((c) => ({ label: c.trade_name?.trim() || c.name, name: c.name }))
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
      );
      setQuotes((quotesRes.data as unknown as QuoteOption[]) ?? []);
      const fleet = fleetRes.data ?? [];
      setTractorPlates(
        fleet.filter((f) => f.kind !== "semirreboque").map((f) => f.plate)
      );
      setTrailerPlates(
        fleet.filter((f) => f.kind === "semirreboque").map((f) => f.plate)
      );
    }
    loadOptions();
  }, []);

  const loading = data === null || data.date !== date;
  const rows = useMemo(() => (loading ? [] : data!.rows), [loading, data]);

  const groups = useMemo(() => {
    const map = new Map<string, Load[]>();
    for (const r of rows) {
      const key = r.client_name.trim() || "Sem cliente";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return Array.from(map.entries());
  }, [rows]);

  const quoteLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of quotes) {
      m.set(
        q.id,
        `${q.client_quote_number?.trim() ? `${q.client_quote_number.trim()} · ` : ""}${q.clients?.name ?? "—"} · ${q.origin ?? "—"} → ${q.destination ?? "—"}`
      );
    }
    return m;
  }, [quotes]);

  const quoteOptions = useMemo(() => {
    const typed = form.client_name.trim().toLowerCase();
    const match = clients.find((c) => c.label.toLowerCase() === typed);
    const name = (match?.name ?? typed).toLowerCase();
    const filtered = name
      ? quotes.filter((q) => q.clients?.name.toLowerCase() === name)
      : quotes;
    const list = filtered.length > 0 ? filtered : quotes;
    const selected = quotes.find((q) => q.id === form.quote_id);
    return selected && !list.includes(selected) ? [selected, ...list] : list;
  }, [quotes, clients, form.client_name, form.quote_id]);

  // Cliente, placas e motorista só aceitam o que está cadastrado (o banco
  // também barra, ver migration 0045). Vazio é aceito nos opcionais; fora do
  // cadastro devolve null.
  function resolve(value: string, options: string[]): string | null {
    const v = value.trim();
    if (!v) return "";
    return options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? null;
  }

  const clientLabels = useMemo(() => clients.map((c) => c.label), [clients]);
  const driverNicks = useMemo(() => drivers.map((d) => d.nickname), [drivers]);

  const fieldChecks = {
    client_name: resolve(form.client_name, clientLabels),
    plate: resolve(form.plate, tractorPlates),
    trailer_plate: resolve(form.trailer_plate, trailerPlates),
    driver: resolve(form.driver, driverNicks),
  };

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm(date));
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(load: Load) {
    setEditingId(load.id);
    setForm({
      schedule_date: load.schedule_date,
      client_name: load.client_name,
      cargo: load.cargo,
      origin: load.origin ?? "",
      destination: load.destination ?? "",
      weight: load.weight ?? "",
      plate: load.plate ?? "",
      trailer_plate: load.trailer_plate ?? "",
      driver: load.driver ?? "",
      loading_time: load.loading_time?.slice(0, 5) ?? "",
      status: load.status,
      quote_id: load.quote_id ?? "",
    });
    setFormError(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_name.trim() || !form.cargo.trim()) {
      setFormError("Informe o cliente e a carga.");
      return;
    }
    if (!form.schedule_date) {
      setFormError("Informe a data.");
      return;
    }
    const invalid = [
      fieldChecks.client_name === null && "cliente",
      fieldChecks.plate === null && "placa do cavalo/truck",
      fieldChecks.trailer_plate === null && "placa do semi-reboque",
      fieldChecks.driver === null && "motorista",
    ].filter(Boolean);
    if (invalid.length > 0) {
      setFormError(
        `Escolha na lista um valor cadastrado para: ${invalid.join(", ")}.`
      );
      return;
    }

    const payload = {
      schedule_date: form.schedule_date,
      client_name: fieldChecks.client_name ?? form.client_name.trim(),
      cargo: form.cargo.trim(),
      origin: form.origin.trim() || null,
      destination: form.destination.trim() || null,
      weight: form.weight.trim() || null,
      plate: fieldChecks.plate || null,
      trailer_plate: fieldChecks.trailer_plate || null,
      driver: fieldChecks.driver || null,
      loading_time: form.loading_time || null,
      status: form.status,
      quote_id: form.quote_id || null,
    };

    setSaving(true);
    setFormError(null);
    const { error } = editingId
      ? await supabase.from("loading_schedules").update(payload).eq("id", editingId)
      : await supabase.from("loading_schedules").insert(payload);
    setSaving(false);

    if (error) {
      setFormError(`Não foi possível salvar (${error.message}).`);
      return;
    }

    closeForm();
    // Se a carga foi lançada pra outra data, leva o usuário até ela.
    if (payload.schedule_date !== date) {
      setDate(payload.schedule_date);
    } else {
      await fetchRows(date);
    }
  }

  async function changeStatus(load: Load, status: string) {
    const previous = load.status;
    setData((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) => (r.id === load.id ? { ...r, status } : r)),
          }
        : prev
    );
    const { error } = await supabase
      .from("loading_schedules")
      .update({ status })
      .eq("id", load.id);
    if (error) {
      alert(`Não foi possível atualizar o status (${error.message}).`);
      setData((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.id === load.id ? { ...r, status: previous } : r
              ),
            }
          : prev
      );
    }
  }

  async function handleDelete(load: Load) {
    if (!confirm(`Excluir a carga "${load.cargo}" de ${load.client_name}?`)) return;
    const { error } = await supabase
      .from("loading_schedules")
      .delete()
      .eq("id", load.id);
    if (error) {
      alert(`Não foi possível excluir (${error.message}).`);
      return;
    }
    await fetchRows(date);
  }

  const dateLabel = fromIsoDate(date).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const counts = LOADING_STATUSES.map((s) => ({
    ...s,
    count: rows.filter((r) => r.status === s.value).length,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
            Programação de carregamento
          </h1>
          <p className="mt-1 text-sm capitalize text-navy-500">{dateLabel}</p>
        </div>
        {canEditSchedule && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            + Novo carregamento
          </button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, -1))}
          className="rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-700 hover:bg-navy-100"
          aria-label="Dia anterior"
        >
          ←
        </button>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        <button
          type="button"
          onClick={() => setDate(shiftDate(date, 1))}
          className="rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-700 hover:bg-navy-100"
          aria-label="Próximo dia"
        >
          →
        </button>
        <button
          type="button"
          onClick={() => setDate(today)}
          disabled={date === today}
          className="rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100 disabled:opacity-50"
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => setDate(shiftDate(today, 1))}
          disabled={date === shiftDate(today, 1)}
          className="rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100 disabled:opacity-50"
        >
          Amanhã
        </button>

        <div className="ml-auto flex flex-wrap gap-2">
          {counts.map((c) => (
            <span
              key={c.value}
              className={`rounded-full px-3 py-1 text-xs font-medium ${c.badge}`}
            >
              {c.label}: {c.count}
            </span>
          ))}
        </div>
      </div>

      {canEditSchedule && showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl border border-navy-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-base font-medium text-navy-900">
            {editingId ? "Editar carregamento" : "Novo carregamento"}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Data
              </label>
              <input
                type="date"
                value={form.schedule_date}
                onChange={(e) => updateForm("schedule_date", e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Cliente <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                list="clientes-lista"
                value={form.client_name}
                onChange={(e) => updateForm("client_name", e.target.value)}
                className={inputCls}
                placeholder="Escolha o cliente"
              />
              <datalist id="clientes-lista">
                {clients.map((c) => (
                  <option key={c.label} value={c.label} />
                ))}
              </datalist>
              {fieldChecks.client_name === null && (
                <p className="mt-1 text-xs text-red-600">
                  Cliente não cadastrado. Escolha um da lista.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Horário
              </label>
              <input
                type="time"
                value={form.loading_time}
                onChange={(e) => updateForm("loading_time", e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Carga <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.cargo}
                onChange={(e) => updateForm("cargo", e.target.value)}
                className={inputCls}
                placeholder="Ex: Álcool etílico"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Peso
              </label>
              <input
                type="text"
                value={form.weight}
                onChange={(e) => updateForm("weight", e.target.value)}
                className={inputCls}
                placeholder="Ex: 28 ton"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Placa do cavalo / truck
              </label>
              <input
                type="text"
                list="placas-cavalo"
                value={form.plate}
                onChange={(e) => updateForm("plate", normalizePlate(e.target.value))}
                className={`${inputCls} uppercase tracking-wide`}
                placeholder="ABC1D23"
              />
              <datalist id="placas-cavalo">
                {tractorPlates.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              {fieldChecks.plate === null && (
                <p className="mt-1 text-xs text-red-600">
                  Placa não cadastrada na frota.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Placa do semi-reboque
              </label>
              <input
                type="text"
                list="placas-semi"
                value={form.trailer_plate}
                onChange={(e) =>
                  updateForm("trailer_plate", normalizePlate(e.target.value))
                }
                className={`${inputCls} uppercase tracking-wide`}
                placeholder="ABC1D23"
              />
              <datalist id="placas-semi">
                {trailerPlates.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              {fieldChecks.trailer_plate === null && (
                <p className="mt-1 text-xs text-red-600">
                  Placa não cadastrada na frota.
                </p>
              )}
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Origem <span className="text-navy-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={form.origin}
                onChange={(e) => updateForm("origin", e.target.value)}
                className={inputCls}
                placeholder="Ex: Palhoça/SC"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Destino <span className="text-navy-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={form.destination}
                onChange={(e) => updateForm("destination", e.target.value)}
                className={inputCls}
                placeholder="Ex: Ponta Grossa/PR"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Motorista
              </label>
              <input
                type="text"
                list="motoristas-lista"
                value={form.driver}
                onChange={(e) => updateForm("driver", e.target.value)}
                className={inputCls}
                placeholder="Escolha o motorista"
              />
              <datalist id="motoristas-lista">
                {drivers.map((d) => (
                  <option key={d.name} value={d.nickname} label={d.name} />
                ))}
              </datalist>
              {fieldChecks.driver === null && (
                <p className="mt-1 text-xs text-red-600">
                  Motorista não cadastrado. Escolha um da lista.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Status
              </label>
              <select
                value={form.status}
                onChange={(e) => updateForm("status", e.target.value)}
                className={inputCls}
              >
                {LOADING_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Cotação <span className="text-navy-400">(opcional)</span>
              </label>
              <select
                value={form.quote_id}
                onChange={(e) => updateForm("quote_id", e.target.value)}
                className={inputCls}
              >
                <option value="">Sem cotação</option>
                {quoteOptions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {quoteLabelById.get(q.id)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {loading ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
            Carregando programação...
          </div>
        ) : data?.error ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-red-600">
            Erro ao carregar: {data.error}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
            Nenhum carregamento programado para este dia.
          </div>
        ) : (
          groups.map(([client, loads]) => {
            const hasOrigin = loads.some((l) => l.origin?.trim());
            const hasDestination = loads.some((l) => l.destination?.trim());
            const hasTrailer = loads.some((l) => l.trailer_plate?.trim());
            const cols = [
              "2fr",
              hasOrigin ? "1.4fr" : null,
              hasDestination ? "1.4fr" : null,
              "1fr",
              "1fr",
              hasTrailer ? "1fr" : null,
              "1.6fr",
              "0.8fr",
              "1.8fr",
            ]
              .filter((c): c is string => c !== null)
              .map((c) => `minmax(0,${c})`)
              .join("_");
            return (
            <section
              key={client}
              className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm"
            >
              <header className="flex items-center justify-between border-b border-navy-200 bg-navy-50 px-5 py-3">
                <h2 className="text-sm font-semibold text-navy-900">{client}</h2>
                <span className="text-xs text-navy-500">
                  {loads.length} {loads.length === 1 ? "carga" : "cargas"}
                </span>
              </header>

              <div
                style={{ "--cols": cols.replaceAll("_", " ") } as React.CSSProperties}
                className="hidden gap-3 px-5 pt-3 text-xs font-medium uppercase tracking-wide text-navy-500 lg:grid lg:[grid-template-columns:var(--cols)]"
              >
                <span>Carga</span>
                {hasOrigin && <span>Origem</span>}
                {hasDestination && <span>Destino</span>}
                <span>Peso</span>
                <span>Cavalo</span>
                {hasTrailer && <span>Carreta</span>}
                <span>Motorista</span>
                <span>Horário</span>
                <span>Status</span>
              </div>

              <ul className="divide-y divide-navy-100">
                {loads.map((l) => (
                  <li key={l.id} className="px-5 py-3">
                    <div
                      style={{ "--cols": cols.replaceAll("_", " ") } as React.CSSProperties}
                      className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm lg:items-center lg:gap-3 lg:[grid-template-columns:var(--cols)]"
                    >
                      <div className="col-span-2 font-medium text-navy-900 lg:col-span-1">
                        {l.cargo}
                      </div>
                      {(hasOrigin || hasDestination) && (
                        <>
                          {hasOrigin && (
                            <div
                              className={`text-navy-700 ${l.origin?.trim() ? "" : "max-lg:hidden"}`}
                            >
                              <span className="block text-[11px] uppercase text-navy-400 lg:hidden">
                                Origem
                              </span>
                              {l.origin || "—"}
                            </div>
                          )}
                          {hasDestination && (
                            <div
                              className={`text-navy-700 ${l.destination?.trim() ? "" : "max-lg:hidden"}`}
                            >
                              <span className="block text-[11px] uppercase text-navy-400 lg:hidden">
                                Destino
                              </span>
                              {l.destination || "—"}
                            </div>
                          )}
                        </>
                      )}
                      <div className="text-navy-700">
                        <span className="block text-[11px] uppercase text-navy-400 lg:hidden">
                          Peso
                        </span>
                        {l.weight || "—"}
                      </div>
                      <div className="font-medium tracking-wide text-navy-900">
                        <span className="block text-[11px] font-normal uppercase text-navy-400 lg:hidden">
                          Cavalo
                        </span>
                        {l.plate || "—"}
                      </div>
                      {hasTrailer && (
                        <div
                          className={`font-medium tracking-wide text-navy-900 ${l.trailer_plate?.trim() ? "" : "max-lg:hidden"}`}
                        >
                          <span className="block text-[11px] font-normal uppercase text-navy-400 lg:hidden">
                            Carreta
                          </span>
                          {l.trailer_plate || "—"}
                        </div>
                      )}
                      <div className="text-navy-700">
                        <span className="block text-[11px] uppercase text-navy-400 lg:hidden">
                          Motorista
                        </span>
                        {l.driver || "—"}
                      </div>
                      <div className="text-navy-700">
                        <span className="block text-[11px] uppercase text-navy-400 lg:hidden">
                          Horário
                        </span>
                        {l.loading_time ? l.loading_time.slice(0, 5) : "—"}
                      </div>
                      <div className="col-span-2 lg:col-span-1">
                        {canEditSchedule ? (
                          <select
                            value={l.status}
                            onChange={(e) => changeStatus(l, e.target.value)}
                            className={`w-full min-w-0 max-w-[10.5rem] cursor-pointer truncate rounded-full border-0 py-1 pl-2.5 pr-1 text-[11px] font-medium outline-none focus:ring-2 focus:ring-brand-500 ${loadingStatusBadge(
                              l.status
                            )}`}
                          >
                            {LOADING_STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${loadingStatusBadge(
                              l.status
                            )}`}
                          >
                            {loadingStatusLabel(l.status)}
                          </span>
                        )}
                      </div>
                    </div>

                    {(l.quote_id || canEditSchedule) && (
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
                        {l.quote_id && (
                          <Link
                            href={`/quotes/${l.quote_id}`}
                            className="text-brand-700 underline hover:text-brand-800"
                          >
                            {l.quotes?.client_quote_number?.trim()
                              ? `Cotação ${l.quotes.client_quote_number.trim()}`
                              : "Ver cotação"}
                          </Link>
                        )}
                        {canEditSchedule && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(l)}
                              className="font-medium text-brand-700 underline hover:text-brand-800"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(l)}
                              className="font-medium text-red-600 hover:text-red-800"
                            >
                              Excluir
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            );
          })
        )}
      </div>
    </div>
  );
}
