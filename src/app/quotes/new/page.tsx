"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import {
  computeAnttFloor,
  computeFullFreight,
  computeInsuranceValue,
  computeNetFreight,
} from "@/lib/quoteCalculations";

interface ClientOption {
  id: string;
  name: string;
}

interface VehicleOption {
  id: string;
  type: string;
  axles: number | null;
}

interface AnttCoefficientOption {
  axles: number;
  cargo_type: string;
  ccd: number;
  cc: number;
}

interface DuplicateSourceQuote {
  id: string;
  client_id: string | null;
  base_origin: string | null;
  origin: string | null;
  destination: string | null;
  final_destination: string | null;
  distance_km: number | null;
  vehicle_id: string | null;
  product: string | null;
  nf_value: number | null;
  gross_freight: number | null;
  toll_cost: number | null;
  insurance_pct: number | null;
  icms_pct: number | null;
  transit_time_hours: number | null;
  version: number;
}

interface FormState {
  client_id: string;
  base_origin: string;
  origin: string;
  destination: string;
  final_destination: string;
  distance_km: string;
  product: string;
  nf_value: string;
  vehicle_id: string;
  gross_freight: string;
  toll_cost: string;
  insurance_pct: string;
  icms_pct: string;
  parana_rule: boolean;
  transit_time_hours: string;
  antt_cargo_type: string;
  antt_floor_acknowledged: boolean;
}

const emptyForm: FormState = {
  client_id: "",
  base_origin: "",
  origin: "",
  destination: "",
  final_destination: "",
  distance_km: "",
  product: "",
  nf_value: "",
  vehicle_id: "",
  gross_freight: "",
  toll_cost: "",
  insurance_pct: "",
  icms_pct: "",
  parana_rule: false,
  transit_time_hours: "",
  antt_cargo_type: "",
  antt_floor_acknowledged: false,
};

interface DeliveryRow {
  destination: string;
  weight_kg: string;
}

const emptyDeliveries: DeliveryRow[] = [
  { destination: "", weight_kg: "" },
  { destination: "", weight_kg: "" },
];

const STEPS = ["Rota", "Carga", "Veículo", "Tributos", "Resumo"] as const;

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

