// Importa os dados do app "KM Exato · Btech" (artifact do claude.ai) para as
// tabelas km_* do CotaFlow (migration 0082).
//
// Entrada: a pasta exportada do banco do app, com as subpastas cfg/, hist/,
// viagens/, acertos/ e abonos/ (um JSON por documento).
//
// Uso:
//   node infra/scripts/import-km-exato.mjs <pasta-exportada>            (banco local, infra/.env)
//   API_URL=... SERVICE_ROLE_KEY=... node infra/scripts/import-km-exato.mjs <pasta>   (outro banco)
//
// Apaga e regrava SOMENTE as tabelas km_* — pode rodar de novo na virada para
// trazer o que mudou no app até lá. Não mexe em nenhuma outra tabela.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "..", ".env");
const fromFile = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) fromFile[m[1]] = m[2];
  }
}
const API_URL = process.env.API_URL || fromFile.PUBLIC_API_URL;
const SERVICE = process.env.SERVICE_ROLE_KEY || fromFile.SERVICE_ROLE_KEY;
const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "cfg", "geral.json"))) {
  console.error("Informe a pasta exportada do KM Exato (com cfg/geral.json).");
  process.exit(1);
}
if (!API_URL || !SERVICE) {
  console.error("Faltam API_URL / SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(API_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

const readDir = (name) =>
  existsSync(join(dir, name))
    ? readdirSync(join(dir, name))
        .filter((f) => f.endsWith(".json"))
        .sort()
        .map((f) => ({ id: f.replace(/\.json$/, ""), doc: JSON.parse(readFileSync(join(dir, name, f), "utf8")) }))
    : [];
const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(+v) ? null : +v);
const day = (v) => (v ? String(v).slice(0, 10) : null);
// O app grava data/hora local sem fuso ("2026-11-06T12:00:00"): é horário de Brasília.
const ts = (v) => {
  if (!v) return null;
  const s = String(v);
  if (/(Z|[+-]\d\d:?\d\d)$/.test(s)) return s;
  return (s.length <= 10 ? `${s}T12:00:00` : s) + "-03:00";
};

async function run(label, promise) {
  const { error, data } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function insertChunks(table, rows, select) {
  const out = [];
  for (let i = 0; i < rows.length; i += 500) {
    const q = db.from(table).insert(rows.slice(i, i + 500));
    const data = await run(`inserir ${table}`, select ? q.select(select) : q);
    if (data) out.push(...data);
  }
  return out;
}

const cfg = JSON.parse(readFileSync(join(dir, "cfg", "geral.json"), "utf8"));
const hist = readDir("hist");
const viagens = readDir("viagens");
const acertos = readDir("acertos");
const abonos = readDir("abonos");

// 1) Limpa as tabelas km_* (filhas antes das mães).
for (const t of ["km_trip_log", "km_deliveries", "km_trips", "km_history_trips", "km_settlements", "km_waivers", "km_config_log", "km_routes", "km_tariffs", "km_fleet"]) {
  const key = t === "km_fleet" ? "plate" : t === "km_waivers" ? "month" : "id";
  await run(`limpar ${t}`, db.from(t).delete().not(key, "is", null));
}
await run("limpar km_equipment_types", db.from("km_equipment_types").delete().not("id", "is", null));
await run("limpar km_settings", db.from("km_settings").delete().eq("id", 1));

// 2) Configuração.
const r = cfg.regras ?? {};
await run("km_settings", db.from("km_settings").insert({
  id: 1,
  min_km_month: num(r.metaKm) ?? 8000,
  comp_max_km: num(r.compMax) ?? 600,
  deviation_limit: num(r.limite) ?? 0.1,
  proof_deadline_days: num(r.prazoComp) ?? 1,
  open_alert_days: num(r.diasAberta) ?? 10,
  estimate_factor: num(r.fator) ?? 1,
  min_km_policy: r.kmMinPolitica === "cobrar" ? "cobrar" : "registrar",
  return_factor: num(r.retorno) ?? 0.92,
}));
await insertChunks("km_equipment_types", (cfg.tipos ?? []).map((t, i) => ({ id: t.id, name: t.nome, axles: num(t.eixos), position: i })));
await insertChunks("km_fleet", (cfg.frota ?? []).map((f, i) => ({ plate: f.placa, type_id: f.tipo, opening_balance: num(f.abertura) ?? 0, position: i })));
await insertChunks("km_tariffs", (cfg.tarifas ?? []).map((t) => ({
  legacy_id: t.id ?? null,
  valid_from: t.desde,
  method: t.metodo === "piso" ? "piso" : "km",
  reference: t.ref ?? null,
  values: t.v ?? {},
  created_by: null,
  ...(t.em ? { created_at: ts(t.em) } : {}),
})));
await insertChunks("km_routes", (cfg.rotas ?? []).map((x, i) => ({ name: x.nome, km: num(x.km), position: i })));
await insertChunks("km_config_log", (cfg.log ?? []).map((l) => ({ at: ts(l.em) ?? new Date().toISOString(), by_user: null, by_name: null, action: l.acao })));

// 3) Controle anterior.
const histRows = [];
for (const { doc } of hist) {
  (doc.viagens ?? []).forEach((v, i) =>
    histRows.push({
      month: doc.mes,
      position: i,
      loaded_on: day(v.d),
      plate: v.p,
      km_est: num(v.est),
      km_billed: num(v.fat),
      km_real: num(v.real),
      value_per_km: num(v.vkm),
      diff_value: num(v.dif),
      destinations: v.dst ?? null,
      deliveries_count: num(v.ne),
    })
  );
}
await insertChunks("km_history_trips", histRows);

// 4) Viagens + entregas + histórico de alterações.
const tripRows = viagens.map(({ id, doc: v }) => ({
  legacy_id: id,
  plate: v.placa,
  type_id: v.tipo ?? null,
  tractor_plate: v.cavalo ?? null,
  mode: v.modo ?? "dedicado",
  route_name: v.rotaNome ?? null,
  loaded_on: day(v.carreg),
  km_est: num(v.kmEst),
  km_route: num(v.kmRota),
  km_comp: num(v.kmComp),
  km_billed: num(v.kmFat),
  odo_out: num(v.odoSaida),
  odo_in: num(v.odoChegada),
  status: v.status ?? "aberta",
  closed_at: ts(v.fechadaEm),
  reason: v.motivo ?? null,
  reason_note: v.motivoObs ?? null,
  origin: v.origem ?? "app",
  cte_base: v.cteBase ?? null,
  freight_cte: num(v.freteCte),
  created_by: null,
  ...(v.criadoEm ? { created_at: ts(v.criadoEm) } : {}),
}));
const inserted = await insertChunks("km_trips", tripRows, "id, legacy_id");
const idOf = new Map(inserted.map((t) => [t.legacy_id, t.id]));

const delivRows = [];
const logRows = [];
for (const { id, doc: v } of viagens) {
  const tripId = idOf.get(id);
  (v.entregas ?? []).forEach((e, i) =>
    delivRows.push({
      trip_id: tripId,
      legacy_id: e.id ?? null,
      position: i,
      client: e.cliente ?? "",
      nf: e.nf ?? null,
      cte: e.cte ?? null,
      weight_kg: num(e.peso),
      freight_cte: num(e.freteCte),
      delivered_on: day(e.entregue),
      proof_sent: Boolean(e.comp?.env),
      proof_sent_at: ts(e.comp?.em),
      proof_sent_by: null,
      proof_before: Boolean(e.comp?.antes),
      proof_file: null,
    })
  );
  (v.log ?? []).forEach((l) => logRows.push({ trip_id: tripId, at: ts(l.em) ?? new Date().toISOString(), by_user: null, by_name: null, action: l.acao }));
}
await insertChunks("km_deliveries", delivRows);
await insertChunks("km_trip_log", logRows);

// 5) Acertos e abonos.
await insertChunks("km_settlements", acertos.map(({ id, doc: a }) => ({
  legacy_id: id,
  settled_on: day(a.data),
  plate: a.placa ?? null,
  paid_to: a.pagoPara ?? null,
  value: num(a.valor),
  effect: num(a.efeito),
  note: a.obs ?? null,
  origin: a.origem ?? null,
  created_by: null,
  ...(a.em ? { created_at: ts(a.em) } : {}),
})));
await insertChunks("km_waivers", abonos.map(({ id, doc: b }) => {
  const [month, plate] = id.split("_");
  return { month, plate, reason: b.motivo ?? "", created_by: null, ...(b.em ? { created_at: ts(b.em) } : {}) };
}));

console.log(
  `KM Exato importado: ${(cfg.frota ?? []).length} placas, ${(cfg.tarifas ?? []).length} tarifas, ${(cfg.rotas ?? []).length} rotas, ` +
    `${histRows.length} viagens do controle anterior, ${tripRows.length} viagens (${delivRows.length} entregas, ${logRows.length} registros), ` +
    `${acertos.length} acertos, ${abonos.length} abonos.`
);
