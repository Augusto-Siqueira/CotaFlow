import { supabase } from "@/lib/supabase";
import { idbAll, idbDelete, idbGet, idbPut } from "@/lib/offline/idb";
import { setReachable } from "@/lib/offline/connection";

// Fila de envio (outbox) do app do motorista. TODO lançamento passa por aqui,
// com ou sem sinal: a tela salva no celular e a fila envia assim que der.
//
// Sem duplicar: o celular cria o código da linha e o nome de cada foto na hora
// do preenchimento. Reenviar o mesmo item vira "já existe, ok".
// Retomável: as fotos que já subiram saem de `photos` e ficam só em
// `payload.photos`, então uma queda no meio continua de onde parou.

const BUCKET = "driver-photos";

/** fuel = abastecimento, defect = relato de defeito, proof = comprovante de entrega, checklist = check-list diário. */
export type OutboxKind = "fuel" | "defect" | "proof" | "checklist";

export interface OutboxPhoto {
  path: string;
  blob: Blob;
}

export interface OutboxItem {
  id: string;
  userId: string;
  kind: OutboxKind;
  /** Quando o motorista preencheu (hora real). */
  createdAt: number;
  /** Resumo para mostrar na fila e no aviso à equipe. */
  summary: string;
  driverName: string | null;
  /**
   * O que gravar no servidor, já com os códigos (`id`) e os caminhos das fotos.
   * fuel/defect/proof: uma linha. checklist: { checklist: linha, reports: linhas de defeito }.
   */
  payload: Record<string, unknown> & { photos?: string[] };
  /** Fotos do lançamento. Ficam guardadas até o envio dar certo (se o servidor recusar, o motorista reaproveita). */
  photos: OutboxPhoto[];
  /** Caminhos das fotos que já subiram (uma queda no meio continua de onde parou). */
  uploaded?: string[];
  status: "pending" | "rejected";
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  /** Motivo da recusa (só quando status = rejected). */
  reason?: string;
  /** A equipe já foi avisada da recusa. */
  reported?: boolean;
}

type Outcome = { type: "sent" } | { type: "retry"; error: string } | { type: "rejected"; reason: string };

// ---------- eventos (esta aba e as outras) ----------

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (channel || typeof BroadcastChannel === "undefined") return channel;
  channel = new BroadcastChannel("cotaflow-outbox");
  channel.onmessage = () => listeners.forEach((fn) => fn());
  return channel;
}

function emit() {
  listeners.forEach((fn) => fn());
  getChannel()?.postMessage("changed");
}

export function subscribeOutbox(fn: () => void): () => void {
  getChannel();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ---------- fila ----------

export function newPhotoPath(userId: string): string {
  const month = new Date().toISOString().slice(0, 7);
  return `${userId}/${month}/${crypto.randomUUID()}.jpg`;
}

export async function listOutbox(userId: string): Promise<OutboxItem[]> {
  const all = await idbAll<OutboxItem>("outbox");
  return all.filter((i) => i.userId === userId).sort((a, b) => a.createdAt - b.createdAt);
}

export async function getOutboxItem(id: string): Promise<OutboxItem | undefined> {
  return idbGet<OutboxItem>("outbox", id);
}

export async function enqueue(
  item: Omit<OutboxItem, "status" | "attempts" | "nextAttemptAt" | "reported">
): Promise<void> {
  await idbPut("outbox", { ...item, status: "pending", attempts: 0, nextAttemptAt: 0 } satisfies OutboxItem);
  // Pede ao navegador para não apagar estes dados se faltar espaço.
  navigator.storage?.persist?.().catch(() => {});
  emit();
}

/** Fecha o aviso da equipe (melhor esforço: sem sinal, a equipe fecha manualmente). */
async function resolveIssue(id: string, resolution: "enviado" | "descartado"): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase
      .from("driver_sync_issues")
      .update({ resolved_at: new Date().toISOString(), resolved_by: data.user?.id ?? null, resolution })
      .eq("id", id)
      .is("resolved_at", null);
  } catch {}
}

export async function discardItem(id: string): Promise<void> {
  const item = await getOutboxItem(id);
  await idbDelete("outbox", id);
  if (item?.reported) await resolveIssue(id, "descartado");
  emit();
}

/**
 * "Corrigir e lançar de novo": troca os dados do item recusado (mesmo código) e
 * volta para a fila. As fotos que não mudaram não sobem de novo.
 */
