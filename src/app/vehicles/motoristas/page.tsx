"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { VehiclesTabs } from "@/components/VehiclesTabs";
import { defaultNickname, formatCpf, isValidCpf, onlyDigits } from "@/lib/cpf";
import { useFeedback } from "@/components/Feedback";
import { buttonClasses } from "@/components/Button";
import { Modal } from "@/components/Modal";

interface Driver {
  id: string;
  name: string;
  nickname: string | null;
  cpf: string;
  user_id: string | null;
}

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function DriversPage() {
  const { canEditSchedule } = useAuth();
  const [creatingAccess, setCreatingAccess] = useState<string | null>(null);

  // Rota do servidor que cuida do login do motorista no app.
  async function accessCall(id: string, method: "POST" | "PUT" | "DELETE"): Promise<string | null> {
    const r = await fetch(`/api/admin/drivers/${id}/access`, { method });
    if (r.ok) return null;
    const body = await r.json().catch(() => ({}));
    return body.error ?? `erro ${r.status}`;
  }

  // Cria o login do app (CPF + 6 primeiros dígitos do CPF) de quem ficou sem.
  async function createAccess(d: Driver) {
    if (!(await askConfirm(
      `Criar o acesso ao app para ${d.name}? Login: CPF. Senha: os 6 primeiros dígitos do CPF.`,
      { confirmLabel: "Criar acesso" }
    ))) return;
    setCreatingAccess(d.id);
    const err = await accessCall(d.id, "POST");
    setCreatingAccess(null);
    if (err) {
      setActionError(`Não foi possível criar o acesso (${err}).`);
      return;
    }
    setActionError(null);
    setSuccessMessage(`Acesso ao app criado para ${d.name}.`);
    loadDrivers();
  }
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
      .select("id, name, nickname, cpf, user_id")
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
    const before = editingId ? (drivers ?? []).find((d) => d.id === editingId) : null;
    const { data: saved, error } = editingId
      ? await supabase.from("drivers").update(payload).eq("id", editingId).select("id").single()
      : await supabase.from("drivers").insert(payload).select("id").single();

    if (error || !saved) {
      setSaving(false);
      setFormError(
        error?.code === "23505"
          ? "Já existe um motorista com esse CPF."
          : `Não foi possível salvar (${error?.message ?? "sem retorno"}).`
      );
      return;
    }

    // O acesso ao app acompanha o cadastro: nasce junto e segue a troca de CPF.
    let accessMsg = "";
    let accessErr: string | null = null;
    if (!editingId) {
      accessErr = await accessCall(saved.id, "POST");
      accessMsg = " Acesso ao app criado: login é o CPF e a senha são os 6 primeiros dígitos.";
    } else if (before?.user_id && before.cpf !== payload.cpf) {
      accessErr = await accessCall(saved.id, "PUT");
      accessMsg = " O login do app passou a ser o CPF novo (senha: 6 primeiros dígitos).";
    }
    setSaving(false);

    setSuccessMessage(
      (editingId ? "Motorista atualizado com sucesso." : "Motorista cadastrado com sucesso.") +
        (accessErr ? "" : accessMsg)
    );
    setActionError(
      accessErr
        ? `O cadastro foi salvo, mas o acesso ao app não (${accessErr}). Use o botão Criar acesso na lista.`
        : null
    );
    closeForm();
    await loadDrivers();
  }

  async function handleDelete(d: Driver) {
    if (!await askConfirm(
      d.user_id
        ? `Excluir o motorista "${d.name}"? O acesso dele ao app será bloqueado.`
        : `Excluir o motorista "${d.name}"?`
    )) return;
    setActionError(null);
    if (d.user_id) {
      const err = await accessCall(d.id, "DELETE");
      if (err) {
        setActionError(`Não foi possível bloquear o acesso ao app (${err}). Nada foi excluído.`);
        return;
      }
    }
    const { error } = await supabase.from("drivers").delete().eq("id", d.id);
    if (error) {
      setActionError(`Não foi possível excluir (${error.message}).`);
      return;
    }
    await loadDrivers();
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
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
            className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-800"
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
                  <th className="px-6 py-3 font-medium">App</th>
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
                    <td className="px-6 py-3">
                      {d.user_id ? (
                        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-800">
                          Com acesso
                        </span>
                      ) : canEditSchedule ? (
                        <button
                          type="button"
                          onClick={() => createAccess(d)}
                          disabled={creatingAccess === d.id}
                          className={buttonClasses("soft", "sm")}
                        >
                          {creatingAccess === d.id ? "Criando..." : "Criar acesso"}
                        </button>
                      ) : (
                        <span className="text-xs text-navy-500">Sem acesso</span>
                      )}
                    </td>
                    {canEditSchedule && (
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => openEdit(d)}
                            className={buttonClasses("soft", "sm")}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(d)}
                            className={buttonClasses("danger", "sm")}
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
        <Modal onClose={closeForm} labelledBy="driver-modal-title" className="max-w-md">
          <form onSubmit={handleSubmit}>
            <h2 id="driver-modal-title" className="text-base font-medium text-navy-900">
              {editingId ? "Editar motorista" : "Novo motorista"}
            </h2>

            <div className="mt-5 flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="mot-nome">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input id="mot-nome"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                  placeholder="Nome completo"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="mot-apelido">
                  Apelido
                </label>
                <input id="mot-apelido"
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
                <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="mot-cpf">
                  CPF <span className="text-red-500">*</span>
                </label>
                <input id="mot-cpf"
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
                  className="flex-1 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar motorista"}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className={buttonClasses("secondary", "md")}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
