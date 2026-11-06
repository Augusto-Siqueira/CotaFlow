// KM Exato — motor de cálculo. Tradução fiel das funções do app original
// ("KM Exato · Btech", artifact do claude.ai): mesmos nomes de campos internos
// (carreg, kmFat, difRS...) para facilitar a conferência linha a linha com o
// app. As telas montam o KmState a partir das tabelas km_* (ver ./load.ts).
//
// Sinal do saldo: NEGATIVO = a favor da Transbochnia; POSITIVO = a favor da Btech.

export interface KmRules {
  metaKm: number;
  compMax: number;
  limite: number;
  prazoComp: number;
  diasAberta: number;
  fator: number;
  kmMinPolitica: "registrar" | "cobrar";
  retorno: number;
}
export interface KmType { id: string; nome: string; eixos: number | null }
export interface KmFleet { placa: string; tipo: string; abertura: number }
export interface KmTariffValue { km: number; cc?: number; ccd?: number }
export interface KmTariff { id: string; desde: string; metodo: "km" | "piso"; ref: string | null; v: Record<string, KmTariffValue> }
export interface KmRoute { id?: string; nome: string; km: number }
export interface KmConfig { regras: KmRules; tipos: KmType[]; frota: KmFleet[]; tarifas: KmTariff[]; rotas: KmRoute[] }

export interface KmHistTrip { d: string; p: string; est: number | null; fat: number | null; real: number | null; vkm: number | null; dif: number | null; dst: string | null; ne: number | null }
export interface KmHistMonth { mes: string; viagens: KmHistTrip[] }

export interface KmDelivery {
  id: string;
  cliente: string;
  nf: string | null;
  cte: string | null;
  peso: number | null;
  freteCte: number | null;
  entregue: string | null;
  comp: { env: boolean; em?: string | null; por?: string | null; antes?: boolean; arq?: string | null; auto?: boolean };
  /** Comprovante do app do motorista ligado por NF/CT-e (ver proofs.ts). */
  proof?: { id: string; scheduleId: string; destination: string; at: string; photos: number; emailedAt: string | null };
  /** Entregue preenchido pela data do comprovante (não lançado à mão). */
  entregueAuto?: boolean;
}
export interface KmTripDoc {
  placa: string;
  tipo: string | null;
  cavalo?: string | null;
  modo?: "dedicado" | "rota" | "spot";
  rotaNome?: string | null;
  carreg: string;
  kmEst: number | null;
  kmRota: number | null;
  kmComp: number | null;
  kmFat: number | null;
  odoSaida: number | null;
  odoChegada: number | null;
  status: "aberta" | "fechada" | "cancelada";
  motivo?: string | null;
  motivoObs?: string | null;
  origem?: string | null;
  freteCte?: number | null;
  entregas: KmDelivery[];
}
export interface KmSettlement { id: string; data: string; placa: string | null; pagoPara: string | null; valor: number | null; efeito: number | null; obs: string | null }

export interface KmState {
  cfg: KmConfig;
  hist: KmHistMonth[];
  viag: Record<string, KmTripDoc>;
  acertos: KmSettlement[];
  abonos: Record<string, { motivo: string }>;
}

/** Viagem já calculada (o "o" do trips() original). */
export interface KmTrip {
  id: string;
  hist: boolean;
  placa: string;
  tipo: string | null;
  carreg: string;
  kmEst: number | null;
  kmFat: number | null;
  kmReal: number | null;
  kmRota: number | null;
  kmComp: number;
  compRS: number;
  vkm: number | null;
  cc: number;
  metodo: string | null;
  previsto: number | null;
  fCte: number | null;
  difFat: number;
  difKm: number | null;
  difKmRS: number | null;
  difRS: number | null;
  opKm: number | null;
  opRS: number | null;
  dst: string;
  ne: number;
  status: "aberta" | "fechada" | "cancelada";
  modo: "dedicado" | "rota" | "spot";
  ctl: boolean;
  origem?: string | null;
  motivo?: string | null;
  motivoObs?: string | null;
  rotaNome?: string | null;
  cavalo?: string | null;
  odoSaida?: number | null;
  odoChegada?: number | null;
  entregas: KmDelivery[];
  tarRef?: TarFor | null;
}

