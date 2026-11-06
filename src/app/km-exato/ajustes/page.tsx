"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useKm } from "@/lib/kmExato/useKm";
import { useTabCounts } from "@/lib/kmExato/useTabCounts";
import { todayISO, type KmEngine, type KmTariffValue } from "@/lib/kmExato/engine";
import { dBR, km, nf, parseNum, sbrl } from "@/lib/kmExato/format";
import { logConfig } from "@/lib/kmExato/actions";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";
import { Modal } from "@/components/Modal";
import { CurrencyInput } from "@/components/CurrencyInput";
import { KmPage, Panel, Pill, Plate, Signed } from "@/components/km/KmUi";
import { TripDialogs, type TripDialog } from "@/components/km/KmTripModals";

// KM Exato · Ajustes (só administradores). Cada alteração fica no histórico.

const inputCls = "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 disabled:bg-navy-50";
const labelCls = "mb-1 block text-sm font-medium text-navy-700";

function TariffModal({ E, onClose, onDone, userName }: { E: KmEngine; onClose: () => void; onDone: () => void; userName: string | null }) {
  const { toastError, toastSuccess } = useFeedback();
  const last: Record<string, KmTariffValue> = {};
  E.tarRows().forEach((r) => Object.keys(r.v || {}).forEach((k) => (last[k] = r.v[k])));
  const [desde, setDesde] = useState("");
  const [metodo, setMetodo] = useState<"piso" | "km">("piso");
  const [ref, setRef] = useState("");
  const [vals, setVals] = useState<Record<string, { ccd: string; cc: string; km: string }>>({});
  const rt = +E.R().retorno || 0.92;
  const read = () => {
    const v: Record<string, KmTariffValue> = {};
    E.tipos().forEach((tp) => {
      const x = vals[tp.id] ?? { ccd: "", cc: "", km: "" };
      if (metodo === "piso") {
        const ccd = parseNum(x.ccd);
        const cc = parseNum(x.cc);
        if (ccd != null && ccd > 0 && cc != null && cc >= 0) v[tp.id] = { ccd, cc, km: Math.round(((ccd * (1 + rt)) / 2) * 10000) / 10000 };
      } else {
        const k = parseNum(x.km);
        if (k != null && k > 0) v[tp.id] = { km: k, cc: 0 };
      }
    });
    return v;
  };
  const v = read();
  const affected = desde && Object.keys(v).length ? Object.values(E.S.viag).filter((x) => x.carreg >= desde && v[x.tipo || E.tipoOf(x.placa) || ""]).length : 0;
  const set = (tp: string, k: "ccd" | "cc" | "km", val: string) => setVals((s) => ({ ...s, [tp]: { ...(s[tp] ?? { ccd: "", cc: "", km: "" }), [k]: val } }));

  async function save() {
    if (!desde) return toastError("Informe a data de vigência.");
    if (!Object.keys(v).length) return toastError("Informe os valores de ao menos um equipamento.");
    if (E.tarRows().some((r) => r.desde === desde)) return toastError("Já existe uma tabela com essa vigência. Exclua a antiga antes.");
    const { error } = await supabase.from("km_tariffs").insert({ valid_from: desde, method: metodo, reference: ref.trim() || null, values: v });
    if (error) return toastError(error.message);
    await logConfig(`Tabela de tarifas a partir de ${dBR(desde)}: ` + Object.keys(v).map((k) => `${E.tipoNome(k)} ${nf(v[k].km, 4)}${v[k].cc ? " + CC " + nf(v[k].cc!, 2) : ""}`).join("; "), userName).catch(() => null);
    toastSuccess("Tabela de tarifas salva.");
    onDone();
  }

  return (
    <Modal onClose={onClose} labelledBy="km-tar-title" className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="km-tar-title" className="text-lg font-semibold text-navy-900">Nova tabela de tarifas</h2>
          <p className="text-sm text-navy-500">Os fretes e saldos das viagens carregadas a partir da data passam a usar estes valores.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="km-t-d">Vigente a partir de</label>
            <input id="km-t-d" type="date" className={inputCls} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="km-t-m">Metodologia</label>
            <select id="km-t-m" className={inputCls} value={metodo} onChange={(e) => setMetodo(e.target.value as "piso" | "km")}>
              <option value="piso">Piso ANTT · km + CC por viagem</option>
              <option value="km">Tarifa por km</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="km-t-r">Referência</label>
            <input id="km-t-r" className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ex.: Portaria SUROC nº 23/2026, Tabela A" />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {E.tipos().map((tp) => {
            const l = last[tp.id] ?? {};
            const x = vals[tp.id] ?? { ccd: "", cc: "", km: "" };
            return (
              <div key={tp.id} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1.2fr_1fr_1fr_1fr]">
                <b className="col-span-2 text-sm text-navy-900 sm:col-span-1">
                  {tp.nome}
                  <span className="block text-xs font-normal text-navy-500">{tp.eixos} eixos</span>
                </b>
                {metodo === "piso" ? (
                  <>
                    <div>
                      <label className={labelCls} htmlFor={`km-t-ccd-${tp.id}`}>CCD (R$/km)</label>
                      <input id={`km-t-ccd-${tp.id}`} inputMode="decimal" className={inputCls} value={x.ccd} onChange={(e) => set(tp.id, "ccd", e.target.value)} placeholder={l.ccd ? nf(l.ccd, 4) : ""} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor={`km-t-cc-${tp.id}`}>CC (R$)</label>
                      <input id={`km-t-cc-${tp.id}`} inputMode="decimal" className={inputCls} value={x.cc} onChange={(e) => set(tp.id, "cc", e.target.value)} placeholder={l.cc ? nf(l.cc, 2) : ""} />
                    </div>
                    <div>
                      <label className={labelCls} htmlFor={`km-t-km-${tp.id}`}>Valor do km</label>
                      <input id={`km-t-km-${tp.id}`} className={inputCls} disabled value={v[tp.id] ? nf(v[tp.id].km, 4) : ""} />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className={labelCls} htmlFor={`km-t-km2-${tp.id}`}>Valor do km</label>
                    <input id={`km-t-km2-${tp.id}`} inputMode="decimal" className={inputCls} value={x.km} onChange={(e) => set(tp.id, "km", e.target.value)} placeholder={l.km ? nf(l.km, 4) : ""} />
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-xs text-navy-500">
            {metodo === "piso" ? `Valor do km = CCD × (1 + ${nf(rt, 2)}) ÷ 2, calculado sozinho. ` : ""}Deixe em branco o equipamento que não muda.
          </p>
        </div>
        {affected > 0 && (
          <p className="rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-700">
            {affected} viage{affected === 1 ? "m" : "ns"} carregada{affected === 1 ? "" : "s"} a partir de {dBR(desde)} passa{affected === 1 ? "" : "m"} a usar esta tabela.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClasses("secondary", "md")} onClick={onClose}>Voltar</button>
          <button type="button" className={buttonClasses("primary", "md")} onClick={save}>Salvar tabela</button>
        </div>
      </div>
    </Modal>
  );
}

function SettlementModal({ E, onClose, onDone, userName }: { E: KmEngine; onClose: () => void; onDone: () => void; userName: string | null }) {
  const { toastError, toastSuccess } = useFeedback();
  const [data, setData] = useState(todayISO());
  const [placa, setPlaca] = useState("");
  const [w, setW] = useState<"Transbochnia" | "Btech">("Transbochnia");
  const [valor, setValor] = useState("");
  const [obs, setObs] = useState("");
  async function save() {
    const v = parseNum(valor);
    if (!(v != null && v > 0)) return toastError("Informe o valor.");
    const val = Math.round(v * 100) / 100;
    const { error } = await supabase.from("km_settlements").insert({
      settled_on: data || todayISO(),
      plate: placa || null,
      paid_to: w,
      value: val,
      effect: w === "Transbochnia" ? val : -val,
      note: obs.trim() || null,
      origin: "app",
    });
    if (error) return toastError(error.message);
    await logConfig(`Acerto registrado: ${dBR(data)} · ${placa || "Geral"} · pago para ${w} · R$ ${nf(val, 2)}`, userName).catch(() => null);
    toastSuccess("Acerto registrado.");
    onDone();
  }
  return (
    <Modal onClose={onClose} labelledBy="km-ac-title" className="max-w-xl">
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="km-ac-title" className="text-lg font-semibold text-navy-900">Registrar acerto</h2>
          <p className="text-sm text-navy-500">Entra no saldo na data informada.</p>
        </div>
        <p className="rounded-lg border border-navy-200 bg-navy-50 px-3 py-2 text-sm text-navy-700">Ex.: a Btech quitou R$ 10.000,00 de saldo a favor da Transbochnia → “Pago para: Transbochnia”, valor 10.000,00.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls} htmlFor="km-ac-d">Data</label><input id="km-ac-d" type="date" className={inputCls} value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div>
            <label className={labelCls} htmlFor="km-ac-p">Placa</label>
            <select id="km-ac-p" className={inputCls} value={placa} onChange={(e) => setPlaca(e.target.value)}>
              <option value="">Geral</option>
              {E.frota().map((f) => <option key={f.placa}>{f.placa}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="km-ac-w">Pago para</label>
            <select id="km-ac-w" className={inputCls} value={w} onChange={(e) => setW(e.target.value as "Transbochnia" | "Btech")}>
              <option>Transbochnia</option>
              <option>Btech</option>
            </select>
          </div>
          <div><label className={labelCls} htmlFor="km-ac-v">Valor (R$)</label><CurrencyInput id="km-ac-v" className={inputCls} value={valor} onChange={setValor} placeholder="0,00" /></div>
          <div className="sm:col-span-2"><label className={labelCls} htmlFor="km-ac-o">Observação</label><input id="km-ac-o" className={inputCls} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: CT-e complementar nº 132700" /></div>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClasses("secondary", "md")} onClick={onClose}>Voltar</button>
          <button type="button" className={buttonClasses("primary", "md")} onClick={save}>Registrar acerto</button>
        </div>
      </div>
    </Modal>
  );
}

function Rules({ E, userName, reload }: { E: KmEngine; userName: string | null; reload: () => void }) {
  const { toastError, toastSuccess, toastInfo } = useFeedback();
  const r = E.R();
  const [f, setF] = useState({
    meta: nf(+r.metaKm, 0), cmax: nf(E.compMax(), 0), lim: nf(+r.limite * 100, 0), prazo: nf(+r.prazoComp, 0),
    dias: nf(+r.diasAberta, 0), fator: nf(+r.fator, 3), pol: r.kmMinPolitica,
  });
  const fields: [keyof typeof f, string, string][] = [
    ["meta", "Km mínimo por veículo no mês", "Contrato, cl. 5.4"],
    ["cmax", "Compensação máxima por viagem (km)", ""],
    ["lim", "Desvio que pede motivo (%)", "km rodado × km estimado"],
    ["prazo", "Prazo do comprovante (dias)", "Após a entrega"],
    ["dias", "Alerta de viagem em aberto (dias)", ""],
    ["fator", "Fator do km estimado", "km estimado × fator"],
  ];
  async function save() {
    const p = {
      min_km_month: parseNum(f.meta), comp_max_km: parseNum(f.cmax), deviation_limit: (parseNum(f.lim) ?? NaN) / 100,
      proof_deadline_days: parseNum(f.prazo), open_alert_days: parseNum(f.dias), estimate_factor: parseNum(f.fator), min_km_policy: f.pol,
    };
    if (Object.values(p).some((v) => v === null || (typeof v === "number" && !isFinite(v)))) return toastError("Confira os valores.");
    const cur: Record<string, unknown> = { min_km_month: r.metaKm, comp_max_km: E.compMax(), deviation_limit: r.limite, proof_deadline_days: r.prazoComp, open_alert_days: r.diasAberta, estimate_factor: r.fator, min_km_policy: r.kmMinPolitica };
    const ch = Object.keys(p).filter((k) => String(cur[k]) !== String((p as Record<string, unknown>)[k])).map((k) => `${k} ${cur[k]} → ${(p as Record<string, unknown>)[k]}`);
    if (!ch.length) return toastInfo("Nada mudou.");
    const { error } = await supabase.from("km_settings").update({ ...p, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return toastError(error.message);
    await logConfig("Regras alteradas: " + ch.join("; "), userName).catch(() => null);
    toastSuccess("Regras salvas.");
    reload();
  }
  return (
    <Panel title="Regras">
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([k, l, h]) => (
          <div key={k}>
            <label className={labelCls} htmlFor={`km-r-${k}`}>{l}{h && <span className="font-normal text-navy-500"> · {h}</span>}</label>
            <input id={`km-r-${k}`} inputMode="decimal" className={inputCls} value={f[k]} onChange={(e) => setF((s) => ({ ...s, [k]: e.target.value }))} />
          </div>
        ))}
        <div>
          <label className={labelCls} htmlFor="km-r-pol">Km mínimo no fechamento</label>
          <select id="km-r-pol" className={inputCls} value={f.pol} onChange={(e) => setF((s) => ({ ...s, pol: e.target.value as "registrar" | "cobrar" }))}>
            <option value="registrar">Registrar, sem cobrança</option>
            <option value="cobrar">Faturar a diferença</option>
          </select>
        </div>
      </div>
      <div className="mt-4 flex justify-end"><button type="button" className={buttonClasses("primary", "md")} onClick={save}>Salvar regras</button></div>
    </Panel>
  );
}

function Routes({ E, userName, reload }: { E: KmEngine; userName: string | null; reload: () => void }) {
  const { toastError, toastSuccess, confirm: askConfirm } = useFeedback();
  const [n, setN] = useState("");
  const [k, setK] = useState("");
  async function add() {
    const kmN = parseNum(k);
    if (!n.trim() || !(kmN != null && kmN > 0)) return toastError("Informe o nome e o km.");
    const { error } = await supabase.from("km_routes").insert({ name: n.trim(), km: kmN, position: E.S.cfg.rotas.length });
    if (error) return toastError(error.message);
    await logConfig(`Rota incluída: ${n.trim()} · ${km(kmN)} km`, userName).catch(() => null);
    toastSuccess("Rota incluída.");
    setN("");
    setK("");
    reload();
  }
  async function del(id: string, nome: string) {
    if (!(await askConfirm(`Remover a rota "${nome}"?`, { confirmLabel: "Remover" }))) return;
    const { error } = await supabase.from("km_routes").delete().eq("id", id);
    if (error) return toastError(error.message);
    await logConfig(`Rota removida: ${nome}`, userName).catch(() => null);
    reload();
  }
  return (
    <Panel title="Rotas do contrato" sub="Km pré-estabelecido: sem controle de saldo, soma na produtividade mínima.">
      <ul className="flex flex-col gap-2">
        {E.S.cfg.rotas.length ? E.S.cfg.rotas.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-navy-50 px-3 py-2 text-sm">
            <span><b className="text-navy-900">{r.nome}</b><span className="block text-xs text-navy-500">{km(r.km)} km</span></span>
            <button type="button" className={buttonClasses("danger", "sm")} onClick={() => del(r.id!, r.nome)}>Remover</button>
          </li>
        )) : <li className="py-4 text-center text-sm text-navy-500">Nenhuma rota.</li>}
      </ul>
      <div className="mt-3 grid grid-cols-[2fr_1fr] gap-3">
        <div><label className={labelCls} htmlFor="km-rt-n">Nome</label><input id="km-rt-n" className={inputCls} value={n} onChange={(e) => setN(e.target.value)} placeholder="Ex.: Indaiatuba → Rio Claro/SP" /></div>
        <div><label className={labelCls} htmlFor="km-rt-k">Km</label><input id="km-rt-k" inputMode="numeric" className={inputCls} value={k} onChange={(e) => setK(e.target.value)} /></div>
      </div>
      <div className="mt-3 flex justify-end"><button type="button" className={buttonClasses("secondary", "md")} onClick={add}>Incluir rota</button></div>
    </Panel>
  );
}

function Settings({ E, userName, reload, open }: { E: KmEngine; userName: string | null; reload: () => void; open: (id: string) => void }) {
  const { toastError, confirm: askConfirm } = useFeedback();
  const [tar, setTar] = useState(false);
  const [ac, setAc] = useState(false);
  const [log, setLog] = useState<{ at: string; by_name: string | null; action: string }[]>([]);
  useEffect(() => {
    supabase.from("km_config_log").select("at, by_name, action").order("at", { ascending: false }).limit(200).then(({ data }) => setLog(data ?? []));
  }, [E]);
  const today = todayISO();
  let cur: string | null = null;
  E.tarRows().forEach((x) => {
    if (x.desde <= today) cur = x.id;
  });
  const tps = E.tipos();
  const T = E.trips();
  const chg = E.chgDate();
  const conf = T.filter((x) => !x.hist && chg && x.carreg >= chg && x.fCte != null && x.previsto != null);
  const dif = conf.reduce((a, x) => a + (x.fCte! - x.previsto!), 0);
  const bad = conf.filter((x) => Math.abs(x.fCte! - x.previsto!) > 1);
  const A = E.S.acertos.slice().sort((a, b) => ((a.data || "") < (b.data || "") ? 1 : -1));

  async function delTar(id: string, desde: string) {
    if (!(await askConfirm(`Excluir a tabela de ${dBR(desde)}? As viagens desse período voltam a usar a tabela anterior.`))) return;
    const { error } = await supabase.from("km_tariffs").delete().eq("id", id);
    if (error) return toastError(error.message);
    await logConfig(`Tabela de ${dBR(desde)} excluída`, userName).catch(() => null);
    reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Tarifas" sub="Cada tabela vale a partir da vigência; as viagens carregadas desde então são recalculadas." right={<button type="button" className={buttonClasses("primary", "md")} onClick={() => setTar(true)}>Nova tabela</button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy-50 text-xs text-navy-500">
              <tr>
                <th className="px-3 py-2 font-medium">Vigência</th>
                <th className="px-3 py-2 font-medium">Metodologia</th>
                {tps.map((tp) => <th key={tp.id} className="px-3 py-2 text-right font-medium">{tp.nome.replace(/ \d eixos/, "")}</th>)}
                <th className="px-3 py-2 font-medium">Referência</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-100">
              {E.tarRows().slice().reverse().map((x) => (
                <tr key={x.id}>
                  <td className="px-3 py-2 font-mono">{dBR(x.desde)} {x.id === cur ? <Pill tone="ok">em vigor</Pill> : x.desde > today ? <Pill tone="warn">programada</Pill> : null}</td>
                  <td className="px-3 py-2">{x.metodo === "piso" ? "km + CC" : "por km"}</td>
                  {tps.map((tp) => {
                    const v = x.v?.[tp.id];
                    return <td key={tp.id} className="px-3 py-2 text-right font-mono">{v ? <>{nf(+v.km, 4)}{x.metodo === "piso" && <span className="block text-[11px] text-navy-500">CC {nf(+(v.cc ?? 0), 2)}</span>}</> : <span className="text-navy-400">—</span>}</td>;
                  })}
                  <td className="px-3 py-2 text-xs text-navy-600">{x.ref}</td>
                  <td className="px-3 py-2 text-right">{E.tarRows().length > 1 && <button type="button" className={buttonClasses("danger", "sm")} onClick={() => delTar(x.id, x.desde)}>Excluir</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Rules E={E} userName={userName} reload={reload} />
        <Routes E={E} userName={userName} reload={reload} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Acertos em dinheiro" sub="Parte do saldo paga fora do faturamento das viagens." right={<button type="button" className={buttonClasses("primary", "md")} onClick={() => setAc(true)}>Registrar</button>}>
          {A.length ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-navy-100">
                {A.map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-3 font-mono">{dBR(a.data)}</td>
                    <td className="py-2 pr-3">{a.placa ? <Plate plate={a.placa} /> : "Geral"}</td>
                    <td className="py-2 pr-3 text-right"><Signed v={E.acEf(a)} /></td>
                    <td className="py-2 text-xs text-navy-600">{a.obs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="py-4 text-center text-sm text-navy-500">Nenhum acerto.</p>}
        </Panel>
        <Panel title="Faturamento × metodologia" sub={`CT-e emitidos desde ${dBR(chg)} comparados com km faturado × valor do km + CC da tabela vigente.`}>
          {conf.length ? (
            <>
              <table className="w-full text-sm">
                <thead className="text-xs text-navy-500">
                  <tr><th className="py-1 text-left font-medium">Viagem</th><th className="py-1 text-right font-medium">Km fat.</th><th className="py-1 text-right font-medium">Previsto</th><th className="py-1 text-right font-medium">CT-e</th><th className="py-1 text-right font-medium">Diferença</th></tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {conf.slice(0, 8).map((x) => {
                    const d = Math.round((x.fCte! - x.previsto!) * 100) / 100;
                    return (
                      <tr key={x.id} className="cursor-pointer hover:bg-navy-50" onClick={() => open(x.id)}>
                        <td className="py-1.5"><Plate plate={x.placa} /> <span className="text-xs text-navy-500">{dBR(x.carreg)}</span></td>
                        <td className="py-1.5 text-right font-mono">{km(x.kmFat)}</td>
                        <td className="py-1.5 text-right font-mono">{nf(x.previsto!, 2)}</td>
                        <td className="py-1.5 text-right font-mono">{nf(x.fCte!, 2)}</td>
                        <td className="py-1.5 text-right">{Math.abs(d) <= 1 ? <Pill tone="ok">ok</Pill> : <span className="font-mono text-red-700">{sbrl(d)}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${bad.length ? "bg-red-50 text-red-800" : "bg-teal-50 text-teal-900"}`}>
                {bad.length
                  ? <><b>{bad.length} de {conf.length}</b> CT-e fora da metodologia · diferença total {sbrl(Math.round(dif * 100) / 100)}, já lançada no saldo. Corrija a emissão: abaixo do previsto, o frete pode ficar abaixo do piso e travar o CIOT.</>
                  : "Todos os CT-e conferem com a metodologia."}
              </p>
            </>
          ) : <p className="py-4 text-center text-sm text-navy-500">Sem CT-e lançados desde a mudança.</p>}
        </Panel>
      </div>

      <Panel title="Frota dedicada" sub="Saldo de abertura vindo do controle anterior.">
        <table className="w-full text-sm">
          <thead className="text-xs text-navy-500"><tr><th className="py-1 text-left font-medium">Placa</th><th className="py-1 text-left font-medium">Equipamento</th><th className="py-1 text-right font-medium">Saldo de abertura</th></tr></thead>
          <tbody className="divide-y divide-navy-100">
            {E.frota().map((f) => (
              <tr key={f.placa}><td className="py-2"><Plate plate={f.placa} /></td><td className="py-2 text-navy-700">{E.tipoNome(f.tipo)}</td><td className="py-2 text-right"><Signed v={+f.abertura} /></td></tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Acessos">
        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="rounded-lg bg-navy-50 p-3">
            <b className="text-navy-900">Equipe Transbochnia</b> <Pill tone="ok">pode editar</Pill>
            <p className="mt-1 text-navy-700">Perfis <b>Logística</b> e <b>Admin</b> do CotaFlow lançam e fecham viagens e entregas. Só <b>Admin</b> vê a conferência dos CT-e e esta aba de Ajustes.</p>
          </div>
          <div className="rounded-lg bg-navy-50 p-3">
            <b className="text-navy-900">Btech</b> <Pill tone="info">consulta</Pill>
            <p className="mt-1 text-navy-700">Consulta pelo portal do cliente do CotaFlow (próxima etapa), sem dados internos.</p>
          </div>
        </div>
      </Panel>

      <Panel title="Histórico de alterações">
        {log.length ? (
          <ul className="divide-y divide-dashed divide-navy-200 text-xs">
            {log.map((l, i) => (
              <li key={i} className="grid grid-cols-[120px_1fr] gap-3 py-1.5">
                <time className="font-mono text-navy-500">{new Date(l.at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time>
                <span className="text-navy-800">{l.action}{l.by_name ? <span className="text-navy-500"> · {l.by_name}</span> : null}</span>
              </li>
            ))}
          </ul>
        ) : <p className="py-4 text-center text-sm text-navy-500">Nada alterado ainda.</p>}
      </Panel>

      {tar && <TariffModal E={E} userName={userName} onClose={() => setTar(false)} onDone={() => { setTar(false); reload(); }} />}
      {ac && <SettlementModal E={E} userName={userName} onClose={() => setAc(false)} onDone={() => { setAc(false); reload(); }} />}
    </div>
  );
}

export default function KmAjustesPage() {
  const km$ = useKm();
  const E = km$.engine;
  const counts = useTabCounts(E);
  const [dialog, setDialog] = useState<TripDialog>(null);
  const common = E ? { engine: E, userName: km$.userName, isAdmin: km$.isAdmin, onChanged: km$.reload } : null;
  return (
    <KmPage
      title="Ajustes"
      subtitle="Só administradores. Cada alteração fica registrada."
      active="/km-exato/ajustes"
      isAdmin={km$.isAdmin}
      canView={km$.canView}
      authLoading={km$.authLoading}
      error={km$.error}
      loading={!E}
      counts={counts}
    >
      {!km$.isAdmin ? (
        <p className="rounded-xl border border-navy-200 bg-white px-6 py-10 text-center text-sm text-navy-500">Ajustes são só para administradores.</p>
      ) : (
        E && <Settings E={E} userName={km$.userName} reload={km$.reload} open={(id) => setDialog({ kind: "detail", id })} />
      )}
      {common && <TripDialogs {...common} dialog={dialog} setDialog={setDialog} />}
    </KmPage>
  );
}
