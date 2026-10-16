"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { photoUrl } from "@/lib/photos";
import { DataTable, type Column } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";
import { SearchSelect, type SearchOption } from "@/components/SearchSelect";
import {
  FUEL_LABEL,
  formatAverage,
  formatKm,
  formatLiters,
  formatMoney,
  fuelKmDeltas,
  parseDecimal,
  type FuelEntry,
  type FuelType,
} from "@/lib/fuel";
import { PRESET_OPTIONS, dayRange, presetRange, type Preset } from "@/lib/fuelPeriod";

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toDateInput(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Abastecimento guarda só a data (gravada ao meio-dia).
function fmtWhen(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

interface EditState {
  fuel_type: FuelType;
  plate: string;
  fueled_at: string;
  location_type: "patio" | "externo";
  location: string;
  price: string;
  liters: string;
  km: string;
  full_tank: boolean;
  notes: string;
}

export default function AbastecimentoPage() {
  const { role, canEditFuel, loading: authLoading, user } = useAuth();
  const { toastSuccess, toastError, confirm: askConfirm } = useFeedback();
  const allowed = role === "admin" || role === "abastecimento";

  // Período: o mesmo filtro do dashboard (prontos ou personalizado por dia).
  const [preset, setPreset] = useState<Preset>("mes");
  const [days, setDays] = useState(() => presetRange("mes"));
  const range = useMemo(() => dayRange(days.from, days.to), [days]);
  const rangeKey = `${days.from}_a_${days.to}`;
  function choosePreset(p: Preset) {
    setPreset(p);
    if (p !== "personalizado") setDays(presetRange(p));
  }
  const periodWord = preset === "mes" || preset === "mes_anterior" ? "mês" : "período";
  const [entries, setEntries] = useState<FuelEntry[] | null>(null);
  const [plateFilter, setPlateFilter] = useState("");
  const [driverFilter, setDriverFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"" | FuelType>("");

  const [photosFor, setPhotosFor] = useState<{ title: string; urls: string[] } | null>(null);
  const [editing, setEditing] = useState<FuelEntry | null>(null);
  const [form, setForm] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  // Placas da frota (cavalos e trucks) para a correção: escolhe da lista.
  const [fleetPlates, setFleetPlates] = useState<SearchOption[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Busca o período e mais 2 meses antes: a média de um tanque cheio do começo
  // do período depende do tanque cheio anterior.
  const load = useCallback(async () => {
    const { start, end } = range;
    const from = new Date(start);
    from.setMonth(from.getMonth() - 2);
    const { data, error } = await supabase
      .from("fuel_entries")
      .select("*")
      .gte("fueled_at", from.toISOString())
      .lt("fueled_at", end.toISOString())
      .order("fueled_at", { ascending: false })
      .order("odometer_km", { ascending: false });
    if (error) toastError(`Não foi possível carregar (${error.message}).`);
    setEntries((data as FuelEntry[] | null) ?? []);
  }, [range, toastError]);

  useEffect(() => {
    if (!allowed) return;
    queueMicrotask(() => {
      load();
    });
  }, [allowed, load]);

  useEffect(() => {
    if (!allowed) return;
    supabase.rpc("fleet_plates").then(({ data }) => {
      setFleetPlates(
        ((data ?? []) as { plate: string; kind: string }[])
          .filter((f) => f.kind !== "semirreboque")
          .map((f) => ({ value: f.plate, hint: "Cavalo/truck" }))
      );
    });
  }, [allowed]);

  // Km rodado entre abastecimentos de diesel (mesmo método do dashboard).
  const kmDeltas = useMemo(
    () => fuelKmDeltas((entries ?? []).filter((e) => e.fuel_type === "diesel")),
    [entries]
  );

  const monthRows = useMemo(() => {
    const { start, end } = range;
    return (entries ?? []).filter((e) => {
      const t = new Date(e.fueled_at);
      return t >= start && t < end;
    });
  }, [entries, range]);

  const plates = useMemo(() => [...new Set(monthRows.map((e) => e.plate))].sort(), [monthRows]);
  const drivers = useMemo(
    () => [...new Set(monthRows.map((e) => e.driver_name ?? "—"))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [monthRows]
  );

  const rows = useMemo(
    () =>
      monthRows.filter(
        (e) =>
          (!plateFilter || e.plate === plateFilter) &&
          (!driverFilter || (e.driver_name ?? "—") === driverFilter) &&
          (!typeFilter || e.fuel_type === typeFilter)
      ),
    [monthRows, plateFilter, driverFilter, typeFilter]
  );

  // Resumo por placa no mês (cabeçalho da folha: km início e final do mês).
  const summary = useMemo(() => {
    const map = new Map<
      string,
      {
        plate: string;
        kmMin: number;
        kmMax: number;
        diesel: number;
        arla: number;
        spent: number;
        count: number;
        ran: number;
      }
    >();
    for (const e of monthRows) {
      if (plateFilter && e.plate !== plateFilter) continue;
      if (driverFilter && (e.driver_name ?? "—") !== driverFilter) continue;
      const s = map.get(e.plate) ?? {
        plate: e.plate,
        kmMin: Infinity,
        kmMax: 0,
        diesel: 0,
        arla: 0,
        spent: 0,
        count: 0,
        ran: 0,
      };
      // Km rodado do período: soma do km entre abastecimentos de diesel.
      if (e.fuel_type === "diesel") s.ran += kmDeltas.get(e.id) ?? 0;
      s.kmMin = Math.min(s.kmMin, e.odometer_km);
      s.kmMax = Math.max(s.kmMax, e.odometer_km);
      if (e.fuel_type === "diesel") s.diesel += Number(e.liters);
      else s.arla += Number(e.liters);
      if (e.price_per_liter) s.spent += Number(e.price_per_liter) * Number(e.liters);
      s.count++;
      map.set(e.plate, s);
    }
    return [...map.values()].sort((a, b) => a.plate.localeCompare(b.plate));
  }, [monthRows, plateFilter, driverFilter, kmDeltas]);

  async function openPhotos(e: FuelEntry) {
    const urls = (await Promise.all(e.photos.map((p) => photoUrl(p)))).filter((u): u is string => Boolean(u));
    setPhotosFor({
      title: `Odômetro · ${e.plate} · ${fmtWhen(e.fueled_at)}`,
      urls,
    });
  }

  function openEdit(e: FuelEntry) {
    setEditing(e);
    setFormError(null);
    setForm({
      fuel_type: e.fuel_type,
      plate: e.plate,
      fueled_at: toDateInput(e.fueled_at),
      location_type: e.location_type,
      location: e.location ?? "",
      price: e.price_per_liter ? String(e.price_per_liter).replace(".", ",") : "",
      liters: String(e.liters).replace(".", ","),
      km: String(e.odometer_km),
      full_tank: e.full_tank,
      notes: e.notes ?? "",
    });
  }

  async function saveEdit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!editing || !form) return;
    const liters = parseDecimal(form.liters);
    const price = parseDecimal(form.price);
    const km = Number(form.km.replace(/\D/g, ""));
    if (liters === null) return setFormError("Informe os litros.");
    if (!km) return setFormError("Informe o km.");
    const plate = form.plate.trim().replace(/[\s-]/g, "").toUpperCase();
    if (fleetPlates.length > 0 && !fleetPlates.some((o) => o.value === plate)) {
      return setFormError("Escolha uma placa cadastrada na frota.");
    }
    if (form.location_type === "externo" && (price === null || !form.location.trim())) {
      return setFormError("Fora do pátio: informe o posto e o valor por litro.");
    }
    setSaving(true);
    const { error } = await supabase
      .from("fuel_entries")
      .update({
        fuel_type: form.fuel_type,
        plate,
        fueled_at: new Date(`${form.fueled_at}T12:00:00`).toISOString(),
        location_type: form.location_type,
        location: form.location_type === "externo" ? form.location.trim() : null,
        price_per_liter: form.location_type === "externo" ? price : null,
        liters,
        odometer_km: km,
        full_tank: form.full_tank,
        notes: form.notes.trim() || null,
        edited_at: new Date().toISOString(),
        edited_by: user?.id ?? null,
      })
      .eq("id", editing.id);
    setSaving(false);
    if (error) {
      setFormError(
        /external_needs_details/.test(error.message)
          ? "Fora do pátio o lançamento precisa de posto e valor por litro."
          : /foreign key/i.test(error.message)
            ? "Placa não cadastrada na frota."
            : error.message
      );
      return;
    }
    setEditing(null);
    toastSuccess("Abastecimento corrigido.");
    await load();
  }

  async function remove(e: FuelEntry) {
    if (!(await askConfirm(`Excluir o abastecimento de ${formatLiters(e.liters)} L da placa ${e.plate} em ${fmtWhen(e.fueled_at)}?`))) return;
    const { error } = await supabase.from("fuel_entries").delete().eq("id", e.id);
    if (error) {
      toastError(`Não foi possível excluir (${error.message}).`);
      return;
    }
    await load();
  }

  function exportCsv() {
    const head = ["Data", "Placa", "Motorista", "Combustível", "Local", "R$/litro", "Litros", "Total R$", "Km", "Tanque cheio", "Km rodado", "Observação"];
    const num = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? "" : Number(n).toFixed(d).replace(".", ","));
    const lines = rows.map((e) => [
      fmtWhen(e.fueled_at),
      e.plate,
      e.driver_name ?? "",
      FUEL_LABEL[e.fuel_type],
      e.location_type === "patio" ? "Pátio" : (e.location ?? ""),
      num(e.price_per_liter, 3),
      num(e.liters),
      e.price_per_liter ? num(Number(e.price_per_liter) * Number(e.liters)) : "",
      String(e.odometer_km),
      e.full_tank ? "Sim" : "Não",
      e.fuel_type === "diesel" ? String(kmDeltas.get(e.id) ?? 0) : "",
      (e.notes ?? "").replace(/\s+/g, " "),
    ]);
    const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `abastecimentos-${rangeKey}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (authLoading) return null;
  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-navy-900">Acesso restrito</h1>
        <p className="mt-2 text-sm text-navy-500">Esta tela é do perfil Abastecimento.</p>
      </div>
    );
  }

  const baseColumns: Column<FuelEntry>[] = [
    { key: "when", header: "Data", mobile: "subtitle", cell: (e) => fmtWhen(e.fueled_at) },
    { key: "plate", header: "Placa", mobile: "title", cell: (e) => <span className="font-medium tracking-wide text-navy-900">{e.plate}</span> },
    {
      key: "driver",
      header: "Motorista",
      mobile: "subtitle",
      className: "max-w-[13rem] truncate text-navy-600",
      cell: (e) => <span title={e.driver_name ?? undefined}>{e.driver_name ?? "—"}</span>,
    },
    {
      key: "type",
      header: "Tipo",
      mobile: "badge",
      cell: (e) => (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            e.fuel_type === "diesel" ? "bg-navy-200 text-navy-800" : "bg-sky-200 text-sky-900"
          }`}
        >
          {FUEL_LABEL[e.fuel_type]}
        </span>
      ),
    },
    {
      key: "where",
      header: "Local",
      mobile: "field",
      className: "max-w-[15rem] truncate text-navy-600",
      cell: (e) => {
        const text = e.location_type === "patio" ? "Pátio" : (e.location ?? "—");
        return <span title={text}>{text}</span>;
      },
    },
    { key: "price", header: "R$/litro", mobile: "field", cell: (e) => (e.price_per_liter ? formatMoney(e.price_per_liter) : "—") },
    { key: "liters", header: "Litros", mobile: "highlight", cell: (e) => formatLiters(e.liters) },
    {
      key: "total",
      header: "Total",
      mobile: "field",
      cell: (e) => (e.price_per_liter ? formatMoney(Number(e.price_per_liter) * Number(e.liters)) : "—"),
    },
    { key: "km", header: "Km", mobile: "field", cell: (e) => formatKm(e.odometer_km) },
    { key: "full", header: "Tanque cheio", mobile: "field", cell: (e) => (e.full_tank ? "Sim" : "Não") },
    {
      key: "ran",
      header: "Km rodado",
      mobile: "field",
      cell: (e) =>
        e.fuel_type === "diesel" && (kmDeltas.get(e.id) ?? 0) > 0 ? (
          <span className="font-medium text-navy-900" title="Km desde o abastecimento anterior desta placa">
            {formatKm(kmDeltas.get(e.id)!)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "actions",
      header: "",
      mobile: "actions",
      cell: (e) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          {e.photos.length > 0 && (
            <button
              type="button"
              onClick={() => openPhotos(e)}
              title={`Ver foto do odômetro (${e.photos.length})`}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
            >
              Odômetro
            </button>
          )}
          {canEditFuel && (
            <>
              <button type="button" onClick={() => openEdit(e)} className={buttonClasses("soft", "sm")}>
                Corrigir
              </button>
              <button type="button" onClick={() => remove(e)} className={buttonClasses("danger", "sm")}>
                Excluir
              </button>
            </>
          )}
        </span>
      ),
    },
  ];

  // Nenhuma coluna quebra linha; as que têm corte (posto e motorista) já trazem "truncate".
  const columns: Column<FuelEntry>[] = baseColumns.map((c) => ({
    ...c,
    className: `whitespace-nowrap ${c.className ?? "text-navy-600"}`,
  }));

  const selectCls = "rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900";

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Abastecimento</h1>
          <p className="mt-1 text-sm text-navy-500">Diesel e ARLA lançados pelos motoristas no app.</p>
        </div>
        <button type="button" onClick={exportCsv} disabled={rows.length === 0} className={buttonClasses("secondary")}>
          Exportar planilha
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="ab-periodo" className="mb-1 block text-xs font-medium text-navy-600">
            Período
          </label>
          <select id="ab-periodo" value={preset} onChange={(e) => choosePreset(e.target.value as Preset)} className={selectCls}>
            {PRESET_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {preset === "personalizado" && (
          <>
            <div>
              <label htmlFor="ab-de" className="mb-1 block text-xs font-medium text-navy-600">
                De
              </label>
              <input
                id="ab-de"
                type="date"
                value={days.from}
                max={days.to}
                onChange={(e) => e.target.value && setDays({ ...days, from: e.target.value })}
                className={selectCls}
              />
            </div>
            <div>
              <label htmlFor="ab-ate" className="mb-1 block text-xs font-medium text-navy-600">
                Até
              </label>
              <input
                id="ab-ate"
                type="date"
                value={days.to}
                min={days.from}
                onChange={(e) => e.target.value && setDays({ ...days, to: e.target.value })}
                className={selectCls}
              />
            </div>
          </>
        )}
        <div>
          <label htmlFor="ab-f-placa" className="mb-1 block text-xs font-medium text-navy-600">
            Placa
          </label>
          <select id="ab-f-placa" value={plateFilter} onChange={(e) => setPlateFilter(e.target.value)} className={selectCls}>
            <option value="">Todas</option>
            {plates.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ab-f-mot" className="mb-1 block text-xs font-medium text-navy-600">
            Motorista
          </label>
          <select id="ab-f-mot" value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className={selectCls}>
            <option value="">Todos</option>
            {drivers.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ab-f-tipo" className="mb-1 block text-xs font-medium text-navy-600">
            Combustível
          </label>
          <select id="ab-f-tipo" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "" | FuelType)} className={selectCls}>
            <option value="">Diesel e ARLA</option>
            <option value="diesel">Diesel</option>
            <option value="arla">ARLA</option>
          </select>
        </div>
      </div>

      {summary.length > 0 && (
        <section className="mt-6 overflow-x-auto rounded-xl border border-navy-200 bg-white shadow-sm">
          <h2 className="border-b border-navy-200 px-5 py-3 text-sm font-medium text-navy-900">Resumo do {periodWord} por placa</h2>
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
              <tr>
                <th className="px-5 py-2 font-medium">Placa</th>
                <th className="px-5 py-2 font-medium">Km inicial do {periodWord}</th>
                <th className="px-5 py-2 font-medium">Km final do {periodWord}</th>
                <th className="px-5 py-2 font-medium">Km rodados</th>
                <th className="px-5 py-2 font-medium">Diesel (L)</th>
                <th className="px-5 py-2 font-medium">ARLA (L)</th>
                <th className="px-5 py-2 font-medium">Média do {periodWord}</th>
                <th className="px-5 py-2 font-medium">Gasto fora do pátio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {summary.map((s) => {
                const ran = s.ran;
                return (
                  <tr key={s.plate}>
                    <td className="px-5 py-2 font-medium tracking-wide text-navy-900">{s.plate}</td>
                    <td className="px-5 py-2 text-navy-700">{formatKm(s.kmMin)}</td>
                    <td className="px-5 py-2 text-navy-700">{formatKm(s.kmMax)}</td>
                    <td className="px-5 py-2 text-navy-700">{formatKm(ran)}</td>
                    <td className="px-5 py-2 text-navy-700">{formatLiters(s.diesel)}</td>
                    <td className="px-5 py-2 text-navy-700">{formatLiters(s.arla)}</td>
                    <td
                      className="px-5 py-2 font-medium text-navy-900"
                      title="Km rodados no período ÷ diesel total abastecido no período"
                    >
                      {ran > 0 && s.diesel > 0 ? formatAverage(ran / s.diesel) : "—"}
                    </td>
                    <td className="px-5 py-2 text-navy-700">{s.spent > 0 ? formatMoney(s.spent) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      <div className="mt-6">
        {entries === null ? (
          <p className="text-sm text-navy-500">Carregando...</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
            Nenhum abastecimento neste {periodWord}{plateFilter || driverFilter || typeFilter ? " com esses filtros" : ""}.
          </div>
        ) : (
          <DataTable rows={rows} columns={columns} rowKey={(e) => e.id} />
        )}
      </div>

      {photosFor && (
        <Modal onClose={() => setPhotosFor(null)} labelledBy="ab-photos-title" className="max-w-2xl">
          <h2 id="ab-photos-title" className="text-base font-medium text-navy-900">
            {photosFor.title}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {photosFor.urls.map((u) => (
              <a key={u} href={u} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="Foto do abastecimento" className="h-56 w-full rounded-lg border border-navy-200 object-cover" />
              </a>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button type="button" onClick={() => setPhotosFor(null)} className={buttonClasses("secondary")}>
              Fechar
            </button>
          </div>
        </Modal>
      )}

      {editing && form && (
        <Modal onClose={() => setEditing(null)} labelledBy="ab-edit-title" className="max-w-lg">
          <form onSubmit={saveEdit}>
            <h2 id="ab-edit-title" className="text-base font-medium text-navy-900">
              Corrigir abastecimento
            </h2>
            <p className="mt-1 text-xs text-navy-500">Lançado por {editing.driver_name ?? "motorista"}.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="ed-tipo" className="mb-1 block text-sm font-medium text-navy-700">Combustível</label>
                <select id="ed-tipo" value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value as FuelType })} className={inputCls}>
                  <option value="diesel">Diesel</option>
                  <option value="arla">ARLA</option>
                </select>
              </div>
              <div>
                <label htmlFor="ed-placa" className="mb-1 block text-sm font-medium text-navy-700">Placa</label>
                <SearchSelect
                  id="ed-placa"
                  value={form.plate}
                  onChange={(v) => setForm({ ...form, plate: v.toUpperCase() })}
                  options={fleetPlates}
                  placeholder="Digite a placa"
                  className={`${inputCls} uppercase tracking-wide`}
                />
              </div>
              <div className="col-span-2">
                <label htmlFor="ed-data" className="mb-1 block text-sm font-medium text-navy-700">Data</label>
                <input id="ed-data" type="date" value={form.fueled_at} onChange={(e) => setForm({ ...form, fueled_at: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="ed-onde" className="mb-1 block text-sm font-medium text-navy-700">Local</label>
                <select id="ed-onde" value={form.location_type} onChange={(e) => setForm({ ...form, location_type: e.target.value as "patio" | "externo" })} className={inputCls}>
                  <option value="patio">Pátio</option>
                  <option value="externo">Posto externo</option>
                </select>
              </div>
              <div>
                <label htmlFor="ed-cheio" className="mb-1 block text-sm font-medium text-navy-700">Tanque cheio</label>
                <select id="ed-cheio" value={form.full_tank ? "sim" : "nao"} onChange={(e) => setForm({ ...form, full_tank: e.target.value === "sim" })} className={inputCls}>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </div>
              {form.location_type === "externo" && (
                <>
                  <div>
                    <label htmlFor="ed-posto" className="mb-1 block text-sm font-medium text-navy-700">Posto</label>
                    <input id="ed-posto" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="ed-preco" className="mb-1 block text-sm font-medium text-navy-700">R$/litro</label>
                    <input id="ed-preco" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputCls} />
                  </div>
                </>
              )}
              <div>
                <label htmlFor="ed-km" className="mb-1 block text-sm font-medium text-navy-700">Km</label>
                <input id="ed-km" inputMode="numeric" value={form.km} onChange={(e) => setForm({ ...form, km: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label htmlFor="ed-litros" className="mb-1 block text-sm font-medium text-navy-700">Litros</label>
                <input id="ed-litros" inputMode="decimal" value={form.liters} onChange={(e) => setForm({ ...form, liters: e.target.value })} className={inputCls} />
              </div>
              <div className="col-span-2">
                <label htmlFor="ed-obs" className="mb-1 block text-sm font-medium text-navy-700">Observação</label>
                <textarea id="ed-obs" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
              </div>
            </div>
            {formError && (
              <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} className={buttonClasses("secondary")}>
                Cancelar
              </button>
              <button type="submit" disabled={saving} className={buttonClasses("primary")}>
                {saving ? "Salvando..." : "Salvar correção"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
