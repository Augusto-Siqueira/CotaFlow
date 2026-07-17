"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Vehicle {
  id: string;
  type: string;
  axles: number | null;
  capacity_kg: number | null;
  antt_category: string | null;
}

interface FormState {
  type: string;
  axles: string;
  capacity_kg: string;
  antt_category: string;
}

const emptyForm: FormState = {
  type: "",
  axles: "",
  capacity_kg: "",
  antt_category: "",
};

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadVehicles() {
    setLoadingList(true);
    setListError(null);
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .order("type", { ascending: true });

    if (error) {
      setListError(error.message);
    } else {
      setVehicles(data ?? []);
    }
    setLoadingList(false);
  }

  useEffect(() => {
    loadVehicles();
  }, []);

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {};
    if (!form.type.trim()) errors.type = "Informe o tipo do veículo.";
    if (form.axles.trim() && Number.isNaN(Number(form.axles))) {
      errors.axles = "Informe um número inteiro válido.";
    }
    if (
      form.capacity_kg.trim() &&
      Number.isNaN(Number(form.capacity_kg.replace(",", ".")))
    ) {
      errors.capacity_kg = "Informe um número válido.";
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

    const { error } = await supabase.from("vehicles").insert({
      type: form.type.trim(),
      axles: form.axles.trim() ? Number(form.axles) : null,
      capacity_kg: form.capacity_kg.trim()
        ? Number(form.capacity_kg.replace(",", "."))
        : null,
      antt_category: form.antt_category.trim() || null,
    });

    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    setForm(emptyForm);
    setSuccessMessage("Veículo cadastrado com sucesso.");
    await loadVehicles();
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
          Veículos
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          Cadastre os tipos de veículo usados nas cotações.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-medium text-navy-900">
              Novo veículo
            </h2>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div>
                <label
                  htmlFor="type"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Tipo <span className="text-red-500">*</span>
                </label>
                <input
                  id="type"
                  type="text"
                  value={form.type}
                  onChange={(e) => updateField("type", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: Truck, Carreta, Bitrem"
                />
                {formErrors.type && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.type}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="axles"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Nº de eixos
                </label>
                <input
                  id="axles"
                  type="text"
                  inputMode="numeric"
                  value={form.axles}
                  onChange={(e) => updateField("axles", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: 6"
                />
                {formErrors.axles && (
                  <p className="mt-1 text-xs text-red-600">{formErrors.axles}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor="capacity_kg"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Capacidade (kg)
                </label>
                <input
                  id="capacity_kg"
                  type="text"
                  inputMode="decimal"
                  value={form.capacity_kg}
                  onChange={(e) => updateField("capacity_kg", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: 25000"
                />
                {formErrors.capacity_kg && (
                  <p className="mt-1 text-xs text-red-600">
                    {formErrors.capacity_kg}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="antt_category"
                  className="mb-1 block text-sm font-medium text-navy-700"
                >
                  Categoria ANTT
                </label>
                <input
                  id="antt_category"
                  type="text"
                  value={form.antt_category}
                  onChange={(e) => updateField("antt_category", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: Granel sólido"
                />
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
                {submitting ? "Salvando..." : "Salvar veículo"}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-navy-200 px-6 py-4">
              <h2 className="text-base font-medium text-navy-900">
                Veículos cadastrados
              </h2>
              <span className="text-sm text-navy-500">
                {vehicles.length}{" "}
                {vehicles.length === 1 ? "veículo" : "veículos"}
              </span>
            </div>

            {loadingList ? (
              <div className="px-6 py-10 text-center text-sm text-navy-500">
                Carregando veículos...
              </div>
            ) : listError ? (
              <div className="px-6 py-10 text-center text-sm text-red-600">
                Erro ao carregar veículos: {listError}
              </div>
            ) : vehicles.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-navy-500">
                Nenhum veículo cadastrado ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                    <tr>
                      <th className="px-6 py-3 font-medium">Tipo</th>
                      <th className="px-6 py-3 font-medium">Eixos</th>
                      <th className="px-6 py-3 font-medium">Capacidade</th>
                      <th className="px-6 py-3 font-medium">Categoria ANTT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {vehicles.map((vehicle) => (
                      <tr key={vehicle.id} className="hover:bg-navy-50">
                        <td className="px-6 py-3 font-medium text-navy-900">
                          {vehicle.type}
                        </td>
                        <td className="px-6 py-3 text-navy-600">
                          {vehicle.axles ?? "—"}
                        </td>
                        <td className="px-6 py-3 text-navy-600">
                          {vehicle.capacity_kg !== null
                            ? `${vehicle.capacity_kg.toLocaleString("pt-BR")} kg`
                            : "—"}
                        </td>
                        <td className="px-6 py-3 text-navy-600">
                          {vehicle.antt_category || "—"}
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
