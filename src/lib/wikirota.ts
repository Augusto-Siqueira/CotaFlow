import "server-only";

// Cliente da API da WikiRota (service.wikirota.com) — pedágio por rota.
// Retomado em 11/2026 (plano Professional, pós-pago por requisição: até 20
// pontos por rota; a rota detalhada para o mapa, fullRoute, custa R$ 0,05 a
// mais e é usada: o mapa da cotação desenha exatamente o caminho cobrado).
// Chamado só pela rota /api/quotes/pedagio, que guarda cada consulta em
// toll_estimates (cache de 30 dias + contagem do mês).
//
// Notas antigas que continuam valendo:
// - A API responde HTTP 200 até em erro; o que vale é o campo `success`.
// - totalMinimumFreight (frete mínimo ANTT) tem um bug confirmado (não aplica
//   CCD x distância): o piso ANTT do CotaFlow é calculado à parte com
//   `antt_coefficients` + computeAnttFloor.
// - O motor próprio (src/lib/tollMatching.ts) continua congelado.

export interface WikiRotaLatLng {
  lat: number;
  lng: number;
}

export interface WikiRotaTollItem {
  name: string;
  road: string;
  km: number;
  currency: string;
  currencyRate?: number;
  price: number;
  peakPrice?: number;
  eletronicPaymentPrice?: number;
  eletronicPaymentPeakPrice?: number;
  nationalIdentification?: string;
}

export interface WikiRotaError {
  message: string;
  parameter_name: string | null;
  type: "invalid_parameter" | "not_found" | string;
}

export interface WikiRotaRouteCostResult {
  success: true;
  distance: number;
  duration: string;
  tolls: WikiRotaTollItem[];
  totalTollPrice: number;
  totalCost: number;
  // Geometria exata da rota que a WikiRota usou pra calcular os pedágios
  // acima (via fullRoute=true, campo osrmRoute.routes[0].geometry — polyline
  // codificada no formato padrão do OSRM). Decodificada aqui pro mapa
  // desenhar direto, sem precisar de lib de decode no cliente. Null se a
  // WikiRota não devolver osrmRoute (não deveria acontecer com fullRoute
  // true, mas a API não documenta isso como garantido).
  routeGeometry: WikiRotaLatLng[] | null;
}

export interface WikiRotaRouteCostFailure {
  success: false;
  errors: WikiRotaError[];
}

interface OsrmRouteResponse {
  routes?: { geometry?: string; legs?: { steps?: { geometry?: string }[] }[] }[];
}

const WIKIROTA_URL = "https://service.wikirota.com/routecost";

// Decodifica uma polyline no formato padrão do OSRM/Google (precisão 5) —
// ver https://developers.google.com/maps/documentation/utilities/polylinealgorithm.
// Sem lib externa: é um algoritmo pequeno e o OSRM não expõe um encoder/decoder
// via API própria, só a string codificada.
function decodePolyline(encoded: string): WikiRotaLatLng[] {
  const coordinates: WikiRotaLatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return coordinates;
}

// A geometria "geral" da rota vem resumida (~40 pontos para 400 km, corta
// curvas); o traçado fino está nos trechos (legs[].steps[].geometry, milhares
// de pontos). Junta os trechos e simplifica para algumas centenas de pontos.
function routeLine(osrm: OsrmRouteResponse | undefined): WikiRotaLatLng[] | null {
  const route = osrm?.routes?.[0];
  if (!route) return null;
  const pts: WikiRotaLatLng[] = [];
  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      if (!step.geometry) continue;
      for (const p of decodePolyline(step.geometry)) {
        const last = pts[pts.length - 1];
        if (!last || last.lat !== p.lat || last.lng !== p.lng) pts.push(p);
      }
    }
  }
  if (pts.length < 2) return route.geometry ? decodePolyline(route.geometry) : null;
  let tol = 0.0002; // ~20 m
  let out = simplify(pts, tol);
  while (out.length > 1500) {
    tol *= 2;
    out = simplify(pts, tol);
  }
  return out;
}

/** Douglas-Peucker (iterativo) em graus; bom o bastante para desenhar no mapa. */
function simplify(pts: WikiRotaLatLng[], tol: number): WikiRotaLatLng[] {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a];
    const B = pts[b];
    const dx = B.lng - A.lng;
    const dy = B.lat - A.lat;
    const len2 = dx * dx + dy * dy;
    let far = -1;
    let farD = t2;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i];
      let t = len2 ? ((P.lng - A.lng) * dx + (P.lat - A.lat) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = A.lng + t * dx - P.lng;
      const ey = A.lat + t * dy - P.lat;
      const d = ex * ex + ey * ey;
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = 1;
      stack.push([a, far], [far, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Pede o custo de pedágio de uma rota pra WikiRota. Manda os waypoints
 * (pontos que o usuário já preencheu — origem/coleta/entrega/destino,
 * geocodificados), não a geometria detalhada do OSRM: é o formato que a
 * documentação deles espera, e é a WikiRota quem roteiriza internamente
 * (não precisamos concordar com o roteiro do nosso OSRM pra achar as praças).
 *
 * vehicleType sempre "truck" — CotaFlow só cota frete rodoviário de carga.
 */
export async function fetchWikiRotaRouteCost(
  waypoints: WikiRotaLatLng[],
  axles: number,
  opts: { fullRoute?: boolean } = { fullRoute: true }
): Promise<WikiRotaRouteCostResult | WikiRotaRouteCostFailure> {
  const apiKey = process.env.WIKIROTA_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      errors: [
        {
          message: "WIKIROTA_API_KEY não configurada no servidor.",
          parameter_name: null,
          type: "invalid_parameter",
        },
      ],
    };
  }

  let data:
    | (Omit<WikiRotaRouteCostResult, "routeGeometry"> & {
        osrmRoute?: OsrmRouteResponse;
      })
    | WikiRotaRouteCostFailure;
  try {
    const res = await fetch(WIKIROTA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        waypoints: waypoints.map((w) => `${w.lng},${w.lat}`),
        vehicleType: "truck",
        axle: Math.round(axles),
        apiKey,
        fullRoute: Boolean(opts.fullRoute),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    // A API da WikiRota sempre responde HTTP 200 (mesmo erro de parâmetro ou
    // chave inválida) — o único jeito de saber se deu certo é o campo `success`.
    data = await res.json();
  } catch (e) {
    return {
      success: false,
      errors: [{ message: "Sem resposta da WikiRota: " + (e instanceof Error ? e.message : String(e)), parameter_name: null, type: "network" }],
    };
  }

  if (!data.success) return data;

  return { ...data, routeGeometry: routeLine(data.osrmRoute) };
}