export async function reviseItem(
  id: string,
  next: Pick<OutboxItem, "summary" | "payload" | "photos">
): Promise<void> {
  const item = await getOutboxItem(id);
  if (!item) return;
  const keep = new Set(next.photos.map((p) => p.path));
  await idbPut("outbox", {
    ...item,
    ...next,
    uploaded: (item.uploaded ?? []).filter((p) => keep.has(p)),
    status: "pending",
    reason: undefined,
    attempts: 0,
    nextAttemptAt: 0,
  } satisfies OutboxItem);
  emit();
}

/** Recusado -> tenta de novo agora (por exemplo, depois de a equipe cadastrar a placa). */
export async function retryItem(id: string): Promise<void> {
  const item = await getOutboxItem(id);
  if (!item) return;
  await idbPut("outbox", { ...item, status: "pending", reason: undefined, attempts: 0, nextAttemptAt: 0 });
  emit();
}

/**
 * Check-list recusado por placa errada: troca as placas (no check-list e nos
 * defeitos que ele gera) e volta para a fila.
 */
export async function reviseChecklistPlates(id: string, plate: string, trailer: string | null): Promise<void> {
  const item = await getOutboxItem(id);
  if (!item || item.kind !== "checklist") return;
  const p = item.payload as { checklist: Record<string, unknown>; reports: Record<string, unknown>[] };
  const payload = {
    checklist: { ...p.checklist, plate, trailer_plate: trailer },
    reports: p.reports.map((r) => ({ ...r, plate })),
  };
  await idbPut("outbox", { ...item, payload, status: "pending", reason: undefined, attempts: 0, nextAttemptAt: 0 });
  emit();
}

// ---------- classificação dos erros ----------

interface ErrLike {
  message?: string;
  code?: string;
  statusCode?: string | number;
  status?: string | number;
}

function isNetwork(e: ErrLike): boolean {
  const m = (e.message ?? "").toLowerCase();
  return (
    /failed to fetch|network|load failed|timeout|tempo esgotado|fetch failed|offline|aborted/.test(m) ||
    (!e.code && !e.statusCode && !e.status && m === "")
  );
}

function isAuthProblem(e: ErrLike): boolean {
  return /jwt|token|expired|not authenticated|invalid claim/i.test(e.message ?? "") || e.code === "PGRST301";
}

function friendlyInsertError(table: string, e: ErrLike): string {
  const m = e.message ?? "erro";
  if (table === "delivery_proofs") {
    if (e.code === "23505") return "Este destino já tem comprovante enviado (por você ou por outra pessoa).";
    if (e.code === "23503") return "A carga deste comprovante não está mais disponível para você.";
    if (e.code === "42501") return "Esta carga não é sua ou já foi encerrada.";
  } else {
    if (e.code === "23503") return "A placa não está cadastrada na frota. Confira a placa do caminhão e da carreta.";
    if (e.code === "23505") return "Este lançamento já foi enviado por outra pessoa.";
    if (e.code === "42501") return "Sem permissão para este lançamento.";
  }
  if (e.code === "23514") return "O servidor não aceitou os dados (confira foto, posto e valor por litro).";
  return `${table}: ${m}`;
}

// ---------- tratamento de cada tipo ----------

async function uploadPhotos(item: OutboxItem): Promise<Outcome | null> {
  for (const photo of item.photos) {
    if (item.uploaded?.includes(photo.path)) continue;
    const { error } = await supabase.storage.from(BUCKET).upload(photo.path, photo.blob, { contentType: "image/jpeg" });
    if (error) {
      const e = error as ErrLike;
      const already = String(e.statusCode ?? e.status) === "409" || /already exists|duplicate/i.test(e.message ?? "");
      if (!already) {
        if (isNetwork(e) || isAuthProblem(e)) return { type: "retry", error: e.message ?? "sem conexão" };
        return { type: "rejected", reason: `Não foi possível enviar a foto (${e.message ?? "erro"}).` };
      }
    }
    // Esta foto já está no servidor: guarda o progresso (a imagem continua no celular até o fim).
    item = { ...item, uploaded: [...(item.uploaded ?? []), photo.path] };
    await idbPut("outbox", item);
  }
  return null;
}

/**
 * Grava uma linha. Devolve null se gravou (ou se ela já estava lá: o envio
 * anterior chegou e só a resposta se perdeu) ou o resultado a seguir.
 */
async function insertRow(table: string, row: Record<string, unknown>): Promise<Outcome | null> {
  const { error } = await supabase.from(table).insert(row);
  if (!error) return null;
  const e = error as ErrLike;
  // Mesmo código de linha: este item já tinha chegado antes.
  if (e.code === "23505" && /pkey/i.test(e.message ?? "")) return null;
  if (isNetwork(e) || isAuthProblem(e) || /^5/.test(String(e.status ?? ""))) {
    return { type: "retry", error: e.message ?? "sem conexão" };
  }
  return { type: "rejected", reason: friendlyInsertError(table, e) };
}

