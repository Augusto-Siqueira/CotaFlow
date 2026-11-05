"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { VehiclesTabs } from "@/components/VehiclesTabs";
import {
  FLEET_CERT_COLUMNS,
  FLEET_KINDS,
  certStatuses,
  certText,
  isValidPlate,
  normalizePlate,
  type CertKey,
  type CronoStage,
  type CertLevel,
  type FleetCertFields,
  type FleetKind,
} from "@/lib/fleet";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { SearchSelect } from "@/components/SearchSelect";
import { fetchAllCityNames } from "@/lib/cities";
import { BODY_TYPES, WHEEL_TYPES } from "@/lib/agregados";
import { onlyDigits } from "@/lib/cpf";

// Dados do veículo pedidos pelo CIOT (e, no futuro, pelo MDF-e) — migration 0080.
interface VehicleData {
  renavam: string | null;
  chassis: string | null;
  brand: string | null;
  model: string | null;
  year_made: number | null;
  year_model: number | null;
  axles: number | null;
  color: string | null;
  tare_kg: number | null;
  capacity_kg: number | null;
  capacity_m3: number | null;
  wheel_type: string | null;
  body_type: string | null;
  registry_city: string | null;
}

const VEHICLE_DATA_COLUMNS =
  "agregado_id, renavam, chassis, brand, model, year_made, year_model, axles, color, tare_kg, capacity_kg, capacity_m3, wheel_type, body_type, registry_city";

interface Unit extends FleetCertFields, VehicleData {
  id: string;
  agregado_id: string | null;
}

type VehicleForm = Record<keyof VehicleData, string>;

const VEHICLE_FIELDS: { key: keyof VehicleData; label: string; numeric?: boolean; span?: string }[] = [
  { key: "renavam", label: "Renavam", numeric: true },
  { key: "chassis", label: "Chassi" },
  { key: "brand", label: "Marca" },
  { key: "model", label: "Modelo" },
  { key: "year_made", label: "Ano de fabricação", numeric: true },
  { key: "year_model", label: "Ano do modelo", numeric: true },
  { key: "axles", label: "Número de eixos", numeric: true },
  { key: "color", label: "Cor" },
  { key: "tare_kg", label: "Tara (kg)", numeric: true },
  { key: "capacity_kg", label: "Capacidade (kg)", numeric: true },
  { key: "capacity_m3", label: "Capacidade (m³)", numeric: true },
];

const NUMBER_KEYS: (keyof VehicleData)[] = ["year_made", "year_model", "axles", "tare_kg", "capacity_kg", "capacity_m3"];

