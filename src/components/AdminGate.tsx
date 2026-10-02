"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

// Barra o acesso direto (pela URL) a telas de criação/edição. O banco é quem
// garante a restrição; aqui é só pra não deixar o usuário preencher um
// formulário que ele não vai conseguir salvar.
export function AdminGate({ children }: { children: React.ReactNode }) {
  const { loading, isAdmin } = useAuth();

  if (loading) return null;
  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-md px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-navy-900">Acesso restrito</h1>
        <p className="mt-2 text-sm text-navy-500">
          Seu perfil é somente leitura e não pode criar ou alterar cotações.
        </p>
        <Link
          href="/quotes"
          className="mt-4 inline-block text-sm font-medium text-brand-700 underline hover:text-brand-800"
        >
          Voltar para as cotações
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
