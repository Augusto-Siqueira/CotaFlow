"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { addDays, monthOf, todayISO, type KmEngine, type KmTrip } from "@/lib/kmExato/engine";
import { dBR, km, monFull, nf, skm, ton } from "@/lib/kmExato/format";
import { portalEngine, type PortalPayload } from "@/lib/kmExato/portal";
import { buttonClasses } from "@/components/Button";
import { DataTable, type Column } from "@/components/DataTable";
import { Modal } from "@/components/Modal";
import { PortalTabs } from "@/components/PortalTabs";
import { MonthPicker, Panel, Pill, Plate, Signed } from "@/components/km/KmUi";
import { ProdCard, SaldoCard } from "@/components/km/KmCards";
import { KmReport } from "@/components/km/KmReport";

// Portal do cliente · Controle de km (KM Exato) da Btech. Só consulta. Os
// dados chegam já calculados e sem os dados internos da Transbochnia pela rota
// /api/portal/km-exato (o perfil cliente não lê nenhuma tabela).

type View = "painel" | "viagens" | "entregas" | "relatorios";

/** Links das fotos do comprovante do motorista (rota do portal confere a empresa). */
function ProofLinks({ e }: { e: KmTrip["entregas"][number] }) {
  if (!e.proof || !e.proof.photos) return <span className="text-xs text-navy-400">—</span>;
  return (
    <span className="inline-flex flex-wrap gap-2">
      {Array.from({ length: e.proof.photos }, (_, i) => (
        <a key={i} href={`/api/portal/foto?proof=${e.proof!.id}&n=${i}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-700 hover:underline">
          {e.proof!.photos > 1 ? `Foto ${i + 1}` : "Ver foto"}
        </a>
      ))}
    </span>
  );
}

function TripModal({ t, E, onClose }: { t: KmTrip; E: KmEngine; onClose: () => void }) {
  const es = t.entregas || [];
  const pes = es.reduce((a, e) => a + (+(e.peso ?? 0) || 0), 0);
  const kv: [string, React.ReactNode][] = t.ctl
    ? [
        ["Km estimado", km(t.kmRota)],
        ["Compensação de saldo", t.kmComp ? skm(t.kmComp) + " km" : "—"],
        ["Km faturado", km(t.kmFat)],
        ["Km rodado", km(t.kmReal)],
        ["Odômetro saída", km(t.odoSaida)],
        ["Odômetro chegada", km(t.odoChegada)],
        ["Valor do km", t.vkm ? nf(t.vkm, 4) : "—"],
        ["Saldo da viagem", t.difRS != null ? <Signed v={t.difRS} /> : "na volta"],
      ]
    : [["Operação", t.modo === "spot" ? "Spot" : "Rota do contrato"], ["Km faturado", km(t.kmFat)], ["Entregas", String(es.length)], ["Peso", ton(pes)]];
  return (
    <Modal onClose={onClose} labelledBy="pt-km-title" className="max-w-3xl">
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="pt-km-title" className="text-lg font-semibold text-navy-900"><Plate plate={t.placa} /></h2>
          <p className="text-sm text-navy-500">{E.tipoNome(t.tipo)} · carregamento {dBR(t.carreg)} · {t.status === "aberta" ? "em viagem" : "concluída"}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kv.map(([k, v]) => (
            <div key={k} className="rounded-lg border border-navy-200 bg-white px-3 py-2">
              <div className="text-[11px] text-navy-500">{k}</div>
              <div className="font-mono text-sm font-semibold text-navy-900">{v}</div>
            </div>
          ))}
        </div>
        {t.ctl && t.status === "fechada" && t.difRS != null && (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-navy-100">
              <tr>
                <td className="py-1.5 text-navy-700">Divergência · {km(t.kmRota)} km estimados − {km(t.kmReal)} km rodados = {skm(t.opKm)} km</td>
                <td className="py-1.5 text-right"><Signed v={t.opRS} /></td>
              </tr>
              {t.kmComp ? (
                <tr>
                  <td className="py-1.5 text-navy-700">Compensação de saldo · {skm(t.kmComp)} km no faturado</td>
                  <td className="py-1.5 text-right"><Signed v={t.compRS} /></td>
                </tr>
              ) : null}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-navy-200 font-semibold">
                <td className="py-1.5">Saldo da viagem</td>
                <td className="py-1.5 text-right"><Signed v={t.difRS} strong /></td>
              </tr>
            </tfoot>
          </table>
        )}
        {!t.ctl && (
          <p className="rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-700">
            {t.modo === "spot" ? "Veículo spot: km faturado pela estimativa, sem controle de saldo." : `${t.rotaNome || "Rota do contrato"}: km pré-estabelecido no contrato, sem controle de saldo.`}
          </p>
        )}
        {t.hist ? (
          <p className="rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-700">Viagem do controle anterior. Destinos: {t.dst}</p>
        ) : (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy-900">Entregas</h3>
            {es.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-navy-500">
                    <tr><th className="py-1 pr-3 font-medium">Cliente / destino</th><th className="py-1 pr-3 font-medium">NF</th><th className="py-1 pr-3 font-medium">CT-e</th><th className="py-1 pr-3 text-right font-medium">Peso</th><th className="py-1 pr-3 font-medium">Situação</th><th className="py-1 font-medium">Comprovante</th></tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {es.map((e) => (
                      <tr key={e.id}>
                        <td className="py-1.5 pr-3 text-navy-900">{e.cliente}</td>
                        <td className="py-1.5 pr-3 font-mono">{e.nf || "—"}</td>
                        <td className="py-1.5 pr-3 font-mono">{e.cte || "—"}</td>
                        <td className="py-1.5 pr-3 text-right">{ton(+(e.peso ?? 0) || 0)}</td>
                        <td className="py-1.5 pr-3">{e.entregue ? <Pill tone="ok">entregue {dBR(e.entregue)}</Pill> : <Pill tone="mute">em trânsito</Pill>}</td>
                        <td className="py-1.5"><ProofLinks e={e} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-navy-500">Sem entregas.</p>
            )}
          </div>
        )}
        <div className="flex justify-end"><button type="button" className={buttonClasses("secondary", "md")} onClick={onClose}>Voltar</button></div>
      </div>
    </Modal>
  );
}

export default function PortalKmPage() {
  const { isPortalClient, loading: authLoading } = useAuth();
  const [payload, setPayload] = useState<PortalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("painel");
  const [mesSel, setMes] = useState<string | null>(null);
  const [vf, setVf] = useState<"aberta" | "fechada" | "todas">("fechada");
  const [q, setQ] = useState("");
  const [cf, setCf] = useState<"aguardando" | "entregue">("entregue");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !isPortalClient) return;
    let cancelled = false;
    fetch("/api/portal/km-exato", { cache: "no-store" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `erro ${r.status}`);
        if (!cancelled) setPayload(body as PortalPayload);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [authLoading, isPortalClient]);

  const E = useMemo(() => (payload ? portalEngine(payload) : null), [payload]);
  const T = useMemo(() => (E ? E.trips() : []), [E]);
  const mes = mesSel ?? (() => {
    let mx = "";
    T.forEach((t) => {
      if (!t.hist && t.status === "fechada" && t.carreg > mx) mx = t.carreg;
    });
    return mx ? monthOf(mx) : monthOf(todayISO());
  })();

  if (authLoading) return null;
  if (!isPortalClient) {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-navy-900">Portal do cliente</h1>
        <p className="mt-2 text-sm text-navy-500">Esta área é dos clientes da Transbochnia.</p>
      </div>
    );
  }

  const trips = T.filter((t) => vf === "todas" || t.status === vf).filter((t) => {
    const qq = q.trim().toUpperCase();
    return !qq || (t.placa + " " + t.dst + " " + t.entregas.map((e) => (e.nf || "") + " " + (e.cte || "")).join(" ")).toUpperCase().includes(qq);
  });
  const tripCols: Column<KmTrip>[] = [
    { key: "c", header: "Carregamento", mobile: "badge", cell: (t) => <span className="font-mono">{dBR(t.carreg)}</span> },
    { key: "p", header: "Placa", mobile: "title", cell: (t) => <Plate plate={t.placa} /> },
    { key: "d", header: "Destinos", mobile: "subtitle", cell: (t) => <span className="line-clamp-2 max-w-sm text-xs text-navy-600">{t.dst || "—"}</span> },
    { key: "n", header: "Entregas", mobile: "field", className: "text-right", cell: (t) => t.ne || "—" },
    { key: "f", header: "Km faturado", mobile: "field", className: "text-right", cell: (t) => <span className="font-mono">{km(t.kmFat)}{t.kmComp ? <span className="block text-[11px] text-navy-500">{skm(t.kmComp)} comp.</span> : null}</span> },
    { key: "r", header: "Km rodado", mobile: "field", className: "text-right", cell: (t) => (t.ctl ? <span className="font-mono">{km(t.kmReal)}</span> : "—") },
    { key: "s", header: "Saldo da viagem", mobile: "highlight", className: "text-right", cell: (t) => (t.ctl ? (t.difRS != null ? <Signed v={t.difRS} /> : <span className="text-navy-400">na volta</span>) : <span className="text-navy-400">sem saldo</span>) },
    { key: "st", header: "Situação", mobile: "field", cell: (t) => (t.status === "aberta" ? <Pill tone="warn">em viagem</Pill> : <Pill tone="ok">concluída</Pill>) },
    { key: "a", header: "", mobile: "actions", cell: (t) => <button type="button" className={buttonClasses("soft", "sm")} onClick={() => setOpen(t.id)}>Detalhes</button> },
  ];

  const d60 = addDays(todayISO(), -60);
  const ents = E
    ? E.comps()
        .filter((c) => (cf === "entregue" ? !!c.e.entregue && (c.e.entregue ?? "") >= d60 : !c.e.entregue))
        .sort((a, b) => ((a.e.entregue || a.v.carreg) < (b.e.entregue || b.v.carreg) ? (cf === "entregue" ? 1 : -1) : cf === "entregue" ? -1 : 1))
    : [];
  const entCols: Column<(typeof ents)[number]>[] = [
    { key: "d", header: "Entrega", mobile: "badge", cell: (c) => (c.e.entregue ? <span className="font-mono">{dBR(c.e.entregue)}</span> : <span className="text-navy-500">saiu {dBR(c.v.carreg)}</span>) },
    { key: "p", header: "Placa", mobile: "field", cell: (c) => <Plate plate={c.v.placa} /> },
    { key: "c", header: "Cliente / destino", mobile: "title", cell: (c) => c.e.cliente },
    { key: "nf", header: "NF", mobile: "field", cell: (c) => <span className="font-mono">{c.e.nf || "—"}</span> },
    { key: "ct", header: "CT-e", mobile: "field", cell: (c) => <span className="font-mono">{c.e.cte || "—"}</span> },
    { key: "w", header: "Peso", mobile: "field", className: "text-right", cell: (c) => ton(+(c.e.peso ?? 0) || 0) },
    { key: "s", header: "Situação", mobile: "field", cell: (c) => (c.e.entregue ? <Pill tone="ok">entregue</Pill> : <Pill tone="mute">em trânsito</Pill>) },
    { key: "f", header: "Comprovante", mobile: "field", cell: (c) => <ProofLinks e={c.e} /> },
  ];

  const seg = (on: boolean) => `px-3 py-2 text-sm font-medium ${on ? "bg-brand-700 text-white" : "bg-white text-navy-600 hover:bg-navy-50"}`;
  const openTrip = open ? T.find((t) => t.id === open) ?? null : null;

  return (
    <div className="mx-auto w-full max-w-screen-2xl flex-1 px-6 py-10">
      <PortalTabs active="/portal/km-exato" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">Controle de km · Btech × Transbochnia</h1>
          <p className="mt-1 text-sm text-navy-500">Cada viagem dedicada com km faturado, km rodado no odômetro e saldo (contrato, cl. 6.4). Só consulta.</p>
        </div>
        {view === "painel" && E && <MonthPicker value={mes} onChange={setMes} />}
      </div>

      <div className="mb-6 flex flex-wrap overflow-hidden rounded-lg border border-navy-300 sm:w-fit">
        {([["painel", "Painel"], ["viagens", "Viagens"], ["entregas", "Entregas"], ["relatorios", "Relatórios"]] as const).map(([v, l]) => (
          <button key={v} type="button" className={seg(view === v)} onClick={() => setView(v)}>{l}</button>
        ))}
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-6 py-6 text-sm text-red-700">{error}</p>
      ) : !E ? (
        <p className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">Carregando...</p>
      ) : view === "painel" ? (
        <div className="flex flex-col gap-6">
          <p className="text-sm text-navy-600">{monFull(mes)}</p>
          <div className="grid gap-6 xl:grid-cols-2">
            <SaldoCard E={E} T={T} />
            <ProdCard E={E} T={T} mes={mes} team={false} />
          </div>
        </div>
      ) : view === "viagens" ? (
        <Panel>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex overflow-hidden rounded-lg border border-navy-300">
              {([["fechada", "Concluídas"], ["aberta", "Em viagem"], ["todas", "Todas"]] as const).map(([v, l]) => (
                <button key={v} type="button" className={seg(vf === v)} onClick={() => setVf(v)}>{l}</button>
              ))}
            </div>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Placa, destino, NF ou CT-e" aria-label="Buscar viagens" className="ml-auto w-full max-w-xs rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900" />
          </div>
          {trips.length ? <DataTable rows={trips.slice(0, 200)} columns={tripCols} rowKey={(t) => t.id} /> : <p className="py-10 text-center text-sm text-navy-500">Nenhuma viagem encontrada.</p>}
          {trips.length > 200 && <p className="mt-3 text-xs text-navy-500">Mostrando 200 de {trips.length}. Use a busca.</p>}
        </Panel>
      ) : view === "entregas" ? (
        <Panel>
          <div className="mb-4 flex overflow-hidden rounded-lg border border-navy-300 sm:w-fit">
            <button type="button" className={seg(cf === "entregue")} onClick={() => setCf("entregue")}>Entregues (60 dias)</button>
            <button type="button" className={seg(cf === "aguardando")} onClick={() => setCf("aguardando")}>Em trânsito</button>
          </div>
          {ents.length ? <DataTable rows={ents.slice(0, 300)} columns={entCols} rowKey={(c) => c.e.id} /> : <p className="py-10 text-center text-sm text-navy-500">Nada aqui.</p>}
        </Panel>
      ) : (
        <KmReport E={E} isAdmin={false} userName={null} reload={() => undefined} open={(id) => setOpen(id)} />
      )}

      {openTrip && E && <TripModal t={openTrip} E={E} onClose={() => setOpen(null)} />}
      {payload && <p className="mt-6 text-xs text-navy-500">Atualizado em {new Date(payload.generatedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}. Valores negativos a favor da Transbochnia; positivos a favor da Btech.</p>}
    </div>
  );
}
