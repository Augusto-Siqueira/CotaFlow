"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { QUOTE_STATUSES, quoteStatusBadgeClass } from "@/lib/quoteStatus";

/**
 * Único lugar do app onde o status da cotação pode ser alterado — de
 * propósito restrito à tela de Detalhes (não à lista), pra trocar de status
 * ser uma ação deliberada, olhando a cotação específica, e não algo que dá
 * pra fazer sem querer rolando uma tabela.
 */
export function QuoteStatusSelect({
  quoteId,
  initialStatus,
}: {
  quoteId: string;
  initialStatus: string;
}) {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(nextStatus: string) {
    const previous = status;
    setStatus(nextStatus);
    setSaving(true);
    setError(null);

    const { error } = await supabase
      .from("quotes")
      .update({ status: nextStatus })
      .eq("id", quoteId);

    setSaving(false);
    if (error) {
      setStatus(previous);
      setError(`Não foi possível salvar o status (${error.message}).`);
    }
  }

  return (
    <div>
      <select
        value={status}
        disabled={saving || !isAdmin}
        onChange={(e) => handleChange(e.target.value)}
        className={`enabled:cursor-pointer rounded-full border-0 px-3 py-1 text-xs font-medium outline-none focus:ring-2 focus:ring-brand-500 disabled:cursor-wait disabled:opacity-70 ${quoteStatusBadgeClass(
          status
        )}`}
      >
        {QUOTE_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
