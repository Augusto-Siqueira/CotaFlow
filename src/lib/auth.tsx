"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

interface AuthState {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  isAdmin: false,
});

// O perfil vem de app_metadata.role, que só pode ser alterado pelo painel do
// Supabase (service role) — o usuário não consegue se promover pelo navegador.
// Isto só esconde botões; quem de fato barra a escrita é o RLS no banco.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    isAdmin: false,
  });

  useEffect(() => {
    function apply(user: User | null) {
      setState({
        user,
        loading: false,
        isAdmin: user?.app_metadata?.role === "admin",
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
