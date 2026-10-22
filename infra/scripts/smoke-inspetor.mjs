// Teste de segurança do CHECK-LIST MENSAL e do perfil "inspetor".
// O inspetor só pode ler placas e os check-lists mensais e enviar check-lists
// (pela função submit_monthly_checklist). Tudo o mais tem que ser negado.
//
//   node infra/scripts/smoke-inspetor.mjs                     (local, lê infra/.env)
//   MINT=1 JWT_SECRET=... API_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... node infra/scripts/smoke-inspetor.mjs   (produção)
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
const ANON = process.env.ANON_KEY || fromFile.ANON_KEY;
const SERVICE = process.env.SERVICE_ROLE_KEY || fromFile.SERVICE_ROLE_KEY;
const MINT = process.env.MINT === "1";
const JWT_SECRET = process.env.JWT_SECRET || fromFile.JWT_SECRET;
if (!API_URL || !ANON || !SERVICE || (MINT && !JWT_SECRET)) {
  console.error("Faltam API_URL, ANON_KEY, SERVICE_ROLE_KEY (e JWT_SECRET com MINT=1).");
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE, opts);
const tag = `zzinsp${Date.now().toString(36)}`;
const PASSWORD = "Teste-" + Math.random().toString(36).slice(2, 10);
const SIG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "OK    " : "FALHOU"}  ${name}${!ok && extra ? "  -> " + extra : ""}`);
}
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};
const created = { users: [], plate: null, checklists: [] };

async function makeUser(role, label) {
  const email = `${tag}-${label}@teste.local`;
  const u = must(
    await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, app_metadata: { role } }),
    `criar ${label}`
  ).user;
  created.users.push(u.id);
  if (MINT) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = { aud: "authenticated", role: "authenticated", sub: u.id, email, app_metadata: { role }, user_metadata: {}, iat: now, exp: now + 3600 };
    const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
    const token = `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
    return { id: u.id, client: createClient(API_URL, ANON, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } }) };
  }
  const c = createClient(API_URL, ANON, opts);
  must(await c.auth.signInWithPassword({ email, password: PASSWORD }), `login ${label}`);
  return { id: u.id, client: c };
}

