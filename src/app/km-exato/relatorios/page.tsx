"use client";

import { useState } from "react";
import { useKm } from "@/lib/kmExato/useKm";
import { useTabCounts } from "@/lib/kmExato/useTabCounts";
import { KmPage } from "@/components/km/KmUi";
import { KmReport } from "@/components/km/KmReport";
import { TripDialogs, type TripDialog } from "@/components/km/KmTripModals";

// KM Exato · Relatórios: recorte por período, veículos e situação. Indicadores,
// tabelas e arquivos seguem os mesmos filtros. Excel e PDF sempre saem sem os
// dados internos (como a Btech vê).

export default function KmRelatoriosPage() {
  const km$ = useKm();
  const E = km$.engine;
  const counts = useTabCounts(E);
  const [dialog, setDialog] = useState<TripDialog>(null);
  const common = E ? { engine: E, userName: km$.userName, isAdmin: km$.isAdmin, onChanged: km$.reload } : null;
  return (
    <KmPage
      title="Relatórios"
      subtitle="Escolha o recorte. Indicadores, tabelas e arquivos seguem os mesmos filtros."
      active="/km-exato/relatorios"
      isAdmin={km$.isAdmin}
      canView={km$.canView}
      authLoading={km$.authLoading}
      error={km$.error}
      loading={!E}
      counts={counts}
    >
      {E && <KmReport E={E} isAdmin={km$.isAdmin} userName={km$.userName} reload={km$.reload} open={(id) => setDialog({ kind: "detail", id })} />}
      {common && <TripDialogs {...common} dialog={dialog} setDialog={setDialog} />}
    </KmPage>
  );
}
