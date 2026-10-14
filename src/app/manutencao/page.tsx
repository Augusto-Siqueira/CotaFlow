"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";
import { DataTable, type Column } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { SearchSelect } from "@/components/SearchSelect";
import {
  ORDER_COLUMNS,
  SERVICE_TYPES,
  formatDateTime,
  formatDuration,
  fromLocalInput,
  parseMoney,
  serviceTypeBadge,
  serviceTypeLabel,
  toLocalInput,
  type MaintenanceOrder,
} from "@/lib/maintenance";

interface Workshop {
  id: string;
  name: string;
}
interface FleetUnit {
  plate: string;
  kind: string;
}
interface AffectedLoad {
  id: string;
  schedule_date: string;
  client_name: string;
  cargo: string;
  plate: string | null;
  trailer_plate: string | null;
  status: string;
}

const KIND_LABEL: Record<string, string> = {
  cavalo: "Cavalo",
  semirreboque: "Semi-reboque",
  truck: "Truck",
};

interface FormState {
  plate: string;
  workshop_id: string;
  service_type: string;
  service: string;
  entry_at: string;
  expected_exit_at: string;
  exit_at: string;
  odometer_km: string;
  cost: string;
  notes: string;
}

function emptyForm(): FormState {
  return {
    plate: "",
    workshop_id: "",
    service_type: "corretiva",
    service: "",
    entry_at: toLocalInput(new Date()),
    expected_exit_at: "",
    exit_at: "",
    odometer_km: "",
    cost: "",
    notes: "",
  };
}

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "mb-1 block text-sm font-medium text-navy-700";

