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
export async function loadPlateOptions(
  userId: string
): Promise<{ options: SearchOption[]; stale: boolean; at: number; loadPlate: string | null }> {
  const res = await cached<PlatesRef>(`${userId}:plates`, async () => {
    const [today, fleet] = await Promise.all([
      // Cargas de hoje e as de dias anteriores com a viagem em andamento (carregando ou em viagem).
      supabase
        .from("loading_schedules")
        .select("plate, trailer_plate")
        .or(`schedule_date.eq.${localDate(new Date())},and(schedule_date.lt.${localDate(new Date())},status.in.(carregando,em_viagem)))`)
        .order("schedule_date", { ascending: false }),
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
    add(l.plate, "Cavalo da sua carga");
    add(l.trailer_plate, "Carreta da sua carga");
  }
  for (const f of res.data.fleet) add(f.plate, f.kind === "semirreboque" ? "Semi-reboque" : "Cavalo/truck");
  // Placa para preencher sozinho: só o cavalo de uma carga dele (sem carga, fica em branco).
  const loadPlate = res.data.today.find((l) => l.plate)?.plate ?? null;
  return { options, stale: res.stale, at: res.at, loadPlate };
}
