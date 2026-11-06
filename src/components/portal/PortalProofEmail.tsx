"use client";

import { useState } from "react";
import { buttonClasses } from "@/components/Button";
import { useFeedback } from "@/components/Feedback";

// Envio do comprovante por e-mail pelo portal do cliente. O servidor decide o
// destinatário (e-mail de comprovantes do cadastro da empresa) e o texto; aqui
// só mostramos para quem vai e pedimos confirmação.

export function PortalProofEmail({ proofId, size = "md", onSent }: { proofId: string; size?: "sm" | "md"; onSent?: () => void }) {
  const { toastError, toastSuccess, confirm: askConfirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    try {
      const info = await fetch(`/api/comprovantes/${proofId}/email`, { cache: "no-store" }).then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? `Erro ${r.status}`);
        return b as { to: string[]; cc: string[]; lastSent: { sent_at: string; to_addresses: string[] } | null; configured: boolean };
      });
      if (!info.configured) throw new Error("O envio de e-mail não está disponível no momento.");
      if (!info.to.length) throw new Error("Esta empresa não tem e-mail de comprovantes cadastrado. Fale com a Transbochnia.");
      const last = info.lastSent
        ? ` Já foi enviado em ${new Date(info.lastSent.sent_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`
        : "";
      const ok = await askConfirm(
        `Enviar o comprovante, com as fotos anexadas, para ${info.to.join(", ")}${info.cc.length ? ` (cópia: ${info.cc.join(", ")})` : ""}?${last}`,
        { confirmLabel: "Enviar", title: "Enviar por e-mail" }
      );
      if (!ok) return;
      const r = await fetch(`/api/comprovantes/${proofId}/email`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(res.error ?? `Erro ${r.status}`);
      setSentAt(res.sent_at);
      toastSuccess(`E-mail enviado para ${(res.to as string[]).join(", ")}.`);
      onSent?.();
    } catch (e) {
      toastError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={send} disabled={busy} className={buttonClasses("soft", size)} title="Envia para o e-mail de comprovantes cadastrado, com as fotos anexadas">
      {busy ? "Enviando..." : sentAt ? "Enviado ✓" : "Enviar por e-mail"}
    </button>
  );
}
