"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { SearchSelect } from "@/components/SearchSelect";
import { DataTable, type Column } from "@/components/DataTable";
import { maskIntegerInput } from "@/lib/fuel";
import { SERVICE_ORDER_COLUMNS, formatOsDate, formatOsNumber, type ServiceOrder } from "@/lib/serviceOrders";

// Ordens de Serviço da Manutenção: só salvar e imprimir (por enquanto não
// conversa com as entradas na oficina nem com os defeitos relatados).

const KIND_LABEL: Record<string, string> = { cavalo: "Cavalo", semirreboque: "Semi-reboque", truck: "Truck" };

const inputCls =
  "w-full rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "mb-1 block text-sm font-medium text-navy-700";

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

interface FormState {
  service_date: string;
  plate: string;
  km: string;
  services: string;
  parts: string;
}

const emptyForm = (): FormState => ({ service_date: todayIso(), plate: "", km: "", services: "", parts: "" });

export default function ServiceOrdersPage() {
  const { user, canEditMaintenance } = useAuth();
  const { toastSuccess, toastError, confirm: askConfirm } = useFeedback();

  const [rows, setRows] = useState<ServiceOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fleet, setFleet] = useState<{ plate: string; kind: string }[]>([]);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ServiceOrder | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("maintenance_service_orders")
      .select(SERVICE_ORDER_COLUMNS)
      .order("number", { ascending: false })
      .limit(1000);
    if (error) {
      setLoadError(error.message);
      setRows([]);
      return;
    }
    setLoadError(null);
    setRows((data as ServiceOrder[] | null) ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    supabase
      .from("fleet_units")
      .select("plate, kind")
      .order("plate")
      .then(({ data }) => setFleet((data as { plate: string; kind: string }[] | null) ?? []));
  }, [load]);

  const plateOptions = useMemo(() => fleet.map((f) => ({ value: f.plate, hint: KIND_LABEL[f.kind] ?? f.kind })), [fleet]);
  const resolvedPlate = useMemo(() => {
    const v = form.plate.trim().replace(/[\s-]/g, "").toUpperCase();
    // Na edição, aceita a placa já gravada mesmo que o veículo tenha saído da frota.
    if (editing && v === editing.plate) return v;
    return fleet.find((f) => f.plate === v)?.plate ?? null;
  }, [form.plate, fleet, editing]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/[\s-]/g, "");
    if (!rows || !q) return rows ?? [];
    return rows.filter(
      (r) =>
        r.plate.toLowerCase().includes(q) ||
        formatOsNumber(r.number).includes(q) ||
        String(r.number) === q ||
        r.services.toLowerCase().includes(search.trim().toLowerCase()) ||
        r.parts.toLowerCase().includes(search.trim().toLowerCase())
    );
  }, [rows, search]);

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(os: ServiceOrder) {
    setEditing(os);
    setForm({
      service_date: os.service_date,
      plate: os.plate,
      km: os.km !== null ? os.km.toLocaleString("pt-BR") : "",
      services: os.services,
      parts: os.parts,
    });
    setFormError(null);
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.service_date) return setFormError("Informe a data.");
    if (!resolvedPlate) return setFormError("Escolha uma placa da frota.");
    const kmDigits = form.km.replace(/\D/g, "");
    if (!kmDigits) return setFormError("Informe o KM.");
    if (!form.services.trim()) return setFormError("Descreva os serviços.");

    const payload = {
      service_date: form.service_date,
      plate: resolvedPlate,
      km: Number(kmDigits),
      services: form.services.trim(),
      parts: form.parts.trim(),
    };
    setSaving(true);
    setFormError(null);
    const name = (user?.user_metadata?.name as string | undefined) ?? user?.email ?? null;
    const { data, error } = editing
      ? await supabase.from("maintenance_service_orders").update(payload).eq("id", editing.id).select("number").single()
      : await supabase
          .from("maintenance_service_orders")
          .insert({ ...payload, created_by_name: name })
          .select("number")
          .single();
    setSaving(false);
    if (error) {
      setFormError(`Não foi possível salvar (${error.message}).`);
      return;
    }
    setShowForm(false);
    toastSuccess(`Ordem de serviço nº ${formatOsNumber(data.number)} ${editing ? "atualizada" : "salva"}.`);
    load();
  }

  async function remove(os: ServiceOrder) {
    const ok = await askConfirm(`Excluir a ordem de serviço nº ${formatOsNumber(os.number)} (placa ${os.plate})?`);
    if (!ok) return;
    const { error } = await supabase.from("maintenance_service_orders").delete().eq("id", os.id);
    if (error) return toastError(`Não foi possível excluir (${error.message}).`);
    toastSuccess(`Ordem de serviço nº ${formatOsNumber(os.number)} excluída.`);
    load();
  }

  const columns: Column<ServiceOrder>[] = [
    { key: "number", header: "Nº", mobile: "title", cell: (r) => <span className="font-semibold text-navy-900">{formatOsNumber(r.number)}</span> },
    { key: "date", header: "Data", mobile: "subtitle", cell: (r) => formatOsDate(r.service_date) },
    { key: "plate", header: "Placa", mobile: "badge", cell: (r) => <span className="font-medium tracking-wide">{r.plate}</span> },
    { key: "km", header: "KM", mobile: "field", cell: (r) => (r.km !== null ? r.km.toLocaleString("pt-BR") : "—") },
    {
      key: "services",
      header: "Serviços",
      mobile: "wideField",
      className: "max-w-sm",
      cell: (r) => <span className="line-clamp-2 whitespace-pre-line">{r.services}</span>,
    },
    {
      key: "parts",
      header: "Peças",
      mobile: "wideField",
      className: "max-w-xs",
      cell: (r) => <span className="line-clamp-2 whitespace-pre-line">{r.parts || "—"}</span>,
    },
    {
      key: "actions",
      header: "",
      mobile: "actions",
      cell: (r) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <a href={`/api/ordens-servico/${r.id}/pdf`} target="_blank" rel="noopener" className={buttonClasses("soft", "sm")}>
            Imprimir
          </a>
          {canEditMaintenance && (
            <>
              <button type="button" onClick={() => openEdit(r)} className={buttonClasses("soft", "sm")}>
                Editar
              </button>
              <button type="button" onClick={() => remove(r)} className={buttonClasses("danger", "sm")}>
                Excluir
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Ordens de serviço</h1>
          <p className="mt-1 text-sm text-navy-500">Registre e imprima as ordens de serviço da frota.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/manutencao" className={buttonClasses("secondary", "md")}>
            Voltar
          </Link>
          {canEditMaintenance && (
            <button type="button" onClick={openNew} className={buttonClasses("primary", "md")}>
              Nova ordem de serviço
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 max-w-sm">
        <label htmlFor="os-busca" className="sr-only">
          Buscar
        </label>
        <input
          id="os-busca"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nº, placa, serviço ou peça"
          className={inputCls}
        />
      </div>

      <section className="mt-4">
        {loadError ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-red-600">
            Erro ao carregar: {loadError}
          </div>
        ) : rows === null ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
            {rows.length === 0 ? "Nenhuma ordem de serviço registrada." : "Nenhuma ordem de serviço encontrada."}
          </div>
        ) : (
          <div className="rounded-xl border border-navy-200 bg-white">
            <DataTable rows={filtered} columns={columns} rowKey={(r) => r.id} />
          </div>
        )}
      </section>

      {showForm && (
        <Modal onClose={() => setShowForm(false)} labelledBy="os-title" className="max-w-2xl">
          <form onSubmit={save}>
            <h2 id="os-title" className="text-base font-medium">
              {editing ? `Ordem de serviço nº ${formatOsNumber(editing.number)}` : "Nova ordem de serviço"}
            </h2>
            {!editing && <p className="mt-0.5 text-xs text-navy-500">O número é gerado ao salvar.</p>}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className={labelCls} htmlFor="os-data">
                  Data <span className="text-red-600">*</span>
                </label>
                <input
                  id="os-data"
                  type="date"
                  value={form.service_date}
                  onChange={(e) => setForm((f) => ({ ...f, service_date: e.target.value }))}
                  className={inputCls}
                  required
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="os-placa">
                  Placa <span className="text-red-600">*</span>
                </label>
                <SearchSelect
                  id="os-placa"
                  value={form.plate}
                  onChange={(v) => setForm((f) => ({ ...f, plate: v }))}
                  options={plateOptions}
                  className={inputCls}
                  placeholder="ABC1D23"
                />
                {form.plate.trim() && !resolvedPlate && (
                  <p className="mt-1 text-xs text-red-600">Placa não cadastrada. Escolha uma da lista.</p>
                )}
              </div>
              <div>
                <label className={labelCls} htmlFor="os-km">
                  KM <span className="text-red-600">*</span>
                </label>
                <input
                  id="os-km"
                  inputMode="numeric"
                  value={form.km}
                  onChange={(e) => setForm((f) => ({ ...f, km: maskIntegerInput(e.target.value) }))}
                  className={inputCls}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className={labelCls} htmlFor="os-servicos">
                Descrição dos serviços <span className="text-red-600">*</span>
              </label>
              <textarea
                id="os-servicos"
                rows={6}
                value={form.services}
                onChange={(e) => setForm((f) => ({ ...f, services: e.target.value }))}
                className={inputCls}
              />
            </div>
            <div className="mt-4">
              <label className={labelCls} htmlFor="os-pecas">
                Descrição das peças
              </label>
              <textarea
                id="os-pecas"
                rows={5}
                value={form.parts}
                onChange={(e) => setForm((f) => ({ ...f, parts: e.target.value }))}
                className={inputCls}
              />
            </div>
            {formError && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {formError}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className={buttonClasses("secondary", "md")}>
                Cancelar
              </button>
              <button type="submit" disabled={saving} className={buttonClasses("primary", "md")}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
