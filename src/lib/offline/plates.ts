import { supabase } from "@/lib/supabase";
import type { SearchOption } from "@/components/SearchSelect";
import { cached } from "@/lib/offline/refdata";

interface PlatesRef {
  today: { plate: string | null; trailer_plate: string | null }[];
  fleet: { plate: string; kind: string }[];
}

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Placas para os formulários do motorista (defeito e check-list): as de hoje
 * primeiro, depois a frota. Fica guardado no celular para funcionar sem sinal.
 */
export async function loadPlateOptions(userId: string): Promise<{ options: SearchOption[]; stale: boolean; at: number }> {
  const res = await cached<PlatesRef>(`${userId}:plates`, async () => {
    const [today, fleet] = await Promise.all([
      supabase.from("loading_schedules").select("plate, trailer_plate").eq("schedule_date", localDate(new Date())),
      supabase.rpc("fleet_plates"),
    ]);
    if (today.error) throw new Error(today.error.message);
    if (fleet.error) throw new Error(fleet.error.message);
    return {
      today: (today.data ?? []) as PlatesRef["today"],
      fleet: (fleet.data ?? []) as PlatesRef["fleet"],
    };
  });
  const options: SearchOption[] = [];
  const add = (p: string | null, hint: string) => {
    if (p && !options.some((o) => o.value === p)) options.push({ value: p, hint });
  };
  for (const l of res.data.today) {
    add(l.plate, "Cavalo da carga de hoje");
    add(l.trailer_plate, "Carreta da carga de hoje");
  }
  for (const f of res.data.fleet) add(f.plate, f.kind === "semirreboque" ? "Semi-reboque" : "Cavalo/truck");
  return { options, stale: res.stale, at: res.at };
}
