import { KmEngine, lastDay, monthOf, r2, shiftMon, todayISO, type KmTrip } from "./engine";
import { dBR, favTxt, km, nf, pct, sbrl } from "./format";

// KM Exato · Relatórios: filtros, indicadores e recorte por veículo/mês —
// tradução do rptData() do app original. adm=false é o recorte sem dados
// internos (conferência CT-e × metodologia), usado em toda exportação.

export interface ReportFilter {
  pre: "mes" | "ant" | "tri" | "ano" | "tudo" | "custom";
  de: string;
  ate: string;
  placas: string[]; // vazio = todas; "SPOT" = spot
  st: "fechada" | "todas";
  q: string;
}

export const PRESETS: [ReportFilter["pre"], string][] = [
  ["mes", "Este mês"],
  ["ant", "Mês anterior"],
  ["tri", "3 meses"],
  ["ano", "Ano"],
  ["tudo", "Tudo"],
];

export function applyPreset(f: ReportFilter, k: ReportFilter["pre"]): ReportFilter {
  const m = monthOf(todayISO());
  const out = { ...f, pre: k };
  if (k === "mes") {
    out.de = m + "-01";
    out.ate = lastDay(m);
  } else if (k === "ant") {
    const p = shiftMon(m, -1);
    out.de = p + "-01";
    out.ate = lastDay(p);
  } else if (k === "tri") {
    out.de = shiftMon(m, -2) + "-01";
    out.ate = lastDay(m);
  } else if (k === "ano") {
    out.de = m.slice(0, 4) + "-01-01";
    out.ate = m.slice(0, 4) + "-12-31";
  } else if (k === "tudo") {
    out.de = "2024-01-01";
    out.ate = lastDay(m);
  }
  return out;
}

export function initialFilter(E: KmEngine): ReportFilter {
  const base: ReportFilter = { pre: "mes", de: "", ate: "", placas: [], st: "fechada", q: "" };
  const cm = monthOf(todayISO());
  const hasThis = E.trips().some((t) => t.status === "fechada" && monthOf(t.carreg) === cm);
  return applyPreset(base, hasThis ? "mes" : "ant");
}

export function filterLabel(f: ReportFilter) {
  const all = !f.placas.length;
  return {
    per: dBR(f.de) + " a " + dBR(f.ate),
    pl: all ? "todos os veículos" : f.placas.map((p) => (p === "SPOT" ? "spot" : p)).join(", "),
    st: f.st === "fechada" ? "viagens concluídas" : "todas as viagens",
    q: f.q ? "busca “" + f.q + "”" : "",
  };
}

export interface Agg {
  placa?: string;
  tipo?: string | null;
  mes?: string;
  n: number;
  real: number;
  rota: number;
  fat: number;
  kc: number;
  op: number;
  cp: number;
  df: number;
  res: number;
  nAll: number;
  ent: number;
  entOk: number;
  peso: number;
  kmProd: number;
  desv?: number | null;
  saldo?: number;
}

const z = (): Agg => ({ n: 0, real: 0, rota: 0, fat: 0, kc: 0, op: 0, cp: 0, df: 0, res: 0, nAll: 0, ent: 0, entOk: 0, peso: 0, kmProd: 0 });

