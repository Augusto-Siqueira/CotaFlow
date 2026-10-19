"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";

interface Issue {
  id: string;
  driver_name: string | null;
  kind: string;
  summary: string;
  reason: string;
  created_at: string;
}

const KIND_LABEL: Record<string, string> = {
  abastecimento: "Abastecimento",
  defeito: "Defeito",
  comprovante: "Comprovante de entrega",
  checklist: "Check-list",
};

/**
 * Faixa de aviso: lançamentos que o motorista salvou sem sinal e o servidor
 * recusou depois. O motorista corrige no próprio app; aqui a equipe só fica
 * sabendo (e marca como tratado, se for o caso). Cada tela mostra só os tipos
 * da sua área.
 */
export function SyncIssuesAlert({ kinds }: { kinds: string[] }) {
  const { canEditSchedule, canEditFuel, canEditMaintenance } = useAuth();
  const { toastError } = useFeedback();
  const [issues, setIssues] = useState<Issue[]>([]);
  const canResolve = canEditSchedule || canEditFuel || canEditMaintenance;
  const kindsKey = kinds.join(",");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("driver_sync_issues")
      .select("id, driver_name, kind, summary, reason, created_at")
      .in("kind", kindsKey.split(","))
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    setIssues((data as Issue[] | null) ?? []);
  }, [kindsKey]);

  useEffect(() => {
    queueMicrotask(() => {
      load();
    });
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 60000);
    return () => clearInterval(timer);
  }, [load]);

  async function resolve(id: string) {
    const { data } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("driver_sync_issues")
      .update({ resolved_at: new Date().toISOString(), resolved_by: data.user?.id ?? null, resolution: "tratado" })
      .eq("id", id);
    if (error) {
      toastError(`Não foi possível marcar como tratado (${error.message}).`);
      return;
    }
    await load();
  }

  if (issues.length === 0) return null;

  return (
    <section
      aria-label="Lançamentos recusados"
      className="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 print:hidden"
    >
      <h2 className="text-sm font-medium text-red-800">
        ⚠ Lançamentos de motoristas recusados pelo sistema ({issues.length})
      </h2>
      <p className="text-xs text-red-700">
        O motorista salvou sem sinal e, ao enviar, o servidor não aceitou. Ele já foi orientado a corrigir no app.
      </p>
      <ul className="mt-2 space-y-2">
        {issues.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-red-900">
            <span>
              <span className="font-medium">{i.driver_name ?? "Motorista"}</span> · {KIND_LABEL[i.kind] ?? i.kind} ·{" "}
              {i.summary}
              <span className="block text-xs text-red-700">
                {i.reason} ({new Date(i.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })})
              </span>
            </span>
            {canResolve && (
              <button type="button" onClick={() => resolve(i.id)} className={buttonClasses("secondary", "sm")}>
                Marcar como tratado
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
