"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { buttonClasses } from "@/components/Button";
import { DataTable, type Column } from "@/components/DataTable";
import { CIOT_STATUS_LABEL, splitDestinations, type CiotStatus } from "@/lib/ciot";
import { formatCurrency } from "@/lib/format";

// Lista das cargas da programação feitas por agregados que emitem um CIOT por
// viagem, com a situação do CIOT de cada uma (Etapa 2 — migration 0081).

interface AgregadoRow {
  id: string;
  name: string;
  ciot_mode: "viagem" | "mensal";
  active: boolean;
}
interface PlateRow {
  plate: string;
  agregado_id: string;
}
interface ScheduleRow {
  id: string;
  schedule_date: string;
  client_name: string;
  cargo: string;
  plate: string | null;
  trailer_plate: string | null;
  driver: string | null;
  origin: string | null;
  destination: string | null;
  status: string;
}
interface CiotRow {
  id: string;
  schedule_id: string;
  status: CiotStatus;
  ciot_number: string | null;
  freight_value: number | null;
}

interface Row extends ScheduleRow {
  agregado: AgregadoRow;
  ciot: CiotRow | null;
}

type StatusFilter = "pendentes" | "emitidos" | "todos";

function monthBounds(offset = 0): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: iso(first), to: iso(last) };
}

const inputCls =
  "rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_CLS: Record<CiotStatus | "sem", string> = {
  sem: "bg-amber-100 text-amber-800",
  rascunho: "bg-navy-100 text-navy-700",
  emitido: "bg-teal-100 text-teal-800",
  cancelado: "bg-red-100 text-red-800",
};

