// Teste de segurança do PORTAL DO CLIENTE (perfil "cliente").
// Cria duas empresas de teste (A e B), cargas, comprovantes e fotos; cria um
// usuário cliente ligado só à empresa A e tenta, com ele, ler/gravar TUDO o que
// não deveria. No fim apaga o que criou.
//
//   node infra/scripts/smoke-portal.mjs                      (lê infra/.env)
//   SITE=http://localhost:3101 node infra/scripts/smoke-portal.mjs   (testa também a rota das fotos)
//
// Variáveis opcionais: API_URL, ANON_KEY, SERVICE_ROLE_KEY (mesmas do smoke-test.mjs).
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
const SITE = process.env.SITE || "";
// MINT=1: gera o token de acesso aqui (com o segredo do servidor), para ambientes
// com anti-robô (captcha) no login, como a produção.
const MINT = process.env.MINT === "1";
const JWT_SECRET = process.env.JWT_SECRET || fromFile.JWT_SECRET;
if (MINT && !JWT_SECRET) {
  console.error("MINT=1 exige JWT_SECRET.");
  process.exit(2);
}
if (!API_URL || !ANON || !SERVICE) {
  console.error("Faltam API_URL, ANON_KEY ou SERVICE_ROLE_KEY.");
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE, opts);
const tag = `zzportal${Date.now().toString(36)}`;
const PASSWORD = "Teste-" + Math.random().toString(36).slice(2, 10);
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64"
);

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

const created = { users: [], clients: [], loads: [], photos: [], mirror: [] };

