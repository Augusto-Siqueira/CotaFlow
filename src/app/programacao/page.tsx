"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { FLEET_CERT_COLUMNS, certAlerts, certText, normalizePlate, type FleetCertFields } from "@/lib/fleet";
import { FleetCertAlert } from "@/components/FleetCertAlert";
import { SearchSelect } from "@/components/SearchSelect";
import {
  LOADING_STATUSES,
  loadingStatusBadge,
  loadingStatusLabel,
} from "@/lib/loadingStatus";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";
import { AddressField } from "@/components/AddressField";
import { normalizeWeight, sanitizeWeightInput } from "@/lib/weight";
import { fetchAllCityNames, isCityWithUf, normalizeCityText } from "@/lib/cities";
import { DestinationsInput, splitDestinations } from "@/components/Destinations";
import { DeliveryProofDestinations } from "@/components/DeliveryProofDestinations";
import { DayNotepad } from "@/components/DayNotepad";
import { SyncIssuesAlert } from "@/components/SyncIssuesAlert";
import { Modal } from "@/components/Modal";
import { StepperControl } from "@/components/StepperControl";

interface Load {
  id: string;
  schedule_date: string;
  client_name: string;
  cargo: string;
  origin: string | null;
  destination: string | null;
  weight: string | null;
  plate: string | null;
  trailer_plate: string | null;
  driver: string | null;
  loading_time: string | null;
  status: string;
  quote_id: string | null;
  quotes: { client_quote_number: string | null } | null;
}

// Observação da carga: cada uma é um tópico (equipe ou motorista).
interface ScheduleNote {
  id: string;
  schedule_id: string;
  body: string;
  source: "equipe" | "motorista";
  destination: string | null;
  created_at: string;
  edited_at: string | null;
}

// Botão "Observações": amarelo quando a carga já tem observação.
function notesButtonClass(count: number): string {
  return count > 0
    ? "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-amber-400 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700"
    : buttonClasses("secondary", "sm");
}

function noteMeta(n: ScheduleNote): string {
  const who =
    n.source === "motorista"
      ? `Motorista${n.destination ? ` (${n.destination})` : ""}`
      : "Equipe";
  const when = new Date(n.created_at).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
  return `${who} · ${when}${n.edited_at ? " · editado" : ""}`;
}

interface DefectInfo {
  category: string;
  severity: number;
  status: string;
  scheduled_for: string | null;
}

const SEVERITY_NAME: Record<number, string> = { 1: "pode rodar", 2: "atenção", 3: "parado" };

