// Cliente da API da WikiRota (service.wikirota.com) — CONGELADO em
// 2026-09, mesma situação do motor próprio (src/lib/tollMatching.ts):
// mantido no repositório, sem nenhum caller ativo. O campo Pedágio (R$) das
// telas de cotação voltou a ser 100% manual enquanto o pedágio automático
// está pausado (outras frentes da plataforma têm prioridade agora) — ver
// as páginas em src/app/quotes/new/page.tsx e
// src/app/quotes/batches/new/page.tsx, que não chamam mais nada daqui.
// Não havia rota de API dedicada (era src/app/api/quotes/toll-estimate,
// removida junto por não ter mais chamador) — pra reativar, basta recriar
// esse bridge chamando fetchWikiRotaRouteCost abaixo.
//
// Contexto preservado pra quando isso for retomado:
// - Chave de teste grátis testada em 18/09/2026: aceita no máximo 5
//   waypoints por chamada (5 funcionou, 6 deu "waypoints parameter has
//   exceeded the limit"); a página de preços da WikiRota anuncia 40 pontos
//   no plano Professional — restrição do trial, não do contrato. Cota de
//   50 chamadas grátis total, por isso o cálculo era sob demanda (botão),
//   nunca automático a cada mudança de rota.
// - Substituiu o motor próprio porque também resolve o frete mínimo ANTT
//   via totalMinimumFreight — mas esse campo tem um bug confirmado (nunca
//   aplica o termo CCD x distância, só devolve o coeficiente fixo CC), por
//   isso o piso ANTT no CotaFlow sempre foi calculado à parte com
//   `antt_coefficients` + computeAnttFloor, independente deste cliente.
// - Chegou a ser cotada como alternativa a integração com a API VPO da
//   Veloe (vale-pedágio obrigatório); descartada porque a Veloe só libera
//   credencial mediante contrato (sem ambiente de teste) e o produto é
//   modelado para o CNPJ pagador (embarcador), papel que a Transbochnia
//   não tem — ela é transportadora.

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
  axles: number
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

  const res = await fetch(WIKIROTA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      waypoints: waypoints.map((w) => `${w.lng},${w.lat}`),
      vehicleType: "truck",
      axle: Math.round(axles),
      apiKey,
      fullRoute: true,
    }),
  });

  // A API da WikiRota sempre responde HTTP 200 (mesmo erro de parâmetro ou
  // chave inválida) — o único jeito de saber se deu certo é o campo `success`.
  const data = (await res.json()) as
    | (Omit<WikiRotaRouteCostResult, "routeGeometry"> & {
        osrmRoute?: OsrmRouteResponse;
      })
    | WikiRotaRouteCostFailure;

  if (!data.success) return data;

  const encodedGeometry = data.osrmRoute?.routes?.[0]?.geometry;
  return {
    ...data,
    routeGeometry: encodedGeometry ? decodePolyline(encodedGeometry) : null,
  };
}
