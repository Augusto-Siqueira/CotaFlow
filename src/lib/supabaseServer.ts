import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Um cliente por requisição: ele lê a sessão do usuário nos cookies, então o
// RLS do banco enxerga quem está pedindo.
export async function createSupabaseServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          // Em Server Components o Next não deixa gravar cookie; o proxy já
          // renova a sessão, então ignorar aqui é seguro.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}
