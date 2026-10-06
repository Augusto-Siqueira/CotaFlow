"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useFeedback } from "@/components/Feedback";
import { Modal } from "@/components/Modal";

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { toastSuccess } = useFeedback();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
    <Modal onClose={onClose} labelledBy="password-title" className="max-w-sm" zIndex="z-[65]">
      <form onSubmit={handleSubmit}>
        <h2 id="password-title" className="text-base font-medium">
          Trocar senha
        </h2>
        <div className="mt-5 flex flex-col gap-4">
          <div>
            <label
              htmlFor="new-password"
              className="mb-1 block text-sm font-medium text-navy-700"
            >
              Nova senha
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby={error ? "password-error" : undefined}
              aria-invalid={error ? true : undefined}
              className={inputCls}
              placeholder="Mínimo de 8 caracteres"
            />
          </div>
          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1 block text-sm font-medium text-navy-700"
            >
              Repita a nova senha
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-describedby={error ? "password-error" : undefined}
              aria-invalid={error ? true : undefined}
              className={inputCls}
            />
          </div>

          {error && (
            <div
              id="password-error"
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
              className="flex-1 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
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
    </Modal>
  );
}
