"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { normalizePlate } from "@/lib/fleet";
import { SearchSelect } from "@/components/SearchSelect";
import {
  LOADING_STATUSES,
  loadingStatusBadge,
  loadingStatusLabel,
} from "@/lib/loadingStatus";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { StepperControl } from "@/components/StepperControl";

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
  const { toastError, confirm: askConfirm } = useFeedback();
  const today = toIsoDate(new Date());

  const [date, setDate] = useState(today);
  // Status escolhido nos contadores do topo ("" = todos).
  const [statusFilter, setStatusFilter] = useState("");
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
          .eq("status", "vigente")
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
      if (statusFilter && r.status !== statusFilter) continue;
      const key = r.client_name.trim() || "Sem cliente";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return Array.from(map.entries());
  }, [rows, statusFilter]);

  const vigenteIds = useMemo(() => new Set(quotes.map((q) => q.id)), [quotes]);

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
    const list = name
      ? quotes.filter((q) => q.clients?.name.toLowerCase() === name)
      : [];
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
      toastError(`Não foi possível atualizar o status (${error.message}).`);
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

  const [showDup, setShowDup] = useState(false);
  const [dupDate, setDupDate] = useState("");
  const [dupSelected, setDupSelected] = useState<Set<string>>(new Set());
  const [dupTargetCount, setDupTargetCount] = useState<number | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);

  async function countOnDate(d: string) {
    const { count } = await supabase
      .from("loading_schedules")
      .select("id", { count: "exact", head: true })
      .eq("schedule_date", d);
    setDupTargetCount(count ?? 0);
  }

  function openDuplicate() {
    const target = shiftDate(date, 1);
    setDupDate(target);
    setDupSelected(new Set(rows.map((r) => r.id)));
    setDupTargetCount(null);
    setDupError(null);
    setShowDup(true);
    countOnDate(target);
  }

  function changeDupDate(d: string) {
    setDupDate(d);
    setDupTargetCount(null);
    if (d) countOnDate(d);
  }

  function toggleDup(id: string) {
    setDupSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDuplicate() {
    if (!dupDate) {
      setDupError("Escolha a data de destino.");
      return;
    }
    const chosen = rows.filter((r) => dupSelected.has(r.id));
    if (chosen.length === 0) {
      setDupError("Marque ao menos uma carga.");
      return;
    }

    setDupBusy(true);
    setDupError(null);
    // Tudo igual, menos a data e o status: a carga nova volta a "Programado".
    const { error } = await supabase.from("loading_schedules").insert(
      chosen.map((r) => ({
        schedule_date: dupDate,
        client_name: r.client_name,
        cargo: r.cargo,
        origin: r.origin,
        destination: r.destination,
        weight: r.weight,
        plate: r.plate,
        trailer_plate: r.trailer_plate,
        driver: r.driver,
        loading_time: r.loading_time,
        status: "programado",
        // Só mantém o vínculo se a cotação ainda é vigente.
        quote_id: r.quote_id && vigenteIds.has(r.quote_id) ? r.quote_id : null,
      }))
    );
    setDupBusy(false);

    if (error) {
      setDupError(`Não foi possível duplicar (${error.message}).`);
      return;
    }

    setShowDup(false);
    if (dupDate !== date) setDate(dupDate);
    else await fetchRows(date);
  }

  async function handleDelete(load: Load) {
    if (!await askConfirm(`Excluir a carga "${load.cargo}" de ${load.client_name}?`)) return;
    const { error } = await supabase
      .from("loading_schedules")
      .delete()
      .eq("id", load.id);
    if (error) {
      toastError(`Não foi possível excluir (${error.message}).`);
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
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className={buttonClasses("secondary", "md")}
          >
            Imprimir
          </button>
          {canEditSchedule && (
            <>
            <button
              type="button"
              onClick={openDuplicate}
              disabled={rows.length === 0}
              className={buttonClasses("secondary", "md")}
            >
              Duplicar dia
            </button>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              Novo Embarque
            </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <StepperControl
            onPrev={() => setDate(shiftDate(date, -1))}
            onNext={() => setDate(shiftDate(date, 1))}
            prevLabel="Dia anterior"
            nextLabel="Próximo dia"
          >
            <input
              type="date"
              value={date}
              aria-label="Data da programação"
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="bg-transparent px-3 py-2 text-sm font-medium text-navy-900 outline-none focus:bg-brand-50"
            />
          </StepperControl>
          <button
            type="button"
            onClick={() => setDate(today)}
            disabled={date === today}
            className={buttonClasses("secondary", "md")}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setDate(shiftDate(today, 1))}
            disabled={date === shiftDate(today, 1)}
            className={buttonClasses("secondary", "md")}
          >
            Amanhã
          </button>
        </div>

        <div className="ml-auto flex flex-wrap gap-2 print:ml-0">
          {counts.map((c) => {
            const active = statusFilter === c.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={active}
                title={active ? "Mostrar todos" : `Filtrar por ${c.label}`}
                onClick={() => setStatusFilter(active ? "" : c.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${c.badge} ${
                  active
                    ? "ring-2 ring-brand-600 ring-offset-1"
                    : statusFilter
                      ? "opacity-50 hover:opacity-100"
                      : "hover:brightness-110"
                }`}
              >
                {c.label}: {c.count}
              </button>
            );
          })}
        </div>
      </div>

      {canEditSchedule && showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl border border-navy-200 bg-white p-6 shadow-sm print:hidden"
        >
          <h2 className="text-base font-medium text-navy-900">
            {editingId ? "Editar carregamento" : "Novo carregamento"}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-data">
                Data
              </label>
              <input id="prog-data"
                type="date"
                value={form.schedule_date}
                onChange={(e) => updateForm("schedule_date", e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-cliente">
                Cliente <span className="text-red-500">*</span>
              </label>
              <SearchSelect id="prog-cliente"
                value={form.client_name}
                onChange={(v) => updateForm("client_name", v)}
                options={clients.map((c) => ({ value: c.label }))}
                className={inputCls}
                placeholder="Escolha o cliente"
              />
              {fieldChecks.client_name === null && (
                <p className="mt-1 text-xs text-red-600">
                  Cliente não cadastrado. Escolha um da lista.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-horario">
                Horário
              </label>
              <input id="prog-horario"
                type="time"
                value={form.loading_time}
                onChange={(e) => updateForm("loading_time", e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-carga">
                Carga <span className="text-red-500">*</span>
              </label>
              <input id="prog-carga"
                type="text"
                value={form.cargo}
                onChange={(e) => updateForm("cargo", e.target.value)}
                className={inputCls}
                placeholder="Ex: Álcool etílico"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-peso">
                Peso
              </label>
              <input id="prog-peso"
                type="text"
                value={form.weight}
                onChange={(e) => updateForm("weight", e.target.value)}
                className={inputCls}
                placeholder="Ex: 28 ton"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-placa-do-cavalo-truck">
                Placa do cavalo / truck
              </label>
              <SearchSelect id="prog-placa-do-cavalo-truck"
                value={form.plate}
                onChange={(v) => updateForm("plate", normalizePlate(v))}
                options={tractorPlates.map((p) => ({ value: p }))}
                className={`${inputCls} uppercase tracking-wide`}
                placeholder="ABC1D23"
              />
              {fieldChecks.plate === null && (
                <p className="mt-1 text-xs text-red-600">
                  Placa não cadastrada na frota.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-placa-do-semi-reboque">
                Placa do semi-reboque
              </label>
              <SearchSelect id="prog-placa-do-semi-reboque"
                value={form.trailer_plate}
                onChange={(v) => updateForm("trailer_plate", normalizePlate(v))}
                options={trailerPlates.map((p) => ({ value: p }))}
                className={`${inputCls} uppercase tracking-wide`}
                placeholder="ABC1D23"
              />
              {fieldChecks.trailer_plate === null && (
                <p className="mt-1 text-xs text-red-600">
                  Placa não cadastrada na frota.
                </p>
              )}
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-origem-opcional">
                Origem <span className="text-navy-500">(opcional)</span>
              </label>
              <input id="prog-origem-opcional"
                type="text"
                value={form.origin}
                onChange={(e) => updateForm("origin", e.target.value)}
                className={inputCls}
                placeholder="Ex: Palhoça/SC"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-destino-opcional">
                Destino <span className="text-navy-500">(opcional)</span>
              </label>
              <input id="prog-destino-opcional"
                type="text"
                value={form.destination}
                onChange={(e) => updateForm("destination", e.target.value)}
                className={inputCls}
                placeholder="Ex: Ponta Grossa/PR"
              />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-motorista">
                Motorista
              </label>
              <SearchSelect id="prog-motorista"
                value={form.driver}
                onChange={(v) => updateForm("driver", v)}
                options={drivers.map((d) => ({
                  value: d.nickname,
                  hint: d.name,
                }))}
                className={inputCls}
                placeholder="Escolha o motorista"
              />
              {fieldChecks.driver === null && (
                <p className="mt-1 text-xs text-red-600">
                  Motorista não cadastrado. Escolha um da lista.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-status">
                Status
              </label>
              <select id="prog-status"
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
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-cotacao-vigente-opcional">
                Cotação vigente <span className="text-navy-500">(opcional)</span>
              </label>
              <select id="prog-cotacao-vigente-opcional"
                value={form.quote_id}
                onChange={(e) => updateForm("quote_id", e.target.value)}
                className={inputCls}
              >
                <option value="">Sem cotação</option>
                {form.quote_id && !vigenteIds.has(form.quote_id) && (
                  <option value={form.quote_id}>
                    Cotação atual (não está mais vigente)
                  </option>
                )}
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
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className={buttonClasses("secondary", "md")}
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
            {statusFilter && rows.length > 0
              ? "Nenhum carregamento com este status neste dia."
              : "Nenhum carregamento programado para este dia."}
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
                              <span className="block text-[11px] uppercase text-navy-500 lg:hidden">
                                Origem
                              </span>
                              {l.origin || "—"}
                            </div>
                          )}
                          {hasDestination && (
                            <div
                              className={`text-navy-700 ${l.destination?.trim() ? "" : "max-lg:hidden"}`}
                            >
                              <span className="block text-[11px] uppercase text-navy-500 lg:hidden">
                                Destino
                              </span>
                              {l.destination || "—"}
                            </div>
                          )}
                        </>
                      )}
                      <div className="text-navy-700">
                        <span className="block text-[11px] uppercase text-navy-500 lg:hidden">
                          Peso
                        </span>
                        {l.weight || "—"}
                      </div>
                      <div className="font-medium tracking-wide text-navy-900">
                        <span className="block text-[11px] font-normal uppercase text-navy-500 lg:hidden">
                          Cavalo
                        </span>
                        {l.plate || "—"}
                      </div>
                      {hasTrailer && (
                        <div
                          className={`font-medium tracking-wide text-navy-900 ${l.trailer_plate?.trim() ? "" : "max-lg:hidden"}`}
                        >
                          <span className="block text-[11px] font-normal uppercase text-navy-500 lg:hidden">
                            Carreta
                          </span>
                          {l.trailer_plate || "—"}
                        </div>
                      )}
                      <div className="text-navy-700">
                        <span className="block text-[11px] uppercase text-navy-500 lg:hidden">
                          Motorista
                        </span>
                        {l.driver || "—"}
                      </div>
                      <div className="text-navy-700">
                        <span className="block text-[11px] uppercase text-navy-500 lg:hidden">
                          Horário
                        </span>
                        {l.loading_time ? l.loading_time.slice(0, 5) : "—"}
                      </div>
                      <div className="col-span-2 lg:col-span-1">
                        {canEditSchedule ? (
                          <select
                            value={l.status}
                            onChange={(e) => changeStatus(l, e.target.value)}
                            className={`w-full min-w-0 max-w-[10.5rem] cursor-pointer truncate rounded-full border-0 py-1 pl-2.5 pr-1 text-[11px] print:appearance-none font-medium outline-none focus:ring-2 focus:ring-brand-500 ${loadingStatusBadge(
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
                            className={buttonClasses("soft", "sm")}
                          >
                            {l.quotes?.client_quote_number?.trim()
                              ? `Cotação ${l.quotes.client_quote_number.trim()}`
                              : "Ver cotação"}
                          </Link>
                        )}
                        {canEditSchedule && (
                          <span className="flex items-center gap-4 print:hidden">
                            <button
                              type="button"
                              onClick={() => openEdit(l)}
                              className={buttonClasses("soft", "sm")}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(l)}
                              className={buttonClasses("danger", "sm")}
                            >
                              Excluir
                            </button>
                          </span>
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

      {canEditSchedule && showDup && (
        <Modal onClose={() => setShowDup(false)} labelledBy="dup-modal-title" className="max-w-lg">
            <h2 id="dup-modal-title" className="text-base font-medium text-navy-900">
              Duplicar programação de{" "}
              {fromIsoDate(date).toLocaleDateString("pt-BR")}
            </h2>
            <p className="mt-1 text-sm text-navy-500">
              Escolha a data e as cargas que se repetem. As cópias entram como
              Programado.
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-duplicar-para-o-dia">
                Duplicar para o dia
              </label>
              <input id="prog-duplicar-para-o-dia"
                type="date"
                value={dupDate}
                onChange={(e) => changeDupDate(e.target.value)}
                className={inputCls}
              />
              {dupTargetCount !== null && dupTargetCount > 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  Esse dia já tem {dupTargetCount}{" "}
                  {dupTargetCount === 1 ? "carga" : "cargas"}. Elas serão
                  mantidas e as cópias só serão adicionadas.
                </p>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-navy-700">
                  Cargas ({dupSelected.size} de {rows.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDupSelected(
                      dupSelected.size === rows.length
                        ? new Set()
                        : new Set(rows.map((r) => r.id))
                    )
                  }
                  className={buttonClasses("soft", "sm")}
                >
                  {dupSelected.size === rows.length
                    ? "Desmarcar todas"
                    : "Marcar todas"}
                </button>
              </div>
              <ul className="max-h-60 divide-y divide-navy-100 overflow-y-auto rounded-lg border border-navy-200">
                {rows.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-navy-50">
                      <input
                        type="checkbox"
                        checked={dupSelected.has(r.id)}
                        onChange={() => toggleDup(r.id)}
                        className="mt-1"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-navy-900">
                          {r.client_name} — {r.cargo}
                        </span>
                        <span className="block truncate text-xs text-navy-500">
                          {[r.plate, r.trailer_plate, r.driver]
                            .filter(Boolean)
                            .join(" · ") || "Sem placa ou motorista"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            {dupError && (
              <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {dupError}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleDuplicate}
                disabled={dupBusy}
                className="flex-1 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {dupBusy
                  ? "Duplicando..."
                  : `Duplicar ${dupSelected.size} ${dupSelected.size === 1 ? "carga" : "cargas"}`}
              </button>
              <button
                type="button"
                onClick={() => setShowDup(false)}
                className={buttonClasses("secondary", "md")}
              >
                Cancelar
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
