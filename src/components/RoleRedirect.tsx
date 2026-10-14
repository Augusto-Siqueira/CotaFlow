"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

/**
 * Motorista só usa a área /motorista (o banco já barra os dados; isto só
 * evita telas vazias). No primeiro acesso, ele precisa trocar a senha inicial.
 */
export function RoleRedirect() {
  const { isDriver, mustChangePassword, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (
      isDriver &&
      !pathname.startsWith("/motorista") &&
      pathname !== "/login"
    ) {
      router.replace("/motorista");
    }
  }, [isDriver, pathname, router]);

  if (user && mustChangePassword) return <ForcePasswordChange />;
  return null;
}

function ForcePasswordChange() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("A nova senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As duas senhas não são iguais.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({
      password,
      data: { must_change_password: false },
    });
    setSaving(false);
    if (err) {
      setError(
        /same|different/i.test(err.message)
          ? "A nova senha precisa ser diferente da senha inicial."
          : `Não foi possível trocar a senha (${err.message}).`
      );
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="force-pw-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl bg-white p-6 text-navy-900 shadow-xl"
      >
        <h2 id="force-pw-title" className="text-base font-medium">
          Crie a sua senha
        </h2>
        <p className="mt-1 text-sm text-navy-500">
          Este é o seu primeiro acesso. Troque a senha inicial por uma só sua.
        </p>
        <label className="mt-4 block text-sm font-medium text-navy-700" htmlFor="fp-new">
          Nova senha
        </label>
        <input
          id="fp-new"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          placeholder="Mínimo de 6 caracteres"
        />
        <label className="mt-3 block text-sm font-medium text-navy-700" htmlFor="fp-confirm">
          Repita a nova senha
        </label>
        <input
          id="fp-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="mt-1 w-full rounded-lg border border-navy-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
        />
        {error && (
          <div role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={saving}
          className="mt-5 w-full rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar senha e entrar"}
        </button>
      </form>
    </div>
  );
}