export default function CiotListPage() {
  const { canEditSchedule, loading: authLoading } = useAuth();
  const [range, setRange] = useState(() => monthBounds());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pendentes");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [monthlyNames, setMonthlyNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !canEditSchedule) return;
    let cancelled = false;
    (async () => {
      const [agRes, platesRes] = await Promise.all([
        supabase.from("agregados").select("id, name, ciot_mode, active").eq("active", true),
        supabase.from("fleet_units").select("plate, agregado_id").not("agregado_id", "is", null),
      ]);
      if (agRes.error || platesRes.error) {
        if (!cancelled) setError((agRes.error ?? platesRes.error)!.message);
        return;
      }
      const agregados = (agRes.data ?? []) as AgregadoRow[];
      const perTrip = new Map(agregados.filter((a) => a.ciot_mode === "viagem").map((a) => [a.id, a]));
      const plateOwner = new Map<string, AgregadoRow>();
      for (const p of (platesRes.data ?? []) as PlateRow[]) {
        const a = perTrip.get(p.agregado_id);
        if (a) plateOwner.set(p.plate, a);
      }
      const plates = [...plateOwner.keys()];
      if (!cancelled) setMonthlyNames(agregados.filter((a) => a.ciot_mode === "mensal").map((a) => a.name));
      if (plates.length === 0) {
        if (!cancelled) {
          setError(null);
          setRows([]);
        }
        return;
      }

      const list = plates.join(",");
      const schedRes = await supabase
        .from("loading_schedules")
        .select("id, schedule_date, client_name, cargo, plate, trailer_plate, driver, origin, destination, status")
        .gte("schedule_date", range.from)
        .lte("schedule_date", range.to)
        .or(`plate.in.(${list}),trailer_plate.in.(${list})`)
        .order("schedule_date", { ascending: false })
        .order("loading_time", { ascending: false });
      if (schedRes.error) {
        if (!cancelled) setError(schedRes.error.message);
        return;
      }
      const schedules = (schedRes.data ?? []) as ScheduleRow[];
      const ids = schedules.map((s) => s.id);
      const ciotRes = ids.length
        ? await supabase
            .from("ciots")
            .select("id, schedule_id, status, ciot_number, freight_value")
            .in("schedule_id", ids)
            .neq("status", "cancelado")
        : { data: [], error: null };
      const bySchedule = new Map(((ciotRes.data ?? []) as CiotRow[]).map((c) => [c.schedule_id, c]));

      const built: Row[] = schedules.flatMap((s) => {
        // O dono é o do cavalo; se o cavalo for próprio, o da carreta.
        const agregado = (s.plate && plateOwner.get(s.plate)) || (s.trailer_plate && plateOwner.get(s.trailer_plate));
        return agregado ? [{ ...s, agregado, ciot: bySchedule.get(s.id) ?? null }] : [];
      });
      if (!cancelled) {
        setError(null);
        setRows(built);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, canEditSchedule, range]);

  const filtered = useMemo(
    () =>
      (rows ?? []).filter((r) =>
        statusFilter === "todos"
          ? true
          : statusFilter === "emitidos"
            ? r.ciot?.status === "emitido"
            : r.ciot?.status !== "emitido"
      ),
    [rows, statusFilter]
  );
  const pendingCount = (rows ?? []).filter((r) => r.ciot?.status !== "emitido").length;

  const columns: Column<Row>[] = [
    {
      key: "date",
      header: "Data",
      mobile: "badge",
      cell: (r) => new Date(`${r.schedule_date}T12:00:00`).toLocaleDateString("pt-BR"),
    },
    {
      key: "cargo",
      header: "Cliente / carga",
      mobile: "title",
      cell: (r) => (
        <span className="flex flex-col">
          <span className="font-medium text-navy-900">{r.client_name}</span>
          <span className="text-xs font-normal text-navy-500">{r.cargo}</span>
        </span>
      ),
    },
    {
      key: "route",
      header: "Rota",
      mobile: "subtitle",
      cell: (r) => `${r.origin || "—"} → ${splitDestinations(r.destination).join(", ") || "—"}`,
    },
    {
      key: "plates",
      header: "Placas",
      mobile: "field",
      cell: (r) => [r.plate, r.trailer_plate].filter(Boolean).join(" + ") || "—",
    },
    { key: "agregado", header: "Agregado", mobile: "field", cell: (r) => r.agregado.name },
    {
      key: "ciot",
      header: "CIOT",
      mobile: "field",
      cell: (r) => {
        const st = r.ciot?.status ?? "sem";
        return (
          <span className="flex flex-col gap-0.5">
            <span className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_CLS[st]}`}>
              {r.ciot ? CIOT_STATUS_LABEL[r.ciot.status] : "Sem CIOT"}
              {r.ciot?.status === "emitido" && r.ciot.ciot_number ? ` · ${r.ciot.ciot_number}` : ""}
            </span>
            {r.ciot?.freight_value != null && (
              <span className="text-xs text-navy-500">Frete {formatCurrency(r.ciot.freight_value)}</span>
            )}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Ações",
      mobile: "actions",
      cell: (r) => (
        <Link href={`/ciot/viagem/${r.id}`} className={buttonClasses(r.ciot ? "soft" : "primary", "sm")}>
          {r.ciot ? "Abrir" : "Preencher CIOT"}
        </Link>
      ),
    },
  ];

  if (!authLoading && !canEditSchedule) {
    return (
      <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
        <p className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">
          Acesso restrito à Logística e à administração.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-900">CIOT dos agregados</h1>
        <p className="mt-1 text-sm text-navy-500">
          Cargas da programação feitas por agregados com CIOT por viagem. Os dados do agregado, do veículo e do
          motorista vêm dos cadastros; complete a viagem e os valores, e a ficha sai pronta para o e-Frete.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-navy-600" htmlFor="ciot-de">De</label>
          <input id="ciot-de" type="date" className={inputCls} value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-navy-600" htmlFor="ciot-ate">Até</label>
          <input id="ciot-ate" type="date" className={inputCls} value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setRange(monthBounds(-1))} className={buttonClasses("secondary", "compact")}>
            Mês passado
          </button>
          <button type="button" onClick={() => setRange(monthBounds())} className={buttonClasses("secondary", "compact")}>
            Este mês
          </button>
        </div>
        <div className="ml-auto flex overflow-hidden rounded-lg border border-navy-300 text-sm">
          {([
            ["pendentes", `Sem CIOT emitido (${pendingCount})`],
            ["emitidos", "Emitidos"],
            ["todos", "Todos"],
          ] as const).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatusFilter(v)}
              className={`px-3 py-2 font-medium ${
                statusFilter === v ? "bg-brand-700 text-white" : "bg-white text-navy-600 hover:bg-navy-50"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {monthlyNames.length > 0 && (
        <p className="mb-4 rounded-lg bg-navy-50 px-4 py-2 text-xs text-navy-600">
          CIOT mensal por veículo ({monthlyNames.join(", ")}) entra na próxima etapa.
        </p>
      )}

      <div className="overflow-hidden rounded-xl border border-navy-200 bg-white shadow-sm">
        {error ? (
          <div className="px-6 py-10 text-center text-sm text-red-600">Erro ao carregar: {error}</div>
        ) : rows === null ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-navy-500">
            {rows.length === 0
              ? "Nenhuma carga de agregado com CIOT por viagem no período. Confira o cadastro em Veículos → Agregados."
              : "Nenhuma carga com esse filtro."}
          </div>
        ) : (
          <DataTable rows={filtered} columns={columns} rowKey={(r) => r.id} />
        )}
      </div>
    </div>
  );
}
