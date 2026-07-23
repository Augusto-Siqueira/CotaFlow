"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import LocationPickerMap, { type LatLng } from "@/components/LocationPickerMap";

// A tabela no banco continua chamada `company_bases` (criada antes deste
// conceito virar "Endereços" genéricos) — renomear a tabela exigiria outra
// migração manual; o nome mudou só na interface e no código.
interface Address {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [location, setLocation] = useState<LatLng | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadAddresses() {
    setLoadingList(true);
    setListError(null);
    const { data, error } = await supabase
      .from("company_bases")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      setListError(error.message);
    } else {
      setAddresses(data ?? []);
    }
    setLoadingList(false);
  }

  useEffect(() => {
    loadAddresses();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSuccessMessage(null);

    if (!name.trim()) {
      setNameError("Informe o nome do endereço.");
      return;
    }
    if (!location) {
      setNameError(null);
      setSubmitError("Marque o local no mapa.");
      return;
    }
    setNameError(null);

    setSubmitting(true);
    const { error } = await supabase.from("company_bases").insert({
      name: name.trim(),
      latitude: location.lat,
      longitude: location.lng,
    });
    setSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    setName("");
    setLocation(null);
    setSuccessMessage("Endereço cadastrado com sucesso.");
    await loadAddresses();
  }

  async function handleDelete(id: string) {
    await supabase.from("company_bases").delete().eq("id", id);
    await loadAddresses();
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
          Endereços
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          Cadastre endereços com o local exato no mapa (garagens, clientes
          recorrentes etc.), pra usar como opção rápida em Coleta, Entrega,
          Origem e Destino final nas cotações.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-medium text-navy-900">
              Novo endereço
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: Palhoça/SC (garagem)"
                />
                {nameError && (
                  <p className="mt-1 text-xs text-red-600">{nameError}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Local no mapa <span className="text-red-500">*</span>
                </label>
                <LocationPickerMap value={location} onChange={setLocation} />
                {location && (
                  <p className="mt-2 text-xs text-navy-600">
                    Latitude: {location.lat.toFixed(6)} · Longitude:{" "}
                    {location.lng.toFixed(6)}
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
                disabled={submitting || !name.trim() || !location}
                className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Salvando..." : "Salvar endereço"}
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-navy-200 px-6 py-4">
              <h2 className="text-base font-medium text-navy-900">
                Endereços cadastrados
              </h2>
              <span className="text-sm text-navy-500">{addresses.length}</span>
            </div>

            {loadingList ? (
              <div className="px-6 py-10 text-center text-sm text-navy-500">
                Carregando...
              </div>
            ) : listError ? (
              <div className="px-6 py-10 text-center text-sm text-red-600">
                Erro ao carregar: {listError}
              </div>
            ) : addresses.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-navy-500">
                Nenhum endereço cadastrado ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                    <tr>
                      <th className="px-6 py-3 font-medium">Nome</th>
                      <th className="px-6 py-3 font-medium">Latitude</th>
                      <th className="px-6 py-3 font-medium">Longitude</th>
                      <th className="px-6 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {addresses.map((a) => (
                      <tr key={a.id} className="hover:bg-navy-50">
                        <td className="px-6 py-3 font-medium text-navy-900">
                          {a.name}
                        </td>
                        <td className="px-6 py-3 text-navy-600">
                          {a.latitude.toFixed(6)}
                        </td>
                        <td className="px-6 py-3 text-navy-600">
                          {a.longitude.toFixed(6)}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDelete(a.id)}
                            className="text-xs text-red-600 underline hover:text-red-700"
                          >
                            Excluir
                          </button>
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
