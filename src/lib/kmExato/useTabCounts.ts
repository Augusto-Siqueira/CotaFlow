"use client";

import { useMemo } from "react";
import type { KmEngine } from "./engine";

/** Contadores das abas: viagens em aberto e comprovantes pendentes/atrasados. */
export function useTabCounts(E: KmEngine | null) {
  return useMemo(() => {
    if (!E) return undefined;
    const ab = E.trips().filter((t) => t.status === "aberta").length;
    const C = E.comps();
    const late = C.filter((c) => c.st === "atrasado").length;
    const pend = C.filter((c) => c.st === "pendente").length;
    return { "/km-exato/viagens": { n: ab }, "/km-exato/entregas": { n: late + pend, hot: late > 0 } };
  }, [E]);
}