// Cargas que ainda não saíram e usam a placa (cavalo ou carreta).
async function fetchAffected(
  plates: string[],
  fromDate: string
): Promise<AffectedLoad[]> {
  if (plates.length === 0) return [];
  const list = plates.join(",");
  const { data } = await supabase
    .from("loading_schedules")
    .select("id, schedule_date, client_name, cargo, plate, trailer_plate, status")
    .in("status", ["programado", "lavando", "carregando"])
    .gte("schedule_date", fromDate)
    .or(`plate.in.(${list}),trailer_plate.in.(${list})`)
    .order("schedule_date");
  return (data as AffectedLoad[] | null) ?? [];
}

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function ManutencaoPage() {
  const { canEditMaintenance } = useAuth();
  const { toastError, toastSuccess, confirm: askConfirm } = useFeedback();

  const [now] = useState(() => Date.now());
  const [orders, setOrders] = useState<MaintenanceOrder[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [fleet, setFleet] = useState<FleetUnit[]>([]);
  const [affectedByPlate, setAffectedByPlate] = useState<Map<string, number>>(
    new Map()
  );

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formAffected, setFormAffected] = useState<AffectedLoad[]>([]);

  const [releasing, setReleasing] = useState<MaintenanceOrder | null>(null);
  const [releaseAt, setReleaseAt] = useState("");
  const [releaseError, setReleaseError] = useState<string | null>(null);

  const [showWorkshops, setShowWorkshops] = useState(false);
  const [newWorkshop, setNewWorkshop] = useState("");

  const loadOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("maintenance_orders")
      .select(ORDER_COLUMNS)
      .is("exit_at", null)
      .order("entry_at");
    if (error) {
      setLoadError(error.message);
      setOrders([]);
      return;
    }
    const open = (data as unknown as MaintenanceOrder[]) ?? [];
    setLoadError(null);
    setOrders(open);
    const affected = await fetchAffected(
      open.map((o) => o.plate),
      localDate(new Date())
    );
    const counts = new Map<string, number>();
    for (const o of open) {
      counts.set(
        o.plate,
        affected.filter((l) => l.plate === o.plate || l.trailer_plate === o.plate)
          .length
      );
    }
    setAffectedByPlate(counts);
  }, []);

  const loadWorkshops = useCallback(async () => {
    const { data } = await supabase
      .from("maintenance_workshops")
      .select("id, name")
      .order("name");
    setWorkshops((data as Workshop[] | null) ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOrders();
    loadWorkshops();
    supabase
      .from("fleet_units")
      .select("plate, kind")
      .order("plate")
      .then(({ data }) => setFleet((data as FleetUnit[] | null) ?? []));
  }, [loadOrders, loadWorkshops]);

  const plateOptions = useMemo(
    () => fleet.map((f) => ({ value: f.plate, hint: KIND_LABEL[f.kind] ?? f.kind })),
    [fleet]
  );
  const resolvedPlate = useMemo(() => {
    const v = form.plate.trim().replace(/[\s-]/g, "").toUpperCase();
    return fleet.find((f) => f.plate === v)?.plate ?? null;
  }, [form.plate, fleet]);

  // Cargas já programadas que usam a placa escolhida (aviso no formulário).
  useEffect(() => {
    if (!showForm || !resolvedPlate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormAffected([]);
      return;
    }
    let cancelled = false;
    const from = form.entry_at ? form.entry_at.slice(0, 10) : localDate(new Date());
    fetchAffected([resolvedPlate], from).then((rows) => {
      if (!cancelled) setFormAffected(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [showForm, resolvedPlate, form.entry_at]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm());
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(o: MaintenanceOrder) {
    setEditingId(o.id);
    setForm({
      plate: o.plate,
      workshop_id: o.workshop_id,
      service_type: o.service_type,
      service: o.service,
      entry_at: toLocalInput(o.entry_at),
      expected_exit_at: toLocalInput(o.expected_exit_at),
      exit_at: toLocalInput(o.exit_at),
      odometer_km: o.odometer_km !== null ? String(o.odometer_km) : "",
      cost: o.cost !== null ? String(o.cost).replace(".", ",") : "",
      notes: o.notes ?? "",
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolvedPlate) {
      setFormError("Escolha na lista uma placa da frota cadastrada.");
      return;
    }
    if (!form.workshop_id) {
      setFormError("Escolha a oficina.");
      return;
    }
    if (!form.service.trim()) {
      setFormError("Descreva o serviço que será realizado.");
      return;
    }
    const entry = fromLocalInput(form.entry_at);
    if (!entry) {
      setFormError("Informe a data e a hora de entrada.");
      return;
    }
    const expected = fromLocalInput(form.expected_exit_at);
    const exit = fromLocalInput(form.exit_at);
    if (exit && exit < entry) {
      setFormError("A saída não pode ser antes da entrada.");
      return;
    }
    if (expected && expected < entry) {
      setFormError("A previsão de saída não pode ser antes da entrada.");
      return;
    }
    const km = form.odometer_km.trim();
    if (km && !/^\d+$/.test(km)) {
      setFormError("Quilometragem: digite só números.");
      return;
    }
    const cost = parseMoney(form.cost);
    if (form.cost.trim() && cost === null) {
      setFormError("Custo inválido.");
      return;
    }

    const payload = {
      plate: resolvedPlate,
      workshop_id: form.workshop_id,
      service_type: form.service_type,
      service: form.service.trim(),
      entry_at: entry,
      expected_exit_at: expected,
      exit_at: exit,
      odometer_km: km ? Number(km) : null,
      cost,
      notes: form.notes.trim() || null,
    };

    setSaving(true);
    setFormError(null);
    const { error } = editingId
      ? await supabase.from("maintenance_orders").update(payload).eq("id", editingId)
      : await supabase.from("maintenance_orders").insert(payload);
    setSaving(false);

    if (error) {
      setFormError(
        /maintenance_orders_one_open|duplicate key/i.test(error.message)
          ? `A placa ${resolvedPlate} já está em manutenção. Libere a entrada anterior antes de lançar outra.`
          : `Não foi possível salvar (${error.message}).`
      );
      return;
    }
    toastSuccess(editingId ? "Manutenção atualizada." : "Entrada lançada.");
    closeForm();
    await loadOrders();
  }

  function openRelease(o: MaintenanceOrder) {
    setReleasing(o);
    setReleaseAt(toLocalInput(new Date()));
    setReleaseError(null);
  }

  async function confirmRelease() {
    if (!releasing) return;
    const exit = fromLocalInput(releaseAt);
    if (!exit) {
      setReleaseError("Informe a data e a hora de saída.");
      return;
    }
    if (exit < releasing.entry_at) {
      setReleaseError("A saída não pode ser antes da entrada.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("maintenance_orders")
      .update({ exit_at: exit })
      .eq("id", releasing.id);
    setSaving(false);
    if (error) {
      setReleaseError(`Não foi possível liberar (${error.message}).`);
      return;
    }
    toastSuccess(`Placa ${releasing.plate} liberada.`);
    setReleasing(null);
    await loadOrders();
  }

  async function remove(o: MaintenanceOrder) {
    const ok = await askConfirm(
      `Excluir o lançamento da placa ${o.plate} (entrada em ${formatDateTime(o.entry_at)})? Ele some também do histórico.`
    );
    if (!ok) return;
    const { error } = await supabase.from("maintenance_orders").delete().eq("id", o.id);
    if (error) {
      toastError(`Não foi possível excluir (${error.message}).`);
      return;
    }
    await loadOrders();
  }

  async function addWorkshop() {
    const name = newWorkshop.trim();
    if (!name) return;
    const { error } = await supabase.from("maintenance_workshops").insert({ name });
    if (error) {
      toastError(
        /duplicate|unique/i.test(error.message)
          ? "Essa oficina já está cadastrada."
          : `Não foi possível cadastrar (${error.message}).`
      );
      return;
    }
    setNewWorkshop("");
    await loadWorkshops();
  }

  async function removeWorkshop(w: Workshop) {
    const ok = await askConfirm(`Excluir a oficina ${w.name}?`);
    if (!ok) return;
    const { error } = await supabase.from("maintenance_workshops").delete().eq("id", w.id);
    if (error) {
      toastError(
        /foreign key|violates/i.test(error.message)
          ? "Essa oficina tem manutenções lançadas e não pode ser excluída."
          : `Não foi possível excluir (${error.message}).`
      );
      return;
    }
    await loadWorkshops();
  }

  const columns: Column<MaintenanceOrder>[] = [
    {
      key: "plate",
      header: "Placa",
      mobile: "title",
      className: "font-semibold tracking-wide text-navy-900",
      cell: (o) => o.plate,
    },
    {
      key: "type",
      header: "Tipo",
      mobile: "badge",
      cell: (o) => (
        <span
          className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${serviceTypeBadge(o.service_type)}`}
        >
          {serviceTypeLabel(o.service_type)}
        </span>
      ),
    },
    {
      key: "workshop",
      header: "Oficina",
      mobile: "subtitle",
      cell: (o) => o.maintenance_workshops?.name ?? "—",
    },
    { key: "service", header: "Serviço", mobile: "wideField", cell: (o) => o.service },
    { key: "entry", header: "Entrada", mobile: "field", cell: (o) => formatDateTime(o.entry_at) },
    {
      key: "expected",
      header: "Previsão de saída",
      mobile: "field",
      cell: (o) => {
        if (!o.expected_exit_at) return "—";
        const late = new Date(o.expected_exit_at).getTime() < now;
        return (
          <span className={late ? "font-medium text-red-700" : ""}>
            {formatDateTime(o.expected_exit_at)}
            {late && <span className="block text-[11px]">Passou da previsão</span>}
          </span>
        );
      },
    },
    {
      key: "stopped",
      header: "Parada há",
      mobile: "field",
      className: "font-medium",
      cell: (o) => formatDuration(now - new Date(o.entry_at).getTime()),
    },
    {
      key: "affected",
      header: "Cargas afetadas",
      mobile: "field",
      cell: (o) => {
        const n = affectedByPlate.get(o.plate) ?? 0;
        return n > 0 ? (
          <span className="font-medium text-red-700">
            {n} {n === 1 ? "carga" : "cargas"}
          </span>
        ) : (
          "Nenhuma"
        );
      },
    },
    ...(canEditMaintenance
      ? ([
          {
            key: "actions",
            header: "Ações",
            mobile: "actions",
            cell: (o) => (
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => openRelease(o)}
                  className={buttonClasses("primary", "sm")}
                >
                  Liberar
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(o)}
                  className={buttonClasses("soft", "sm")}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => remove(o)}
                  className={buttonClasses("danger", "sm")}
                >
                  Excluir
                </button>
              </div>
            ),
          },
        ] as Column<MaintenanceOrder>[])
      : []),
  ];

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
            Manutenção da frota
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Placas que estão na oficina agora. Elas ficam sinalizadas na programação.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/manutencao/dashboard" className={buttonClasses("secondary", "md")}>
            Dashboard
          </Link>
          {canEditMaintenance && (
            <>
              <button
                type="button"
                onClick={() => setShowWorkshops(true)}
                className={buttonClasses("secondary", "md")}
              >
                Oficinas
              </button>
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
              >
                Nova entrada
              </button>
            </>
          )}
        </div>
      </div>

      {canEditMaintenance && showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-6 rounded-xl border border-navy-200 bg-white p-6 shadow-sm"
        >
          <h2 className="text-base font-medium text-navy-900">
            {editingId ? "Editar manutenção" : "Nova entrada em manutenção"}
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelCls} htmlFor="man-placa">
                Placa <span className="text-red-600">*</span>
              </label>
              <SearchSelect
                id="man-placa"
                value={form.plate}
                onChange={(v) => update("plate", v)}
                options={plateOptions}
                className={inputCls}
                placeholder="ABC1D23"
              />
              {form.plate.trim() && !resolvedPlate && (
                <p className="mt-1 text-xs text-red-600">
                  Placa não cadastrada. Escolha uma da lista.
                </p>
              )}
            </div>
            <div className="lg:col-span-2">
              <label className={labelCls} htmlFor="man-oficina">
                Oficina <span className="text-red-600">*</span>
              </label>
              <select
                id="man-oficina"
                value={form.workshop_id}
                onChange={(e) => update("workshop_id", e.target.value)}
                className={inputCls}
              >
                <option value="">
                  {workshops.length === 0 ? "Nenhuma oficina cadastrada" : "Escolha a oficina"}
                </option>
                {workshops.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="man-tipo">
                Tipo de serviço
              </label>
              <select
                id="man-tipo"
                value={form.service_type}
                onChange={(e) => update("service_type", e.target.value)}
                className={inputCls}
              >
                {SERVICE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <label className={labelCls} htmlFor="man-servico">
                Serviço a realizar <span className="text-red-600">*</span>
              </label>
              <input
                id="man-servico"
                type="text"
                value={form.service}
                onChange={(e) => update("service", e.target.value)}
                className={inputCls}
                placeholder="Ex: Troca de embreagem e revisão do freio"
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="man-entrada">
                Entrada <span className="text-red-600">*</span>
              </label>
              <input
                id="man-entrada"
                type="datetime-local"
                value={form.entry_at}
                onChange={(e) => update("entry_at", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="man-previsao">
                Previsão de saída <span className="text-navy-500">(opcional)</span>
              </label>
              <input
                id="man-previsao"
                type="datetime-local"
                value={form.expected_exit_at}
                onChange={(e) => update("expected_exit_at", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="man-saida">
                Saída <span className="text-navy-500">(se já saiu)</span>
              </label>
              <input
                id="man-saida"
                type="datetime-local"
                value={form.exit_at}
                onChange={(e) => update("exit_at", e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="man-km">
                Quilometragem <span className="text-navy-500">(opcional)</span>
              </label>
              <input
                id="man-km"
                type="text"
                inputMode="numeric"
                value={form.odometer_km}
                onChange={(e) => update("odometer_km", e.target.value.replace(/\D/g, ""))}
                className={inputCls}
                placeholder="Ex: 245000"
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="man-custo">
                Custo <span className="text-navy-500">(opcional)</span>
              </label>
              <input
                id="man-custo"
                type="text"
                inputMode="decimal"
                value={form.cost}
                onChange={(e) => update("cost", e.target.value.replace(/[^\d.,]/g, ""))}
                className={inputCls}
                placeholder="Ex: 1850,00"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="man-obs">
                Observações <span className="text-navy-500">(opcional)</span>
              </label>
              <input
                id="man-obs"
                type="text"
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {formAffected.length > 0 && (
            <div className="mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-medium">
                {formAffected.length === 1
                  ? "1 carga programada usa esta placa:"
                  : `${formAffected.length} cargas programadas usam esta placa:`}
              </p>
              <ul className="mt-1 space-y-0.5">
                {formAffected.slice(0, 6).map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/programacao?date=${l.schedule_date}`}
                      className="underline"
                    >
                      {l.schedule_date.split("-").reverse().join("/")}
                    </Link>{" "}
                    · {l.client_name} · {l.cargo}
                  </li>
                ))}
                {formAffected.length > 6 && <li>e mais {formAffected.length - 6}...</li>}
              </ul>
              <p className="mt-1 text-xs">
                Avise a Logística para trocar a placa a tempo.
              </p>
            </div>
          )}

          {formError && (
            <div
              role="alert"
              className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {formError}
            </div>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Lançar entrada"}
            </button>
            <button type="button" onClick={closeForm} className={buttonClasses("secondary", "md")}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-medium text-navy-900">
          Em manutenção agora{" "}
          <span className="font-normal text-navy-500">({orders?.length ?? 0})</span>
        </h2>
        {loadError ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-red-600">
            Erro ao carregar: {loadError}
          </div>
        ) : orders === null ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
            Carregando...
          </div>
        ) : orders.length === 0 ? (
          <div className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
            Nenhuma placa em manutenção no momento.
          </div>
        ) : (
          <div className="rounded-xl border border-navy-200 bg-white">
            <DataTable rows={orders} columns={columns} rowKey={(o) => o.id} />
          </div>
        )}
      </section>

      {releasing && (
        <Modal onClose={() => setReleasing(null)} labelledBy="release-title" className="max-w-sm">
          <h2 id="release-title" className="text-base font-medium">
            Liberar placa {releasing.plate}
          </h2>
          <p className="mt-1 text-sm text-navy-500">
            Entrou em {formatDateTime(releasing.entry_at)}. Informe quando saiu da oficina.
          </p>
          <div className="mt-4">
            <label className={labelCls} htmlFor="release-at">
              Saída
            </label>
            <input
              id="release-at"
              type="datetime-local"
              value={releaseAt}
              onChange={(e) => setReleaseAt(e.target.value)}
              className={inputCls}
            />
          </div>
          {releaseError && (
            <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {releaseError}
            </div>
          )}
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={confirmRelease}
              disabled={saving}
              className="flex-1 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Liberar placa"}
            </button>
            <button
              type="button"
              onClick={() => setReleasing(null)}
              className={buttonClasses("secondary", "md")}
            >
              Cancelar
            </button>
          </div>
        </Modal>
      )}

      {canEditMaintenance && showWorkshops && (
        <Modal onClose={() => setShowWorkshops(false)} labelledBy="workshops-title" className="max-w-md">
          <h2 id="workshops-title" className="text-base font-medium">
            Oficinas
          </h2>
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              aria-label="Nome da nova oficina"
              value={newWorkshop}
              onChange={(e) => setNewWorkshop(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addWorkshop();
                }
              }}
              className={inputCls}
              placeholder="Nome da oficina"
            />
            <button
              type="button"
              onClick={addWorkshop}
              disabled={!newWorkshop.trim()}
              className={buttonClasses("primary", "md")}
            >
              Adicionar
            </button>
          </div>
          <ul className="mt-4 max-h-72 divide-y divide-navy-100 overflow-y-auto">
            {workshops.length === 0 && (
              <li className="py-3 text-sm text-navy-500">Nenhuma oficina cadastrada.</li>
            )}
            {workshops.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate text-navy-900">{w.name}</span>
                <button
                  type="button"
                  onClick={() => removeWorkshop(w)}
                  className={buttonClasses("danger", "sm")}
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setShowWorkshops(false)}
              className={buttonClasses("secondary", "md")}
            >
              Fechar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

