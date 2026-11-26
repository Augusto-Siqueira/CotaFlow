import { requireRole, supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchWikiRotaRouteCost, type WikiRotaTollItem } from "@/lib/wikirota";

export const runtime = "nodejs";

// Pedágio da rota da cotação pela WikiRota (botão "Calcular pedágio").
// Cada consulta é paga (plano Professional, por requisição): a mesma rota com
// os mesmos eixos nos últimos 30 dias usa o resultado guardado em
// toll_estimates, a menos que peçam "Consultar de novo" (force).
//
// GET  -> consultas pagas no mês (contador da tela).
// POST { points: [{lat,lng,label}], axles, force? }

const MAX_POINTS = 20; // limite do plano Professional
const CACHE_DAYS = 30;
const ROLES = ["admin", "comercial"];

interface Point {
  lat: number;
  lng: number;
  label: string;
}

export interface TollEstimateResponse {
  total: number;
  tolls: { name: string; road: string; km: number | null; price: number }[];
  distanceKm: number | null;
  axles: number;
  cached: boolean;
  at: string;
  monthCount: number;
}

async function monthCount(db: ReturnType<typeof supabaseAdmin>) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { count } = await db.from("toll_estimates").select("id", { count: "exact", head: true }).eq("billed", true).gte("created_at", start);
  return count ?? 0;
}

const MESSAGES: Record<string, string> = {
  api_key_inactive: "A chave da WikiRota está inativa. Fale com o suporte da WikiRota.",
  network: "A WikiRota não respondeu. Tente de novo em instantes.",
};

export async function GET() {
  const auth = await requireRole(ROLES, "Seu perfil não consulta pedágio.");
  if (!auth.ok) return auth.response;
  return Response.json({ monthCount: await monthCount(supabaseAdmin()) });
}

export async function POST(request: Request) {
  const auth = await requireRole(ROLES, "Seu perfil não consulta pedágio.");
  if (!auth.ok) return auth.response;

  let body: { points?: unknown; axles?: unknown; force?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Envio inválido." }, { status: 400 });
  }
  const points = (Array.isArray(body.points) ? body.points : [])
    .map((p) => p as Partial<Point>)
    .filter((p) => typeof p.lat === "number" && typeof p.lng === "number" && isFinite(p.lat) && isFinite(p.lng))
    .map((p) => ({ lat: p.lat!, lng: p.lng!, label: String(p.label ?? "").slice(0, 120) }));
  const axles = Number(body.axles);
  if (points.length < 2) return Response.json({ error: "A rota precisa de pelo menos duas cidades localizadas no mapa." }, { status: 400 });
  if (points.length > MAX_POINTS) return Response.json({ error: `A rota tem ${points.length} pontos; o plano da WikiRota aceita até ${MAX_POINTS}.` }, { status: 400 });
  if (!Number.isInteger(axles) || axles < 2 || axles > 12) return Response.json({ error: "Escolha o número de eixos do veículo." }, { status: 400 });

  const db = supabaseAdmin();
  // ~100 m de precisão: a mesma cidade geocodificada de novo cai na mesma chave.
  const cacheKey = points.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join(";") + "|" + axles;

  if (body.force !== true) {
    const since = new Date(Date.now() - CACHE_DAYS * 864e5).toISOString();
    const { data: hit } = await db
      .from("toll_estimates")
      .select("total, tolls, distance_km, created_at")
      .eq("cache_key", cacheKey)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (hit) {
      return Response.json({
        total: Number(hit.total),
        tolls: hit.tolls,
        distanceKm: hit.distance_km != null ? Number(hit.distance_km) : null,
        axles,
        cached: true,
        at: hit.created_at,
        monthCount: await monthCount(db),
      } satisfies TollEstimateResponse);
    }
  }

  const r = await fetchWikiRotaRouteCost(points, axles);
  if (!r.success) {
    const e = r.errors?.[0];
    const msg = (e && MESSAGES[e.type]) || (e ? `WikiRota: ${e.message}` : "A WikiRota não calculou esta rota.");
    return Response.json({ error: msg }, { status: e?.type === "network" ? 504 : 502 });
  }

  const tolls = (r.tolls ?? []).map((t: WikiRotaTollItem) => ({
    name: t.name,
    road: t.road,
    km: typeof t.km === "number" ? t.km : null,
    price: Number(t.price) || 0,
  }));
  const total = Math.round((Number(r.totalTollPrice) || tolls.reduce((a, t) => a + t.price, 0)) * 100) / 100;
  // A WikiRota devolve a distância em km (Curitiba → São Paulo = 403,3); acima de 5000 seria metros.
  const rawDist = Number(r.distance);
  const distanceKm = isFinite(rawDist) && rawDist > 0 ? Math.round(rawDist > 5000 ? rawDist / 1000 : rawDist) : null;
  const u = auth.user;
  const at = new Date().toISOString();
  await db.from("toll_estimates").insert({
    cache_key: cacheKey,
    points,
    axles,
    total,
    tolls,
    distance_km: distanceKm,
    billed: true,
    created_by: u.id,
    created_by_name: ((u.user_metadata?.name as string | undefined) ?? u.email ?? null) || null,
    created_at: at,
  });

  return Response.json({ total, tolls, distanceKm, axles, cached: false, at, monthCount: await monthCount(db) } satisfies TollEstimateResponse);
}
