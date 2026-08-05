"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function DeleteBatchButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (
      !confirm(
        "Excluir este lote e todas as suas rotas? Essa ação não pode ser desfeita."
      )
    )
      return;

    setDeleting(true);
    const { error } = await supabase
      .from("quote_batches")
      .delete()
      .eq("id", batchId);

    if (error) {
      alert(`Não foi possível excluir o lote: ${error.message}`);
      setDeleting(false);
      return;
    }

    router.push("/quotes/batches");
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center justify-center rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
    >
      {deleting ? "Excluindo..." : "Excluir lote"}
    </button>
  );
}
