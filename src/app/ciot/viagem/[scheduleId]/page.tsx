"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";
import { CurrencyInput } from "@/components/CurrencyInput";
import { SearchSelect } from "@/components/SearchSelect";
import { formatCpf, onlyDigits } from "@/lib/cpf";
import { formatCurrency } from "@/lib/format";
import { parseTons } from "@/lib/weight";
import { computeAnttFloor } from "@/lib/quoteCalculations";
import {
  BODY_TYPES,
  PIX_KEY_LABEL,
  WHEEL_TYPES,
  formatCep,
  formatCnpj,
  formatDocument,
  type Agregado,
  AGREGADO_COLUMNS,
  clientHint,
  clientLabels,
} from "@/lib/agregados";
import {
  CIOT_COLUMNS,
  CIOT_STATUS_LABEL,
  PACKAGING_SUGGESTIONS,
  TRANSBOCHNIA,
  moneyPlain,
  netPayment,
  splitDestinations,
  totalTaxes,
  type Ciot,
  type CiotInvoice,
} from "@/lib/ciot";

// CIOT de uma carga (agregado com CIOT por viagem). À esquerda o que muda a
// cada viagem; à direita a ficha na ordem das telas do e-Frete, montada com
// os cadastros (agregado, veículos, motorista, destinatário) e com botão de
// copiar em cada campo. Etapa 2 — migration 0081.

interface Schedule {
  id: string;
  schedule_date: string;
  client_name: string;
  cargo: string;
  weight: string | null;
  plate: string | null;
  trailer_plate: string | null;
  driver: string | null;
  origin: string | null;
  destination: string | null;
  quote_id: string | null;
}
interface Unit {
  plate: string;
  kind: string;
  agregado_id: string | null;
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
interface DriverRow {
  id: string;
  name: string;
  nickname: string | null;
  cpf: string;
}
interface DriverDetails {
  cnh: string | null;
  birth_date: string | null;
  mobile_phone: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  cep: string | null;
  city: string | null;
}
interface ClientRow {
  id: string;
  name: string;
  trade_name: string | null;
  document: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  cep: string | null;
  city: string | null;
  phone: string | null;
}
interface Coef {
  axles: number;
  cargo_type: string;
  ccd: number;
  cc: number;
}
type PrevCiot = Ciot & { loading_schedules: { cargo: string } | null };

interface Form {
  driver: string;
  recipient: string;
  trip_start: string;
  trip_end: string;
  origin: string;
  destination: string;
  distance_km: string;
  packaging: string;
  weight_kg: string;
  cargo_code: string;
  cargo_description: string;
  antt_cargo_type: string;
  high_performance: boolean;
  empty_return: boolean;
  vehicle_composition: boolean;
  invoices: { number: string; date: string; value: string }[];
  freight_value: string;
  toll_value: string;
  fuel_value: string;
  insurance_value: string;
  irrf: string;
  inss: string;
  sest_senat: string;
  issqn: string;
  other_taxes: string;
  other_taxes_desc: string;
  payment_date: string;
  notes: string;
}

const UNIT_COLUMNS =
  "plate, kind, agregado_id, renavam, chassis, brand, model, year_made, year_model, axles, color, tare_kg, capacity_kg, capacity_m3, wheel_type, body_type, registry_city";

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "mb-1 block text-sm font-medium text-navy-700";
const cardCls = "rounded-xl border border-navy-200 bg-white p-5 shadow-sm";

const num = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const driverLabel = (d: DriverRow) => `${d.name} · ${formatCpf(d.cpf)}`;
const dateBr = (iso: string | null | undefined) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR") : "";
const yesNo = (b: boolean) => (b ? "Sim" : "Não");
const phoneParts = (p: string | null | undefined) => {
  const d = onlyDigits(p ?? "");
  return d.length >= 10 ? { ddd: d.slice(0, 2), number: d.slice(2) } : { ddd: "", number: d };
};

function emptyForm(): Form {
  return {
    driver: "",
    recipient: "",
    trip_start: "",
    trip_end: "",
    origin: "",
    destination: "",
    distance_km: "",
    packaging: "",
    weight_kg: "",
    cargo_code: "",
    cargo_description: "",
    antt_cargo_type: "",
    high_performance: false,
    empty_return: false,
    vehicle_composition: false,
    invoices: [{ number: "", date: "", value: "" }],
    freight_value: "",
    toll_value: "",
    fuel_value: "",
    insurance_value: "",
    irrf: "",
    inss: "",
    sest_senat: "",
    issqn: "",
    other_taxes: "",
    other_taxes_desc: "",
    payment_date: "",
    notes: "",
  };
}

// ---------- Ficha (lado direito) ----------

function CopyField({ label, value, missing }: { label: string; value: string; missing?: boolean }) {
  const { toastInfo } = useFeedback();
  const empty = !value;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-navy-500">{label}</div>
        <div className={`truncate text-sm ${empty ? (missing ? "text-amber-700" : "text-navy-400") : "font-medium text-navy-900"}`}>
          {empty ? (missing ? "Falta preencher" : "—") : value}
        </div>
      </div>
      {!empty && (
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(
              () => toastInfo(`${label} copiado.`),
              () => toastInfo("Não foi possível copiar.")
            );
          }}
          className={buttonClasses("secondary", "sm")}
          aria-label={`Copiar ${label}`}
        >
          Copiar
        </button>
      )}
    </div>
  );
}

