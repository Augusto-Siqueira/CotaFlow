"use client";

import { useEffect } from "react";

// Registra o service worker mínimo (public/sw.js) para o app poder ser instalado
// no celular. Falhar aqui não atrapalha nada: o site funciona igual sem ele.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // Em desenvolvimento (npm run local) o cache offline servia o código antigo
      // depois de cada alteração. Remove o que tiver ficado registrado. O teste
      // offline roda com o build de produção, então não é afetado.
      navigator.serviceWorker
        .getRegistrations()
        .then((list) => list.forEach((r) => r.unregister()))
        .catch(() => {});
      if ("caches" in window) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
