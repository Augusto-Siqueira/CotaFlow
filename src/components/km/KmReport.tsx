"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { todayISO, type KmEngine } from "@/lib/kmExato/engine";
import { brl, dBR, favTxt, km, monFull, monLab, nf, pct, sbrl, skm, ton } from "@/lib/kmExato/format";
import { PRESETS, applyPreset, initialFilter, reportData, reportStory, type Agg, type ReportData, type ReportFilter } from "@/lib/kmExato/report";
import { logConfig } from "@/lib/kmExato/actions";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";
import { Modal } from "@/components/Modal";
import { Panel, Pill, Plate, Signed } from "./KmUi";

// Relatórios do KM Exato (equipe e portal da Btech). Para quem não é admin,
// não aparecem a conferência de CT-e nem os botões de abono.

function niceStep(r: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(r, 1))));
  const f = r / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Divergência e compensação por mês: duas séries de barras + ponto do resultado. */
function MonthChart({ M }: { M: Agg[] }) {
  if (!M.length) return <p className="py-8 text-center text-sm text-navy-500">Sem viagens dedicadas concluídas no período.</p>;
  const W = 560;
  const H = 220;
  const L = 52;
  const Rr = 10;
  const Tp = 14;
  const B = 26;
  const n = M.length;
  const vals = [0];
  M.forEach((r) => vals.push(r.op, r.cp, r.res));
  let mn = Math.min(...vals);
  let mx = Math.max(...vals);
  const st = niceStep((mx - mn) / 4 || 1);
  mn = Math.floor(mn / st) * st;
  mx = Math.ceil(mx / st) * st;
  if (mx === mn) mx = mn + st;
  const y = (v: number) => Tp + ((mx - v) / (mx - mn)) * (H - Tp - B);
  const bw = (W - L - Rr) / n;
  const x = (i: number) => L + bw * i + bw / 2;
  const w = Math.min(18, bw * 0.32);
  const ticks: number[] = [];
  for (let v = mn; v <= mx + 1e-6; v += st) ticks.push(v);
  const every = Math.ceil(n / 7);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Divergência e compensação por mês">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - Rr} y1={y(v)} y2={y(v)} className="stroke-navy-100" />
            <text x={L - 6} y={y(v) + 3} textAnchor="end" className="fill-navy-500 font-mono text-[10px]">
              {(v < 0 ? "−" : "") + nf(Math.abs(v) / 1000, 0)}k
            </text>
          </g>
        ))}
        <line x1={L} x2={W - Rr} y1={y(0)} y2={y(0)} className="stroke-navy-400" />
        {M.map((r, i) => {
          const y0 = y(0);
          const bars: [number, string, number, string][] = [
            [r.op, "fill-kmdiv", -1, "Divergência"],
            [r.cp, "fill-kmcomp", 1, "Compensação"],
          ];
          return (
            <g key={r.mes}>
              {bars.map(([v, cls, side, nome]) => {
                const y1 = y(v);
                return (
                  <rect key={nome} x={x(i) + (side < 0 ? -w - 1 : 1)} width={w} y={Math.min(y0, y1)} height={Math.max(1, Math.abs(y1 - y0))} rx={2} className={cls}>
                    <title>{`${monLab(r.mes!)} · ${nome}: ${sbrl(v)}`}</title>
                  </rect>
                );
              })}
              <circle cx={x(i)} cy={y(r.res)} r={4} className="fill-white stroke-navy-900" strokeWidth={1.6}>
                <title>{`Resultado ${monLab(r.mes!)}: ${sbrl(r.res)}`}</title>
              </circle>
              {((n - 1 - i) % every === 0 || i === n - 1) && (
                <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-navy-500 font-mono text-[10px]">
                  {monLab(r.mes!)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-xs text-navy-600">
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-kmdiv" />divergência (km rodado × estimado)</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-kmcomp" />compensação</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full border-2 border-navy-900 bg-white" />resultado do mês</span>
      </div>
      <p className="mt-1 text-xs text-navy-500">Abaixo de zero, a favor da Transbochnia. Passe o mouse nas barras para ver os valores.</p>
    </div>
  );
}

function MinCell({ D, placa, isAdmin, onAbono }: { D: ReportData; placa: string; isAdmin: boolean; onAbono: (key: string, has: boolean) => void }) {
  const ms = D.prod.filter((x) => x.placa === placa);
  if (!ms.length) return <span className="text-navy-400">mês em curso</span>;
  const ab = ms.filter((x) => x.def > 0 && !x.abono);
  if (ms.length === 1) {
    const x = ms[0];
    if (x.def <= 0) return <Pill tone="ok">na meta</Pill>;
    if (x.abono)
      return (
        <span className="inline-flex items-center gap-2" title={x.abono.motivo}>
          <Pill tone="mute">abonado</Pill>
          {isAdmin && <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => onAbono(x.mes + "_" + placa, true)}>Remover</button>}
        </span>
      );
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-sm text-navy-800">−{km(x.def)} km</span>
        {isAdmin && <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => onAbono(x.mes + "_" + placa, false)}>Abonar</button>}
      </span>
    );
  }
  return ab.length ? <span className="text-sm text-navy-800">{ab.length} de {ms.length} meses abaixo</span> : <Pill tone="ok">na meta</Pill>;
}

function AbonoModal({ k, onClose, onDone, userName }: { k: string; onClose: () => void; onDone: () => void; userName: string | null }) {
  const { toastError, toastSuccess } = useFeedback();
  const [motivo, setMotivo] = useState("");
  const [mes, placa] = k.split("_");
  async function save() {
    if (!motivo.trim()) {
      toastError("Informe o motivo.");
      return;
    }
    const { error } = await supabase.from("km_waivers").insert({ month: mes, plate: placa, reason: motivo.trim() });
    if (error) {
      toastError(error.message);
      return;
    }
    await logConfig(`Km mínimo abonado: ${placa} · ${monLab(mes)} · ${motivo.trim()}`, userName).catch(() => null);
    toastSuccess("Km mínimo abonado.");
    onDone();
  }
  return (
    <Modal onClose={onClose} labelledBy="km-abono-title" className="max-w-lg">
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="km-abono-title" className="text-lg font-semibold text-navy-900">Abonar km mínimo</h2>
          <p className="text-sm text-navy-500">{placa} · {monFull(mes)}</p>
        </div>
        <p className="rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-700">Use quando a diferença de km não é atribuível à Btech (cl. 6.15), como manutenção do veículo.</p>
        <div>
          <label className="mb-1 block text-sm font-medium text-navy-700" htmlFor="km-abono-m">Motivo</label>
          <input id="km-abono-m" className="w-full rounded-lg border border-navy-300 px-3 py-2 text-sm" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: veículo em manutenção de 10 a 18/11" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClasses("secondary", "md")} onClick={onClose}>Voltar</button>
          <button type="button" className={buttonClasses("primary", "md")} onClick={save}>Abonar</button>
        </div>
      </div>
    </Modal>
  );
}

export function KmReport({ E, isAdmin, userName, reload, open }: { E: KmEngine; isAdmin: boolean; userName: string | null; reload: () => void; open?: (id: string) => void }) {
  const { toastError, toastSuccess, confirm: askConfirm } = useFeedback();
  const [f, setF] = useState<ReportFilter>(() => initialFilter(E));
  const [abono, setAbono] = useState<string | null>(null);
  const [busy, setBusy] = useState<"xlsx" | "pdf" | null>(null);
  const D = reportData(E, f, isAdmin);
  const K = D.K;
  const c = D.cps;

  function togglePlate(p: string) {
    setF((cur) => {
      if (p === "*") return { ...cur, placas: [] };
      const pl = cur.placas.includes(p) ? cur.placas.filter((x) => x !== p) : [...cur.placas, p];
      return { ...cur, placas: pl.length === E.frota().length ? [] : pl };
    });
  }

  async function onAbono(key: string, has: boolean) {
    if (!has) {
      setAbono(key);
      return;
    }
    if (!(await askConfirm("Remover o abono deste mês?", { confirmLabel: "Remover" }))) return;
    const [mes, placa] = key.split("_");
    const { error } = await supabase.from("km_waivers").delete().eq("month", mes).eq("plate", placa);
    if (error) {
      toastError(error.message);
      return;
    }
    await logConfig(`Abono removido: ${placa} · ${monLab(mes)}`, userName).catch(() => null);
    toastSuccess("Abono removido.");
    reload();
  }

  async function exportFile(kind: "xlsx" | "pdf") {
    setBusy(kind);
    try {
      const Dx = reportData(E, f, false); // sempre o recorte sem dados internos
      const name = `km-exato_${f.de}_a_${f.ate}`;
      const { downloadBlob, buildReportXlsx } = await import("@/lib/kmExato/exportXlsx");
      if (kind === "xlsx") {
        downloadBlob(await buildReportXlsx(E, Dx), name + ".xlsx");
      } else {
        const [{ pdf }, { KmReportPdf }] = await Promise.all([import("@react-pdf/renderer"), import("@/lib/kmExato/ReportPdf")]);
        const blob = await pdf(<KmReportPdf D={Dx} logoUrl={`${window.location.origin}/logo.png`} />).toBlob();
        downloadBlob(blob, name + ".pdf");
      }
      toastSuccess("Arquivo gerado.");
    } catch (e) {
      console.error(e);
      toastError("Não foi possível gerar o arquivo.");
    } finally {
      setBusy(null);
    }
  }

  const segBtn = (on: boolean) => `px-3 py-1.5 text-sm font-medium ${on ? "bg-brand-700 text-white" : "bg-white text-navy-600 hover:bg-navy-50"}`;
  const chip = (on: boolean) => `rounded-full border px-3 py-1 font-mono text-xs font-semibold ${on ? "border-navy-900 bg-navy-900 text-white" : "border-navy-300 bg-white text-navy-700 hover:bg-navy-50"}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end gap-2">
        <button type="button" disabled={busy !== null} className={buttonClasses("secondary", "md")} onClick={() => exportFile("xlsx")}>{busy === "xlsx" ? "Gerando..." : "Excel"}</button>
        <button type="button" disabled={busy !== null} className={buttonClasses("primary", "md")} onClick={() => exportFile("pdf")}>{busy === "pdf" ? "Gerando..." : "PDF"}</button>
      </div>

      <Panel>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 text-sm font-semibold text-navy-700">Período</span>
            <div className="flex flex-wrap overflow-hidden rounded-lg border border-navy-300">
              {PRESETS.map(([k, l]) => (
                <button key={k} type="button" className={segBtn(f.pre === k)} onClick={() => setF((cur) => applyPreset(cur, k))}>{l}</button>
              ))}
            </div>
            <span className="inline-flex items-center gap-2 text-sm text-navy-500">
              <input type="date" aria-label="De" value={f.de} onChange={(e) => setF((cur) => ({ ...cur, pre: "custom", de: e.target.value }))} className="rounded-lg border border-navy-300 px-2 py-1.5 text-sm text-navy-900" />
              até
              <input type="date" aria-label="Até" value={f.ate} onChange={(e) => setF((cur) => ({ ...cur, pre: "custom", ate: e.target.value }))} className="rounded-lg border border-navy-300 px-2 py-1.5 text-sm text-navy-900" />
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 text-sm font-semibold text-navy-700">Veículos</span>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={chip(!f.placas.length)} onClick={() => togglePlate("*")}>Todos</button>
              {E.frota().map((x) => (
                <button key={x.placa} type="button" className={chip(f.placas.includes(x.placa))} onClick={() => togglePlate(x.placa)}>{x.placa}</button>
              ))}
              <button type="button" className={chip(f.placas.includes("SPOT"))} onClick={() => togglePlate("SPOT")}>Spot</button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-20 text-sm font-semibold text-navy-700">Viagens</span>
            <div className="flex overflow-hidden rounded-lg border border-navy-300">
              <button type="button" className={segBtn(f.st === "fechada")} onClick={() => setF((cur) => ({ ...cur, st: "fechada" }))}>Concluídas</button>
              <button type="button" className={segBtn(f.st === "todas")} onClick={() => setF((cur) => ({ ...cur, st: "todas" }))}>Todas</button>
            </div>
            <input type="search" aria-label="Buscar" value={f.q} onChange={(e) => setF((cur) => ({ ...cur, q: e.target.value }))} placeholder="Cliente, destino, NF ou CT-e" className="w-full max-w-xs rounded-lg border border-navy-300 px-3 py-1.5 text-sm text-navy-900" />
          </div>
        </div>
      </Panel>

      <p className="rounded-xl border border-navy-200 border-l-4 border-l-brand-600 bg-white px-4 py-3 text-sm leading-relaxed text-navy-800 shadow-sm">{reportStory(D)}</p>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <p className="text-xs text-navy-500">Saldo atual · {D.todas ? "frota" : "veículos filtrados"}</p>
          <b className="font-mono text-2xl text-navy-900">{brl(D.saldo)}</b>
          <p className="text-xs text-navy-500">{favTxt(D.saldo)}</p>
        </Panel>
        <Panel>
          <p className="text-xs text-navy-500">Resultado do período</p>
          <b className="font-mono text-2xl text-navy-900">{brl(K.res)}</b>
          <p className="text-xs text-navy-500">{Math.abs(K.res) < 0.005 ? "sem diferença" : favTxt(K.res)} · {K.n} viagens dedicadas</p>
        </Panel>
        <Panel>
          <p className="text-xs text-navy-500">Km rodado × km estimado</p>
          <b className="font-mono text-2xl text-navy-900">{pct(K.desv)}</b>
          <p className="text-xs text-navy-500">{km(K.real)} rodados × {km(K.rota)} da rota</p>
        </Panel>
        <Panel>
          <p className="text-xs text-navy-500">Viagens · entregas · peso</p>
          <b className="font-mono text-2xl text-navy-900">{K.nAll} <span className="text-sm text-navy-500">· {K.ent} · {K.peso ? nf(K.peso / 1000, 1) + " t" : "—"}</span></b>
          <p className="text-xs text-navy-500">{[K.ded ? `${K.ded} dedicadas` : "", K.nrota ? `${K.nrota} rota do contrato` : "", K.spot ? `${K.spot} spot` : ""].filter(Boolean).join(" · ") || "—"}</p>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel title="Divergência e compensação por mês" sub="Só viagens dedicadas concluídas.">
          <MonthChart M={D.porMes.slice(-14)} />
        </Panel>
        <Panel title="Composição do saldo" sub={`${D.todas ? "Frota" : "Veículos filtrados"}, desde a abertura do controle.`}>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-navy-100">
              <tr><td className="py-2 text-navy-700">Abertura (controle anterior)</td><td className="py-2 text-right"><Signed v={c.ab} /></td></tr>
              <tr><td className="py-2 text-navy-700">Divergência · km rodado × km estimado</td><td className="py-2 text-right"><Signed v={c.op} /></td></tr>
              <tr><td className="py-2 text-navy-700">Compensado no km faturado</td><td className="py-2 text-right"><Signed v={c.comp} /></td></tr>
              {isAdmin && Math.abs(c.fat) > 0.004 && <tr><td className="py-2 text-navy-700">CT-e × metodologia <span className="text-xs text-navy-500">(só admin)</span></td><td className="py-2 text-right"><Signed v={c.fat} /></td></tr>}
              {Math.abs(c.ac) > 0.004 && <tr><td className="py-2 text-navy-700">Acertos em dinheiro</td><td className="py-2 text-right"><Signed v={c.ac} /></td></tr>}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-navy-200"><td className="py-2 font-semibold">Saldo atual</td><td className="py-2 text-right"><Signed v={c.saldo} strong /></td></tr>
            </tfoot>
          </table>
        </Panel>
      </div>

      <Panel title="Por veículo" sub={`Km rodado soma o odômetro das dedicadas e o km fixo das rotas do contrato, que contam para o mínimo de ${km(+E.R().metaKm || 8000)} km (cl. 5.4).`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy-50 text-xs text-navy-500">
              <tr>
                {["Veículo", "Viagens", "Entregas", "Peso", "Km rodado", "Variação", "Compensação", "Resultado", "Saldo atual", "Km mínimo"].map((h, i) => (
                  <th key={h} className={`px-3 py-2 font-medium ${i > 0 && i < 9 ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {D.porPlaca.map((a) => (
                <tr key={a.placa}>
                  <td className="px-3 py-2"><Plate plate={a.placa!} /></td>
                  <td className="px-3 py-2 text-right">{a.nAll}</td>
                  <td className="px-3 py-2 text-right">{a.ent}</td>
                  <td className="px-3 py-2 text-right">{ton(a.peso)}</td>
                  <td className="px-3 py-2 text-right font-mono">{km(a.kmProd)}</td>
                  <td className="px-3 py-2 text-right font-mono">{pct(a.desv)}</td>
                  <td className="px-3 py-2 text-right">{Math.abs(a.cp) > 0.004 ? <Signed v={a.cp} /> : "—"}</td>
                  <td className="px-3 py-2 text-right">{a.n ? <Signed v={a.res} strong /> : "—"}</td>
                  <td className="px-3 py-2 text-right"><Signed v={a.saldo ?? 0} /></td>
                  <td className="px-3 py-2"><MinCell D={D} placa={a.placa!} isAdmin={isAdmin} onAbono={onAbono} /></td>
                </tr>
              ))}
              {D.spot && (
                <tr>
                  <td className="px-3 py-2"><Pill tone="warn">spot</Pill></td>
                  <td className="px-3 py-2 text-right">{D.spot.nAll}</td>
                  <td className="px-3 py-2 text-right">{D.spot.ent}</td>
                  <td className="px-3 py-2 text-right">{ton(D.spot.peso)}</td>
                  <td className="px-3 py-2 text-navy-500" colSpan={6}>sem controle de saldo</td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-navy-200 font-semibold">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right">{K.nAll}</td>
                <td className="px-3 py-2 text-right">{K.ent}</td>
                <td className="px-3 py-2 text-right">{ton(K.peso)}</td>
                <td className="px-3 py-2 text-right font-mono">{km(D.porPlaca.reduce((s, a) => s + a.kmProd, 0))}</td>
                <td className="px-3 py-2 text-right font-mono">{pct(K.desv)}</td>
                <td className="px-3 py-2 text-right"><Signed v={K.cp} /></td>
                <td className="px-3 py-2 text-right"><Signed v={K.res} strong /></td>
                <td className="px-3 py-2 text-right"><Signed v={D.saldo} strong /></td>
                <td className="px-3 py-2 text-sm font-normal">{D.prod.length ? (D.prodAb.length ? `${D.prodAb.length} abaixo` : "na meta") : ""}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <Panel title="Compensações no período">
        {D.comp.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-navy-50 text-xs text-navy-500">
                <tr>
                  {["Carregamento", "Placa", "Km estimado", "Compensação", "Valor", "Saldo antes", "Depois", ""].map((h, i) => (
                    <th key={i} className={`px-3 py-2 font-medium ${i >= 2 && i <= 6 ? "text-right" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100">
                {D.comp.slice(0, 40).map((l) => (
                  <tr key={l.t.id}>
                    <td className="px-3 py-2 font-mono">{dBR(l.t.carreg)}</td>
                    <td className="px-3 py-2"><Plate plate={l.t.placa} /></td>
                    <td className="px-3 py-2 text-right font-mono">{km(l.t.kmRota)}</td>
                    <td className="px-3 py-2 text-right font-mono font-semibold">{skm(l.t.kmComp)} km</td>
                    <td className="px-3 py-2 text-right"><Signed v={l.t.compRS} /></td>
                    <td className="px-3 py-2 text-right"><Signed v={l.antes} /></td>
                    <td className="px-3 py-2 text-right"><Signed v={l.depois} /></td>
                    <td className="px-3 py-2 text-right">{!l.t.hist && open && <button type="button" className={buttonClasses("soft", "sm")} onClick={() => open(l.t.id)}>Detalhes</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {D.comp.length > 40 && <p className="mt-2 text-xs text-navy-500">Mostrando 40 de {D.comp.length}. O Excel traz todas.</p>}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-navy-500">Nenhuma compensação no período.</p>
        )}
      </Panel>
      <p className="text-xs text-navy-500">Gerado em {dBR(todayISO())}. Excel e PDF saem sem os dados internos (conferência de CT-e), como a Btech vê.</p>

      {abono && <AbonoModal k={abono} userName={userName} onClose={() => setAbono(null)} onDone={() => { setAbono(null); reload(); }} />}
    </div>
  );
}

