import "server-only";

// Cliente da API da WikiRota (service.wikirota.com) — pedágio por rota.
// Retomado em 11/2026 (plano Professional, pós-pago por requisição: até 20
// pontos por rota; a rota detalhada para o mapa, fullRoute, custa à parte e
// fica desligada por padrão — o mapa da cotação usa o nosso roteador).
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
  routes?: { geometry?: string }[];
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
  opts: { fullRoute?: boolean } = {}
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

  const encodedGeometry = data.osrmRoute?.routes?.[0]?.geometry;
  return {
    ...data,
    routeGeometry: encodedGeometry ? decodePolyline(encodedGeometry) : null,
  };
}
