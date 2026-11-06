"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { PortalProofs } from "@/components/portal/PortalProofs";

// Portal do cliente. Quem tem o Controle de km (Btech) vai direto para ele,
// onde os comprovantes ficam numa aba; os demais clientes veem os
// comprovantes aqui.
export default function PortalPage() {
  const { isPortalClient, loading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"checking" | "proofs">("checking");

  useEffect(() => {
    if (loading) return;
    if (!isPortalClient) {
      queueMicrotask(() => setMode("proofs"));
      return;
    }
    let cancelled = false;
    fetch("/api/portal/km-exato?probe=1", { cache: "no-store" })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) router.replace("/portal/km-exato");
        else setMode("proofs");
      })
      .catch(() => !cancelled && setMode("proofs"));
    return () => {
      cancelled = true;
    };
  }, [loading, isPortalClient, router]);

  if (mode === "checking") return <p className="mx-auto w-full max-w-screen-2xl px-6 py-10 text-sm text-navy-500">Carregando...</p>;
  return <PortalProofs />;
}
