"use client";

import { useCallback } from "react";
import { SearchSelect } from "@/components/SearchSelect";
import { DestinationsInput, baseCity, splitDestinations } from "@/components/Destinations";
import { OrderLinesEditor, orderLinesError, parseOrderRows, toOrderRow, type OrderRow } from "@/components/LoadingOrderModal";
import { EMPTY_LINE, ORDER_NATURES, hasLoadingOrder, isBlankLine, linesFromDestination, type OrderLine } from "@/lib/loadingOrder";
import { cityOf, orderWeight, pick, type ScheduleInput, type ScheduleOptions } from "@/lib/kmExato/schedule";

// Parte "Programação" da nova viagem do KM Btech: a carga que a viagem cria na
// Programação (unidade, produto, origem, placas, motorista, horário), os
// destinos e a ordem de embarque. Na edição só aparecem destinos e ordem; o
// resto a equipe muda na própria Programação.

export interface SchedForm {
  unit: string;
  cargo: string;
  origin: string;
  tractor: string;
  trailer: string;
  driver: string;
  time: string;
  destination: string;
  /** Texto digitado no campo de destinos e ainda não adicionado. */
  pendingDest: string;
  rows: OrderRow[];
}

export const emptySchedForm = (): SchedForm => ({
  unit: "",
  cargo: "",
  origin: "",
  tractor: "",
  trailer: "",
  driver: "",
  time: "",
  destination: "",
  pendingDest: "",
  rows: [toOrderRow(EMPTY_LINE)],
});

/** Unidade escolhida + sugestões da última carga dela (só nos campos ainda vazios). */
export function withUnit(f: SchedForm, unit: string, opts: ScheduleOptions): SchedForm {
  const last = opts.lastByUnit[unit];
  return {
    ...f,
    unit,
    origin: f.origin || last?.origin || "",
    cargo: f.cargo || last?.cargo || "",
    time: f.time || last?.loading_time?.slice(0, 5) || "",
  };
}

/** A placa do KM vai para o campo certo da Programação (cavalo/truck ou semi-reboque). */
export function withPlate(f: SchedForm, plate: string, opts: ScheduleOptions): SchedForm {
  const p = plate.trim().toUpperCase();
  if (opts.trailers.includes(p)) return { ...f, trailer: p };
  if (opts.tractors.includes(p)) return { ...f, tractor: p };
  return f;
}

/** Linha com algo da ordem além da cidade (só a cidade = sugestão, não entra na ordem). */
const isOrderLine = (l: OrderLine) => !!(l.oc || l.nature || l.compartments || l.tons !== null);

/** Linhas da ordem; as que só têm a cidade viram vazias (mantém a numeração das linhas). */
const orderParsed = (rows: OrderRow[]) => parseOrderRows(rows).map((l) => (isOrderLine(l) ? l : { ...EMPTY_LINE }));

/** Ordem ainda sem nada além das cidades sugeridas: pode acompanhar os destinos. */
const onlyCities = (rows: OrderRow[]) => !parseOrderRows(rows).some(isOrderLine);

/** Erro do formulário (null = ok). Na edição só destinos e ordem são conferidos. */
export function schedError(f: SchedForm, opts: ScheduleOptions, editing: boolean): string | null {
  if (!editing) {
    if (!f.unit) return "Escolha a unidade da Btech.";
    if (!f.cargo.trim()) return "Informe o produto da carga.";
    if (f.origin.trim() && !cityOf(f.origin, opts.cities)) return `Origem inválida: escolha uma cidade da lista (Cidade/UF).`;
    if (pick(f.tractor, opts.tractors) === null) return `Placa do cavalo/truck não cadastrada na frota: ${f.tractor}.`;
    if (pick(f.trailer, opts.trailers) === null) return `Placa do semi-reboque não cadastrada na frota: ${f.trailer}.`;
    if (pick(f.driver, opts.drivers.map((d) => d.value)) === null) return `Motorista não cadastrado: ${f.driver}.`;
  }
  if (f.pendingDest.trim()) return `Destino digitado e não adicionado: "${f.pendingDest.trim()}". Clique em Adicionar entrega.`;
  if (splitDestinations(f.destination).length === 0) return "Informe ao menos um destino.";
  return hasLoadingOrder(f.unit) ? orderLinesError(orderParsed(f.rows)) : null;
}

/** Destinos com o nome oficial da cidade (mantém o "(2)" das entregas repetidas). */
export function officialDestination(f: SchedForm, opts: ScheduleOptions): string | null {
  const list = splitDestinations(f.destination).map((d) => {
    const base = baseCity(d);
    return (cityOf(base, opts.cities) ?? base) + d.slice(base.length);
  });
  return list.length ? list.join("; ") : null;
}

export function orderLinesOf(f: SchedForm) {
  return hasLoadingOrder(f.unit) ? orderParsed(f.rows).filter((l) => !isBlankLine(l)) : [];
}

