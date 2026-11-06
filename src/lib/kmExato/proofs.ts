import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, type KmState } from "./engine";

// KM Exato · comprovantes do app do motorista. As cargas da Btech de São José
// dos Pinhais e de Indaiatuba têm comprovante por destino (delivery_proofs);
// quando a NF ou o CT-e do comprovante bate com a de uma entrega do KM Exato,
// o comprovante aparece nessa entrega, ela passa a contar como entregue na data
// do comprovante e, depois do envio pelo e-mail do CotaFlow, como comprovante
// enviado. Nada disso é gravado no KM Exato: é calculado na leitura.

export const KM_PROOF_CLIENTS = ["BTECH - S J DOS PINHAIS", "BTECH - INDAIATUBA"];

/** Comprovante só vale para viagens carregadas até 3 dias depois e 90 dias antes dele. */
const DAYS_BEFORE = 3;
const DAYS_AFTER = 90;

/**
 * Números de documento digitados pelo motorista ou vindos do XML:
 *   "30699" -> ["30699"]; "132.737" -> ["132737"] (ponto de milhar);
 *   "30675..30674" / "30643.30642" / "30641/30642" -> dois números;
 *   zeros à esquerda não contam ("030699" = "30699").
 */
export function docNumbers(text: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const chunk of String(text ?? "").split(/\.{2,}|[^\d.]+/)) {
    if (!chunk) continue;
    const parts = chunk.split(".").filter(Boolean);
    const thousands = parts.length > 1 && parts[0].length <= 3 && parts.slice(1).every((p) => p.length === 3);
    for (const p of thousands ? [parts.join("")] : parts) {
      const n = p.replace(/^0+/, "");
      if (n.length >= 3) out.add(n);
    }
  }
  return [...out];
}

export interface KmProof {
  id: string;
  schedule_id: string;
  destination: string;
  invoice_number: string;
  cte_number: string | null;
  photos: string[];
  created_at: string;
  client_name: string;
  emailed_at: string | null;
}

export async function loadKmProofs(db: SupabaseClient): Promise<KmProof[]> {
  const { data, error } = await db
    .from("delivery_proofs")
    .select("id, schedule_id, destination, invoice_number, cte_number, photos, created_at, loading_schedules!inner(client_name)")
    .in("loading_schedules.client_name", KM_PROOF_CLIENTS)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(`comprovantes: ${error.message}`);
  const rows = (data ?? []) as unknown as (Omit<KmProof, "client_name" | "emailed_at"> & { loading_schedules: { client_name: string } })[];
  const ids = rows.map((r) => r.id);
  const sent = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data: em } = await db.from("delivery_proof_emails").select("proof_id, sent_at").in("proof_id", ids.slice(i, i + 200));
    for (const e of (em ?? []) as { proof_id: string; sent_at: string }[]) {
      const cur = sent.get(e.proof_id);
      if (!cur || e.sent_at < cur) sent.set(e.proof_id, e.sent_at);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    schedule_id: r.schedule_id,
    destination: r.destination,
    invoice_number: r.invoice_number,
    cte_number: r.cte_number,
    photos: r.photos ?? [],
    created_at: r.created_at,
    client_name: r.loading_schedules.client_name,
    emailed_at: sent.get(r.id) ?? null,
  }));
}

/**
 * Liga os comprovantes às entregas das viagens do app (não às do controle
 * anterior) e preenche o que eles provam: entregue (data do comprovante) e
 * comprovante enviado (primeiro envio pelo CotaFlow). Altera o state recebido.
 */
export function attachProofs(state: KmState, proofs: KmProof[]) {
  const indexed = proofs.map((p) => ({ p, nums: new Set([...docNumbers(p.invoice_number), ...docNumbers(p.cte_number)]), day: p.created_at.slice(0, 10) }));
  for (const v of Object.values(state.viag)) {
    if (v.status === "cancelada") continue;
    const lo = addDays(v.carreg, -DAYS_BEFORE);
    for (const e of v.entregas) {
      const mine = [...docNumbers(e.nf), ...docNumbers(e.cte)];
      if (!mine.length) continue;
      const hits = indexed.filter((x) => x.day >= lo && x.day <= addDays(v.carreg, DAYS_AFTER) && mine.some((n) => x.nums.has(n)));
      if (!hits.length) continue;
      const best = hits.sort((a, b) => (a.day < b.day ? -1 : 1))[0].p;
      e.proof = { id: best.id, scheduleId: best.schedule_id, destination: best.destination, at: best.created_at, photos: best.photos.length, emailedAt: best.emailed_at };
      if (!e.entregue) {
        e.entregue = best.created_at.slice(0, 10);
        e.entregueAuto = true;
      }
      if (!e.comp?.env && best.emailed_at) e.comp = { ...e.comp, env: true, em: best.emailed_at, auto: true };
    }
  }
}
