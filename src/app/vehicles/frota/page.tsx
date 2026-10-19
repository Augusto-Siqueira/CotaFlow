"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { VehiclesTabs } from "@/components/VehiclesTabs";
import {
  FLEET_KINDS,
  certStatuses,
  certText,
  isValidPlate,
  normalizePlate,
  type CertKey,
  type CertLevel,
  type FleetCertFields,
  type FleetKind,
} from "@/lib/fleet";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";

interface Unit extends FleetCertFields {
  id: string;
}

const LEVEL_CLS: Record<CertLevel, string> = {
  vencida: "bg-red-100 text-red-800",
  vencendo: "bg-amber-100 text-amber-800",
  ok: "bg-teal-100 text-teal-800",
  na: "bg-navy-100 text-navy-600",
  sem_data: "bg-navy-100 text-navy-500",
};

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function FleetPage() {
  const { canEditSchedule } = useAuth();
  const { toastError, confirm: askConfirm } = useFeedback();
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [plate, setPlate] = useState("");
  const [kind, setKind] = useState<FleetKind>("cavalo");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  async function loadUnits() {
    const { data, error } = await supabase
      .from("fleet_units")
      .select("id, plate, kind, civ_due, civ_na, cipp_due, cipp_na")
      .order("plate");
    if (error) {
      setListError(error.message);
      setUnits([]);
      return;
    }
    setListError(null);
    setUnits((data as Unit[]) ?? []);
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadUnits();
    });
  }, []);

  const filtered = useMemo(() => {
    const q = normalizePlate(search);
    return (units ?? []).filter((u) => !q || u.plate.includes(q));
  }, [units, search]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidPlate(plate)) {
      setFormError("A placa precisa ter 7 caracteres (ex: ABC1D23).");
      return;
    }

    setSaving(true);
    setFormError(null);
    const { error } = await supabase.from("fleet_units").insert({ plate, kind });
    setSaving(false);

    if (error) {
      setFormError(
        error.code === "23505"
          ? "Essa placa já está cadastrada."
          : `Não foi possível salvar (${error.message}).`
      );
      return;
    }
    setPlate("");
    await loadUnits();
  }

  // Grava a data (ou o "N/A") de uma capacitação da placa e atualiza a lista na hora.
  async function saveCert(unit: Unit, cert: CertKey, due: string | null, na: boolean) {
    const patch = { [`${cert}_due`]: na ? null : due, [`${cert}_na`]: na };
    const { error } = await supabase.from("fleet_units").update(patch).eq("id", unit.id);
    if (error) {
      toastError(`Não foi possível salvar a capacitação (${error.message}).`);
      return;
    }
    setUnits((prev) => (prev ?? []).map((u) => (u.id === unit.id ? { ...u, ...patch } : u)));
  }

  async function handleDelete(unit: Unit) {
    if (!await askConfirm(`Excluir a placa ${unit.plate}?`)) return;
    const { error } = await supabase
      .from("fleet_units")
      .delete()
      .eq("id", unit.id);
    if (error) {
      toastError(`Não foi possível excluir (${error.message}).`);
      return;
    }
    await loadUnits();
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
          Veículos
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          Placas da frota própria: cavalos mecânicos, semi-reboques e trucks.
        </p>
      </div>

      <VehiclesTabs active="/vehicles/frota" />

      <div className="grid gap-8 lg:grid-cols-3">
        {canEditSchedule && (
          <div className="min-w-0 lg:col-span-1">
            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-base font-medium text-navy-900">
                Nova placa
              </h2>

              <div className="mt-5 flex flex-col gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="frota-placa">
                    Placa <span className="text-red-500">*</span>
                  </label>
                  <input id="frota-placa"
                    type="text"
                    value={plate}
                    onChange={(e) => setPlate(normalizePlate(e.target.value))}
                    className={`${inputCls} uppercase tracking-wide`}
                    placeholder="ABC1D23"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="frota-tipo">
                    Tipo <span className="text-red-500">*</span>
                  </label>
                  <select id="frota-tipo"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as FleetKind)}
                    className={inputCls}
                  >
                    {FLEET_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>

                {formError && (
                  <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Salvando..." : "Salvar placa"}
                </button>
              </div>
            </form>
          </div>
        )}

        <div
          className={`min-w-0 ${canEditSchedule ? "lg:col-span-2" : "lg:col-span-3"}`}
        >
          <div className="mb-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputCls}
              placeholder="Buscar placa..."
            />
          </div>

          {units === null ? (
            <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
              Carregando...
            </div>
          ) : listError ? (
            <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-red-600">
              Erro ao carregar: {listError}
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {FLEET_KINDS.map((k) => {
                const items = filtered.filter((u) => u.kind === k.value);
                return (
                  <section
                    key={k.value}
                    className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm"
                  >
                    <header className="flex items-center justify-between border-b border-navy-200 bg-navy-50 px-5 py-3">
                      <h2 className="text-sm font-semibold text-navy-900">
                        {k.plural}
                      </h2>
                      <span className="text-xs text-navy-500">{items.length}</span>
                    </header>
                    {items.length === 0 ? (
                      <p className="px-5 py-6 text-center text-sm text-navy-500">
                        Nenhuma placa cadastrada.
                      </p>
                    ) : (
                      <ul className="grid gap-px bg-navy-100 sm:grid-cols-2 xl:grid-cols-3">
                        {items.map((u) => (
                          <li key={u.id} className="bg-white px-5 py-3">
                            <div className="flex items-center justify-between">
                              <span className="font-medium tracking-wide text-navy-900">
                                {u.plate}
                              </span>
                              {canEditSchedule && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(u)}
                                  className={buttonClasses("danger", "sm")}
                                >
                                  Excluir
                                </button>
                              )}
                            </div>
                            <ul className="mt-2 space-y-1.5">
                              {certStatuses(u).map((c) => (
                                <li key={c.cert} className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className="w-9 font-semibold text-navy-700">{c.label}</span>
                                  {canEditSchedule ? (
                                    <>
                                      <input
                                        type="date"
                                        aria-label={`${c.label} de ${u.plate}: vencimento`}
                                        value={c.due ?? ""}
                                        disabled={c.level === "na"}
                                        onChange={(e) => saveCert(u, c.cert, e.target.value || null, false)}
                                        className="rounded-md border border-navy-300 px-2 py-1 text-xs text-navy-900 disabled:cursor-not-allowed disabled:bg-navy-50"
                                      />
                                      <label className="flex items-center gap-1 text-navy-600">
                                        <input
                                          type="checkbox"
                                          checked={c.level === "na"}
                                          onChange={(e) => saveCert(u, c.cert, null, e.target.checked)}
                                        />
                                        N/A
                                      </label>
                                    </>
                                  ) : null}
                                  <span className={`rounded-full px-2 py-0.5 font-medium ${LEVEL_CLS[c.level]}`}>
                                    {c.level === "na"
                                      ? "N/A"
                                      : c.level === "sem_data"
                                        ? "sem data"
                                        : c.level === "ok"
                                          ? `vence em ${new Date(`${c.due}T12:00:00`).toLocaleDateString("pt-BR")}`
                                          : certText(c).replace(`${c.label} `, "")}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
