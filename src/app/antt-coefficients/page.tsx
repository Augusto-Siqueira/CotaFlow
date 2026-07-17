"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface AnttCoefficient {
  id: string;
  axles: number;
  cargo_type: string;
  ccd: number;
  cc: number;
}

interface FormState {
  axles: string;
  cargo_type: string;
  ccd: string;
  cc: string;
}

const emptyForm: FormState = {
  axles: "",
  cargo_type: "",
  ccd: "",
  cc: "",
};

export default function AnttCoefficientsPage() {
  const [coefficients, setCoefficients] = useState<AnttCoefficient[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadCoefficients() {
    setLoadingList(true);
    setListError(null);
    const { data, error } = await supabase
      .from("antt_coefficients")
      .select("*")
      .order("axles", { ascending: true })
      .order("cargo_type", { ascending: true });

    if (error) {
      setListError(error.message);
    } else {
      setCoefficients(data ?? []);
    }
    setLoadingList(false);
  }

  useEffect(() => {
    loadCoefficients();
  }, []);

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.axles.trim() || Number.isNaN(Number(form.axles))) {
      errors.axles = "Informe o número de eixos.";
    }
    if (!form.cargo_type.trim()) errors.cargo_type = "Informe o tipo de carga.";
    if (!form.ccd.trim() || Number.isNaN(Number(form.ccd.replace(",", ".")))) {
      errors.ccd = "Informe o CCD (R$/km).";
    }
    if (!form.cc.trim() || Number.isNaN(Number(form.cc.replace(",", ".")))) {
      errors.cc = "Informe o CC (R$).";
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

    const { error } = await supabase.from("antt_coefficients").insert({
      axles: Number(form.axles),
      cargo_type: form.cargo_type.trim(),
      ccd: Number(form.ccd.replace(",", ".")),
      cc: Number(form.cc.replace(",", ".")),
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    setForm(emptyForm);
    setSuccessMessage("Coeficiente cadastrado com sucesso.");
    await loadCoefficients();
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
          Coeficientes ANTT
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          Piso mínimo = (CCD × distância km) + CC, por eixos e tipo de carga.
          Mantenha atualizado conforme a Resolução ANTT vigente.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-medium text-navy-900">
              Novo coeficiente
            </h2>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div>
                <label
                  htmlFor="axles"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Nº de eixos <span className="text-red-500">*</span>
                </label>
                <input
                  id="axles"
                  type="text"
                  inputMode="numeric"
                  value={form.axles}
                  onChange={(e) => updateField("axles", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: 5"
                />
                {formErrors.axles && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.axles}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="cargo_type"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Tipo de carga <span className="text-red-500">*</span>
                </label>
                <input
                  id="cargo_type"
                  type="text"
                  value={form.cargo_type}
                  onChange={(e) => updateField("cargo_type", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: Carga Geral"
                />
                {formErrors.cargo_type && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.cargo_type}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="ccd"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  CCD — custo por deslocamento (R$/km){" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  id="ccd"
                  type="text"
                  inputMode="decimal"
                  value={form.ccd}
                  onChange={(e) => updateField("ccd", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: 4.50"
                />
                {formErrors.ccd && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.ccd}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="cc"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  CC — custo por viagem (R$) <span className="text-red-500">*</span>
                </label>
                <input
                  id="cc"
                  type="text"
                  inputMode="decimal"
                  value={form.cc}
                  onChange={(e) => updateField("cc", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: 350"
                />
                {formErrors.cc && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.cc}</p>
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
                {submitting ? "Salvando..." : "Salvar coeficiente"}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-navy-200 px-6 py-4">
              <h2 className="text-base font-medium text-navy-900">
                Coeficientes cadastrados
              </h2>
              <span className="text-sm text-navy-500">
                {coefficients.length}
              </span>
            </div>

            {loadingList ? (
              <div className="px-6 py-10 text-center text-sm text-navy-500">
                Carregando...
              </div>
            ) : listError ? (
              <div className="px-6 py-10 text-center text-sm text-red-600">
                Erro ao carregar: {listError}
              </div>
            ) : coefficients.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-navy-500">
                Nenhum coeficiente cadastrado ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                    <tr>
                      <th className="px-6 py-3 font-medium">Eixos</th>
                      <th className="px-6 py-3 font-medium">Tipo de carga</th>
                      <th className="px-6 py-3 font-medium">CCD (R$/km)</th>
                      <th className="px-6 py-3 font-medium">CC (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {coefficients.map((c) => (
                      <tr key={c.id} className="hover:bg-navy-50">
                        <td className="px-6 py-3 font-medium text-navy-900">
                          {c.axles}
                        </td>
                        <td className="px-6 py-3 text-navy-600">
                          {c.cargo_type}
                        </td>
                        <td className="px-6 py-3 text-navy-600">
                          {c.ccd.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
                        </td>
                        <td className="px-6 py-3 text-navy-600">
                          {c.cc.toLocaleString("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          })}
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
