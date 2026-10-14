"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonClasses } from "@/components/Button";
import { ChecklistSection } from "./ChecklistSection";

function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fromIso(v: string): Date {
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(v: string, n: number): string {
  const d = fromIso(v);
  d.setDate(d.getDate() + n);
  return toIso(d);
}
function mondayOf(v: string): string {
  return addDays(v, -((fromIso(v).getDay() + 6) % 7));
}

const fieldCls =
  "rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm font-medium text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function ChecklistsPage() {
  const today = toIso(new Date());
  const [from, setFrom] = useState(() => addDays(today, -6));
  const [to, setTo] = useState(today);

  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthEnd = addDays(monthStart, -1);
  const shortcuts = [
    { label: "Hoje", from: today, to: today },
    { label: "Últimos 7 dias", from: addDays(today, -6), to: today },
    { label: "Esta semana", from: mondayOf(today), to: addDays(mondayOf(today), 6) },
    { label: "Este mês", from: monthStart, to: today },
    { label: "Mês passado", from: `${prevMonthEnd.slice(0, 8)}01`, to: prevMonthEnd },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">
            Check-lists dos motoristas
          </h1>
          <p className="mt-1 text-sm text-navy-500">
            Quem fez, quem não fez e o que foi encontrado em cada veículo.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/manutencao" className={buttonClasses("secondary", "md")}>
            Lançamentos
          </Link>
          <Link href="/manutencao/dashboard" className={buttonClasses("secondary", "md")}>
            Dashboard
          </Link>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div>
          <label htmlFor="ck-from" className="mb-1 block text-xs font-medium text-navy-600">
            De
          </label>
          <input
            id="ck-from"
            type="date"
            value={from}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div>
          <label htmlFor="ck-to" className="mb-1 block text-xs font-medium text-navy-600">
            Até
          </label>
          <input
            id="ck-to"
            type="date"
            value={to}
            onChange={(e) => e.target.value && setTo(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {shortcuts.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setFrom(s.from);
                setTo(s.to);
              }}
              aria-pressed={from === s.from && to === s.to}
              className={`${buttonClasses("secondary", "compact")} ${
                from === s.from && to === s.to ? "!border-brand-500 !text-brand-700" : ""
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {from > to ? (
        <div className="mt-6 rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-red-600">
          A data inicial não pode ser depois da data final.
        </div>
      ) : (
        <ChecklistSection from={from} to={to} />
      )}
    </div>
  );
}