export function reportData(E: KmEngine, f: ReportFilter, adm: boolean) {
  const T = E.trips();
  const SD = E.saldos(T);
  const all = E.frota().map((x) => x.placa);
  let PS = f.placas.filter((p) => p !== "SPOT");
  const spot = !f.placas.length || f.placas.indexOf("SPOT") > -1;
  const q = (f.q || "").trim().toUpperCase();
  if (!f.placas.length) PS = all;

  const L = T.filter((t) => {
    if (t.status === "cancelada") return false;
    if (f.st !== "todas" && t.status !== f.st) return false;
    if (t.carreg < f.de || t.carreg > f.ate) return false;
    if (t.modo === "spot" ? !spot : PS.indexOf(t.placa) < 0) return false;
    if (q && (t.placa + " " + (t.dst || "") + " " + t.entregas.map((e) => (e.nf || "") + " " + (e.cte || "")).join(" ")).toUpperCase().indexOf(q) < 0) return false;
    return true;
  });
  const C = L.filter((t) => t.ctl && t.status === "fechada");
  const add = (a: Agg, t: KmTrip) => {
    a.n++;
    a.real += t.kmReal || 0;
    a.rota += t.kmRota || 0;
    a.fat += t.kmFat || 0;
    a.kc += t.kmComp || 0;
    a.cp += t.compRS || 0;
    a.df += t.difFat || 0;
    a.op += (t.difRS || 0) - (t.compRS || 0) - (t.difFat || 0);
    a.res += t.difRS || 0;
  };
  const ops = (a: Agg, t: KmTrip) => {
    a.nAll++;
    if (t.hist) {
      a.ent += t.ne || 0;
      a.entOk += t.ne || 0;
    }
    t.entregas.forEach((e) => {
      a.ent++;
      if (e.entregue) a.entOk++;
      a.peso += +(e.peso ?? 0) || 0;
    });
    if (t.ctl && t.status === "fechada") a.kmProd += t.kmReal || 0;
    else if (t.modo === "rota") a.kmProd += t.kmFat || 0;
  };

  const K = z() as Agg & { open: number; ded: number; nrota: number; spot: number };
  C.forEach((t) => add(K, t));
  L.forEach((t) => ops(K, t));
  K.desv = K.rota ? (K.real - K.rota) / K.rota : null;
  K.open = L.filter((t) => t.status === "aberta").length;
  K.ded = L.filter((t) => t.modo === "dedicado").length;
  K.nrota = L.filter((t) => t.modo === "rota").length;
  K.spot = L.filter((t) => t.modo === "spot").length;

  const porPlaca = PS.map((p) => {
    const a = z();
    a.placa = p;
    a.tipo = E.tipoOf(p);
    C.forEach((t) => t.placa === p && add(a, t));
    L.forEach((t) => t.placa === p && t.modo !== "spot" && ops(a, t));
    a.desv = a.rota ? (a.real - a.rota) / a.rota : null;
    a.saldo = SD.p[p] ? SD.p[p].saldo : 0;
    return a;
  });
  let spotAgg: Agg | null = null;
  if (K.spot) {
    spotAgg = z();
    spotAgg.placa = "Spot";
    L.forEach((t) => t.modo === "spot" && ops(spotAgg!, t));
  }
  const mm: Record<string, Agg> = {};
  C.forEach((t) => {
    const k = monthOf(t.carreg);
    if (!mm[k]) {
      mm[k] = z();
      mm[k].mes = k;
    }
    add(mm[k], t);
  });
  const porMes = Object.keys(mm)
    .sort()
    .map((k) => {
      const a = mm[k];
      a.desv = a.rota ? (a.real - a.rota) / a.rota : null;
      return a;
    });
  const ids = new Set(L.map((t) => t.id));
  const comp = E.ledger(T).filter((l) => ids.has(l.t.id)).reverse();
  const prod: (ReturnType<KmEngine["produt"]>[number] & { mes: string })[] = [];
  const cur = monthOf(todayISO());
  for (let m = monthOf(f.de); m <= monthOf(f.ate) && m < cur; m = shiftMon(m, 1)) {
    E.produt(T, m).forEach((p) => {
      if (PS.indexOf(p.placa) > -1) prod.push({ mes: m, ...p });
    });
  }
  const prodAb = prod.filter((p) => p.def > 0 && !p.abono);
  const cps = { ab: 0, op: 0, comp: 0, fat: 0, ac: 0, saldo: 0 };
  PS.forEach((p) => {
    const s = SD.p[p];
    if (!s) return;
    cps.ab += s.ab;
    cps.op += s.op;
    cps.comp += s.comp;
    cps.fat += s.fat;
    cps.ac += s.ac;
    cps.saldo += s.saldo;
  });
  if (!adm) {
    [K as Agg, ...porPlaca, ...porMes].forEach((a) => {
      a.op += a.df;
      a.df = 0;
    });
    cps.op += cps.fat;
    cps.fat = 0;
  }
  return { f, adm, L, C, K, porPlaca, spot: spotAgg, porMes, comp, prod, prodAb, cps, saldo: r2(cps.saldo), todas: PS.length === all.length };
}

export type ReportData = ReturnType<typeof reportData>;

export function reportStory(D: ReportData) {
  const K = D.K;
  if (!K.nAll) return "Nenhuma viagem no período com estes filtros.";
  let s = `${K.nAll} viage${K.nAll > 1 ? "ns" : "m"}, ${K.ent} entrega${K.ent !== 1 ? "s" : ""}${K.peso ? " e " + nf(K.peso / 1000, 1) + " t transportadas" : ""}. `;
  if (K.n)
    s += `Nas dedicadas concluídas, os caminhões rodaram ${km(K.real)} km para ${km(K.rota)} km estimados (${pct(K.desv)}); resultado de ${sbrl(r2(K.res))}${
      Math.abs(K.cp) > 0.004 ? `, já considerando ${sbrl(r2(K.cp))} compensados no km faturado` : ""
    }. `;
  return s + `Saldo atual ${D.todas ? "da frota" : "dos veículos filtrados"}: ${sbrl(D.saldo)}, ${favTxt(D.saldo)}.`;
}
