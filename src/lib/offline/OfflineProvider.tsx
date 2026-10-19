"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { isReachable, setReachable, subscribeReachable } from "@/lib/offline/connection";
import { isSyncing, listOutbox, subscribeOutbox, syncNow, type OutboxItem } from "@/lib/offline/outbox";

// Liga o modo offline do app do motorista: avisa se está sem sinal, mantém a fila
// de envio em dia (ao abrir, quando o sinal volta, ao voltar para o app e a cada
// 30 s) e deixa as telas do app guardadas no celular para abrir sem internet.

interface OfflineState {
  /** Sem internet de verdade (aparelho desconectado ou chamadas falhando). */
  offline: boolean;
  items: OutboxItem[];
  pending: number;
  rejected: number;
  syncing: boolean;
  /** Tenta enviar a fila agora, ignorando a espera entre tentativas. */
  sendNow: () => void;
}

const Ctx = createContext<OfflineState>({
  offline: false,
  items: [],
  pending: 0,
  rejected: 0,
  syncing: false,
  sendNow: () => {},
});

export function useOffline() {
  return useContext(Ctx);
}

const WARM_ROUTES = [
  "/motorista",
  "/motorista/checklist",
  "/motorista/defeito",
  "/motorista/entrega",
  "/motorista/abastecimento",
];
const WARM_KEY = "cotaflow:warm-at";
const WARM_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Baixa as telas do app e os arquivos delas para o celular (o service worker
 * guarda o que passa por aqui). Sem isso, só abriria offline a tela que o
 * motorista já tivesse visitado antes de ficar sem sinal.
 */
async function warmUp() {
  try {
    const last = Number(localStorage.getItem(WARM_KEY) ?? 0);
    if (Date.now() - last < WARM_EVERY_MS) return;
    if (!navigator.serviceWorker?.controller) return; // o guardião ainda não assumiu: tenta na próxima
    const assets = new Set<string>();
    for (const route of WARM_ROUTES) {
      const res = await fetch(route, { credentials: "include" });
      if (!res.ok || res.redirected) continue;
      const html = await res.text();
      for (const m of html.matchAll(/\/_next\/static\/[^"'\s\\)]+/g)) assets.add(m[0]);
    }
    for (const url of assets) {
      const res = await fetch(url);
      if (url.endsWith(".css")) {
        const css = await res.text();
        for (const m of css.matchAll(/url\((\/_next\/static\/[^)"']+)\)/g)) assets.add(m[1]);
      }
    }
    localStorage.setItem(WARM_KEY, String(Date.now()));
  } catch {
    // sem sinal agora: tenta de novo na próxima abertura
  }
}

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [deviceOnline, setDeviceOnline] = useState(true);
  const [reachable, setReachableState] = useState(true);
  const userRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const id = userRef.current;
    if (!id) {
      setItems([]);
      return;
    }
    setItems(await listOutbox(id).catch(() => []));
    setSyncing(isSyncing());
  }, []);

  const run = useCallback(
    async (force: boolean) => {
      const id = userRef.current;
      if (!id) return;
      await syncNow(id, force).catch(() => {});
      await refresh();
    },
    [refresh]
  );

  useEffect(() => {
    userRef.current = userId;
    queueMicrotask(() => {
      refresh();
      run(false);
    });
  }, [userId, refresh, run]);

  useEffect(() => {
    queueMicrotask(() => {
      setDeviceOnline(navigator.onLine);
      setReachableState(isReachable());
    });
    const onOnline = () => {
      setDeviceOnline(true);
      setReachable(true);
      run(true);
    };
    const onOffline = () => setDeviceOnline(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") run(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const offOutbox = subscribeOutbox(() => {
      refresh();
    });
    const offReach = subscribeReachable(() => setReachableState(isReachable()));
    const timer = setInterval(() => run(false), 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      offOutbox();
      offReach();
      clearInterval(timer);
    };
  }, [refresh, run]);

  // Guarda as telas do app no celular, uma vez que o motorista está logado e com sinal.
  useEffect(() => {
    if (!userId || !deviceOnline || !reachable) return;
    const t = setTimeout(() => {
      warmUp();
    }, 4000);
    return () => clearTimeout(t);
  }, [userId, deviceOnline, reachable]);

  const value = useMemo<OfflineState>(
    () => ({
      offline: !deviceOnline || !reachable,
      items,
      pending: items.filter((i) => i.status === "pending").length,
      rejected: items.filter((i) => i.status === "rejected").length,
      syncing,
      sendNow: () => {
        run(true);
      },
    }),
    [deviceOnline, reachable, items, syncing, run]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
