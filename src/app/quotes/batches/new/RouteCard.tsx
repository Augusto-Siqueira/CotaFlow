"use client";

import { formatCurrency } from "@/lib/format";

/**
 * Versão mobile de uma linha da tabela de rotas. A tabela tem 13 colunas e no
 * celular só serviria via rolagem lateral — aqui cada rota vira um cartão com
 * os campos empilhados e os valores calculados no rodapé.
 */

export interface RouteCardVehicle {
  id: string;
  type: string;
}

export interface RouteCardValues {
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

export interface RouteCardComputed {
  netFreight: number | null;
  fullFreight: number | null;
  overTimeRate: number | null;
  tableIcms: number | null;
  icmsPct: number | null;
  ufOrigin: string | null;
  ufDestination: string | null;
}

const inputBase =
  "mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const inputNormal = `${inputBase} border-navy-300 text-navy-900`;
const labelCls = "text-xs font-medium text-navy-600";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

export function RouteCard({
  index,
  values,
  computed,
  vehicles,
  errors,
  citiesListId,
  onChange,
  onFocus,
  onRemove,
  canRemove,
}: {
  index: number;
  values: RouteCardValues;
  computed: RouteCardComputed;
  vehicles: RouteCardVehicle[];
  errors: Record<string, string>;
  citiesListId: string;
  onChange: (key: keyof RouteCardValues, value: string) => void;
  onFocus: () => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const i = index;

  return (
    <li className="px-4 py-4" onFocus={onFocus}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-navy-900">Rota {i + 1}</p>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs font-medium text-red-600 hover:text-red-800"
          >
            Remover
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div>
          <label className={labelCls}>Origem</label>
          <input
            type="text"
            list={citiesListId}
            value={values.origin}
            onChange={(e) => onChange("origin", e.target.value)}
            className={inputNormal}
          />
          <FieldError message={errors[`origin_${i}`]} />
        </div>

        <div>
          <label className={labelCls}>Destino (entrega)</label>
          <input
            type="text"
            list={citiesListId}
            value={values.destination}
            onChange={(e) => onChange("destination", e.target.value)}
            className={inputNormal}
          />
          <FieldError message={errors[`destination_${i}`]} />
        </div>

        <div>
          <label className={labelCls}>Destino (fim de viagem)</label>
          <input
            type="text"
            list={citiesListId}
            value={values.final_destination}
            onChange={(e) => onChange("final_destination", e.target.value)}
            className={inputNormal}
          />
        </div>

        <div>
          <label className={labelCls}>Veículo</label>
          <select
            value={values.vehicle_id}
            onChange={(e) => onChange("vehicle_id", e.target.value)}
            className={inputNormal}
          >
            <option value="">Selecione...</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.type}
              </option>
            ))}
          </select>
          <FieldError message={errors[`vehicle_${i}`]} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Lotação mín. (ton)</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.min_load_ton}
              onChange={(e) => onChange("min_load_ton", e.target.value)}
              className={inputNormal}
            />
            <FieldError message={errors[`min_load_${i}`]} />
          </div>
          <div>
            <label className={labelCls}>Pedágio (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.toll_cost}
              onChange={(e) => onChange("toll_cost", e.target.value)}
              className={inputNormal}
            />
            <FieldError message={errors[`toll_${i}`]} />
          </div>
          <div>
            <label className={labelCls}>Gross (R$)</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.gross_freight}
              onChange={(e) => onChange("gross_freight", e.target.value)}
              className={inputNormal}
            />
            <FieldError message={errors[`gross_${i}`]} />
          </div>
          <div>
            <label className={labelCls}>Transit (h)</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.transit_time_hours}
              onChange={(e) => onChange("transit_time_hours", e.target.value)}
              className={inputNormal}
            />
            <FieldError message={errors[`transit_${i}`]} />
          </div>
          <div>
            <label className={labelCls}>ICMS (%)</label>
            <input
              type="text"
              inputMode="decimal"
              value={values.icms_pct}
              onChange={(e) => onChange("icms_pct", e.target.value)}
              placeholder={
                computed.tableIcms !== null ? String(computed.tableIcms) : "?"
              }
              className={`${inputBase} ${
                computed.icmsPct === null
                  ? "border-amber-400 bg-amber-50 text-navy-900 placeholder:text-amber-700"
                  : "border-navy-300 text-navy-900 placeholder:text-navy-400"
              }`}
            />
            <p className="mt-1 text-[11px] text-navy-400">
              {computed.ufOrigin && computed.ufDestination
                ? `${computed.ufOrigin} → ${computed.ufDestination}`
                : "UF não identificada"}
            </p>
            <FieldError message={errors[`icms_${i}`]} />
          </div>
          <div>
            <label className={labelCls}>Over time</label>
            <p className="mt-1 rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-700">
              {computed.overTimeRate !== null
                ? `${formatCurrency(computed.overTimeRate)}/h`
                : "—"}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex gap-3 border-t border-navy-100 pt-3">
        <div className="flex-1 rounded-lg bg-navy-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-navy-500">
            Net
          </p>
          <p className="text-sm font-semibold text-navy-900">
            {formatCurrency(computed.netFreight)}
          </p>
        </div>
        <div className="flex-1 rounded-lg bg-brand-50 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand-700">
            Full
          </p>
          <p className="text-sm font-semibold text-brand-900">
            {formatCurrency(computed.fullFreight)}
          </p>
        </div>
      </div>
    </li>
  );
}
