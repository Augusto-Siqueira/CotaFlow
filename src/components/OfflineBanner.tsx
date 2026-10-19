"use client";

import { useOffline } from "@/lib/offline/OfflineProvider";

/** Faixa no topo do app do motorista: sem sinal, ou enviando o que ficou guardado. */
export function OfflineBanner() {
  const { offline, pending, syncing } = useOffline();

  if (offline) {
    return (
      <div role="status" className="bg-amber-200 px-4 py-2 text-center text-xs font-medium text-amber-900">
        Sem internet. O que você lançar fica salvo no celular e é enviado quando o sinal voltar.
        {pending > 0 && ` (${pending} aguardando envio)`}
      </div>
    );
  }
  if (pending > 0) {
    return (
      <div role="status" className="bg-sky-200 px-4 py-2 text-center text-xs font-medium text-sky-900">
        {syncing ? "Enviando" : "Aguardando para enviar"} {pending} {pending === 1 ? "lançamento" : "lançamentos"}...
      </div>
    );
  }
  return null;
}
