"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchTodayStatus, type TodayStatus } from "@/lib/checklists";

/**
 * Alerta dos motoristas que têm carga hoje e ainda não fizeram o check-list.
 * `compact` mostra só uma linha com link para o dashboard.
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

  if (rows === null || rows.length === 0) return null;
  const pending = rows.filter((r) => r.hasAccess && !r.done);
  const noApp = rows.filter((r) => !r.hasAccess);
  const done = rows.filter((r) => r.done).length;

  if (pending.length === 0) {
    if (compact) return null;
    return (
      <div className="rounded-xl border border-brand-300 bg-brand-50 px-4 py-3 text-sm text-brand-800">
        ✓ Todos os motoristas com carga hoje e com acesso ao app já fizeram o check-list ({done} de{" "}
        {rows.length}).
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
          ⚠ {pending.length} {pending.length === 1 ? "motorista" : "motoristas"} com carga hoje sem
          check-list: <strong>{pending.map((r) => r.label).join(", ")}</strong>
        </span>
        <Link href="/manutencao/dashboard" className="font-medium underline">
          Ver no dashboard
        </Link>
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      <p className="font-medium">
        ⚠ {pending.length} {pending.length === 1 ? "motorista com carga hoje ainda não fez" : "motoristas com carga hoje ainda não fizeram"}{" "}
        o check-list
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {pending.map((r) => (
          <li
            key={r.label}
            className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700"
          >
            {r.label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-navy-600">
        {done} de {rows.length} já fizeram hoje.
        {noApp.length > 0 && ` Sem acesso ao app: ${noApp.map((r) => r.label).join(", ")}.`}
      </p>
    </div>
  );
}
