import type { NextRequest } from "next/server";
import {
  DRIVER_EMAIL_DOMAIN,
  logUserAdmin,
  requireAdmin,
  supabaseAdmin,
  temporaryPassword,
} from "@/lib/supabaseAdmin";
import { isRole } from "@/lib/roles";

// Ações do admin sobre um usuário: mudar perfil, bloquear, desbloquear e
// redefinir a senha. O admin não pode tirar o próprio acesso de admin (evita
// o sistema ficar sem ninguém para administrar).
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/admin/users/[id]">) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const body = (await request.json().catch(() => null)) as
    | { action?: string; role?: string; name?: string }
    | null;
  const action = body?.action;
  const admin = supabaseAdmin();

  const { data: found, error: getErr } = await admin.auth.admin.getUserById(id);
  if (getErr || !found.user) return Response.json({ error: "Usuário não encontrado." }, { status: 404 });
  const target = found.user;
  const email = target.email ?? "";
  const isSelf = target.id === auth.user.id;
  const isDriverLogin = email.endsWith(`@${DRIVER_EMAIL_DOMAIN}`);

  if (action === "role") {
    const role = body?.role;
    if (!isRole(role)) return Response.json({ error: "Perfil inválido." }, { status: 400 });
    if (isSelf && role !== "admin") {
      return Response.json({ error: "Você não pode tirar o seu próprio perfil de admin." }, { status: 400 });
    }
    if ((role === "motorista") !== isDriverLogin) {
      return Response.json(
        { error: "O perfil motorista é só para logins de motorista (criados pelo cadastro de motoristas)." },
        { status: 400 }
      );
    }
    const before = target.app_metadata?.role ?? null;
    const { error } = await admin.auth.admin.updateUserById(id, {
      app_metadata: { ...target.app_metadata, role },
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await logUserAdmin(auth.user, "perfil", { id, email }, { de: before, para: role });
    return Response.json({ ok: true });
  }

  if (action === "name") {
    const name = body?.name?.trim() ?? "";
    if (!name) return Response.json({ error: "Informe o nome." }, { status: 400 });
    const { error } = await admin.auth.admin.updateUserById(id, {
      user_metadata: { ...target.user_metadata, name },
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await logUserAdmin(auth.user, "nome", { id, email }, { name });
    return Response.json({ ok: true });
  }

  if (action === "ban" || action === "unban") {
    if (isSelf) return Response.json({ error: "Você não pode bloquear a sua própria conta." }, { status: 400 });
    const { error } = await admin.auth.admin.updateUserById(id, {
      ban_duration: action === "ban" ? "876000h" : "none",
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await logUserAdmin(auth.user, action === "ban" ? "bloquear" : "desbloquear", { id, email });
    return Response.json({ ok: true });
  }

  if (action === "reset_password") {
    // Motorista: volta para a regra fixa (6 primeiros dígitos do CPF), sem troca.
    // Equipe: senha temporária nova, com troca obrigatória no próximo acesso.
    const cpf = isDriverLogin ? email.split("@")[0].replace(/\D/g, "") : "";
    const password = isDriverLogin && cpf.length === 11 ? cpf.slice(0, 6) : temporaryPassword();
    const { error } = await admin.auth.admin.updateUserById(id, {
      password,
      user_metadata: { ...target.user_metadata, must_change_password: !isDriverLogin },
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await logUserAdmin(auth.user, "redefinir senha", { id, email });
    return Response.json({ ok: true, password: isDriverLogin ? null : password, driver: isDriverLogin });
  }

  return Response.json({ error: "Ação inválida." }, { status: 400 });
}
