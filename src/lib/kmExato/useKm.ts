"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { KmEngine, type KmState } from "./engine";
import { loadKmState, type KmTripRow } from "./load";
import { attachProofs, loadKmProofs } from "./proofs";

/**
 * Dados do KM Exato para as telas: carrega as tabelas km_*, monta o motor e
 * expõe reload() para depois de cada gravação. Só carrega para quem pode ver
 * (admin e logística).
 */
export function useKm() {
  const { canEditSchedule, isAdmin, loading: authLoading, user } = useAuth();
  const [state, setState] = useState<KmState | null>(null);
  const [tripRows, setTripRows] = useState<KmTripRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (authLoading || !canEditSchedule) return;
    let cancelled = false;
    loadKmState(supabase)
      .then(async (r) => {
        // Comprovantes do app do motorista (Btech SJP/Indaiatuba) ligados por NF/CT-e.
        // Se falhar, a tela abre mesmo assim, sem eles.
        try {
          attachProofs(r.state, await loadKmProofs(supabase));
        } catch (e) {
          console.error(e);
        }
        if (cancelled) return;
        setState(r.state);
        setTripRows(r.tripRows);
        setError(null);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, canEditSchedule, version]);

  const engine = useMemo(() => (state ? new KmEngine(state) : null), [state]);
  const userName = ((user?.user_metadata?.name as string | undefined) ?? user?.email ?? null) || null;

  return { engine, state, tripRows, error, reload, canView: canEditSchedule, isAdmin, authLoading, userName };
}
