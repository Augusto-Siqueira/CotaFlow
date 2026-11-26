import { requireRole, supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchWikiRotaRouteCost, type WikiRotaTollItem } from "@/lib/wikirota";

export const runtime = "nodejs";

// Pedágio da rota da cotação pela WikiRota (botão "Calcular pedágio").
// Cada consulta é paga (plano Professional, por requisição): a mesma rota com
// os mesmos eixos nos últimos 30 dias usa o resultado guardado em
// toll_estimates, a menos que peçam "Consultar de novo" (force).
//
// A WikiRota devolve a rota detalhada (o caminho que ela cobrou, desenhado no
// mapa) mas não a posição das praças: cada praça vem com rodovia + km + código
// nacional (UF IBGE nos 2 primeiros dígitos). O ponto no mapa vem da nossa base
// de praças (toll_plazas, ANTT + ARTESP) pela mesma rodovia/UF e km mais
// próximo; a que não achar entra na lista e no total, só sem marcador.
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

interface TollOut {
  name: string;
  road: string;
  km: number | null;
  price: number;
  lat: number | null;
  lng: number | null;
}

export interface TollEstimateResponse {
  total: number;
  tolls: TollOut[];
  /** Caminho que a WikiRota usou (para o mapa): [lat, lng]. */
  route: [number, number][] | null;
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

const IBGE_UF: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};
/** "BR-116", "br 116", "SP-021" -> "BR-116", "SP-21". */
const roadKey = (r: string | null | undefined) => {
  const m = String(r ?? "").toUpperCase().match(/([A-Z]{2,3})\s*-?\s*0*(\d+)/);
  return m ? `${m[1]}-${m[2]}` : "";
};
const MAX_KM_GAP = 3;

/** Põe latitude/longitude nas praças da WikiRota a partir de toll_plazas. */
async function locate(db: ReturnType<typeof supabaseAdmin>, items: WikiRotaTollItem[]): Promise<TollOut[]> {
  const { data } = await db
    .from("toll_plazas")
    .select("rodovia, uf, km, latitude, longitude")
    .eq("active", true)
    .not("latitude", "is", null);
  const plazas = ((data ?? []) as { rodovia: string | null; uf: string; km: number | null; latitude: number; longitude: number }[]).map((p) => ({
    road: roadKey(p.rodovia),
    uf: p.uf,
    km: p.km != null ? Number(p.km) : null,
    lat: Number(p.latitude),
    lng: Number(p.longitude),
  }));
  return items.map((t) => {
    const km = typeof t.km === "number" ? t.km : null;
    const road = roadKey(t.road);
    const uf = IBGE_UF[String(t.nationalIdentification ?? "").slice(0, 2)] ?? null;
    // O código nacional traz o km com uma casa (…0572… = km 57,2): mais preciso que o km inteiro.
    const code = String(t.nationalIdentification ?? "");
    const codeKm = /^\d{17}$/.test(code) ? Number(code.slice(7, 11)) / 10 : null;
    const target = codeKm ?? km;
    let best: (typeof plazas)[number] | null = null;
    let gap = Infinity;
    if (road && target != null) {
      for (const p of plazas) {
        if (p.road !== road || p.km == null || (uf && p.uf !== uf)) continue;
        const g = Math.abs(p.km - target);
        if (g < gap) {
          gap = g;
          best = p;
        }
      }
    }
    const hit = best && gap <= MAX_KM_GAP ? best : null;
    return { name: t.name, road: t.road, km, price: Number(t.price) || 0, lat: hit?.lat ?? null, lng: hit?.lng ?? null };
  });
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
      .select("total, tolls, route, distance_km, created_at")
      .eq("cache_key", cacheKey)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    // Consulta antiga sem o caminho guardado não serve para o mapa: consulta de novo.
    if (hit && Array.isArray(hit.route)) {
      return Response.json({
        total: Number(hit.total),
        tolls: hit.tolls,
        route: hit.route,
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

  const tolls = await locate(db, r.tolls ?? []);
  const route = r.routeGeometry ? r.routeGeometry.map((p) => [Math.round(p.lat * 1e5) / 1e5, Math.round(p.lng * 1e5) / 1e5] as [number, number]) : null;
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
    route,
    distance_km: distanceKm,
    billed: true,
    created_by: u.id,
    created_by_name: ((u.user_metadata?.name as string | undefined) ?? u.email ?? null) || null,
    created_at: at,
  });

  return Response.json({ total, tolls, route, distanceKm, axles, cached: false, at, monthCount: await monthCount(db) } satisfies TollEstimateResponse);
}
