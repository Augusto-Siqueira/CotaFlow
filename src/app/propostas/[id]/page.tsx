"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AdminGate } from "@/components/AdminGate";

// Pré-visualização interna: lê direto da tabela (só admin) e NÃO conta como
// visualização do cliente.
function Preview({ id }: { id: string }) {
  const [proposal, setProposal] = useState<
    { title: string; html: string } | null | undefined
  >(undefined);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("proposals")
        .select("title, html")
        .eq("id", id)
        .maybeSingle();
      setProposal(data ?? null);
    }
    load();
  }, [id]);

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-navy-200 bg-white px-6 py-3">
        <Link
          href="/propostas"
          className="text-sm text-navy-500 hover:text-navy-700"
        >
          ← Propostas
        </Link>
        <span className="truncate pl-4 text-sm font-medium text-navy-800">
          {proposal?.title ?? ""}
        </span>
      </div>
      {proposal === undefined ? (
        <div className="p-10 text-center text-sm text-navy-500">Carregando...</div>
      ) : proposal === null ? (
        <div className="p-10 text-center text-sm text-red-600">
          Proposta não encontrada.
        </div>
      ) : (
        <iframe
          title={proposal.title}
          srcDoc={proposal.html}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          className="w-full flex-1 border-0 bg-white"
          style={{ minHeight: "calc(100vh - 100px)" }}
        />
      )}
    </div>
  );
}

export default function ProposalPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AdminGate>
      <Preview id={id} />
    </AdminGate>
  );
}
