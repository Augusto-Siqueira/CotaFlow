// Popula a pilha de ORIGEM do ensaio com dados parecidos com os reais
// (usuários com senha, cadastro, programação, defeito, check-list e foto) para
// provar que a cópia leva tudo — inclusive as senhas.
//   API_URL=... SERVICE_ROLE_KEY=... node infra/scripts/seed-rehearsal.mjs
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const url = process.env.API_URL;
const key = process.env.SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina API_URL e SERVICE_ROLE_KEY.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const must = (r, what) => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

const users = {
  admin: { email: "admin@ensaio.cotaflow.local", password: "Admin-Ensaio-1", role: "admin" },
  motorista: {
    email: "11122233344@motorista.transbochnia.com.br",
    password: "Motorista-Ensaio-1",
    role: "motorista",
  },
};
const ids = {};
for (const [k, u] of Object.entries(users)) {
  const r = await db.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    app_metadata: { role: u.role },
  });
  ids[k] = must(r, `usuário ${k}`).user.id;
}

must(await db.from("fleet_units").insert([{ plate: "ENS1A11", kind: "cavalo" }, { plate: "ENS2B22", kind: "semirreboque" }]), "frota");
const client = must(await db.from("clients").insert({ name: "CLIENTE ENSAIO LTDA", trade_name: "ENSAIO" }).select("id").single(), "cliente");
must(await db.from("drivers").insert({ name: "MOTORISTA DE ENSAIO", nickname: "MOT ENSAIO", cpf: "11122233344", user_id: ids.motorista }), "motorista");
const today = new Date().toISOString().slice(0, 10);
must(await db.from("loading_schedules").insert({ schedule_date: today, client_name: "ENSAIO", cargo: "METANOL", origin: "Paranaguá/PR", destination: "Araucária/PR; Curitiba/PR", weight: "35", plate: "ENS1A11", trailer_plate: "ENS2B22", driver: "MOT ENSAIO", status: "carregando" }), "programação");
must(await db.from("maintenance_workshops").insert({ name: "Oficina Ensaio" }), "oficina");
must(await db.from("maintenance_reports").insert({ plate: "ENS1A11", category: "Freios", severity: 2, description: "defeito de ensaio", reported_by: ids.motorista, source: "motorista", photos: [`${ids.motorista}/2026-10/ensaio.jpg`] }), "defeito");
must(await db.from("driver_checklists").insert({ user_id: ids.motorista, plate: "ENS1A11", started_at: new Date(Date.now() - 400000).toISOString(), answers: { a1: "ok", b1: "prob" }, notes: { b1: "teste" }, photos: { b1: [`${ids.motorista}/2026-10/ensaio.jpg`] }, nonconformities: 1 }), "check-list");

const jpeg = new Blob([Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64")], { type: "image/jpeg" });
must(await db.storage.from("driver-photos").upload(`${ids.motorista}/2026-10/ensaio.jpg`, jpeg, { contentType: "image/jpeg" }), "foto");

writeFileSync(new URL("../.rehearsal-users.json", import.meta.url), JSON.stringify({ users, ids, client: client.id }, null, 2));
console.log("Origem populada. Usuários: admin e motorista (senhas em infra/.rehearsal-users.json).");
