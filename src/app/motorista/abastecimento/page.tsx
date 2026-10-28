"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { compressImage } from "@/lib/photos";
import { ButtonLink } from "@/components/Button";
import { SearchSelect, type SearchOption } from "@/components/SearchSelect";
import { agoLabel, cached, must } from "@/lib/offline/refdata";
import {
  enqueue,
  getOutboxItem,
  listOutbox,
  newPhotoPath,
  reviseItem,
  subscribeOutbox,
  syncNow,
  type OutboxItem,
  type OutboxPhoto,
} from "@/lib/offline/outbox";
import { useOffline } from "@/lib/offline/OfflineProvider";
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
// Quanto a tela espera o envio terminar antes de dizer "salvo, enviando em segundo plano".
const SEND_WAIT_MS = 12000;

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

interface FuelRef {
  driverName: string | null;
  todayPlates: string[];
  fleet: { plate: string; kind: string }[];
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
  const { offline } = useOffline();
  const [ref, setRef] = useState<{ data: FuelRef; at: number; stale: boolean } | null>(null);
  const [mine, setMine] = useState<FuelEntry[]>([]);
  const [queued, setQueued] = useState<OutboxItem[]>([]);

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
  const [photos, setPhotos] = useState<OutboxPhoto[]>([]);
  const [serverLastKm, setServerLastKm] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; saved: boolean } | null>(null);
  // Corrigindo um lançamento recusado da fila (mesmo item, mesmo código).
  const [redo, setRedo] = useState<OutboxItem | null>(null);

  const monthKey = useMemo(() => todayInput().slice(0, 7), []);

  const loadMine = useCallback(async () => {
    if (!user) return;
    const first = new Date();
    first.setDate(1);
    first.setHours(0, 0, 0, 0);
    try {
      const res = await cached(`${user.id}:fuel-mine:${monthKey}`, async () =>
        must(
          await supabase
            .from("fuel_entries")
            .select("*")
            .gte("fueled_at", first.toISOString())
            .order("fueled_at", { ascending: false })
        ) as FuelEntry[]
      );
      setMine(res.data);
    } catch {
      setMine([]);
    }
  }, [user, monthKey]);

  const loadQueue = useCallback(async () => {
    if (!user) return;
    setQueued((await listOutbox(user.id).catch(() => [])).filter((i) => i.kind === "fuel"));
  }, [user]);

  useEffect(() => {
    if (!user || !isDriver) return;
    let cancel = false;
    (async () => {
      const key = `${user.id}:fuel-ref`;
      try {
        const res = await cached<FuelRef>(key, async () => {
          const [d, today, fleet] = await Promise.all([
            supabase.from("drivers").select("name").maybeSingle(),
            // Cargas dele: as de hoje e as de dias anteriores com a viagem em andamento (carregando ou em viagem).
            supabase
              .from("loading_schedules")
              .select("plate")
              .or(`schedule_date.eq.${localDate(new Date())},and(schedule_date.lt.${localDate(new Date())},status.in.(carregando,em_viagem)))`)
              .order("schedule_date", { ascending: false })
              .order("loading_time", { ascending: true, nullsFirst: false }),
            supabase.rpc("fleet_plates"),
          ]);
          if (d.error) throw new Error(d.error.message);
          if (today.error) throw new Error(today.error.message);
          if (fleet.error) throw new Error(fleet.error.message);
          return {
            driverName: (d.data as { name: string } | null)?.name ?? null,
            todayPlates: ((today.data ?? []) as { plate: string | null }[])
              .map((l) => l.plate)
              .filter((p): p is string => Boolean(p)),
            fleet: (fleet.data ?? []) as { plate: string; kind: string }[],
          };
        });
        if (!cancel) setRef(res);
      } catch {
        if (!cancel) setRef(null);
      }
    })();
    queueMicrotask(() => {
      loadMine();
      loadQueue();
    });
    const off = subscribeOutbox(() => {
      loadQueue();
      loadMine();
    });
    return () => {
      cancel = true;
      off();
    };
  }, [user, isDriver, loadMine, loadQueue]);

  // Diesel e ARLA vão no cavalo/truck: a carreta não aparece.
  const plateOptions = useMemo<SearchOption[]>(() => {
    if (!ref) return [];
    const opts: SearchOption[] = [];
    for (const p of ref.data.todayPlates) {
      if (!opts.some((o) => o.value === p)) opts.push({ value: p, hint: "Cavalo da sua carga" });
    }
    for (const f of ref.data.fleet) {
      if (f.kind !== "semirreboque" && !opts.some((o) => o.value === f.plate)) opts.push({ value: f.plate, hint: "Cavalo/truck" });
    }
    return opts;
  }, [ref]);

  useEffect(() => {
    // Só preenche sozinho com o cavalo da carga dele; sem carga lançada, o campo fica em branco
    // (evita abastecimento lançado em placa errada).
    const loadPlate = ref?.data.todayPlates[0];
    if (!loadPlate || redo) return;
    queueMicrotask(() => setPlate((cur) => cur || loadPlate));
  }, [ref, redo]);

  const chosenPlate = useMemo(() => plate.trim().replace(/[\s-]/g, "").toUpperCase(), [plate]);
  const knownPlate = plateOptions.length === 0 || plateOptions.some((o) => o.value === chosenPlate);

  // Último km da placa (de qualquer motorista), guardado no celular para avisar km menor sem sinal.
  useEffect(() => {
    if (!user || !knownPlate || chosenPlate.length < 7) return;
    let cancel = false;
    cached<number | null>(`${user.id}:lastkm:${chosenPlate}`, async () => {
      const r = await supabase.rpc("fuel_last_km", { p_plate: chosenPlate });
      if (r.error) throw new Error(r.error.message);
      return (r.data as number | null) ?? null;
    })
      .then((r) => {
        if (!cancel) setServerLastKm(r.data);
      })
      .catch(() => {
        if (!cancel) setServerLastKm(null);
      });
    return () => {
      cancel = true;
    };
  }, [user, chosenPlate, knownPlate]);

  // O que ainda está na fila também conta como "último km" (o motorista pode ter abastecido sem sinal).
  const queuedMaxKm = useMemo(
    () =>
      queued
        .filter((i) => i.id !== redo?.id && i.payload.plate === chosenPlate)
        .reduce((max, i) => Math.max(max, Number(i.payload.odometer_km) || 0), 0),
    [queued, chosenPlate, redo]
  );
  const lastKm = Math.max(serverLastKm ?? 0, queuedMaxKm) || null;

  // Abriu pelo botão "Corrigir e lançar de novo" da fila de envio.
  useEffect(() => {
    if (!user) return;
    const id = new URLSearchParams(window.location.search).get("refazer");
    if (!id) return;
    getOutboxItem(id).then((item) => {
      if (!item || item.userId !== user.id || item.kind !== "fuel") return;
      const p = item.payload as Record<string, unknown>;
      setRedo(item);
      setFuelType(p.fuel_type as FuelType);
      setPlate(String(p.plate ?? ""));
      setWhen(localDate(new Date(String(p.fueled_at))));
      setWhere(p.location_type as "patio" | "externo");
      setStation(String(p.location ?? ""));
      setPrice(p.price_per_liter ? String(p.price_per_liter).replace(".", ",") : "");
      setLiters(String(p.liters ?? "").replace(".", ","));
      setKm(String(p.odometer_km ?? ""));
      setFullTank(p.full_tank ? "sim" : "nao");
      setNotes(String(p.notes ?? ""));
      setPhotos(item.photos);
    });
  }, [user]);

  async function addFiles(list: FileList | null) {
    if (!list || !user) return;
    const picked = Array.from(list);
    try {
      // Reduz a foto agora (a câmera gera vários MB) e já define o nome com que ela vai subir.
      const added: OutboxPhoto[] = [];
      for (const f of picked) added.push({ path: newPhotoPath(user.id), blob: await compressImage(f) });
      setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    } catch {
      setError("Não foi possível usar essa foto. Tire outra.");
    }
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
    setPhotos([]);
    setRedo(null);
    if (window.location.search) window.history.replaceState(null, "", window.location.pathname);
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
    if (photos.length === 0) return setError("Tire a foto do odômetro.");
    setSaving(true);
    setError(null);
    try {
      const id = redo?.id ?? crypto.randomUUID();
      const driverName = ref?.data.driverName ?? redo?.driverName ?? null;
      const payload = {
        id,
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
        photos: photos.map((p) => p.path),
        notes: notes.trim() || null,
      };
      const summary = `${FUEL_LABEL[fuelType]} · ${formatLiters(litersN)} L · ${chosenPlate}`;
      if (redo) {
        await reviseItem(id, { summary, payload, photos });
      } else {
        await enqueue({ id, userId: user.id, kind: "fuel", createdAt: Date.now(), summary, driverName, payload, photos });
      }
      // Tenta enviar já; sem sinal, o item fica na fila e segue sozinho depois.
      await Promise.race([syncNow(user.id, true), new Promise((r) => setTimeout(r, SEND_WAIT_MS))]);
      const left = await getOutboxItem(id);
      if (!left) {
        setDone({ text: `${summary} registrado.`, saved: false });
      } else if (left.status === "rejected") {
        setDone(null);
        setError(`O servidor não aceitou este lançamento: ${left.reason} Corrija e envie de novo. A equipe foi avisada.`);
        setSaving(false);
        return;
      } else {
        setDone({
          text: `${summary} salvo no celular. Será enviado quando houver sinal.`,
          saved: true,
        });
      }
      resetForm();
      await loadMine();
      await loadQueue();
    } catch (ex) {
      setError(`Não foi possível salvar no celular (${ex instanceof Error ? ex.message : "erro"}). Libere espaço e tente de novo.`);
    }
    setSaving(false);
  }

  if (authLoading || !isDriver) return null;

  const offlineHint = ref?.stale ? `Dados guardados no celular (${agoLabel(ref.at)}).` : null;

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <ButtonLink href="/motorista" variant="secondary" size="sm" aria-label="Voltar para o início">
        Voltar
      </ButtonLink>
      <h1 className="mt-3 text-xl font-semibold text-navy-900">Abastecimento</h1>
      <p className="text-sm text-navy-500">Registre cada abastecimento de diesel ou ARLA.</p>
      {offlineHint && <p className="mt-1 text-xs text-amber-700">{offlineHint}</p>}

      {redo && (
        <div role="status" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Corrigindo um lançamento recusado: {redo.reason}
        </div>
      )}

      {done && (
        <div
          role="status"
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${done.saved ? "bg-amber-50 text-amber-900" : "bg-teal-50 text-teal-800"}`}
        >
          {done.saved ? "💾" : "✓"} {done.text}
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
          {photos.length > 0 && (
            <ul className="mb-2 flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <li
                  key={p.path}
                  className="inline-flex items-center gap-1 rounded-full bg-brand-100 py-1 pl-3 pr-1.5 text-xs font-medium text-brand-800"
                >
                  📷 Foto {i + 1}
                  <button
                    type="button"
                    onClick={() => setPhotos((prev) => prev.filter((x) => x.path !== p.path))}
                    aria-label={`Remover foto ${i + 1}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand-200"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {photos.length < MAX_PHOTOS && (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-navy-300 px-3 py-3 text-sm font-medium text-navy-700 hover:border-brand-500">
              📷 {photos.length === 0 ? "Tirar foto" : "Tirar outra foto"}
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
          {saving
            ? "Salvando..."
            : redo
              ? "Enviar correção"
              : offline
                ? "Salvar (envia quando tiver sinal)"
                : "Registrar abastecimento"}
        </button>
      </form>

      <h2 className="mt-8 text-sm font-medium text-navy-900">Meus abastecimentos deste mês</h2>
      {queued.length === 0 && mine.length === 0 ? (
        <p className="mt-2 text-sm text-navy-500">Nenhum ainda.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {queued.map((q) => {
            const p = q.payload as Record<string, unknown>;
            return (
              <li key={q.id} className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-navy-900">{q.summary}</span>
                  <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    {q.status === "rejected" ? "Recusado" : "Aguardando envio"}
                  </span>
                </div>
                <div className="text-xs text-navy-500">
                  {formatKm(Number(p.odometer_km))} km ·{" "}
                  {p.location_type === "patio" ? "Pátio" : String(p.location ?? "")}
                </div>
              </li>
            );
          })}
          {mine.map((m) => (
            <li key={m.id} className="rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-navy-900">
                  {FUEL_LABEL[m.fuel_type]} · {formatLiters(m.liters)} L
                </span>
                <span className="text-xs text-navy-500">{new Date(m.fueled_at).toLocaleDateString("pt-BR")}</span>
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
