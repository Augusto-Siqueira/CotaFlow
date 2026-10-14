// Baixa TODAS as fotos do bucket "driver-photos" para uma pasta local,
// mantendo os caminhos (<id-do-motorista>/<ano-mes>/<arquivo>.jpg).
// Só LÊ do Supabase. Usado pelo backup e pela cópia para o Railway.
//   BACKUP_DIR=backups/AAAA/photos node scripts/storage-download.mjs
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outDir = process.env.BACKUP_DIR;
const BUCKET = process.env.BUCKET || "driver-photos";
if (!url || !key || !outDir) {
  console.error("Defina SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e BACKUP_DIR.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function walk(prefix) {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await walk(path))); // pasta
      else files.push(path);
    }
    if (data.length < 100) break;
  }
  return files;
}

const paths = await walk("");
console.log(`${paths.length} foto(s) encontradas.`);
let ok = 0;
let bytes = 0;
for (const path of paths) {
  const dest = join(outDir, path);
  if (existsSync(dest)) {
    ok++;
    continue;
  }
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) {
    console.error(`FALHOU ${path}: ${error.message}`);
    process.exitCode = 1;
    continue;
  }
  const buf = Buffer.from(await data.arrayBuffer());
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  bytes += buf.length;
  ok++;
}
console.log(`${ok} de ${paths.length} baixadas (${(bytes / 1024).toFixed(0)} kB novos).`);
if (ok !== paths.length) process.exit(1);
