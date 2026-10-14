"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchTodayStatus, type TodayStatus } from "@/lib/checklists";

/**
 * Alerta dos motoristas que ainda não fizeram o check-list de hoje. Vale para
 * TODO motorista com acesso ao app, tenha ou não carga programada.
 * `compact` mostra só uma linha com link para a tela de check-lists.
 */
export function ChecklistTodayAlert({ compact = false }: { compact?: boolean }) {
  const [rows, setRows] = useState<TodayStatus[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTodayStatus().then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (rows === null) return null;
  const expected = rows.filter((r) => r.expected);
  const pending = expected.filter((r) => !r.done);
  const noApp = rows.filter((r) => !r.hasAccess);
  const done = expected.filter((r) => r.done).length;

  if (compact && pending.length === 0) return null;

  if (pending.length === 0) {
    return (
      <div className="rounded-xl border border-brand-300 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        {expected.length === 0
          ? "Nenhum motorista com acesso ao app esperado hoje."
          : `✓ Todos os motoristas já fizeram o check-list hoje (${done} de ${expected.length}).`}
        {noApp.length > 0 && (
          <span className="block text-xs text-navy-600">
            Sem acesso ao app: {noApp.map((r) => r.label).join(", ")}.
          </span>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div
        role="status"
        className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-800"
      >
        <span>
          ⚠ {pending.length} {pending.length === 1 ? "motorista" : "motoristas"} sem check-list
          hoje: <strong>{pending.map((r) => r.label).join(", ")}</strong>
        </span>
        <Link href="/manutencao/checklists" className="font-medium underline">
          Ver check-lists
        </Link>
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-medium">
        ⚠ {pending.length}{" "}
        {pending.length === 1
          ? "motorista ainda não fez o check-list de hoje"
          : "motoristas ainda não fizeram o check-list de hoje"}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {pending.map((r) => (
          <li
            key={r.label}
            className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700"
            title={r.hasLoad ? "Tem carga programada hoje" : "Sem carga hoje, mas o check-list é obrigatório"}
          >
            {r.hasLoad ? "🚛 " : ""}
            {r.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-navy-600">
        {done} de {expected.length} já fizeram hoje · 🚛 = tem carga programada hoje.
        {noApp.length > 0 && ` Sem acesso ao app: ${noApp.map((r) => r.label).join(", ")}.`}
      </p>
    </div>
  );
}
