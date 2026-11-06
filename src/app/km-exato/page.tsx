"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useKm } from "@/lib/kmExato/useKm";
import { KmEngine, daysBetween, monthOf, r2, todayISO, type KmTrip } from "@/lib/kmExato/engine";
import { dBR, km, monFull, nf, pct, sbrl, skm } from "@/lib/kmExato/format";
import { buttonClasses } from "@/components/Button";
import { KmPage, MonthPicker, Panel, Pill, TeamTag } from "@/components/km/KmUi";
import { ProdCard, SaldoCard } from "@/components/km/KmCards";
import { TripDialogs, type TripDialog } from "@/components/km/KmTripModals";
import { useTabCounts } from "@/lib/kmExato/useTabCounts";

// KM Exato · Painel: saldo de km, produtividade mínima, operação do mês,
// pendências da equipe e entregas.

function defaultMonth(E: KmEngine) {
  let mx = "";
  Object.values(E.S.viag).forEach((v) => {
    if (v.status === "fechada" && v.carreg > mx) mx = v.carreg;
  });
  return mx ? monthOf(mx) : monthOf(todayISO());
}

function ActionsPanel({ E, T, isAdmin, open }: { E: KmEngine; T: KmTrip[]; isAdmin: boolean; open: (id: string) => void }) {
  const R = E.R();
  const acts: { tone: "risk" | "warn" | "info" | "ok"; t: string; s: string; id: string; tag: string }[] = [];
  E.comps()
    .filter((c) => c.st === "atrasado")
    .sort((a, b) => ((a.e.entregue ?? "") < (b.e.entregue ?? "") ? -1 : 1))
    .forEach((c) => acts.push({ tone: "risk", t: "Comprovante atrasado · " + c.e.cliente, s: c.v.placa + " · entregue em " + dBR(c.e.entregue), id: c.vid, tag: "enviar" }));
  T.filter((t) => t.status === "aberta").forEach((x) => {
    const d = daysBetween(x.carreg, todayISO());
    if (d > (+R.diasAberta || 10)) acts.push({ tone: "warn", t: `Em aberto há ${d} dias · ${x.placa}`, s: dBR(x.carreg) + " · " + (x.dst || "sem entregas"), id: x.id, tag: "fechar" });
  });
  T.filter((x) => x.ctl && !x.hist && x.origem !== "controle anterior" && x.status === "fechada" && x.kmRota && x.opKm != null && Math.abs(x.opKm / x.kmRota) > (+R.limite || 0.1) && !x.motivo).forEach((x) =>
    acts.push({ tone: "info", t: `Desvio de ${pct(-x.opKm! / x.kmRota!, 0)} sem motivo · ${x.placa}`, s: `${dBR(x.carreg)} · ${km(x.kmReal)} rodados × ${km(x.kmRota)} estimados`, id: x.id, tag: "justificar" })
  );
  E.ledger(T)
    .filter((l) => l.st === "inv" || l.st === "acima")
    .forEach((l) => acts.push({ tone: "risk", t: (l.st === "inv" ? "Compensação no sentido invertido · " : "Compensação acima do saldo · ") + l.t.placa, s: dBR(l.t.carreg) + " · " + skm(l.t.kmComp) + " km", id: l.t.id, tag: "conferir" }));
  if (isAdmin)
    T.filter((x) => !x.hist && x.modo !== "spot" && x.fCte != null && x.previsto != null && Math.abs(x.fCte - x.previsto) > 1).forEach((x) =>
      acts.push({ tone: "ok", t: "CT-e fora da metodologia · " + x.placa, s: dBR(x.carreg) + " · " + sbrl(r2(x.fCte! - x.previsto!)), id: x.id, tag: "conferir" })
    );
  const MAX = 6;
  const bar = { risk: "bg-red-500", warn: "bg-amber-500", info: "bg-sky-500", ok: "bg-brand-600" };
  const pill = { risk: "risk", warn: "warn", info: "info", ok: "ok" } as const;
  return (
    <Panel title={<>Precisa de ação <TeamTag /></>} sub="Do mais urgente ao menos urgente.">
      {acts.length ? (
        <ul className="flex flex-col gap-2">
          {acts.slice(0, MAX).map((a, i) => (
            <li key={i}>
              <button type="button" onClick={() => open(a.id)} className="grid w-full grid-cols-[4px_1fr_auto] items-center gap-3 rounded-lg bg-navy-50 px-3 py-2 text-left hover:bg-navy-100">
                <span className={`h-full min-h-8 rounded ${bar[a.tone]}`} />
                <span className="min-w-0 text-sm font-medium text-navy-900">
                  {a.t}
                  <small className="block truncate font-normal text-navy-500">{a.s}</small>
                </span>
                <Pill tone={pill[a.tone]}>{a.tag}</Pill>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-navy-500">Tudo em dia.</p>
      )}
      {acts.length > MAX && <p className="mt-2 text-xs text-navy-500">e mais {acts.length - MAX}.</p>}
    </Panel>
  );
}

function DeliveriesPanel({ E, open }: { E: KmEngine; open: (id: string) => void }) {
  const C = E.comps();
  const tr = C.filter((c) => !c.e.entregue).sort((a, b) => (a.v.carreg < b.v.carreg ? -1 : 1));
  const ok = C.filter((c) => c.e.entregue).sort((a, b) => ((a.e.entregue ?? "") < (b.e.entregue ?? "") ? 1 : -1));
  const L = tr.slice(0, 4).concat(ok).slice(0, 7);
  return (
    <Panel title="Entregas" sub={`${tr.length} em trânsito · últimas realizadas.`}>
      {L.length ? (
        <ul className="flex flex-col gap-2">
          {L.map((c) => (
            <li key={c.e.id}>
              <button type="button" onClick={() => open(c.vid)} className="grid w-full grid-cols-[4px_1fr_auto] items-center gap-3 rounded-lg bg-navy-50 px-3 py-2 text-left hover:bg-navy-100">
                <span className={`h-full min-h-8 rounded ${c.e.entregue ? "bg-brand-600" : "bg-amber-500"}`} />
                <span className="min-w-0 text-sm font-medium text-navy-900">
                  {c.e.cliente}
                  <small className="block truncate font-normal text-navy-500">
                    {c.v.placa}{c.e.nf ? " · NF " + c.e.nf : ""} · {c.e.entregue ? "entregue em " + dBR(c.e.entregue) : "saiu em " + dBR(c.v.carreg)}
                  </small>
                </span>
                {c.e.entregue ? <Pill tone="ok">entregue</Pill> : <Pill tone="warn">em trânsito</Pill>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-navy-500">Sem entregas registradas.</p>
      )}
      <p className="mt-3 text-sm">
        <Link href="/km-exato/entregas" className="font-medium text-brand-700 hover:underline">Ver todas as entregas</Link>
      </p>
    </Panel>
  );
}

export default function KmPainelPage() {
  const km$ = useKm();
  const E = km$.engine;
  const [mesSel, setMes] = useState<string | null>(null);
  const [dialog, setDialog] = useState<TripDialog>(null);
  const counts = useTabCounts(E);
  const mes = mesSel ?? (E ? defaultMonth(E) : monthOf(todayISO()));
  const T = useMemo(() => (E ? E.trips() : []), [E]);

  // Operação do mês (todas as modalidades).
  const O = useMemo(() => {
    const L = T.filter((t) => !t.hist && t.status !== "cancelada" && monthOf(t.carreg) === mes);
    const H = T.filter((t) => t.hist && monthOf(t.carreg) === mes);
    const o = { n: L.length + H.length, ded: 0, rota: 0, spot: 0, ent: 0, entOk: 0, peso: 0, pesoN: 0 };
    L.forEach((t) => {
      o[t.modo === "spot" ? "spot" : t.modo === "rota" ? "rota" : "ded"]++;
      t.entregas.forEach((e) => {
        o.ent++;
        if (e.entregue) o.entOk++;
        if ((e.peso ?? 0) > 0) {
          o.peso += +e.peso!;
          o.pesoN++;
        }
      });
    });
    H.forEach((t) => {
      o.ded++;
      o.ent += t.ne || 0;
      o.entOk += t.ne || 0;
    });
    return o;
  }, [T, mes]);

  const common = E ? { engine: E, userName: km$.userName, isAdmin: km$.isAdmin, onChanged: km$.reload } : null;

  return (
    <KmPage
      title="Painel"
      subtitle={`Operação dedicada Btech · ${monFull(mes)}`}
      active="/km-exato"
      isAdmin={km$.isAdmin}
      canView={km$.canView}
      authLoading={km$.authLoading}
      error={km$.error}
      loading={!E}
      counts={counts}
      actions={
        km$.canView && (
          <div className="flex flex-wrap items-center gap-3">
            <MonthPicker value={mes} onChange={setMes} />
            <button type="button" className={buttonClasses("primary", "md")} onClick={() => setDialog({ kind: "new" })}>Nova viagem</button>
          </div>
        )
      }
    >
      {E && (
        <div className="flex flex-col gap-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <SaldoCard E={E} T={T} />
            <ProdCard E={E} T={T} mes={mes} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Panel>
              <p className="text-xs text-navy-500">Viagens</p>
              <b className="font-mono text-2xl text-navy-900">{O.n}</b>
              <p className="text-xs text-navy-500">{[O.ded ? `${O.ded} dedicada${O.ded > 1 ? "s" : ""}` : "", O.rota ? `${O.rota} rota do contrato` : "", O.spot ? `${O.spot} spot` : ""].filter(Boolean).join(" · ") || "—"}</p>
            </Panel>
            <Panel>
              <p className="text-xs text-navy-500">Entregas realizadas</p>
              <b className="font-mono text-2xl text-navy-900">{O.entOk}<span className="text-sm text-navy-500">/{O.ent}</span></b>
              <p className="text-xs text-navy-500">{O.ent - O.entOk ? `${O.ent - O.entOk} em trânsito` : "todas realizadas"}</p>
            </Panel>
            <Panel>
              <p className="text-xs text-navy-500">Peso transportado</p>
              <b className="font-mono text-2xl text-navy-900">{O.peso ? nf(O.peso / 1000, 1) + " t" : "—"}</b>
              <p className="text-xs text-navy-500">{O.peso && O.pesoN < O.ent ? `em ${O.pesoN} de ${O.ent} entregas` : O.peso ? "todas as entregas" : "peso entra pelos XML"}</p>
            </Panel>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <ActionsPanel E={E} T={T} isAdmin={km$.isAdmin} open={(id) => setDialog({ kind: "detail", id })} />
            <DeliveriesPanel E={E} open={(id) => setDialog({ kind: "detail", id })} />
          </div>
        </div>
      )}
      {common && <TripDialogs {...common} dialog={dialog} setDialog={setDialog} />}
    </KmPage>
  );
}
