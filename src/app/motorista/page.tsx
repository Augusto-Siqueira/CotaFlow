"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { loadingStatusBadge, loadingStatusLabel } from "@/lib/loadingStatus";
import { DestinationsCell } from "@/components/Destinations";
import { reportStageLabel, severityBadge, severityLabel } from "@/lib/maintenance";

interface Load {
  id: string;
  client_name: string;
  cargo: string;
  origin: string | null;
  destination: string | null;
  weight: string | null;
  plate: string | null;
  trailer_plate: string | null;
  loading_time: string | null;
  status: string;
}

interface MyReport {
  id: string;
  plate: string;
  category: string;
  severity: number;
  status: string;
  reported_at: string;
}

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function MotoristaHome() {
  const { user, isDriver, loading: authLoading } = useAuth();
  const [name, setName] = useState<string | null>(null);
  const [loads, setLoads] = useState<Load[] | null>(null);
  const [checklistDone, setChecklistDone] = useState<boolean | null>(null);
  const [reports, setReports] = useState<MyReport[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !isDriver) return;
    const today = new Date();
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    Promise.all([
      supabase.from("drivers").select("name, nickname").maybeSingle(),
      supabase
        .from("loading_schedules")
        .select(
          "id, client_name, cargo, origin, destination, weight, plate, trailer_plate, loading_time, status"
        )
        .eq("schedule_date", localDate(today))
        .order("loading_time", { ascending: true, nullsFirst: false }),
      supabase
        .from("driver_checklists")
        .select("id", { count: "exact", head: true })
        .gte("finished_at", dayStart.toISOString()),
      supabase
        .from("maintenance_reports")
        .select("id, plate, category, severity, status, reported_at")
        .order("reported_at", { ascending: false })
        .limit(5),
    ]).then(([d, l, c, r]) => {
      if (l.error) setError(l.error.message);
      const driver = d.data as { name: string; nickname: string | null } | null;
      setName(driver ? driver.nickname?.trim() || driver.name : null);
      setLoads((l.data as Load[] | null) ?? []);
      setChecklistDone((c.count ?? 0) > 0);
      setReports((r.data as MyReport[] | null) ?? []);
    });
  }, [user, isDriver]);

  if (authLoading) return null;
  if (!isDriver) {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-navy-900">Área do motorista</h1>
        <p className="mt-2 text-sm text-navy-500">
          Esta tela é do aplicativo do motorista. Entre com o CPF de um motorista para vê-la.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium text-brand-700 underline">
          Voltar ao início
        </Link>
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
      <h1 className="text-xl font-semibold text-navy-900">
        {greeting}
        {name ? `, ${name}` : ""}!
      </h1>
      <p className="text-sm text-navy-500">O que você precisa fazer?</p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link
          href="/motorista/checklist"
          className="flex flex-col gap-1 rounded-xl border border-navy-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-brand-500"
        >
          <span className="text-2xl" aria-hidden="true">
            ✅
          </span>
          <span className="text-sm font-semibold text-navy-900">Check-list diário</span>
          <span
            className={`text-xs font-medium ${
              checklistDone ? "text-brand-700" : "text-amber-700"
            }`}
          >
            {checklistDone === null
              ? "..."
              : checklistDone
                ? "✓ feito hoje"
                : "⚠ pendente hoje"}
          </span>
        </Link>
        <Link
          href="/motorista/defeito"
          className="flex flex-col gap-1 rounded-xl border border-navy-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-brand-500"
        >
          <span className="text-2xl" aria-hidden="true">
            🔧
          </span>
          <span className="text-sm font-semibold text-navy-900">Relatar defeito</span>
          <span className="text-xs text-navy-500">Foto e descrição</span>
        </Link>
        <Link
          href="/motorista/entrega"
          className="col-span-2 flex flex-col gap-1 rounded-xl border border-navy-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-brand-500"
        >
          <span className="text-2xl" aria-hidden="true">
            📄
          </span>
          <span className="text-sm font-semibold text-navy-900">Comprovante de entrega</span>
          <span className="text-xs text-navy-500">
            Nota fiscal, pesos e foto do canhoto e do ticket
          </span>
        </Link>
      </div>

      <h2 className="mt-6 text-sm font-medium text-navy-900">Minhas cargas de hoje</h2>
      {error && (
        <div role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Não foi possível carregar suas cargas ({error}).
        </div>
      )}
      <div className="mt-2 space-y-3">
        {loads === null ? (
          <p className="text-sm text-navy-500">Carregando...</p>
        ) : loads.length === 0 ? (
          <div className="rounded-xl border border-navy-200 bg-white px-4 py-6 text-center text-sm text-navy-500">
            Nenhuma carga programada para você hoje.
          </div>
        ) : (
          loads.map((l) => (
            <div key={l.id} className="rounded-xl border border-navy-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-base font-semibold text-navy-900">{l.cargo}</div>
                  <div className="text-sm text-navy-600">{l.client_name}</div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${loadingStatusBadge(l.status)}`}
                >
                  {loadingStatusLabel(l.status)}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                <div>
                  <dt className="text-[11px] uppercase text-navy-500">Origem</dt>
                  <dd className="text-navy-800">{l.origin || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase text-navy-500">Destino</dt>
                  <dd className="text-navy-800">
                    <DestinationsCell value={l.destination} />
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase text-navy-500">Cavalo</dt>
                  <dd className="font-medium tracking-wide text-navy-900">{l.plate || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase text-navy-500">Carreta</dt>
                  <dd className="font-medium tracking-wide text-navy-900">
                    {l.trailer_plate || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase text-navy-500">Horário</dt>
                  <dd className="text-navy-800">{l.loading_time ? l.loading_time.slice(0, 5) : "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase text-navy-500">Peso</dt>
                  <dd className="text-navy-800">{l.weight ? `${l.weight} t` : "—"}</dd>
                </div>
              </dl>
            </div>
          ))
        )}
      </div>

      {reports.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-medium text-navy-900">Meus relatos recentes</h2>
          <ul className="mt-2 space-y-2">
            {reports.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-navy-200 bg-white px-4 py-2.5 text-sm"
              >
                <span>
                  <span className="font-medium text-navy-900">{r.category}</span>{" "}
                  <span className="text-navy-500">· {r.plate}</span>
                  <span className="block text-xs text-navy-500">
                    {new Date(r.reported_at).toLocaleDateString("pt-BR")} ·{" "}
                    {reportStageLabel(r.status)}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${severityBadge(r.severity)}`}
                >
                  {severityLabel(r.severity)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
