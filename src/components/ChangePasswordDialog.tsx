"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { useFeedback } from "@/components/Feedback";
import { Modal } from "@/components/Modal";
import { buttonClasses } from "@/components/Button";

const inputCls =
  "w-full rounded-lg border border-navy-300 px-3 py-2 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * Troca de senha com duas proteções:
 *  1. exige a SENHA ATUAL (conferida no servidor antes de aceitar a nova),
 *     então ninguém troca a senha usando um computador logado e destrancado;
 *  2. depois da troca, ENCERRA as outras sessões do usuário, derrubando
 *     qualquer sessão esquecida ou roubada.
 */
export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { toastSuccess } = useFeedback();
  const email = user?.email ?? "";

  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) {
      setError("Digite a sua senha atual.");
      return;
    }
    if (password.length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As duas senhas novas não são iguais.");
      return;
    }
    if (password === current) {
      setError("A nova senha precisa ser diferente da atual.");
      return;
    }

    setSaving(true);
    setError(null);

    // 1) confere a senha atual no servidor
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: current,
    });
    if (authError) {
      setSaving(false);
      setError(
        /invalid|credentials/i.test(authError.message)
          ? "Senha atual incorreta."
          : /rate|too many|seconds/i.test(authError.message)
            ? "Muitas tentativas. Aguarde alguns minutos e tente de novo."
            : `Não foi possível conferir a senha atual (${authError.message}).`
      );
      return;
    }

    // 2) grava a nova senha
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setSaving(false);
      setError(
        /same|different/i.test(updateError.message)
          ? "A nova senha precisa ser diferente da atual."
          : `Não foi possível trocar a senha (${updateError.message}).`
      );
      return;
    }

    // 3) derruba as outras sessões (a atual continua)
    await supabase.auth.signOut({ scope: "others" });

    setSaving(false);
    toastSuccess("Senha alterada. As outras sessões abertas foram encerradas.");
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
              htmlFor="current-password"
              className="mb-1 block text-sm font-medium text-navy-700"
            >
              Senha atual
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              aria-describedby={error ? "password-error" : undefined}
              aria-invalid={error ? true : undefined}
              className={inputCls}
            />
          </div>
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

          <p className="text-xs text-navy-500">
            Ao trocar, você continua logado aqui e as outras sessões abertas
            (outros computadores ou celulares) são encerradas.
          </p>

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
              {saving ? "Salvando..." : "Trocar senha"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={buttonClasses("secondary", "md")}
            >
              Cancelar
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
