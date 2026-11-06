"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { StepperControl } from "@/components/StepperControl";
import { brl, favor, monLab } from "@/lib/kmExato/format";
import { shiftMon } from "@/lib/kmExato/engine";

// Peças visuais comuns das telas do KM Exato.

const TABS = [
  { href: "/km-exato", label: "Painel" },
  { href: "/km-exato/viagens", label: "Viagens" },
  { href: "/km-exato/entregas", label: "Entregas" },
  { href: "/km-exato/relatorios", label: "Relatórios" },
  { href: "/km-exato/ajustes", label: "Ajustes", admin: true },
];

export function KmTabs({ active, isAdmin, counts }: { active: string; isAdmin: boolean; counts?: Record<string, { n: number; hot?: boolean }> }) {
  return (
    <div className="mb-6 flex flex-wrap gap-1 border-b border-navy-200">
      {TABS.filter((t) => !t.admin || isAdmin).map((t) => {
        const c = counts?.[t.href];
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.href === active ? "page" : undefined}
            className={`-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              t.href === active ? "border-brand-600 text-brand-700" : "border-transparent text-navy-500 hover:text-navy-800"
            }`}
          >
            {t.label}
            {c && c.n > 0 && (
              <span className={`rounded-full px-1.5 text-[11px] font-semibold ${c.hot ? "bg-red-100 text-red-800" : "bg-navy-100 text-navy-700"}`}>
                {c.n}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/** Moldura das páginas: título, abas e bloqueio para quem não é admin/logística. */
export function KmPage({
  title,
  subtitle,
  active,
  isAdmin,
  canView,
  authLoading,
  error,
  loading,
  actions,
  counts,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  active: string;
  isAdmin: boolean;
  canView: boolean;
  authLoading: boolean;
  error?: string | null;
  loading?: boolean;
  actions?: ReactNode;
  counts?: Record<string, { n: number; hot?: boolean }>;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">KM Exato · Btech</p>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-navy-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {!authLoading && !canView ? (
        <p className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
          Acesso restrito à Logística e à administração.
        </p>
      ) : (
        <>
          <KmTabs active={active} isAdmin={isAdmin} counts={counts} />
          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-6 py-6 text-sm text-red-700">Erro ao carregar: {error}</p>
          ) : loading ? (
            <p className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">Carregando...</p>
          ) : (
            children
          )}
        </>
      )}
    </div>
  );
}

export function Plate({ plate }: { plate: string }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-md border border-navy-200 bg-navy-50 px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-navy-800">
      {plate}
    </span>
  );
}

/** Marcador de lado do saldo: cor + rótulo (nunca só a cor). */
export function SideDot({ v }: { v: number }) {
  const f = favor(v);
  if (!f) return null;
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${v < 0 ? "bg-kmtb" : "bg-kmbt"}`} />;
}

/** Valor com sinal e marcador do lado. Texto na cor do texto. */
export function Signed({ v, strong }: { v: number | null | undefined; strong?: boolean }) {
  if (v == null || !isFinite(v)) return <span className="text-navy-400">—</span>;
  if (Math.abs(v) < 0.005) return <span className="text-navy-500">R$ 0,00</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${strong ? "font-semibold text-navy-900" : "text-navy-800"}`} title={v < 0 ? "a favor da Transbochnia" : "a favor da Btech"}>
      <SideDot v={v} />
      {(v < 0 ? "−" : "+") + brl(v)}
    </span>
  );
}

export function FavorPill({ v }: { v: number }) {
  const f = favor(v);
  if (!f) return <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs font-medium text-navy-600">zerado</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-navy-200 bg-white px-2 py-0.5 text-xs font-medium text-navy-700">
      <SideDot v={v} />a favor da {f}
    </span>
  );
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  return (
    <StepperControl onPrev={() => onChange(shiftMon(value, -1))} onNext={() => onChange(shiftMon(value, 1))} prevLabel="Mês anterior" nextLabel="Próximo mês">
      <span className="min-w-20 px-3 text-center text-sm font-semibold text-navy-900">{monLab(value)}</span>
    </StepperControl>
  );
}

export function Pill({ tone, children }: { tone: "ok" | "warn" | "risk" | "mute" | "info"; children: ReactNode }) {
  const cls = {
    ok: "bg-teal-100 text-teal-800",
    warn: "bg-amber-100 text-amber-800",
    risk: "bg-red-100 text-red-800",
    mute: "bg-navy-100 text-navy-600",
    info: "bg-sky-100 text-sky-800",
  }[tone];
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>{children}</span>;
}

export function Panel({ title, sub, children, className = "", right }: { title?: ReactNode; sub?: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-xl border border-navy-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-medium text-navy-900">{title}</h2>}
            {sub && <p className="mt-0.5 text-xs text-navy-500">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function TeamTag() {
  return <span className="ml-2 rounded border border-navy-200 px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-navy-500">só equipe</span>;
}
