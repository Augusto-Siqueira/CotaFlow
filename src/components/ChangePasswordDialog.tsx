"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useFeedback } from "@/components/Feedback";

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { toastSuccess } = useFeedback();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As duas senhas não são iguais.");
      return;
    }

    setSaving(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setError(
        /same|different/i.test(error.message)
          ? "A nova senha precisa ser diferente da atual."
          : `Não foi possível trocar a senha (${error.message}).`
      );
      return;
    }
    toastSuccess("Senha alterada com sucesso.");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4 sm:items-center print:hidden"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white p-6 text-navy-900 shadow-xl"
      >
        <h2 className="text-base font-medium">Trocar senha</h2>
        <div className="mt-5 flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-navy-700">
              Nova senha
            </label>
            <input
              type="password"
              autoComplete="new-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              placeholder="Mínimo de 8 caracteres"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-navy-700">
              Repita a nova senha
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputCls}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar senha"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-navy-300 px-4 py-2 text-sm font-medium text-navy-700 hover:bg-navy-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