export function toScheduleInput(f: SchedForm, opts: ScheduleOptions, date: string): ScheduleInput {
  return {
    schedule_date: date,
    client_name: f.unit,
    cargo: f.cargo.trim().toUpperCase(),
    origin: f.origin.trim() ? cityOf(f.origin, opts.cities) : null,
    destination: officialDestination(f, opts),
    weight: orderWeight(orderLinesOf(f)),
    plate: pick(f.tractor, opts.tractors) || null,
    trailer_plate: pick(f.trailer, opts.trailers) || null,
    driver: pick(f.driver, opts.drivers.map((d) => d.value)) || null,
    loading_time: f.time || null,
  };
}

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "mb-1 block text-sm font-medium text-navy-700";

export function KmScheduleSection({
  n,
  form: f,
  onChange,
  opts,
  editing,
}: {
  n: number;
  form: SchedForm;
  /** Recebe uma função de atualização (como o setState do React). */
  onChange: (fn: (f: SchedForm) => SchedForm) => void;
  opts: ScheduleOptions | null;
  editing: boolean;
}) {
  // Referência estável: o campo de destinos avisa o texto pendente também ao desmontar.
  const onDraft = useCallback((d: string) => onChange((p) => (p.pendingDest === d ? p : { ...p, pendingDest: d })), [onChange]);
  if (!opts) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-navy-900">{n} · Programação</h3>
        <p className="text-sm text-navy-500">Carregando...</p>
      </section>
    );
  }
  const set = (patch: Partial<SchedForm>) => onChange((p) => ({ ...p, ...patch }));
  const order = hasLoadingOrder(f.unit);

  function setDestination(v: string) {
    // Ordem ainda sem produto/peso: as linhas acompanham os destinos (uma por destino).
    onChange((p) => ({
      ...p,
      destination: v,
      rows: hasLoadingOrder(p.unit) && onlyCities(p.rows) ? linesFromDestination(v).map(toOrderRow) : p.rows,
    }));
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-navy-900">
        {n} · {editing ? "Destinos e ordem de embarque" : "Programação"}
      </h3>
      {!editing && (
        <>
          <p className="text-sm text-navy-500">A viagem já cria a carga na Programação.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="km-pg-unit">Unidade Btech</label>
              <select
                id="km-pg-unit"
                className={inputCls}
                value={f.unit}
                onChange={(e) => {
                  const unit = e.target.value;
                  onChange((p) => withUnit({ ...p, rows: hasLoadingOrder(unit) ? p.rows : [toOrderRow(EMPTY_LINE)] }, unit, opts));
                }}
              >
                <option value="">Escolha</option>
                {opts.units.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="km-pg-cargo">Produto</label>
              <SearchSelect
                id="km-pg-cargo"
                value={f.cargo}
                onChange={(v) => set({ cargo: v.toUpperCase() })}
                options={[...new Set([...ORDER_NATURES.map((x) => x.value), ...opts.cargos])].map((value) => ({ value }))}
                placeholder="Ex.: BETA BACTER"
                className={`${inputCls} uppercase`}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="km-pg-origin">Origem</label>
              <SearchSelect
                id="km-pg-origin"
                value={f.origin}
                onChange={(v) => set({ origin: v })}
                options={opts.cities.map((value) => ({ value }))}
                placeholder="Cidade/UF"
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="km-pg-time">Horário do carregamento</label>
              <input id="km-pg-time" type="time" className={inputCls} value={f.time} onChange={(e) => set({ time: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="km-pg-tractor">Cavalo/truck</label>
              <SearchSelect
                id="km-pg-tractor"
                value={f.tractor}
                onChange={(v) => set({ tractor: v.toUpperCase() })}
                options={opts.tractors.map((value) => ({ value }))}
                placeholder="Placa"
                className={`${inputCls} uppercase`}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="km-pg-trailer">Semi-reboque</label>
              <SearchSelect
                id="km-pg-trailer"
                value={f.trailer}
                onChange={(v) => set({ trailer: v.toUpperCase() })}
                options={opts.trailers.map((value) => ({ value }))}
                placeholder="Placa"
                className={`${inputCls} uppercase`}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="km-pg-driver">Motorista</label>
              <SearchSelect
                id="km-pg-driver"
                value={f.driver}
                onChange={(v) => set({ driver: v })}
                options={opts.drivers}
                placeholder="Apelido ou nome"
                className={inputCls}
              />
            </div>
          </div>
        </>
      )}
      <div>
        <label className={labelCls} htmlFor="km-pg-dest">Destinos</label>
        <DestinationsInput
          id="km-pg-dest"
          value={f.destination}
          onChange={setDestination}
          onDraftChange={onDraft}
          placeholder="Ex: BRF - CONCORDIA"
          cities={opts.cities}
        />
      </div>
      {order && (
        <div>
          <span className={labelCls}>Ordem de embarque</span>
          <p className="mb-2 text-xs text-navy-500">
            Linhas seguidas com o mesmo nº da OC saem juntas na ordem. Beta Bacter sai em amarelo e Beta Bacter 33 em azul.
          </p>
          <OrderLinesEditor idPrefix="km-ord" rows={f.rows} onChange={(rows) => set({ rows })} />
        </div>
      )}
    </section>
  );
}
