// Teste de fumaça das REGRAS DE SEGURANÇA e dos serviços da pilha.
// Cria usuários de teste (um por perfil), confere o que cada um pode ou não
// fazer e APAGA tudo ao final. Serve para o ensaio local e para o Railway.
//
//   API_URL=http://127.0.0.1:54321 ANON_KEY=... SERVICE_ROLE_KEY=... \
//     node infra/scripts/smoke-test.mjs
//
// (a partir da raiz do projeto; sem as variáveis, lê infra/.env)
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
if (!API_URL || !ANON || !SERVICE) {
  console.error("Faltam API_URL, ANON_KEY ou SERVICE_ROLE_KEY.");
  process.exit(2);
}
if (MINT && !JWT_SECRET) {
  console.error("MINT=1 exige JWT_SECRET.");
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE, opts);
const tag = `zz${Date.now().toString(36)}`;
const PASSWORD = "Teste-" + Math.random().toString(36).slice(2, 10);

let pass = 0;
let fail = 0;
function check(name, ok, extra = "") {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "OK    " : "FALHOU"}  ${name}${!ok && extra ? "  -> " + extra : ""}`);
}

const created = { users: [], clientIds: [], plates: [], driverIds: [], loadIds: [], reportIds: [], paths: [] };

async function makeUser(label, role, extraMeta = {}) {
  const email = `${tag}-${label}@teste.cotaflow.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: role ? { role } : {},
    user_metadata: extraMeta,
  });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  created.users.push(data.user.id);
  if (MINT) {
    // Token assinado aqui, igual ao que o servidor de login emitiria.
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      aud: "authenticated", role: "authenticated", sub: data.user.id, email,
      app_metadata: role ? { role } : {}, user_metadata: extraMeta,
      iat: now, exp: now + 3600,
    };
    const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
    const token = `${body}.${createHmac("sha256", JWT_SECRET).update(body).digest("base64url")}`;
    const c = createClient(API_URL, ANON, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
    return { id: data.user.id, email, client: c };
  }
  const c = createClient(API_URL, ANON, opts);
  const { error: e2 } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw new Error(`login ${label}: ${e2.message}`);
  return { id: data.user.id, email, client: c };
}

