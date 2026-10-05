"use client";

import { createContext, useContext, useEffect, useState } from "react";
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
export function AuthProvider({ children }: { children: React.ReactNode }) {
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

    supabase.auth.getUser().then(({ data }) => apply(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      apply(session?.user ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
