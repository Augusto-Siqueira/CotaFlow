// Envia para o Storage de DESTINO todas as fotos de uma pasta (a baixada pelo
// storage-download.mjs), mantendo os caminhos. Se a foto já existe, sobrescreve.
//   API_URL=... SERVICE_ROLE_KEY=... SRC_DIR=backups/AAAA/photos node scripts/storage-upload.mjs
import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

const url = process.env.API_URL;
const key = process.env.SERVICE_ROLE_KEY;
const src = process.env.SRC_DIR;
const BUCKET = process.env.BUCKET || "driver-photos";
if (!url || !key || !src) {
  console.error("Defina API_URL, SERVICE_ROLE_KEY e SRC_DIR.");
  process.exit(1);
}
if (!existsSync(src)) {
  console.log(`Sem pasta de fotos (${src}): nada a enviar.`);
  process.exit(0);
}

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// CLEAN=1: apaga as fotos que já estão no destino antes de enviar (restauração
// fiel: o destino fica igual ao backup, sem sobras de testes anteriores).
async function walk(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 100, offset });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await walk(path)));
      else out.push(path);
    }
    if (data.length < 100) break;
  }
  return out;
}
if (process.env.CLEAN === "1") {
  const old = await walk("");
  for (let i = 0; i < old.length; i += 100) {
    const { error } = await supabase.storage.from(BUCKET).remove(old.slice(i, i + 100));
    if (error) throw new Error(`remove: ${error.message}`);
  }
  console.log(`${old.length} foto(s) antigas removidas do destino.`);
}

const list = files(src);
let ok = 0;
for (const f of list) {
  const path = relative(src, f).split(sep).join("/");
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, readFileSync(f), { contentType: "image/jpeg", upsert: true });
  if (error) {
    console.error(`FALHOU ${path}: ${error.message}`);
    process.exitCode = 1;
  } else ok++;
}
console.log(`${ok} de ${list.length} fotos enviadas.`);
if (ok !== list.length) process.exit(1);