// ---------- helpers (iguais ao app) ----------
export const r2 = (v: number) => Math.round(v * 100) / 100;
export const pad = (n: number) => (n < 10 ? "0" + n : "" + n);
export const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
export const addDays = (iso: string, n: number) => {
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};
export const daysBetween = (a: string, b: string) =>
  Math.round((+new Date(b.slice(0, 10) + "T12:00:00") - +new Date(a.slice(0, 10) + "T12:00:00")) / 864e5);
export const monthOf = (iso: string) => String(iso).slice(0, 7);
export const shiftMon = (m: string, k: number) => {
  const p = m.split("-");
  let y = +p[0];
  let mo = +p[1] - 1 + k;
  y += Math.floor(mo / 12);
  mo = ((mo % 12) + 12) % 12;
  return y + "-" + pad(mo + 1);
};
export const lastDay = (m: string) => {
  const p = m.split("-");
  const d = new Date(+p[0], +p[1], 0);
  return m + "-" + pad(d.getDate());
};
export const median = (a: number[]) => {
  if (!a.length) return null;
  const b = a.slice().sort((x, y) => x - y);
  const m = b.length >> 1;
  return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
};

export interface TarFor { km: number; cc: number; ccd?: number; metodo: string; desde: string; ref: string | null; id: string }

export class KmEngine {
  /**
   * preset: viagens já calculadas (portal da Btech). O servidor calcula com os
   * dados completos e envia só o recorte sem dados internos; aqui o motor só
   * agrega (saldos, produtividade, relatórios) a partir delas.
   */
  constructor(public S: KmState, private preset?: KmTrip[]) {}

  R() { return this.S.cfg.regras; }
  tipos() { return this.S.cfg.tipos; }
  tipoNome(id: string | null) { return this.tipos().find((x) => x.id === id)?.nome ?? id ?? ""; }
  frota() { return this.S.cfg.frota; }
  tipoOf(p: string) { return this.frota().find((x) => x.placa === p)?.tipo ?? null; }

  // ---------- tarifas ----------
  tarRows() {
    return this.S.cfg.tarifas.slice().sort((a, b) => (a.desde < b.desde ? -1 : a.desde > b.desde ? 1 : 0));
  }
  tarFor(tipo: string | null, date: string): TarFor | null {
    let out: TarFor | null = null;
    if (!tipo) return null;
    this.tarRows().forEach((r) => {
      const v = r.v?.[tipo];
      if (r.desde <= date && v && v.km != null)
        out = { km: +v.km, cc: r.metodo === "piso" ? +(v.cc || 0) : 0, ccd: v.ccd, metodo: r.metodo, desde: r.desde, ref: r.ref, id: r.id };
    });
    return out;
  }
  chgDate() { return this.tarRows().find((x) => x.metodo === "piso")?.desde ?? null; }
  previsto(tipo: string, date: string, kmFat: number | null) {
    const t = this.tarFor(tipo, date);
    if (!t || kmFat == null) return null;
    return r2(kmFat * t.km + t.cc);
  }

  // ---------- dados derivados ----------
  ctes(v: KmTripDoc) {
    let s = 0;
    let n = 0;
    (v.entregas || []).forEach((e) => {
      if (e.freteCte != null) {
        s += +e.freteCte;
        n++;
      }
    });
    if (v.freteCte != null && !n) return +v.freteCte;
    return n ? r2(s) : null;
  }
  rotaOf(v: KmTripDoc) {
    if (v.kmRota != null) return +v.kmRota;
    if (v.kmEst == null) return v.kmFat != null ? +v.kmFat : null;
    return v.origem === "controle anterior" ? +v.kmEst : Math.round(v.kmEst * (+this.R().fator || 1));
  }
  compMax() { return +this.R().compMax || 600; }

