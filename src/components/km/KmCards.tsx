"use client";

import { KmEngine, lastDay, monthOf, todayISO, type KmTrip } from "@/lib/kmExato/engine";
import { brl, favTxt, km, monLab, nf, sbrl } from "@/lib/kmExato/format";
import { FavorPill, Panel, Plate, SideDot, TeamTag } from "./KmUi";

// Cartões do Painel do KM Exato (equipe e portal da Btech).

/** Saldo mensal acumulado (últimos 12 meses), uma linha. */
export function SaldoLine({ M }: { M: { mes: string; saldo?: number }[] }) {
  if (M.length < 2) return null;
  const W = 260;
  const H = 70;
  const P = 6;
  const vals = M.map((r) => r.saldo ?? 0).concat([0]);
  const mn = Math.min(...vals);
  let mx = Math.max(...vals);
  if (mx === mn) mx = mn + 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / (M.length - 1);
  const y = (v: number) => P + ((mx - v) / (mx - mn)) * (H - 2 * P);
  const pts = M.map((r, i) => `${x(i).toFixed(1)},${y(r.saldo ?? 0).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Saldo acumulado nos últimos 12 meses">
      <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} className="stroke-navy-300" strokeDasharray="2 4" />
      <polyline points={pts.join(" ")} fill="none" className="stroke-navy-700" strokeWidth={2} strokeLinejoin="round" />
      {M.map((r, i) => (
        <g key={r.mes}>
          <circle cx={x(i)} cy={y(r.saldo ?? 0)} r={i === M.length - 1 ? 4 : 2.5} className={i === M.length - 1 ? "fill-brand-600" : "fill-navy-700"} />
          <circle cx={x(i)} cy={y(r.saldo ?? 0)} r={9} fill="transparent">
            <title>{`${monLab(r.mes)}: ${sbrl(r.saldo ?? 0)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

export function SaldoCard({ E, T }: { E: KmEngine; T: KmTrip[] }) {
  const SD = E.saldos(T);
  const t = SD.t;
  const M = E.monthly(T).slice(-12);
  const rows = E.frota()
    .map((f) => {
      const s = SD.p[f.placa] ?? { saldo: 0, pend: 0 };
      const tr = E.tarFor(f.tipo, todayISO());
      const net = s.saldo + s.pend;
      return { placa: f.placa, v: s.saldo, km: tr ? Math.floor(Math.abs(net) / tr.km) : 0, dir: net };
    })
    .sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const mx = rows.reduce((a, r) => Math.max(a, Math.abs(r.v)), 1);
  const kmA = rows.reduce((a, r) => a + (r.dir < 0 ? r.km : 0), 0);
  const kmB = rows.reduce((a, r) => a + (r.dir > 0 ? r.km : 0), 0);
  const nTb = rows.filter((r) => r.v < -0.004).length;
  const nBt = rows.filter((r) => r.v > 0.004).length;
  const top = rows[0];
  const ins =
    Math.abs(t.saldo) < 0.005
      ? "Saldo zerado em toda a frota."
      : (nBt && nTb ? `${nTb} placas a favor da Transbochnia e ${nBt} a favor da Btech` : `Todas as placas a favor da ${nTb ? "Transbochnia" : "Btech"}`) +
        `. Maior saldo: ${top.placa} (${brl(top.v)}).`;
  return (
    <Panel title="Saldo de km" sub="hoje · compensado viagem a viagem, na própria placa">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="font-mono text-4xl font-semibold tracking-tight text-navy-900">{brl(t.saldo)}</div>
          <div className="mt-2"><FavorPill v={t.saldo} /></div>
          {(kmA || kmB) > 0 && (
            <p className="mt-2 text-sm text-navy-700">
              {kmA ? <><b>{km(kmA)} km</b> a faturar a mais</> : null}
              {kmA && kmB ? " · " : ""}
              {kmB ? <><b>{km(kmB)} km</b> a faturar a menos</> : null}
            </p>
          )}
        </div>
        <div className="w-full max-w-64">
          <p className="text-xs text-navy-500">Saldo acumulado · últimos 12 meses</p>
          <SaldoLine M={M} />
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex justify-between text-[11px] text-navy-500">
          <span className="inline-flex items-center gap-1"><SideDot v={-1} />a favor da Transbochnia</span>
          <span className="inline-flex items-center gap-1">a favor da Btech<SideDot v={1} /></span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => {
            const w = (Math.abs(r.v) / mx) * 50;
            return (
              <li key={r.placa} className="grid grid-cols-[84px_1fr_110px] items-center gap-3 text-sm" title={`${r.placa}: ${sbrl(r.v)} (${favTxt(r.v)})`}>
                <Plate plate={r.placa} />
                <span className="relative h-3.5 rounded bg-navy-50">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-navy-300" />
                  {Math.abs(r.v) > 0.004 && (
                    <span
                      className={`absolute inset-y-0 rounded ${r.v < 0 ? "bg-kmtb" : "bg-kmbt"}`}
                      style={r.v < 0 ? { right: "50%", width: `${w}%` } : { left: "50%", width: `${w}%` }}
                    />
                  )}
                </span>
                <span className="text-right">
                  <b className="font-mono text-navy-900">{Math.abs(r.v) < 0.005 ? "zerado" : brl(r.v)}</b>
                  <small className="block text-[11px] text-navy-500">{r.km ? (r.dir < 0 ? "+" : "−") + km(r.km) + " km" : "—"}</small>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-4 text-sm text-navy-600">{ins}</p>
    </Panel>
  );
}

export function ProdCard({ E, T, mes, team = true }: { E: KmEngine; T: KmTrip[]; mes: string; team?: boolean }) {
  const R = E.R();
  const meta = +R.metaKm || 8000;
  const P = E.produt(T, mes);
  const cur = monthOf(todayISO());
  const parcial = mes >= cur;
  let frac = 1;
  if (mes === cur) frac = +todayISO().slice(8, 10) / +lastDay(mes).slice(8, 10);
  else if (mes > cur) frac = 0;
  const kmF = P.reduce((a, p) => a + p.km, 0);
  const metaF = P.length * meta;
  const pct0 = metaF ? kmF / metaF : 0;
  const alvo = meta * frac;
  const st = (p: (typeof P)[number]) => (p.abono ? "ab" : p.km >= meta ? "ok" : parcial ? (p.km >= alvo * 0.97 ? "ok" : "low") : "low");
  const ok = P.filter((p) => st(p) === "ok").length;
  const low = P.filter((p) => st(p) === "low");
  const falta = P.reduce((a, p) => a + (p.abono ? 0 : Math.max(0, meta - p.km)), 0);
  const proj = frac > 0 ? kmF / frac : 0;
  const worst = low.slice().sort((a, b) => a.km - b.km)[0];
  const ins = parcial
    ? (low.length ? `${low.length} veículo${low.length > 1 ? "s" : ""} abaixo do ritmo para ${km(meta)} km${worst ? `; o mais atrasado é ${worst.placa} (${km(worst.km)} km)` : ""}.` : "Toda a frota no ritmo da meta.") +
      ` Projeção do mês: ${km(proj)} km.`
    : low.length
      ? `${low.length} de ${P.length} veículos abaixo de ${km(meta)} km; faltaram ${km(falta)} km${worst ? `. Maior falta: ${worst.placa} (−${km(meta - worst.km)} km)` : ""}.`
      : "Toda a frota bateu a meta do contrato.";
  const val = team && !parcial ? P.reduce((a, p) => a + (p.abono ? 0 : p.valor), 0) : 0;
  return (
    <Panel title="Produtividade mínima" sub={`${monLab(mes)}${parcial ? " · em andamento" : ""} · meta de ${km(meta)} km por veículo (cl. 5.4)`}>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <div className="font-mono text-4xl font-semibold text-navy-900">{nf(pct0 * 100, 0)}%</div>
          <p className="text-sm text-navy-600">{km(kmF)} de {km(metaF)} km</p>
        </div>
        <div className="flex gap-6 text-sm">
          <div><b className="block font-mono text-xl text-navy-900">{ok}<span className="text-sm text-navy-500">/{P.length}</span></b><span className="text-navy-500">{parcial ? "no ritmo da meta" : "na meta"}</span></div>
          <div><b className="block font-mono text-xl text-navy-900">{parcial ? km(proj) : km(falta)} <span className="text-sm text-navy-500">km</span></b><span className="text-navy-500">{parcial ? "projeção do mês" : "faltaram para a meta"}</span></div>
        </div>
      </div>
      <ul className="mt-5 flex flex-col gap-2">
        {P.map((p) => {
          const s = st(p);
          const f = Math.min(p.km / meta, 1);
          return (
            <li key={p.placa} className="grid grid-cols-[84px_1fr_120px] items-center gap-3 text-sm" title={`${p.placa}: ${km(p.km)} de ${km(meta)} km`}>
              <Plate plate={p.placa} />
              <span className="relative h-3 rounded bg-navy-100">
                <span className={`absolute inset-y-0 left-0 rounded ${s === "ok" ? "bg-brand-600" : s === "ab" ? "bg-navy-400" : "bg-amber-500"}`} style={{ width: `${f * 100}%` }} />
                {parcial && frac > 0 && frac < 1 && <span className="absolute -inset-y-1 w-0.5 bg-navy-900" style={{ left: `${frac * 100}%` }} />}
              </span>
              <span className="text-right">
                <b className="font-mono text-navy-900">{nf(Math.min(p.km / meta, 9.99) * 100, 0)}%</b>
                <small className="block text-[11px] text-navy-500">{km(p.km)} km{s === "ab" ? " · abonado" : s === "low" ? " · abaixo" : ""}</small>
              </span>
            </li>
          );
        })}
      </ul>
      {parcial && <p className="mt-2 text-[11px] text-navy-500">A linha escura marca onde a frota deveria estar hoje.</p>}
      <p className="mt-3 text-sm text-navy-600">
        {ins}
        {val > 0 && (
          <>
            {" "}<TeamTag /> {brl(val)} previstos em contrato, {R.kmMinPolitica === "cobrar" ? "a faturar." : "registrados sem cobrança."}
          </>
        )}
      </p>
    </Panel>
  );
}

