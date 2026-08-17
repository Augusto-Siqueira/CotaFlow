import { supabase } from "@/lib/supabase";
import {
  calculateTollForRoute,
  matchPlazasToRoute,
  type LatLng,
  type PlazaForMatching,
  type TariffLookup,
} from "@/lib/tollMatching";

interface TollEstimateRequest {
  routeCoordinates?: LatLng[];
  vehicleAxles?: number;
}

// Só entra na busca quem tem coordenada. Hoje isso restringe o cálculo
// automático à malha federal (ANTT): as praças de SP (ARTESP) só têm
// rodovia+km, sem lat/long — precisam de geocoding antes de poderem
// participar do matching. Rota que só passa por SP não vai achar nada
// aqui, o que é esperado, não um bug.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as TollEstimateRequest | null;
  const route = body?.routeCoordinates;
  const axles = body?.vehicleAxles;

  if (!Array.isArray(route) || route.length < 2) {
    return Response.json(
      { error: "Envie { routeCoordinates: [{lat,lng}, ...], vehicleAxles: number } com pelo menos 2 pontos." },
      { status: 400 }
    );
  }
  if (typeof axles !== "number" || axles < 2) {
    return Response.json(
      { error: "vehicleAxles precisa ser um número >= 2." },
      { status: 400 }
    );
  }

  const { data: plazas, error: plazasError } = await supabase
    .from("toll_plazas")
    .select("id, name, concessionaria, rodovia, latitude, longitude")
    .eq("active", true)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (plazasError) {
    return Response.json({ error: plazasError.message }, { status: 500 });
  }

  const matches = matchPlazasToRoute(route, plazas as PlazaForMatching[]);
  if (matches.length === 0) {
    return Response.json({
      items: [],
      total: 0,
      plazasWithoutTariff: [],
      matchedPlazaCount: 0,
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const plazaIds = matches.map((m) => m.plaza.id);
  const { data: tariffRows, error: tariffsError } = await supabase
    .from("toll_tariffs")
    .select("toll_plaza_id, amount, valid_from, valid_until, toll_axle_categories(code)")
    .in("toll_plaza_id", plazaIds)
    .lte("valid_from", today)
    .or(`valid_until.is.null,valid_until.gte.${today}`);

  if (tariffsError) {
    return Response.json({ error: tariffsError.message }, { status: 500 });
  }

  const tariffsByPlazaId = new Map<string, TariffLookup[]>();
  for (const row of tariffRows as unknown as Array<{
    toll_plaza_id: string;
    amount: number;
    toll_axle_categories: { code: string } | { code: string }[] | null;
  }>) {
    const category = Array.isArray(row.toll_axle_categories)
      ? row.toll_axle_categories[0]
      : row.toll_axle_categories;
    if (!category) continue;
    const list = tariffsByPlazaId.get(row.toll_plaza_id) ?? [];
    list.push({ categoryCode: category.code, amount: row.amount });
    tariffsByPlazaId.set(row.toll_plaza_id, list);
  }

  const result = calculateTollForRoute(matches, axles, tariffsByPlazaId);

  return Response.json({
    items: result.items,
    total: result.total,
    plazasWithoutTariff: result.plazasWithoutTariff,
    matchedPlazaCount: matches.length,
  });
}
