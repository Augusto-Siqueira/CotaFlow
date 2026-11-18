import "server-only";
import https from "node:https";

// Integração com a API da A52, que repassa as posições dos rastreadores da
// frota (Maxtrack, Positron e outros que a A52 receba).
// Só roda no servidor: usuário e senha ficam nas variáveis A52_API_URL,
// A52_USERNAME e A52_PASSWORD (.env.local e Railway) e nunca vão ao navegador.
//
// A API usa GET com corpo JSON em algumas consultas, o que o fetch não permite;
// por isso as chamadas usam node:https direto.

// Nome das tecnologias (GET /tecnologias) que aparecem na tela.
const TECH: Record<number, string> = { 1: "Autotrac", 10: "Sighra", 17: "Positron", 20: "Maxtrack", 61: "A52" };
const TOKEN_TTL_MS = 30 * 60 * 1000;
const FLEET_TTL_MS = 10 * 60 * 1000;
const POSITIONS_TTL_MS = 30 * 1000;
const LOTE_SIZE = 50;

export interface FleetPosition {
  /** Placa sem hífen, maiúscula (como no CotaFlow). */
  plate: string;
  kind: string;
  lat: number;
  lon: number;
  speed: number;
  /** true = ligada, false = desligada, null = não informado. */
  ignition: boolean | null;
  /** Momento da posição (ISO, UTC). */
  at: string;
  /** Rastreador que mandou esta posição (Maxtrack, Positron...). */
  tracker: string;
}

const KIND: Record<number, string> = { 1: "Cavalo", 2: "Carreta", 3: "Truck", 4: "Toco", 5: "Veículo", 6: "Moto", 7: "Bitruck" };

export function a52Configured(): boolean {
  return Boolean(process.env.A52_API_URL && process.env.A52_USERNAME && process.env.A52_PASSWORD);
}

