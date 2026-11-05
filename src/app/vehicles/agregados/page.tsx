"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { VehiclesTabs } from "@/components/VehiclesTabs";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { DataTable, type Column } from "@/components/DataTable";
import { SearchSelect, type SearchOption } from "@/components/SearchSelect";
import {
  PostalAddressFields,
  emptyPostalAddress,
  type PostalAddress,
} from "@/components/PostalAddressFields";
import { fetchAllCityNames } from "@/lib/cities";
import { formatCpf, onlyDigits } from "@/lib/cpf";
import {
  AGREGADO_COLUMNS,
  CIOT_MODE_LABEL,
  PIX_KEY_LABEL,
  clientHint,
  clientLabels,
  formatCep,
  formatDocument,
  formatPhone,
  isValidDocument,
  type Agregado,
  type BankAccountType,
  type CiotMode,
  type PaymentMethod,
  type PersonType,
  type PixKeyType,
} from "@/lib/agregados";

// Cadastro de agregados (contratado do CIOT). Só Logística e admin veem esta
// tela: guarda CPF/CNPJ e dados bancários (RLS da migration 0080).

interface FleetPlate {
  id: string;
  plate: string;
  kind: string;
  agregado_id: string | null;
}
interface DriverOption {
  id: string;
  name: string;
  cpf: string;
}
interface ClientOption {
  id: string;
  name: string;
  trade_name: string | null;
  document: string | null;
}

interface FormState {
  person_type: PersonType;
  document: string;
  name: string;
  rntrc: string;
  dependents: string;
  email: string;
  mobile_phone: string;
  other_phone: string;
  address: PostalAddress;
  payment_method: PaymentMethod | "";
  bank_code: string;
  bank_agency: string;
  bank_account: string;
  bank_account_type: BankAccountType | "";
  pix_key_type: PixKeyType | "";
  pix_key: string;
  ciot_mode: CiotMode;
  recipient_client: string;
  driver: string;
  notes: string;
  active: boolean;
  plateIds: string[];
}

const emptyForm: FormState = {
  person_type: "pf",
  document: "",
  name: "",
  rntrc: "",
  dependents: "0",
  email: "",
  mobile_phone: "",
  other_phone: "",
  address: emptyPostalAddress,
  payment_method: "",
  bank_code: "",
  bank_agency: "",
  bank_account: "",
  bank_account_type: "",
  pix_key_type: "",
  pix_key: "",
  ciot_mode: "viagem",
  recipient_client: "",
  driver: "",
  notes: "",
  active: true,
  plateIds: [],
};

const KIND_LABEL: Record<string, string> = {
  cavalo: "Cavalo",
  semirreboque: "Semirreboque",
  truck: "Truck",
};

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelCls = "mb-1 block text-sm font-medium text-navy-700";
const sectionCls = "border-t border-navy-200 pt-4 text-sm font-semibold text-navy-900";

const driverLabel = (d: DriverOption) => `${d.name} · ${formatCpf(d.cpf)}`;