try {
  console.log(`== Preparando (${tag})`);
  const plate = `Z${Date.now().toString(36).toUpperCase().slice(-6)}`.slice(0, 7).padEnd(7, "0");
  must(await admin.from("fleet_units").insert({ plate, kind: "cavalo", civ_due: "2030-01-01" }), "placa de teste");
  created.plate = plate;
  const insp = await makeUser("inspetor", "inspetor");
  const logi = await makeUser("logistica", "logistica");
  const manu = await makeUser("manutencao", "manutencao");
  const come = await makeUser("comercial", "comercial");
  const cli = await makeUser("cliente", "cliente");

  console.log("\n== 1) Inspetor só lê placas e check-lists mensais");
  const spec = await fetch(`${API_URL}/rest/v1/`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).then((r) => r.json());
  const tables = Object.keys(spec.paths ?? {})
    .filter((p) => p !== "/" && !p.startsWith("/rpc/"))
    .map((p) => p.slice(1));
  const allowed = ["fleet_units", "monthly_checklist_items", "monthly_checklists"];
  const leaks = [];
  for (const t of tables) {
    if (allowed.includes(t)) continue;
    const r = await insp.client.from(t).select("*").limit(1);
    if (!r.error && (r.data ?? []).length > 0) leaks.push(t);
  }
  check(`nenhuma das ${tables.length - allowed.length} outras tabelas devolve dado`, leaks.length === 0, leaks.join(", "));
  const fl = await insp.client.from("fleet_units").select("plate").eq("plate", plate);
  check("lê as placas", (fl.data ?? []).length === 1, fl.error?.message);
  const items = await insp.client.from("monthly_checklist_items").select("id").eq("template", "motor");
  check("lê os itens do check-list", (items.data ?? []).length >= 40, String(items.data?.length));

  console.log("\n== 2) Inspetor não grava fora do check-list");
  const fi = await insp.client.from("fleet_units").insert({ plate: "ZZZ0Z00", kind: "cavalo" });
  check("não cria placa", Boolean(fi.error));
  const fu = await insp.client.from("fleet_units").update({ civ_due: "2000-01-01" }).eq("plate", plate).select("plate");
  check("não altera placa", Boolean(fu.error) || (fu.data ?? []).length === 0);
  const mr = await insp.client.from("maintenance_reports").insert({ plate, category: "Freios", severity: 1, description: "x" });
  check("não cria defeito direto", Boolean(mr.error));
  const mi = await insp.client.from("monthly_checklists").insert({ plate, template: "motor", inspector_signature: SIG });
  check("não grava check-list fora da função", Boolean(mi.error));
  const drv = await insp.client.rpc("monthly_checklist_drivers");
  check("lista de motoristas sem CPF", !drv.error && (drv.data ?? []).every((d) => !("cpf" in d)), drv.error?.message);

  console.log("\n== 3) Envio pelo inspetor");
  const id = crypto.randomUUID();
  const payload = {
    id,
    plate,
    inspector_name: "INSPETOR TESTE",
    driver_absent: true,
    driver_absent_reason: "teste",
    answers: { "motor-2.10": "N", "motor-2.12": "N", "motor-2.4": "S" },
    item_notes: { "motor-2.10": "freio puxando" },
    extras: { "motor-2.4": { due: "2031-05-05" } },
    photos: {},
    inspector_signature: SIG,
  };
  const noSig = await insp.client.rpc("submit_monthly_checklist", { p: { ...payload, id: crypto.randomUUID(), inspector_signature: "" } });
  check("sem assinatura: recusado", Boolean(noSig.error));
  const ok = await insp.client.rpc("submit_monthly_checklist", { p: payload });
  check("check-list enviado", !ok.error && ok.data === id, ok.error?.message);
  created.checklists.push(id);
  const saved = must(await admin.from("monthly_checklists").select("*").eq("id", id).single(), "check-list salvo");
  check("conta 2 itens com N", saved.nonconformities === 2, String(saved.nonconformities));
  check("1 defeito (só o item de manutenção: freios)", saved.defects_created === 1, String(saved.defects_created));
  check("divergência do CIV registrada", saved.divergences.length === 1 && saved.divergences[0].cert === "civ", JSON.stringify(saved.divergences));
  const reps = must(await admin.from("maintenance_reports").select("id, category, severity, source").eq("plate", plate), "defeitos");
  check("defeito na triagem com origem check-list mensal", reps.length === 1 && reps[0].source === "checklist_mensal" && reps[0].severity === 3, JSON.stringify(reps));
  const again = await insp.client.rpc("submit_monthly_checklist", { p: payload });
  const reps2 = must(await admin.from("maintenance_reports").select("id").eq("plate", plate), "defeitos 2");
  check("reenviar o mesmo check-list não duplica", !again.error && reps2.length === 1);
  const cad = must(await admin.from("fleet_units").select("civ_due").eq("plate", plate).single(), "cadastro");
  check("cadastro da placa não foi alterado", cad.civ_due === "2030-01-01", cad.civ_due);

  console.log("\n== 4) Outros perfis");
  const lr = await logi.client.from("monthly_checklists").select("id").eq("id", id);
  check("logística vê o check-list", (lr.data ?? []).length === 1, lr.error?.message);
  const ls = await logi.client.rpc("submit_monthly_checklist", { p: { ...payload, id: crypto.randomUUID() } });
  check("logística não envia check-list", Boolean(ls.error));
  const mr2 = await manu.client.from("monthly_checklists").select("id").eq("id", id);
  check("manutenção vê o check-list", (mr2.data ?? []).length === 1);
  const cr = await come.client.from("monthly_checklists").select("id").eq("id", id);
  check("comercial não vê check-list mensal", (cr.data ?? []).length === 0);
  const clr = await cli.client.from("monthly_checklists").select("id").eq("id", id);
  check("cliente do portal não vê check-list mensal", (clr.data ?? []).length === 0);
  const ls2 = await logi.client.from("loading_schedules").select("id").limit(1);
  check("logística continua lendo a programação", !ls2.error);
} catch (e) {
  fail++;
  console.log("ERRO:", e.message);
} finally {
  console.log("\n== Limpando");
  try {
    if (created.checklists.length) await admin.from("monthly_checklists").delete().in("id", created.checklists);
    if (created.plate) {
      await admin.from("maintenance_reports").delete().eq("plate", created.plate);
      await admin.from("fleet_units").delete().eq("plate", created.plate);
    }
    for (const u of created.users) await admin.auth.admin.deleteUser(u);
  } catch (e) {
    console.log("aviso na limpeza:", e.message);
  }
  console.log(`\n${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
}