function request(method: string, path: string, body?: unknown, token?: string): Promise<{ status: number; json: unknown }> {
  const base = new URL(process.env.A52_API_URL!);
  const data = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method,
        hostname: base.hostname,
        port: base.port || 443,
        path,
        headers: {
          Accept: "application/json",
          ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 20000,
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          let json: unknown = null;
          try {
            json = JSON.parse(buf);
          } catch {
            /* resposta sem JSON */
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("A52 não respondeu a tempo.")));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

let token: { value: string; at: number } | null = null;

async function getToken(force = false): Promise<string> {
  if (!force && token && Date.now() - token.at < TOKEN_TTL_MS) return token.value;
  const r = await request("POST", "/login", { username: process.env.A52_USERNAME, password: process.env.A52_PASSWORD });
  const value = (r.json as { access_token?: string } | null)?.access_token;
  if (!value) throw new Error(`Login na A52 recusado (HTTP ${r.status}).`);
  token = { value, at: Date.now() };
  return value;
}

/** Chamada autenticada; renova o login uma vez se ele tiver expirado. */
async function authed(method: string, path: string, body?: unknown): Promise<unknown> {
  let r = await request(method, path, body, await getToken());
  if (r.status === 401) r = await request(method, path, body, await getToken(true));
  if (r.status >= 400) throw new Error(`A52 respondeu HTTP ${r.status} em ${path}.`);
  return r.json;
}

export const plateKey = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");

interface A52Vehicle {
  placa: string;
  tipo: number;
  ativo: boolean;
  equipamentos?: { codigo: string; idTecnologia: number; principal?: boolean; recebe_posicao?: boolean }[];
}

interface Equipment {
  plate: string;
  kind: string;
  codigo: string;
  tech: number;
}

let fleet: { at: number; list: Equipment[] } | null = null;

/**
 * Equipamentos (rastreadores) recebendo posição dos veículos ativos. Um veículo
 * pode ter mais de um (ex.: Maxtrack e Positron); vale a posição mais recente.
 */
async function trackedFleet() {
  if (fleet && Date.now() - fleet.at < FLEET_TTL_MS) return fleet.list;
  const all = ((await authed("GET", "/veiculos")) ?? []) as A52Vehicle[];
  const list: Equipment[] = [];
  const seen = new Set<string>();
  for (const v of all) {
    if (!v.ativo) continue;
    for (const e of v.equipamentos ?? []) {
      const key = `${e.idTecnologia}:${e.codigo}`;
      if (!e.recebe_posicao || seen.has(key)) continue;
      seen.add(key);
      list.push({ plate: plateKey(v.placa), kind: KIND[v.tipo] ?? "Veículo", codigo: e.codigo, tech: e.idTecnologia });
    }
  }
  fleet = { at: Date.now(), list };
  return list;
}

/** "2026-11-18 18:06:40" (UTC, sem fuso) -> ISO. */
function utcIso(s: string): string {
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

let positions: { at: number; list: FleetPosition[] } | null = null;
let inflight: Promise<FleetPosition[]> | null = null;

/** Posição atual de toda a frota rastreada (guardada por 30 s). */
export async function fleetPositions(): Promise<FleetPosition[]> {
  if (positions && Date.now() - positions.at < POSITIONS_TTL_MS) return positions.list;
  if (inflight) return inflight;
  inflight = (async () => {
    const units = await trackedFleet();
    const kindBy = new Map(units.map((u) => [u.plate, u.kind]));
    // Mais recente por placa (quando a placa tem mais de um rastreador).
    const best = new Map<string, FleetPosition>();
    // Um lote por rastreador: a resposta do lote não diz de qual equipamento veio.
    const batches: { tech: number; chunk: Equipment[] }[] = [];
    for (const tech of [...new Set(units.map((u) => u.tech))]) {
      const same = units.filter((u) => u.tech === tech);
      for (let i = 0; i < same.length; i += LOTE_SIZE) batches.push({ tech, chunk: same.slice(i, i + LOTE_SIZE) });
    }
    for (const { tech, chunk } of batches) {
      const body = chunk.map((u) => ({ codigo: u.codigo, idTecnologia: tech }));
      const rows = ((await authed("GET", "/veiculos/posicao/lote", body)) ?? []) as {
        placa: string;
        data_hora: string;
        latitude: number;
        longitude: number;
        velocidade: number;
        ignicao: number;
      }[];
      for (const r of rows) {
        if (typeof r.latitude !== "number" || typeof r.longitude !== "number") continue;
        const plate = plateKey(r.placa);
        const pos: FleetPosition = {
          plate,
          kind: kindBy.get(plate) ?? "Veículo",
          lat: r.latitude,
          lon: r.longitude,
          speed: Math.round(r.velocidade ?? 0),
          ignition: r.ignicao === 1 ? true : r.ignicao === 2 ? false : null,
          at: utcIso(r.data_hora),
          tracker: TECH[tech] ?? `Rastreador ${tech}`,
        };
        const cur = best.get(plate);
        if (!cur || cur.at < pos.at) best.set(plate, pos);
      }
    }
    const out = [...best.values()];
    positions = { at: Date.now(), list: out };
    return out;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export interface A52Place {
  a52AddressId: number;
  a52ClientId: number;
  name: string;
  cnpj: string | null;
  city: string | null;
  uf: string | null;
  /** [[lat, lon], ...] sem repetir o ponto de fechamento; null = cerca em círculo. */
  polygon: [number, number][] | null;
  /** Raio em metros (cerca em círculo). */
  radiusM: number | null;
  centerLat: number;
  centerLon: number;
  active: boolean;
}

interface A52Client {
  id: number;
  nomeFantasia?: string | null;
  razaoSocial?: string | null;
  cnpj?: string | null;
  ativo: boolean;
  enderecos?: {
    id: number;
    ativo: boolean;
    poligono?: { latitude: number; longitude: number; ordem: number }[] | null;
    raio?: { latitude: number; longitude: number; raio: number } | null;
    cidade?: { nome?: string; estado?: string } | null;
  }[];
}

/** Cercas (polígono ou círculo) dos clientes/fornecedores cadastrados na A52. */
// Retângulo que cobre o Brasil: endereço sem cidade com cerca fora dele é ponto
// padrão esquecido no cadastro da A52 (ex.: Colômbia) e fica de fora.
const inBrazil = (lat: number, lon: number) => lat <= 5.5 && lat >= -34 && lon >= -74.5 && lon <= -34;

export async function a52Places(): Promise<{ places: A52Place[]; withoutFence: number; invalid: number }> {
  const clients = ((await authed("GET", "/clientes-fornecedores")) ?? []) as A52Client[];
  const places: A52Place[] = [];
  let withoutFence = 0;
  let invalid = 0;
  for (const c of clients) {
    const base = (c.nomeFantasia || c.razaoSocial || `Local ${c.id}`).trim().replace(/\s+/g, " ");
    const addrs = c.enderecos ?? [];
    for (const e of addrs) {
      const pts = [...(e.poligono ?? [])]
        .sort((a, b) => a.ordem - b.ordem)
        .map((p) => [p.latitude, p.longitude] as [number, number])
        .filter(([la, lo]) => Number.isFinite(la) && Number.isFinite(lo));
      // O último ponto repete o primeiro para fechar a figura.
      if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
      const circle =
        e.raio && Number.isFinite(e.raio.latitude) && Number.isFinite(e.raio.longitude) && e.raio.raio > 0 ? e.raio : null;
      if (pts.length < 3 && !circle) {
        withoutFence++;
        continue;
      }
      const isPolygon = pts.length >= 3;
      const city = e.cidade?.nome?.trim() || null;
      const uf = e.cidade?.estado?.trim() || null;
      const [cLat, cLon] = isPolygon ? pts[0] : [circle!.latitude, circle!.longitude];
      if (!city && !inBrazil(cLat, cLon)) {
        invalid++;
        continue;
      }
      places.push({
        a52AddressId: e.id,
        a52ClientId: c.id,
        // Cliente com mais de um endereço: o nome leva a cidade para diferenciar.
        name: addrs.length > 1 && city ? `${base} · ${city}` : base,
        cnpj: c.cnpj?.replace(/\D/g, "") || null,
        city,
        uf,
        polygon: isPolygon ? pts : null,
        radiusM: isPolygon ? null : Math.min(2000, Math.max(30, Math.round(circle!.raio))),
        centerLat: isPolygon ? pts.reduce((s, p) => s + p[0], 0) / pts.length : circle!.latitude,
        centerLon: isPolygon ? pts.reduce((s, p) => s + p[1], 0) / pts.length : circle!.longitude,
        active: Boolean(c.ativo && e.ativo),
      });
    }
  }
  return { places, withoutFence, invalid };
}
