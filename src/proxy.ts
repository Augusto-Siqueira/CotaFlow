import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // Depois da migração para o Railway: o sistema antigo (Vercel) define
  // REDIRECT_TO e passa a só mandar todo mundo para o endereço novo, para
  // ninguém continuar gravando no banco antigo. Redirecionamento temporário
  // (307): para voltar atrás, basta apagar a variável. No Railway ela não existe.
  const redirectTo = process.env.REDIRECT_TO;
  if (redirectTo) {
    return NextResponse.redirect(
      new URL(request.nextUrl.pathname + request.nextUrl.search, redirectTo),
      307
    );
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() confere a assinatura do token localmente (e renova se estiver
  // vencido), sem ir ao Supabase a cada página — antes, getUser() custava
  // uma ida e volta ao banco em toda navegação.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ?? null;

  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/login";

  // Link de proposta comercial enviado ao cliente: único trecho aberto sem
  // login. A tabela continua fechada; a página só abre UMA proposta, pelo
  // código do link, via função do banco.
  if (pathname.startsWith("/proposta/")) return response;

  if (!user && !isLogin) {
    if (pathname.startsWith("/api/")) {
      return Response.json({ error: "Não autenticado." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

// manifest.webmanifest e sw.js ficam abertos (sem exigir login): é o que o
// Chrome lê para oferecer "Instalar app" antes de a pessoa entrar.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
