"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import {
  computeFullFreight,
  computeNetFreight,
} from "@/lib/quoteCalculations";

interface VehicleOption {
  id: string;
  type: string;
  axles: number | null;
  over_time_rate: number | null;
}

interface RouteForm {
  origin: string;
  destination: string;
  final_destination: string;
  vehicle_id: string;
  min_load_ton: string;
  toll_cost: string;
  gross_freight: string;
  transit_time_hours: string;
  icms_pct: string;
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

function isValidNumber(value: string): boolean {
  if (!value.trim()) return true;
  return !Number.isNaN(Number(value.replace(",", ".")));
}

function numberToInput(value: number | null): string {
  return value === null ? "" : String(value);
}

async function fetchAllCityNames(): Promise<string[]> {
  const pageSize = 1000;
  const names: string[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("cities")
      .select("name")
      .order("name")
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (error || !data) break;
    names.push(...data.map((c) => c.name));
    if (data.length < pageSize) break;
  }
  return names;
}

export default function EditBatchRoutePage({
  params,
}: {
  params: Promise<{ id: string; routeId: string }>;
}) {
  const { id: batchId, routeId } = use(params);
  const router = useRouter();

  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [paranaRule, setParanaRule] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState<RouteForm>({
    origin: "",
    destination: "",
    final_destination: "",
    vehicle_id: "",
    min_load_ton: "",
    toll_cost: "",
    gross_freight: "",
    transit_time_hours: "",
    icms_pct: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);

      const [quoteRes, vehiclesRes, cityNames] = await Promise.all([
        supabase
          .from("quotes")
          .select(
            "origin, destination, final_destination, vehicle_id, min_load_ton, toll_cost, gross_freight, transit_time_hours, icms_pct, quote_batches(parana_rule)"
          )
          .eq("id", routeId)
          .single(),
        supabase
          .from("vehicles")
          .select("id, type, axles, over_time_rate")
          .order("type"),
        fetchAllCityNames(),
      ]);

      if (quoteRes.error || !quoteRes.data) {
        setLoadError(quoteRes.error?.message ?? "Rota não encontrada.");
        setLoading(false);
        return;
      }
      if (vehiclesRes.error) {
        setLoadError(vehiclesRes.error.message);
        setLoading(false);
        return;
      }

      const quote = quoteRes.data;
      const batchRef = quote.quote_batches as unknown as {
        parana_rule: boolean;
      } | null;

      setForm({
        origin: quote.origin ?? "",
        destination: quote.destination ?? "",
        final_destination: quote.final_destination ?? "",
        vehicle_id: quote.vehicle_id ?? "",
        min_load_ton: numberToInput(quote.min_load_ton),
        toll_cost: numberToInput(quote.toll_cost),
        gross_freight: numberToInput(quote.gross_freight),
        transit_time_hours: numberToInput(quote.transit_time_hours),
        icms_pct: numberToInput(quote.icms_pct),
      });
      setParanaRule(batchRef?.parana_rule ?? false);
      setVehicles(vehiclesRes.data ?? []);
      setCities(cityNames);
      setLoading(false);
    }
    load();
  }, [routeId]);

  function updateField<K extends keyof RouteForm>(key: K, value: RouteForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const grossFreight = toNumber(form.gross_freight);
  const tollCost = toNumber(form.toll_cost);
  const icmsPct = toNumber(form.icms_pct);
  const netFreight = computeNetFreight(grossFreight);
  const fullFreight = computeFullFreight(
    grossFreight,
    tollCost,
    null,
    icmsPct,
    paranaRule
  );
  // Acompanha o veículo escolhido — trocar o veículo troca o over time.
  const overTimeRate =
    vehicles.find((v) => v.id === form.vehicle_id)?.over_time_rate ?? null;

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    if (!form.origin.trim()) nextErrors.origin = "Informe a origem.";
    if (!form.destination.trim())
      nextErrors.destination = "Informe o destino.";
    if (!form.vehicle_id) nextErrors.vehicle_id = "Selecione o veículo.";
    if (grossFreight === null) nextErrors.gross_freight = "Informe o frete Gross.";
    if (!isValidNumber(form.min_load_ton))
      nextErrors.min_load_ton = "Valor inválido.";
    if (!isValidNumber(form.toll_cost)) nextErrors.toll_cost = "Valor inválido.";
    if (!isValidNumber(form.transit_time_hours))
      nextErrors.transit_time_hours = "Valor inválido.";
    if (icmsPct === null) nextErrors.icms_pct = "Informe o ICMS.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    const { error } = await supabase
      .from("quotes")
      .update({
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        final_destination: form.final_destination.trim() || null,
        vehicle_id: form.vehicle_id,
        min_load_ton: toNumber(form.min_load_ton),
        toll_cost: tollCost,
        gross_freight: grossFreight,
        net_freight: netFreight,
        full_freight: fullFreight,
        transit_time_hours: toNumber(form.transit_time_hours),
        over_time_cost: overTimeRate,
        icms_pct: icmsPct,
      })
      .eq("id", routeId);

    if (error) {
      setSubmitting(false);
      setSubmitError(error.message);
      return;
    }

    router.push(`/quotes/batches/${batchId}`);
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 text-center text-sm text-navy-500">
        Carregando dados...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 text-center text-sm text-red-600">
        Erro ao carregar rota: {loadError}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <div className="mb-8">
        <Link
          href={`/quotes/batches/${batchId}`}
          className="text-sm text-navy-500 hover:text-navy-700"
        >
          ← Lote
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-900">
          Editar rota
        </h1>
      </div>

      <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-navy-600">Origem</label>
            <input
              type="text"
              list="edit-route-cities"
              value={form.origin}
              onChange={(e) => updateField("origin", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {errors.origin && (
              <p className="mt-1 text-xs text-red-600">{errors.origin}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-navy-600">
              Destino (entrega)
            </label>
            <input
              type="text"
              list="edit-route-cities"
              value={form.destination}
              onChange={(e) => updateField("destination", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {errors.destination && (
              <p className="mt-1 text-xs text-red-600">{errors.destination}</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-navy-600">
              Destino (fim de viagem)
            </label>
            <input
              type="text"
              list="edit-route-cities"
              value={form.final_destination}
              onChange={(e) => updateField("final_destination", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            <p className="mt-1 text-xs text-navy-500">
              Onde o veículo termina a viagem já vazio. Não aparece na proposta
              do cliente.
            </p>
          </div>
          <div>
            <label className="text-xs font-medium text-navy-600">Veículo</label>
            <select
              value={form.vehicle_id}
              onChange={(e) => updateField("vehicle_id", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Selecione...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.type}
                </option>
              ))}
            </select>
            {errors.vehicle_id && (
              <p className="mt-1 text-xs text-red-600">{errors.vehicle_id}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-navy-600">
              Lotação mínima (ton)
            </label>
            <input
              type="text"
              value={form.min_load_ton}
              onChange={(e) => updateField("min_load_ton", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {errors.min_load_ton && (
              <p className="mt-1 text-xs text-red-600">{errors.min_load_ton}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-navy-600">
              Pedágio (R$)
            </label>
            <input
              type="text"
              value={form.toll_cost}
              onChange={(e) => updateField("toll_cost", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {errors.toll_cost && (
              <p className="mt-1 text-xs text-red-600">{errors.toll_cost}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-navy-600">
              Frete Gross (R$)
            </label>
            <input
              type="text"
              value={form.gross_freight}
              onChange={(e) => updateField("gross_freight", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {errors.gross_freight && (
              <p className="mt-1 text-xs text-red-600">{errors.gross_freight}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-navy-600">ICMS (%)</label>
            <input
              type="text"
              value={form.icms_pct}
              onChange={(e) => updateField("icms_pct", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {errors.icms_pct && (
              <p className="mt-1 text-xs text-red-600">{errors.icms_pct}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-navy-600">
              Transit time (h)
            </label>
            <input
              type="text"
              value={form.transit_time_hours}
              onChange={(e) =>
                updateField("transit_time_hours", e.target.value)
              }
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {errors.transit_time_hours && (
              <p className="mt-1 text-xs text-red-600">
                {errors.transit_time_hours}
              </p>
            )}
          </div>
        </div>
        <datalist id="edit-route-cities">
          {cities.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="mt-6 flex gap-6 rounded-lg bg-navy-50 px-4 py-3 text-sm">
          <div>
            <span className="text-navy-500">Net: </span>
            <span className="font-medium text-navy-900">
              {formatCurrency(netFreight)}
            </span>
          </div>
          <div>
            <span className="text-navy-500">Full: </span>
            <span className="font-medium text-navy-900">
              {formatCurrency(fullFreight)}
            </span>
          </div>
          <div>
            <span className="text-navy-500">Over time: </span>
            <span className="font-medium text-navy-900">
              {overTimeRate !== null ? `${formatCurrency(overTimeRate)}/h` : "—"}
            </span>
          </div>
        </div>
      </div>

      {submitError && (
        <p className="mt-4 text-sm text-red-600">{submitError}</p>
      )}

      <div className="mt-6 flex justify-end gap-3">
        <Link
          href={`/quotes/batches/${batchId}`}
          className="rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100"
        >
          Cancelar
        </Link>
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </div>
  );
}
