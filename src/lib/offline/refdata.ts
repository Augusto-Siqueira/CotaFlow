import { idbGet, idbPut } from "@/lib/offline/idb";
import { isReachable, setReachable } from "@/lib/offline/connection";

// Dados de apoio (placas, cargas...) guardados no celular. Cada tela pede o dado
// pela rede e, se não conseguir (sem sinal ou demora demais), usa o último que o
// celular guardou, dizendo há quanto tempo ele é de quando.

const TIMEOUT_MS = 8000;
// Quando o app já sabe que está sem sinal, não espera tanto antes de usar o que está guardado.
const OFFLINE_TIMEOUT_MS = 2500;

interface KvRow<T> {
  key: string;
  value: T;
  at: number;
}

export interface Cached<T> {
  data: T;
  /** Quando o dado foi buscado na rede pela última vez. */
  at: number;
  /** true = veio do celular (sem rede ou rede lenta). */
  stale: boolean;
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  const limit = isReachable() && (typeof navigator === "undefined" || navigator.onLine) ? TIMEOUT_MS : OFFLINE_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Tempo esgotado.")), limit);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * `key` precisa incluir o usuário (cada motorista guarda os seus dados).
 * `fetcher` deve LANÇAR erro quando a consulta falhar (use `must`).
 * Se não houver rede nem cópia guardada, o erro sobe para a tela tratar.
 */
export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<Cached<T>> {
  try {
    const data = await withTimeout(fetcher());
    setReachable(true);
    const at = Date.now();
    idbPut("kv", { key, value: data, at } satisfies KvRow<T>).catch(() => {});
    return { data, at, stale: false };
  } catch (err) {
    // Erro de rede/tempo = sem sinal. Erro do servidor (permissão etc.) não é falta de sinal.
    if (/failed to fetch|network|load failed|tempo esgotado|fetch failed/i.test(err instanceof Error ? err.message : "")) {
      setReachable(false);
    }
    const row = await idbGet<KvRow<T>>("kv", key).catch(() => undefined);
    if (row) return { data: row.value, at: row.at, stale: true };
    throw err;
  }
}

/** Lê o último dado guardado, sem tentar a rede. */
export async function readCached<T>(key: string): Promise<Cached<T> | null> {
  const row = await idbGet<KvRow<T>>("kv", key).catch(() => undefined);
  return row ? { data: row.value, at: row.at, stale: true } : null;
}

/** Transforma a resposta do Supabase em valor, lançando erro se vier com falha. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? ([] as unknown)) as T;
}

/** "agora há pouco", "há 12 min", "há 3 h", "há 2 dias". */
export function agoLabel(at: number): string {
  const min = Math.round((Date.now() - at) / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
