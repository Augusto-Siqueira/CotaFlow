"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AdminGate } from "@/components/AdminGate";
import { formatDate, formatDateOnly } from "@/lib/format";

interface Proposal {
  id: string;
  title: string;
  client_name: string | null;
  token: string;
  active: boolean;
  expires_at: string | null;
  view_count: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  created_at: string;
}

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusOf(p: Proposal): { label: string; cls: string } {
  if (!p.active) return { label: "Desativada", cls: "bg-navy-100 text-navy-700" };
  if (p.expires_at && p.expires_at < todayIso()) {
    return { label: "Expirada", cls: "bg-amber-100 text-amber-800" };
  }
  return { label: "Ativa", cls: "bg-brand-100 text-brand-800" };
}

function publicLink(token: string): string {
  return `${window.location.origin}/proposta/${token}`;
}

function ProposalsManager() {
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [html, setHtml] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadProposals() {
    const { data, error } = await supabase
      .from("proposals")
      .select(
        "id, title, client_name, token, active, expires_at, view_count, first_viewed_at, last_viewed_at, created_at"
      )
      .order("created_at", { ascending: false });
    if (error) {
      setListError(error.message);
      setProposals([]);
      return;
    }
    setListError(null);
    setProposals((data as Proposal[]) ?? []);
  }

  useEffect(() => {
    queueMicrotask(() => {
      loadProposals();
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
    setTitle("");
    setClientName("");
    setExpiresAt("");
    setHtml("");
    setFormError(null);
    setMessage(null);
    setShowForm(true);
  }

  async function openEdit(p: Proposal) {
    setMessage(null);
    const { data, error } = await supabase
      .from("proposals")
      .select("html")
      .eq("id", p.id)
      .single();
    if (error || !data) {
      setMessage(`Não foi possível abrir a proposta (${error?.message ?? "erro"}).`);
      return;
    }
    setEditingId(p.id);
    setTitle(p.title);
    setClientName(p.client_name ?? "");
    setExpiresAt(p.expires_at ?? "");
    setHtml(data.html);
    setFormError(null);
    setShowForm(true);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setHtml(await file.text());
    if (!title.trim()) setTitle(file.name.replace(/\.html?$/i, ""));
    e.target.value = "";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setFormError("Informe o título da proposta.");
      return;
    }
    if (!html.trim()) {
      setFormError("Cole o HTML da proposta ou escolha o arquivo.");
      return;
    }

    const payload = {
      title: title.trim(),
      client_name: clientName.trim() || null,
      expires_at: expiresAt || null,
      html,
    };
    setSaving(true);
    setFormError(null);
    const { error } = editingId
      ? await supabase.from("proposals").update(payload).eq("id", editingId)
      : await supabase.from("proposals").insert(payload);
    setSaving(false);

    if (error) {
      setFormError(`Não foi possível salvar (${error.message}).`);
      return;
    }
    setMessage(editingId ? "Proposta atualizada." : "Proposta cadastrada. Copie o link para enviar ao cliente.");
    closeForm();
    await loadProposals();
  }

  async function copyLink(p: Proposal) {
    const url = publicLink(p.token);
    try {
      await navigator.clipboard.writeText(url);
      setMessage(`Link copiado: ${url}`);
    } catch {
      window.prompt("Copie o link da proposta:", url);
    }
  }

  async function toggleActive(p: Proposal) {
    const { error } = await supabase
      .from("proposals")
      .update({ active: !p.active })
      .eq("id", p.id);
    if (error) {
      setMessage(`Não foi possível alterar (${error.message}).`);
      return;
    }
    await loadProposals();
  }

  async function handleDelete(p: Proposal) {
    if (
      !confirm(
        `Excluir a proposta "${p.title}"? O link enviado ao cliente deixa de funcionar.`
      )
    ) {
      return;
    }
    const { error } = await supabase.from("proposals").delete().eq("id", p.id);
    if (error) {
      setMessage(`Não foi possível excluir (${error.message}).`);
      return;
    }
    await loadProposals();
  }

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
            Propostas Comerciais
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Guarde as propostas e envie ao cliente um link só de leitura, sem
            precisar de login.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Nova proposta
        </button>
      </div>

      {message && (
        <div className="mb-4 break-all rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
          {message}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        {proposals === null ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">
            Carregando...
          </div>
        ) : listError ? (
          <div className="px-6 py-10 text-center text-sm text-red-600">
            Erro ao carregar: {listError}
          </div>
        ) : proposals.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">
            Nenhuma proposta cadastrada ainda.
          </div>
        ) : (
          <ul className="divide-y divide-navy-100">
            {proposals.map((p) => {
              const st = statusOf(p);
              return (
                <li key={p.id} className="px-6 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-navy-900">
                          {p.title}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}
                        >
                          {st.label}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-navy-500">
                        {p.client_name ? `${p.client_name} · ` : ""}
                        Criada em {formatDate(p.created_at)}
                        {p.expires_at
                          ? ` · Válida até ${formatDateOnly(p.expires_at)}`
                          : ""}
                      </div>
                      <div
                        className={`mt-1 text-xs ${
                          p.view_count > 0 ? "text-brand-700" : "text-navy-400"
                        }`}
                      >
                        {p.view_count > 0
                          ? `Visualizada ${p.view_count} ${p.view_count === 1 ? "vez" : "vezes"} · primeira em ${dateTime(p.first_viewed_at!)} · última em ${dateTime(p.last_viewed_at!)}`
                          : "Ainda não aberta pelo cliente"}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <button
                        type="button"
                        onClick={() => copyLink(p)}
                        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                      >
                        Copiar link
                      </button>
                      <Link
                        href={`/propostas/${p.id}`}
                        className="font-medium text-brand-700 underline hover:text-brand-800"
                      >
                        Visualizar
                      </Link>
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="font-medium text-brand-700 underline hover:text-brand-800"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(p)}
                        className="font-medium text-navy-600 underline hover:text-navy-800"
                      >
                        {p.active ? "Desativar link" : "Reativar link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(p)}
                        className="font-medium text-red-600 hover:text-red-800"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4 sm:items-center"
          onClick={closeForm}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-base font-medium text-navy-900">
              {editingId ? "Editar proposta" : "Nova proposta"}
            </h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Título <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={inputCls}
                  placeholder="Ex: Proposta de transporte — Empresa X"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Cliente <span className="text-navy-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  className={inputCls}
                  placeholder="Nome do cliente ou prospect"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-navy-700">
                  Link válido até <span className="text-navy-400">(opcional)</span>
                </label>
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-sm font-medium text-navy-700">
                    HTML da proposta <span className="text-red-500">*</span>
                  </label>
                  <label className="cursor-pointer text-xs font-medium text-brand-700 underline hover:text-brand-800">
                    Escolher arquivo .html
                    <input
                      type="file"
                      accept=".html,.htm,text/html"
                      onChange={handleFile}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  rows={10}
                  className={`${inputCls} font-mono text-xs`}
                  placeholder="Cole aqui o HTML gerado, ou escolha o arquivo acima."
                />
                {html && (
                  <p className="mt-1 text-xs text-navy-500">
                    {(html.length / 1024).toFixed(0)} KB de conteúdo.
                  </p>
                )}
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
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar proposta"}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default function ProposalsPage() {
  return (
    <AdminGate>
      <ProposalsManager />
    </AdminGate>
  );
}