  private _trips: KmTrip[] | null = null;
  trips(): KmTrip[] {
    if (this._trips) return this._trips;
    if (this.preset) {
      this._trips = this.preset.slice().sort((a, b) => (a.carreg < b.carreg ? 1 : a.carreg > b.carreg ? -1 : a.placa < b.placa ? -1 : 1));
      return this._trips;
    }
    const out: KmTrip[] = [];
    this.S.hist.forEach((h) => {
      (h.viagens || []).forEach((v, i) => {
        const o: KmTrip = {
          id: "h_" + h.mes + "_" + i, hist: true, placa: v.p, tipo: this.tipoOf(v.p), carreg: v.d, kmEst: v.est, kmFat: v.fat, kmReal: v.real, vkm: v.vkm,
          difKm: v.fat != null && v.real != null ? v.fat - v.real : null, difRS: v.dif, dst: v.dst ?? "", ne: v.ne ?? 0, status: "fechada", entregas: [],
          metodo: "km", difFat: 0, modo: "dedicado", ctl: true, kmRota: null, kmComp: 0, compRS: 0, cc: 0, previsto: null, fCte: null, difKmRS: null, opKm: null, opRS: null,
        };
        o.kmRota = v.est != null ? v.est : v.fat;
        o.kmComp = v.fat != null && o.kmRota != null ? v.fat - o.kmRota : 0;
        if (Math.abs(o.kmComp) < 10) o.kmComp = 0;
        o.compRS = r2(o.kmComp * (v.vkm || 0));
        o.opKm = o.kmRota != null && v.real != null ? o.kmRota - v.real : null;
        o.opRS = v.dif != null ? r2(v.dif - o.compRS) : null;
        out.push(o);
      });
    });
    Object.keys(this.S.viag).forEach((id) => {
      const v = this.S.viag[id];
      const tipo = v.tipo || this.tipoOf(v.placa);
      const t = this.tarFor(tipo, v.carreg);
      const o: KmTrip = {
        id, hist: false, placa: v.placa, tipo, carreg: v.carreg, kmEst: v.kmEst, kmFat: v.kmFat, kmReal: null, kmRota: null, kmComp: 0, compRS: 0,
        vkm: t ? t.km : null, cc: t ? t.cc : 0, metodo: t ? t.metodo : null, tarRef: t, previsto: null, fCte: null, difFat: 0, difKm: null, difKmRS: null,
        difRS: null, opKm: null, opRS: null, dst: (v.entregas || []).map((e) => e.cliente).join(" · "), ne: (v.entregas || []).length, status: v.status,
        modo: v.modo || "dedicado", ctl: true, origem: v.origem, motivo: v.motivo, motivoObs: v.motivoObs, rotaNome: v.rotaNome, cavalo: v.cavalo,
        odoSaida: v.odoSaida, odoChegada: v.odoChegada, entregas: v.entregas || [],
      };
      o.kmReal = v.odoChegada != null && v.odoSaida != null ? v.odoChegada - v.odoSaida : null;
      o.kmRota = this.rotaOf(v);
      o.kmComp = v.kmFat != null && o.kmRota != null ? v.kmFat - o.kmRota : 0;
      if (Math.abs(o.kmComp) < (v.origem === "controle anterior" ? 10 : 0.5)) o.kmComp = 0;
      o.compRS = t ? r2(o.kmComp * t.km) : 0;
      o.previsto = v.kmFat != null && t ? r2(v.kmFat * t.km + t.cc) : null;
      o.fCte = this.ctes(v);
      o.difFat = t && t.metodo === "piso" && o.fCte != null && o.previsto != null ? r2(o.fCte - o.previsto) : 0;
      if (o.status === "fechada" && v.kmFat != null && o.kmReal != null && t) {
        o.difKm = v.kmFat - o.kmReal;
        o.difKmRS = r2(o.difKm * t.km);
        o.difRS = r2(o.difKmRS + o.difFat);
        o.opKm = o.kmRota != null ? o.kmRota - o.kmReal : null;
        o.opRS = r2(o.difKmRS - o.compRS);
      }
      o.ctl = o.modo === "dedicado";
      if (!o.ctl) {
        o.kmRota = v.kmFat;
        o.kmComp = 0;
        o.compRS = 0;
        o.difFat = 0;
        o.difKm = null;
        o.difKmRS = null;
        o.difRS = null;
        o.opKm = null;
        o.opRS = null;
        if (o.modo === "spot") {
          o.previsto = null;
          o.vkm = null;
          o.cc = 0;
        }
      }
      out.push(o);
    });
    this._trips = out.sort((a, b) => (a.carreg < b.carreg ? 1 : a.carreg > b.carreg ? -1 : a.placa < b.placa ? -1 : 1));
    return this._trips;
  }

  acEf(a: KmSettlement) {
    return a.efeito != null ? +a.efeito : a.valor != null && a.pagoPara == null ? +a.valor : 0;
  }

