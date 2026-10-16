"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { DataTable, type Column } from "@/components/DataTable";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";
import { Modal } from "@/components/Modal";

// Cadastro das oficinas usadas nos lançamentos da Manutenção, no mesmo
// formato do cadastro de clientes. Quem edita a Manutenção cadastra, edita e
// exclui; os demais só consultam.
interface Workshop {
  id: string;
  name: string;
  trade_name: string | null;
  document: string | null;
  segment: string | null;
}

interface FormState {
  name: string;
  trade_name: string;
  document: string;
  segment: string;
}

const emptyForm: FormState = { name: "", trade_name: "", document: "", segment: "" };

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function OficinasPage() {
  const { canEditMaintenance } = useAuth();
  const { confirm: askConfirm } = useFeedback();
  const [all, setAll] = useState<Workshop[]>([]);
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const workshops = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return all;
    const digits = q.replace(/\D/g, "");
    return all.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        (w.trade_name ?? "").toLowerCase().includes(q) ||
        (w.segment ?? "").toLowerCase().includes(q) ||
        (digits !== "" && (w.document ?? "").replace(/\D/g, "").includes(digits))
    );
  }, [all, search]);

  async function load() {
    setLoadingList(true);
    setListError(null);
    const { data, error } = await supabase
      .from("maintenance_workshops")
      .select("id, name, trade_name, document, segment")
      .order("name");
    if (error) setListError(error.message);
    else setAll((data as Workshop[] | null) ?? []);
    setLoadingList(false);
  }

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
  }, []);

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setFormErrors({});
    setSubmitError(null);
    setSuccessMessage(null);
    setShowForm(true);
  }

  function startEditing(w: Workshop) {
    setEditingId(w.id);
    setForm({
      name: w.name,
      trade_name: w.trade_name ?? "",
      document: w.document ?? "",
      segment: w.segment ?? "",
    });
    setFormErrors({});
    setSubmitError(null);
    setSuccessMessage(null);
    setShowForm(true);
  }

  function cancelEditing() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormErrors({});
    setSubmitError(null);
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleDelete(w: Workshop) {
    if (!(await askConfirm(`Excluir a oficina "${w.name}"? Essa ação não pode ser desfeita.`))) return;
    setActionError(null);
    const { error } = await supabase.from("maintenance_workshops").delete().eq("id", w.id);
    if (error) {
      setActionError(
        error.code === "23503"
          ? `"${w.name}" tem manutenções lançadas e não pode ser excluída.`
          : `Não foi possível excluir (${error.message}).`
      );
      return;
    }
    if (editingId === w.id) cancelEditing();
    await load();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errors.name = "Informe a razão social da oficina.";
    if (!form.document.trim()) errors.document = "Informe o CNPJ ou CPF.";
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    const payload = {
      name: form.name.trim(),
      trade_name: form.trade_name.trim() || null,
      document: form.document.trim(),
      segment: form.segment.trim() || null,
    };
    const { error } = editingId
      ? await supabase.from("maintenance_workshops").update(payload).eq("id", editingId)
      : await supabase.from("maintenance_workshops").insert(payload);
    setSubmitting(false);
    if (error) {
      setSubmitError(
        /duplicate|unique/i.test(error.message) ? "Já existe uma oficina com essa razão social." : error.message
      );
      return;
    }
    setForm(emptyForm);
    setSuccessMessage(editingId ? "Oficina atualizada com sucesso." : "Oficina cadastrada com sucesso.");
    setEditingId(null);
    setShowForm(false);
    await load();
  }

  const columns: Column<Workshop>[] = [
    {
      key: "name",
      header: "Razão Social",
      cell: (w) => w.name,
      mobile: "title",
      className: "font-medium text-navy-900",
    },
    {
      key: "trade_name",
      header: "Nome Fantasia",
      cell: (w) => w.trade_name || "—",
      mobile: "subtitle",
      mobileCell: (w) => w.trade_name || null,
    },
    {
      key: "document",
      header: "Documento",
      cell: (w) => w.document || "—",
      mobile: "subtitle",
    },
    {
      key: "segment",
      header: "Segmento",
      cell: (w) => w.segment || "—",
      mobile: "wideField",
    },
    ...(canEditMaintenance
      ? [
          {
            key: "actions",
            header: "Ações",
            cell: (w: Workshop) => (
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => startEditing(w)} className={buttonClasses("soft", "sm")}>
                  Editar
                </button>
                <button type="button" onClick={() => handleDelete(w)} className={buttonClasses("danger", "sm")}>
                  Excluir
                </button>
              </div>
            ),
            mobile: "actions" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Oficinas</h1>
          <p className="mt-1 text-sm text-navy-500">Oficinas usadas nos lançamentos da Manutenção.</p>
        </div>
        {canEditMaintenance && (
          <button type="button" onClick={openNew} className={`${buttonClasses("primary")} shrink-0`}>
            Nova oficina
          </button>
        )}
      </div>

      {canEditMaintenance && showForm && (
        <Modal onClose={cancelEditing} labelledBy="workshop-modal-title" className="max-w-lg">
          <h2 id="workshop-modal-title" className="text-base font-medium text-navy-900">
            {editingId ? "Editar oficina" : "Nova oficina"}
          </h2>
          <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
            <div>
              <label htmlFor="of-name" className="mb-1 block text-sm font-medium text-navy-700">
                Razão Social <span className="text-red-500">*</span>
              </label>
              <input
                id="of-name"
                type="text"
                value={form.name}
                onChange={(e) => updateField("name", e.target.value)}
                className={inputCls}
                placeholder="Razão social da oficina"
              />
              {formErrors.name && <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>}
            </div>
            <div>
              <label htmlFor="of-trade" className="mb-1 block text-sm font-medium text-navy-700">
                Nome Fantasia
              </label>
              <input
                id="of-trade"
                type="text"
                value={form.trade_name}
                onChange={(e) => updateField("trade_name", e.target.value)}
                className={inputCls}
                placeholder="Nome fantasia (opcional)"
              />
            </div>
            <div>
              <label htmlFor="of-doc" className="mb-1 block text-sm font-medium text-navy-700">
                CNPJ / CPF <span className="text-red-500">*</span>
              </label>
              <input
                id="of-doc"
                type="text"
                value={form.document}
                onChange={(e) => updateField("document", e.target.value)}
                className={inputCls}
                placeholder="00.000.000/0000-00"
              />
              {formErrors.document && <p className="mt-1 text-xs text-red-600">{formErrors.document}</p>}
            </div>
            <div>
              <label htmlFor="of-segment" className="mb-1 block text-sm font-medium text-navy-700">
                Segmento
              </label>
              <input
                id="of-segment"
                type="text"
                value={form.segment}
                onChange={(e) => updateField("segment", e.target.value)}
                className={inputCls}
                placeholder="Ex: Mecânica, Elétrica, Borracharia..."
              />
            </div>
            {submitError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Erro ao salvar: {submitError}</div>
            )}
            <button type="submit" disabled={submitting} className={`${buttonClasses("primary")} mt-2`}>
              {submitting ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar oficina"}
            </button>
            <button type="button" onClick={cancelEditing} className={buttonClasses("secondary", "md")}>
              Cancelar
            </button>
          </form>
        </Modal>
      )}

      {successMessage && (
        <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">{successMessage}</div>
      )}
      <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-navy-200 px-6 py-4">
          <h2 className="text-base font-medium text-navy-900">Oficinas cadastradas</h2>
          <label htmlFor="of-busca" className="sr-only">
            Buscar oficina
          </label>
          <input
            id="of-busca"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por razão social, fantasia ou CNPJ..."
            className="order-last w-full rounded-lg border border-navy-300 px-3 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:order-none sm:w-80"
          />
          <span className="text-sm text-navy-500">
            {workshops.length} {workshops.length === 1 ? "oficina" : "oficinas"}
          </span>
        </div>
        {actionError && <p className="border-b border-navy-100 px-6 py-2 text-xs text-red-600">{actionError}</p>}
        {loadingList ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">Carregando oficinas...</div>
        ) : listError ? (
          <div className="px-6 py-10 text-center text-sm text-red-600">Erro ao carregar oficinas: {listError}</div>
        ) : workshops.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">
            {all.length === 0 ? "Nenhuma oficina cadastrada ainda." : "Nenhuma oficina encontrada para essa busca."}
          </div>
        ) : (
          <DataTable rows={workshops} rowKey={(w) => w.id} columns={columns} />
        )}
      </div>
    </div>
  );
}
