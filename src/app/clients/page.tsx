"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface Client {
  id: string;
  name: string;
  document: string;
  segment: string | null;
  default_insurance_pct: number | null;
  created_at: string;
}

interface FormState {
  name: string;
  document: string;
  segment: string;
  default_insurance_pct: string;
}

const emptyForm: FormState = {
  name: "",
  document: "",
  segment: "",
  default_insurance_pct: "",
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
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
    loadClients();
  }, []);

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) errors.name = "Informe o nome do cliente.";
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

    const { error } = await supabase.from("clients").insert({
      name: form.name.trim(),
      document: form.document.trim(),
      segment: form.segment.trim() || null,
      default_insurance_pct: insurancePct,
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    setForm(emptyForm);
    setSuccessMessage("Cliente cadastrado com sucesso.");
    await loadClients();
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
          Clientes
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          Cadastre clientes e consulte suas condições comerciais.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-medium text-navy-900">
              Novo cliente
            </h2>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Nome do cliente"
                />
                {formErrors.name && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.name}</p>
                )}
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

              {submitError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  Erro ao salvar: {submitError}
                </div>
              )}

              {successMessage && (
                <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
                  {successMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Salvando..." : "Salvar cliente"}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
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
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                    <tr>
                      <th className="px-6 py-3 font-medium">Nome</th>
                      <th className="px-6 py-3 font-medium">Documento</th>
                      <th className="px-6 py-3 font-medium">Segmento</th>
                      <th className="px-6 py-3 font-medium">Seguro padrão</th>
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
                          <Link
                            href={`/clients/${client.id}/comparativo`}
                            className="font-medium text-brand-700 underline hover:text-brand-800"
                          >
                            Comparativo
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
