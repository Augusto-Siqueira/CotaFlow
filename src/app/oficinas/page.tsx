"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";

interface Workshop {
  id: string;
  name: string;
}

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

// Cadastro das oficinas usadas nos lançamentos da Manutenção. Quem edita a
// Manutenção cadastra e exclui; os demais só consultam.
export default function OficinasPage() {
  const { canEditMaintenance } = useAuth();
  const { toastError, confirm: askConfirm } = useFeedback();
  const [workshops, setWorkshops] = useState<Workshop[] | null>(null);
  const [newName, setNewName] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    const { data, error } = await supabase.from("maintenance_workshops").select("id, name").order("name");
    if (error) toastError(`Não foi possível carregar as oficinas (${error.message}).`);
    setWorkshops((data as Workshop[] | null) ?? []);
  }

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add() {
    const name = newName.trim();
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
    setNewName("");
    await load();
  }

  async function remove(w: Workshop) {
    if (!(await askConfirm(`Excluir a oficina ${w.name}?`))) return;
    const { error } = await supabase.from("maintenance_workshops").delete().eq("id", w.id);
    if (error) {
      toastError(
        /foreign key|violates/i.test(error.message)
          ? "Essa oficina tem manutenções lançadas e não pode ser excluída."
          : `Não foi possível excluir (${error.message}).`
      );
      return;
    }
    await load();
  }

  const q = search.trim().toLowerCase();
  const list = (workshops ?? []).filter((w) => !q || w.name.toLowerCase().includes(q));

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Oficinas</h1>
      <p className="mt-1 text-sm text-navy-500">Oficinas usadas nos lançamentos da Manutenção.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {canEditMaintenance && (
          <section className="h-fit rounded-xl border border-navy-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-navy-900">Nova oficina</h2>
            <label htmlFor="of-nome" className="sr-only">
              Nome da nova oficina
            </label>
            <input
              id="of-nome"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              placeholder="Nome da oficina"
              className={`${inputCls} mt-3`}
            />
            <button
              type="button"
              onClick={add}
              disabled={!newName.trim()}
              className={`${buttonClasses("primary")} mt-3 w-full`}
            >
              Adicionar
            </button>
          </section>
        )}

        <section
          className={`min-w-0 rounded-xl border border-navy-200 bg-white shadow-sm ${
            canEditMaintenance ? "lg:col-span-2" : "lg:col-span-3"
          }`}
        >
          <div className="flex items-center justify-between gap-3 border-b border-navy-200 px-5 py-3">
            <h2 className="text-sm font-medium text-navy-900">Oficinas cadastradas</h2>
            <span className="text-xs text-navy-500">{workshops?.length ?? 0} oficina(s)</span>
          </div>
          <div className="px-5 pt-3">
            <label htmlFor="of-busca" className="sr-only">
              Buscar oficina
            </label>
            <input
              id="of-busca"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar oficina"
              className={inputCls}
            />
          </div>
          <ul className="max-h-[60vh] divide-y divide-navy-100 overflow-y-auto px-5 py-2">
            {workshops === null ? (
              <li className="py-3 text-sm text-navy-500">Carregando...</li>
            ) : list.length === 0 ? (
              <li className="py-3 text-sm text-navy-500">
                {workshops.length === 0 ? "Nenhuma oficina cadastrada." : "Nenhuma oficina encontrada."}
              </li>
            ) : (
              list.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-navy-900">{w.name}</span>
                  {canEditMaintenance && (
                    <button type="button" onClick={() => remove(w)} className={buttonClasses("danger", "sm")}>
                      Excluir
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
