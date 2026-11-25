import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { shortName } from "./xml";

// KM Btech — CT-e recebidos (XML do ERP). Lê o XML no servidor, guarda só os
// CT-e da Btech em km_cte_inbox e procura a viagem em aberto da placa para
// gravar o CT-e como entrega (igual à importação manual dos XML na viagem).
//
// Placas: o ERP põe o cavalo/caminhão em <ObsCont xCampo="PLACA"> e a carreta
// nas observações (<xObs>: "SEMI REBOQUE ... - AGR9021 - Frota ..."). No KM, a
// viagem fica na placa controlada (carreta ou caminhão) com o cavalo anotado.

/** Raiz do CNPJ da Btech (as duas bases: Indaiatuba e São José dos Pinhais). */
export const BTECH_CNPJ_ROOT = "68946524";
/** Janela de carregamento aceita em volta da emissão do CT-e (dias). */
const DAYS_BEFORE = 7;
const DAYS_AFTER = 2;
export const AUTO = "Automático";

// ---------- leitura do XML (sem DOM: o XML do CT-e é gerado por sistema) ----------

const T = (tag: string) => `(?:[\\w-]+:)?${tag}`;
function block(src: string | null, tag: string): string | null {
  if (!src) return null;
  const m = src.match(new RegExp(`<${T(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${T(tag)}>`));
  return m ? m[1] : null;
}
function blocks(src: string | null, tag: string): string[] {
  if (!src) return [];
  return Array.from(src.matchAll(new RegExp(`<${T(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</${T(tag)}>`, "g"))).map((m) => m[1]);
}
function decode(s: string) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&");
}
function text(src: string | null, tag: string): string {
  const b = block(src, tag);
  return b == null ? "" : decode(b.replace(/<[^>]*>/g, "")).trim();
}
const num = (s: string) => {
  const v = s ? Number(s) : NaN;
  return isFinite(v) ? v : null;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const PLATE_RE = /\b[A-Z]{3}[0-9][A-Z0-9][0-9]{2}\b/g;
const cleanPlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export interface ParsedCte {
  kind: "cte";
  accessKey: string;
  number: string;
  series: string | null;
  issuedAt: string | null;
  /** Data da emissão no fuso do emitente (AAAA-MM-DD). */
  issuedDate: string | null;
  cteType: number;
  status: string | null;
  senderCnpj: string | null;
  isBtech: boolean;
  client: string;
  nfs: string[];
  freight: number | null;
  weightKg: number | null;
  tractorPlate: string | null;
  trailerPlates: string[];
  driverCpf: string | null;
}
export interface ParsedCancel {
  kind: "cancelamento";
  accessKey: string;
}

export function parseCteXml(xml: string): ParsedCte | ParsedCancel | null {
  // Evento de cancelamento (procEventoCTe, tpEvento 110111).
  const ev = block(xml, "infEvento");
  if (ev && !block(xml, "infCte")) {
    const key = text(ev, "chCTe");
    if (text(ev, "tpEvento") === "110111" && /^\d{44}$/.test(key)) return { kind: "cancelamento", accessKey: key };
    return null;
  }

  const idm = xml.match(new RegExp(`<${T("infCte")}\\s[^>]*Id="CTe(\\d{44})"`));
  const cte = block(xml, "infCte");
  if (!idm || !cte) return null;

  const ide = block(cte, "ide");
  const rem = block(cte, "rem");
  const exp = block(cte, "exped");
  const dest = block(cte, "dest");
  const receb = block(cte, "receb") ?? dest;
  const toma4 = block(ide, "toma4");
  const cnpjs = [text(rem, "CNPJ"), text(exp, "CNPJ"), text(toma4, "CNPJ")].filter(Boolean);

  const vp = block(cte, "vPrest");
  const comps = blocks(vp, "Comp").map((c) => ({ n: text(c, "xNome"), v: num(text(c, "vComp")) }));
  const fp = comps.filter((c) => /PESO|FRETE/i.test(c.n) && !/PED/i.test(c.n)).reduce((a, c) => a + (c.v || 0), 0);
  const ped = comps.filter((c) => /PED/i.test(c.n)).reduce((a, c) => a + (c.v || 0), 0);
  const vt = num(text(vp, "vTPrest"));

  const nfs: string[] = [];
  for (const k of blocks(cte, "chave")) {
    const key = k.trim();
    if (key.length === 44) nfs.push(String(parseInt(key.substr(25, 9), 10)));
  }
  for (const n of blocks(cte, "infNF")) {
    const d = text(n, "nDoc");
    if (d) nfs.push(String(parseInt(d, 10)));
  }

  let weight: number | null = null;
  for (const q of blocks(cte, "infQ")) {
    const tp = text(q, "tpMed").toUpperCase();
    const u = text(q, "cUnid");
    const v = num(text(q, "qCarga"));
    if (v == null || !/PESO/.test(tp)) continue;
    if (weight == null || /BRUTO/.test(tp)) weight = u === "02" ? v * 1000 : u === "01" || !u ? v : weight;
  }

  // Placas e motorista: campos do ERP nas observações do contribuinte.
  const obs = new Map<string, string>();
  for (const m of block(cte, "compl")?.matchAll(new RegExp(`<${T("ObsCont")}\\s[^>]*xCampo="([^"]*)"[^>]*>([\\s\\S]*?)</${T("ObsCont")}>`, "g")) ?? []) {
    obs.set(m[1].trim().toUpperCase(), text(m[2], "xTexto"));
  }
  const tractor = cleanPlate(obs.get("PLACA") ?? "") || null;
  const xObs = text(block(cte, "compl"), "xObs").toUpperCase();
  const trailers = [...new Set(xObs.match(PLATE_RE) ?? [])].filter((p) => p !== tractor);
  const cpf = (obs.get("CPFMOTORISTA") ?? "").replace(/\D/g, "") || null;

  const ender = block(receb, "enderReceb") ?? block(dest, "enderDest");
  const dhEmi = text(ide, "dhEmi");
  const prot = block(xml, "infProt");

  return {
    kind: "cte",
    accessKey: idm[1],
    number: String(parseInt(text(ide, "nCT"), 10) || ""),
    series: text(ide, "serie") || null,
    issuedAt: dhEmi || null,
    issuedDate: dhEmi ? dhEmi.slice(0, 10) : null,
    cteType: Number(text(ide, "tpCTe") || 0),
    status: prot ? text(prot, "cStat") || null : null,
    senderCnpj: text(rem, "CNPJ") || null,
    isBtech: cnpjs.some((c) => c.startsWith(BTECH_CNPJ_ROOT)),
    client: (shortName(text(receb, "xNome")) + " - " + text(ender, "xMun").toUpperCase()).trim(),
    nfs: [...new Set(nfs.filter((n) => n && n !== "NaN"))],
    freight: fp > 0 ? r2(fp) : vt != null ? r2(vt - ped) : null,
    weightKg: weight,
    tractorPlate: tractor,
    trailerPlates: trailers,
    driverCpf: cpf,
  };
}

// ---------- gravação ----------

type Db = SupabaseClient;

export interface IngestResult {
  file?: string;
  result: "vinculado" | "sem_viagem" | "ja_recebido" | "outro_cliente" | "cancelado" | "invalido";
  number?: string;
  client?: string;
  trip?: { id: string; plate: string; loadedOn: string } | null;
  reason?: string | null;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dBR = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface InboxRow {
  id: string;
  number: string;
  issued_at: string | null;
  cte_type: number;
  client: string;
  nf: string | null;
  freight: number | null;
  weight_kg: number | null;
  tractor_plate: string | null;
  trailer_plate: string | null;
  status: string;
  trip_id: string | null;
}
const INBOX_COLS = "id, number, issued_at, cte_type, client, nf, freight, weight_kg, tractor_plate, trailer_plate, status, trip_id";

/** Procura a viagem em aberto das placas do CT-e, perto da data de emissão. */
async function findTrip(db: Db, row: InboxRow): Promise<{ trip: { id: string; plate: string; loaded_on: string } | null; reason: string | null }> {
  const plates = [row.tractor_plate, ...(row.trailer_plate ?? "").split(",")].map((p) => cleanPlate(p ?? "")).filter((p) => p.length === 7);
  if (!plates.length) return { trip: null, reason: "O CT-e não traz a placa." };
  if (row.cte_type !== 0) return { trip: null, reason: row.cte_type === 1 ? "CT-e complementar: confira antes de vincular." : "CT-e de substituição ou anulação: confira antes de vincular." };
  const day = (row.issued_at ?? "").slice(0, 10);
  if (!day) return { trip: null, reason: "O CT-e não traz a data de emissão." };
  const list = plates.join(",");
  const { data, error } = await db
    .from("km_trips")
    .select("id, plate, tractor_plate, loaded_on")
    .eq("status", "aberta")
    .gte("loaded_on", addDays(day, -DAYS_BEFORE))
    .lte("loaded_on", addDays(day, DAYS_AFTER))
    .or(`plate.in.(${list}),tractor_plate.in.(${list})`)
    .order("loaded_on", { ascending: false });
  if (error) throw new Error("viagens: " + error.message);
  const trips = (data ?? []) as { id: string; plate: string; loaded_on: string }[];
  const shown = plates.join(" / ");
  if (!trips.length) return { trip: null, reason: `Nenhuma viagem em aberto de ${shown} carregada entre ${dBR(addDays(day, -DAYS_BEFORE))} e ${dBR(addDays(day, DAYS_AFTER))}.` };
  // A viagem mais recente é a desta carga; duas no mesmo dia: a equipe escolhe.
  if (trips.length > 1 && trips[1].loaded_on === trips[0].loaded_on) {
    return { trip: null, reason: `Mais de uma viagem em aberto de ${shown} carregada em ${dBR(trips[0].loaded_on)}: escolha a viagem.` };
  }
  return { trip: trips[0], reason: null };
}

/** Grava o CT-e como entrega da viagem (atualiza a entrega do mesmo CT-e ou NF, senão cria). */
export async function linkToTrip(db: Db, row: InboxRow, tripId: string, byName: string, how: string) {
  const { data: dels, error } = await db.from("km_deliveries").select("id, position, client, nf, cte").eq("trip_id", tripId).order("position");
  if (error) throw new Error("entregas: " + error.message);
  const list = (dels ?? []) as { id: string; position: number; client: string; nf: string | null; cte: string | null }[];
  const nfs = (row.nf ?? "").split("/").filter(Boolean);
  const same =
    list.find((d) => d.cte && d.cte === row.number) ??
    list.find((d) => !d.cte && d.nf && d.nf.split("/").some((n) => nfs.includes(n)));
  const patch = {
    client: row.client || same?.client || "",
    nf: row.nf ?? same?.nf ?? null,
    cte: row.number,
    weight_kg: row.weight_kg != null ? Math.round(row.weight_kg) : null,
    freight_cte: row.freight,
  };
  let deliveryId: string;
  if (same) {
    const { error: e } = await db.from("km_deliveries").update(patch).eq("id", same.id);
    if (e) throw new Error("entrega: " + e.message);
    deliveryId = same.id;
  } else {
    const pos = list.reduce((a, d) => Math.max(a, d.position + 1), 0);
    const { data: ins, error: e } = await db.from("km_deliveries").insert({ trip_id: tripId, position: pos, ...patch }).select("id").single();
    if (e) throw new Error("entrega: " + e.message);
    deliveryId = ins!.id as string;
  }
  await db.from("km_trip_log").insert({
    trip_id: tripId,
    action: `CT-e ${row.number} ${how}: ${row.client}${row.freight != null ? " · " + brl(row.freight) : ""}${same ? " (entrega atualizada)" : ""}`,
    by_name: byName,
  });
  const { error: e2 } = await db
    .from("km_cte_inbox")
    .update({ status: "vinculado", reason: null, trip_id: tripId, delivery_id: deliveryId, delivery_created: !same, linked_by: byName, linked_at: new Date().toISOString() })
    .eq("id", row.id);
  if (e2) throw new Error("CT-e recebido: " + e2.message);
  return deliveryId;
}

/** CT-e que a equipe já lançou numa viagem (importação manual): só registra, sem mexer na entrega. */
async function alreadyOnTrip(db: Db, row: InboxRow) {
  const { data, error } = await db
    .from("km_deliveries")
    .select("id, trip_id, km_trips!inner(id, plate, loaded_on, status)")
    .eq("cte", row.number)
    .neq("km_trips.status", "cancelada")
    .limit(2);
  if (error) throw new Error("entregas: " + error.message);
  const list = (data ?? []) as unknown as { id: string; trip_id: string; km_trips: { id: string; plate: string; loaded_on: string } }[];
  return list.length === 1 ? list[0] : null;
}

async function tryMatch(db: Db, row: InboxRow, how: string): Promise<IngestResult> {
  const found = await alreadyOnTrip(db, row);
  if (found) {
    const { error } = await db
      .from("km_cte_inbox")
      .update({ status: "vinculado", reason: null, trip_id: found.trip_id, delivery_id: found.id, delivery_created: false, linked_by: "já lançado na viagem", linked_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) throw new Error("CT-e recebido: " + error.message);
    return { result: "vinculado", number: row.number, client: row.client, trip: { id: found.trip_id, plate: found.km_trips.plate, loadedOn: found.km_trips.loaded_on }, reason: null };
  }
  const { trip, reason } = await findTrip(db, row);
  if (!trip) {
    await db.from("km_cte_inbox").update({ status: "sem_viagem", reason }).eq("id", row.id);
    return { result: "sem_viagem", number: row.number, client: row.client, trip: null, reason };
  }
  await linkToTrip(db, row, trip.id, AUTO, how);
  return { result: "vinculado", number: row.number, client: row.client, trip: { id: trip.id, plate: trip.plate, loadedOn: trip.loaded_on }, reason: null };
}

/** Recebe um XML (do e-mail ou enviado à mão). CT-e de outro cliente não é guardado. */
export async function ingestXml(db: Db, xml: string, source: "email" | "manual", emailMessageId: string | null = null): Promise<IngestResult> {
  const p = parseCteXml(xml);
  if (!p) return { result: "invalido", reason: "Não é XML de CT-e." };

  if (p.kind === "cancelamento") {
    const { data } = await db
      .from("km_cte_inbox")
      .select("id, number, status, trip_id, delivery_id, delivery_created")
      .eq("access_key", p.accessKey)
      .maybeSingle();
    if (!data) return { result: "outro_cliente", reason: "Cancelamento de CT-e que não está no KM." };
    if (data.status === "cancelado") return { result: "ja_recebido", number: data.number as string };
    let note = "confira a entrega";
    // Entrega que o próprio CT-e criou, em viagem ainda aberta: sai junto com o CT-e.
    if (data.delivery_id && data.delivery_created && data.trip_id) {
      const [{ data: trip }, { data: del }] = await Promise.all([
        db.from("km_trips").select("status").eq("id", data.trip_id).maybeSingle(),
        db.from("km_deliveries").select("id, cte, client").eq("id", data.delivery_id).maybeSingle(),
      ]);
      if (trip?.status === "aberta" && del && del.cte === data.number) {
        const { error } = await db.from("km_deliveries").delete().eq("id", del.id);
        if (!error) note = `entrega ${del.client} removida da viagem`;
      }
    }
    await db.from("km_cte_inbox").update({ status: "cancelado", reason: `CT-e cancelado na SEFAZ (${note}).` }).eq("id", data.id);
    if (data.trip_id) {
      await db.from("km_trip_log").insert({ trip_id: data.trip_id, action: `CT-e ${data.number} cancelado na SEFAZ: ${note}.`, by_name: AUTO });
    }
    return { result: "cancelado", number: data.number as string };
  }

  if (!p.isBtech) return { result: "outro_cliente", number: p.number, client: p.client };

  const how = source === "email" ? "importado do e-mail" : "importado do XML";
  const { data: old } = await db.from("km_cte_inbox").select(INBOX_COLS).eq("access_key", p.accessKey).maybeSingle();
  if (old) {
    const o = old as InboxRow;
    // Já recebido: se ainda não tinha viagem, tenta de novo (a viagem pode ter sido criada depois).
    if (o.status === "sem_viagem") {
      const again = await tryMatch(db, o, how);
      // O ERP manda o mesmo CT-e em vários e-mails: continua sem viagem = já recebido.
      return again.result === "vinculado" ? again : { ...again, result: "ja_recebido" };
    }
    return { result: "ja_recebido", number: o.number, client: o.client };
  }

  const notAuthorized = p.status && p.status !== "100" && p.status !== "150";
  const { data: ins, error } = await db
    .from("km_cte_inbox")
    .insert({
      access_key: p.accessKey,
      number: p.number,
      series: p.series,
      issued_at: p.issuedAt,
      cte_type: p.cteType,
      sender_cnpj: p.senderCnpj,
      client: p.client,
      nf: p.nfs.join("/") || null,
      freight: p.freight,
      weight_kg: p.weightKg,
      tractor_plate: p.tractorPlate,
      trailer_plate: p.trailerPlates.join(",") || null,
      driver_cpf: p.driverCpf,
      status: notAuthorized ? "descartado" : "sem_viagem",
      reason: notAuthorized ? `CT-e não autorizado (situação ${p.status}).` : null,
      source,
      email_message_id: emailMessageId,
      xml,
    })
    .select(INBOX_COLS)
    .single();
  if (error) {
    // Dois recebimentos ao mesmo tempo: o outro já gravou.
    if (/duplicate|unique/i.test(error.message)) return { result: "ja_recebido", number: p.number, client: p.client };
    throw new Error("CT-e recebido: " + error.message);
  }
  if (notAuthorized) return { result: "invalido", number: p.number, client: p.client, reason: `CT-e não autorizado (situação ${p.status}).` };
  return tryMatch(db, ins as InboxRow, how);
}

/** Tenta de novo os CT-e sem viagem dos últimos dias (viagens criadas depois do CT-e). */
export async function retryPending(db: Db, days = 15) {
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const { data, error } = await db.from("km_cte_inbox").select(INBOX_COLS).eq("status", "sem_viagem").gte("issued_at", since).eq("cte_type", 0);
  if (error) throw new Error("CT-e recebidos: " + error.message);
  const out: IngestResult[] = [];
  for (const r of (data ?? []) as InboxRow[]) out.push(await tryMatch(db, r, "vinculado sozinho"));
  return out;
}

export async function loadInboxRow(db: Db, id: string) {
  const { data, error } = await db.from("km_cte_inbox").select(INBOX_COLS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as InboxRow | null;
}
