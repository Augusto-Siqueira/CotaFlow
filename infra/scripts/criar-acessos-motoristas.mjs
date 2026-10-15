// Cria o acesso ao app do motorista para todo motorista cadastrado que ainda não
// tem. Login = CPF (só números). Senha FIXA = 6 primeiros dígitos do CPF, sem
// troca obrigatória (o motorista não tem como alterar a senha no app).
// Pode rodar de novo a qualquer momento: só cria quem ainda não tem acesso.
//
//   Simulação (não grava nada):
//     API_URL=... SERVICE_ROLE_KEY=... node infra/scripts/criar-acessos-motoristas.mjs
//   Para valer:
//     ... node infra/scripts/criar-acessos-motoristas.mjs --aplicar
//
// A SERVICE_ROLE_KEY fica só no seu computador (nunca no app nem no git).
import { createClient } from "@supabase/supabase-js";

const url = process.env.API_URL;
const key = process.env.SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Defina API_URL e SERVICE_ROLE_KEY.");
  process.exit(1);
}
const apply = process.argv.includes("--aplicar");
const db = createClient(url, key, { auth: { persistSession: false } });
const DOMAIN = "motorista.transbochnia.com.br";

function cpfValido(d) {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(d[len])) return false;
  }
  return true;
}

const { data: drivers, error } = await db.from("drivers").select("id, name, cpf, user_id").order("name");
if (error) throw new Error(error.message);

// E-mails já existentes no Auth (para não tentar criar duas vezes).
const existing = new Set();
for (let page = 1; ; page++) {
  const { data, error: e } = await db.auth.admin.listUsers({ page, perPage: 1000 });
  if (e) throw new Error(e.message);
  data.users.forEach((u) => existing.add(u.email));
  if (data.users.length < 1000) break;
}

let criados = 0, vinculados = 0;
const problemas = [];
for (const d of drivers) {
  if (d.user_id) continue;
  const cpf = (d.cpf ?? "").replace(/\D/g, "");
  if (!cpfValido(cpf)) {
    problemas.push(`${d.name}: CPF inválido ou vazio (${d.cpf ?? "—"})`);
    continue;
  }
  const email = `${cpf}@${DOMAIN}`;
  let userId = null;
  if (existing.has(email)) {
    const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
    userId = data.users.find((u) => u.email === email)?.id ?? null;
    if (!userId) { problemas.push(`${d.name}: e-mail já existe mas não foi localizado`); continue; }
    vinculados++;
  } else if (apply) {
    const r = await db.auth.admin.createUser({
      email,
      password: cpf.slice(0, 6),
      email_confirm: true,
      app_metadata: { role: "motorista" },
    });
    if (r.error) { problemas.push(`${d.name}: ${r.error.message}`); continue; }
    userId = r.data.user.id;
    criados++;
  } else {
    criados++;
    continue;
  }
  if (apply) {
    const u = await db.from("drivers").update({ user_id: userId }).eq("id", d.id);
    if (u.error) problemas.push(`${d.name}: não vinculou (${u.error.message})`);
  }
}

console.log(`${apply ? "APLICADO" : "SIMULAÇÃO (nada foi gravado)"}: ${criados} acesso(s) a criar/criados, ${vinculados} vinculado(s) a login já existente.`);
if (problemas.length) {
  console.log(`\nAtenção (${problemas.length}):`);
  problemas.forEach((p) => console.log(" - " + p));
}
if (!apply) console.log("\nPara valer, rode de novo com --aplicar.");
