import {
  logUserAdmin,
  requireAdmin,
  supabaseAdmin,
  temporaryPassword,
  validPortalClients,
} from "@/lib/supabaseAdmin";
import { STAFF_ROLES } from "@/lib/roles";

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  banned: boolean;
  must_change_password: boolean;
  /** Perfil cliente: empresas que ele enxerga no portal. */
  clients: string[];
}

// Lista todos os usuários (equipe e motoristas).
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = supabaseAdmin();
  // Nome do motorista vem do cadastro de motoristas (fonte única), não do login.
  const { data: drivers } = await admin.from("drivers").select("name, user_id").not("user_id", "is", null);
  const driverName = new Map(
    ((drivers ?? []) as { name: string; user_id: string }[]).map((d) => [d.user_id, d.name])
  );
  const { data: links } = await admin.from("client_portal_links").select("user_id, client_name");
  const clientsOf = new Map<string, string[]>();
  for (const l of (links ?? []) as { user_id: string; client_name: string }[]) {
    clientsOf.set(l.user_id, [...(clientsOf.get(l.user_id) ?? []), l.client_name].sort());
  }
  const rows: AdminUserRow[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    for (const u of data.users) {
      rows.push({
        id: u.id,
        email: u.email ?? "",
        name: driverName.get(u.id) ?? (u.user_metadata?.name as string | undefined) ?? null,
        role: (u.app_metadata?.role as string | undefined) ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
        must_change_password: u.user_metadata?.must_change_password === true,
        clients: clientsOf.get(u.id) ?? [],
      });
    }
    if (data.users.length < 1000) break;
  }
  return Response.json({ users: rows });
}

// Cria um usuário da equipe com senha temporária (troca obrigatória no 1º acesso).
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as
    | { email?: string; name?: string; role?: string; clients?: unknown }
    | null;
  const email = body?.email?.trim().toLowerCase() ?? "";
  const name = body?.name?.trim() ?? "";
  const role = body?.role ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (!name) return Response.json({ error: "Informe o nome." }, { status: 400 });
  const isClient = role === "cliente";
  if (!isClient && !STAFF_ROLES.some((r) => r.value === role)) {
    return Response.json({ error: "Perfil inválido." }, { status: 400 });
  }
  // Cliente do portal: precisa de pelo menos uma empresa do cadastro de clientes.
  const clients = isClient ? await validPortalClients(body?.clients) : [];
  if (isClient && clients.length === 0) {
    return Response.json({ error: "Escolha pelo menos uma empresa para o cliente." }, { status: 400 });
  }

  const password = temporaryPassword();
  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { name, must_change_password: true },
  });
  if (error) {
    const msg = /already|registered|exists/i.test(error.message)
      ? "Já existe um usuário com esse e-mail."
      : error.message;
    return Response.json({ error: msg }, { status: 400 });
  }
  if (isClient) {
    const { error: linkError } = await supabaseAdmin()
      .from("client_portal_links")
      .insert(clients.map((client_name) => ({ user_id: data.user.id, client_name })));
    if (linkError) {
      // Sem as empresas o usuário não serve: desfaz a criação.
      await supabaseAdmin().auth.admin.deleteUser(data.user.id);
      return Response.json({ error: `Não foi possível ligar as empresas (${linkError.message}).` }, { status: 500 });
    }
  }
  await logUserAdmin(auth.user, "criar", { id: data.user.id, email }, { role, name, ...(isClient ? { empresas: clients } : {}) });
  return Response.json({ id: data.user.id, password });
}
