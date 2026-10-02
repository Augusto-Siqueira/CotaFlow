"use client";

import { useAuth } from "@/lib/auth";

// Pra esconder botões de escrita dentro de Server Components. Só estética:
// quem barra a escrita de verdade é o RLS no banco.
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  return isAdmin ? <>{children}</> : null;
}
