"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/format";
import {
  computeFullFreight,
  computeNetFreight,
} from "@/lib/quoteCalculations";
import RouteMap, { type RouteMapWaypoint } from "@/components/RouteMap";
import {
  buildIcmsRateMap,
  lookupIcmsRate,
  ufFromCityName,
  type IcmsRate,
  type IcmsRateMap,
} from "@/lib/icms";
import { RouteCard } from "./RouteCard";

interface ClientOption {
  id: string;
  name: string;
}

interface VehicleOption {
  id: string;
  type: string;
  axles: number | null;
  over_time_rate: number | null;
}

interface HeaderForm {
  client_id: string;
  product: string;
  insurance_pct: string;
  parana_rule: boolean;
  free_time_hours: string;
}

const emptyHeader: HeaderForm = {
  client_id: "",
  product: "",
  insurance_pct: "",
  parana_rule: false,
  free_time_hours: "",
};

interface RouteRow {
  origin: string;
  destination: string;
  final_destination: string;
  vehicle_id: string;
  min_load_ton: string;
  toll_cost: string;
  gross_freight: string;
  transit_time_hours: string;
  /** Vazio = usar a alíquota do cadastro; preenchido = sobrescrita manual. */
  icms_pct: string;
}

function emptyRouteRow(origin = ""): RouteRow {
  return {
    origin,
    destination: "",
    final_destination: origin,
    vehicle_id: "",
    min_load_ton: "",
    toll_cost: "",
    gross_freight: "",
    transit_time_hours: "",
    icms_pct: "",
  };
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

// Supabase limita cada consulta a 1000 linhas — com ~5.570 municípios em
// `cities`, precisa paginar pra trazer a lista inteira pro datalist.
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

export default function NewQuoteBatchPage() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [icmsRates, setIcmsRates] = useState<IcmsRateMap>(new Map());
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const [header, setHeader] = useState<HeaderForm>(emptyHeader);
  const [rows, setRows] = useState<RouteRow[]>([emptyRouteRow()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [routeWaypoints, setRouteWaypoints] = useState<RouteMapWaypoint[]>([]);
  const [geocodingRoute, setGeocodingRoute] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savedBatchId, setSavedBatchId] = useState<string | null>(null);

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
      setOptionsError(null);

      const [clientsRes, vehiclesRes, icmsRes, cityNames] = await Promise.all([
        supabase.from("clients").select("id, name").order("name"),
        supabase
          .from("vehicles")
          .select("id, type, axles, over_time_rate")
          .order("type"),
        supabase.from("icms_rates").select("uf_origin, uf_destination, rate"),
        fetchAllCityNames(),
      ]);

      if (clientsRes.error) {
        setOptionsError(clientsRes.error.message);
      } else if (vehiclesRes.error) {
        setOptionsError(vehiclesRes.error.message);
      } else if (icmsRes.error) {
        setOptionsError(icmsRes.error.message);
      } else {
        setClients(clientsRes.data ?? []);
        setVehicles(vehiclesRes.data ?? []);
        setIcmsRates(buildIcmsRateMap((icmsRes.data as IcmsRate[]) ?? []));
        setCities(cityNames);
      }

      setLoadingOptions(false);
    }
    loadOptions();
  }, []);

  function updateHeader<K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) {
    setHeader((prev) => ({ ...prev, [key]: value }));
  }

  function updateRow<K extends keyof RouteRow>(
    index: number,
    key: K,
    value: RouteRow[K]
  ) {
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const updated = { ...row, [key]: value };
        // O veículo sempre volta vazio até a origem — mantém "fim de viagem"
        // acompanhando a origem enquanto o usuário não o editar à parte.
        if (key === "origin" && row.final_destination === row.origin) {
          updated.final_destination = value as string;
        }
        return updated;
      })
    );
  }

  function addRow() {
    const lastOrigin = rows[rows.length - 1]?.origin ?? "";
    setRows((prev) => [...prev, emptyRouteRow(lastOrigin)]);
    setActiveRowIndex(rows.length);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setActiveRowIndex((prev) => Math.max(0, Math.min(prev, rows.length - 2)));
  }

  function handleNewBatch() {
    setHeader(emptyHeader);
    setRows([emptyRouteRow()]);
    setErrors({});
    setSubmitError(null);
    setSavedBatchId(null);
    setActiveRowIndex(0);
    setRouteWaypoints([]);
  }

  const activeRow = rows[activeRowIndex] as RouteRow | undefined;

  // Mostra ao vivo, num mapa, por onde a rota da linha em edição está sendo
  // traçada — debounced pra não estourar o limite de 1 req/s do Nominatim.
  useEffect(() => {
    const cityNames = [
      activeRow?.origin ?? "",
      activeRow?.destination ?? "",
      activeRow?.final_destination ?? "",
    ]
      .map((c) => c.trim())
      .filter(Boolean);

    if (cityNames.length < 2) {
      setRouteWaypoints([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setGeocodingRoute(true);
      try {
        const response = await fetch("/api/quotes/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cities: cityNames }),
        });
        const { results } = (await response.json()) as {
          results: { name: string; lat: number; lng: number }[];
        };
        const byName = new Map(results.map((r) => [r.name, r]));
        const resolved = cityNames
          .map((name) => {
            const match = byName.get(name);
            return match ? { lat: match.lat, lng: match.lng, label: name } : null;
          })
          .filter((w): w is RouteMapWaypoint => w !== null);
        setRouteWaypoints(resolved);
      } catch {
        setRouteWaypoints([]);
      } finally {
        setGeocodingRoute(false);
      }
    }, 600);

    return () => clearTimeout(timeoutId);
  }, [
    activeRow?.origin,
    activeRow?.destination,
    activeRow?.final_destination,
  ]);

  const insurancePct = toNumber(header.insurance_pct);

  const computedRows = rows.map((row) => {
    const grossFreight = toNumber(row.gross_freight);
    const tollCost = toNumber(row.toll_cost);
    const netFreight = computeNetFreight(grossFreight);

    // ICMS por rota: a UF sai do nome da cidade ("Município/UF") e a alíquota
    // da tabela cadastrada. Um valor digitado na linha sobrescreve o cadastro.
    const ufOrigin = ufFromCityName(row.origin);
    const ufDestination = ufFromCityName(row.destination);
    const tableIcms = lookupIcmsRate(icmsRates, ufOrigin, ufDestination);
    const overrideIcms = toNumber(row.icms_pct);
    const icmsPct = overrideIcms ?? tableIcms;

    const fullFreight = computeFullFreight(
      grossFreight,
      tollCost,
      null,
      icmsPct,
      header.parana_rule
    );
    // Over time vem do cadastro do veículo — copiado pra cotação no save
    // para que alterar o cadastro depois não mexa em cotações já emitidas.
    const overTimeRate =
      vehicles.find((v) => v.id === row.vehicle_id)?.over_time_rate ?? null;
    return {
      grossFreight,
      tollCost,
      netFreight,
      fullFreight,
      overTimeRate,
      ufOrigin,
      ufDestination,
      tableIcms,
      icmsPct,
    };
  });

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};

    if (!header.client_id) nextErrors.client_id = "Selecione o cliente.";
    if (!header.product.trim()) nextErrors.product = "Informe o produto.";
    if (!isValidNumber(header.insurance_pct))
      nextErrors.insurance_pct = "Valor inválido.";
    if (!isValidNumber(header.free_time_hours))
      nextErrors.free_time_hours = "Valor inválido.";

    if (rows.length === 0) {
      nextErrors.rows = "Adicione ao menos uma rota.";
    }

    rows.forEach((row, i) => {
      if (!row.origin.trim()) nextErrors[`origin_${i}`] = "Informe a origem.";
      if (!row.destination.trim())
        nextErrors[`destination_${i}`] = "Informe o destino.";
      if (!row.vehicle_id) nextErrors[`vehicle_${i}`] = "Selecione o veículo.";
      if (toNumber(row.gross_freight) === null)
        nextErrors[`gross_${i}`] = "Informe o frete Gross.";
      if (!isValidNumber(row.min_load_ton))
        nextErrors[`min_load_${i}`] = "Valor inválido.";
      if (!isValidNumber(row.toll_cost))
        nextErrors[`toll_${i}`] = "Valor inválido.";
      if (!isValidNumber(row.transit_time_hours))
        nextErrors[`transit_${i}`] = "Valor inválido.";
      if (!isValidNumber(row.icms_pct))
        nextErrors[`icms_${i}`] = "Valor inválido.";
      // Sem alíquota não há como calcular o Full — melhor barrar do que
      // salvar uma cotação com imposto zerado por omissão.
      if (computedRows[i].icmsPct === null)
        nextErrors[`icms_${i}`] = "Sem alíquota: informe o ICMS.";
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    const freeTimeHours = toNumber(header.free_time_hours);

    const { data: batch, error: batchError } = await supabase
      .from("quote_batches")
      .insert({
        client_id: header.client_id,
        product: header.product.trim(),
        insurance_pct: insurancePct,
        parana_rule: header.parana_rule,
        free_time_hours: freeTimeHours,
      })
      .select("id")
      .single();

    if (batchError || !batch) {
      setSubmitting(false);
      setSubmitError(batchError?.message ?? "Não foi possível criar o lote.");
      return;
    }

    const { error: quotesError } = await supabase.from("quotes").insert(
      rows.map((row, i) => ({
        batch_id: batch.id,
        client_id: header.client_id,
        origin: row.origin.trim(),
        destination: row.destination.trim(),
        final_destination: row.final_destination.trim() || null,
        vehicle_id: row.vehicle_id,
        product: header.product.trim(),
        icms_pct: computedRows[i].icmsPct,
        insurance_pct: insurancePct,
        insurance_value: null,
        min_load_ton: toNumber(row.min_load_ton),
        toll_cost: toNumber(row.toll_cost),
        gross_freight: computedRows[i].grossFreight,
        net_freight: computedRows[i].netFreight,
        full_freight: computedRows[i].fullFreight,
        transit_time_hours: toNumber(row.transit_time_hours),
        free_time_hours: freeTimeHours,
        over_time_cost: computedRows[i].overTimeRate,
      }))
    );

    if (quotesError) {
      await supabase.from("quote_batches").delete().eq("id", batch.id);
      setSubmitting(false);
      setSubmitError(
        `Não foi possível salvar as rotas (${quotesError.message}). O lote não foi salvo — corrija e tente novamente.`
      );
      return;
    }

    const newCityNames = Array.from(
      new Set(
        rows
          .flatMap((row) => [row.origin, row.destination, row.final_destination])
          .map((c) => c.trim())
          .filter(Boolean)
      )
    );
    if (newCityNames.length > 0) {
      await supabase
        .from("cities")
        .upsert(
          newCityNames.map((name) => ({ name })),
          { onConflict: "name", ignoreDuplicates: true }
        );
    }

    setSubmitting(false);
    setSavedBatchId(batch.id);
  }

  if (loadingOptions) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-16 text-center text-sm text-navy-500">
        Carregando dados...
      </div>
    );
  }

  if (optionsError) {
    return (
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-16 text-center text-sm text-red-600">
        Erro ao carregar dados: {optionsError}
      </div>
    );
  }

  if (savedBatchId) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-8 text-center">
          <h1 className="text-xl font-semibold text-brand-800">
            Lote salvo com sucesso.
          </h1>
          <p className="mt-2 text-sm text-brand-700">
            {rows.length} {rows.length === 1 ? "rota" : "rotas"} cadastradas.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <button
              type="button"
              onClick={handleNewBatch}
              className="rounded-lg border border-brand-300 bg-white px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50"
            >
              Novo lote
            </button>
            <Link
              href={`/quotes/batches/${savedBatchId}`}
              className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white hover:bg-navy-800"
            >
              Ver lote
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8">
        <Link
          href="/quotes/batches"
          className="text-sm text-navy-500 hover:text-navy-700"
        >
          ← Lotes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-navy-900">
          Nova cotação em lote
        </h1>
        <p className="mt-1 text-sm text-navy-500">
          Cadastre várias rotas de uma vez — cada rota vira uma cotação
          completa, todas agrupadas para apresentar juntas ao cliente.
        </p>
      </div>

      <div className="rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-navy-500">
          Condições do lote
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-navy-600">Cliente</label>
            <select
              value={header.client_id}
              onChange={(e) => updateHeader("client_id", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            >
              <option value="">Selecione...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.client_id && (
              <p className="mt-1 text-xs text-red-600">{errors.client_id}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-navy-600">Produto</label>
            <input
              type="text"
              value={header.product}
              onChange={(e) => updateHeader("product", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {errors.product && (
              <p className="mt-1 text-xs text-red-600">{errors.product}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-navy-600">
              Seguro (% sobre a NF)
            </label>
            <input
              type="text"
              value={header.insurance_pct}
              onChange={(e) => updateHeader("insurance_pct", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {errors.insurance_pct && (
              <p className="mt-1 text-xs text-red-600">{errors.insurance_pct}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-navy-600">
              Free time (horas)
            </label>
            <input
              type="text"
              value={header.free_time_hours}
              onChange={(e) => updateHeader("free_time_hours", e.target.value)}
              className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            {errors.free_time_hours && (
              <p className="mt-1 text-xs text-red-600">{errors.free_time_hours}</p>
            )}
          </div>
          <div className="flex items-center gap-2 sm:col-span-3">
            <input
              id="parana_rule"
              type="checkbox"
              checked={header.parana_rule}
              onChange={(e) => updateHeader("parana_rule", e.target.checked)}
              className="h-4 w-4 rounded border-navy-300"
            />
            <label htmlFor="parana_rule" className="text-sm text-navy-700">
              Aplicar regra especial do Paraná no cálculo do Full
            </label>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-navy-500">
            Rotas
          </h2>
          <button
            type="button"
            onClick={addRow}
            className="text-sm font-medium text-brand-700 underline hover:text-brand-800"
          >
            + Adicionar rota
          </button>
        </div>
        <p className="mt-1 text-xs text-navy-500">
          &quot;Destino (fim de viagem)&quot; é onde o veículo termina a viagem
          já vazio — usado só no cálculo da rota, não aparece na proposta do
          cliente. Vem preenchido com a origem (retorno ao carregamento). O
          over time vem do{" "}
          <Link
            href="/vehicles"
            className="text-brand-700 underline hover:text-brand-800"
          >
            cadastro do veículo
          </Link>
          , e o ICMS das{" "}
          <Link
            href="/icms-rates"
            className="text-brand-700 underline hover:text-brand-800"
          >
            alíquotas por estado
          </Link>{" "}
          — escolha as cidades pela lista (formato &quot;Município/UF&quot;)
          para a alíquota ser encontrada. Digite na coluna ICMS só para
          sobrescrever.
        </p>
        {errors.rows && (
          <p className="mt-2 text-xs text-red-600">{errors.rows}</p>
        )}

        <ul className="mt-4 divide-y divide-navy-100 sm:hidden">
          {rows.map((row, i) => (
            <RouteCard
              key={i}
              index={i}
              values={row}
              computed={computedRows[i]}
              vehicles={vehicles}
              errors={errors}
              citiesListId="batch-cities"
              onChange={(key, value) => updateRow(i, key, value)}
              onFocus={() => setActiveRowIndex(i)}
              onRemove={() => removeRow(i)}
              canRemove={rows.length > 1}
            />
          ))}
        </ul>

        <div className="mt-4 hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[1500px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-navy-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">Origem</th>
                <th className="px-2 py-1.5 font-medium">Destino (entrega)</th>
                <th className="px-2 py-1.5 font-medium">Destino (fim de viagem)</th>
                <th className="px-2 py-1.5 font-medium">Veículo</th>
                <th className="px-2 py-1.5 font-medium">Lotação mín. (ton)</th>
                <th className="px-2 py-1.5 font-medium">Pedágio (R$)</th>
                <th className="px-2 py-1.5 font-medium">Gross (R$)</th>
                <th className="px-2 py-1.5 font-medium">Transit (h)</th>
                <th className="px-2 py-1.5 font-medium">ICMS (%)</th>
                <th className="px-2 py-1.5 font-medium">Over time</th>
                <th className="px-2 py-1.5 font-medium">Net</th>
                <th className="px-2 py-1.5 font-medium">Full</th>
                <th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className={i === activeRowIndex ? "bg-brand-50/60" : undefined}
                >
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      list="batch-cities"
                      value={row.origin}
                      onChange={(e) => updateRow(i, "origin", e.target.value)}
                      onFocus={() => setActiveRowIndex(i)}
                      className="w-36 rounded-lg border border-navy-300 px-2 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                    {errors[`origin_${i}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`origin_${i}`]}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      list="batch-cities"
                      value={row.destination}
                      onChange={(e) =>
                        updateRow(i, "destination", e.target.value)
                      }
                      onFocus={() => setActiveRowIndex(i)}
                      className="w-36 rounded-lg border border-navy-300 px-2 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                    {errors[`destination_${i}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`destination_${i}`]}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      list="batch-cities"
                      value={row.final_destination}
                      onChange={(e) =>
                        updateRow(i, "final_destination", e.target.value)
                      }
                      onFocus={() => setActiveRowIndex(i)}
                      className="w-36 rounded-lg border border-navy-300 px-2 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      value={row.vehicle_id}
                      onChange={(e) => updateRow(i, "vehicle_id", e.target.value)}
                      className="w-40 rounded-lg border border-navy-300 px-2 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    >
                      <option value="">Selecione...</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.type}
                        </option>
                      ))}
                    </select>
                    {errors[`vehicle_${i}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`vehicle_${i}`]}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={row.min_load_ton}
                      onChange={(e) =>
                        updateRow(i, "min_load_ton", e.target.value)
                      }
                      className="w-24 rounded-lg border border-navy-300 px-2 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                    {errors[`min_load_${i}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`min_load_${i}`]}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={row.toll_cost}
                      onChange={(e) => updateRow(i, "toll_cost", e.target.value)}
                      className="w-24 rounded-lg border border-navy-300 px-2 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                    {errors[`toll_${i}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`toll_${i}`]}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={row.gross_freight}
                      onChange={(e) =>
                        updateRow(i, "gross_freight", e.target.value)
                      }
                      className="w-28 rounded-lg border border-navy-300 px-2 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                    {errors[`gross_${i}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`gross_${i}`]}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={row.transit_time_hours}
                      onChange={(e) =>
                        updateRow(i, "transit_time_hours", e.target.value)
                      }
                      className="w-20 rounded-lg border border-navy-300 px-2 py-1.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    />
                    {errors[`transit_${i}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`transit_${i}`]}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="text"
                      value={row.icms_pct}
                      onChange={(e) => updateRow(i, "icms_pct", e.target.value)}
                      onFocus={() => setActiveRowIndex(i)}
                      placeholder={
                        computedRows[i].tableIcms !== null
                          ? String(computedRows[i].tableIcms)
                          : "?"
                      }
                      title={
                        computedRows[i].ufOrigin && computedRows[i].ufDestination
                          ? `${computedRows[i].ufOrigin} → ${computedRows[i].ufDestination}`
                          : "UF não identificada — escolha as cidades pela lista"
                      }
                      className={`w-20 rounded-lg border px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 ${
                        computedRows[i].icmsPct === null
                          ? "border-amber-400 bg-amber-50 text-navy-900 placeholder:text-amber-700"
                          : "border-navy-300 text-navy-900 placeholder:text-navy-400"
                      }`}
                    />
                    {errors[`icms_${i}`] && (
                      <p className="mt-1 text-xs text-red-600">
                        {errors[`icms_${i}`]}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-navy-700">
                    {computedRows[i].overTimeRate !== null
                      ? `${formatCurrency(computedRows[i].overTimeRate)}/h`
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap text-navy-700">
                    {formatCurrency(computedRows[i].netFreight)}
                  </td>
                  <td className="px-2 py-1.5 whitespace-nowrap font-medium text-navy-900">
                    {formatCurrency(computedRows[i].fullFreight)}
                  </td>
                  <td className="px-2 py-1.5">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-xs text-red-600 hover:text-red-800"
                        aria-label="Remover rota"
                      >
                        Remover
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="batch-cities">
            {cities.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-navy-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium uppercase tracking-wide text-navy-500">
          Mapa da rota{" "}
          {activeRow?.origin.trim() || activeRow?.destination.trim() ? (
            <span className="normal-case text-navy-400">
              — linha {activeRowIndex + 1}: {activeRow?.origin || "?"} →{" "}
              {activeRow?.destination || "?"}
              {activeRow?.final_destination.trim()
                ? ` → ${activeRow.final_destination}`
                : ""}
            </span>
          ) : null}
        </h2>
        <p className="mt-1 text-xs text-navy-500">
          Clique numa linha da tabela acima para ver a rota traçada aqui —
          incluindo o retorno vazio até o fim de viagem.
        </p>
        <div className="mt-3">
          {geocodingRoute ? (
            <div className="flex h-80 w-full items-center justify-center rounded-lg bg-navy-50 text-sm text-navy-500">
              Localizando pontos da rota...
            </div>
          ) : (
            <RouteMap waypoints={routeWaypoints} showDistance />
          )}
        </div>
      </div>

      {submitError && (
        <p className="mt-4 text-sm text-red-600">{submitError}</p>
      )}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting}
          className="rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? "Salvando..." : "Salvar lote"}
        </button>
      </div>
    </div>
  );
}