export default function AgregadosPage() {
  const { canEditSchedule, loading: authLoading } = useAuth();
  const { toastSuccess, toastError, confirm: askConfirm } = useFeedback();

  const [agregados, setAgregados] = useState<Agregado[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [plates, setPlates] = useState<FleetPlate[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadAll() {
    const [agRes, platesRes, driversRes, clientsRes] = await Promise.all([
      supabase.from("agregados").select(AGREGADO_COLUMNS).order("name"),
      supabase.from("fleet_units").select("id, plate, kind, agregado_id").order("plate"),
      supabase.from("drivers").select("id, name, cpf").order("name"),
      supabase.from("clients").select("id, name, trade_name, document").order("name"),
    ]);
    if (agRes.error) {
      setListError(agRes.error.message);
      setAgregados([]);
    } else {
      setListError(null);
      setAgregados((agRes.data as Agregado[]) ?? []);
    }
    setPlates((platesRes.data as FleetPlate[]) ?? []);
    setDrivers((driversRes.data as DriverOption[]) ?? []);
    setClients((clientsRes.data as ClientOption[]) ?? []);
  }

  useEffect(() => {
    if (authLoading || !canEditSchedule) return;
    queueMicrotask(() => {
      loadAll();
      fetchAllCityNames().then(setCities);
    });
  }, [authLoading, canEditSchedule]);

  const cityOptions: SearchOption[] = useMemo(() => cities.map((c) => ({ value: c })), [cities]);
  const driverOptions: SearchOption[] = useMemo(
    () => drivers.map((d) => ({ value: driverLabel(d) })),
    [drivers]
  );
  // Nome fantasia na frente: várias unidades têm a mesma razão social.
  const clientLabel = useMemo(() => clientLabels(clients), [clients]);
  const clientOptions: SearchOption[] = useMemo(
    () =>
      clients
        .map((c) => ({ value: clientLabel.get(c.id) ?? c.name, hint: clientHint(c) }))
        .sort((a, b) => a.value.localeCompare(b.value, "pt-BR")),
    [clients, clientLabel]
  );

  const platesByAgregado = useMemo(() => {
    const map = new Map<string, FleetPlate[]>();
    for (const p of plates) {
      if (!p.agregado_id) continue;
      map.set(p.agregado_id, [...(map.get(p.agregado_id) ?? []), p]);
    }
    return map;
  }, [plates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = onlyDigits(search);
    return (agregados ?? []).filter(
      (a) =>
        !q ||
        a.name.toLowerCase().includes(q) ||
        (qDigits && a.document.includes(qDigits)) ||
        (platesByAgregado.get(a.id) ?? []).some((p) => p.plate.toLowerCase().includes(q))
    );
  }, [agregados, search, platesByAgregado]);

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function openNew() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(a: Agregado) {
    const driver = drivers.find((d) => d.id === a.driver_id);
    const client = clients.find((c) => c.id === a.recipient_client_id);
    setEditingId(a.id);
    setForm({
      person_type: a.person_type,
      document: formatDocument(a.person_type, a.document),
      name: a.name,
      rntrc: a.rntrc ?? "",
      dependents: String(a.dependents ?? 0),
      email: a.email ?? "",
      mobile_phone: formatPhone(a.mobile_phone ?? ""),
      other_phone: formatPhone(a.other_phone ?? ""),
      address: {
        street: a.street ?? "",
        number: a.number ?? "",
        complement: a.complement ?? "",
        district: a.district ?? "",
        cep: formatCep(a.cep ?? ""),
        city: a.city ?? "",
      },
      payment_method: a.payment_method ?? "",
      bank_code: a.bank_code ?? "",
      bank_agency: a.bank_agency ?? "",
      bank_account: a.bank_account ?? "",
      bank_account_type: a.bank_account_type ?? "",
      pix_key_type: a.pix_key_type ?? "",
      pix_key: a.pix_key ?? "",
      ciot_mode: a.ciot_mode,
      recipient_client: client ? clientLabel.get(client.id) ?? client.name : "",
      driver: driver ? driverLabel(driver) : "",
      notes: a.notes ?? "",
      active: a.active,
      plateIds: (platesByAgregado.get(a.id) ?? []).map((p) => p.id),
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  }

  // PF que dirige o próprio caminhão (caso do Darci): puxa nome e CPF do
  // cadastro de motoristas em vez de digitar de novo.
  function copyFromDriver() {
    const d = drivers.find((x) => driverLabel(x) === form.driver);
    if (!d) return;
    setForm((f) => ({ ...f, person_type: "pf", name: d.name, document: formatCpf(d.cpf) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fail = (msg: string) => setFormError(msg);

    if (!form.name.trim()) return fail("Informe o nome ou razão social.");
    if (!isValidDocument(form.person_type, form.document))
      return fail(form.person_type === "pf" ? "CPF inválido." : "CNPJ inválido.");
    const dependents = Number(form.dependents || "0");
    if (!Number.isInteger(dependents) || dependents < 0) return fail("Dependentes: informe um número inteiro.");
    const driver = form.driver.trim() ? drivers.find((d) => driverLabel(d) === form.driver) : null;
    if (form.driver.trim() && !driver) return fail("Escolha o motorista na lista.");
    const client = form.recipient_client.trim()
      ? clients.find((c) => clientLabel.get(c.id) === form.recipient_client)
      : null;
    if (form.recipient_client.trim() && !client) return fail("Escolha o destinatário na lista de clientes.");
    if (form.address.city.trim() && !cities.includes(form.address.city))
      return fail("Escolha o município na lista.");
    if (form.payment_method === "pix" && (!form.pix_key_type || !form.pix_key.trim()))
      return fail("Informe o tipo e a chave PIX.");
    if (form.payment_method === "conta" && (!form.bank_code.trim() || !form.bank_agency.trim() || !form.bank_account.trim()))
      return fail("Informe banco, agência e conta.");

    const t = (s: string) => s.trim() || null;
    const payload = {
      person_type: form.person_type,
      document: onlyDigits(form.document),
      name: form.name.trim(),
      rntrc: t(onlyDigits(form.rntrc)),
      dependents,
      email: t(form.email),
      mobile_phone: t(onlyDigits(form.mobile_phone)),
      other_phone: t(onlyDigits(form.other_phone)),
      street: t(form.address.street),
      number: t(form.address.number),
      complement: t(form.address.complement),
      district: t(form.address.district),
      cep: t(onlyDigits(form.address.cep)),
      city: t(form.address.city),
      payment_method: form.payment_method || null,
      bank_code: form.payment_method === "conta" ? t(form.bank_code) : null,
      bank_agency: form.payment_method === "conta" ? t(form.bank_agency) : null,
      bank_account: form.payment_method === "conta" ? t(form.bank_account) : null,
      bank_account_type: form.payment_method === "conta" ? form.bank_account_type || null : null,
      pix_key_type: form.payment_method === "pix" ? form.pix_key_type || null : null,
      pix_key: form.payment_method === "pix" ? t(form.pix_key) : null,
      ciot_mode: form.ciot_mode,
      recipient_client_id: client?.id ?? null,
      driver_id: driver?.id ?? null,
      notes: t(form.notes),
      active: form.active,
    };

    setSaving(true);
    setFormError(null);
    const { data: saved, error } = editingId
      ? await supabase.from("agregados").update(payload).eq("id", editingId).select("id").single()
      : await supabase.from("agregados").insert(payload).select("id").single();
    if (error || !saved) {
      setSaving(false);
      return fail(
        error?.code === "23505"
          ? "Já existe um agregado com esse CPF/CNPJ."
          : `Não foi possível salvar (${error?.message ?? "sem retorno"}).`
      );
    }

    // Placas: liga as marcadas e solta as que deixaram de ser deste agregado.
    const before = (platesByAgregado.get(saved.id) ?? []).map((p) => p.id);
    const toLink = form.plateIds.filter((id) => !before.includes(id));
    const toUnlink = before.filter((id) => !form.plateIds.includes(id));
    const plateErrors = await Promise.all([
      toLink.length
        ? supabase.from("fleet_units").update({ agregado_id: saved.id }).in("id", toLink)
        : Promise.resolve({ error: null }),
      toUnlink.length
        ? supabase.from("fleet_units").update({ agregado_id: null }).in("id", toUnlink)
        : Promise.resolve({ error: null }),
    ]);
    setSaving(false);
    const plateError = plateErrors.find((r) => r.error)?.error;
    if (plateError) toastError(`Agregado salvo, mas as placas não (${plateError.message}).`);
    else toastSuccess(editingId ? "Agregado atualizado." : "Agregado cadastrado.");
    closeForm();
    await loadAll();
  }

  async function handleDelete(a: Agregado) {
    if (!(await askConfirm(`Excluir o agregado "${a.name}"? As placas dele voltam a contar como frota própria.`)))
      return;
    const { error } = await supabase.from("agregados").delete().eq("id", a.id);
    if (error) {
      toastError(`Não foi possível excluir (${error.message}).`);
      return;
    }
    toastSuccess("Agregado excluído.");
    await loadAll();
  }

  function togglePlate(id: string) {
    setForm((f) => ({
      ...f,
      plateIds: f.plateIds.includes(id) ? f.plateIds.filter((x) => x !== id) : [...f.plateIds, id],
    }));
  }

  // Placas livres + as que já são deste agregado (uma placa tem um dono só).
  const selectablePlates = plates.filter((p) => !p.agregado_id || p.agregado_id === editingId);

  const columns: Column<Agregado>[] = [
    {
      key: "name",
      header: "Agregado",
      mobile: "title",
      cell: (a) => (
        <span className="font-medium text-navy-900">
          {a.name}
          {!a.active && (
            <span className="ml-2 rounded-full bg-navy-100 px-2 py-0.5 text-[11px] font-medium text-navy-600">
              Inativo
            </span>
          )}
        </span>
      ),
    },
    {
      key: "document",
      header: "CPF / CNPJ",
      mobile: "subtitle",
      cell: (a) => formatDocument(a.person_type, a.document),
    },
    { key: "rntrc", header: "RNTRC", mobile: "field", cell: (a) => a.rntrc || "—" },
    {
      key: "plates",
      header: "Placas",
      mobile: "field",
      cell: (a) => (platesByAgregado.get(a.id) ?? []).map((p) => p.plate).join(", ") || "—",
    },
    {
      key: "driver",
      header: "Motorista",
      mobile: "field",
      cell: (a) => drivers.find((d) => d.id === a.driver_id)?.name ?? "—",
    },
    {
      key: "ciot",
      header: "CIOT",
      mobile: "badge",
      cell: (a) => (
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
          {a.ciot_mode === "viagem" ? "Por viagem" : "Mensal por veículo"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Ações",
      mobile: "actions",
      cell: (a) => (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => openEdit(a)} className={buttonClasses("soft", "sm")}>
            Editar
          </button>
          <button type="button" onClick={() => handleDelete(a)} className={buttonClasses("danger", "sm")}>
            Excluir
          </button>
        </div>
      ),
    },
  ];

  if (!authLoading && !canEditSchedule) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
        <VehiclesTabs active="/vehicles/agregados" />
        <p className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
          Acesso restrito à Logística e à administração.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Veículos</h1>
          <p className="mt-1 text-sm text-navy-500">
            Agregados (contratados do CIOT), com as placas e o motorista de cada um.
          </p>
        </div>
        <button type="button" onClick={openNew} className={buttonClasses("primary", "md")}>
          Novo agregado
        </button>
      </div>

      <VehiclesTabs active="/vehicles/agregados" />

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls}
          placeholder="Buscar por nome, CPF/CNPJ ou placa..."
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        {agregados === null ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">Carregando...</div>
        ) : listError ? (
          <div className="px-6 py-10 text-center text-sm text-red-600">Erro ao carregar: {listError}</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">
            {agregados.length === 0 ? "Nenhum agregado cadastrado ainda." : "Nenhum agregado encontrado."}
          </div>
        ) : (
          <DataTable rows={filtered} columns={columns} rowKey={(a) => a.id} />
        )}
      </div>

      {showForm && (
        <Modal onClose={closeForm} labelledBy="agregado-modal-title" className="max-w-3xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <h2 id="agregado-modal-title" className="text-base font-medium text-navy-900">
              {editingId ? "Editar agregado" : "Novo agregado"}
            </h2>

            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-6">
                <label className={labelCls} htmlFor="ag-motorista">Motorista que roda com ele</label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchSelect
                      id="ag-motorista"
                      value={form.driver}
                      onChange={(v) => set("driver", v)}
                      options={driverOptions}
                      placeholder="Buscar motorista cadastrado..."
                      className={inputCls}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={copyFromDriver}
                    disabled={!drivers.some((d) => driverLabel(d) === form.driver)}
                    className={buttonClasses("secondary", "md")}
                  >
                    É o próprio agregado
                  </button>
                </div>
                <p className="mt-1 text-xs text-navy-500">
                  Se o agregado dirige o próprio caminhão, o botão copia nome e CPF do motorista.
                </p>
              </div>

              <div className="col-span-6 sm:col-span-2">
                <span className={labelCls}>Pessoa</span>
                <div className="flex gap-1">
                  {(["pf", "pj"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, person_type: t, document: formatDocument(t, f.document) }))}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                        form.person_type === t
                          ? "border-brand-600 bg-brand-50 text-brand-700"
                          : "border-navy-300 text-navy-600 hover:bg-navy-50"
                      }`}
                    >
                      {t === "pf" ? "Física (CPF)" : "Jurídica (CNPJ)"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-6 sm:col-span-4">
                <label className={labelCls} htmlFor="ag-doc">
                  {form.person_type === "pf" ? "CPF" : "CNPJ"} <span className="text-red-500">*</span>
                </label>
                <input
                  id="ag-doc"
                  inputMode="numeric"
                  className={inputCls}
                  value={form.document}
                  onChange={(e) => set("document", formatDocument(form.person_type, e.target.value))}
                  placeholder={form.person_type === "pf" ? "000.000.000-00" : "00.000.000/0000-00"}
                />
              </div>
              <div className="col-span-6">
                <label className={labelCls} htmlFor="ag-nome">
                  Nome ou razão social <span className="text-red-500">*</span>
                </label>
                <input id="ag-nome" className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <label className={labelCls} htmlFor="ag-rntrc">RNTRC</label>
                <input
                  id="ag-rntrc"
                  inputMode="numeric"
                  className={inputCls}
                  value={form.rntrc}
                  onChange={(e) => set("rntrc", onlyDigits(e.target.value).slice(0, 9))}
                />
              </div>
              <div className="col-span-3 sm:col-span-2">
                <label className={labelCls} htmlFor="ag-dep">Dependentes (IRRF)</label>
                <input
                  id="ag-dep"
                  inputMode="numeric"
                  className={inputCls}
                  value={form.dependents}
                  onChange={(e) => set("dependents", onlyDigits(e.target.value).slice(0, 2))}
                />
              </div>
              <div className="col-span-6 sm:col-span-2">
                <label className={labelCls} htmlFor="ag-email">E-mail</label>
                <input id="ag-email" type="email" className={inputCls} value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="col-span-3">
                <label className={labelCls} htmlFor="ag-cel">Celular</label>
                <input
                  id="ag-cel"
                  inputMode="tel"
                  className={inputCls}
                  value={form.mobile_phone}
                  onChange={(e) => set("mobile_phone", formatPhone(e.target.value))}
                  placeholder="(41) 99999-9999"
                />
              </div>
              <div className="col-span-3">
                <label className={labelCls} htmlFor="ag-tel">Telefone comercial/residencial</label>
                <input
                  id="ag-tel"
                  inputMode="tel"
                  className={inputCls}
                  value={form.other_phone}
                  onChange={(e) => set("other_phone", formatPhone(e.target.value))}
                  placeholder="(41) 3333-3333"
                />
              </div>
            </div>

            <h3 className={sectionCls}>Endereço</h3>
            <PostalAddressFields
              idPrefix="ag-end"
              value={form.address}
              onChange={(address) => set("address", address)}
              cityOptions={cityOptions}
            />

            <h3 className={sectionCls}>Pagamento do frete</h3>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-6">
                <div className="flex flex-wrap gap-4 text-sm text-navy-700">
                  {([
                    ["", "Não informar"],
                    ["conta", "Conta bancária"],
                    ["pix", "Chave PIX"],
                  ] as const).map(([v, l]) => (
                    <label key={v} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="ag-pagto"
                        checked={form.payment_method === v}
                        onChange={() => set("payment_method", v)}
                      />
                      {l}
                    </label>
                  ))}
                </div>
              </div>
              {form.payment_method === "conta" && (
                <>
                  <div className="col-span-6 sm:col-span-2">
                    <label className={labelCls} htmlFor="ag-banco">Banco (código)</label>
                    <input
                      id="ag-banco"
                      inputMode="numeric"
                      className={inputCls}
                      value={form.bank_code}
                      onChange={(e) => set("bank_code", onlyDigits(e.target.value).slice(0, 3))}
                      placeholder="Ex: 001"
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <label className={labelCls} htmlFor="ag-agencia">Agência</label>
                    <input id="ag-agencia" className={inputCls} value={form.bank_agency} onChange={(e) => set("bank_agency", e.target.value)} />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <label className={labelCls} htmlFor="ag-conta">Conta</label>
                    <input id="ag-conta" className={inputCls} value={form.bank_account} onChange={(e) => set("bank_account", e.target.value)} />
                  </div>
                  <div className="col-span-6 sm:col-span-1">
                    <label className={labelCls} htmlFor="ag-tipo-conta">Tipo</label>
                    <select
                      id="ag-tipo-conta"
                      className={inputCls}
                      value={form.bank_account_type}
                      onChange={(e) => set("bank_account_type", e.target.value as BankAccountType | "")}
                    >
                      <option value="">—</option>
                      <option value="corrente">Corrente</option>
                      <option value="poupanca">Poupança</option>
                    </select>
                  </div>
                </>
              )}
              {form.payment_method === "pix" && (
                <>
                  <div className="col-span-6 sm:col-span-2">
                    <label className={labelCls} htmlFor="ag-pix-tipo">Tipo de chave</label>
                    <select
                      id="ag-pix-tipo"
                      className={inputCls}
                      value={form.pix_key_type}
                      onChange={(e) => set("pix_key_type", e.target.value as PixKeyType | "")}
                    >
                      <option value="">—</option>
                      {(Object.keys(PIX_KEY_LABEL) as PixKeyType[]).map((k) => (
                        <option key={k} value={k}>{PIX_KEY_LABEL[k]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <label className={labelCls} htmlFor="ag-pix">Chave PIX</label>
                    <input id="ag-pix" className={inputCls} value={form.pix_key} onChange={(e) => set("pix_key", e.target.value)} />
                  </div>
                </>
              )}
            </div>

            <h3 className={sectionCls}>CIOT</h3>
            <div className="grid grid-cols-6 gap-3">
              <div className="col-span-6 sm:col-span-3">
                <label className={labelCls} htmlFor="ag-modo">Como emitir</label>
                <select
                  id="ag-modo"
                  className={inputCls}
                  value={form.ciot_mode}
                  onChange={(e) => set("ciot_mode", e.target.value as CiotMode)}
                >
                  {(Object.keys(CIOT_MODE_LABEL) as CiotMode[]).map((m) => (
                    <option key={m} value={m}>{CIOT_MODE_LABEL[m]}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-6 sm:col-span-3">
                <label className={labelCls} htmlFor="ag-dest">Destinatário padrão</label>
                <SearchSelect
                  id="ag-dest"
                  value={form.recipient_client}
                  onChange={(v) => set("recipient_client", v)}
                  options={clientOptions}
                  placeholder="Cliente (ex: Arauco)"
                  className={inputCls}
                />
                <p className="mt-1 text-xs text-navy-500">O tomador é sempre a Transbochnia.</p>
              </div>
              <div className="col-span-6">
                <span className={labelCls}>Placas do agregado</span>
                {selectablePlates.length === 0 ? (
                  <p className="text-sm text-navy-500">
                    Nenhuma placa livre. Cadastre as placas na aba Frota primeiro.
                  </p>
                ) : (
                  <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                    {selectablePlates.map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                          form.plateIds.includes(p.id)
                            ? "border-brand-600 bg-brand-50 text-brand-800"
                            : "border-navy-200 text-navy-700"
                        }`}
                      >
                        <input type="checkbox" checked={form.plateIds.includes(p.id)} onChange={() => togglePlate(p.id)} />
                        <span className="font-medium tracking-wide">{p.plate}</span>
                        <span className="text-xs text-navy-500">{KIND_LABEL[p.kind] ?? p.kind}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="col-span-6">
                <label className={labelCls} htmlFor="ag-obs">Observações</label>
                <textarea id="ag-obs" rows={2} className={inputCls} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>
              <label className="col-span-6 flex items-center gap-2 text-sm text-navy-700">
                <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
                Ativo (aparece na tela de CIOT)
              </label>
            </div>

            {formError && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
            )}

            <div className="flex gap-3">
              <button type="submit" disabled={saving} className={`flex-1 ${buttonClasses("primary", "md")}`}>
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar agregado"}
              </button>
              <button type="button" onClick={closeForm} className={buttonClasses("secondary", "md")}>
                Cancelar
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
