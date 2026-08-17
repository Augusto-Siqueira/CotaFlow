// Toll Engine — descoberta de praças + tarifação, a partir da geometria da
// rota (não de origem/destino). Separado em três responsabilidades, como
// discutido antes de implementar: descoberta (matchPlazasToRoute),
// tarifação (tariffAmountForAxles) e agregação (calculateTollForRoute).
//
// Recebe a geometria pronta, não chama o roteador — assim o motor não fica
// acoplado ao OSRM (ou a qualquer serviço de rota específico).

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PlazaForMatching {
  id: string;
  name: string;
  concessionaria: string;
  rodovia: string | null;
  latitude: number | null;
  longitude: number | null;
}

export type MatchConfidence = "high" | "medium" | "low";

export interface PlazaMatch {
  plaza: PlazaForMatching;
  distanceToRouteMeters: number;
  distanceAlongRouteKm: number;
  coordinatePrecisionMeters: number;
  confidence: MatchConfidence;
}

const EARTH_RADIUS_M = 6371000;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Projeta o ponto no segmento a-b usando um plano local equirretangular
// (válido para segmentos curtos, na escala de um trecho de rota — não
// serve para distâncias continentais, mas aqui os segmentos vêm do OSRM
// e são de poucas centenas de metros).
function distanceToSegmentMeters(
  point: LatLng,
  a: LatLng,
  b: LatLng
): { distanceMeters: number; t: number } {
  const latRef = toRad(a.lat);
  const kx = EARTH_RADIUS_M * Math.cos(latRef);
  const ky = EARTH_RADIUS_M;

  const px = toRad(point.lng) * kx;
  const py = toRad(point.lat) * ky;
  const ax = toRad(a.lng) * kx;
  const ay = toRad(a.lat) * ky;
  const bx = toRad(b.lng) * kx;
  const by = toRad(b.lat) * ky;

  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;

  let t = lenSq === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * abx;
  const cy = ay + t * aby;
  const distanceMeters = Math.hypot(px - cx, py - cy);
  return { distanceMeters, t };
}

/**
 * Estima a precisão da coordenada da fonte pelo número de casas decimais
 * publicadas — não é uma medida de erro real, é um proxy. Achamos isso
 * necessário depois de ver que a ANTT publica lat/long com precisão MUITO
 * desigual entre concessionárias: de 6 casas (~0,1 m) a 1-2 casas
 * (~1 a 11 km). Um threshold único de distância não faz sentido quando a
 * própria referência pode estar errada por quilômetros.
 */
export function estimateCoordinatePrecisionMeters(
  latitude: number,
  longitude: number
): number {
  const decimalsOf = (n: number): number => {
    const s = Math.abs(n).toString();
    const i = s.indexOf(".");
    return i === -1 ? 0 : s.length - i - 1;
  };
  const decimals = Math.min(decimalsOf(latitude), decimalsOf(longitude));
  // 1 grau de latitude ~ 111.000 m; usamos essa constante como referência
  // de ordem de grandeza pras duas coordenadas (aproximação suficiente
  // para os fins de confiança, não para navegação).
  return 111000 / 10 ** decimals;
}

export interface MatchOptions {
  /** Raio de busca em metros. Generoso de propósito — a precisão da fonte
   * varia muito (ver estimateCoordinatePrecisionMeters), e é melhor achar
   * um candidato de baixa confiança do que não achar nada. */
  searchRadiusMeters?: number;
}

const DEFAULT_SEARCH_RADIUS_M = 3000;

// Praça de alta confiança: perto da rota E a fonte tem coordenada precisa.
// Sem isso, uma praça a 2,9km com coordenada de 11km de erro pareceria tão
// confiável quanto uma a 50m com coordenada exata — o que não é verdade.
const HIGH_CONFIDENCE_DISTANCE_M = 300;
const HIGH_CONFIDENCE_PRECISION_M = 200;
const MEDIUM_CONFIDENCE_DISTANCE_M = 1000;

function confidenceFor(
  distanceToRouteMeters: number,
  coordinatePrecisionMeters: number
): MatchConfidence {
  if (
    distanceToRouteMeters <= HIGH_CONFIDENCE_DISTANCE_M &&
    coordinatePrecisionMeters <= HIGH_CONFIDENCE_PRECISION_M
  ) {
    return "high";
  }
  if (
    distanceToRouteMeters <=
    MEDIUM_CONFIDENCE_DISTANCE_M + coordinatePrecisionMeters
  ) {
    return "medium";
  }
  return "low";
}

/**
 * Acha, entre as praças informadas, quais estão perto o suficiente da rota
 * pra serem consideradas atravessadas por ela — e em que ordem, pela
 * distância acumulada desde o início da rota.
 *
 * Não decide sozinho: cada praça sai com uma confiança (alta/média/baixa)
 * pra a tela de cotação poder mostrar isso ao usuário, em vez de tratar
 * toda praça encontrada como certeza absoluta.
 */