interface MaintInfo {
  entry_at: string;
  expected_exit_at: string | null;
  workshop: string;
  service: string;
  service_type: string;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Status que só podem ser usados com a viagem anterior da placa concluída.
const RESTRICTED_STATUSES = new Set(["carregando", "em_viagem"]);

interface QuoteOption {
  id: string;
  client_quote_number: string | null;
  origin: string | null;
  destination: string | null;
  clients: { name: string } | null;
}

interface FormState {
  schedule_date: string;
  client_name: string;
  cargo: string;
  origin: string;
  destination: string;
  weight: string;
  plate: string;
  trailer_plate: string;
  driver: string;
  loading_time: string;
  status: string;
  quote_id: string;
}

function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromIsoDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function shiftDate(value: string, days: number): string {
  const d = fromIsoDate(value);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

function emptyForm(date: string): FormState {
  return {
    schedule_date: date,
    client_name: "",
    cargo: "",
    origin: "",
    destination: "",
    weight: "",
    plate: "",
    trailer_plate: "",
    driver: "",
    loading_time: "",
    status: "programado",
    quote_id: "",
  };
}

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function ProgramacaoPage() {
  const { canEditSchedule } = useAuth();
  const { toastError, confirm: askConfirm } = useFeedback();
  const today = toIsoDate(new Date());

  const [date, setDate] = useState(today);
  // Link vindo do dashboard: /programacao?date=AAAA-MM-DD abre aquele dia.
  useEffect(() => {
    const d = new URLSearchParams(window.location.search).get("date");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setDate(d);
  }, []);
  // Status escolhido nos contadores do topo ("" = todos).
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState<{
    date: string;
    rows: Load[];
    error: string | null;
  } | null>(null);
  const latestDate = useRef(date);

  // Destinos que já têm comprovante do motorista, por carga.
  const [proofMap, setProofMap] = useState<Map<string, string[]>>(new Map());
  const [noteMap, setNoteMap] = useState<Map<string, ScheduleNote[]>>(new Map());
  const [clients, setClients] = useState<{ label: string; name: string }[]>([]);
  const [quotes, setQuotes] = useState<QuoteOption[]>([]);
  const [showMaint, setShowMaint] = useState(true);
  // Defeitos relatados ainda sem a placa na oficina (triagem ou agendada), por placa.
  const [defects, setDefects] = useState<Map<string, DefectInfo[]>>(new Map());
  // Placas que estão na oficina agora (tela Manutenção), por placa.
  const [inMaintenance, setInMaintenance] = useState<Map<string, MaintInfo>>(new Map());
  // Sugestões de Origem/Destino: só municípios cadastrados.
  const [cityNames, setCityNames] = useState<string[]>([]);
  // Origem e destinos só aceitam cidades da lista cadastrada (evita texto solto nos relatórios).
  const cityIndex = useMemo(
    () => new Map(cityNames.map((c) => [normalizeCityText(c), c])),
    [cityNames]
  );
  // Nome oficial da cidade, ou null se não existir. Sem a lista carregada não dá para conferir: aceita.
  const resolveCity = (text: string) =>
    cityIndex.size === 0 ? text.trim() : (cityIndex.get(normalizeCityText(text)) ?? null);
  const [originTouched, setOriginTouched] = useState(false);
  const [pendingDestination, setPendingDestination] = useState("");
  const [tractorPlates, setTractorPlates] = useState<string[]>([]);
  const [trailerPlates, setTrailerPlates] = useState<string[]>([]);
  const [fleetCerts, setFleetCerts] = useState<Map<string, FleetCertFields>>(new Map());
  const [drivers, setDrivers] = useState<{ nickname: string; name: string }[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm(today));
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cargas com todos os comprovantes recebidos e o MDF-e ainda por encerrar.
  const [mdfeAlerts, setMdfeAlerts] = useState<
    { id: string; schedule_date: string; client_name: string; cargo: string; plate: string | null; destination: string | null }[]
  >([]);
  async function loadMdfeAlerts() {
    const { data } = await supabase
      .from("loading_schedules")
      .select("id, schedule_date, client_name, cargo, plate, destination")
      .eq("mdfe_required", true)
      .is("mdfe_closed_at", null)
      .order("schedule_date");
    setMdfeAlerts((data as typeof mdfeAlerts | null) ?? []);
  }
  async function closeMdfe(id: string) {
    const { error } = await supabase
      .from("loading_schedules")
      .update({ mdfe_closed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toastError(`Não foi possível registrar o encerramento (${error.message}).`);
      return;
    }
    await loadMdfeAlerts();
  }

  async function loadMaintenance() {
    const { data } = await supabase
      .from("maintenance_orders")
      .select("plate, entry_at, expected_exit_at, service, service_type, maintenance_workshops(name)")
      .is("exit_at", null);
    const map = new Map<string, MaintInfo>();
    for (const o of (data ?? []) as unknown as {
      plate: string;
      entry_at: string;
      expected_exit_at: string | null;
      service: string;
      service_type: string;
      maintenance_workshops: { name: string } | null;
    }[]) {
      map.set(o.plate, {
        entry_at: o.entry_at,
        expected_exit_at: o.expected_exit_at,
        workshop: o.maintenance_workshops?.name ?? "oficina",
        service: o.service,
        service_type: o.service_type,
      });
    }
    setInMaintenance(map);

    const { data: reps } = await supabase
      .from("maintenance_reports")
      .select("plate, category, severity, status, scheduled_for")
      .in("status", ["triagem", "agendada"]);
    const dmap = new Map<string, DefectInfo[]>();
    for (const r of (reps ?? []) as (DefectInfo & { plate: string })[]) {
      dmap.set(r.plate, [...(dmap.get(r.plate) ?? []), r]);
    }
    setDefects(dmap);
  }

  // Aviso de defeito relatado: `blocking` = parado (severidade 3), que
  // bloqueia o início de viagem; o resto só alerta.
  function defectNotice(plate: string | null, label: string, blocking: boolean): string | null {
    const list = (plate ? defects.get(plate) : undefined)?.filter((d) =>
      blocking ? d.severity === 3 : d.severity < 3
    );
    if (!plate || !list || list.length === 0) return null;
    const cats = Array.from(new Set(list.map((d) => d.category))).join(", ");
    return blocking
      ? `Placa ${plate} (${label}) com defeito relatado (${cats}): veículo parado, aguardando a manutenção.`
      : `Placa ${plate} (${label}) com defeito relatado (${cats}, ${SEVERITY_NAME[Math.min(...list.map((d) => d.severity))]}).`;
  }

  function defectAlerts(cavalo: string | null, carreta: string | null): string[] {
    return [
      defectNotice(cavalo, "Cavalo/truck", false),
      defectNotice(carreta, "Semi-reboque", false),
    ].filter((m): m is string => Boolean(m));
  }

  // Texto do aviso quando a placa está em manutenção (null se não está).
  function maintenanceNotice(plate: string | null, label: string): string | null {
    const info = plate ? inMaintenance.get(plate) : undefined;
    if (!plate || !info) return null;
    return `Placa ${plate} (${label}) em manutenção desde ${fmtDateTime(info.entry_at)} (${info.workshop})${
      info.expected_exit_at ? `, previsão de saída ${fmtDateTime(info.expected_exit_at)}` : ""
    }.`;
  }

  function maintenanceWarnings(cavalo: string | null, carreta: string | null): string[] {
    return [
      maintenanceNotice(cavalo, "Cavalo/truck"),
      maintenanceNotice(carreta, "Semi-reboque"),
      defectNotice(cavalo, "Cavalo/truck", true),
      defectNotice(carreta, "Semi-reboque", true),
    ].filter((m): m is string => Boolean(m));
  }

  async function fetchRows(d: string) {
    const { data: rows, error } = await supabase
      .from("loading_schedules")
      .select(
        "id, schedule_date, client_name, cargo, origin, destination, weight, plate, trailer_plate, driver, loading_time, status, quote_id, quotes(client_quote_number)"
      )
      .eq("schedule_date", d)
      .order("loading_time", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    loadMaintenance();
    loadMdfeAlerts();
    const ids = ((rows as { id: string }[] | null) ?? []).map((r) => r.id);
    const { data: proofRows } = ids.length
      ? await supabase.from("delivery_proofs").select("schedule_id, destination").in("schedule_id", ids)
      : { data: [] };
    const { data: noteRows } = ids.length
      ? await supabase
          .from("loading_schedule_notes")
          .select("id, schedule_id, body, source, destination, created_at, edited_at")
          .in("schedule_id", ids)
          .order("created_at")
      : { data: [] };
    if (d !== latestDate.current) return;
    const nm = new Map<string, ScheduleNote[]>();
    for (const n of (noteRows as ScheduleNote[] | null) ?? []) {
      nm.set(n.schedule_id, [...(nm.get(n.schedule_id) ?? []), n]);
    }
    setNoteMap(nm);
    const pm = new Map<string, string[]>();
    for (const p of (proofRows as { schedule_id: string; destination: string }[] | null) ?? []) {
      pm.set(p.schedule_id, [...(pm.get(p.schedule_id) ?? []), p.destination]);
    }
    setProofMap(pm);
    setData({
      date: d,
      rows: (rows as Load[] | null) ?? [],
      error: error?.message ?? null,
    });
  }

  // Observações da carga (janela própria): lista de tópicos + novo tópico.
  const [notesFor, setNotesFor] = useState<Load | null>(null);
  const [notesText, setNotesText] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  function openNotes(l: Load) {
    setNotesFor(l);
    setNotesText("");
    setEditingNoteId(null);
  }
  async function addNote() {
    if (!notesFor || !notesText.trim()) return;
    setNotesSaving(true);
    const { error } = await supabase
      .from("loading_schedule_notes")
      .insert({ schedule_id: notesFor.id, body: notesText.trim() });
    setNotesSaving(false);
    if (error) {
      toastError(`Não foi possível salvar a observação (${error.message}).`);
      return;
    }
    setNotesText("");
    await fetchRows(date);
  }
  // Edição de um tópico (um por vez, na própria lista).
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  async function saveNoteEdit(n: ScheduleNote) {
    if (!editingNoteText.trim()) return;
    const { error } = await supabase
      .from("loading_schedule_notes")
      .update({ body: editingNoteText.trim(), edited_at: new Date().toISOString() })
      .eq("id", n.id);
    if (error) {
      toastError(`Não foi possível salvar a observação (${error.message}).`);
      return;
    }
    setEditingNoteId(null);
    await fetchRows(date);
  }
  async function deleteNote(n: ScheduleNote) {
    if (!(await askConfirm("Excluir esta observação?"))) return;
    const { error } = await supabase.from("loading_schedule_notes").delete().eq("id", n.id);
    if (error) {
      toastError(`Não foi possível excluir a observação (${error.message}).`);
      return;
    }
    await fetchRows(date);
  }

  async function reloadRows() {
    await fetchRows(date);
  }

  useEffect(() => {
    latestDate.current = date;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRows(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // Comprovantes chegam do app do motorista a qualquer hora: confere de minuto em minuto.
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) fetchRows(date);
    }, 60000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    async function loadOptions() {
      const [clientsRes, quotesRes, fleetRes, driversRes] = await Promise.all([
        supabase.from("clients").select("name, trade_name").order("name"),
        supabase
          .from("quotes")
          .select("id, client_quote_number, origin, destination, clients(name)")
          .eq("status", "vigente")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase.from("fleet_units").select(FLEET_CERT_COLUMNS).order("plate"),
        supabase.from("drivers").select("name, nickname").order("nickname"),
      ]);
      setDrivers(
        (driversRes.data ?? []).map((d) => ({
          nickname: d.nickname?.trim() || d.name,
          name: d.name,
        }))
      );
      setClients(
        (clientsRes.data ?? [])
          .map((c) => ({ label: c.trade_name?.trim() || c.name, name: c.name }))
          .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
      );
      setQuotes((quotesRes.data as unknown as QuoteOption[]) ?? []);
      const fleet = (fleetRes.data ?? []) as FleetCertFields[];
      setFleetCerts(new Map(fleet.map((f) => [f.plate, f])));
      setTractorPlates(
        fleet.filter((f) => f.kind !== "semirreboque").map((f) => f.plate)
      );
      setTrailerPlates(
        fleet.filter((f) => f.kind === "semirreboque").map((f) => f.plate)
      );
    }
    loadOptions();
    // A tabela `cities` também guarda textos digitados à mão nas cotações
    // (ex: "PALHOÇA"); só valem os municípios no formato "Cidade/UF".
    fetchAllCityNames().then((names) =>
      setCityNames(names.filter(isCityWithUf))
    );
  }, []);

  const loading = data === null || data.date !== date;
  const rows = useMemo(() => (loading ? [] : data!.rows), [loading, data]);

  // Ordem dos clientes (blocos arrastáveis): uma só para todos os dias.
  const [clientOrder, setClientOrder] = useState<Map<string, number>>(new Map());
  const [dragClient, setDragClient] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  useEffect(() => {
    supabase
      .from("schedule_client_order")
      .select("client_name, position")
      .then(({ data }) => {
        setClientOrder(
          new Map(((data ?? []) as { client_name: string; position: number }[]).map((r) => [r.client_name, r.position]))
        );
      });
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, Load[]>();
    for (const r of rows) {
      if (statusFilter && r.status !== statusFilter) continue;
      const key = r.client_name.trim() || "Sem cliente";
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    // Posicionados primeiro (pela ordem salva); os outros depois, na ordem de horário.
    const entries = Array.from(map.entries());
    return entries
      .map((e, i) => ({ e, i }))
      .sort((a, b) => {
        const pa = clientOrder.get(a.e[0]);
        const pb = clientOrder.get(b.e[0]);
        if (pa !== undefined && pb !== undefined) return pa - pb;
        if (pa !== undefined) return -1;
        if (pb !== undefined) return 1;
        return a.i - b.i;
      })
      .map((x) => x.e);
  }, [rows, statusFilter, clientOrder]);

  // Grava a nova ordem dos clientes do dia, encaixando-a na ordem geral (que
  // tem clientes de outros dias): os clientes do dia ocupam as mesmas posições
  // de antes, só que na sequência nova.
  async function saveClientOrder(visibleNew: string[]) {
    const known = [...clientOrder.entries()].sort((a, b) => a[1] - b[1]).map(([c]) => c);
    const visibleOld = groups.map(([c]) => c);
    const full = [...known, ...visibleOld.filter((c) => !clientOrder.has(c))];
    const slots = full
      .map((c, i) => (visibleNew.includes(c) ? i : -1))
      .filter((i) => i >= 0);
    slots.forEach((slot, k) => {
      full[slot] = visibleNew[k];
    });
    const next = new Map(full.map((c, i) => [c, i]));
    setClientOrder(next);
    const { error } = await supabase.from("schedule_client_order").upsert(
      full.map((client_name, position) => ({ client_name, position, updated_at: new Date().toISOString() })),
      { onConflict: "client_name" }
    );
    if (error) toastError(`Não foi possível salvar a ordem (${error.message}).`);
  }

  // Tipo próprio no arrasto: só os blocos de cliente reagem (não arquivos nem texto).
  const DRAG_TYPE = "application/x-cotaflow-client";
  function dropClient(target: string, fromData?: string) {
    const from = fromData || dragClient;
    setDragClient(null);
    setDropTarget(null);
    if (!from || from === target) return;
    const list = groups.map(([c]) => c).filter((c) => c !== from);
    list.splice(list.indexOf(target), 0, from);
    void saveClientOrder(list);
  }

  const vigenteIds = useMemo(() => new Set(quotes.map((q) => q.id)), [quotes]);

  const quoteLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const q of quotes) {
      m.set(
        q.id,
        `${q.client_quote_number?.trim() ? `${q.client_quote_number.trim()} · ` : ""}${q.clients?.name ?? "—"} · ${q.origin ?? "—"} → ${q.destination ?? "—"}`
      );
    }
    return m;
  }, [quotes]);

  const quoteOptions = useMemo(() => {
    const typed = form.client_name.trim().toLowerCase();
    const match = clients.find((c) => c.label.toLowerCase() === typed);
    const name = (match?.name ?? typed).toLowerCase();
    const list = name
      ? quotes.filter((q) => q.clients?.name.toLowerCase() === name)
      : [];
    const selected = quotes.find((q) => q.id === form.quote_id);
    return selected && !list.includes(selected) ? [selected, ...list] : list;
  }, [quotes, clients, form.client_name, form.quote_id]);

  // Cliente, placas e motorista só aceitam o que está cadastrado (o banco
  // também barra, ver migration 0045). Vazio é aceito nos opcionais; fora do
  // cadastro devolve null.
  function resolve(value: string, options: string[]): string | null {
    const v = value.trim();
    if (!v) return "";
    return options.find((o) => o.toLowerCase() === v.toLowerCase()) ?? null;
  }

  const clientLabels = useMemo(() => clients.map((c) => c.label), [clients]);
  const driverNicks = useMemo(() => drivers.map((d) => d.nickname), [drivers]);

  // Capacitação vencida ou perto de vencer: só avisa, não impede de lançar.
  function certHint(plate: string): string | undefined {
    const u = fleetCerts.get(plate);
    const a = u ? certAlerts(u) : [];
    return a.length ? `⚠ ${a.map(certText).join("; ")}` : undefined;
  }
  function certWarning(plate: string | null | undefined) {
    const u = plate ? fleetCerts.get(plate) : undefined;
    const a = u ? certAlerts(u) : [];
    if (a.length === 0) return null;
    return (
      <p className={`mt-1 text-xs font-medium ${a.some((c) => c.level === "vencida") ? "text-red-600" : "text-amber-700"}`}>
        ⚠ {a.map(certText).join("; ")}.
      </p>
    );
  }

  const fieldChecks = {
    client_name: resolve(form.client_name, clientLabels),
    plate: resolve(form.plate, tractorPlates),
    trailer_plate: resolve(form.trailer_plate, trailerPlates),
    driver: resolve(form.driver, driverNicks),
  };

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm(date));
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(load: Load) {
    setEditingId(load.id);
    setForm({
      schedule_date: load.schedule_date,
      client_name: load.client_name,
      cargo: load.cargo,
      origin: load.origin ?? "",
      destination: load.destination ?? "",
      weight: normalizeWeight(load.weight),
      plate: load.plate ?? "",
      trailer_plate: load.trailer_plate ?? "",
      driver: load.driver ?? "",
      loading_time: load.loading_time?.slice(0, 5) ?? "",
      status: load.status,
      quote_id: load.quote_id ?? "",
    });
    setFormError(null);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  }

