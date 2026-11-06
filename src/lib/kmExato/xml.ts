import { parseNum } from "./format";
import { r2 } from "./engine";

// Leitura dos XML de CT-e / NF-e (no navegador) — mesma regra do app original:
// cliente = nome curto do recebedor/destinatário + cidade; frete = componente
// "frete peso" do CT-e (sem pedágio); peso bruto em kg.

export interface XmlDoc {
  tipo: "CT-e" | "NF-e";
  cte: string | null;
  nf: string | null;
  cliente: string;
  data: string | null;
  frete: number | null;
  peso: number | null;
}

const g1 = (el: Element | Document | null, name: string): Element | null =>
  el ? el.getElementsByTagNameNS("*", name)[0] || null : null;
const tx = (el: Element | null, name: string) => {
  const x = g1(el, name);
  return x ? (x.textContent ?? "").trim() : "";
};

export function shortName(n: string) {
  const s = String(n || "").toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
  const w = s.split(" ");
  const stop: Record<string, 1> = { S: 1, SA: 1, LTDA: 1, ME: 1, EIRELI: 1, DE: 1, DO: 1, DA: 1 };
  const out = [w[0]];
  if (w[0].length <= 3 && w[1] && !stop[w[1]]) out.push(w[1]);
  return out.join(" ");
}

export function parseXml(text: string): XmlDoc | null {
  let d: Document;
  try {
    d = new DOMParser().parseFromString(text, "application/xml");
  } catch {
    return null;
  }
  if (!d || d.getElementsByTagName("parsererror").length) return null;

  const cte = g1(d, "infCte");
  if (cte) {
    const ide = g1(cte, "ide");
    const dest = g1(cte, "dest");
    const rec = g1(cte, "receb") || dest;
    const vp = g1(cte, "vPrest");
    const comps = vp
      ? Array.from(vp.getElementsByTagNameNS("*", "Comp")).map((c) => ({ n: tx(c, "xNome"), v: parseNum(tx(c, "vComp")) }))
      : [];
    const fp = comps.filter((c) => /PESO|FRETE/i.test(c.n) && !/PED/i.test(c.n)).reduce((a, c) => a + (c.v || 0), 0);
    const vt = parseNum(tx(vp, "vTPrest"));
    const ped = comps.filter((c) => /PED/i.test(c.n)).reduce((a, c) => a + (c.v || 0), 0);
    const nfs = Array.from(cte.getElementsByTagNameNS("*", "chave"))
      .map((c) => {
        const k = (c.textContent ?? "").trim();
        return k.length === 44 ? String(parseInt(k.substr(25, 9), 10)) : null;
      })
      .filter(Boolean) as string[];
    Array.from(cte.getElementsByTagNameNS("*", "infNF")).forEach((n) => {
      const x = tx(n, "nDoc");
      if (x) nfs.push(String(parseInt(x, 10)));
    });
    let peso: number | null = null;
    Array.from(cte.getElementsByTagNameNS("*", "infQ")).forEach((q) => {
      const tp = tx(q, "tpMed").toUpperCase();
      const u = tx(q, "cUnid");
      const v = parseNum(tx(q, "qCarga"));
      if (v == null) return;
      if (/PESO/.test(tp) && (peso == null || /BRUTO/.test(tp))) peso = u === "02" ? v * 1000 : u === "01" || !u ? v : peso;
    });
    const ender = g1(rec, "enderReceb") || g1(dest, "enderDest");
    return {
      tipo: "CT-e",
      cte: String(parseInt(tx(ide, "nCT"), 10) || ""),
      nf: nfs.join("/") || null,
      cliente: shortName(tx(rec, "xNome")) + " - " + (tx(ender, "xMun") || "").toUpperCase(),
      data: (tx(ide, "dhEmi") || "").slice(0, 10) || null,
      frete: fp > 0 ? r2(fp) : vt != null ? r2(vt - ped) : null,
      peso,
    };
  }

  const nfe = g1(d, "infNFe");
  if (nfe) {
    const ide2 = g1(nfe, "ide");
    const dst = g1(nfe, "dest");
    const en = g1(dst, "enderDest");
    let pb = 0;
    Array.from(nfe.getElementsByTagNameNS("*", "vol")).forEach((v) => (pb += parseNum(tx(v, "pesoB")) || 0));
    return {
      tipo: "NF-e",
      cte: null,
      nf: String(parseInt(tx(ide2, "nNF"), 10) || ""),
      cliente: shortName(tx(dst, "xNome")) + " - " + (tx(en, "xMun") || "").toUpperCase(),
      data: (tx(ide2, "dhEmi") || "").slice(0, 10) || null,
      frete: null,
      peso: pb || null,
    };
  }
  return null;
}
