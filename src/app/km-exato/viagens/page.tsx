"use client";

import { useMemo, useState } from "react";
import { useKm } from "@/lib/kmExato/useKm";
import { useTabCounts } from "@/lib/kmExato/useTabCounts";
import type { KmTrip } from "@/lib/kmExato/engine";
import { dBR, km, skm, ton } from "@/lib/kmExato/format";
import { buttonClasses } from "@/components/Button";
import { DataTable, type Column } from "@/components/DataTable";
import { KmPage, Panel, Pill, Plate, Signed } from "@/components/km/KmUi";
import { TripDialogs, type TripDialog } from "@/components/km/KmTripModals";

// KM Exato · Viagens: abrir no carregamento, fechar na volta com o odômetro.

type Filter = "aberta" | "fechada" | "todas";

function ModeTag({ t }: { t: KmTrip }) {
  if (t.modo === "spot") return <span className="ml-1.5 rounded border border-kmbt px-1 text-[10px] font-medium uppercase text-navy-700">spot</span>;
  if (t.modo === "rota") return <span className="ml-1.5 rounded border border-brand-600 px-1 text-[10px] font-medium uppercase text-navy-700">rota do contrato</span>;
  return null;
}

function Situation({ t }: { t: KmTrip }) {
  if (t.status === "aberta") return <Pill tone="warn">em viagem</Pill>;
  if (t.status === "cancelada") return <Pill tone="mute">cancelada</Pill>;
  if (t.hist) return <Pill tone="mute">concluída</Pill>;
  const es = t.entregas || [];
  const env = es.filter((e) => e.comp?.env).length;
  if (!es.length || env === es.length) return <Pill tone="ok">concluída</Pill>;
  const n = es.length - env;
  return <Pill tone="risk">{n} comprovante{n > 1 ? "s" : ""}</Pill>;
}

export default function KmViagensPage() {
  const km$ = useKm();
  const E = km$.engine;
  const counts = useTabCounts(E);
  const [vf, setVf] = useState<Filter>("aberta");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<TripDialog>(null);

  const all = useMemo(() => (E ? E.trips() : []), [E]);
  const cnt = useMemo(() => {
    const c = { aberta: 0, fechada: 0, todas: all.length };
    all.forEach((t) => {
      if (t.status === "aberta") c.aberta++;
      else if (t.status === "fechada") c.fechada++;
    });
    return c;
  }, [all]);
  const list = useMemo(() => {
    const qq = q.trim().toUpperCase();
    return all.filter((t) => {
      if (vf !== "todas" && t.status !== vf) return false;
      if (qq && (t.placa + " " + t.dst + " " + t.entregas.map((e) => (e.nf || "") + " " + (e.cte || "")).join(" ")).toUpperCase().indexOf(qq) < 0) return false;
      return true;
    });
  }, [all, vf, q]);
  const shown = list.slice(0, 200);

  const columns: Column<KmTrip>[] = [
    { key: "carreg", header: "Carregamento", mobile: "badge", cell: (t) => <span className="font-mono">{dBR(t.carreg)}</span> },
    { key: "placa", header: "Placa", mobile: "title", cell: (t) => <span className="whitespace-nowrap"><Plate plate={t.placa} /><ModeTag t={t} /></span> },
    { key: "dst", header: "Destinos", mobile: "subtitle", cell: (t) => <span className="line-clamp-2 max-w-sm text-xs text-navy-600">{t.dst || "—"}</span> },
    { key: "ne", header: "Entregas", mobile: "field", className: "text-right", cell: (t) => t.ne || "—" },
    { key: "peso", header: "Peso", mobile: "field", className: "text-right", cell: (t) => <span className="whitespace-nowrap font-mono">{ton(t.entregas.reduce((a, e) => a + (+(e.peso ?? 0) || 0), 0))}</span> },
    {
      key: "fat",
      header: "Km faturado",
      mobile: "field",
      className: "text-right",
      cell: (t) => (
        <span className="font-mono">
          {km(t.kmFat)}
          {t.kmComp ? <span className="block text-[11px] font-medium text-navy-500">{skm(t.kmComp)} comp.</span> : null}
        </span>
      ),
    },
    { key: "real", header: "Km rodado", mobile: "field", className: "text-right", cell: (t) => (t.ctl ? <span className="font-mono">{km(t.kmReal)}</span> : <span className="text-navy-400">—</span>) },
    {
      key: "saldo",
      header: "Saldo da viagem",
      mobile: "highlight",
      className: "text-right",
      cell: (t) => (t.ctl ? t.difRS != null ? <Signed v={t.difRS} /> : <span className="text-navy-400">na volta</span> : <span className="text-navy-400">sem saldo</span>),
    },
    { key: "sit", header: "Situação", mobile: "field", cell: (t) => <Situation t={t} /> },
    {
      key: "acoes",
      header: "",
      mobile: "actions",
      cell: (t) => (
        <button type="button" className={buttonClasses("soft", "sm")} onClick={() => setDialog({ kind: "detail", id: t.id })}>
          Detalhes
        </button>
      ),
    },
  ];

  const common = E ? { engine: E, userName: km$.userName, isAdmin: km$.isAdmin, onChanged: km$.reload } : null;

  return (
    <KmPage
      title="Viagens"
      subtitle="Abra antes do carregamento (já cria a carga na Programação) e feche na volta com o odômetro."
      active="/km-exato/viagens"
      isAdmin={km$.isAdmin}
      canView={km$.canView}
      authLoading={km$.authLoading}
      error={km$.error}
      loading={!E}
      counts={counts}
      actions={km$.canView && <button type="button" className={buttonClasses("primary", "md")} onClick={() => setDialog({ kind: "new" })}>Nova viagem</button>}
    >
      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-navy-300 text-sm">
            {([["aberta", "Em viagem"], ["fechada", "Concluídas"], ["todas", "Todas"]] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setVf(v)} className={`px-3 py-2 font-medium ${vf === v ? "bg-brand-700 text-white" : "bg-white text-navy-600 hover:bg-navy-50"}`}>
                {l} <span className="ml-1 font-mono text-xs opacity-75">{cnt[v]}</span>
              </button>
            ))}
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Placa, destino, NF ou CT-e"
            aria-label="Buscar viagens"
            className="ml-auto w-full max-w-xs rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>
        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-navy-500">{vf === "aberta" ? "Nenhuma viagem em andamento." : "Nenhuma viagem encontrada."}</p>
        ) : (
          <DataTable rows={shown} columns={columns} rowKey={(t) => t.id} />
        )}
        {list.length > shown.length && <p className="mt-3 text-xs text-navy-500">Mostrando 200 de {list.length}. Use a busca.</p>}
      </Panel>
      {common && <TripDialogs {...common} dialog={dialog} setDialog={setDialog} />}
    </KmPage>
  );
}