export function matchPlazasToRoute(
  route: LatLng[],
  plazas: PlazaForMatching[],
  opts: MatchOptions = {}
): PlazaMatch[] {
  if (route.length < 2) return [];
  const radius = opts.searchRadiusMeters ?? DEFAULT_SEARCH_RADIUS_M;

  // distância acumulada até o início de cada segmento, pra poder converter
  // a posição relativa (t) dentro de um segmento em km desde a origem.
  const cumulativeKm: number[] = [0];
  for (let i = 1; i < route.length; i++) {
    cumulativeKm.push(
      cumulativeKm[i - 1] + haversineMeters(route[i - 1], route[i]) / 1000
    );
  }

  const matches: PlazaMatch[] = [];

  for (const plaza of plazas) {
    if (plaza.latitude === null || plaza.longitude === null) continue;
    const point: LatLng = { lat: plaza.latitude, lng: plaza.longitude };

    let best: { distanceMeters: number; alongKm: number } | null = null;
    for (let i = 1; i < route.length; i++) {
      const { distanceMeters, t } = distanceToSegmentMeters(
        point,
        route[i - 1],
        route[i]
      );
      if (best === null || distanceMeters < best.distanceMeters) {
        const segLenKm = cumulativeKm[i] - cumulativeKm[i - 1];
        best = {
          distanceMeters,
          alongKm: cumulativeKm[i - 1] + t * segLenKm,
        };
      }
    }
    if (best === null || best.distanceMeters > radius) continue;

    const precision = estimateCoordinatePrecisionMeters(
      plaza.latitude,
      plaza.longitude
    );
    matches.push({
      plaza,
      distanceToRouteMeters: Math.round(best.distanceMeters),
      distanceAlongRouteKm: Math.round(best.alongKm * 10) / 10,
      coordinatePrecisionMeters: Math.round(precision),
      confidence: confidenceFor(best.distanceMeters, precision),
    });
  }

  return dedupeNearbyMatches(
    matches.sort((a, b) => a.distanceAlongRouteKm - b.distanceAlongRouteKm)
  );
}

// Duas ou mais linhas do cadastro podem representar a MESMA cobrança
// física: variante "Defasada" (substituída) que a fonte não removeu,
// sentido Norte/Sul de uma praça em pista dupla, portico antigo x novo no
// mesmo km. Descobrimos isso testando com rota real: 3 registros da
// mesma praça de Mairiporã bateram ao mesmo tempo, e sem isso o motor
// cobraria triplo por uma travessia só. Agrupamos por concessionária +
// proximidade ao longo da rota, mantendo só a de maior confiança —
// cruzar fisicamente o pedágio só acontece uma vez, mesmo se o cadastro
// tiver várias linhas pra ele.
const DEDUPE_WINDOW_KM = 0.5;
const CONFIDENCE_RANK: Record<MatchConfidence, number> = {
  high: 2,
  medium: 1,
  low: 0,
};

function dedupeNearbyMatches(sorted: PlazaMatch[]): PlazaMatch[] {
  const kept: PlazaMatch[] = [];
  for (const match of sorted) {
    const clusterMate = kept.find(
      (k) =>
        k.plaza.concessionaria === match.plaza.concessionaria &&
        Math.abs(k.distanceAlongRouteKm - match.distanceAlongRouteKm) <=
          DEDUPE_WINDOW_KM
    );
    if (!clusterMate) {
      kept.push(match);
      continue;
    }
    const better =
      CONFIDENCE_RANK[match.confidence] > CONFIDENCE_RANK[clusterMate.confidence]
        ? match
        : clusterMate;
    if (better !== clusterMate) {
      kept[kept.indexOf(clusterMate)] = better;
    }
  }
  return kept;
}

/**
 * Categoria de pedágio a partir do nº de eixos do veículo.
 *
 * Simplificação assumida de propósito: o tarifário oficial distingue
 * rodagem simples/dupla e reboque/semirreboque além do nº de eixos (por
 * isso 2 eixos pode ser M1_0 ou M2_0 dependendo do tipo de veículo) — mas
 * `vehicles` hoje só guarda `axles`, sem essa distinção. Para frete
 * (CotaFlow não cota carro de passeio), assumimos sempre rodagem
 * dupla/comercial: 2 eixos -> M2_0, nunca M1_0. Se o cadastro de veículos
 * ganhar rodagem/reboque no futuro, essa função é o lugar certo pra
 * refinar, sem mexer no resto do motor.
 */
export function categoryCodeForAxles(axles: number): string {
  const clamped = Math.max(2, Math.min(8, Math.round(axles)));
  return `M${clamped}_0`;
}

export interface TariffLookup {
  categoryCode: string;
  amount: number;
}

export interface TollLineItem {
  plaza: PlazaForMatching;
  distanceAlongRouteKm: number;
  confidence: MatchConfidence;
  amount: number | null;
}

export interface TollCalculationResult {
  items: TollLineItem[];
  total: number;
  plazasWithoutTariff: PlazaForMatching[];
}

/**
 * Soma o pedágio das praças encontradas, para a categoria do veículo.
 * Praça sem tarifa carregada para essa categoria entra em
 * `plazasWithoutTariff` (não é descartada silenciosamente) — é exatamente
 * o caso das concessões que ficaram de fora do seed (RIOSP, Concebra
 * etc.) ou de uma praça em que o veículo não é tarifado.
 */
export function calculateTollForRoute(
  matches: PlazaMatch[],
  vehicleAxles: number,
  tariffsByPlazaId: Map<string, TariffLookup[]>
): TollCalculationResult {
  const categoryCode = categoryCodeForAxles(vehicleAxles);
  const items: TollLineItem[] = [];
  const plazasWithoutTariff: PlazaForMatching[] = [];
  let total = 0;

  for (const match of matches) {
    const tariffs = tariffsByPlazaId.get(match.plaza.id) ?? [];
    const tariff = tariffs.find((t) => t.categoryCode === categoryCode);
    if (!tariff) {
      plazasWithoutTariff.push(match.plaza);
      items.push({
        plaza: match.plaza,
        distanceAlongRouteKm: match.distanceAlongRouteKm,
        confidence: match.confidence,
        amount: null,
      });
      continue;
    }
    total += tariff.amount;
    items.push({
      plaza: match.plaza,
      distanceAlongRouteKm: match.distanceAlongRouteKm,
      confidence: match.confidence,
      amount: tariff.amount,
    });
  }

  return { items, total: Math.round(total * 100) / 100, plazasWithoutTariff };
}
