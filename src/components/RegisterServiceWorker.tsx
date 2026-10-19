"use client";

import { useEffect } from "react";

// Registra o service worker mínimo (public/sw.js) para o app poder ser instalado
// no celular. Falhar aqui não atrapalha nada: o site funciona igual sem ele.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
