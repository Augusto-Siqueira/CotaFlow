// Confere o KM Exato importado: calcula os saldos com o motor do CotaFlow
// (src/lib/kmExato) a partir das tabelas km_* e compara com os saldos de
// referência calculados pelo app original (arquivo JSON com { porPlaca, total }).
//
// Uso: npx tsx infra/scripts/check-km-exato.mts <saldos_referencia.json>
//      (banco local por padrão; API_URL/SERVICE_ROLE_KEY para outro banco)

import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { KmEngine } from "../../src/lib/kmExato/engine";
import { loadKmState } from "../../src/lib/kmExato/load";

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, "..", ".env");
const fromFile: Record<string, string> = {};
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) fromFile[m[1]] = m[2];
  }
}
const API_URL = process.env.API_URL || fromFile.PUBLIC_API_URL;
const SERVICE = process.env.SERVICE_ROLE_KEY || fromFile.SERVICE_ROLE_KEY;
const refFile = process.argv[2];
if (!refFile) {
  console.error("Informe o arquivo de saldos de referência.");
  process.exit(1);
}
const ref = JSON.parse(readFileSync(refFile, "utf8")) as {
  porPlaca: Record<string, { saldo: number; viagensFechadas: number; pendenteAbertas: number }>;
  total: { saldo: number; ateChg: number; desdeChg: number };
};

const db = createClient(API_URL!, SERVICE!, { auth: { persistSession: false, autoRefreshToken: false } });
const { state } = await loadKmState(db);
const eng = new KmEngine(state);
const SD = eng.saldos(eng.trips());

let fails = 0;
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
for (const [placa, r] of Object.entries(ref.porPlaca)) {
  const p = SD.p[placa];
  const ok = p && Math.abs(p.saldo - r.saldo) < 0.005 && p.n === r.viagensFechadas && Math.abs(p.pend - r.pendenteAbertas) < 0.005;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "ERRO"} ${placa}: CotaFlow ${p ? brl(p.saldo) : "—"} (${p?.n ?? 0} fechadas) × app ${brl(r.saldo)} (${r.viagensFechadas} fechadas)`);
}
for (const k of ["saldo", "ateChg", "desdeChg"] as const) {
  const ok = Math.abs(SD.t[k] - ref.total[k]) < 0.005;
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "ERRO"} total ${k}: CotaFlow ${brl(SD.t[k])} × app ${brl(ref.total[k])}`);
}
console.log(fails ? `${fails} diferença(s).` : "Tudo confere com o app original.");
process.exit(fails ? 1 : 0);
