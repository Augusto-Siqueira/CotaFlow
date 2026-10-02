"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function DeleteQuoteButton({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm("Excluir esta cotação? Essa ação não pode ser desfeita.")) {
      return;
    }
    setDeleting(true);
    const { error } = await supabase.from("quotes").delete().eq("id", quoteId);
    if (error) {
      alert(`Não foi possível excluir a cotação (${error.message}).`);
      setDeleting(false);
      return;
    }
    router.push("/quotes");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleting}
      className="inline-flex items-center justify-center rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {deleting ? "Excluindo..." : "Excluir cotação"}
    </button>
  );
}
