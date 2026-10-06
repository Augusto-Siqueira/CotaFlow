"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { VehiclesTabs } from "@/components/VehiclesTabs";
import { defaultNickname, formatCpf, isValidCpf, onlyDigits } from "@/lib/cpf";
import { useFeedback } from "@/components/Feedback";

interface Driver {
  id: string;
  name: string;
  nickname: string | null;
  cpf: string;
}

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function DriversPage() {
  const { canEditSchedule } = useAuth();
  const { confirm: askConfirm } = useFeedback();
  const [drivers, setDrivers] = useState<Driver[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [cpf, setCpf] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadDrivers() {
    const { data, error } = await supabase
      .from("drivers")
      .select("id, name, nickname, cpf")
      .order("name");
    if (error) {
      setListError(error.message);
      setDrivers([]);
      return;
    }
    setListError(null);
    setDrivers((data as Driver[]) ?? []);
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadDrivers();
    });
  }, []);

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
  }

  useEffect(() => {
    if (!showForm) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeForm();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showForm]);

  function openNew() {
    setEditingId(null);
    setName("");
    setNickname("");
    setCpf("");
    setFormError(null);
    setSuccessMessage(null);
    setShowForm(true);
  }

  function openEdit(d: Driver) {
    setEditingId(d.id);
    setName(d.name);
    setNickname(d.nickname ?? "");
    setCpf(formatCpf(d.cpf));
    setFormError(null);
    setSuccessMessage(null);
    setShowForm(true);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = onlyDigits(search);
    return (drivers ?? []).filter(
      (d) =>
        !q ||
        d.name.toLowerCase().includes(q) ||
        (d.nickname ?? "").toLowerCase().includes(q) ||
        (qDigits && d.cpf.includes(qDigits))
    );
  }, [drivers, search]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Informe o nome do motorista.");
      return;
    }
    if (!isValidCpf(cpf)) {
      setFormError("CPF inválido. Confira os 11 dígitos.");
      return;
    }

    const payload = {
      name: name.trim(),
      nickname: nickname.trim() || defaultNickname(name),
      cpf: onlyDigits(cpf),
    };
    setSaving(true);
    setFormError(null);
    const { error } = editingId
      ? await supabase.from("drivers").update(payload).eq("id", editingId)
      : await supabase.from("drivers").insert(payload);
    setSaving(false);

    if (error) {
      setFormError(
        error.code === "23505"
          ? "Já existe um motorista com esse CPF."
          : `Não foi possível salvar (${error.message}).`
      );
      return;
    }

    setSuccessMessage(
      editingId ? "Motorista atualizado com sucesso." : "Motorista cadastrado com sucesso."
    );
    closeForm();
    await loadDrivers();
  }

  async function handleDelete(d: Driver) {
    if (!await askConfirm(`Excluir o motorista "${d.name}"?`)) return;
    setActionError(null);
    const { error } = await supabase.from("drivers").delete().eq("id", d.id);
    if (error) {
      setActionError(`Não foi possível excluir (${error.message}).`);
      return;
    }
    await loadDrivers();
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
            Veículos
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Motoristas da operação, com nome e CPF.
          </p>
        </div>
        {canEditSchedule && (
          <button
            type="button"
            onClick={openNew}
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            Novo motorista
          </button>
        )}
      </div>

      <VehiclesTabs active="/vehicles/motoristas" />

      {successMessage && (
        <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
          {successMessage}
        </div>
      )}
      {actionError && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={inputCls}
          placeholder="Buscar por nome, apelido ou CPF..."
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-navy-200 px-6 py-4">
          <h2 className="text-base font-medium text-navy-900">
            Motoristas cadastrados
          </h2>
          <span className="text-sm text-navy-500">
            {filtered.length} {filtered.length === 1 ? "motorista" : "motoristas"}
          </span>
        </div>

        {drivers === null ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">
            Carregando...
          </div>
        ) : listError ? (
          <div className="px-6 py-10 text-center text-sm text-red-600">
            Erro ao carregar: {listError}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">
            {drivers.length === 0
              ? "Nenhum motorista cadastrado ainda."
              : "Nenhum motorista encontrado."}
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-navy-50 text-xs uppercase tracking-wide text-navy-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Apelido</th>
                  <th className="px-6 py-3 font-medium">Nome</th>
                  <th className="px-6 py-3 font-medium">CPF</th>
                  {canEditSchedule && (
                    <th className="px-6 py-3 font-medium">Ações</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {filtered.map((d) => (
                  <tr key={d.id} className="hover:bg-navy-50">
                    <td className="px-6 py-3 font-medium text-navy-900">
                      {d.nickname || "—"}
                    </td>
                    <td className="px-6 py-3 text-navy-700">{d.name}</td>
                    <td className="px-6 py-3 text-navy-600">
                      {formatCpf(d.cpf)}
                    </td>
                    {canEditSchedule && (
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openEdit(d)}
                            className="font-medium text-brand-700 underline hover:text-brand-800"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(d)}
                            className="font-medium text-red-600 hover:text-red-800"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canEditSchedule && showForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4 sm:items-center"
          onClick={closeForm}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-base font-medium text-navy-900">
              {editingId ? "Editar motorista" : "Novo motorista"}
            </h2>

            <div className="mt-5 flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  placeholder="Nome completo"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Apelido
                </label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className={inputCls}
                  placeholder={name.trim() ? defaultNickname(name) : "Dois primeiros nomes"}
                />
                <p className="mt-1 text-xs text-navy-500">
                  É o nome que aparece ao escolher o motorista na programação.
                  Em branco, usa os dois primeiros nomes.
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  CPF <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cpf}
                  onChange={(e) => setCpf(formatCpf(e.target.value))}
                  className={inputCls}
                  placeholder="000.000.000-00"
                />
              </div>

              {formError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar motorista"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
