import "server-only";
import https from "node:https";

// Integração com a API da A52, que repassa as posições do rastreador Maxtrack.
// Só roda no servidor: usuário e senha ficam nas variáveis A52_API_URL,
// A52_USERNAME e A52_PASSWORD (.env.local e Railway) e nunca vão ao navegador.
//
// A API usa GET com corpo JSON em algumas consultas, o que o fetch não permite;
// por isso as chamadas usam node:https direto.

const MAXTRACK = 20; // id da tecnologia "Maxtrac" em GET /tecnologias
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

let fleet: { at: number; list: { plate: string; kind: string; codigo: string }[] } | null = null;

/** Veículos ativos com Maxtrack recebendo posição (código do equipamento). */
async function trackedFleet() {
  if (fleet && Date.now() - fleet.at < FLEET_TTL_MS) return fleet.list;
  const all = ((await authed("GET", "/veiculos")) ?? []) as A52Vehicle[];
  const list: { plate: string; kind: string; codigo: string }[] = [];
  for (const v of all) {
    if (!v.ativo) continue;
    const eq = (v.equipamentos ?? []).filter((e) => e.idTecnologia === MAXTRACK && e.recebe_posicao);
    const main = eq.find((e) => e.principal) ?? eq[0];
    if (main) list.push({ plate: plateKey(v.placa), kind: KIND[v.tipo] ?? "Veículo", codigo: main.codigo });
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
    const out: FleetPosition[] = [];
    for (let i = 0; i < units.length; i += LOTE_SIZE) {
      const body = units.slice(i, i + LOTE_SIZE).map((u) => ({ codigo: u.codigo, idTecnologia: MAXTRACK }));
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
        out.push({
          plate,
          kind: kindBy.get(plate) ?? "Veículo",
          lat: r.latitude,
          lon: r.longitude,
          speed: Math.round(r.velocidade ?? 0),
          ignition: r.ignicao === 1 ? true : r.ignicao === 2 ? false : null,
          at: utcIso(r.data_hora),
        });
      }
    }
    positions = { at: Date.now(), list: out };
    return out;
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}
