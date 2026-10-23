"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";
import { parseTonsInput, tonsLabel } from "@/lib/perTon";

/**
 * Liga/desliga a cotação por tonelada e guarda a lotação mínima na cotação.
 * Com ela guardada, a tela e o PDF mostram os valores por tonelada.
 */
export function QuotePerTonControl({ quoteId, initialTons }: { quoteId: string; initialTons: number | null }) {
  const router = useRouter();
  const { canEditCommercial } = useAuth();
  const { toastError, toastSuccess } = useFeedback();
  const [on, setOn] = useState(initialTons !== null);
  const [text, setText] = useState(initialTons !== null ? String(initialTons).replace(".", ",") : "");
  const [saving, setSaving] = useState(false);

  async function save(tons: number | null) {
    setSaving(true);
    const { error } = await supabase.from("quotes").update({ min_load_tons: tons }).eq("id", quoteId);
    setSaving(false);
    if (error) {
      toastError(`Não foi possível salvar (${error.message}).`);
      return;
    }
    toastSuccess(tons ? `Cotação por tonelada, lotação mínima de ${tonsLabel(tons)}.` : "Cotação voltou a valores por carga.");
    router.refresh();
  }

  if (!canEditCommercial) return null;

  const tons = parseTonsInput(text);
  const changed = on ? tons !== initialTons : initialTons !== null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-navy-200 px-3 py-2 text-sm">
      <label className="flex cursor-pointer items-center gap-2 font-medium text-navy-800">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            setOn(e.target.checked);
            if (!e.target.checked && initialTons !== null) save(null);
          }}
        />
        Valores por tonelada
      </label>
      {on && (
        <>
          <label className="flex items-center gap-2 text-navy-700">
            Lotação mínima
            <input
              inputMode="decimal"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="33"
              aria-label="Lotação mínima em toneladas"
              className="w-20 rounded-lg border border-navy-300 bg-white px-2 py-1 text-sm text-navy-900 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
            t
          </label>
          <button
            type="button"
            disabled={saving || tons === null || !changed}
            onClick={() => save(tons)}
            className={`${buttonClasses("primary", "sm")} disabled:cursor-not-allowed`}
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
          {text.trim() && tons === null && <span className="text-xs text-red-600">Informe as toneladas (ex.: 33).</span>}
        </>
      )}
    </div>
  );
}