async function sendSingleRow(item: OutboxItem, table: string): Promise<Outcome> {
  const up = await uploadPhotos(item);
  if (up) return up;
  return (await insertRow(table, item.payload)) ?? { type: "sent" };
}

/** Check-list: grava o check-list e depois um defeito para cada problema marcado (cada um com o seu código). */
async function sendChecklist(item: OutboxItem): Promise<Outcome> {
  const up = await uploadPhotos(item);
  if (up) return up;
  const p = item.payload as { checklist: Record<string, unknown>; reports: Record<string, unknown>[] };
  const first = await insertRow("driver_checklists", p.checklist);
  if (first) return first;
  for (const report of p.reports) {
    const r = await insertRow("maintenance_reports", report);
    if (r) return r;
  }
  return { type: "sent" };
}

const HANDLERS: Record<OutboxKind, (item: OutboxItem) => Promise<Outcome>> = {
  fuel: (item) => sendSingleRow(item, "fuel_entries"),
  defect: (item) => sendSingleRow(item, "maintenance_reports"),
  proof: (item) => sendSingleRow(item, "delivery_proofs"),
  checklist: sendChecklist,
};

const ISSUE_KIND: Record<OutboxKind, string> = {
  fuel: "abastecimento",
  defect: "defeito",
  proof: "comprovante",
  checklist: "checklist",
};

/** Avisa a equipe de um item recusado (o mesmo item não gera dois avisos). */
async function reportIssue(item: OutboxItem): Promise<boolean> {
  const { error } = await supabase.from("driver_sync_issues").upsert(
    {
      id: item.id,
      driver_name: item.driverName,
      kind: ISSUE_KIND[item.kind],
      summary: item.summary,
      reason: item.reason ?? "Recusado pelo servidor.",
    },
    { onConflict: "id", ignoreDuplicates: true }
  );
  return !error;
}

// ---------- envio ----------

let running = false;

function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 10 * 60_000);
}

async function ensureSession(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return Boolean(data.session);
  } catch {
    return false;
  }
}

/**
 * Envia o que está na fila, do mais antigo para o mais novo. Com `force`, ignora
 * a espera entre tentativas (usado quando o sinal volta ou o motorista toca em
 * "enviar agora"). Seguro de chamar várias vezes: só roda uma de cada vez.
 */
export async function syncNow(userId: string, force = false): Promise<void> {
  // Só uma aba/janela envia por vez (senão a mesma foto sobe duas vezes).
  if (navigator.locks) {
    await navigator.locks.request("cotaflow-outbox-sync", { ifAvailable: true }, async (lock) => {
      if (lock) await runSync(userId, force);
    });
    return;
  }
  await runSync(userId, force);
}

async function runSync(userId: string, force: boolean): Promise<void> {
  if (running) return;
  running = true;
  emit();
  try {
    if (!(await ensureSession())) return;
    const items = (await listOutbox(userId)).filter((i) => i.status === "pending");
    for (const original of items) {
      if (!force && original.nextAttemptAt > Date.now()) continue;
      const item = (await getOutboxItem(original.id)) ?? original;
      if (item.status !== "pending") continue;
      const out = await HANDLERS[item.kind](item);
      setReachable(out.type !== "retry");
      const fresh = (await getOutboxItem(item.id)) ?? item; // o envio de fotos atualiza o item
      if (out.type === "sent") {
        await idbDelete("outbox", item.id);
        if (fresh.reported) await resolveIssue(item.id, "enviado");
      } else if (out.type === "retry") {
        const attempts = fresh.attempts + 1;
        await idbPut("outbox", { ...fresh, attempts, lastError: out.error, nextAttemptAt: Date.now() + backoffMs(attempts) });
        emit();
        break; // sem sinal para um item = sem sinal para os próximos
      } else {
        const rejected: OutboxItem = { ...fresh, status: "rejected", reason: out.reason };
        rejected.reported = await reportIssue(rejected);
        await idbPut("outbox", rejected);
      }
      emit();
    }
    // Recusados que ainda não conseguiram avisar a equipe (estavam sem sinal).
    for (const i of await listOutbox(userId)) {
      if (i.status === "rejected" && !i.reported && (await reportIssue(i))) {
        await idbPut("outbox", { ...i, reported: true });
      }
    }
  } finally {
    running = false;
    emit();
  }
}

export function isSyncing(): boolean {
  return running;
}