  // Viagem "programado" pode ser lançada à vontade (dá para adiantar a
  // programação). Já passar para Carregando ou Carregado em Viagem só
  // é permitido quando as viagens ANTERIORES da mesma placa estão em Entrega
  // Concluída. "Anterior" = data menor, ou mesma data lançada antes.
  async function findPriorOpenTrips(
    checks: { label: string; plate: string | null; column: "plate" | "trailer_plate" }[],
    scheduleDate: string,
    selfId: string | null
  ): Promise<string[]> {
    let selfCreated = new Date().toISOString();
    if (selfId) {
      const { data: me } = await supabase
        .from("loading_schedules")
        .select("created_at")
        .eq("id", selfId)
        .maybeSingle();
      if (me?.created_at) selfCreated = me.created_at;
    }
    const warnings: string[] = [];
    for (const c of checks) {
      if (!c.plate) continue;
      const { data: others } = await supabase
        .from("loading_schedules")
        .select("id, schedule_date, status, created_at")
        .eq(c.column, c.plate)
        .neq("status", "entregue")
        .lte("schedule_date", scheduleDate)
        .order("schedule_date", { ascending: false })
        .order("created_at", { ascending: false });
      const prior = (others ?? []).find(
        (o) =>
          o.id !== selfId &&
          (o.schedule_date < scheduleDate || o.created_at < selfCreated)
      );
      if (prior) {
        const [y, m, d] = prior.schedule_date.split("-");
        warnings.push(
          `A placa ${c.plate} (${c.label}) tem viagem em aberto: carregamento de ${d}/${m}/${y} (${loadingStatusLabel(prior.status)}). Conclua a entrega antes de iniciar esta viagem.`
        );
      }
    }
    return warnings;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_name.trim() || !form.cargo.trim()) {
      setFormError("Informe o cliente e a carga.");
      return;
    }
    if (!form.schedule_date) {
      setFormError("Informe a data.");
      return;
    }
    const badOrigin = form.origin.trim() && resolveCity(form.origin) === null;
    const badDestinations = splitDestinations(form.destination).filter(
      (d) => resolveCity(d) === null
    );
    if (badOrigin) {
      setFormError(`Origem inválida: escolha uma cidade da lista (Cidade/UF). Recebido: "${form.origin.trim()}".`);
      return;
    }
    if (badDestinations.length > 0 || pendingDestination.trim()) {
      const names = [...badDestinations, pendingDestination.trim()].filter(Boolean);
      setFormError(
        `Destino inválido: escolha cidades da lista (Cidade/UF) e clique em Adicionar. Corrija: ${names.join("; ")}.`
      );
      return;
    }
    const invalid = [
      fieldChecks.client_name === null && "cliente",
      fieldChecks.plate === null && "placa do cavalo/truck",
      fieldChecks.trailer_plate === null && "placa do semi-reboque",
      fieldChecks.driver === null && "motorista",
    ].filter(Boolean);
    if (invalid.length > 0) {
      setFormError(
        `Escolha na lista um valor cadastrado para: ${invalid.join(", ")}.`
      );
      return;
    }

