// Rascunho de formulário guardado no celular (IndexedDB, gaveta "kv").
//
// Em celular com pouca memória o Android fecha o navegador enquanto a câmera
// está aberta; ao voltar, a página recarrega e o que o motorista já tinha
// digitado (e as fotos já tiradas) se perderia. O rascunho é gravado a cada
// alteração e recuperado quando a página abre de novo.

import { idbAll, idbDelete, idbGet, idbPut } from "./idb";
import type { OutboxPhoto } from "./outbox";

export interface Draft<F> {
  key: string;
  at: number;
  fields: F;
  photos: OutboxPhoto[];
}

const PREFIX = "draft:";
// Rascunho esquecido some sozinho depois de alguns dias.
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export function draftKey(...parts: string[]): string {
  return PREFIX + parts.join("|");
}

export async function saveDraft<F>(key: string, fields: F, photos: OutboxPhoto[]): Promise<void> {
  await idbPut("kv", { key, at: Date.now(), fields, photos } satisfies Draft<F>);
}

export async function loadDraft<F>(key: string): Promise<Draft<F> | null> {
  const d = await idbGet<Draft<F>>("kv", key).catch(() => undefined);
  if (!d) return null;
  if (Date.now() - d.at > MAX_AGE_MS) {
    await clearDraft(key);
    return null;
  }
  return d;
}

/** Rascunhos cuja chave começa com `draftKey(...parts)`. */
export async function listDrafts<F>(...parts: string[]): Promise<Draft<F>[]> {
  const start = draftKey(...parts);
  const all: Array<Partial<Draft<F>> & { key: string }> = await idbAll<Partial<Draft<F>> & { key: string }>("kv").catch(
    () => []
  );
  const now = Date.now();
  return all.filter((d) => d.key.startsWith(start) && typeof d.at === "number" && now - d.at <= MAX_AGE_MS) as Draft<F>[];
}

export async function clearDraft(key: string): Promise<void> {
  await idbDelete("kv", key).catch(() => undefined);
}
