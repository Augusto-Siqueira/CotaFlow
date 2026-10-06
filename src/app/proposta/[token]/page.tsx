"use client";

import { use, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { prepareProposalHtml } from "@/lib/proposalHtml";

interface Proposal {
  title: string;
  client_name: string | null;
  html: string;
}

// Página PÚBLICA (sem login): o cliente abre o link e só lê. O HTML da
// proposta vem de fora, então roda dentro de um iframe em sandbox, sem
// "allow-same-origin": o conteúdo não enxerga cookies nem nada do CotaFlow.
export default function PublicProposalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const [state, setState] = useState<
    { kind: "loading" } | { kind: "ok"; proposal: Proposal } | { kind: "unavailable" }
  >({ kind: "loading" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function load() {
      const { data, error } = await supabase.rpc("open_proposal", {
        p_token: token,
      });
      const row = Array.isArray(data) ? data[0] : null;
      if (error || !row) {
        setState({ kind: "unavailable" });
        return;
      }
      setState({ kind: "ok", proposal: row as Proposal });
    }
    load();
  }, [token]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center text-sm text-navy-500">
        Carregando proposta...
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div className="flex min-h-screen flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-semibold text-navy-900">
          Proposta indisponível
        </h1>
        <p className="mt-2 max-w-sm text-sm text-navy-500">
          Este link não existe, foi desativado ou já expirou. Fale com o
          responsável comercial para receber um novo link.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="flex items-center justify-between bg-navy-900 px-5 py-3 text-white">
        <div className="flex items-center gap-2 font-bold tracking-tight">
          <span className="inline-block h-2 w-2 rounded-full bg-brand-500" />
          CotaFlow
        </div>
        <span className="truncate pl-4 text-sm text-navy-200">
          {state.proposal.title}
        </span>
      </header>
      <iframe
        title={state.proposal.title}
        srcDoc={prepareProposalHtml(state.proposal.html)}
        sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
        className="w-full flex-1 border-0 bg-white"
        style={{ minHeight: "calc(100vh - 48px)" }}
      />
    </div>
  );
}
