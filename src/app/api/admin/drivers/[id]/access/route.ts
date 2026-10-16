import type { NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import {
  DRIVER_EMAIL_DOMAIN,
  logUserAdmin,
  requireRole,
  supabaseAdmin,
} from "@/lib/supabaseAdmin";

// Acesso do motorista ao app: login = CPF, senha fixa = 6 primeiros dígitos do
// CPF, sem troca. Quem cadastra motoristas (admin e logística) usa:
//   POST   cria o login (ou vincula/desbloqueia um que já exista com o CPF)
//   PUT    acompanha a troca de CPF no cadastro (login e senha novos)
//   DELETE bloqueia o login (antes de excluir o motorista; o histórico fica)
const CAN_MANAGE_DRIVERS = ["admin", "logistica"];
const DENIED = "Só o admin e a logística gerenciam o acesso dos motoristas.";

type Admin = ReturnType<typeof supabaseAdmin>;

async function loadDriver(admin: Admin, id: string) {
  const { data } = await admin.from("drivers").select("id, name, cpf, user_id").eq("id", id).maybeSingle();
  return data as { id: string; name: string; cpf: string | null; user_id: string | null } | null;
}

async function findLogin(admin: Admin, email: string): Promise<User | null> {
  for (let page = 1; ; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const u = data.users.find((x) => x.email === email);
    if (u) return u;
    if (data.users.length < 1000) return null;
  }
}

function cpfOf(driver: { cpf: string | null }): string | null {
  const cpf = (driver.cpf ?? "").replace(/\D/g, "");
  return cpf.length === 11 ? cpf : null;
}

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/admin/drivers/[id]/access">) {
  const auth = await requireRole(CAN_MANAGE_DRIVERS, DENIED);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const admin = supabaseAdmin();

  const driver = await loadDriver(admin, id);
  if (!driver) return Response.json({ error: "Motorista não encontrado." }, { status: 404 });
  if (driver.user_id) return Response.json({ error: "Este motorista já tem acesso ao app." }, { status: 400 });
  const cpf = cpfOf(driver);
  if (!cpf) return Response.json({ error: "CPF do motorista inválido." }, { status: 400 });
  const email = `${cpf}@${DRIVER_EMAIL_DOMAIN}`;

  let userId: string;
  const created = await admin.auth.admin.createUser({
    email,
    password: cpf.slice(0, 6),
    email_confirm: true,
    app_metadata: { role: "motorista" },
    user_metadata: { name: driver.name },
  });
  if (created.error) {
    if (!/already|registered|exists/i.test(created.error.message)) {
      return Response.json({ error: created.error.message }, { status: 500 });
    }
    // Já existe login com esse CPF (ex.: motorista recadastrado): vincula,
    // desbloqueia e volta a senha para a regra.
    const existing = await findLogin(admin, email);
    if (!existing) return Response.json({ error: "Login existente não localizado." }, { status: 500 });
    await admin.auth.admin.updateUserById(existing.id, {
      ban_duration: "none",
      password: cpf.slice(0, 6),
      app_metadata: { ...existing.app_metadata, role: "motorista" },
    });
    userId = existing.id;
  } else {
    userId = created.data.user.id;
  }

  const { error: linkErr } = await admin.from("drivers").update({ user_id: userId }).eq("id", id);
  if (linkErr) return Response.json({ error: linkErr.message }, { status: 500 });
  await logUserAdmin(auth.user, "criar acesso motorista", { id: userId, email }, { motorista: driver.name });
  return Response.json({ ok: true });
}

export async function PUT(_request: NextRequest, ctx: RouteContext<"/api/admin/drivers/[id]/access">) {
  const auth = await requireRole(CAN_MANAGE_DRIVERS, DENIED);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const admin = supabaseAdmin();

  const driver = await loadDriver(admin, id);
  if (!driver?.user_id) return Response.json({ error: "Motorista sem acesso ao app." }, { status: 404 });
  const cpf = cpfOf(driver);
  if (!cpf) return Response.json({ error: "CPF do motorista inválido." }, { status: 400 });
  const email = `${cpf}@${DRIVER_EMAIL_DOMAIN}`;

  const { error } = await admin.auth.admin.updateUserById(driver.user_id, {
    email,
    email_confirm: true,
    password: cpf.slice(0, 6),
  });
  if (error) {
    const msg = /already|registered|exists/i.test(error.message)
      ? "Já existe outro login com esse CPF."
      : error.message;
    return Response.json({ error: msg }, { status: 400 });
  }
  await logUserAdmin(auth.user, "atualizar CPF do acesso", { id: driver.user_id, email }, { motorista: driver.name });
  return Response.json({ ok: true });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/admin/drivers/[id]/access">) {
  const auth = await requireRole(CAN_MANAGE_DRIVERS, DENIED);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const admin = supabaseAdmin();

  const driver = await loadDriver(admin, id);
  if (!driver?.user_id) return Response.json({ ok: true }); // nada a bloquear
  const { data: u } = await admin.auth.admin.getUserById(driver.user_id);
  const { error } = await admin.auth.admin.updateUserById(driver.user_id, { ban_duration: "876000h" });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await logUserAdmin(auth.user, "bloquear acesso motorista", { id: driver.user_id, email: u.user?.email }, { motorista: driver.name });
  return Response.json({ ok: true });
}
