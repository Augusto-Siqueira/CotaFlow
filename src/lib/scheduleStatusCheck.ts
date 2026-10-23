import { supabase } from "@/lib/supabase";
import { loadingStatusLabel } from "@/lib/loadingStatus";

// Mesmas travas da tela da Programação para mudar o status de uma carga:
// Carregando / Carregado em Viagem só quando as viagens ANTERIORES das mesmas
// placas já estão em Entrega Concluída e nenhuma das placas está na oficina
// ou com defeito que deixa o veículo parado.

export const RESTRICTED_STATUSES = new Set(["carregando", "em_viagem"]);

interface LoadRef {
  id: string;
  schedule_date: string;
  plate: string | null;
  trailer_plate: string | null;
}

function br(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Motivos que impedem a mudança para `status` (vazio = pode mudar). */
export async function statusChangeBlockers(load: LoadRef, status: string): Promise<string[]> {
  if (!RESTRICTED_STATUSES.has(status)) return [];
  const plates = [
    { label: "Cavalo/truck", plate: load.plate, column: "plate" as const },
    { label: "Semi-reboque", plate: load.trailer_plate, column: "trailer_plate" as const },
  ].filter((p) => Boolean(p.plate));
  if (plates.length === 0) return [];

  const warnings: string[] = [];
  const { data: me } = await supabase.from("loading_schedules").select("created_at").eq("id", load.id).maybeSingle();
  const selfCreated = me?.created_at ?? new Date().toISOString();

  // Viagem anterior da mesma placa ainda aberta.
  for (const c of plates) {
    const { data: others } = await supabase
      .from("loading_schedules")
      .select("id, schedule_date, status, created_at")
      .eq(c.column, c.plate!)
      .neq("status", "entregue")
      .lte("schedule_date", load.schedule_date)
      .order("schedule_date", { ascending: false })
      .order("created_at", { ascending: false });
    const prior = (others ?? []).find(
      (o) => o.id !== load.id && (o.schedule_date < load.schedule_date || o.created_at < selfCreated)
    );
    if (prior) {
      const [y, m, d] = prior.schedule_date.split("-");
      warnings.push(
        `A placa ${c.plate} (${c.label}) tem viagem em aberto: carregamento de ${d}/${m}/${y} (${loadingStatusLabel(prior.status)}). Conclua a entrega antes de iniciar esta viagem.`
      );
    }
  }

  // Placa na oficina ou com defeito que deixa o veículo parado.
  const list = plates.map((p) => p.plate!) as string[];
  const [orders, reports] = await Promise.all([
    supabase.from("maintenance_orders").select("plate, entry_at, maintenance_workshops(name)").is("exit_at", null).in("plate", list),
    supabase.from("maintenance_reports").select("plate, category, severity").in("status", ["triagem", "agendada"]).eq("severity", 3).in("plate", list),
  ]);
  for (const c of plates) {
    const o = ((orders.data ?? []) as unknown as { plate: string; entry_at: string; maintenance_workshops: { name: string } | null }[]).find(
      (x) => x.plate === c.plate
    );
    if (o) {
      warnings.push(
        `Placa ${c.plate} (${c.label}) em manutenção desde ${br(o.entry_at)} (${o.maintenance_workshops?.name ?? "oficina"}). Libere a placa na Manutenção antes de iniciar a viagem.`
      );
    }
    const defects = ((reports.data ?? []) as { plate: string; category: string }[]).filter((r) => r.plate === c.plate);
    if (defects.length > 0) {
      warnings.push(
        `Placa ${c.plate} (${c.label}) com defeito relatado (${Array.from(new Set(defects.map((d) => d.category))).join(", ")}): veículo parado, aguardando a manutenção. Libere a placa na Manutenção antes de iniciar a viagem.`
      );
    }
  }
  return warnings;
}