  saldos(T: KmTrip[]) {
    const chg = this.chgDate() || "9999";
    type Row = { placa: string; tipo: string | null; ab: number; old: number; neu: number; ac: number; n: number; km: number; op: number; comp: number; fat: number; pend: number; pendKm: number; saldo: number };
    const res: Record<string, Row> = {};
    const tot = { ab: 0, old: 0, neu: 0, ac: 0, acOld: 0, acNew: 0, op: 0, comp: 0, fat: 0, pend: 0, neuKm: 0, neuFat: 0, saldo: 0, ateChg: 0, desdeChg: 0, chg: null as string | null };
    const nw = (p: string, tp: string | null, ab: number): Row => ({ placa: p, tipo: tp, ab, old: 0, neu: 0, ac: 0, n: 0, km: 0, op: 0, comp: 0, fat: 0, pend: 0, pendKm: 0, saldo: 0 });
    this.frota().forEach((f) => {
      res[f.placa] = nw(f.placa, f.tipo, +f.abertura || 0);
      tot.ab += +f.abertura || 0;
    });
    res._g = nw("Geral", null, 0);
    T.forEach((t) => {
      if (t.status === "aberta" && t.compRS) {
        const q = res[t.placa];
        if (q) {
          q.pend += t.compRS;
          q.pendKm += t.kmComp;
          tot.pend += t.compRS;
        }
      }
      if (t.status !== "fechada" || t.difRS == null) return;
      const r = res[t.placa] || (res[t.placa] = nw(t.placa, t.tipo, 0));
      const op = t.opRS != null ? t.opRS : t.difRS - (t.compRS || 0) - (t.difFat || 0);
      r.op += op;
      r.comp += t.compRS || 0;
      r.fat += t.difFat || 0;
      tot.op += op;
      tot.comp += t.compRS || 0;
      tot.fat += t.difFat || 0;
      if (t.carreg < chg) {
        r.old += t.difRS;
        tot.old += t.difRS;
      } else {
        r.neu += t.difRS;
        tot.neu += t.difRS;
        tot.neuKm += t.difKmRS != null ? t.difKmRS : t.difRS;
        tot.neuFat += t.difFat || 0;
      }
      r.n++;
      r.km += t.difKm || 0;
    });
    this.S.acertos.forEach((a) => {
      const r = a.placa && res[a.placa] ? res[a.placa] : res._g;
      const e = this.acEf(a);
      r.ac += e;
      tot.ac += e;
      if ((a.data || "") < chg) tot.acOld += e;
      else tot.acNew += e;
    });
    Object.keys(res).forEach((k) => {
      const r = res[k];
      r.saldo = r2(r.ab + r.old + r.neu + r.ac);
    });
    tot.saldo = r2(tot.ab + tot.old + tot.neu + tot.ac);
    tot.ateChg = r2(tot.ab + tot.old + tot.acOld);
    tot.desdeChg = r2(tot.neu + tot.acNew);
    tot.chg = this.chgDate();
    return { p: res, t: tot };
  }

  monthly(T: KmTrip[]) {
    type M = { mes: string; n: number; fat: number; real: number; rota: number; kcomp: number; difKm: number; difRS: number; ac: number; op: number; comp: number; dfat: number; saldo?: number; desv?: number | null };
    const mz = (k: string): M => ({ mes: k, n: 0, fat: 0, real: 0, rota: 0, kcomp: 0, difKm: 0, difRS: 0, ac: 0, op: 0, comp: 0, dfat: 0 });
    const m: Record<string, M> = {};
    T.forEach((t) => {
      if (t.status !== "fechada" || !t.ctl) return;
      const k = monthOf(t.carreg);
      const r = m[k] || (m[k] = mz(k));
      r.n++;
      r.fat += t.kmFat || 0;
      r.real += t.kmReal || 0;
      r.rota += t.kmRota || 0;
      r.kcomp += t.kmComp || 0;
      r.difKm += t.difKm || 0;
      r.difRS += t.difRS || 0;
      r.comp += t.compRS || 0;
      r.dfat += t.difFat || 0;
      r.op += (t.difRS || 0) - (t.compRS || 0) - (t.difFat || 0);
    });
    this.S.acertos.forEach((a) => {
      if (!a.data) return;
      const k = monthOf(a.data);
      const r = m[k] || (m[k] = mz(k));
      r.ac += this.acEf(a);
    });
    const keys = Object.keys(m).sort();
    if (!keys.length) return [] as M[];
    const last = monthOf(todayISO());
    const out: M[] = [];
    let k = keys[0];
    let acc = this.frota().reduce((a, f) => a + (+f.abertura || 0), 0);
    while (k <= last || k <= keys[keys.length - 1]) {
      const r = m[k] || mz(k);
      acc += r.difRS + r.ac;
      r.saldo = r2(acc);
      r.desv = r.rota ? (r.real - r.rota) / r.rota : null;
      out.push(r);
      k = shiftMon(k, 1);
      if (out.length > 120) break;
    }
    return out;
  }

