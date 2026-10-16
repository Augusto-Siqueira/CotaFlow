"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { uploadPhoto } from "@/lib/photos";
import { ButtonLink } from "@/components/Button";
import { SearchSelect, type SearchOption } from "@/components/SearchSelect";
import {
  FUEL_LABEL,
  formatKm,
  formatLiters,
  formatMoney,
  parseDecimal,
  type FuelEntry,
  type FuelType,
} from "@/lib/fuel";

const MAX_PHOTOS = 3;

const fieldCls =
  "w-full rounded-lg border border-navy-300 bg-white px-3 py-2.5 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "mb-1.5 block text-sm font-medium text-navy-700";

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function localDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Só a data (sem hora). Gravada ao meio-dia para nunca virar o dia por fuso. */
function todayInput() {
  return localDate(new Date());
}

function Toggle<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
            value === o.value
              ? "border-transparent bg-brand-200 text-brand-900 ring-2 ring-brand-600"
              : "border-navy-300 text-navy-700 hover:bg-navy-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AbastecimentoMotoristaPage() {
  const { user, isDriver, loading: authLoading } = useAuth();
  const [driverName, setDriverName] = useState<string | null>(null);
  const [plateOptions, setPlateOptions] = useState<SearchOption[]>([]);
  const [mine, setMine] = useState<FuelEntry[]>([]);

  const [fuelType, setFuelType] = useState<FuelType>("diesel");
  const [plate, setPlate] = useState("");
  const [when, setWhen] = useState(todayInput);
  const [where, setWhere] = useState<"patio" | "externo">("patio");
  const [station, setStation] = useState("");
  const [price, setPrice] = useState("");
  const [liters, setLiters] = useState("");
  const [km, setKm] = useState("");
  const [fullTank, setFullTank] = useState<"sim" | "nao">("sim");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [lastKm, setLastKm] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const loadMine = useCallback(async () => {
    const first = new Date();
    first.setDate(1);
    first.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from("fuel_entries")
      .select("*")
      .gte("fueled_at", first.toISOString())
      .order("fueled_at", { ascending: false });
    setMine((data as FuelEntry[] | null) ?? []);
  }, []);

  useEffect(() => {
    if (!user || !isDriver) return;
    Promise.all([
      supabase.from("drivers").select("name").maybeSingle(),
      supabase.from("loading_schedules").select("plate").eq("schedule_date", localDate(new Date())),
      supabase.rpc("fleet_plates"),
    ]).then(([d, today, fleet]) => {
      setDriverName((d.data as { name: string } | null)?.name ?? null);
      // Diesel e ARLA vão no cavalo/truck: a carreta não aparece.
      const opts: SearchOption[] = [];
      for (const l of (today.data ?? []) as { plate: string | null }[]) {
        if (l.plate && !opts.some((o) => o.value === l.plate)) opts.push({ value: l.plate, hint: "Cavalo da carga de hoje" });
      }
      for (const f of (fleet.data ?? []) as { plate: string; kind: string }[]) {
        if (f.kind !== "semirreboque" && !opts.some((o) => o.value === f.plate)) opts.push({ value: f.plate, hint: "Cavalo/truck" });
      }
      setPlateOptions(opts);
      if (opts[0]) setPlate((cur) => cur || opts[0].value);
    });
    queueMicrotask(() => {
      loadMine();
    });
  }, [user, isDriver, loadMine]);

  const chosenPlate = useMemo(() => plate.trim().replace(/[\s-]/g, "").toUpperCase(), [plate]);
  const knownPlate = plateOptions.length === 0 || plateOptions.some((o) => o.value === chosenPlate);

  // Último km da placa (de qualquer motorista), para avisar km digitado menor.
  useEffect(() => {
    if (!knownPlate || chosenPlate.length < 7) return;
    let cancel = false;
    supabase.rpc("fuel_last_km", { p_plate: chosenPlate }).then(({ data }) => {
      if (!cancel) setLastKm((data as number | null) ?? null);
    });
    return () => {
      cancel = true;
    };
  }, [chosenPlate, knownPlate]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list);
    setFiles((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
  }

  function resetForm() {
    setWhen(todayInput());
    setWhere("patio");
    setStation("");
    setPrice("");
    setLiters("");
    setKm("");
    setFullTank("sim");
    setNotes("");
    setFiles([]);
  }

  const kmNumber = Number(km.replace(/\D/g, "")) || 0;
  const kmLower = lastKm !== null && kmNumber > 0 && kmNumber < lastKm;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const litersN = parseDecimal(liters);
    const priceN = parseDecimal(price);
    if (!chosenPlate || !knownPlate) return setError("Escolha a placa do caminhão na lista.");
    if (!when) return setError("Informe a data do abastecimento.");
    if (kmNumber <= 0) return setError("Informe o km do painel.");
    if (litersN === null) return setError("Informe quantos litros foram abastecidos.");
    if (where === "externo") {
      if (!station.trim()) return setError("Informe o posto (nome e cidade).");
      if (priceN === null) return setError("Informe o valor por litro.");
    }
    if (files.length === 0) return setError("Tire a foto do odômetro.");
    setSaving(true);
    setError(null);
    try {
      const paths: string[] = [];
      for (const f of files) paths.push(await uploadPhoto(user.id, f));
      const { error: err } = await supabase.from("fuel_entries").insert({
        driver_name: driverName,
        plate: chosenPlate,
        fuel_type: fuelType,
        fueled_at: new Date(`${when}T12:00:00`).toISOString(),
        location_type: where,
        location: where === "externo" ? station.trim() : null,
        price_per_liter: where === "externo" ? priceN : null,
        liters: litersN,
        odometer_km: kmNumber,
        full_tank: fullTank === "sim",
        photos: paths,
        notes: notes.trim() || null,
      });
      if (err) {
        setError(`Não foi possível enviar (${err.message}).`);
        setSaving(false);
        return;
      }
      setDone(`${FUEL_LABEL[fuelType]} de ${formatLiters(litersN)} L registrado na placa ${chosenPlate}.`);
      resetForm();
      await loadMine();
    } catch (ex) {
      setError(`Não foi possível enviar. Confira o sinal e tente de novo (${ex instanceof Error ? ex.message : "erro"}).`);
    }
    setSaving(false);
  }

  if (authLoading || !isDriver) return null;

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <ButtonLink href="/motorista" variant="secondary" size="sm" aria-label="Voltar para o início">
        Voltar
      </ButtonLink>
      <h1 className="mt-3 text-xl font-semibold text-navy-900">Abastecimento</h1>
      <p className="text-sm text-navy-500">Registre cada abastecimento de diesel ou ARLA.</p>

      {done && (
        <div role="status" className="mt-4 rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800">
          ✓ {done}
        </div>
      )}

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <span className={labelCls}>Combustível</span>
          <Toggle
            label="Combustível"
            value={fuelType}
            onChange={setFuelType}
            options={[
              { value: "diesel", label: "Diesel" },
              { value: "arla", label: "ARLA" },
            ]}
          />
        </div>

        <div>
          <label className={labelCls} htmlFor="ab-placa">
            Placa do caminhão
          </label>
          <SearchSelect
            id="ab-placa"
            value={plate}
            onChange={(v) => setPlate(v.toUpperCase())}
            options={plateOptions}
            placeholder="Digite a placa"
            className={`${fieldCls} uppercase tracking-wide`}
          />
          {chosenPlate.length >= 7 && !knownPlate && (
            <p className="mt-1 text-xs text-red-600">Placa não cadastrada. Escolha uma da lista.</p>
          )}
        </div>

        <div>
          <label className={labelCls} htmlFor="ab-data">
            Data
          </label>
          <input
            id="ab-data"
            type="date"
            value={when}
            max={todayInput()}
            onChange={(e) => setWhen(e.target.value)}
            className={fieldCls}
          />
        </div>

        <div>
          <span className={labelCls}>Onde abasteceu?</span>
          <Toggle
            label="Onde abasteceu"
            value={where}
            onChange={setWhere}
            options={[
              { value: "patio", label: "No pátio" },
              { value: "externo", label: "Posto externo" },
            ]}
          />
        </div>

        {where === "externo" && (
          <>
            <div>
              <label className={labelCls} htmlFor="ab-posto">
                Posto (nome e cidade)
              </label>
              <input
                id="ab-posto"
                type="text"
                value={station}
                onChange={(e) => setStation(e.target.value)}
                className={fieldCls}
                placeholder="Ex.: Posto Graal, Ponta Grossa/PR"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="ab-preco">
                Valor por litro (R$)
              </label>
              <input
                id="ab-preco"
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={fieldCls}
                placeholder="Ex.: 6,19"
              />
            </div>
          </>
        )}

        <div>
          <label className={labelCls} htmlFor="ab-km">
            Km do painel
          </label>
          <input
            id="ab-km"
            type="text"
            inputMode="numeric"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            className={fieldCls}
            placeholder="Ex.: 452318"
          />
          {kmLower && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              ⚠ Menor que o último km registrado desta placa ({formatKm(lastKm!)}). Confira antes de enviar.
            </p>
          )}
        </div>

        <div>
          <label className={labelCls} htmlFor="ab-litros">
            Litros
          </label>
          <input
            id="ab-litros"
            type="text"
            inputMode="decimal"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            className={fieldCls}
            placeholder="Ex.: 380,5"
          />
        </div>

        <div>
          <span className={labelCls}>Completou o tanque?</span>
          <Toggle
            label="Completou o tanque"
            value={fullTank}
            onChange={setFullTank}
            options={[
              { value: "sim", label: "Sim" },
              { value: "nao", label: "Não" },
            ]}
          />
          <p className="mt-1 text-xs text-navy-500">A média (km/l) é calculada a cada tanque cheio.</p>
        </div>

        <div>
          <span className={labelCls}>
            Foto do odômetro <span className="font-normal text-red-700">(obrigatória)</span>
          </span>
          {files.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-800"
                >
                  📷 Foto {i + 1}
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remover foto ${i + 1}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand-200"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {files.length < MAX_PHOTOS && (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-navy-300 px-3 py-3 text-sm font-medium text-navy-700 hover:border-brand-500">
              📷 {files.length === 0 ? "Tirar foto" : "Tirar outra foto"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>

        <div>
          <label className={labelCls} htmlFor="ab-obs">
            Observação <span className="font-normal text-navy-500">(opcional)</span>
          </label>
          <textarea id="ab-obs" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldCls} />
        </div>

        {error && (
          <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-brand-700 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Enviando..." : "Registrar abastecimento"}
        </button>
      </form>

      <h2 className="mt-8 text-sm font-medium text-navy-900">Meus abastecimentos deste mês</h2>
      {mine.length === 0 ? (
        <p className="mt-2 text-sm text-navy-500">Nenhum ainda.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {mine.map((m) => (
            <li key={m.id} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-navy-900">
                  {FUEL_LABEL[m.fuel_type]} · {formatLiters(m.liters)} L
                </span>
                <span className="text-xs text-navy-500">
                  {new Date(m.fueled_at).toLocaleDateString("pt-BR")}
                </span>
              </div>
              <div className="text-xs text-navy-500">
                {m.plate} · {formatKm(m.odometer_km)} km · {m.location_type === "patio" ? "Pátio" : m.location}
                {m.price_per_liter ? ` · ${formatMoney(m.price_per_liter)}/L` : ""}
                {m.full_tank ? " · tanque cheio" : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