function FichaSection({ step, title, children, fixHref }: { step: number; title: string; children: React.ReactNode; fixHref?: string }) {
  return (
    <section className="border-t border-navy-100 pt-3 first:border-t-0 first:pt-0">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-navy-900">
          <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-50 text-[11px] text-brand-700">
            {step}
          </span>
          {title}
        </h3>
        {fixHref && (
          <Link href={fixHref} className="text-xs text-brand-700 underline hover:text-brand-800">
            Corrigir cadastro
          </Link>
        )}
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function CiotTripPage({ params }: { params: Promise<{ scheduleId: string }> }) {
  const { scheduleId } = use(params);
  const { canEditSchedule, loading: authLoading, user } = useAuth();
  const { toastSuccess, toastError, confirm: askConfirm } = useFeedback();

  const [loadError, setLoadError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [agregado, setAgregado] = useState<Agregado | null>(null);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [details, setDetails] = useState<DriverDetails | null>(null);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [coefs, setCoefs] = useState<Coef[]>([]);
  const [ciot, setCiot] = useState<Ciot | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [prefillNote, setPrefillNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [emitNumber, setEmitNumber] = useState("");
  const [emitDate, setEmitDate] = useState("");

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // ---------- Carga inicial ----------
  useEffect(() => {
    if (authLoading || !canEditSchedule) return;
    let cancelled = false;
    (async () => {
      const sRes = await supabase
        .from("loading_schedules")
        .select("id, schedule_date, client_name, cargo, weight, plate, trailer_plate, driver, origin, destination, quote_id")
        .eq("id", scheduleId)
        .maybeSingle();
      if (sRes.error || !sRes.data) {
        if (!cancelled) setLoadError(sRes.error?.message ?? "Carga não encontrada na programação.");
        return;
      }
      const s = sRes.data as Schedule;
      const plates = [s.plate, s.trailer_plate].filter(Boolean) as string[];

      const [uRes, dRes, cRes, coefRes, ciotRes, quoteRes] = await Promise.all([
        supabase.from("fleet_units").select(UNIT_COLUMNS).in("plate", plates.length ? plates : ["-"]),
        supabase.from("drivers").select("id, name, nickname, cpf").order("name"),
        supabase.from("clients").select("id, name, trade_name, document, street, number, complement, district, cep, city, phone").order("name"),
        supabase.from("antt_coefficients").select("axles, cargo_type, ccd, cc").order("cargo_type"),
        supabase.from("ciots").select(CIOT_COLUMNS).eq("schedule_id", scheduleId).neq("status", "cancelado").maybeSingle(),
        s.quote_id
          ? supabase.from("quotes").select("distance_km").eq("id", s.quote_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      const unitRows = (uRes.data ?? []) as Unit[];
      // Agregado: dono do cavalo; se o cavalo for próprio, o da carreta.
      const ownerId =
        unitRows.find((u) => u.plate === s.plate)?.agregado_id ??
        unitRows.find((u) => u.plate === s.trailer_plate)?.agregado_id ??
        null;
      const agRes = ownerId
        ? await supabase.from("agregados").select(AGREGADO_COLUMNS).eq("id", ownerId).maybeSingle()
        : { data: null, error: null };
      if (cancelled) return;

      const driverRows = (dRes.data ?? []) as DriverRow[];
      const clientRows = (cRes.data ?? []) as ClientRow[];
      const ag = (agRes.data as Agregado | null) ?? null;
      setSchedule(s);
      setUnits(plates.map((p) => unitRows.find((u) => u.plate === p)).filter(Boolean) as Unit[]);
      setDrivers(driverRows);
      setClients(clientRows);
      setCoefs((coefRes.data ?? []) as Coef[]);
      setAgregado(ag);
      if (!ag) {
        setLoadError("As placas desta carga não estão ligadas a nenhum agregado (Veículos → Agregados).");
        return;
      }

      const existing = (ciotRes.data as Ciot | null) ?? null;
      setCiot(existing);
      const driverById = (id: string | null) => driverRows.find((d) => d.id === id);
      const labels = clientLabels(clientRows);
      const clientName = (id: string | null) => (id ? labels.get(id) ?? "" : "");

      if (existing) {
        const d = driverById(existing.driver_id);
        setForm({
          driver: d ? driverLabel(d) : "",
          recipient: clientName(existing.recipient_client_id),
          trip_start: existing.trip_start ?? "",
          trip_end: existing.trip_end ?? "",
          origin: existing.origin ?? "",
          destination: existing.destination ?? "",
          distance_km: str(existing.distance_km),
          packaging: existing.packaging ?? "",
          weight_kg: str(existing.weight_kg),
          cargo_code: existing.cargo_code ?? "",
          cargo_description: existing.cargo_description ?? "",
          antt_cargo_type: existing.antt_cargo_type ?? "",
          high_performance: existing.high_performance,
          empty_return: existing.empty_return,
          vehicle_composition: existing.vehicle_composition,
          invoices: existing.invoices.length
            ? existing.invoices.map((i) => ({ number: i.number, date: i.date ?? "", value: str(i.value) }))
            : [{ number: "", date: "", value: "" }],
          freight_value: str(existing.freight_value),
          toll_value: str(existing.toll_value || null),
          fuel_value: str(existing.fuel_value || null),
          insurance_value: str(existing.insurance_value || null),
          irrf: str(existing.irrf || null),
          inss: str(existing.inss || null),
          sest_senat: str(existing.sest_senat || null),
          issqn: str(existing.issqn || null),
          other_taxes: str(existing.other_taxes || null),
          other_taxes_desc: existing.other_taxes_desc ?? "",
          payment_date: existing.payment_date ?? "",
          notes: existing.notes ?? "",
        });
        setEmitNumber(existing.ciot_number ?? "");
        setEmitDate(existing.issued_at ?? "");
        return;
      }

      // Novo: parte da programação + cadastros, e repete do último CIOT do
      // mesmo agregado o que costuma se repetir (carga, embalagem, rota, frete).
      const prevRes = await supabase
        .from("ciots")
        .select(`${CIOT_COLUMNS}, loading_schedules(cargo)`)
        .eq("agregado_id", ag.id)
        .neq("status", "cancelado")
        .order("trip_start", { ascending: false })
        .limit(30);
      if (cancelled) return;
      const prevs = (prevRes.data ?? []) as unknown as PrevCiot[];
      const sameCargo = (p: PrevCiot) =>
        (p.loading_schedules?.cargo ?? "").trim().toUpperCase() === s.cargo.trim().toUpperCase();
      const sameRoute = (p: PrevCiot) =>
        (p.origin ?? "") === (s.origin ?? "") && (p.destination ?? "") === (s.destination ?? "");
      const prevBoth = prevs.find((p) => sameCargo(p) && sameRoute(p));
      const prevCargo = prevBoth ?? prevs.find(sameCargo);
      const prevRoute = prevBoth ?? prevs.find(sameRoute);
      const prevAny = prevs[0];

      const nick = (s.driver ?? "").trim().toUpperCase();
      const driver =
        driverById(ag.driver_id) ??
        driverRows.find((d) => (d.nickname ?? "").toUpperCase() === nick || d.name.toUpperCase() === nick);
      const tons = parseTons(s.weight);
      const quoteDistance = (quoteRes.data as { distance_km: number | null } | null)?.distance_km ?? null;

      setForm({
        ...emptyForm(),
        driver: driver ? driverLabel(driver) : "",
        recipient: clientName(ag.recipient_client_id),
        trip_start: s.schedule_date,
        trip_end: s.schedule_date,
        origin: s.origin ?? "",
        destination: s.destination ?? "",
        distance_km: str(quoteDistance ?? prevRoute?.distance_km ?? null),
        packaging: prevCargo?.packaging ?? prevAny?.packaging ?? "",
        weight_kg: tons !== null ? String(Math.round(tons * 1000)) : "",
        cargo_code: prevCargo?.cargo_code ?? "",
        cargo_description: prevCargo?.cargo_description ?? "",
        antt_cargo_type: prevCargo?.antt_cargo_type ?? prevAny?.antt_cargo_type ?? "",
        high_performance: prevAny?.high_performance ?? false,
        empty_return: prevRoute?.empty_return ?? prevAny?.empty_return ?? false,
        vehicle_composition: prevAny?.vehicle_composition ?? false,
        freight_value: str(prevBoth?.freight_value ?? null),
        toll_value: str(prevRoute?.toll_value || null),
        other_taxes_desc: prevAny?.other_taxes_desc ?? "",
      });
      const reused = [prevCargo && "carga", prevRoute && "rota", prevBoth?.freight_value != null && "valor do frete"].filter(Boolean);
      setPrefillNote(
        reused.length
          ? `Preenchido com a programação e com o último CIOT do agregado (${reused.join(", ")}). Confira antes de salvar.`
          : "Preenchido com a programação e os cadastros. Na próxima carga parecida, carga, rota e frete já vêm do último CIOT."
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, canEditSchedule, scheduleId]);

  // Dados pessoais do motorista escolhido.
  const selectedDriver = drivers.find((d) => driverLabel(d) === form.driver) ?? null;
  useEffect(() => {
    if (!selectedDriver) {
      queueMicrotask(() => setDetails(null));
      return;
    }
    let cancelled = false;
    supabase
      .from("driver_details")
      .select("cnh, birth_date, mobile_phone, street, number, complement, district, cep, city")
      .eq("driver_id", selectedDriver.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setDetails((data as DriverDetails | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedDriver?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const clientLabel = useMemo(() => clientLabels(clients), [clients]);
  const recipient = clients.find((c) => clientLabel.get(c.id) === form.recipient) ?? null;

  // ---------- Piso ANTT ----------
  const totalAxles = units.reduce((sum, u) => sum + (u.axles ?? 0), 0);
  const missingAxles = units.some((u) => !u.axles);
  const cargoTypes = useMemo(() => Array.from(new Set(coefs.map((c) => c.cargo_type))), [coefs]);
  const coef = coefs.find((c) => c.axles === totalAxles && c.cargo_type === form.antt_cargo_type) ?? null;
  const anttFloor = computeAnttFloor(coef?.ccd ?? null, coef?.cc ?? null, num(form.distance_km));
  const freight = num(form.freight_value);
  const belowFloor = anttFloor !== null && freight !== null && freight < anttFloor - 0.005;

  const valuesForCalc = {
    freight_value: freight,
    irrf: num(form.irrf) ?? 0,
    inss: num(form.inss) ?? 0,
    sest_senat: num(form.sest_senat) ?? 0,
    issqn: num(form.issqn) ?? 0,
    other_taxes: num(form.other_taxes) ?? 0,
  };
  const taxes = totalTaxes(valuesForCalc);
  const payment = netPayment(valuesForCalc);

  // ---------- Salvar ----------
  function buildPayload() {
    const t = (v: string) => v.trim() || null;
    const invoices: CiotInvoice[] = form.invoices
      .filter((i) => i.number.trim())
      .map((i) => ({ number: i.number.trim(), date: i.date || null, value: num(i.value) }));
    return {
      mode: "viagem" as const,
      schedule_id: scheduleId,
      agregado_id: agregado!.id,
      driver_id: selectedDriver?.id ?? null,
      plates: units.map((u) => u.plate),
      recipient_client_id: recipient?.id ?? null,
      trip_start: form.trip_start || null,
      trip_end: form.trip_end || null,
      origin: t(form.origin),
      destination: t(form.destination),
      distance_km: num(form.distance_km),
      packaging: t(form.packaging),
      weight_kg: num(form.weight_kg),
      cargo_code: t(form.cargo_code),
      cargo_description: t(form.cargo_description),
      antt_cargo_type: t(form.antt_cargo_type),
      high_performance: form.high_performance,
      empty_return: form.empty_return,
      vehicle_composition: form.vehicle_composition,
      invoices,
      freight_value: freight,
      toll_value: num(form.toll_value) ?? 0,
      fuel_value: num(form.fuel_value) ?? 0,
      insurance_value: num(form.insurance_value) ?? 0,
      irrf: valuesForCalc.irrf,
      inss: valuesForCalc.inss,
      sest_senat: valuesForCalc.sest_senat,
      issqn: valuesForCalc.issqn,
      other_taxes: valuesForCalc.other_taxes,
      other_taxes_desc: t(form.other_taxes_desc),
      payment_date: form.payment_date || null,
      payment_value: payment,
      notes: t(form.notes),
    };
  }

  function validate(): string | null {
    if (form.driver.trim() && !selectedDriver) return "Escolha o motorista na lista.";
    if (form.recipient.trim() && !recipient) return "Escolha o destinatário na lista de clientes.";
    if (form.trip_start && form.trip_end && form.trip_end < form.trip_start) return "O fim da viagem é antes do início.";
    if (payment !== null && freight !== null && taxes > freight) return "Os impostos passam do valor do frete.";
    return null;
  }

  async function save(extra: Record<string, unknown> = {}, successMsg = "CIOT salvo como rascunho.") {
    const err = validate();
    if (err) {
      setFormError(err);
      return false;
    }
    setFormError(null);
    setSaving(true);
    const payload = { ...buildPayload(), ...extra };
    const res = ciot
      ? await supabase.from("ciots").update(payload).eq("id", ciot.id).select(CIOT_COLUMNS).single()
      : await supabase
          .from("ciots")
          .insert({
            ...payload,
            created_by_name: (user?.user_metadata?.name as string | undefined) ?? user?.email ?? null,
          })
          .select(CIOT_COLUMNS)
          .single();
    setSaving(false);
    if (res.error || !res.data) {
      setFormError(
        res.error?.code === "23505"
          ? "Esta carga já tem um CIOT (outra pessoa pode ter salvo agora). Recarregue a página."
          : `Não foi possível salvar (${res.error?.message ?? "sem retorno"}).`
      );
      return false;
    }
    setCiot(res.data as Ciot);
    toastSuccess(successMsg);
    return true;
  }

  async function registerIssued() {
    if (!emitNumber.trim()) {
      setFormError("Informe o número do CIOT gerado no e-Frete.");
      return;
    }
    if (freight === null) {
      setFormError("Informe o valor do frete antes de registrar o CIOT.");
      return;
    }
    await save(
      { status: "emitido", ciot_number: emitNumber.trim(), issued_at: emitDate || new Date().toISOString().slice(0, 10) },
      `CIOT ${emitNumber.trim()} registrado.`
    );
  }

  async function cancelCiot() {
    if (!ciot) return;
    if (!(await askConfirm("Marcar este CIOT como cancelado? A carga volta para a lista de pendentes e pode receber um CIOT novo.", { confirmLabel: "Cancelar CIOT" })))
      return;
    const { error } = await supabase.from("ciots").update({ status: "cancelado" }).eq("id", ciot.id);
    if (error) {
      toastError(`Não foi possível cancelar (${error.message}).`);
      return;
    }
    toastSuccess("CIOT cancelado.");
    window.location.href = "/ciot";
  }

  // ---------- Render ----------
  if (!authLoading && !canEditSchedule) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
        <p className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
          Acesso restrito à Logística e à administração.
        </p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
        <Link href="/ciot" className={buttonClasses("secondary", "compact")}>Voltar</Link>
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-6 py-6 text-sm text-red-700">{loadError}</p>
      </div>
    );
  }
  if (!schedule || !agregado) {
    return <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10 text-sm text-navy-500">Carregando...</div>;
  }

  const emitted = ciot?.status === "emitido";
  const ag = agregado;
  const agPhone = phoneParts(ag.mobile_phone);
  const agOther = phoneParts(ag.other_phone);
  const recPhone = phoneParts(recipient?.phone);
  const drvPhone = phoneParts(details?.mobile_phone);
  const destinations = splitDestinations(form.destination);

  const moneyField = (key: keyof Form, label: string, id: string) => (
    <div>
      <label className={labelCls} htmlFor={id}>{label}</label>
      <CurrencyInput id={id} value={form[key] as string} onChange={(v) => set(key, v as never)} className={inputCls} placeholder="0,00" />
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/ciot" className="text-sm text-brand-700 hover:underline">← Voltar para a lista</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy-900">
            CIOT · {schedule.client_name} · {dateBr(schedule.schedule_date)}
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            {schedule.cargo} · {[schedule.plate, schedule.trailer_plate].filter(Boolean).join(" + ")} · Agregado {ag.name}
          </p>
        </div>
        {ciot && (
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              emitted ? "bg-teal-100 text-teal-800" : "bg-navy-100 text-navy-700"
            }`}
          >
            {CIOT_STATUS_LABEL[ciot.status]}
            {emitted && ciot.ciot_number ? ` · nº ${ciot.ciot_number}` : ""}
          </span>
        )}
      </div>

      {prefillNote && !ciot && (
        <p className="mb-4 rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-800">{prefillNote}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        {/* ---------------- Formulário ---------------- */}
        <div className="flex min-w-0 flex-col gap-6 xl:col-span-3">
          <section className={cardCls}>
            <h2 className="mb-4 text-base font-medium text-navy-900">Pessoas</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="ciot-motorista">Motorista</label>
                <SearchSelect
                  id="ciot-motorista"
                  value={form.driver}
                  onChange={(v) => set("driver", v)}
                  options={drivers.map((d) => ({ value: driverLabel(d) }))}
                  placeholder="Buscar motorista..."
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="ciot-dest">Destinatário</label>
                <SearchSelect
                  id="ciot-dest"
                  value={form.recipient}
                  onChange={(v) => set("recipient", v)}
                  options={clients
                    .map((c) => ({ value: clientLabel.get(c.id) ?? c.name, hint: clientHint(c) }))
                    .sort((a, b) => a.value.localeCompare(b.value, "pt-BR"))}
                  placeholder="Cliente (ex: Arauco)"
                  className={inputCls}
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-navy-500">
              Contratado: {ag.name} ({formatDocument(ag.person_type, ag.document)}). Contratante e tomador: Transbochnia.
            </p>
          </section>

          <section className={cardCls}>
            <h2 className="mb-4 text-base font-medium text-navy-900">Viagem e carga</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className={labelCls} htmlFor="ciot-ini">Início da viagem</label>
                <input id="ciot-ini" type="date" className={inputCls} value={form.trip_start} onChange={(e) => set("trip_start", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ciot-fim">Fim da viagem</label>
                <input id="ciot-fim" type="date" className={inputCls} value={form.trip_end} onChange={(e) => set("trip_end", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ciot-peso">Peso (kg)</label>
                <input id="ciot-peso" inputMode="numeric" className={inputCls} value={form.weight_kg} onChange={(e) => set("weight_kg", onlyDigits(e.target.value))} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ciot-emb">Embalagem</label>
                <input id="ciot-emb" list="ciot-emb-list" className={inputCls} value={form.packaging} onChange={(e) => set("packaging", e.target.value)} />
                <datalist id="ciot-emb-list">
                  {PACKAGING_SUGGESTIONS.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls} htmlFor="ciot-ncm">Natureza (código)</label>
                <input id="ciot-ncm" inputMode="numeric" className={inputCls} value={form.cargo_code} onChange={(e) => set("cargo_code", onlyDigits(e.target.value).slice(0, 8))} placeholder="Ex: 2912" />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={labelCls} htmlFor="ciot-ncm-desc">Descrição da mercadoria</label>
                <input id="ciot-ncm-desc" className={inputCls} value={form.cargo_description} onChange={(e) => set("cargo_description", e.target.value)} placeholder="Como aparece no e-Frete" />
              </div>
              <div className="col-span-2">
                <label className={labelCls} htmlFor="ciot-tipo">Tipo de carga (ANTT)</label>
                <select id="ciot-tipo" className={inputCls} value={form.antt_cargo_type} onChange={(e) => set("antt_cargo_type", e.target.value)}>
                  <option value="">—</option>
                  {cargoTypes.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 flex flex-wrap items-end gap-4 pb-2 text-sm text-navy-700">
                {([
                  ["high_performance", "Alto desempenho"],
                  ["empty_return", "Retorno vazio"],
                  ["vehicle_composition", "Composição veicular"],
                ] as const).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} />
                    {l}
                  </label>
                ))}
              </div>
              <div className="col-span-2">
                <label className={labelCls} htmlFor="ciot-orig">Origem</label>
                <input id="ciot-orig" className={inputCls} value={form.origin} onChange={(e) => set("origin", e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelCls} htmlFor="ciot-destino">Destino</label>
                <input id="ciot-destino" className={inputCls} value={form.destination} onChange={(e) => set("destination", e.target.value)} />
              </div>
              <div>
                <label className={labelCls} htmlFor="ciot-km">Distância (km)</label>
                <input id="ciot-km" inputMode="numeric" className={inputCls} value={form.distance_km} onChange={(e) => set("distance_km", onlyDigits(e.target.value))} />
              </div>
            </div>
          </section>

          <section className={cardCls}>
            <h2 className="mb-4 text-base font-medium text-navy-900">Valores</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="col-span-2">{moneyField("freight_value", "Valor do frete ao agregado", "ciot-frete")}</div>
              {moneyField("toll_value", "Pedágio", "ciot-pedagio")}
              {moneyField("fuel_value", "Combustível", "ciot-comb")}
              {moneyField("insurance_value", "Seguro", "ciot-seguro")}
            </div>

            {form.antt_cargo_type && (missingAxles || !coef) ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {missingAxles
                  ? "Para checar o piso ANTT, preencha o número de eixos das placas em Frota → Dados do veículo."
                  : `Sem coeficiente ANTT para ${totalAxles} eixos + ${form.antt_cargo_type}.`}
              </p>
            ) : anttFloor !== null ? (
              <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${belowFloor ? "bg-red-50 text-red-700" : "bg-navy-50 text-navy-600"}`}>
                Piso mínimo ANTT ({totalAxles} eixos, {form.antt_cargo_type}, {form.distance_km} km):{" "}
                <span className="font-medium">{formatCurrency(anttFloor)}</span>
                {belowFloor && " — o frete está abaixo do piso; o e-Frete vai recusar o CIOT."}
              </p>
            ) : null}

            <h3 className="mb-3 mt-5 text-sm font-semibold text-navy-900">Impostos retidos</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {moneyField("irrf", "IRRF", "ciot-irrf")}
              {moneyField("inss", "INSS", "ciot-inss")}
              {moneyField("sest_senat", "SEST/SENAT", "ciot-sest")}
              {moneyField("issqn", "ISSQN", "ciot-iss")}
              {moneyField("other_taxes", "Outros impostos", "ciot-outros")}
              <div className="col-span-2 sm:col-span-3">
                <label className={labelCls} htmlFor="ciot-outros-desc">Descritivo outros impostos</label>
                <input id="ciot-outros-desc" className={inputCls} value={form.other_taxes_desc} onChange={(e) => set("other_taxes_desc", e.target.value)} />
              </div>
            </div>
            <p className="mt-2 text-xs text-navy-500">
              {ag.person_type === "pf"
                ? `Agregado pessoa física (${ag.dependents} dependente${ag.dependents === 1 ? "" : "s"}). O cálculo automático das retenções entra depois do OK do contador; por enquanto, informe os valores.`
                : "Agregado pessoa jurídica: normalmente sem retenção."}
            </p>

            <h3 className="mb-3 mt-5 text-sm font-semibold text-navy-900">Pagamento (parcela única)</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <label className={labelCls} htmlFor="ciot-pagto">Data do depósito</label>
                <input id="ciot-pagto" type="date" className={inputCls} value={form.payment_date} onChange={(e) => set("payment_date", e.target.value)} />
              </div>
              <div className="col-span-2 sm:col-span-3 flex items-end">
                <p className="text-sm text-navy-700">
                  Valor a pagar: <span className="font-semibold text-navy-900">{payment !== null ? formatCurrency(payment) : "—"}</span>
                  {taxes > 0 && <span className="text-navy-500"> (frete {formatCurrency(freight)} − impostos {formatCurrency(taxes)})</span>}
                </p>
              </div>
            </div>
          </section>

          <section className={cardCls}>
            <h2 className="mb-4 text-base font-medium text-navy-900">Notas fiscais</h2>
            <div className="flex flex-col gap-3">
              {form.invoices.map((inv, i) => (
                <div key={i} className="grid grid-cols-6 items-end gap-3">
                  <div className="col-span-6 sm:col-span-2">
                    <label className={labelCls} htmlFor={`ciot-nf-${i}`}>Número da NF</label>
                    <input id={`ciot-nf-${i}`} inputMode="numeric" className={inputCls} value={inv.number}
                      onChange={(e) => setForm((f) => ({ ...f, invoices: f.invoices.map((x, j) => (j === i ? { ...x, number: onlyDigits(e.target.value) } : x)) }))} />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <label className={labelCls} htmlFor={`ciot-nf-data-${i}`}>Emissão</label>
                    <input id={`ciot-nf-data-${i}`} type="date" className={inputCls} value={inv.date}
                      onChange={(e) => setForm((f) => ({ ...f, invoices: f.invoices.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)) }))} />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <label className={labelCls} htmlFor={`ciot-nf-valor-${i}`}>Valor</label>
                    <CurrencyInput id={`ciot-nf-valor-${i}`} className={inputCls} value={inv.value} placeholder="0,00"
                      onChange={(v) => setForm((f) => ({ ...f, invoices: f.invoices.map((x, j) => (j === i ? { ...x, value: v } : x)) }))} />
                  </div>
                  <div className="col-span-6 sm:col-span-1">
                    {form.invoices.length > 1 && (
                      <button type="button" className={buttonClasses("danger", "compact")}
                        onClick={() => setForm((f) => ({ ...f, invoices: f.invoices.filter((_, j) => j !== i) }))}>
                        Remover
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div>
                <button type="button" className={buttonClasses("secondary", "compact")}
                  onClick={() => setForm((f) => ({ ...f, invoices: [...f.invoices, { number: "", date: "", value: "" }] }))}>
                  Adicionar nota fiscal
                </button>
              </div>
              <div>
                <label className={labelCls} htmlFor="ciot-obs">Observações internas</label>
                <textarea id="ciot-obs" rows={2} className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>
            </div>
          </section>

          {formError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>}

          <section className={cardCls}>
            <div className="flex flex-wrap items-end gap-3">
              <button type="button" disabled={saving} onClick={() => save()} className={buttonClasses(emitted ? "primary" : "secondary", "md")}>
                {saving ? "Salvando..." : emitted ? "Salvar alterações" : "Salvar rascunho"}
              </button>
              <div className="ml-auto flex flex-wrap items-end gap-3">
                <div>
                  <label className={labelCls} htmlFor="ciot-numero">Nº do CIOT (e-Frete)</label>
                  <input id="ciot-numero" className={inputCls} value={emitNumber} onChange={(e) => setEmitNumber(e.target.value.trim())} placeholder="Gerado no e-Frete" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="ciot-emissao">Data de emissão</label>
                  <input id="ciot-emissao" type="date" className={inputCls} value={emitDate} onChange={(e) => setEmitDate(e.target.value)} />
                </div>
                <button type="button" disabled={saving} onClick={registerIssued} className={buttonClasses("primary", "md")}>
                  {emitted ? "Atualizar nº do CIOT" : "Registrar CIOT emitido"}
                </button>
              </div>
            </div>
            {ciot && (
              <div className="mt-4 flex items-center justify-between border-t border-navy-100 pt-3 text-xs text-navy-500">
                <span>
                  {ciot.created_by_name ? `Criado por ${ciot.created_by_name}. ` : ""}Última alteração em{" "}
                  {new Date(ciot.updated_at).toLocaleString("pt-BR")}.
                </span>
                <button type="button" onClick={cancelCiot} className={buttonClasses("danger", "sm")}>
                  Cancelar CIOT
                </button>
              </div>
            )}
          </section>
        </div>

        {/* ---------------- Ficha para o e-Frete ---------------- */}
        <aside className="min-w-0 xl:col-span-2">
          <div className={`${cardCls} flex flex-col gap-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto`}>
            <div>
              <h2 className="text-base font-medium text-navy-900">Ficha para o e-Frete</h2>
              <p className="text-xs text-navy-500">Na ordem das telas do e-Frete. Campos em laranja faltam no cadastro.</p>
            </div>

            <FichaSection step={1} title="Destinatário" fixHref="/clients">
              <CopyField label="CPF/CNPJ" value={recipient?.document ? formatCnpj(recipient.document) : ""} missing />
              <CopyField label="Nome ou razão social" value={recipient?.name ?? ""} missing />
              <CopyField label="Rua" value={recipient?.street ?? ""} missing />
              <CopyField label="Número" value={recipient?.number ?? ""} missing />
              <CopyField label="Bairro" value={recipient?.district ?? ""} missing />
              <CopyField label="CEP" value={formatCep(recipient?.cep ?? "")} missing />
              <CopyField label="Município" value={recipient?.city ?? ""} missing />
              <CopyField label="Telefone (DDD / número)" value={recPhone.number ? `${recPhone.ddd} ${recPhone.number}` : ""} missing />
            </FichaSection>

            <FichaSection step={2} title="Tomador">
              <CopyField label="CNPJ" value={formatCnpj(TRANSBOCHNIA.cnpj)} />
              <CopyField label="Razão social" value={TRANSBOCHNIA.name} />
            </FichaSection>

            <FichaSection step={3} title="Contratado / proprietário" fixHref="/vehicles/agregados">
              <CopyField label={ag.person_type === "pf" ? "CPF" : "CNPJ"} value={formatDocument(ag.person_type, ag.document)} />
              <CopyField label="Nome ou razão social" value={ag.name} />
              <CopyField label="RNTRC" value={ag.rntrc ?? ""} missing />
              <CopyField label="Qtd dependentes" value={String(ag.dependents)} />
              <CopyField label="Rua" value={ag.street ?? ""} missing />
              <CopyField label="Número" value={ag.number ?? ""} missing />
              <CopyField label="Complemento" value={ag.complement ?? ""} />
              <CopyField label="Bairro" value={ag.district ?? ""} missing />
              <CopyField label="CEP" value={formatCep(ag.cep ?? "")} missing />
              <CopyField label="Município" value={ag.city ?? ""} missing />
              <CopyField label="Celular (DDD / número)" value={agPhone.number ? `${agPhone.ddd} ${agPhone.number}` : ""} />
              <CopyField label="Comercial (DDD / número)" value={agOther.number ? `${agOther.ddd} ${agOther.number}` : ""} />
            </FichaSection>

            {units.map((u, i) => (
              <FichaSection key={u.plate} step={4} title={`Veículo ${i + 1} · ${u.plate}`} fixHref="/vehicles/frota">
                <CopyField label="Placa" value={u.plate} />
                <CopyField label="CPF/CNPJ do proprietário" value={u.agregado_id ? formatDocument(ag.person_type, ag.document) : formatCnpj(TRANSBOCHNIA.cnpj)} />
                <CopyField label="RNTRC" value={u.agregado_id ? ag.rntrc ?? "" : ""} missing={Boolean(u.agregado_id)} />
                <CopyField label="Renavam" value={u.renavam ?? ""} missing />
                <CopyField label="Chassi" value={u.chassis ?? ""} missing />
                <CopyField label="Marca" value={u.brand ?? ""} missing />
                <CopyField label="Modelo" value={u.model ?? ""} missing />
                <CopyField label="Ano de fabricação" value={str(u.year_made)} missing />
                <CopyField label="Ano do modelo" value={str(u.year_model)} missing />
                <CopyField label="Número de eixos" value={str(u.axles)} missing />
                <CopyField label="Cor" value={u.color ?? ""} />
                <CopyField label="Tara" value={str(u.tare_kg)} />
                <CopyField label="Capacidade em m³" value={str(u.capacity_m3)} />
                <CopyField label="Capacidade em kg" value={str(u.capacity_kg)} missing />
                <CopyField label="Tipo rodado" value={WHEEL_TYPES.find((w) => w.value === u.wheel_type)?.label ?? ""} missing />
                <CopyField label="Tipo carroceria" value={BODY_TYPES.find((b) => b.value === u.body_type)?.label ?? ""} missing />
                <CopyField label="Município" value={u.registry_city ?? ""} missing />
              </FichaSection>
            ))}

            <FichaSection step={5} title="Motorista" fixHref="/vehicles/motoristas">
              <CopyField label="CPF" value={selectedDriver ? formatCpf(selectedDriver.cpf) : ""} missing />
              <CopyField label="Nome" value={selectedDriver?.name ?? ""} missing />
              <CopyField label="CNH" value={details?.cnh ?? ""} missing={Boolean(selectedDriver)} />
              <CopyField label="Data de nascimento" value={dateBr(details?.birth_date)} />
              <CopyField label="Rua" value={details?.street ?? ""} missing={Boolean(selectedDriver)} />
              <CopyField label="Número" value={details?.number ?? ""} missing={Boolean(selectedDriver)} />
              <CopyField label="Complemento" value={details?.complement ?? ""} />
              <CopyField label="Bairro" value={details?.district ?? ""} missing={Boolean(selectedDriver)} />
              <CopyField label="CEP" value={formatCep(details?.cep ?? "")} missing={Boolean(selectedDriver)} />
              <CopyField label="Município" value={details?.city ?? ""} missing={Boolean(selectedDriver)} />
              <CopyField label="Celular (DDD / número)" value={drvPhone.number ? `${drvPhone.ddd} ${drvPhone.number}` : ""} missing={Boolean(selectedDriver)} />
            </FichaSection>

            <FichaSection step={6} title="Operação (lotação)">
              <CopyField label="Início da viagem" value={dateBr(form.trip_start)} missing />
              <CopyField label="Fim da viagem" value={dateBr(form.trip_end)} missing />
              <CopyField label="Embalagem" value={form.packaging} missing />
              <CopyField label="Peso total (kg)" value={form.weight_kg ? Number(form.weight_kg).toLocaleString("pt-BR") : ""} missing />
              <CopyField label="Natureza da carga (código)" value={form.cargo_code} missing />
              <CopyField label="Descrição da mercadoria" value={form.cargo_description} />
              <CopyField label="Tipo de carga" value={form.antt_cargo_type} missing />
              <CopyField label="Alto desempenho" value={yesNo(form.high_performance)} />
              <CopyField label="Retorno vazio" value={yesNo(form.empty_return)} />
              <CopyField label="Composição veicular" value={yesNo(form.vehicle_composition)} />
              <CopyField label="Origem" value={form.origin} missing />
              {(destinations.length ? destinations : [""]).map((d, i) => (
                <CopyField key={i} label={destinations.length > 1 ? `Destino ${i + 1}` : "Destino"} value={d} missing />
              ))}
              <CopyField label="Distância (km)" value={form.distance_km} missing />
            </FichaSection>

            <FichaSection step={7} title="Pagamento" fixHref="/vehicles/agregados">
              <CopyField label="Meio" value={ag.payment_method === "pix" ? "Chave PIX" : ag.payment_method === "conta" ? "Conta bancária" : ""} missing />
              <CopyField label="Data do depósito" value={dateBr(form.payment_date)} missing />
              <CopyField label="Valor" value={moneyPlain(payment)} missing />
              <CopyField label="CPF/CNPJ creditado" value={onlyDigits(ag.document)} />
              {ag.payment_method === "pix" ? (
                <>
                  <CopyField label="Tipo chave PIX" value={ag.pix_key_type ? PIX_KEY_LABEL[ag.pix_key_type] : ""} missing />
                  <CopyField label="Chave PIX" value={ag.pix_key ?? ""} missing />
                </>
              ) : ag.payment_method === "conta" ? (
                <>
                  <CopyField label="Banco" value={ag.bank_code ?? ""} missing />
                  <CopyField label="Tipo de conta" value={ag.bank_account_type === "poupanca" ? "Poupança" : ag.bank_account_type === "corrente" ? "Corrente" : ""} />
                  <CopyField label="Agência" value={ag.bank_agency ?? ""} missing />
                  <CopyField label="Conta" value={ag.bank_account ?? ""} missing />
                </>
              ) : null}
            </FichaSection>

            <FichaSection step={8} title="Valores destacados">
              <CopyField label="Pedágio" value={moneyPlain(num(form.toll_value) ?? 0)} />
              <CopyField label="Combustível" value={moneyPlain(num(form.fuel_value) ?? 0)} />
              <CopyField label="Seguro" value={moneyPlain(num(form.insurance_value) ?? 0)} />
            </FichaSection>

            <FichaSection step={9} title="Impostos">
              <CopyField label="IRRF" value={moneyPlain(valuesForCalc.irrf)} />
              <CopyField label="INSS" value={moneyPlain(valuesForCalc.inss)} />
              <CopyField label="SEST/SENAT" value={moneyPlain(valuesForCalc.sest_senat)} />
              <CopyField label="ISSQN" value={moneyPlain(valuesForCalc.issqn)} />
              <CopyField label="Outros impostos" value={moneyPlain(valuesForCalc.other_taxes)} />
              <CopyField label="Descritivo outros impostos" value={form.other_taxes_desc} />
            </FichaSection>

            <FichaSection step={10} title="Notas fiscais">
              {form.invoices.filter((i) => i.number.trim()).length === 0 ? (
                <CopyField label="Nota fiscal" value="" missing />
              ) : (
                form.invoices
                  .filter((i) => i.number.trim())
                  .map((inv, i) => <CopyField key={i} label={`NF ${i + 1}${inv.date ? ` · ${dateBr(inv.date)}` : ""}`} value={inv.number} />)
              )}
            </FichaSection>
          </div>
        </aside>
      </div>
    </div>
  );
}