    const payload = {
      schedule_date: form.schedule_date,
      client_name: fieldChecks.client_name ?? form.client_name.trim(),
      cargo: form.cargo.trim(),
      origin: form.origin.trim() ? resolveCity(form.origin) : null,
      destination: form.destination.trim()
        ? splitDestinations(form.destination).map((d) => resolveCity(d) ?? d).join("; ")
        : null,
      weight: normalizeWeight(form.weight) || null,
      plate: fieldChecks.plate || null,
      trailer_plate: fieldChecks.trailer_plate || null,
      driver: fieldChecks.driver || null,
      loading_time: form.loading_time || null,
      status: form.status,
      quote_id: form.quote_id || null,
    };

    setSaving(true);
    setFormError(null);

    // Só "Programado" entra livre; os demais status exigem a viagem anterior
    // da placa concluída.
    const original = editingId ? rows.find((r) => r.id === editingId) : null;
    const changed =
      !original ||
      original.status !== payload.status ||
      original.plate !== payload.plate ||
      original.trailer_plate !== payload.trailer_plate ||
      original.schedule_date !== payload.schedule_date;
    if (RESTRICTED_STATUSES.has(payload.status) && changed) {
      const open = await findPriorOpenTrips(
        [
          { label: "Cavalo/truck", plate: payload.plate, column: "plate" },
          { label: "Semi-reboque", plate: payload.trailer_plate, column: "trailer_plate" },
        ],
        payload.schedule_date,
        editingId
      );
      const maint = maintenanceWarnings(payload.plate, payload.trailer_plate).map(
        (m) => `${m} Só é possível lançar como Programado até a placa ser liberada.`
      );
      if (open.length + maint.length > 0) {
        setSaving(false);
        setFormError([...maint, ...open].join(" "));
        return;
      }
    }

    const { error } = editingId
      ? await supabase.from("loading_schedules").update(payload).eq("id", editingId)
      : await supabase.from("loading_schedules").insert(payload);
    setSaving(false);

    if (error) {
      setFormError(`Não foi possível salvar (${error.message}).`);
      return;
    }

