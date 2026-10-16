import type { NextRequest } from "next/server";
import {
  DRIVER_EMAIL_DOMAIN,
  logUserAdmin,
  requireAdmin,
  supabaseAdmin,
} from "@/lib/supabaseAdmin";

// Cria o login do app para um motorista do cadastro (substitui o script
// criar-acessos-motoristas.mjs): login = CPF, senha fixa = 6 primeiros dígitos
// do CPF, sem troca. Se já existir login com esse CPF, só vincula.
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/admin/drivers/[id]/access">) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const admin = supabaseAdmin();

  const { data: driver, error: dErr } = await admin
    .from("drivers")
    .select("id, name, cpf, user_id")
    .eq("id", id)
    .maybeSingle();
  if (dErr || !driver) return Response.json({ error: "Motorista não encontrado." }, { status: 404 });
  if (driver.user_id) return Response.json({ error: "Este motorista já tem acesso ao app." }, { status: 400 });

  const cpf = (driver.cpf ?? "").replace(/\D/g, "");
  if (cpf.length !== 11) return Response.json({ error: "CPF do motorista inválido." }, { status: 400 });
  const email = `${cpf}@${DRIVER_EMAIL_DOMAIN}`;

  let userId: string | null = null;
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
    // Já existe login com esse CPF: procura e vincula.
    for (let page = 1; !userId; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      userId = data.users.find((u) => u.email === email)?.id ?? null;
      if (data.users.length < 1000) break;
    }
    if (!userId) return Response.json({ error: "Login existente não localizado." }, { status: 500 });
  } else {
    userId = created.data.user.id;
  }

  const { error: linkErr } = await admin.from("drivers").update({ user_id: userId }).eq("id", id);
  if (linkErr) return Response.json({ error: linkErr.message }, { status: 500 });
  await logUserAdmin(auth.user, "criar acesso motorista", { id: userId, email }, { motorista: driver.name });
  return Response.json({ ok: true });
}