  /** Razão de compensações: saldo da placa antes e depois de cada compensação. */
  ledger(T: KmTrip[]) {
    type Ev = { run: number; list: { d: string; k: string; amt: number; t?: KmTrip }[] };
    const ev: Record<string, Ev> = {};
    this.frota().forEach((f) => (ev[f.placa] = { run: +f.abertura || 0, list: [] }));
    T.forEach((t) => {
      const e = ev[t.placa];
      if (!e || t.status === "cancelada") return;
      const amt = t.status === "fechada" ? t.difRS || 0 : t.compRS || 0;
      e.list.push({ d: t.carreg, k: "1" + t.carreg + (t.id || ""), amt, t });
    });
    this.S.acertos.forEach((a) => {
      const e = a.placa && ev[a.placa];
      if (e) e.list.push({ d: a.data || "", k: "0" + (a.data || ""), amt: this.acEf(a) });
    });
    const out: { t: KmTrip; antes: number; depois: number; st: "hist" | "inv" | "acima" | "ok" }[] = [];
    Object.keys(ev).forEach((p) => {
      const e = ev[p];
      e.list.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.k < b.k ? -1 : 1));
      e.list.forEach((x) => {
        const t = x.t;
        if (t && Math.abs(t.kmComp || 0) >= 1 && t.compRS) {
          const antes = r2(e.run);
          const dep = r2(antes + t.compRS);
          let st: "hist" | "inv" | "acima" | "ok";
          if (t.hist || t.origem === "controle anterior") st = "hist";
          else if (Math.abs(antes) < 0.01 || antes * t.compRS > 0) st = "inv";
          else if (Math.abs(t.compRS) > Math.abs(antes) + (t.vkm || 0) * 10) st = "acima";
          else st = "ok";
          out.push({ t, antes, depois: dep, st });
        }
        e.run += x.amt;
      });
    });
    return out.sort((a, b) => (a.t.carreg < b.t.carreg ? 1 : -1));
  }

  /** Contexto de compensação de uma placa (saldo líquido, sugestão, limites). */
  compCtx(placa: string, date: string | null, exId: string | null) {
    const T = this.trips();
    const SD = this.saldos(T.filter((t) => t.id !== exId));
    const p = SD.p[placa];
    if (!p) return null;
    const tr = this.tarFor(this.tipoOf(placa), date || todayISO());
    if (!tr) return null;
    const net = r2(p.saldo + p.pend);
    const dir = net < -0.01 ? 1 : net > 0.01 ? -1 : 0;
    const maxKm = Math.floor(Math.abs(net) / tr.km);
    const cap = Math.min(maxKm, this.compMax());
    return { saldo: p.saldo, pend: p.pend, net, dir, vkm: tr.km, maxKm, cap, sug: dir ? (cap >= 100 ? Math.floor(cap / 100) * 100 : Math.floor(cap / 10) * 10) * dir : 0 };
  }
  compErr(c: ReturnType<KmEngine["compCtx"]>, k: number) {
    if (!k) return null;
    if (!c) return "Escolha a placa.";
    if (!c.dir) return "Esta placa não tem saldo a compensar.";
    if (Math.sign(k) !== c.dir)
      return "Sentido invertido: a compensação aumentaria o saldo a favor da " + (c.net < 0 ? "Transbochnia" : "Btech") + ". Use " + (c.dir > 0 ? "km a mais" : "km a menos") + ".";
    if (Math.abs(k) > c.maxKm + 10) return "Maior que o saldo da placa: compense até " + fmtKm(c.maxKm) + " km.";
    if (Math.abs(k) > this.compMax()) return "Acima do limite por viagem (" + fmtKm(this.compMax()) + " km, em Ajustes).";
    return null;
  }
  cteObs(placa: string, rota: number, k: number) {
    if (!k) return "";
    return "Km faturado de " + fmtKm(rota + k) + " km = " + fmtKm(rota) + " km estimados " + (k > 0 ? "+ " : "− ") + fmtKm(Math.abs(k)) + " km de compensação de saldo do controle de quilometragem da placa " + placa + " (contrato, cl. 6.4).";
  }

  /** Produtividade mínima: 8.000 km por veículo dedicado no mês (cl. 5.4, 5.5, 6.15). */
  produt(T: KmTrip[], mes: string) {
    const meta = +this.R().metaKm || 8000;
    const cur = monthOf(todayISO());
    return this.frota().map((f) => {
      let k = 0;
      let n = 0;
      let open = 0;
      T.forEach((t) => {
        if (t.placa !== f.placa || monthOf(t.carreg) !== mes) return;
        if (t.modo === "spot") return;
        if (t.modo === "rota") {
          if (t.status !== "cancelada") {
            k += t.kmFat || 0;
            n++;
          }
          return;
        }
        if (t.status === "fechada") {
          k += t.kmReal || 0;
          n++;
        } else if (t.status === "aberta") open++;
      });
      const def = Math.max(0, meta - k);
      const tr = this.tarFor(f.tipo, lastDay(mes));
      const ab = this.S.abonos[mes + "_" + f.placa];
      const parcial = mes >= cur;
      return { placa: f.placa, tipo: f.tipo, km: k, n, open, meta, def, valor: tr && !parcial ? r2(def * tr.km) : 0, vkm: tr ? tr.km : null, abono: ab || null, parcial };
    });
  }

  compStatus(e: KmDelivery): "enviado" | "aguardando" | "atrasado" | "pendente" {
    if (e.comp && e.comp.env) return "enviado";
    if (!e.entregue) return "aguardando";
    return todayISO() > addDays(e.entregue, +this.R().prazoComp || 1) ? "atrasado" : "pendente";
  }
  comps() {
    const out: { vid: string; i: number; v: KmTripDoc; e: KmDelivery; st: ReturnType<KmEngine["compStatus"]> }[] = [];
    if (this.preset) {
      this.trips().forEach((t) => {
        if (t.hist || t.status === "cancelada") return;
        const v = { placa: t.placa, carreg: t.carreg, status: t.status, entregas: t.entregas } as KmTripDoc;
        t.entregas.forEach((e, i) => out.push({ vid: t.id, i, v, e, st: this.compStatus(e) }));
      });
      return out;
    }
    Object.keys(this.S.viag).forEach((id) => {
      const v = this.S.viag[id];
      if (v.status === "cancelada") return;
      (v.entregas || []).forEach((e, i) => out.push({ vid: id, i, v, e, st: this.compStatus(e) }));
    });
    return out;
  }

  routeIndex() {
    const idx: Record<string, number[]> = {};
    const add = (key: string, k: number | null) => {
      if (!key || !(k != null && k > 0)) return;
      (idx[key] = idx[key] || []).push(k);
    };
    this.S.hist.forEach((h) => (h.viagens || []).forEach((v) => add(rkey((v.dst || "").split(" · ")), v.est)));
    Object.keys(this.S.viag).forEach((k) => {
      const v = this.S.viag[k];
      add(rkey((v.entregas || []).map((e) => e.cliente)), v.kmEst);
    });
    return idx;
  }

  lastOdo(placa: string) {
    let best: KmTripDoc | null = null;
    Object.keys(this.S.viag).forEach((k) => {
      const v = this.S.viag[k];
      if (v.placa === placa && v.odoChegada && (!best || v.carreg > best.carreg)) best = v;
    });
    return best ? (best as KmTripDoc).odoChegada : null;
  }
}

export function rkey(list: (string | null | undefined)[]) {
  const a = list.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean);
  if (!a.length) return "";
  const u: Record<string, 1> = {};
  a.forEach((x) => (u[x] = 1));
  return Object.keys(u).sort().join("|");
}

export function fmtKm(v: number | null | undefined) {
  return v == null || !isFinite(v) ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
