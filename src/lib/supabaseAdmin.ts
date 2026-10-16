import "server-only";
import { createClient, type User } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";
import { createSupabaseServer } from "@/lib/supabaseServer";

// Cliente com a chave de serviço (ignora as regras de acesso do banco): SÓ no
// servidor, e só depois de requireAdmin(). A variável não tem NEXT_PUBLIC_ de
// propósito, para nunca ir para o navegador.
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Confere no servidor de login quem está pedindo; só passa se for admin. */
export async function requireAdmin(): Promise<
  { ok: true; user: User } | { ok: false; response: Response }
> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false, response: Response.json({ error: "Faça login de novo." }, { status: 401 }) };
  }
  if (data.user.app_metadata?.role !== "admin") {
    return { ok: false, response: Response.json({ error: "Só o admin pode fazer isso." }, { status: 403 }) };
  }
  return { ok: true, user: data.user };
}

/** Senha temporária fácil de ditar (sem 0/O, 1/l/I). */
export function temporaryPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += chars[randomInt(chars.length)];
  return s;
}

export const DRIVER_EMAIL_DOMAIN = "motorista.transbochnia.com.br";

export async function logUserAdmin(
  actor: User,
  action: string,
  target: { id?: string; email?: string },
  details: Record<string, unknown> = {}
) {
  await supabaseAdmin().from("user_admin_log").insert({
    actor_id: actor.id,
    actor_email: actor.email,
    action,
    target_id: target.id ?? null,
    target_email: target.email ?? null,
    details,
  });
}
