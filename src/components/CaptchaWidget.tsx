"use client";

import { forwardRef } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

// Chave do site é pública (a secreta fica só no painel do Supabase).
const SITE_KEY =
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAFQidpXSEwANDmeD";

export type CaptchaRef = TurnstileInstance;

// Só para ENSAIO/teste local: NEXT_PUBLIC_CAPTCHA_DISABLED=1 esconde o widget
// e não exige o token no site. Em produção fica desligado, e quem barra de
// verdade é o servidor de login (captcha ligado lá), então não enfraquece nada.
export const CAPTCHA_ENABLED = process.env.NEXT_PUBLIC_CAPTCHA_DISABLED !== "1";

/**
 * Verificação anti-robô (Cloudflare Turnstile). O token gerado vai em
 * `options.captchaToken` do `signInWithPassword`. Cada token vale uma vez só:
 * depois de uma tentativa (certa ou errada) chame `ref.current?.reset()`.
 */
export const CaptchaWidget = forwardRef<
  TurnstileInstance,
  { onToken: (token: string | null) => void }
>(function CaptchaWidget({ onToken }, ref) {
  if (!CAPTCHA_ENABLED) return null;
  return (
    <Turnstile
      ref={ref}
      siteKey={SITE_KEY}
      options={{ theme: "auto", language: "pt-br" }}
      onSuccess={(t) => onToken(t)}
      onExpire={() => onToken(null)}
      onError={() => onToken(null)}
    />
  );
});