function toVehicleForm(u: Unit): VehicleForm {
  const out = {} as VehicleForm;
  for (const k of [...VEHICLE_FIELDS.map((f) => f.key), "wheel_type", "body_type", "registry_city"] as (keyof VehicleData)[]) {
    const v = u[k];
    out[k] = v === null || v === undefined ? "" : String(v);
  }
  return out;
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
  const { toastError, toastSuccess, confirm: askConfirm } = useFeedback();
  // Nome do agregado dono de cada placa (a tabela agregados só é lida por
  // Logística/admin; para os demais o mapa fica vazio e o selo não aparece).
  const [agregadoNames, setAgregadoNames] = useState<Record<string, string>>({});
  const [cities, setCities] = useState<string[]>([]);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [vehicleForm, setVehicleForm] = useState<VehicleForm | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [savingVehicle, setSavingVehicle] = useState(false);
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
      .select(`id, ${FLEET_CERT_COLUMNS}, ${VEHICLE_DATA_COLUMNS}`)
      .order("plate");
    if (error) {
      setListError(error.message);
      setUnits([]);
      return;
    }
    setListError(null);
    setUnits((data as unknown as Unit[]) ?? []);
    const ag = await supabase.from("agregados").select("id, name");
    setAgregadoNames(Object.fromEntries((ag.data ?? []).map((a) => [a.id, a.name])));
  }

  function openVehicle(u: Unit) {
    setEditingUnit(u);
    setVehicleForm(toVehicleForm(u));
    setVehicleError(null);
    if (cities.length === 0) fetchAllCityNames().then(setCities);
  }

  function closeVehicle() {
    setEditingUnit(null);
    setVehicleForm(null);
  }

  async function saveVehicle(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUnit || !vehicleForm) return;
    if (vehicleForm.registry_city.trim() && !cities.includes(vehicleForm.registry_city)) {
      setVehicleError("Escolha o município na lista.");
      return;
    }
    const patch: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(vehicleForm) as [keyof VehicleData, string][]) {
      const t = v.trim();
      if (!t) patch[k] = null;
      else if (NUMBER_KEYS.includes(k)) patch[k] = Number(t.replace(",", "."));
      else patch[k] = k === "chassis" ? t.toUpperCase() : t;
    }
    setSavingVehicle(true);
    const { error } = await supabase.from("fleet_units").update(patch).eq("id", editingUnit.id);
    setSavingVehicle(false);
    if (error) {
      setVehicleError(`Não foi possível salvar (${error.message}).`);
      return;
    }
    setUnits((prev) => (prev ?? []).map((u) => (u.id === editingUnit.id ? { ...u, ...patch } : u)));
    toastSuccess(`Dados do veículo ${editingUnit.plate} salvos.`);
    closeVehicle();
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
  async function saveCert(unit: Unit, cert: CertKey, due: string | null, na: boolean, stage?: CronoStage | null) {
    // Cronotacógrafo: vencimento + fase (preliminar ou definitivo); não tem "N/A".
    const patch: Record<string, unknown> =
      cert === "crono"
        ? { crono_due: due, crono_stage: stage ?? null }
        : { [`${cert}_due`]: na ? null : due, [`${cert}_na`]: na };
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
          Placas da frota (própria e de agregados): cavalos mecânicos, semi-reboques e trucks.
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
                                <span className="flex shrink-0 items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openVehicle(u)}
                                    className={buttonClasses("soft", "sm")}
                                  >
                                    Dados do veículo
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(u)}
                                    className={buttonClasses("danger", "sm")}
                                  >
                                    Excluir
                                  </button>
                                </span>
                              )}
                            </div>
                            {u.agregado_id && agregadoNames[u.agregado_id] && (
                              <p className="mt-1 truncate text-xs font-medium text-violet-800">
                                Agregado · {agregadoNames[u.agregado_id]}
                              </p>
                            )}
                            <ul className="mt-2 space-y-1.5">
                              {certStatuses(u).map((c) => (
                                <li key={c.cert} className="flex flex-wrap items-center gap-2 text-xs">
                                  <span className={`font-semibold text-navy-700 ${c.cert === "crono" ? "" : "w-9"}`}>{c.label}</span>
                                  {canEditSchedule ? (
                                    <>
                                      <input
                                        type="date"
                                        aria-label={`${c.label} de ${u.plate}: vencimento`}
                                        value={c.due ?? ""}
                                        disabled={c.level === "na"}
                                        onChange={(e) => saveCert(u, c.cert, e.target.value || null, false, u.crono_stage)}
                                        className="rounded-md border border-navy-300 px-2 py-1 text-xs text-navy-900 disabled:cursor-not-allowed disabled:bg-navy-50"
                                      />
                                      {c.cert === "crono" ? (
                                        (["preliminar", "definitivo"] as const).map((st) => (
                                          <label key={st} className="flex items-center gap-1 text-navy-600">
                                            <input
                                              type="checkbox"
                                              checked={u.crono_stage === st}
                                              onChange={(e) => saveCert(u, "crono", u.crono_due, false, e.target.checked ? st : null)}
                                            />
                                            {st === "preliminar" ? "Preliminar" : "Definitivo"}
                                          </label>
                                        ))
                                      ) : (
                                        <label className="flex items-center gap-1 text-navy-600">
                                          <input
                                            type="checkbox"
                                            checked={c.level === "na"}
                                            onChange={(e) => saveCert(u, c.cert, null, e.target.checked)}
                                          />
                                          N/A
                                        </label>
                                      )}
                                    </>
                                  ) : null}
                                  <span className={`rounded-full px-2 py-0.5 font-medium ${LEVEL_CLS[c.level]}`}>
                                    {c.level === "na"
                                      ? "N/A"
                                      : c.level === "sem_data"
                                        ? "sem data"
                                        : c.level === "ok"
                                          ? `vence em ${new Date(`${c.due}T12:00:00`).toLocaleDateString("pt-BR")}`
                                          : certText(c).replace(" — emitir o definitivo", "").replace(`${c.label} `, "")}
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

      {editingUnit && vehicleForm && (
        <Modal onClose={closeVehicle} labelledBy="vehicle-data-title" className="max-w-2xl">
          <form onSubmit={saveVehicle} className="flex flex-col gap-4">
            <div>
              <h2 id="vehicle-data-title" className="text-base font-medium text-navy-900">
                Dados do veículo {editingUnit.plate}
              </h2>
              <p className="mt-1 text-sm text-navy-500">
                Os mesmos dados que o e-Frete pede no CIOT. Preencha uma vez e o CotaFlow reaproveita.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {VEHICLE_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor={`veic-${f.key}`}>
                    {f.label}
                  </label>
                  <input
                    id={`veic-${f.key}`}
                    inputMode={f.numeric ? "numeric" : undefined}
                    value={vehicleForm[f.key]}
                    onChange={(e) =>
                      setVehicleForm((v) => v && {
                        ...v,
                        [f.key]: f.numeric && f.key !== "capacity_m3" ? onlyDigits(e.target.value) : e.target.value,
                      })
                    }
                    className={`${inputCls} ${f.key === "chassis" ? "uppercase" : ""}`}
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="veic-rodado">
                  Tipo de rodado
                </label>
                <select
                  id="veic-rodado"
                  value={vehicleForm.wheel_type}
                  onChange={(e) => setVehicleForm((v) => v && { ...v, wheel_type: e.target.value })}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {WHEEL_TYPES.map((w) => (
                    <option key={w.value} value={w.value}>{w.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="veic-carroceria">
                  Tipo de carroceria
                </label>
                <select
                  id="veic-carroceria"
                  value={vehicleForm.body_type}
                  onChange={(e) => setVehicleForm((v) => v && { ...v, body_type: e.target.value })}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {BODY_TYPES.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="veic-municipio">
                  Município do emplacamento
                </label>
                <SearchSelect
                  id="veic-municipio"
                  value={vehicleForm.registry_city}
                  onChange={(val) => setVehicleForm((v) => v && { ...v, registry_city: val })}
                  options={cities.map((c) => ({ value: c }))}
                  placeholder="Digite para procurar (ex: Curitiba/PR)"
                  className={inputCls}
                />
              </div>
            </div>
            {vehicleError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{vehicleError}</div>
            )}
            <div className="flex gap-3">
              <button type="submit" disabled={savingVehicle} className={`flex-1 ${buttonClasses("primary", "md")}`}>
                {savingVehicle ? "Salvando..." : "Salvar dados"}
              </button>
              <button type="button" onClick={closeVehicle} className={buttonClasses("secondary", "md")}>
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