    closeForm();
    // Se a carga foi lançada pra outra data, leva o usuário até ela.
    if (payload.schedule_date !== date) {
      setDate(payload.schedule_date);
    } else {
      await fetchRows(date);
    }
  }

  async function changeStatus(load: Load, status: string) {
    const previous = load.status;
    if (RESTRICTED_STATUSES.has(status)) {
      const open = await findPriorOpenTrips(
        [
          { label: "Cavalo/truck", plate: load.plate, column: "plate" },
          { label: "Semi-reboque", plate: load.trailer_plate, column: "trailer_plate" },
        ],
        load.schedule_date,
        load.id
      );
      const maint = maintenanceWarnings(load.plate, load.trailer_plate).map(
        (m) => `${m} Libere a placa na Manutenção antes de iniciar a viagem.`
      );
      if (open.length + maint.length > 0) {
        toastError([...maint, ...open].join(" "));
        return;
      }
    }
    setData((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) => (r.id === load.id ? { ...r, status } : r)),
          }
        : prev
    );
    const { error } = await supabase
      .from("loading_schedules")
      .update({ status })
      .eq("id", load.id);
    if (error) {
      toastError(`Não foi possível atualizar o status (${error.message}).`);
      setData((prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((r) =>
                r.id === load.id ? { ...r, status: previous } : r
              ),
            }
          : prev
      );
    }
  }

  const [showDup, setShowDup] = useState(false);
  const [dupDate, setDupDate] = useState("");
  const [dupSelected, setDupSelected] = useState<Set<string>>(new Set());
  const [dupTargetCount, setDupTargetCount] = useState<number | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const [dupError, setDupError] = useState<string | null>(null);

  async function countOnDate(d: string) {
    const { count } = await supabase
      .from("loading_schedules")
      .select("id", { count: "exact", head: true })
      .eq("schedule_date", d);
    setDupTargetCount(count ?? 0);
  }

  function openDuplicate() {
    const target = shiftDate(date, 1);
    setDupDate(target);
    setDupSelected(new Set(rows.map((r) => r.id)));
    setDupTargetCount(null);
    setDupError(null);
    setShowDup(true);
    countOnDate(target);
  }

  function changeDupDate(d: string) {
    setDupDate(d);
    setDupTargetCount(null);
    if (d) countOnDate(d);
  }

  function toggleDup(id: string) {
    setDupSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDuplicate() {
    if (!dupDate) {
      setDupError("Escolha a data de destino.");
      return;
    }
    const chosen = rows.filter((r) => dupSelected.has(r.id));
    if (chosen.length === 0) {
      setDupError("Marque ao menos uma carga.");
      return;
    }

    setDupBusy(true);
    setDupError(null);
    // Tudo igual, menos a data e o status: a carga nova volta a "Programado".
    const { error } = await supabase.from("loading_schedules").insert(
      chosen.map((r) => ({
        schedule_date: dupDate,
        client_name: r.client_name,
        cargo: r.cargo,
        origin: r.origin,
        destination: r.destination,
        weight: r.weight,
        plate: r.plate,
        trailer_plate: r.trailer_plate,
        driver: r.driver,
        loading_time: r.loading_time,
        status: "programado",
        // Só mantém o vínculo se a cotação ainda é vigente.
        quote_id: r.quote_id && vigenteIds.has(r.quote_id) ? r.quote_id : null,
      }))
    );
    setDupBusy(false);

    if (error) {
      setDupError(`Não foi possível duplicar (${error.message}).`);
      return;
    }

    setShowDup(false);
    if (dupDate !== date) setDate(dupDate);
    else await fetchRows(date);
  }

  async function handleDelete(load: Load) {
    if (!await askConfirm(`Excluir a carga "${load.cargo}" de ${load.client_name}?`)) return;
    const { error } = await supabase
      .from("loading_schedules")
      .delete()
      .eq("id", load.id);
    if (error) {
      toastError(`Não foi possível excluir (${error.message}).`);
      return;
    }
    await fetchRows(date);
  }

  const dateLabel = fromIsoDate(date).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const counts = LOADING_STATUSES.map((s) => ({
    ...s,
    count: rows.filter((r) => r.status === s.value).length,
  }));

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
            Programação de carregamento
          </h1>
          <p className="mt-1 text-sm capitalize text-navy-500">{dateLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className={buttonClasses("secondary", "md")}
          >
            Imprimir
          </button>
          {canEditSchedule && (
            <>
            <button
              type="button"
              onClick={openDuplicate}
              disabled={rows.length === 0}
              className={buttonClasses("secondary", "md")}
            >
              Duplicar dia
            </button>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
            >
              Novo Embarque
            </button>
            </>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <StepperControl
            onPrev={() => setDate(shiftDate(date, -1))}
            onNext={() => setDate(shiftDate(date, 1))}
            prevLabel="Dia anterior"
            nextLabel="Próximo dia"
          >
            <input
              type="date"
              value={date}
              aria-label="Data da programação"
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="bg-transparent px-3 py-2 text-sm font-medium text-navy-900 outline-none focus:bg-brand-50"
            />
          </StepperControl>
          <button
            type="button"
            onClick={() => setDate(today)}
            disabled={date === today}
            className={buttonClasses("secondary", "md")}
          >
            Hoje
          </button>
          <button
            type="button"
            onClick={() => setDate(shiftDate(today, 1))}
            disabled={date === shiftDate(today, 1)}
            className={buttonClasses("secondary", "md")}
          >
            Amanhã
          </button>
        </div>

        <div className="ml-auto flex flex-wrap gap-2 print:ml-0">
          {counts.map((c) => {
            const active = statusFilter === c.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={active}
                title={active ? "Mostrar todos" : `Filtrar por ${c.label}`}
                onClick={() => setStatusFilter(active ? "" : c.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 ${c.badge} ${
                  active
                    ? "ring-2 ring-brand-600 ring-offset-1"
                    : statusFilter
                      ? "opacity-50 hover:opacity-100"
                      : "hover:brightness-110"
                }`}
              >
                {c.label}: {c.count}
              </button>
            );
          })}
        </div>
      </div>

      <FleetCertAlert />
      <SyncIssuesAlert kinds={["comprovante"]} />
      <DayNotepad date={date} canEdit={canEditSchedule} />

      {canEditSchedule && mdfeAlerts.length > 0 && (
        <section
          aria-label="MDF-e para encerrar"
          className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 print:hidden"
        >
          <h2 className="text-sm font-medium text-amber-800">
            📄 Encerrar MDF-e ({mdfeAlerts.length}) — todos os comprovantes de entrega já chegaram
          </h2>
          <ul className="mt-2 space-y-2">
            {mdfeAlerts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-amber-900">
                <span>
                  <span className="font-medium">{a.client_name}</span> · {a.cargo} · {a.plate || "—"} ·{" "}
                  {new Date(`${a.schedule_date}T12:00:00`).toLocaleDateString("pt-BR")}
                  {a.destination ? ` · ${a.destination}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => closeMdfe(a.id)}
                  className={buttonClasses("soft", "sm")}
                >
                  MDF-e encerrado
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(inMaintenance.size > 0 || defects.size > 0) && (
        <section
          aria-label="Veículos em manutenção"
          className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 print:hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-red-800">
              🔧 Em manutenção agora ({inMaintenance.size})
              {defects.size > 0 && ` · ${defects.size} com defeito relatado`}{" "}
              <span className="font-normal">
                — placas em manutenção não podem iniciar viagem
              </span>
            </h2>
            <span className="flex items-center gap-2">
              <Link
                href="/manutencao"
                className="text-xs font-medium text-red-800 underline"
              >
                Ver manutenção
              </Link>
              <button
                type="button"
                onClick={() => setShowMaint((v) => !v)}
                aria-expanded={showMaint}
                className={buttonClasses("secondary", "sm")}
              >
                {showMaint ? "Recolher" : "Mostrar"}
              </button>
            </span>
          </div>
          {showMaint && (
            <>
            <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from(inMaintenance, ([plate, info]) => {
                const returns =
                  info.expected_exit_at !== null &&
                  toIsoDate(new Date(info.expected_exit_at)) <= date;
                return (
                  <li
                    key={plate}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-xs text-navy-700"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold tracking-wide text-navy-900">
                        {plate}
                      </span>
                      <span className="text-[11px] uppercase text-navy-500">
                        {info.service_type}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate">
                      {info.workshop} · {info.service}
                    </div>
                    <div className="mt-0.5">Entrou em {fmtDateTime(info.entry_at)}</div>
                    <div
                      className={`mt-0.5 font-medium ${
                        returns ? "text-amber-700" : "text-red-700"
                      }`}
                    >
                      {info.expected_exit_at
                        ? `Previsão de saída: ${fmtDateTime(info.expected_exit_at)}${
                            returns ? " (deve voltar até este dia)" : ""
                          }`
                        : "Sem previsão de saída"}
                    </div>
                  </li>
                );
              })}
            </ul>
            {defects.size > 0 && (
              <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from(defects, ([plate, list]) => {
                  const worst = Math.max(...list.map((d) => d.severity));
                  return (
                    <li
                      key={`d-${plate}`}
                      className={`rounded-lg border bg-white px-3 py-2 text-xs text-navy-700 ${
                        worst === 3 ? "border-red-300" : "border-amber-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold tracking-wide text-navy-900">
                          {plate}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            worst === 3
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-200 text-amber-900"
                          }`}
                        >
                          {worst === 3 ? "Parado" : worst === 2 ? "Atenção" : "Pode rodar"}
                        </span>
                      </div>
                      <div className="mt-0.5 truncate">
                        Defeito: {Array.from(new Set(list.map((d) => d.category))).join(", ")}
                      </div>
                      {list.some((d) => d.status === "agendada" && d.scheduled_for) && (
                        <div className="mt-0.5 font-medium text-amber-800">
                          Entrada na oficina agendada para{" "}
                          {fmtDateTime(
                            list.find((d) => d.status === "agendada" && d.scheduled_for)!
                              .scheduled_for!
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            </>
          )}
        </section>
      )}

      {canEditSchedule && showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl border border-navy-200 bg-white p-6 shadow-sm print:hidden"
        >
          <h2 className="text-base font-medium text-navy-900">
            {editingId ? "Editar carregamento" : "Novo carregamento"}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-data">
                Data
              </label>
              <input id="prog-data"
                type="date"
                value={form.schedule_date}
                onChange={(e) => updateForm("schedule_date", e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-cliente">
                Cliente <span className="text-red-500">*</span>
              </label>
              <SearchSelect id="prog-cliente"
                value={form.client_name}
                onChange={(v) => updateForm("client_name", v)}
                options={clients.map((c) => ({ value: c.label }))}
                className={inputCls}
                placeholder="Escolha o cliente"
              />
              {fieldChecks.client_name === null && (
                <p className="mt-1 text-xs text-red-600">
                  Cliente não cadastrado. Escolha um da lista.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-horario">
                Horário
              </label>
              <input id="prog-horario"
                type="time"
                value={form.loading_time}
                onChange={(e) => updateForm("loading_time", e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-carga">
                Carga <span className="text-red-500">*</span>
              </label>
              <input id="prog-carga"
                type="text"
                value={form.cargo}
                onChange={(e) => updateForm("cargo", e.target.value)}
                className={inputCls}
                placeholder="Ex: Álcool etílico"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-peso">
                Peso <span className="text-navy-500">(ton)</span>
              </label>
              <input id="prog-peso"
                type="text"
                inputMode="decimal"
                value={form.weight}
                onChange={(e) => updateForm("weight", sanitizeWeightInput(e.target.value))}
                // Ao sair do campo: "32560" (kg) vira "32,56" (toneladas).
                onBlur={() => updateForm("weight", normalizeWeight(form.weight))}
                className={inputCls}
                placeholder="Ex: 28"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-placa-do-cavalo-truck">
                Placa do cavalo / truck
              </label>
              <SearchSelect id="prog-placa-do-cavalo-truck"
                value={form.plate}
                onChange={(v) => updateForm("plate", normalizePlate(v))}
                options={tractorPlates.map((p) => ({ value: p, hint: certHint(p) }))}
                className={`${inputCls} uppercase tracking-wide`}
                placeholder="ABC1D23"
              />
              {fieldChecks.plate === null && (
                <p className="mt-1 text-xs text-red-600">
                  Placa não cadastrada na frota.
                </p>
              )}
              {certWarning(fieldChecks.plate)}
              {fieldChecks.plate && inMaintenance.has(fieldChecks.plate) && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  ⚠ Em manutenção desde {fmtDateTime(inMaintenance.get(fieldChecks.plate)!.entry_at)}. Só Programado.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-placa-do-semi-reboque">
                Placa do semi-reboque
              </label>
              <SearchSelect id="prog-placa-do-semi-reboque"
                value={form.trailer_plate}
                onChange={(v) => updateForm("trailer_plate", normalizePlate(v))}
                options={trailerPlates.map((p) => ({ value: p, hint: certHint(p) }))}
                className={`${inputCls} uppercase tracking-wide`}
                placeholder="ABC1D23"
              />
              {fieldChecks.trailer_plate === null && (
                <p className="mt-1 text-xs text-red-600">
                  Placa não cadastrada na frota.
                </p>
              )}
              {certWarning(fieldChecks.trailer_plate)}
              {fieldChecks.trailer_plate && inMaintenance.has(fieldChecks.trailer_plate) && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  ⚠ Em manutenção desde {fmtDateTime(inMaintenance.get(fieldChecks.trailer_plate)!.entry_at)}. Só Programado.
                </p>
              )}
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-origem-opcional">
                Origem <span className="text-navy-500">(opcional)</span>
              </label>
              <AddressField id="prog-origem-opcional"
                value={form.origin}
                onValueChange={(v) => {
                  updateForm("origin", v);
                  setOriginTouched(false);
                }}
                onBlur={() => setOriginTouched(true)}
                error={
                  originTouched && form.origin.trim() && resolveCity(form.origin) === null
                    ? "Escolha uma cidade da lista (Cidade/UF)."
                    : undefined
                }
                placeholder="Ex: Palhoça/SC"
                cities={cityNames}
                addresses={[]}
                hideBasesButton
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-destino-opcional">
                Destino <span className="text-navy-500">(opcional)</span>
              </label>
              <DestinationsInput id="prog-destino-opcional"
                value={form.destination}
                onChange={(v) => updateForm("destination", v)}
                placeholder="Ex: Ponta Grossa/PR"
                cities={cityNames}
                strict
                onDraftChange={setPendingDestination}
              />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-motorista">
                Motorista
              </label>
              <SearchSelect id="prog-motorista"
                value={form.driver}
                onChange={(v) => updateForm("driver", v)}
                options={drivers.map((d) => ({
                  value: d.nickname,
                  hint: d.name,
                }))}
                className={inputCls}
                placeholder="Escolha o motorista"
              />
              {fieldChecks.driver === null && (
                <p className="mt-1 text-xs text-red-600">
                  Motorista não cadastrado. Escolha um da lista.
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-status">
                Status
              </label>
              <select id="prog-status"
                value={form.status}
                onChange={(e) => updateForm("status", e.target.value)}
                className={inputCls}
              >
                {LOADING_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-cotacao-vigente-opcional">
                Cotação vigente <span className="text-navy-500">(opcional)</span>
              </label>
              <select id="prog-cotacao-vigente-opcional"
                value={form.quote_id}
                onChange={(e) => updateForm("quote_id", e.target.value)}
                className={inputCls}
              >
                <option value="">Sem cotação</option>
                {form.quote_id && !vigenteIds.has(form.quote_id) && (
                  <option value={form.quote_id}>
                    Cotação atual (não está mais vigente)
                  </option>
                )}
                {quoteOptions.map((q) => (
                  <option key={q.id} value={q.id}>
                    {quoteLabelById.get(q.id)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formError && (
            <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Adicionar"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className={buttonClasses("secondary", "md")}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {loading ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
            Carregando programação...
          </div>
        ) : data?.error ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-red-600">
            Erro ao carregar: {data.error}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
            {statusFilter && rows.length > 0
              ? "Nenhum carregamento com este status neste dia."
              : "Nenhum carregamento programado para este dia."}
          </div>
        ) : (
          groups.map(([client, loads]) => {
            const hasOrigin = loads.some((l) => l.origin?.trim());
            const hasDestination = loads.some((l) => l.destination?.trim());
            const hasTrailer = loads.some((l) => l.trailer_plate?.trim());
            const cols = [
              "1.7fr",
              hasOrigin ? "1.4fr" : null,
              hasDestination ? "1.9fr" : null,
              "1fr",
              "1fr",
              hasTrailer ? "1fr" : null,
              "2fr",
              "0.8fr",
              "1.8fr",
            ]
              .filter((c): c is string => c !== null)
              .map((c) => `minmax(0,${c})`)
              .join("_");
            return (
            <section
              key={client}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dropTarget !== client) setDropTarget(client);
              }}
              onDrop={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                dropClient(client, e.dataTransfer.getData(DRAG_TYPE));
              }}
              className={`overflow-hidden rounded-xl border bg-white shadow-sm transition-shadow ${
                dragClient === client ? "opacity-50" : ""
              } ${
                dropTarget === client && dragClient && dragClient !== client
                  ? "border-brand-500 ring-2 ring-brand-500"
                  : "border-navy-200"
              }`}
            >
              <header
                draggable={canEditSchedule && groups.length > 1}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData(DRAG_TYPE, client);
                  e.dataTransfer.setData("text/plain", client);
                  // Mudar a tela no mesmo instante pode cancelar o arrasto no Chrome/Edge.
                  setTimeout(() => setDragClient(client), 0);
                }}
                onDragEnd={() => {
                  setDragClient(null);
                  setDropTarget(null);
                }}
                title={canEditSchedule && groups.length > 1 ? "Arraste para mudar a ordem dos clientes" : undefined}
                className={`flex items-center justify-between border-b border-navy-200 bg-navy-50 px-5 py-3 ${
                  canEditSchedule && groups.length > 1 ? "cursor-grab active:cursor-grabbing" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  {canEditSchedule && groups.length > 1 && (
                    <span
                      aria-hidden="true"
                      className="select-none text-base leading-none text-navy-400 print:hidden"
                    >
                      ⠿
                    </span>
                  )}
                  <h2 className="text-sm font-semibold text-navy-900">{client}</h2>
                </span>
                <span className="text-xs text-navy-500">
                  {loads.length} {loads.length === 1 ? "carga" : "cargas"}
                </span>
              </header>

              <div
                style={{ "--cols": cols.replaceAll("_", " ") } as React.CSSProperties}
                className="hidden gap-3 px-5 pt-3 text-xs font-medium uppercase tracking-wide text-navy-500 lg:grid lg:[grid-template-columns:var(--cols)]"
              >
                <span>Carga</span>
                {hasOrigin && <span>Origem</span>}
                {hasDestination && <span>Destino</span>}
                <span>Peso</span>
                <span>Cavalo</span>
                {hasTrailer && <span>Carreta</span>}
                <span>Motorista</span>
                <span>Horário</span>
                <span>Status</span>
              </div>

              <ul className="divide-y divide-navy-100">
                {loads.map((l) => {
                  const alerts =
                    l.status === "entregue"
                      ? []
                      : maintenanceWarnings(l.plate, l.trailer_plate);
                  const softAlerts =
                    l.status === "entregue" ? [] : defectAlerts(l.plate, l.trailer_plate);
                  return (
                  <li
                    key={l.id}
                    className={`px-5 py-3 ${
                      alerts.length > 0
                        ? "border-l-4 border-red-500 bg-red-50"
                        : softAlerts.length > 0
                          ? "border-l-4 border-amber-500 bg-amber-50"
                          : ""
                    }`}
                  >
                    <div
                      style={{ "--cols": cols.replaceAll("_", " ") } as React.CSSProperties}
                      className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm lg:items-center lg:gap-3 lg:[grid-template-columns:var(--cols)]"
                    >
                      <div className="col-span-2 font-medium text-navy-900 lg:col-span-1">
                        {l.cargo}
                      </div>
                      {(hasOrigin || hasDestination) && (
                        <>
                          {hasOrigin && (
                            <div
                              className={`text-navy-700 ${l.origin?.trim() ? "" : "max-lg:hidden"}`}
                            >
                              <span className="block text-[11px] uppercase text-navy-500 lg:hidden">
                                Origem
                              </span>
                              {l.origin || "—"}
                            </div>
                          )}
                          {hasDestination && (
                            <div
                              className={`min-w-0 text-navy-700 ${l.destination?.trim() ? "" : "max-lg:hidden"}`}
                            >
                              <span className="block text-[11px] uppercase text-navy-500 lg:hidden">
                                Destino
                              </span>
                              <DeliveryProofDestinations
                                scheduleId={l.id}
                                destination={l.destination}
                                proofDestinations={proofMap.get(l.id) ?? []}
                                canDelete={canEditSchedule}
                                onChanged={reloadRows}
                              />
                            </div>
                          )}
                        </>
                      )}
                      <div className="text-navy-700">
                        <span className="block text-[11px] uppercase text-navy-500 lg:hidden">
                          Peso
                        </span>
                        {normalizeWeight(l.weight) || "—"}
                      </div>
                      <div className="font-medium tracking-wide text-navy-900">
                        <span className="block text-[11px] font-normal uppercase text-navy-500 lg:hidden">
                          Cavalo
                        </span>
                        {l.plate || "—"}
                      </div>
                      {hasTrailer && (
                        <div
                          className={`font-medium tracking-wide text-navy-900 ${l.trailer_plate?.trim() ? "" : "max-lg:hidden"}`}
                        >
                          <span className="block text-[11px] font-normal uppercase text-navy-500 lg:hidden">
                            Carreta
                          </span>
                          {l.trailer_plate || "—"}
                        </div>
                      )}
                      <div
                        className="min-w-0 truncate whitespace-nowrap text-navy-700"
                        title={l.driver ?? undefined}
                      >
                        <span className="block text-[11px] uppercase text-navy-500 lg:hidden">
                          Motorista
                        </span>
                        {l.driver || "—"}
                      </div>
                      <div className="text-navy-700">
                        <span className="block text-[11px] uppercase text-navy-500 lg:hidden">
                          Horário
                        </span>
                        {l.loading_time ? l.loading_time.slice(0, 5) : "—"}
                      </div>
                      <div className="col-span-2 lg:col-span-1">
                        {canEditSchedule ? (
                          <select
                            value={l.status}
                            onChange={(e) => changeStatus(l, e.target.value)}
                            className={`w-full min-w-0 max-w-[10.5rem] cursor-pointer truncate rounded-full border-0 py-1 pl-2.5 pr-1 text-[11px] print:appearance-none font-medium outline-none focus:ring-2 focus:ring-brand-500 ${loadingStatusBadge(
                              l.status
                            )}`}
                          >
                            {LOADING_STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${loadingStatusBadge(
                              l.status
                            )}`}
                          >
                            {loadingStatusLabel(l.status)}
                          </span>
                        )}
                      </div>
                    </div>

                    {alerts.length > 0 && (
                      <div
                        role="alert"
                        className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-xs font-medium text-red-800"
                      >
                        {alerts.map((a) => (
                          <p key={a}>⚠ {a}</p>
                        ))}
                      </div>
                    )}
                    {softAlerts.length > 0 && (
                      <div className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900">
                        {softAlerts.map((a) => (
                          <p key={a}>⚠ {a}</p>
                        ))}
                      </div>
                    )}

                    {(l.quote_id || canEditSchedule || (noteMap.get(l.id)?.length ?? 0) > 0) && (
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs">
                        {l.quote_id && (
                          <Link
                            href={`/quotes/${l.quote_id}?from=programacao&date=${date}`}
                            className={buttonClasses("soft", "sm")}
                          >
                            {l.quotes?.client_quote_number?.trim()
                              ? `Cotação ${l.quotes.client_quote_number.trim()}`
                              : "Ver cotação"}
                          </Link>
                        )}
                        {!canEditSchedule && (noteMap.get(l.id)?.length ?? 0) > 0 && (
                          <button
                            type="button"
                            onClick={() => openNotes(l)}
                            title={`${noteMap.get(l.id)?.length ?? 0} observação(ões)`}
                            className={`${notesButtonClass(noteMap.get(l.id)?.length ?? 0)} print:hidden`}
                          >
                            Observações
                          </button>
                        )}
                        {canEditSchedule && (
                          <span className="flex items-center gap-4 print:hidden">
                            <button
                              type="button"
                              onClick={() => openEdit(l)}
                              className={buttonClasses("soft", "sm")}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => openNotes(l)}
                              title={
                                (noteMap.get(l.id)?.length ?? 0) > 0
                                  ? `${noteMap.get(l.id)!.length} observação(ões)`
                                  : "Sem observações"
                              }
                              className={notesButtonClass(noteMap.get(l.id)?.length ?? 0)}
                            >
                              Observações
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(l)}
                              className={buttonClasses("danger", "sm")}
                            >
                              Excluir
                            </button>
                          </span>
                        )}
                      </div>
                    )}
                  </li>
                  );
                })}
              </ul>
            </section>
            );
          })
        )}
      </div>

      {notesFor && (
        <Modal onClose={() => setNotesFor(null)} labelledBy="notes-modal-title" className="max-w-lg">
          <h2 id="notes-modal-title" className="text-base font-medium text-navy-900">
            Observações
          </h2>
          <p className="mt-1 text-sm text-navy-500">
            {notesFor.cargo} · {notesFor.client_name}
            {notesFor.plate ? ` · ${notesFor.plate}` : ""}
          </p>
          {(noteMap.get(notesFor.id) ?? []).length === 0 ? (
            <p className="mt-4 text-sm text-navy-500">Nenhuma observação ainda.</p>
          ) : (
            <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {(noteMap.get(notesFor.id) ?? []).map((n) => (
                <li
                  key={n.id}
                  className={`rounded-lg border px-3 py-2 ${
                    n.source === "motorista"
                      ? "border-amber-300 bg-amber-50"
                      : "border-navy-200 bg-navy-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-medium text-navy-500">{noteMeta(n)}</span>
                    {canEditSchedule && editingNoteId !== n.id && (
                      <span className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingNoteId(n.id);
                            setEditingNoteText(n.body);
                          }}
                          className={buttonClasses("soft", "sm")}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteNote(n)}
                          className={buttonClasses("danger", "sm")}
                        >
                          Excluir
                        </button>
                      </span>
                    )}
                  </div>
                  {editingNoteId === n.id ? (
                    <div className="mt-2">
                      <label htmlFor={`note-edit-${n.id}`} className="sr-only">
                        Editar observação
                      </label>
                      <textarea
                        id={`note-edit-${n.id}`}
                        rows={3}
                        value={editingNoteText}
                        onChange={(e) => setEditingNoteText(e.target.value)}
                        className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                      />
                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingNoteId(null)}
                          className={buttonClasses("secondary", "sm")}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => saveNoteEdit(n)}
                          disabled={!editingNoteText.trim()}
                          className={buttonClasses("primary", "sm")}
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-1 whitespace-pre-line text-sm text-navy-900">{n.body}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {canEditSchedule && (
            <>
              <label htmlFor="prog-notes" className="mt-4 block text-sm font-medium text-navy-700">
                Nova observação
              </label>
              <textarea
                id="prog-notes"
                rows={3}
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="Ex.: descarga só após as 14h; levar EPI completo"
                className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              />
            </>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setNotesFor(null)} className={buttonClasses("secondary")}>
              Fechar
            </button>
            {canEditSchedule && (
              <button
                type="button"
                onClick={addNote}
                disabled={notesSaving || !notesText.trim()}
                className={buttonClasses("primary")}
              >
                {notesSaving ? "Salvando..." : "Adicionar"}
              </button>
            )}
          </div>
        </Modal>
      )}

      {canEditSchedule && showDup && (
        <Modal onClose={() => setShowDup(false)} labelledBy="dup-modal-title" className="max-w-lg">
            <h2 id="dup-modal-title" className="text-base font-medium text-navy-900">
              Duplicar programação de{" "}
              {fromIsoDate(date).toLocaleDateString("pt-BR")}
            </h2>
            <p className="mt-1 text-sm text-navy-500">
              Escolha a data e as cargas que se repetem. As cópias entram como
              Programado.
            </p>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="prog-duplicar-para-o-dia">
                Duplicar para o dia
              </label>
              <input id="prog-duplicar-para-o-dia"
                type="date"
                value={dupDate}
                onChange={(e) => changeDupDate(e.target.value)}
                className={inputCls}
              />
              {dupTargetCount !== null && dupTargetCount > 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  Esse dia já tem {dupTargetCount}{" "}
                  {dupTargetCount === 1 ? "carga" : "cargas"}. Elas serão
                  mantidas e as cópias só serão adicionadas.
                </p>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-navy-700">
                  Cargas ({dupSelected.size} de {rows.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDupSelected(
                      dupSelected.size === rows.length
                        ? new Set()
                        : new Set(rows.map((r) => r.id))
                    )
                  }
                  className={buttonClasses("soft", "sm")}
                >
                  {dupSelected.size === rows.length
                    ? "Desmarcar todas"
                    : "Marcar todas"}
                </button>
              </div>
              <ul className="max-h-60 divide-y divide-navy-100 overflow-y-auto rounded-lg border border-navy-200">
                {rows.map((r) => (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-navy-50">
                      <input
                        type="checkbox"
                        checked={dupSelected.has(r.id)}
                        onChange={() => toggleDup(r.id)}
                        className="mt-1"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-navy-900">
                          {r.client_name} — {r.cargo}
                        </span>
                        <span className="block truncate text-xs text-navy-500">
                          {[r.plate, r.trailer_plate, r.driver]
                            .filter(Boolean)
                            .join(" · ") || "Sem placa ou motorista"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            {dupError && (
              <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {dupError}
              </div>
            )}

            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={handleDuplicate}
                disabled={dupBusy}
                className="flex-1 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {dupBusy
                  ? "Duplicando..."
                  : `Duplicar ${dupSelected.size} ${dupSelected.size === 1 ? "carga" : "cargas"}`}
              </button>
              <button
                type="button"
                onClick={() => setShowDup(false)}
                className={buttonClasses("secondary", "md")}
              >
                Cancelar
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}
