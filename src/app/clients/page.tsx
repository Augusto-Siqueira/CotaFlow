"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  CardActions,
  CardFields,
  CardField,
  CardHeader,
  CardHighlight,
  MobileCard,
  MobileCardList,
} from "@/components/MobileCard";
import { PDF_LAYOUTS, type PdfLayout } from "@/lib/pdfLayout";

interface Client {
  id: string;
  name: string;
  trade_name: string | null;
  document: string;
  segment: string | null;
  default_insurance_pct: number | null;
  pdf_layout: string;
  created_at: string;
}

interface FormState {
  name: string;
  trade_name: string;
  document: string;
  segment: string;
  default_insurance_pct: string;
  pdf_layout: PdfLayout;
}

const emptyForm: FormState = {
  name: "",
  trade_name: "",
  document: "",
  segment: "",
  default_insurance_pct: "",
  pdf_layout: "padrao",
};

export default function ClientsPage() {
  const { isAdmin } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadClients() {
    setLoadingList(true);
    setListError(null);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setListError(error.message);
    } else {
      setClients(data ?? []);
    }
    setLoadingList(false);
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadClients();
    });
  }, []);

  // Não existe uma tela de edição de cliente separada hoje — diferente de
  // status de cotação, aqui a lista é o único lugar onde dá pra mudar isso,
  // então a edição fica inline mesmo. Risco baixo: só troca o template do
  // PDF, não mexe em nenhum valor calculado.
  const [layoutError, setLayoutError] = useState<string | null>(null);
  async function updateLayout(clientId: string, nextLayout: string) {
    setLayoutError(null);
    const previous = clients.find((c) => c.id === clientId)?.pdf_layout;
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, pdf_layout: nextLayout } : c))
    );

    const { error } = await supabase
      .from("clients")
      .update({ pdf_layout: nextLayout })
      .eq("id", clientId);

    if (error && previous) {
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, pdf_layout: previous } : c))
      );
      setLayoutError(`Não foi possível salvar o layout (${error.message}).`);
    }
  }

  function startEditing(client: Client) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      trade_name: client.trade_name ?? "",
      document: client.document ?? "",
      segment: client.segment ?? "",
      default_insurance_pct:
        client.default_insurance_pct !== null
          ? String(client.default_insurance_pct)
          : "",
      pdf_layout: (client.pdf_layout as PdfLayout) ?? "padrao",
    });
    setFormErrors({});
    setSubmitError(null);
    setSuccessMessage(null);
    setShowForm(true);
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
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

  async function handleDelete(client: Client) {
    if (
      !confirm(
        `Excluir o cliente "${client.name}"? Essa ação não pode ser desfeita.`
      )
    ) {
      return;
    }
    setLayoutError(null);
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    if (error) {
      setLayoutError(
        error.code === "23503"
          ? `"${client.name}" tem cotações vinculadas e não pode ser excluído. Exclua ou mude as cotações antes.`
          : `Não foi possível excluir (${error.message}).`
      );
      return;
    }
    if (editingId === client.id) cancelEditing();
    await loadClients();
  }

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errors.name = "Informe a razão social do cliente.";
    if (!form.document.trim()) errors.document = "Informe o CNPJ ou CPF.";
    if (
      form.default_insurance_pct.trim() &&
      Number.isNaN(Number(form.default_insurance_pct.replace(",", ".")))
    ) {
      errors.default_insurance_pct = "Informe um número válido.";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    if (!validate()) return;

    setSubmitting(true);

    const insurancePct = form.default_insurance_pct.trim()
      ? Number(form.default_insurance_pct.replace(",", "."))
      : null;

    const payload = {
      name: form.name.trim(),
      trade_name: form.trade_name.trim() || null,
      document: form.document.trim(),
      segment: form.segment.trim() || null,
      default_insurance_pct: insurancePct,
      pdf_layout: form.pdf_layout,
    };
    const { error } = editingId
      ? await supabase.from("clients").update(payload).eq("id", editingId)
      : await supabase.from("clients").insert(payload);

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    setForm(emptyForm);
    setSuccessMessage(
      editingId ? "Cliente atualizado com sucesso." : "Cliente cadastrado com sucesso."
    );
    setEditingId(null);
    setShowForm(false);
    await loadClients();
  }

  useEffect(() => {
    if (!showForm) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") cancelEditing();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showForm]);

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
            Clientes
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Cadastre clientes e consulte suas condições comerciais.
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Novo cliente
          </button>
        )}
      </div>

      <div>
        {isAdmin && showForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4 sm:items-center"
          onClick={cancelEditing}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-medium text-navy-900">
              {editingId ? "Editar cliente" : "Novo cliente"}
            </h2>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Razão Social <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Razão social do cliente"
                />
                {formErrors.name && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="trade_name"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Nome Fantasia
                </label>
                <input
                  id="trade_name"
                  type="text"
                  value={form.trade_name}
                  onChange={(e) => updateField("trade_name", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Nome fantasia (opcional)"
                />
              </div>

              <div>
                <label
                  htmlFor="document"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  CNPJ / CPF <span className="text-red-500">*</span>
                </label>
                <input
                  id="document"
                  type="text"
                  value={form.document}
                  onChange={(e) => updateField("document", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="00.000.000/0000-00"
                />
                {formErrors.document && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.document}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="segment"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Segmento
                </label>
                <input
                  id="segment"
                  type="text"
                  value={form.segment}
                  onChange={(e) => updateField("segment", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: Indústria, Varejo..."
                />
              </div>

              <div>
                <label
                  htmlFor="default_insurance_pct"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Seguro padrão (%)
                </label>
                <input
                  id="default_insurance_pct"
                  type="text"
                  inputMode="decimal"
                  value={form.default_insurance_pct}
                  onChange={(e) =>
                    updateField("default_insurance_pct", e.target.value)
                  }
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: 0.5"
                />
                {formErrors.default_insurance_pct && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.default_insurance_pct}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="pdf_layout"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Layout do PDF
                </label>
                <select
                  id="pdf_layout"
                  value={form.pdf_layout}
                  onChange={(e) =>
                    updateField("pdf_layout", e.target.value as PdfLayout)
                  }
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                >
                  {PDF_LAYOUTS.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-navy-500">
                  Formato da proposta em PDF gerada pra este cliente.
                </p>
              </div>

              {submitError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  Erro ao salvar: {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting
                  ? "Salvando..."
                  : editingId
                    ? "Salvar alterações"
                    : "Salvar cliente"}
              </button>
              <button
                type="button"
                onClick={cancelEditing}
                className="inline-flex items-center justify-center rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100"
              >
                Cancelar
              </button>
            </form>
          </div>
        </div>
        )}

        <div className="min-w-0">
          {successMessage && (
            <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
              {successMessage}
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-navy-200 px-6 py-4">
              <h2 className="text-base font-medium text-navy-900">
                Clientes cadastrados
              </h2>
              <span className="text-sm text-navy-500">
                {clients.length}{" "}
                {clients.length === 1 ? "cliente" : "clientes"}
              </span>
            </div>

            {layoutError && (
              <p className="border-b border-navy-100 px-6 py-2 text-xs text-red-600">
                {layoutError}
              </p>
            )}

            {loadingList ? (
              <div className="px-6 py-10 text-center text-sm text-navy-500">
                Carregando clientes...
              </div>
            ) : listError ? (
              <div className="px-6 py-10 text-center text-sm text-red-600">
                Erro ao carregar clientes: {listError}
              </div>
            ) : clients.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-navy-500">
                Nenhum cliente cadastrado ainda.
              </div>
            ) : (
              <>
                <div className="max-h-[70vh] overflow-y-auto sm:hidden">
                <MobileCardList>
                  {clients.map((client) => (
                    <MobileCard key={client.id}>
                      <CardHeader
                        title={client.name}
                        subtitle={
                          client.trade_name
                            ? `${client.trade_name} · ${client.document}`
                            : client.document
                        }
                      />

                      <CardHighlight
                        label="Seguro padrão"
                        value={
                          client.default_insurance_pct !== null
                            ? `${client.default_insurance_pct}%`
                            : "—"
                        }
                      />

                      <CardFields>
                        <CardField
                          label="Segmento"
                          value={client.segment || "—"}
                          wide
                        />
                      </CardFields>

                      <div className="mt-3">
                        <label className="text-[11px] font-medium uppercase tracking-wide text-navy-400">
                          Layout do PDF
                        </label>
                        <select
                          disabled={!isAdmin}
                          value={client.pdf_layout}
                          onChange={(e) => updateLayout(client.id, e.target.value)}
                          className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                        >
                          {PDF_LAYOUTS.map((l) => (
                            <option key={l.value} value={l.value}>
                              {l.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <CardActions>
                        <Link
                          href={`/clients/${client.id}/comparativo`}
                          className="text-brand-700 underline hover:text-brand-800"
                        >
                          Comparativo
                        </Link>
                        {isAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => startEditing(client)}
                              className="text-brand-700 underline hover:text-brand-800"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(client)}
                              className="text-red-600 hover:text-red-800"
                            >
                              Excluir
                            </button>
                          </>
                        )}
                      </CardActions>
                    </MobileCard>
                  ))}
                </MobileCardList>
                </div>

                <div className="hidden max-h-[70vh] overflow-auto sm:block">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                      <tr>
                        <th className="px-6 py-3 font-medium">Razão Social</th>
                        <th className="px-6 py-3 font-medium">Nome Fantasia</th>
                        <th className="px-6 py-3 font-medium">Documento</th>
                        <th className="px-6 py-3 font-medium">Segmento</th>
                        <th className="px-6 py-3 font-medium">Seguro padrão</th>
                        <th className="px-6 py-3 font-medium">Layout do PDF</th>
                        <th className="px-6 py-3 font-medium">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-100">
                      {clients.map((client) => (
                        <tr key={client.id} className="hover:bg-navy-50">
                          <td className="px-6 py-3 font-medium text-navy-900">
                            {client.name}
                          </td>
                          <td className="px-6 py-3 text-navy-600">
                            {client.trade_name || "—"}
                          </td>
                          <td className="px-6 py-3 text-navy-600">
                            {client.document}
                          </td>
                          <td className="px-6 py-3 text-navy-600">
                            {client.segment || "—"}
                          </td>
                          <td className="px-6 py-3 text-navy-600">
                            {client.default_insurance_pct !== null
                              ? `${client.default_insurance_pct}%`
                              : "—"}
                          </td>
                          <td className="px-6 py-3">
                            <select
                              disabled={!isAdmin}
                              value={client.pdf_layout}
                              onChange={(e) =>
                                updateLayout(client.id, e.target.value)
                              }
                              className="rounded-lg border border-navy-300 px-2 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                            >
                              {PDF_LAYOUTS.map((l) => (
                                <option key={l.value} value={l.value}>
                                  {l.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-3">
                              <Link
                                href={`/clients/${client.id}/comparativo`}
                                className="font-medium text-brand-700 underline hover:text-brand-800"
                              >
                                Comparativo
                              </Link>
                              {isAdmin && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startEditing(client)}
                                    className="font-medium text-brand-700 underline hover:text-brand-800"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(client)}
                                    className="font-medium text-red-600 hover:text-red-800"
                                  >
                                    Excluir
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
