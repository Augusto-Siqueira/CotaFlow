import { createBrowserClient } from "@supabase/ssr";

// Cliente do navegador: guarda a sessão em cookies, assim o servidor (rotas
// /api e páginas server) enxerga o mesmo usuário logado.
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
