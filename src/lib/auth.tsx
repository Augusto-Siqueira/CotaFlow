"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  role: string | null;
  canEditSchedule: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  isAdmin: false,
  role: null,
  canEditSchedule: false,
});

// O perfil vem de app_metadata.role, que só pode ser alterado pelo painel do
// Supabase (service role) — o usuário não consegue se promover pelo navegador.
// Isto só esconde botões; quem de fato barra a escrita é o RLS no banco.
export const MANUAL_LOGOUT_KEY = "cotaflow:manual-logout";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hadUser = useRef(false);
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAdmin: false,
    role: null,
    canEditSchedule: false,
  });

  useEffect(() => {
    function apply(user: User | null) {
      const role = (user?.app_metadata?.role as string | undefined) ?? null;
      setState({
        user,
        loading: false,
        isAdmin: role === "admin",
        role,
        canEditSchedule: role === "admin" || role === "logistica",
      });
    }

    // getSession() é local (sem ida ao banco): serve só pra mostrar ou
    // esconder botões; quem barra de verdade é o RLS no banco.
    supabase.auth.getSession().then(({ data }) => {
      hadUser.current = Boolean(data.session?.user);
      apply(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) hadUser.current = true;
      // Saiu sem clicar em "Sair" (token vencido ou revogado): leva ao login
      // com um aviso, em vez de deixar as telas vazias sem explicação.
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
      apply(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
