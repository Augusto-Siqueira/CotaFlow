"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { roleLabel, STAFF_ROLES } from "@/lib/roles";
import { DataTable, type Column } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
  must_change_password: boolean;
}

const DRIVER_DOMAIN = "@motorista.transbochnia.com.br";
const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

function fmtDate(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "nunca";
}

function loginLabel(u: UserRow): string {
  if (!u.email.endsWith(DRIVER_DOMAIN)) return u.email;
  const cpf = u.email.slice(0, 11);
  return `CPF ${cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")}`;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `Erro ${r.status}`);
  return body as T;
}

export default function UsuariosPage() {
  const { isAdmin, loading: authLoading, user } = useAuth();
  const { toastSuccess, toastError, confirm: askConfirm } = useFeedback();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"equipe" | "motoristas">("equipe");
  const [search, setSearch] = useState("");

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<string>("logistica");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Senha temporária mostrada UMA vez, logo depois de criar ou redefinir.
  const [renameFor, setRenameFor] = useState<UserRow | null>(null);
  const [renameText, setRenameText] = useState("");
  const [shownPassword, setShownPassword] = useState<{ who: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ users: UserRow[] }>("/api/admin/users");
      setUsers(data.users);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "erro");
      setUsers([]);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    queueMicrotask(() => {
      load();
    });
  }, [isAdmin, load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (users ?? [])
      .filter((u) => (tab === "motoristas") === u.email.endsWith(DRIVER_DOMAIN))
      .filter(
        (u) =>
          !q ||
          u.email.toLowerCase().includes(q) ||
          (u.name ?? "").toLowerCase().includes(q) ||
          roleLabel(u.role).toLowerCase().includes(q)
      )
      .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, "pt-BR"));
  }, [users, tab, search]);

  async function act(u: UserRow, body: Record<string, unknown>, okMsg: string) {
    try {
      const r = await api<{ password?: string | null; driver?: boolean }>(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (r.password) setShownPassword({ who: u.name ?? u.email, password: r.password });
      toastSuccess(okMsg);
      await load();
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Não foi possível concluir.");
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const r = await api<{ password: string }>("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ name: newName, email: newEmail, role: newRole }),
      });
      setShowNew(false);
      setShownPassword({ who: newName, password: r.password });
      setNewName("");
      setNewEmail("");
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível criar.");
    }
    setSaving(false);
  }

  if (authLoading) return null;
  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-navy-900">Acesso restrito</h1>
        <p className="mt-2 text-sm text-navy-500">Só o admin administra os usuários.</p>
      </div>
    );
  }

  const columns: Column<UserRow>[] = [
    {
      key: "name",
      header: "Nome",
      mobile: "title",
      cell: (u) => (
        <span className="font-medium text-navy-900">
          {u.name ?? "—"}
          {u.id === user?.id && <span className="ml-1 text-xs font-normal text-navy-500">(você)</span>}
        </span>
      ),
    },
    { key: "login", header: "Login", mobile: "subtitle", cell: (u) => loginLabel(u) },
    {
      key: "role",
      header: "Perfil",
      mobile: "field",
      cell: (u) =>
        tab === "motoristas" ? (
          "Motorista"
        ) : (
          <select
            aria-label={`Perfil de ${u.name ?? u.email}`}
            value={u.role ?? ""}
            disabled={u.id === user?.id}
            title={u.id === user?.id ? "Você não pode mudar o seu próprio perfil" : undefined}
            onChange={async (e) => {
              const role = e.target.value;
              if (!(await askConfirm(`Mudar o perfil de ${u.name ?? u.email} para ${roleLabel(role)}?`, { confirmLabel: "Mudar" }))) return;
              act(u, { action: "role", role }, "Perfil alterado. Vale no próximo login da pessoa.");
            }}
            className="rounded-lg border border-navy-300 bg-white px-2 py-1 text-sm text-navy-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {!u.role && <option value="">Sem perfil</option>}
            {STAFF_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        ),
    },
    {
      key: "status",
      header: "Situação",
      mobile: "badge",
      cell: (u) =>
        u.banned ? (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800">Bloqueado</span>
        ) : u.must_change_password ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">Aguardando 1º acesso</span>
        ) : (
          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-medium text-teal-800">Ativo</span>
        ),
    },
    { key: "last", header: "Último acesso", mobile: "field", cell: (u) => fmtDate(u.last_sign_in_at) },
    {
      key: "actions",
      header: "",
      mobile: "actions",
      cell: (u) => (
        <span className="flex flex-wrap gap-2">
          {tab === "equipe" && (
            <button
              type="button"
              onClick={() => {
                setRenameFor(u);
                setRenameText(u.name ?? "");
              }}
              className={buttonClasses("soft", "sm")}
            >
              Editar nome
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              const msg =
                tab === "motoristas"
                  ? `Voltar a senha de ${u.name ?? u.email} para os 6 primeiros dígitos do CPF?`
                  : `Gerar uma senha temporária nova para ${u.name ?? u.email}? A senha atual deixa de valer.`;
              if (await askConfirm(msg, { confirmLabel: "Redefinir" })) {
                act(u, { action: "reset_password" }, tab === "motoristas" ? "Senha voltou para os 6 primeiros dígitos do CPF." : "Senha redefinida.");
              }
            }}
            className={buttonClasses("secondary", "sm")}
          >
            Redefinir senha
          </button>
          {u.id !== user?.id &&
            (u.banned ? (
              <button
                type="button"
                onClick={() => act(u, { action: "unban" }, "Usuário desbloqueado.")}
                className={buttonClasses("secondary", "sm")}
              >
                Desbloquear
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  if (await askConfirm(`Bloquear ${u.name ?? u.email}? A pessoa não consegue mais entrar.`, { confirmLabel: "Bloquear" })) {
                    act(u, { action: "ban" }, "Usuário bloqueado.");
                  }
                }}
                className={buttonClasses("danger", "sm")}
              >
                Bloquear
              </button>
            ))}
        </span>
      ),
    },
  ];

  const counts = {
    equipe: (users ?? []).filter((u) => !u.email.endsWith(DRIVER_DOMAIN)).length,
    motoristas: (users ?? []).filter((u) => u.email.endsWith(DRIVER_DOMAIN)).length,
  };

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Usuários</h1>
          <p className="mt-1 text-sm text-navy-500">
            Cadastre a equipe, defina o perfil de cada um e bloqueie quem não deve mais entrar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setShowNew(true);
          }}
          className={buttonClasses("primary")}
        >
          Novo usuário
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div role="tablist" className="flex gap-1 rounded-lg border border-navy-200 bg-white p-1">
          {(["equipe", "motoristas"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === t ? "bg-brand-700 text-white" : "text-navy-700 hover:bg-navy-50"
              }`}
            >
              {t === "equipe" ? "Equipe" : "Motoristas"} ({counts[t]})
            </button>
          ))}
        </div>
        <label htmlFor="usr-busca" className="sr-only">
          Buscar
        </label>
        <input
          id="usr-busca"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, login ou perfil"
          className={`${inputCls} max-w-xs`}
        />
      </div>
      {tab === "motoristas" && (
        <p className="mt-2 text-xs text-navy-500">
          O acesso do motorista é criado em Veículos e motoristas › Motoristas (login = CPF, senha = 6 primeiros dígitos).
        </p>
      )}

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar os usuários ({error}).
        </div>
      )}

      <div className="mt-4">
        {users === null ? (
          <p className="text-sm text-navy-500">Carregando...</p>
        ) : (
          <DataTable rows={rows} columns={columns} rowKey={(u) => u.id} />
        )}
      </div>

      {showNew && (
        <Modal onClose={() => setShowNew(false)} labelledBy="new-user-title" className="max-w-md">
          <form onSubmit={createUser}>
            <h2 id="new-user-title" className="text-base font-medium text-navy-900">
              Novo usuário
            </h2>
            <label htmlFor="nu-name" className="mt-4 block text-sm font-medium text-navy-700">
              Nome
            </label>
            <input id="nu-name" value={newName} onChange={(e) => setNewName(e.target.value)} className={`${inputCls} mt-1`} />
            <label htmlFor="nu-email" className="mt-3 block text-sm font-medium text-navy-700">
              E-mail (é o login)
            </label>
            <input
              id="nu-email"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className={`${inputCls} mt-1`}
              autoComplete="off"
            />
            <span className="mt-3 block text-sm font-medium text-navy-700">Perfil</span>
            <div className="mt-1 space-y-1.5">
              {STAFF_ROLES.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-start gap-2 rounded-lg border border-navy-200 px-3 py-2 text-sm">
                  <input
                    type="radio"
                    name="nu-role"
                    value={r.value}
                    checked={newRole === r.value}
                    onChange={() => setNewRole(r.value)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium text-navy-900">{r.label}</span>
                    <span className="block text-xs text-navy-500">{r.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {formError && (
              <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowNew(false)} className={buttonClasses("secondary")}>
                Cancelar
              </button>
              <button type="submit" disabled={saving} className={buttonClasses("primary")}>
                {saving ? "Criando..." : "Criar usuário"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {renameFor && (
        <Modal onClose={() => setRenameFor(null)} labelledBy="rename-title" className="max-w-md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const u = renameFor;
              setRenameFor(null);
              if (renameText.trim() && renameText.trim() !== u.name) {
                act(u, { action: "name", name: renameText }, "Nome atualizado.");
              }
            }}
          >
            <h2 id="rename-title" className="text-base font-medium text-navy-900">
              Nome de {renameFor.email}
            </h2>
            <label htmlFor="rn-name" className="sr-only">
              Nome
            </label>
            <input
              id="rn-name"
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              className={`${inputCls} mt-3`}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRenameFor(null)} className={buttonClasses("secondary")}>
                Cancelar
              </button>
              <button type="submit" disabled={!renameText.trim()} className={buttonClasses("primary")}>
                Salvar
              </button>
            </div>
          </form>
        </Modal>
      )}

      {shownPassword && (
        <Modal onClose={() => setShownPassword(null)} labelledBy="pw-title" className="max-w-md" role="alertdialog">
          <h2 id="pw-title" className="text-base font-medium text-navy-900">
            Senha temporária de {shownPassword.who}
          </h2>
          <p className="mt-1 text-sm text-navy-500">
            Passe esta senha para a pessoa. Ela vai ser obrigada a criar uma senha própria no primeiro acesso.
            Esta senha não aparece de novo.
          </p>
          <p className="mt-4 rounded-lg bg-navy-50 px-4 py-3 text-center font-mono text-xl tracking-wider text-navy-900 select-all">
            {shownPassword.password}
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shownPassword.password);
                  toastSuccess("Senha copiada.");
                } catch {
                  toastError("Não foi possível copiar; selecione e copie manualmente.");
                }
              }}
              className={buttonClasses("secondary")}
            >
              Copiar
            </button>
            <button type="button" onClick={() => setShownPassword(null)} className={buttonClasses("primary")}>
              Pronto
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
