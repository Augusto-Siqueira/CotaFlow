import { supabase } from "@/lib/supabase";

const PAGE_SIZE = 1000;
const CACHE_KEY = "cotaflow:cities:v1";
const TTL_MS = 6 * 60 * 60 * 1000;

let memory: string[] | null = null;
let inflight: Promise<string[]> | null = null;

export function invalidateCityCache() {
  memory = null;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {}
}

async function loadFromDatabase(): Promise<string[]> {
  // A primeira página já diz quantas existem (count), então as demais saem
  // todas juntas, em paralelo, em vez de uma depois da outra.
  const first = await supabase
    .from("cities")
    .select("name", { count: "exact" })
    .order("name")
    .range(0, PAGE_SIZE - 1);
  if (first.error || !first.data) return [];

  const total = first.count ?? first.data.length;
  const extraPages = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);
  const rest = await Promise.all(
    Array.from({ length: extraPages }, (_, i) =>
      supabase
        .from("cities")
        .select("name")
        .order("name")
        .range((i + 1) * PAGE_SIZE, (i + 2) * PAGE_SIZE - 1)
    )
  );

  const names = [...first.data, ...rest.flatMap((r) => r.data ?? [])].map(
    (c) => c.name
  );

  if (!rest.some((r) => r.error)) {
    memory = names;
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), names }));
    } catch {}
  }
  return names;
}

// Lista de municípios (~5.600) usada nas sugestões de endereço. Fica em
// memória e no sessionStorage por algumas horas: a lista quase não muda, e
// refazer 6 consultas a cada abertura de formulário era o maior tempo de
// espera do sistema.
export async function fetchAllCityNames(): Promise<string[]> {
  if (memory) return memory;

  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { at: number; names: string[] };
      if (Array.isArray(parsed.names) && Date.now() - parsed.at < TTL_MS) {
        memory = parsed.names;
        return parsed.names;
      }
    }
  } catch {}

  if (!inflight) {
    inflight = loadFromDatabase().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}
