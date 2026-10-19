"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  canEditCommercial: boolean;
  role: string | null;
  canEditSchedule: boolean;
  canEditMaintenance: boolean;
  canEditFuel: boolean;
  isDriver: boolean;
  mustChangePassword: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  isAdmin: false,
  canEditCommercial: false,
  role: null,
  canEditSchedule: false,
  canEditMaintenance: false,
  canEditFuel: false,
  isDriver: false,
  mustChangePassword: false,
});

// O perfil vem de app_metadata.role, que só pode ser alterado pelo painel do
// Supabase (service role) — o usuário não consegue se promover pelo navegador.
// Isto só esconde botões; quem de fato barra a escrita é o RLS no banco.
export const MANUAL_LOGOUT_KEY = "cotaflow:manual-logout";

// Identidade do último login válido, guardada no celular. Serve SÓ para o app do
// motorista abrir e guardar a fila quando o token vence sem sinal (a biblioteca
// de login devolve "sem sessão" nesse caso). Não dá acesso a nada: o servidor
// continua exigindo o login de verdade em toda chamada.
const IDENTITY_KEY = "cotaflow:identity";

interface StoredIdentity {
  id: string;
  email: string | null;
  role: string | null;
  name: string | null;
}

function saveIdentity(user: User | null) {
  try {
    if (!user) return;
    const value: StoredIdentity = {
      id: user.id,
      email: user.email ?? null,
      role: (user.app_metadata?.role as string | undefined) ?? null,
      name: (user.user_metadata?.name as string | undefined) ?? null,
    };
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(value));
  } catch {}
}

function clearIdentity() {
  try {
    localStorage.removeItem(IDENTITY_KEY);
  } catch {}
}

function offlineUser(): User | null {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (!raw) return null;
    const i = JSON.parse(raw) as StoredIdentity;
    if (!i.id) return null;
    return {
      id: i.id,
      aud: "authenticated",
      email: i.email ?? undefined,
      created_at: "",
      app_metadata: { role: i.role },
      user_metadata: { name: i.name },
    } as unknown as User;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hadUser = useRef(false);
  // true = estamos usando a identidade guardada (token vencido e sem sinal).
  const usingStored = useRef(false);
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAdmin: false,
    canEditCommercial: false,
    role: null,
    canEditSchedule: false,
    canEditMaintenance: false,
    canEditFuel: false,
    isDriver: false,
    mustChangePassword: false,
  });

  useEffect(() => {
    function apply(user: User | null) {
      if (user && !usingStored.current) saveIdentity(user);
      const role = (user?.app_metadata?.role as string | undefined) ?? null;
      setState({
        user,
        loading: false,
        isAdmin: role === "admin",
        canEditCommercial: role === "admin" || role === "comercial",
        role,
        canEditSchedule: role === "admin" || role === "logistica",
        canEditMaintenance: role === "admin" || role === "manutencao",
        canEditFuel: role === "admin" || role === "abastecimento",
        isDriver: role === "motorista",
        mustChangePassword: user?.user_metadata?.must_change_password === true,
      });
    }

    // getSession() é local (sem ida ao banco): serve só pra mostrar ou
    // esconder botões; quem barra de verdade é o RLS no banco.
    // Com o token vencido e sem sinal, a biblioteca de login tenta renovar várias vezes
    // (com esperas crescentes) antes de desistir: a tela ficaria em branco por muito
    // tempo. Por isso, se não responder em 2,5 s e houver identidade guardada, o app
    // abre com ela e troca pela sessão de verdade quando (e se) ela chegar.
    const sessionPromise = supabase.auth.getSession();
    let settled = false;
    const quickTimer = setTimeout(() => {
      if (settled) return;
      const stored = offlineUser();
      if (!stored) return; // sem identidade guardada: espera a resposta normal
      usingStored.current = true;
      hadUser.current = true;
      apply(stored);
    }, 2500);
    sessionPromise.then(({ data, error }) => {
      settled = true;
      clearTimeout(quickTimer);
      const real = data.session?.user ?? null;
      if (real) {
        usingStored.current = false;
        hadUser.current = true;
        apply(real);
        return;
      }
      // Sem sessão: pode ser falta de sinal (token vencido que não renovou) ou saída de verdade.
      const retryable = error?.name === "AuthRetryableFetchError" || !navigator.onLine;
      const stored = retryable ? offlineUser() : null;
      if (stored) {
        usingStored.current = true;
        hadUser.current = true;
        apply(stored);
        return;
      }
      usingStored.current = false;
      hadUser.current = false;
      apply(null);
    });

    // Voltou o sinal: troca a identidade guardada pela sessão de verdade.
    function recheck() {
      if (!usingStored.current) return;
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) {
          usingStored.current = false;
          apply(data.session.user);
        }
      });
    }
    window.addEventListener("online", recheck);
    document.addEventListener("visibilitychange", recheck);
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) hadUser.current = true;
      // Saiu sem clicar em "Sair" (token vencido ou revogado): leva ao login
      // com um aviso, em vez de deixar as telas vazias sem explicação.
      if (event === "SIGNED_OUT") clearIdentity();
      if (event === "SIGNED_OUT" && hadUser.current) {
        let manual = false;
        try {
          manual = sessionStorage.getItem(MANUAL_LOGOUT_KEY) === "1";
          sessionStorage.removeItem(MANUAL_LOGOUT_KEY);
        } catch {}
        hadUser.current = false;
        window.location.assign(manual ? "/login" : "/login?sessao=expirada");
        return;
      }
      if (session?.user) usingStored.current = false;
      apply(session?.user ?? null);
    });
    return () => {
      clearTimeout(quickTimer);
      sub.subscription.unsubscribe();
      window.removeEventListener("online", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