async function makeUser(role, label) {
  const email = `${tag}-${label}@teste.local`;
  const u = must(
    await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, app_metadata: { role } }),
    `criar usuário ${label}`
  ).user;
  created.users.push(u.id);
  if (MINT) {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = { aud: "authenticated", role: "authenticated", sub: u.id, email, app_metadata: { role }, user_metadata: {}, iat: now, exp: now + 3600 };
    const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
    const token = `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
    const c = createClient(API_URL, ANON, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
    const session = { access_token: token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "x", user: { id: u.id, email, app_metadata: { role } } };
    return { id: u.id, client: c, session };
  }
  const c = createClient(API_URL, ANON, opts);
  must(await c.auth.signInWithPassword({ email, password: PASSWORD }), `login ${label}`);
  const { data: s } = await c.auth.getSession();
  return { id: u.id, client: c, session: s.session };
}

try {
  console.log(`== Preparando dados de teste (${tag})`);
  const nameA = `${tag.toUpperCase()} EMPRESA A`;
  const nameB = `${tag.toUpperCase()} EMPRESA B`;
  must(await admin.from("clients").insert([{ name: nameA }, { name: nameB }]), "clientes");
  created.clients.push(nameA, nameB);
  const today = new Date().toISOString().slice(0, 10);
  const loads = must(
    await admin
      .from("loading_schedules")
      .insert([
        { schedule_date: today, client_name: nameA, cargo: "PRODUTO A", destination: "Curitiba/PR; Curitiba/PR (2)", status: "entregue" },
        { schedule_date: today, client_name: nameA, cargo: "PRODUTO A2", destination: "Londrina/PR", status: "em_viagem" },
        { schedule_date: today, client_name: nameB, cargo: "PRODUTO B", destination: "Joinville/SC", status: "entregue" },
      ])
      .select("id, client_name"),
    "cargas"
  );
  created.loads.push(...loads.map((l) => l.id));
  const [loadA, , loadB] = loads;

  const driver = await makeUser("motorista", "motorista");
  const photoA = `${driver.id}/teste/${tag}-a.jpg`;
  const photoB = `${driver.id}/teste/${tag}-b.jpg`;
  const photoChecklist = `${driver.id}/teste/${tag}-checklist.jpg`;
  for (const p of [photoA, photoB, photoChecklist]) {
    must(await admin.storage.from("driver-photos").upload(p, JPEG, { contentType: "image/jpeg" }), `foto ${p}`);
    created.photos.push(p);
  }
  const proofs = must(
    await admin
      .from("delivery_proofs")
      .insert([
        { schedule_id: loadA.id, destination: "Curitiba/PR", client_name: "DEST A", invoice_number: "111", cte_number: "222", invoice_weight_kg: 1000, unloaded_weight_kg: 990, photos: [photoA], user_id: driver.id, notes: "obs A" },
        { schedule_id: loadB.id, destination: "Joinville/SC", client_name: "DEST B", invoice_number: "333", cte_number: "444", invoice_weight_kg: 500, unloaded_weight_kg: 500, photos: [photoB], user_id: driver.id },
      ])
      .select("id, schedule_id"),
    "comprovantes"
  );
  const proofA = proofs.find((p) => p.schedule_id === loadA.id);
  const proofB = proofs.find((p) => p.schedule_id === loadB.id);

  const cliente = await makeUser("cliente", "cliente");
  must(await admin.from("client_portal_links").insert({ user_id: cliente.id, client_name: nameA }), "vínculo do cliente");
  const staff = await makeUser("logistica", "logistica");

  console.log("\n== 1) Cliente não lê nenhuma tabela diretamente");
  const spec = await fetch(`${API_URL}/rest/v1/`, { headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } }).then((r) => r.json());
  const tables = Object.keys(spec.paths ?? {})
    .filter((p) => p !== "/" && !p.startsWith("/rpc/"))
    .map((p) => p.slice(1));
  check("lista de tabelas obtida", tables.length >= 25, String(tables.length));
  const leaks = [];
  for (const t of tables) {
    const r = await cliente.client.from(t).select("*").limit(1);
    if (!r.error && (r.data ?? []).length > 0) leaks.push(t);
  }
  check(`nenhuma das ${tables.length} tabelas devolve dado ao cliente`, leaks.length === 0, leaks.join(", "));

  console.log("\n== 2) Cliente não grava nada");
  const ins1 = await cliente.client.from("loading_schedule_notes").insert({ schedule_id: loadA.id, body: "invasão" });
  check("não cria observação em carga", Boolean(ins1.error));
  const ins2 = await cliente.client.from("delivery_proofs").insert({ schedule_id: loadA.id, destination: "Curitiba/PR (2)", client_name: "x", invoice_number: "1", invoice_weight_kg: 1, unloaded_weight_kg: 1, photos: [photoA] });
  check("não cria comprovante", Boolean(ins2.error));
  const upd = await cliente.client.from("loading_schedules").update({ status: "programado" }).eq("id", loadA.id).select("id");
  check("não altera carga", Boolean(upd.error) || (upd.data ?? []).length === 0);
  const still = must(await admin.from("loading_schedules").select("status").eq("id", loadA.id).single(), "status");
  check("carga continua igual", still.status === "entregue");

  console.log("\n== 3) Cliente não acessa arquivos diretamente");
  for (const bucket of ["driver-photos", "client-proofs"]) {
    const l = await cliente.client.storage.from(bucket).list(driver.id + "/teste");
    check(`não lista ${bucket}`, Boolean(l.error) || (l.data ?? []).length === 0);
  }
  for (const p of [photoA, photoB, photoChecklist]) {
    const d = await cliente.client.storage.from("driver-photos").download(p);
    check(`não baixa foto interna ${p.split("/").pop()}`, Boolean(d.error));
    const s = await cliente.client.storage.from("driver-photos").createSignedUrl(p, 60);
    check(`não gera link da foto interna ${p.split("/").pop()}`, Boolean(s.error) || !s.data?.signedUrl);
  }
  const up = await cliente.client.storage.from("client-proofs").upload(`${tag}/x.jpg`, JPEG, { contentType: "image/jpeg" });
  check("não envia arquivo", Boolean(up.error));

  console.log("\n== 4) Funções de apoio fechadas para o cliente");
  const fp = await cliente.client.rpc("fleet_plates");
  check("fleet_plates vazio", Boolean(fp.error) || (fp.data ?? []).length === 0);
  const fk = await cliente.client.rpc("fuel_last_km", { p_plate: "AAA1A11" });
  check("fuel_last_km vazio", Boolean(fk.error) || fk.data === null);
  const dl = await cliente.client.rpc("my_driver_labels");
  check("my_driver_labels vazio", Boolean(dl.error) || (dl.data ?? []).length === 0);

  console.log("\n== 5) Portal devolve só as cargas da empresa dele, só com os campos combinados");
  const portal = must(await cliente.client.rpc("client_portal_loads", { p_from: today, p_to: today }), "portal");
  const ids = portal.map((l) => l.id).sort();
  const expected = loads.filter((l) => l.client_name === nameA).map((l) => l.id).sort();
  check("vê as 2 cargas da empresa A", JSON.stringify(ids.filter((i) => expected.includes(i))) === JSON.stringify(expected), JSON.stringify(ids));
  check("não vê a carga da empresa B", !ids.includes(loadB.id));
  const forbidden = ["cargo", "weight", "quote_id", "origin", "loading_time", "created_by"];
  const keys = new Set(portal.flatMap((l) => Object.keys(l)));
  check("sem campos internos (frete, cotação, produto, peso)", forbidden.every((k) => !keys.has(k)), [...keys].join(","));
  const pa = portal.find((l) => l.id === loadA.id);
  check("comprovante da A vem com NF, CTE, pesos e observação", pa?.proofs?.[0]?.invoice_number === "111" && pa.proofs[0].notes === "obs A" && pa.proofs[0].photo_count === 1);
  check("sem o caminho interno das fotos", !JSON.stringify(portal).includes("driver-photos") && !JSON.stringify(portal).includes(photoA));
  const staffPortal = await staff.client.rpc("client_portal_loads", { p_from: today, p_to: today });
  check("equipe não usa a função do portal", Boolean(staffPortal.error));

  console.log("\n== 6) A equipe continua com o acesso de antes");
  const sl = await staff.client.from("loading_schedules").select("id").eq("id", loadB.id);
  check("logística lê cargas", (sl.data ?? []).length === 1, sl.error?.message);
  const ss = await staff.client.storage.from("driver-photos").createSignedUrl(photoA, 60);
  check("logística vê fotos internas", Boolean(ss.data?.signedUrl), ss.error?.message);

  if (SITE) {
    console.log("\n== 7) Rota das fotos do portal (site em " + SITE + ")");
    const host = new URL(process.env.COOKIE_API_URL || API_URL).hostname.split(".")[0];
    const cookie = `sb-${host}-auth-token=base64-${Buffer.from(JSON.stringify(cliente.session)).toString("base64url")}`;
    const get = (q) => fetch(`${SITE}/api/portal/foto?${q}`, { headers: { cookie }, redirect: "manual" });
    const own = await get(`proof=${proofA.id}&n=0`);
    const loc = own.headers.get("location") ?? "";
    check("foto do próprio comprovante: redireciona para a pasta do cliente", own.status === 302 && loc.includes("/client-proofs/"), `${own.status} ${loc.slice(0, 80)}`);
    check("o link não aponta para o armazenamento interno", !loc.includes("driver-photos"));
    if (own.status === 302) created.mirror.push(loc);
    const img = loc ? await fetch(loc) : null;
    check("a foto abre", img?.ok === true, String(img?.status));
    const other = await get(`proof=${proofB.id}&n=0`);
    check("foto de outra empresa: negada", other.status === 404, String(other.status));
    const none = await fetch(`${SITE}/api/portal/foto?proof=${proofA.id}&n=0`, { redirect: "manual" });
    check("sem login: negada", none.status === 401, String(none.status));
    const staffCookie = `sb-${host}-auth-token=base64-${Buffer.from(JSON.stringify(staff.session)).toString("base64url")}`;
    const st = await fetch(`${SITE}/api/portal/foto?proof=${proofA.id}&n=0`, { headers: { cookie: staffCookie }, redirect: "manual" });
    check("perfil da equipe não usa a rota do portal", st.status === 403, String(st.status));
  } else {
    console.log("\n(rota das fotos não testada: rode com SITE=http://localhost:3101)");
  }
} catch (e) {
  fail++;
  console.log("ERRO:", e.message);
} finally {
  console.log("\n== Limpando");
  try {
    if (created.loads.length) await admin.from("loading_schedules").delete().in("id", created.loads);
    if (created.clients.length) await admin.from("clients").delete().in("name", created.clients);
    if (created.photos.length) await admin.storage.from("driver-photos").remove(created.photos);
    const { data: folders } = await admin.storage.from("client-proofs").list("", { limit: 1000 });
    for (const f of folders ?? []) {
      if (!f.name.startsWith(tag)) continue;
      const { data: inner } = await admin.storage.from("client-proofs").list(f.name, { limit: 1000 });
      for (const g of inner ?? []) {
        const { data: files } = await admin.storage.from("client-proofs").list(`${f.name}/${g.name}`);
        await admin.storage.from("client-proofs").remove((files ?? []).map((x) => `${f.name}/${g.name}/${x.name}`));
      }
    }
    for (const id of created.users) await admin.auth.admin.deleteUser(id);
  } catch (e) {
    console.log("aviso na limpeza:", e.message);
  }
  console.log(`\n${pass} ok, ${fail} falha(s)`);
  process.exit(fail ? 1 : 0);
}