export default function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const { duplicate: duplicateId } = use(searchParams);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [anttCoefficients, setAnttCoefficients] = useState<AnttCoefficientOption[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({});

  const [fractioned, setFractioned] = useState(false);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>(emptyDeliveries);

  const [duplicateSource, setDuplicateSource] =
    useState<DuplicateSourceQuote | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedQuoteId, setSavedQuoteId] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
      setOptionsError(null);

      const [clientsRes, vehiclesRes, anttRes, citiesRes, duplicateRes] = await Promise.all([
        supabase.from("clients").select("id, name").order("name"),
        supabase.from("vehicles").select("id, type, axles").order("type"),
        supabase
          .from("antt_coefficients")
          .select("axles, cargo_type, ccd, cc")
          .order("cargo_type"),
        supabase.from("cities").select("name").order("name"),
        duplicateId
          ? supabase
              .from("quotes")
              .select(
                "id, client_id, base_origin, origin, destination, final_destination, distance_km, vehicle_id, product, nf_value, gross_freight, toll_cost, insurance_pct, icms_pct, transit_time_hours, version"
              )
              .eq("id", duplicateId)
              .single()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (clientsRes.error) {
        setOptionsError(clientsRes.error.message);
      } else if (vehiclesRes.error) {
        setOptionsError(vehiclesRes.error.message);
      } else {
        setClients(clientsRes.data ?? []);
        setVehicles(vehiclesRes.data ?? []);
        setAnttCoefficients(anttRes.data ?? []);
        setCities((citiesRes.data ?? []).map((c) => c.name));
      }

      if (duplicateId && duplicateRes.data) {
        const source = duplicateRes.data as unknown as DuplicateSourceQuote;

        setForm((prev) => ({
          ...prev,
          client_id: source.client_id ?? "",
          base_origin: source.base_origin ?? "",
          origin: source.origin ?? "",
          destination: source.destination ?? "",
          final_destination: source.final_destination ?? "",
          distance_km:
            source.distance_km !== null ? String(source.distance_km) : "",
          product: source.product ?? "",
          nf_value: source.nf_value !== null ? String(source.nf_value) : "",
          vehicle_id: source.vehicle_id ?? "",
          gross_freight:
            source.gross_freight !== null ? String(source.gross_freight) : "",
          toll_cost: source.toll_cost !== null ? String(source.toll_cost) : "",
          insurance_pct:
            source.insurance_pct !== null ? String(source.insurance_pct) : "",
          icms_pct: source.icms_pct !== null ? String(source.icms_pct) : "",
          transit_time_hours:
            source.transit_time_hours !== null
              ? String(source.transit_time_hours)
              : "",
        }));
        setDuplicateSource(source);

        const { data: sourceDeliveries } = await supabase
          .from("quote_deliveries")
          .select("destination, weight_kg")
          .eq("quote_id", duplicateId);

        if (sourceDeliveries && sourceDeliveries.length > 0) {
          setFractioned(true);
          setDeliveries(
            sourceDeliveries.map((d) => ({
              destination: d.destination,
              weight_kg: String(d.weight_kg),
            }))
          );
        }
      }

      setLoadingOptions(false);
    }
    loadOptions();
  }, [duplicateId]);

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateDelivery(index: number, field: keyof DeliveryRow, value: string) {
    setDeliveries((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function addDelivery() {
    setDeliveries((prev) => [...prev, { destination: "", weight_kg: "" }]);
  }

  function removeDelivery(index: number) {
    setDeliveries((prev) => prev.filter((_, i) => i !== index));
  }

  function validateStep(currentStep: number): boolean {
    const errors: Record<string, string> = {};

    if (currentStep === 0) {
      if (!form.client_id) errors.client_id = "Selecione o cliente.";
      if (!form.origin.trim()) errors.origin = "Informe a origem.";
      if (!form.destination.trim()) errors.destination = "Informe o destino.";
      if (!isValidNumber(form.distance_km)) {
        errors.distance_km = "Informe um número válido.";
      }
    }

    if (currentStep === 1) {
      if (!form.product.trim()) errors.product = "Informe o produto.";
      if (!form.nf_value.trim() || !isValidNumber(form.nf_value)) {
        errors.nf_value = "Informe o valor da NF.";
      }

      if (fractioned) {
        if (deliveries.length < 2) {
          errors.deliveries = "Informe ao menos 2 entregas para fracionar.";
        } else {
          const invalid = deliveries.some(
            (d) =>
              !d.destination.trim() ||
              !d.weight_kg.trim() ||
              !isValidNumber(d.weight_kg) ||
              Number(d.weight_kg.replace(",", ".")) <= 0
          );
          if (invalid) {
            errors.deliveries =
              "Preencha destino e peso (> 0) em todas as entregas.";
          }
        }
      }
    }

    if (currentStep === 2) {
      if (!form.vehicle_id) errors.vehicle_id = "Selecione o veículo.";
    }

    if (currentStep === 3) {
      if (!form.gross_freight.trim() || !isValidNumber(form.gross_freight)) {
        errors.gross_freight = "Informe o frete gross.";
      }
      if (!isValidNumber(form.toll_cost)) {
        errors.toll_cost = "Informe um número válido.";
      }
      if (!isValidNumber(form.insurance_pct)) {
        errors.insurance_pct = "Informe um número válido.";
      }
      if (!form.icms_pct.trim() || !isValidNumber(form.icms_pct)) {
        errors.icms_pct = "Informe o percentual de ICMS.";
      }
      if (!isValidNumber(form.transit_time_hours)) {
        errors.transit_time_hours = "Informe um número válido.";
      }
      if (belowAnttFloor && !form.antt_floor_acknowledged) {
        errors.antt_floor_acknowledged =
          "Ajuste o frete para o piso mínimo ou confirme que está ciente.";
      }
    }

    setStepErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function goNext() {
    if (validateStep(step)) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }
  }

  function goBack() {
    setStepErrors({});
    setStep((s) => Math.max(s - 1, 0));
  }

  const nfValue = toNumber(form.nf_value);
  const grossFreight = toNumber(form.gross_freight);
  const tollCost = toNumber(form.toll_cost) ?? 0;
  const insurancePct = toNumber(form.insurance_pct);
  const icmsPct = toNumber(form.icms_pct);

  const insuranceValue = computeInsuranceValue(nfValue, insurancePct);
  const netFreight = computeNetFreight(grossFreight);
  const fullFreight = computeFullFreight(
    grossFreight,
    tollCost,
    insuranceValue,
    icmsPct,
    form.parana_rule
  );

  const distanceKm = toNumber(form.distance_km);
  const selectedVehicle = vehicles.find((v) => v.id === form.vehicle_id);
  const matchedAnttCoefficient =
    anttCoefficients.find(
      (c) =>
        c.axles === selectedVehicle?.axles && c.cargo_type === form.antt_cargo_type
    ) ?? null;
  const anttFloor = computeAnttFloor(
    matchedAnttCoefficient?.ccd ?? null,
    matchedAnttCoefficient?.cc ?? null,
    distanceKm
  );
  const belowAnttFloor =
    anttFloor !== null && grossFreight !== null && grossFreight < anttFloor;

  const parsedDeliveries = deliveries.map((d) => ({
    destination: d.destination.trim(),
    weight_kg: toNumber(d.weight_kg) ?? 0,
  }));
  const totalWeight = parsedDeliveries.reduce((sum, d) => sum + d.weight_kg, 0);
  const deliveriesWithShare = parsedDeliveries.map((d) => {
    const sharePct = totalWeight > 0 ? (d.weight_kg / totalWeight) * 100 : 0;
    const freightValue =
      fullFreight !== null && totalWeight > 0
        ? fullFreight * (d.weight_kg / totalWeight)
        : null;
    return { ...d, sharePct, freightValue };
  });

  async function handleSave() {
    if (!validateStep(3)) return;

    setSubmitting(true);
    setSubmitError(null);

    const { data, error } = await supabase
      .from("quotes")
      .insert({
        client_id: form.client_id,
        base_origin: form.base_origin.trim() || null,
        origin: form.origin.trim(),
        destination: form.destination.trim(),
        final_destination: form.final_destination.trim() || null,
        distance_km: toNumber(form.distance_km),
        vehicle_id: form.vehicle_id,
        product: form.product.trim(),
        nf_value: nfValue,
        gross_freight: grossFreight,
        toll_cost: tollCost,
        insurance_pct: insurancePct,
        insurance_value: insuranceValue,
        icms_pct: icmsPct,
        net_freight: netFreight,
        full_freight: fullFreight,
        transit_time_hours: toNumber(form.transit_time_hours),
        duplicated_from_id: duplicateSource?.id ?? null,
        version: duplicateSource ? duplicateSource.version + 1 : 1,
      })
      .select("id")
      .single();

    if (error) {
      setSubmitting(false);
      setSubmitError(error.message);
      return;
    }

    if (fractioned) {
      const { error: deliveriesError } = await supabase
        .from("quote_deliveries")
        .insert(
          deliveriesWithShare.map((d) => ({
            quote_id: data.id,
            destination: d.destination,
            weight_kg: d.weight_kg,
            freight_share_pct: d.sharePct,
            freight_value: d.freightValue,
          }))
        );

      if (deliveriesError) {
        await supabase.from("quotes").delete().eq("id", data.id);
        setSubmitting(false);
        setSubmitError(
          `Não foi possível salvar as entregas fracionadas (${deliveriesError.message}). A cotação não foi salva — corrija e tente novamente.`
        );
        return;
      }
    }

    const newCityNames = Array.from(
      new Set(
        [
          form.base_origin,
          form.origin,
          form.destination,
          form.final_destination,
          ...deliveriesWithShare.map((d) => d.destination),
        ]
          .map((c) => c.trim())
          .filter(Boolean)
      )
    );
    if (newCityNames.length > 0) {
      const { error: citiesError } = await supabase
        .from("cities")
        .upsert(
          newCityNames.map((name) => ({ name })),
          { onConflict: "name", ignoreDuplicates: true }
        );
      if (!citiesError) {
        setCities((prev) => Array.from(new Set([...prev, ...newCityNames])).sort());
      }
    }

    setSubmitting(false);
    setSavedQuoteId(data.id);
  }

  function handleNewQuote() {
    setForm(emptyForm);
    setFractioned(false);
    setDeliveries(emptyDeliveries);
    setStep(0);
    setStepErrors({});
    setSubmitError(null);
    setSavedQuoteId(null);
  }

  if (loadingOptions) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-center text-sm text-navy-500">
        Carregando dados...
      </div>
    );
  }

  if (optionsError) {
    return (
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-16 text-center text-sm text-red-600">
        Erro ao carregar dados: {optionsError}
      </div>
    );
  }

  if (savedQuoteId) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-8 text-center">
          <h1 className="text-xl font-semibold text-brand-800">
            Cotação salva com sucesso.
          </h1>
          <dl className="mt-6 grid grid-cols-3 gap-4 text-left">
            <div>
              <dt className="text-xs uppercase text-brand-700">Gross</dt>
              <dd className="text-base font-medium text-brand-900">
                {formatCurrency(grossFreight)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-brand-700">Net</dt>
              <dd className="text-base font-medium text-brand-900">
                {formatCurrency(netFreight)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase text-brand-700">Full</dt>
              <dd className="text-base font-medium text-brand-900">
                {formatCurrency(fullFreight)}
              </dd>
            </div>
          </dl>
          <div className="mt-8 flex justify-center gap-3">
            <button
              onClick={handleNewQuote}
              className="rounded-lg border border-brand-300 bg-white px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50"
            >
              Nova cotação
            </button>
            <a
              href={`/api/quotes/${savedQuoteId}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-brand-300 bg-white px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50"
            >
              Baixar PDF
            </a>
            <Link
              href={`/quotes/${savedQuoteId}`}
              className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"
            >
              Ver detalhes
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <datalist id="city-options">
        {cities.map((city) => (
          <option key={city} value={city} />
        ))}
      </datalist>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
          Nova cotação
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          Preencha as etapas para calcular o frete Gross / Net / Full.
        </p>
      </div>

      {duplicateSource && (
        <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Duplicando cotação anterior — ajuste os valores para a nova rodada
          de preços (versão {duplicateSource.version + 1}).
        </div>
      )}

      <ol className="mb-8 flex items-center">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  i === step
                    ? "bg-navy-900 text-white"
                    : i < step
                    ? "bg-brand-500 text-white"
                    : "bg-navy-200 text-navy-500"
                }`}
              >
                {i + 1}
              </span>
              <span
                className={`text-sm ${
                  i === step ? "font-medium text-navy-900" : "text-navy-500"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="mx-3 h-px flex-1 bg-navy-200" />
            )}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Cliente <span className="text-red-500">*</span>
              </label>
              <select
                value={form.client_id}
                onChange={(e) => updateField("client_id", e.target.value)}
                className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Selecione...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {clients.length === 0 && (
                <p className="mt-1 text-xs text-navy-500">
                  Nenhum cliente cadastrado.{" "}
                  <Link href="/clients" className="text-brand-700 underline hover:text-brand-800">
                    Cadastrar cliente
                  </Link>
                </p>
              )}
              {stepErrors.client_id && (
                <p className="mt-1 text-xs text-red-600">{stepErrors.client_id}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Origem
                </label>
                <input
                  type="text"
                  list="city-options"
                  value={form.base_origin}
                  onChange={(e) => updateField("base_origin", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: Palhoça/SC (garagem)"
                />
                <p className="mt-1 text-xs text-navy-500">
                  Ponto de partida do veículo, antes da coleta.
                </p>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="mb-1 block text-sm font-medium text-navy-700">
                    Destino final
                  </label>
                  {form.base_origin && (
                    <button
                      type="button"
                      onClick={() =>
                        updateField("final_destination", form.base_origin)
                      }
                      className="mb-1 text-xs text-brand-700 underline hover:text-brand-800"
                    >
                      Copiar da Origem
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  list="city-options"
                  value={form.final_destination}
                  onChange={(e) =>
                    updateField("final_destination", e.target.value)
                  }
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: Palhoça/SC (retorno vazio)"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Coleta <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  list="city-options"
                  value={form.origin}
                  onChange={(e) => updateField("origin", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: São Paulo/SP"
                />
                {stepErrors.origin && (
                  <p className="mt-1 text-xs text-red-600">{stepErrors.origin}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Entrega <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  list="city-options"
                  value={form.destination}
                  onChange={(e) => updateField("destination", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: Curitiba/PR"
                />
                {stepErrors.destination && (
                  <p className="mt-1 text-xs text-red-600">
                    {stepErrors.destination}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Distância (km)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.distance_km}
                onChange={(e) => updateField("distance_km", e.target.value)}
                className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="Ex: 480"
              />
              {stepErrors.distance_km && (
                <p className="mt-1 text-xs text-red-600">
                  {stepErrors.distance_km}
                </p>
              )}
              <p className="mt-1 text-xs text-navy-500">
                Considere o trecho total (Origem → Coleta → Entrega → Destino
                final), incluindo o deslocamento vazio.
              </p>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Produto <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.product}
                onChange={(e) => updateField("product", e.target.value)}
                className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="Ex: Autopeças"
              />
              {stepErrors.product && (
                <p className="mt-1 text-xs text-red-600">{stepErrors.product}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Valor da NF (R$) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.nf_value}
                onChange={(e) => updateField("nf_value", e.target.value)}
                className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="Ex: 50000"
              />
              {stepErrors.nf_value && (
                <p className="mt-1 text-xs text-red-600">{stepErrors.nf_value}</p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-navy-700">
              <input
                type="checkbox"
                checked={fractioned}
                onChange={(e) => setFractioned(e.target.checked)}
                className="h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
              />
              Entrega fracionada (múltiplas entregas)
            </label>

            {fractioned && (
              <div className="flex flex-col gap-3 rounded-lg border border-navy-200 p-4">
                {deliveries.map((row, i) => (
                  <div key={i} className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-xs font-medium text-navy-700">
                        Destino {i + 1}
                      </label>
                      <input
                        type="text"
                        list="city-options"
                        value={row.destination}
                        onChange={(e) =>
                          updateDelivery(i, "destination", e.target.value)
                        }
                        className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                        placeholder="Ex: Maringá/PR"
                      />
                    </div>
                    <div className="w-36">
                      <label className="mb-1 block text-xs font-medium text-navy-700">
                        Peso (kg)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.weight_kg}
                        onChange={(e) =>
                          updateDelivery(i, "weight_kg", e.target.value)
                        }
                        className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                        placeholder="Ex: 8000"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDelivery(i)}
                      disabled={deliveries.length <= 2}
                      className="mb-0.5 rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-500 hover:bg-navy-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Remover
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDelivery}
                  className="self-start rounded-lg border border-navy-300 px-3 py-1.5 text-sm text-navy-700 hover:bg-navy-100"
                >
                  + Adicionar entrega
                </button>
                {stepErrors.deliveries && (
                  <p className="text-xs text-red-600">{stepErrors.deliveries}</p>
                )}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Veículo <span className="text-red-500">*</span>
              </label>
              <select
                value={form.vehicle_id}
                onChange={(e) => updateField("vehicle_id", e.target.value)}
                className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Selecione...</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.type}
                    {v.axles ? ` — ${v.axles} eixos` : ""}
                  </option>
                ))}
              </select>
              {vehicles.length === 0 && (
                <p className="mt-1 text-xs text-navy-500">
                  Nenhum veículo cadastrado.{" "}
                  <Link href="/vehicles" className="text-brand-700 underline hover:text-brand-800">
                    Cadastrar veículo
                  </Link>
                </p>
              )}
              {stepErrors.vehicle_id && (
                <p className="mt-1 text-xs text-red-600">
                  {stepErrors.vehicle_id}
                </p>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Frete Gross (R$) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.gross_freight}
                  onChange={(e) => updateField("gross_freight", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: 4500"
                />
                {stepErrors.gross_freight && (
                  <p className="mt-1 text-xs text-red-600">
                    {stepErrors.gross_freight}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Pedágio (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.toll_cost}
                  onChange={(e) => updateField("toll_cost", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: 180"
                />
                {stepErrors.toll_cost && (
                  <p className="mt-1 text-xs text-red-600">
                    {stepErrors.toll_cost}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Tipo de carga (piso ANTT)
              </label>
              <select
                value={form.antt_cargo_type}
                onChange={(e) => updateField("antt_cargo_type", e.target.value)}
                className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              >
                <option value="">Não verificar piso ANTT</option>
                {Array.from(new Set(anttCoefficients.map((c) => c.cargo_type))).map(
                  (cargoType) => (
                    <option key={cargoType} value={cargoType}>
                      {cargoType}
                    </option>
                  )
                )}
              </select>
              {form.antt_cargo_type && !matchedAnttCoefficient && (
                <p className="mt-1 text-xs text-navy-500">
                  Nenhum coeficiente cadastrado para {selectedVehicle?.axles ?? "?"}{" "}
                  eixos + este tipo de carga.{" "}
                  <Link href="/antt-coefficients" className="text-brand-700 underline hover:text-brand-800">
                    Cadastrar
                  </Link>
                </p>
              )}
              {matchedAnttCoefficient && anttFloor !== null && (
                <div
                  className={`mt-2 rounded-lg px-3 py-2 text-sm ${
                    belowAnttFloor
                      ? "bg-amber-50 text-amber-800"
                      : "bg-navy-50 text-navy-600"
                  }`}
                >
                  <div>
                    Piso mínimo ANTT:{" "}
                    <span className="font-medium">
                      {formatCurrency(anttFloor)}
                    </span>
                  </div>
                  {belowAnttFloor && (
                    <>
                      <p className="mt-1">
                        O frete Gross informado está abaixo do piso mínimo
                        obrigatório.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          updateField("gross_freight", anttFloor.toFixed(2))
                        }
                        className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                      >
                        Ajustar Gross para o piso ({formatCurrency(anttFloor)})
                      </button>
                      <label className="mt-2 flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={form.antt_floor_acknowledged}
                          onChange={(e) =>
                            updateField(
                              "antt_floor_acknowledged",
                              e.target.checked
                            )
                          }
                          className="h-4 w-4 rounded border-amber-300 text-amber-800 focus:ring-amber-500"
                        />
                        Estou ciente e assumo a responsabilidade por cotar
                        abaixo do piso ANTT.
                      </label>
                      {stepErrors.antt_floor_acknowledged && (
                        <p className="mt-1 text-xs text-red-600">
                          {stepErrors.antt_floor_acknowledged}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Seguro (%)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.insurance_pct}
                  onChange={(e) => updateField("insurance_pct", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: 0.3"
                />
                <p className="mt-1 text-xs text-navy-500">
                  Deixe em branco se o seguro ainda não está definido.
                </p>
                {stepErrors.insurance_pct && (
                  <p className="mt-1 text-xs text-red-600">
                    {stepErrors.insurance_pct}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  ICMS (%) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.icms_pct}
                  onChange={(e) => updateField("icms_pct", e.target.value)}
                  className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  placeholder="Ex: 12"
                />
                {stepErrors.icms_pct && (
                  <p className="mt-1 text-xs text-red-600">
                    {stepErrors.icms_pct}
                  </p>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-navy-700">
              <input
                type="checkbox"
                checked={form.parana_rule}
                onChange={(e) => updateField("parana_rule", e.target.checked)}
                className="h-4 w-4 rounded border-navy-300 text-brand-600 focus:ring-brand-500"
              />
              Regra especial Paraná (pedágio fora da base do ICMS)
            </label>

            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700">
                Transit time (horas)
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={form.transit_time_hours}
                onChange={(e) =>
                  updateField("transit_time_hours", e.target.value)
                }
                className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="Ex: 18"
              />
              {stepErrors.transit_time_hours && (
                <p className="mt-1 text-xs text-red-600">
                  {stepErrors.transit_time_hours}
                </p>
              )}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div className="text-navy-500">Cliente</div>
              <div className="text-navy-900">
                {clients.find((c) => c.id === form.client_id)?.name ?? "—"}
              </div>
              <div className="text-navy-500">Rota (coleta → entrega)</div>
              <div className="text-navy-900">
                {form.origin} → {form.destination}
              </div>
              {(form.base_origin || form.final_destination) && (
                <>
                  <div className="text-navy-500">Deslocamento vazio</div>
                  <div className="text-navy-900">
                    {form.base_origin || "—"} → (coleta/entrega) →{" "}
                    {form.final_destination || "—"}
                  </div>
                </>
              )}
              <div className="text-navy-500">Veículo</div>
              <div className="text-navy-900">
                {vehicles.find((v) => v.id === form.vehicle_id)?.type ?? "—"}
              </div>
              <div className="text-navy-500">Produto</div>
              <div className="text-navy-900">{form.product}</div>
            </div>

            <div className="grid grid-cols-3 gap-4 rounded-lg bg-navy-50 p-4">
              <div>
                <div className="text-xs uppercase text-navy-500">Gross</div>
                <div className="text-lg font-semibold text-navy-900">
                  {formatCurrency(grossFreight)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-navy-500">Net</div>
                <div className="text-lg font-semibold text-navy-900">
                  {formatCurrency(netFreight)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-navy-500">Full</div>
                <div className="text-lg font-semibold text-navy-900">
                  {formatCurrency(fullFreight)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-navy-500">Seguro</div>
                <div className="text-navy-900">
                  {formatCurrency(insuranceValue)}
                </div>
              </div>
              <div>
                <div className="text-navy-500">Pedágio</div>
                <div className="text-navy-900">{formatCurrency(tollCost)}</div>
              </div>
              <div>
                <div className="text-navy-500">Transit time</div>
                <div className="text-navy-900">
                  {form.transit_time_hours
                    ? `${form.transit_time_hours}h`
                    : "—"}
                </div>
              </div>
            </div>

            {matchedAnttCoefficient && anttFloor !== null && (
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  belowAnttFloor
                    ? "bg-amber-50 text-amber-800"
                    : "bg-navy-50 text-navy-600"
                }`}
              >
                Piso mínimo ANTT ({form.antt_cargo_type}):{" "}
                <span className="font-medium">{formatCurrency(anttFloor)}</span>
                {belowAnttFloor && " — frete Gross abaixo do piso, confirmado pelo usuário."}
              </div>
            )}

            {fractioned && (
              <div>
                <div className="mb-2 text-sm font-medium text-navy-900">
                  Rateio por entrega
                </div>
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-navy-500">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Destino</th>
                      <th className="py-1 pr-3 font-medium">Peso</th>
                      <th className="py-1 pr-3 font-medium">%</th>
                      <th className="py-1 font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {deliveriesWithShare.map((d, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3 text-navy-900">
                          {d.destination || "—"}
                        </td>
                        <td className="py-1.5 pr-3 text-navy-600">
                          {d.weight_kg.toLocaleString("pt-BR")} kg
                        </td>
                        <td className="py-1.5 pr-3 text-navy-600">
                          {d.sharePct.toFixed(1)}%
                        </td>
                        <td className="py-1.5 text-navy-900">
                          {formatCurrency(d.freightValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {submitError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                Erro ao salvar: {submitError}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <button
          onClick={goBack}
          disabled={step === 0}
          className="rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Voltar
        </button>

        {step < STEPS.length - 1 ? (
          <button
            onClick={goNext}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Avançar
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={submitting}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Salvando..." : "Salvar cotação"}
          </button>
        )}
      </div>
    </div>
  );
}
