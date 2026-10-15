import { createSupabaseServer } from "@/lib/supabaseServer";
import { normalizeCityText } from "@/lib/normalizeText";

export interface CityCoordinates {
  lat: number;
  lng: number;
}

interface NominatimResult {
  lat: string;
  lon: string;
}

const NOMINATIM_USER_AGENT = "CotaFlow (comercial@transbochnia.com.br)";

async function fetchFromNominatim(
  name: string
): Promise<CityCoordinates | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("q", name);

  const response = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_USER_AGENT },
  });
  if (!response.ok) return null;

  const results = (await response.json()) as NominatimResult[];
  const first = results[0];
  if (!first) return null;

  return { lat: Number(first.lat), lng: Number(first.lon) };
}

/**
 * Resolve um nome (cidade ou endereço cadastrado) para lat/lng. Endereços
 * cadastrados (tabela `company_bases`) têm prioridade — suas coordenadas
 * foram marcadas à mão num mapa e nunca devem ser substituídas pelo centro
 * aproximado da cidade. Senão, usa `cities` como cache permanente do
 * Nominatim (que exige no máx. 1 req/s e não permite uso em lote).
 */
export async function getCityCoordinates(
  name: string
): Promise<CityCoordinates | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const supabase = await createSupabaseServer();
  const { data: address } = await supabase
    .from("company_bases")
    .select("latitude, longitude")
    .eq("name", trimmed)
    .maybeSingle();

  if (address) {
    return { lat: address.latitude, lng: address.longitude };
  }

  // Procura a cidade já cadastrada ignorando acento e maiúsculas (evita criar
  // "ALMIRANTE TAMANDARÉ/PR" ao lado de "Almirante Tamandaré/PR").
  const uf = trimmed.match(/\/([A-Za-z]{2})$/)?.[1];
  let existing: { name: string; latitude: number | null; longitude: number | null } | null = null;
  if (uf) {
    const { data: sameUf } = await supabase
      .from("cities")
      .select("name, latitude, longitude")
      .ilike("name", `%/${uf}`);
    existing =
      (sameUf ?? []).find((c) => normalizeCityText(c.name) === normalizeCityText(trimmed)) ?? null;
  } else {
    const { data } = await supabase
      .from("cities")
      .select("name, latitude, longitude")
      .eq("name", trimmed)
      .maybeSingle();
    existing = data;
  }

  if (existing && existing.latitude !== null && existing.longitude !== null) {
    return { lat: existing.latitude, lng: existing.longitude };
  }

  let coordinates: CityCoordinates | null = null;
  try {
    coordinates = await fetchFromNominatim(trimmed);
  } catch {
    return null;
  }
  if (!coordinates) return null;

  await supabase
    .from("cities")
    .upsert(
      { name: existing?.name ?? trimmed, latitude: coordinates.lat, longitude: coordinates.lng },
      { onConflict: "name" }
    );

  return coordinates;
}

/**
 * Resolve várias cidades em sequência (nunca em paralelo) para respeitar o
 * limite de 1 requisição/segundo do Nominatim nas que ainda não têm cache.
 */
export async function getCitiesCoordinates(
  names: string[]
): Promise<Array<{ name: string } & CityCoordinates>> {
  const results: Array<{ name: string } & CityCoordinates> = [];
  for (const name of names) {
    const coordinates = await getCityCoordinates(name);
    if (coordinates) {
      results.push({ name, ...coordinates });
    }
  }
  return results;
}
