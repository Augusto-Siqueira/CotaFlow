// Serviço de BACKUP do CotaFlow (roda no Railway, ao lado do banco).
//
// Não guarda nada: só entrega, a quem tiver o BACKUP_TOKEN, a cópia do banco
// e as fotos, para o servidor da empresa baixar todo dia. Só lê.
//
//   GET /health                      sem token: "ok"
//   GET /db                          cópia do banco (pg_dump -Fc: public, auth, storage)
//   GET /photos                      lista das fotos [{ bucket, name, size, updated_at }]
//   GET /photo?bucket=..&name=..     uma foto
//
// Variáveis: DATABASE_URL (papel postgres, rede interna), STORAGE_URL,
// SERVICE_ROLE_KEY, BACKUP_TOKEN (mínimo 32 caracteres), PORT.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { timingSafeEqual } from "node:crypto";

const { DATABASE_URL, STORAGE_URL, SERVICE_ROLE_KEY, BACKUP_TOKEN } = process.env;
const PORT = Number(process.env.PORT || 8080);
if (!DATABASE_URL || !STORAGE_URL || !SERVICE_ROLE_KEY || !BACKUP_TOKEN || BACKUP_TOKEN.length < 32) {
  console.error("Faltam variáveis (DATABASE_URL, STORAGE_URL, SERVICE_ROLE_KEY, BACKUP_TOKEN >= 32).");
  process.exit(1);
}

function authorized(req) {
  const got = Buffer.from((req.headers.authorization ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(BACKUP_TOKEN);
  return got.length === want.length && timingSafeEqual(got, want);
}

function psqlJson(sql) {
  return new Promise((resolve, reject) => {
    const p = spawn("psql", [DATABASE_URL, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql]);
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve(JSON.parse(out.trim() || "[]")) : reject(new Error(err.trim()))));
  });
}

const send = (res, status, body, type = "text/plain; charset=utf-8") => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const when = new Date().toISOString();
  if (url.pathname === "/health") return send(res, 200, "ok");
  if (!authorized(req)) {
    console.log(`${when} 401 ${url.pathname}`);
    return send(res, 401, "não autorizado");
  }
  try {
    if (url.pathname === "/db" && req.method === "GET") {
      const day = when.slice(0, 10);
      res.writeHead(200, {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="cotaflow-${day}.dump"`,
        "cache-control": "no-store",
      });
      const dump = spawn("pg_dump", [DATABASE_URL, "-Fc", "-n", "public", "-n", "auth", "-n", "storage"]);
      let err = "";
      dump.stderr.on("data", (d) => (err += d));
      dump.stdout.pipe(res);
      dump.on("close", (code) => {
        console.log(`${when} /db terminou (código ${code})${err ? ": " + err.trim() : ""}`);
        // Erro no meio do caminho: corta a conexão para o cliente não aceitar um arquivo incompleto.
        if (code !== 0) res.destroy();
      });
      req.on("close", () => dump.kill());
      return;
    }
    if (url.pathname === "/photos" && req.method === "GET") {
      const rows = await psqlJson(
        `select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name,
           'size', (metadata->>'size')::bigint, 'updated_at', updated_at) order by bucket_id, name), '[]')
         from storage.objects`
      );
      console.log(`${when} /photos (${rows.length})`);
      return send(res, 200, JSON.stringify(rows), "application/json");
    }
    if (url.pathname === "/photo" && req.method === "GET") {
      const bucket = url.searchParams.get("bucket") ?? "";
      const name = url.searchParams.get("name") ?? "";
      if (!/^[a-z0-9._-]+$/i.test(bucket) || !name || name.split("/").some((p) => p === ".." || p === "")) {
        return send(res, 400, "parâmetros inválidos");
      }
      const path = name.split("/").map(encodeURIComponent).join("/");
      const r = await fetch(`${STORAGE_URL}/object/${encodeURIComponent(bucket)}/${path}`, {
        headers: { authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY },
      });
      if (!r.ok) return send(res, r.status === 400 ? 404 : r.status, "foto não encontrada");
      res.writeHead(200, {
        "content-type": r.headers.get("content-type") ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      for await (const chunk of r.body) res.write(chunk);
      return res.end();
    }
    send(res, 404, "não encontrado");
  } catch (e) {
    console.error(`${when} erro em ${url.pathname}: ${e.message}`);
    if (!res.headersSent) send(res, 500, "erro no backup");
    else res.destroy();
  }
}).listen(PORT, () => console.log(`backup ouvindo na porta ${PORT}`));
