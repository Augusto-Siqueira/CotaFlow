"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { ButtonLink, buttonClasses } from "@/components/Button";
import { FLEET_KINDS, normalizePlate } from "@/lib/fleet";
import {
  MONTHLY_ALERT_DAYS,
  MONTHLY_CREATES_DEFECTS,
  MONTHLY_CYCLE_DAYS,
  fmtDateBr,
  monthlyStatus,
  statusText,
  templateOf,
  type MonthlyLevel,
  type MonthlyStatus,
} from "@/lib/monthlyChecklist";

// Painel do check-list mensal: cada placa precisa de uma inspeção a cada 30 dias.
// O inspetor (funcionário da base) faz por aqui; manutenção e admin também; a
// logística só consulta.

interface Row {
  plate: string;
  kind: string;
  status: MonthlyStatus;
  lastId: string | null;
  lastNc: number;
  lastDivergences: number;
}

type Filter = "todas" | MonthlyLevel;

const LEVEL_BADGE: Record<MonthlyLevel, string> = {
  atrasado: "bg-red-100 text-red-800",
  vencendo: "bg-amber-100 text-amber-800",
  em_dia: "bg-teal-100 text-teal-800",
  nunca: "bg-navy-100 text-navy-700",
};

const selectCls =
  "rounded-lg border border-navy-300 bg-white px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function MonthlyChecklistPanel() {
  const { role, canDoMonthlyChecklist, loading: authLoading } = useAuth();
  const allowed = ["admin", "manutencao", "logistica", "inspetor"].includes(role ?? "");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todas");
  const [type, setType] = useState<"" | "semi" | "motor">("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const [fleet, done] = await Promise.all([
        supabase.from("fleet_units").select("plate, kind").order("plate"),
        supabase
          .from("monthly_checklists")
          .select("id, plate, finished_at, nonconformities, divergences")
          .order("finished_at", { ascending: false })
          .limit(5000),
      ]);
      if (fleet.error || done.error) {
        setError((fleet.error ?? done.error)!.message);
        setRows([]);
        return;
      }
      // Último check-list de cada placa (a lista já vem do mais recente para o mais antigo).
      const last = new Map<string, { id: string; finished_at: string; nonconformities: number; divergences: unknown[] }>();
      for (const c of (done.data ?? []) as { id: string; plate: string; finished_at: string; nonconformities: number; divergences: unknown[] }[]) {
        if (!last.has(c.plate)) last.set(c.plate, c);
      }
      setRows(
        ((fleet.data ?? []) as { plate: string; kind: string }[]).map((f) => {
          const l = last.get(f.plate);
          return {
            plate: f.plate,
            kind: f.kind,
            status: monthlyStatus(l?.finished_at ?? null),
            lastId: l?.id ?? null,
            lastNc: l?.nonconformities ?? 0,
            lastDivergences: Array.isArray(l?.divergences) ? l!.divergences.length : 0,
          };
        })
      );
      setError(null);
    })();
  }, [allowed]);

  const scoped = useMemo(() => {
    const q = normalizePlate(search);
    return (rows ?? []).filter((r) => (!type || templateOf(r.kind) === type) && (!q || r.plate.includes(q)));
  }, [rows, type, search]);

  const counts = {
    atrasado: scoped.filter((r) => r.status.level === "atrasado").length,
    vencendo: scoped.filter((r) => r.status.level === "vencendo").length,
    em_dia: scoped.filter((r) => r.status.level === "em_dia").length,
    nunca: scoped.filter((r) => r.status.level === "nunca").length,
  };

  const order: Record<MonthlyLevel, number> = { atrasado: 0, nunca: 1, vencendo: 2, em_dia: 3 };
  const list = scoped
    .filter((r) => filter === "todas" || r.status.level === filter)
    .sort((a, b) => order[a.status.level] - order[b.status.level] || (a.status.days ?? 0) - (b.status.days ?? 0) || a.plate.localeCompare(b.plate));

  if (authLoading) return null;
  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-navy-900">Acesso restrito</h1>
        <p className="mt-2 text-sm text-navy-500">Esta tela é da manutenção, da logística e do responsável pelo check-list mensal.</p>
      </div>
    );
  }

  const kpis: { key: MonthlyLevel; label: string; tone: string }[] = [
    { key: "atrasado", label: "Atrasados", tone: "text-red-700" },
    { key: "nunca", label: "Nunca feitos", tone: "text-navy-700" },
    { key: "vencendo", label: `Vencem em até ${MONTHLY_ALERT_DAYS} dias`, tone: "text-amber-700" },
    { key: "em_dia", label: "Em dia", tone: "text-teal-700" },
  ];

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Check-list mensal</h1>
          <p className="mt-1 text-sm text-navy-500">
            Cada placa passa por uma inspeção a cada {MONTHLY_CYCLE_DAYS} dias.
            {MONTHLY_CREATES_DEFECTS ? " Itens de manutenção marcados com N viram defeito na triagem da Manutenção." : ""}
          </p>
        </div>
        {canDoMonthlyChecklist && <ButtonLink href="/checklist-mensal/novo">Fazer check-list</ButtonLink>}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <button
            key={k.key}
            type="button"
            aria-pressed={filter === k.key}
            onClick={() => setFilter(filter === k.key ? "todas" : k.key)}
            className={`rounded-xl border bg-white px-4 py-3 text-left shadow-sm ${filter === k.key ? "border-brand-600 ring-1 ring-brand-600" : "border-navy-200"}`}
          >
            <div className="text-xs text-navy-500">{k.label}</div>
            <div className={`mt-1 text-2xl font-semibold tabular-nums ${k.tone}`}>{counts[k.key]}</div>
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cm-tipo" className="mb-1 block text-xs font-medium text-navy-600">
            Tipo
          </label>
          <select id="cm-tipo" value={type} onChange={(e) => setType(e.target.value as "" | "semi" | "motor")} className={selectCls}>
            <option value="">Todos</option>
            <option value="motor">Truck, bitruck e cavalo</option>
            <option value="semi">Semirreboques</option>
          </select>
        </div>
        <div>
          <label htmlFor="cm-placa" className="mb-1 block text-xs font-medium text-navy-600">
            Placa
          </label>
          <input id="cm-placa" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar placa..." className={`${selectCls} uppercase`} />
        </div>
        {filter !== "todas" && (
          <button type="button" onClick={() => setFilter("todas")} className={buttonClasses("secondary", "sm")}>
            Mostrar todas
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar ({error}).
        </div>
      )}

      {rows === null ? (
        <p className="mt-6 text-sm text-navy-500">Carregando...</p>
      ) : list.length === 0 ? (
        <p className="mt-6 rounded-xl border border-navy-200 bg-white px-5 py-8 text-center text-sm text-navy-500">Nenhuma placa nesta situação.</p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <li key={r.plate} className="rounded-xl border border-navy-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-semibold tracking-wide text-navy-900">{r.plate}</div>
                  <div className="text-xs text-navy-500">{FLEET_KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}</div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${LEVEL_BADGE[r.status.level]}`}>
                  {statusText(r.status)}
                </span>
              </div>
              <div className="mt-1 text-xs text-navy-600">
                {r.status.last ? (
                  <>
                    Último: {fmtDateBr(r.status.last)} · próximo até {fmtDateBr(r.status.due)}
                    {r.lastNc > 0 && <span className="text-red-700"> · {r.lastNc} item(ns) com N</span>}
                    {r.lastDivergences > 0 && <span className="text-amber-700"> · vencimento divergente</span>}
                  </>
                ) : (
                  "Ainda sem check-list mensal."
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {canDoMonthlyChecklist && (
                  <ButtonLink href={`/checklist-mensal/novo?placa=${r.plate}`} size="sm">
                    Fazer check-list
                  </ButtonLink>
                )}
                {r.lastId && (
                  <Link href={`/checklist-mensal/${r.lastId}`} className={buttonClasses("soft", "sm")}>
                    Ver último
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