try {
  // ---------- preparação (com a chave de serviço) ----------
  const u = {
    admin: await makeUser("admin", "admin"),
    logistica: await makeUser("logistica", "logistica"),
    manutencao: await makeUser("manutencao", "manutencao"),
    motorista: await makeUser("motorista", "motorista", { must_change_password: true }),
    outro: await makeUser("outro", "motorista"),
    leitura: await makeUser("leitura", null),
  };
  check(MINT ? "tokens de todos os perfis gerados (modo MINT)" : "login de todos os perfis (e-mail + senha)", true);

  const plate = `T${tag.slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, "X")}`.slice(0, 7).padEnd(7, "0");
  const { error: fe } = await admin.from("fleet_units").insert({ plate, kind: "cavalo" });
  if (fe) throw new Error("fleet_units: " + fe.message);
  created.plates.push(plate);

  const { data: cl, error: ce } = await admin
    .from("clients")
    .insert({ name: `${tag} cliente` })
    .select("id")
    .single();
  if (ce) throw new Error("clients: " + ce.message);
  created.clientIds.push(cl.id);

  const label = `${tag}-MOT`;
  const { data: drv, error: de } = await admin
    .from("drivers")
    .insert({ name: `${label} Nome`, nickname: label, cpf: String(Math.floor(1e10 + Math.random() * 8e10)), user_id: u.motorista.id })
    .select("id")
    .single();
  if (de) throw new Error("drivers: " + de.message);
  created.driverIds.push(drv.id);
  const { data: drv2, error: de2 } = await admin
    .from("drivers")
    .insert({ name: `${tag}-OUTRO Nome`, nickname: `${tag}-OUTRO`, cpf: String(Math.floor(1e10 + Math.random() * 8e10)), user_id: u.outro.id })
    .select("id")
    .single();
  if (de2) throw new Error("drivers2: " + de2.message);
  created.driverIds.push(drv2.id);

  const today = new Date().toISOString().slice(0, 10);
  for (const [driver, cargo] of [[label, "CARGA-DO-MOTORISTA"], [`${tag}-OUTRO`, "CARGA-DO-OUTRO"]]) {
    const { data: l, error: le } = await admin
      .from("loading_schedules")
      .insert({ schedule_date: today, client_name: `${tag} cliente`, cargo, driver, plate })
      .select("id")
      .single();
    if (le) throw new Error("loading_schedules: " + le.message);
    created.loadIds.push(l.id);
  }

  // ---------- perfil admin / equipe ----------
  {
    const { data, error } = await u.admin.client.from("clients").select("id").eq("id", cl.id);
    check("admin lê clientes", !error && data.length === 1, error?.message);
    const r = await u.admin.client.from("clients").update({ name: `${tag} cliente 2` }).eq("id", cl.id).select("id");
    check("admin altera cliente", !r.error && r.data.length === 1, r.error?.message);
    const r2 = await u.logistica.client.from("clients").update({ name: "hack" }).eq("id", cl.id).select("id");
    check("logística NÃO altera cliente", !r2.error && r2.data.length === 0 || !!r2.error);
    const r3 = await u.leitura.client.from("clients").select("id").eq("id", cl.id);
    check("perfil sem papel (somente leitura) lê clientes", !r3.error && r3.data.length === 1);
    const r4 = await u.logistica.client.from("loading_schedules").select("id").in("id", created.loadIds);
    check("logística lê toda a programação", !r4.error && r4.data.length === 2, r4.error?.message);
  }

  // ---------- anônimo ----------
  {
    const anon = createClient(API_URL, ANON, opts);
    const r = await anon.from("clients").select("id");
    check("sem login NÃO lê clientes", !!r.error || (r.data ?? []).length === 0);
    if (MINT) {
      console.log("PULADO  cadastro aberto desligado (com anti-robô ligado o teste não é conclusivo; conferir no servidor de login)");
    } else {
      const s = await anon.auth.signUp({ email: `${tag}-novo@teste.cotaflow.local`, password: PASSWORD });
      check("cadastro aberto está DESLIGADO (signup recusado)", !!s.error, "signup foi aceito!");
    }
  }

  // ---------- motorista: o que NÃO pode ----------
  {
    const m = u.motorista.client;
    const q1 = await m.from("clients").select("id");
    check("motorista NÃO lê clientes", !q1.error && q1.data.length === 0, q1.error?.message);
    const q2 = await m.from("quotes").select("id").limit(1);
    check("motorista NÃO lê cotações (preços)", !q2.error && q2.data.length === 0, q2.error?.message);
    const q3 = await m.from("drivers").select("id, cpf");
    check("motorista só lê o PRÓPRIO cadastro (CPF dos outros fechado)", !q3.error && q3.data.length === 1 && q3.data[0].id === drv.id, JSON.stringify(q3.data));
    const q4 = await m.from("fleet_units").select("plate");
    check("motorista NÃO lê a frota", !q4.error && q4.data.length === 0, q4.error?.message);
    const q5 = await m.from("loading_schedules").select("cargo, driver");
    check("motorista lê SÓ as próprias cargas", !q5.error && q5.data.length === 1 && q5.data[0].cargo === "CARGA-DO-MOTORISTA", JSON.stringify(q5.data));
    const q6 = await m.from("clients").insert({ name: "invasor" });
    check("motorista NÃO grava cliente", !!q6.error, "gravou!");
    const q7 = await m.from("loading_schedules").update({ status: "entregue" }).eq("id", created.loadIds[0]).select("id");
    check("motorista NÃO altera programação", !!q7.error || q7.data.length === 0);
  }

  // ---------- motorista: o que PODE (relato de defeito e check-list) ----------
  {
    const m = u.motorista.client;
    const ok = await m
      .from("maintenance_reports")
      .insert({ plate, category: "Freios", severity: 3, description: "teste motorista", source: "motorista", photos: [] })
      .select("id")
      .single();
    check("motorista relata defeito (source=motorista)", !ok.error, ok.error?.message);
    if (ok.data) created.reportIds.push(ok.data.id);
    const bad1 = await m.from("maintenance_reports").insert({ plate, category: "Motor", severity: 1, description: "x", source: "manual" });
    check("motorista NÃO relata como 'manual'", !!bad1.error, "aceitou");
    const bad2 = await m.from("maintenance_reports").insert({ plate, category: "Motor", severity: 1, description: "x", source: "motorista", status: "concluida" });
    check("motorista NÃO cria defeito já 'concluída'", !!bad2.error, "aceitou");
    const mine = await m.from("maintenance_reports").select("id");
    check("motorista vê só os próprios relatos", !mine.error && mine.data.length === 1, JSON.stringify(mine.data));
    const other = await u.outro.client.from("maintenance_reports").select("id");
    check("outro motorista NÃO vê relatos alheios", !other.error && other.data.length === 0, JSON.stringify(other.data));
    const upd = await m.from("maintenance_reports").update({ status: "recusada" }).eq("id", ok.data?.id).select("id");
    check("motorista NÃO muda o status do relato", !!upd.error || upd.data.length === 0);

    const ck = await m.from("driver_checklists").insert({
      user_id: u.motorista.id, plate, started_at: new Date(Date.now() - 300000).toISOString(),
      answers: { a1: "ok", b1: "prob" }, notes: { b1: "teste" }, photos: {}, nonconformities: 1,
    }).select("id").single();
    check("motorista envia check-list", !ck.error, ck.error?.message);
    const ckFake = await m.from("driver_checklists").insert({
      user_id: u.outro.id, plate, started_at: new Date().toISOString(), answers: {}, nonconformities: 0,
    });
    check("motorista NÃO envia check-list em nome de outro", !!ckFake.error, "aceitou");
    const ckOther = await u.outro.client.from("driver_checklists").select("id");
    check("outro motorista NÃO lê check-list alheio", !ckOther.error && ckOther.data.length === 0);
    const ckStaff = await u.manutencao.client.from("driver_checklists").select("id");
    check("manutenção lê os check-lists", !ckStaff.error && ckStaff.data.length >= 1, ckStaff.error?.message);
    const items = await m.from("checklist_items").select("id").eq("active", true);
    check("motorista lê os itens do check-list (14 iniciais)", !items.error && items.data.length >= 14, items.error?.message);
  }

  // ---------- manutenção x logística ----------
  {
    const tri = await u.manutencao.client.from("maintenance_reports").update({ status: "agendada", scheduled_for: new Date().toISOString() }).eq("id", created.reportIds[0]).select("id");
    check("manutenção decide (agenda) o defeito", !tri.error && tri.data.length === 1, tri.error?.message);
    const lg = await u.logistica.client.from("maintenance_reports").update({ status: "triagem" }).eq("id", created.reportIds[0]).select("id");
    check("logística NÃO decide o defeito", !!lg.error || lg.data.length === 0);
    const lg2 = await u.logistica.client.from("maintenance_reports").insert({ plate, category: "Outros", severity: 1, description: "logística relata" }).select("id").single();
    check("logística relata defeito", !lg2.error, lg2.error?.message);
    if (lg2.data) created.reportIds.push(lg2.data.id);
  }

  // ---------- fotos (Storage) ----------
  {
    const m = u.motorista.client;
    const bytes = new Blob([new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70])], { type: "image/jpeg" });
    const mine = `${u.motorista.id}/2026-10/${tag}.jpg`;
    const up = await m.storage.from("driver-photos").upload(mine, bytes, { contentType: "image/jpeg" });
    check("motorista envia foto para a própria pasta", !up.error, up.error?.message);
    created.paths.push(mine);
    const theirs = `${u.outro.id}/2026-10/${tag}-x.jpg`;
    const up2 = await m.storage.from("driver-photos").upload(theirs, bytes, { contentType: "image/jpeg" });
    check("motorista NÃO envia foto para a pasta de outro", !!up2.error, "aceitou");
    const dl = await m.storage.from("driver-photos").download(mine);
    check("motorista baixa a própria foto", !dl.error, dl.error?.message);
    const dl2 = await u.outro.client.storage.from("driver-photos").download(mine);
    check("outro motorista NÃO baixa a foto alheia", !!dl2.error, "baixou");
    const sg = await u.manutencao.client.storage.from("driver-photos").createSignedUrl(mine, 60);
    check("manutenção gera link da foto", !sg.error && !!sg.data?.signedUrl, sg.error?.message);
    if (sg.data?.signedUrl) {
      const r = await fetch(sg.data.signedUrl.replace(/^https?:\/\/[^/]+/, API_URL));
      check("link da foto abre (HTTP 200)", r.status === 200, String(r.status));
    }
    const sg2 = await u.outro.client.storage.from("driver-photos").createSignedUrl(mine, 60);
    check("outro motorista NÃO gera link da foto alheia", !!sg2.error);
  }

  // ---------- senha: troca obrigatória no 1º acesso ----------
  if (MINT) {
    console.log("PULADO  troca de senha no 1º acesso (depende do login real)");
  } else {
    const { data } = await u.motorista.client.auth.getUser();
    check("flag de troca de senha chega no token (must_change_password)", data.user?.user_metadata?.must_change_password === true);
    const ch = await u.motorista.client.auth.updateUser({ password: PASSWORD + "x", data: { must_change_password: false } });
    check("motorista troca a própria senha e limpa a flag", !ch.error && ch.data.user?.user_metadata?.must_change_password === false, ch.error?.message);
  }
} catch (e) {
  fail++;
  console.log("ERRO NO TESTE:", e.message);
} finally {
  // ---------- limpeza ----------
  try {
    if (created.paths.length) await admin.storage.from("driver-photos").remove(created.paths);
    for (const id of created.reportIds) await admin.from("maintenance_reports").delete().eq("id", id);
    await admin.from("maintenance_reports").delete().in("plate", created.plates);
    await admin.from("driver_checklists").delete().in("user_id", created.users);
    for (const id of created.loadIds) await admin.from("loading_schedules").delete().eq("id", id);
    for (const id of created.driverIds) await admin.from("drivers").delete().eq("id", id);
    for (const id of created.clientIds) await admin.from("clients").delete().eq("id", id);
    for (const p of created.plates) await admin.from("fleet_units").delete().eq("plate", p);
    for (const id of created.users) await admin.auth.admin.deleteUser(id);
  } catch (e) {
    console.log("Aviso na limpeza:", e.message);
  }
}

console.log(`\n${pass} passaram, ${fail} falharam.`);
process.exit(fail ? 1 : 0);
