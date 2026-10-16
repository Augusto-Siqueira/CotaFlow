// Dados de TESTE do ambiente local (infra/.env). Pode rodar quantas vezes
// quiser: só cria o que falta. Nunca aponta para a produção — a única leitura
// externa é a lista pública de municípios, copiada uma vez da produção se o
// arquivo infra/.env.staging existir (senão entram só algumas cidades).
//
// Usuários e senhas de teste ficam em infra/.local-users.json (fora do git).
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const readEnv = (path) =>
  Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  );

const env = readEnv("infra/.env");
if (!/127\.0\.0\.1|localhost/.test(env.PUBLIC_API_URL ?? "")) {
  console.error("infra/.env não aponta para o ambiente local. Nada foi feito.");
  process.exit(1);
}
const db = createClient(env.PUBLIC_API_URL, env.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

// ---- Usuários de teste ------------------------------------------------------
const USERS_FILE = "infra/.local-users.json";
const users = existsSync(USERS_FILE)
  ? JSON.parse(readFileSync(USERS_FILE, "utf8"))
  : {
      admin: { login: "admin@local.test", password: "Local-" + randomBytes(6).toString("base64url"), role: "admin" },
      logistica: { login: "logistica@local.test", password: "Local-" + randomBytes(6).toString("base64url"), role: "logistica" },
      // Motorista segue a regra real: login = CPF, senha = 6 primeiros dígitos (CPF fictício válido).
      motorista: { login: "52998224725", password: "529982", role: "motorista" },
    };
writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));

const existing = new Map();
for (let page = 1; ; page++) {
  const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  data.users.forEach((u) => existing.set(u.email, u.id));
  if (data.users.length < 1000) break;
}
const ids = {};
for (const [key, u] of Object.entries(users)) {
  const email = u.login.includes("@") ? u.login : `${u.login}@motorista.transbochnia.com.br`;
  ids[key] =
    existing.get(email) ??
    must(
      await db.auth.admin.createUser({
        email,
        password: u.password,
        email_confirm: true,
        app_metadata: { role: u.role },
      }),
      `usuário ${key}`
    ).user.id;
}

// ---- Cidades ----------------------------------------------------------------
const { count: cityCount } = await db.from("cities").select("id", { count: "exact", head: true });
if ((cityCount ?? 0) < 100) {
  let names = [];
  if (existsSync("infra/.env.staging")) {
    const prod = readEnv("infra/.env.staging");
    const src = createClient(prod.PUBLIC_API_URL, prod.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    for (let from = 0; ; from += 1000) {
      const r = await src.from("cities").select("name, uf, latitude, longitude").range(from, from + 999);
      if (r.error) break;
      names.push(...r.data);
      if (r.data.length < 1000) break;
    }
  }
  if (names.length === 0) {
    names = ["Curitiba/PR", "Araucária/PR", "Paranaguá/PR", "Ponta Grossa/PR", "Palhoça/SC", "Joinville/SC"].map(
      (name) => ({ name })
    );
  }
  for (let i = 0; i < names.length; i += 500) {
    must(await db.from("cities").upsert(names.slice(i, i + 500), { onConflict: "name", ignoreDuplicates: true }), "cidades");
  }
  console.log(`  cidades: ${names.length}`);
}

// ---- Cadastros e cargas de exemplo -------------------------------------------
const CLIENT = "CLIENTE TESTE";
if (!must(await db.from("clients").select("id").eq("name", CLIENT), "cliente").length) {
  must(await db.from("clients").insert({ name: CLIENT }), "cliente");
}
must(
  await db.from("fleet_units").upsert(
    [
      { plate: "TST1A11", kind: "cavalo" },
      { plate: "TST2B22", kind: "cavalo" },
      { plate: "TST3C33", kind: "semirreboque" },
    ],
    { onConflict: "plate", ignoreDuplicates: true }
  ),
  "frota"
);
if (!must(await db.from("drivers").select("id").eq("cpf", "52998224725"), "motorista").length) {
  must(
    await db.from("drivers").insert({ name: "MOTORISTA TESTE", nickname: "MOT TESTE", cpf: "52998224725", user_id: ids.motorista }),
    "motorista"
  );
}

const p = (n) => String(n).padStart(2, "0");
const now = new Date();
const today = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
const hasLoads = must(
  await db.from("loading_schedules").select("id").eq("schedule_date", today).eq("client_name", CLIENT),
  "cargas"
).length;
if (!hasLoads) {
  must(
    await db.from("loading_schedules").insert([
      { schedule_date: today, client_name: CLIENT, cargo: "METANOL", origin: "Paranaguá/PR", destination: "Curitiba/PR; Araucária/PR", weight: "35", plate: "TST1A11", trailer_plate: "TST3C33", driver: "MOT TESTE", loading_time: "07:00", status: "em_viagem" },
      { schedule_date: today, client_name: CLIENT, cargo: "RESINA UREIA", origin: "Araucária/PR", destination: "Ponta Grossa/PR", weight: "28", plate: "TST2B22", driver: "MOT TESTE", loading_time: "09:30", status: "programado" },
    ]),
    "cargas"
  );
}

console.log("  usuários de teste em infra/.local-users.json (admin, logistica e motorista)");
