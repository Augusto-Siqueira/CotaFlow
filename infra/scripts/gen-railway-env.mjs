// Gera as variáveis de CADA serviço do Railway (arquivos .env para colar no
// "Raw Editor" do serviço) com senhas e chaves novas, mais infra/.env.<nome>
// para os scripts de restauração e de teste.
//
//   node scripts/gen-railway-env.mjs                       # ambiente "staging"
//   node scripts/gen-railway-env.mjs --name production --captcha on
//
// Saída: infra/railway/<nome>/{db,auth,rest,storage,gateway,app}.env
// Nada disso vai para o git. NÃO cole o conteúdo em chat.
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const infra = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const name = arg("name", "staging");
const captcha = arg("captcha", name === "production" ? "on" : "off") === "on";
const outDir = join(infra, "railway", name);
const scriptEnv = join(infra, `.env.${name}`);

if ((existsSync(outDir + "/db.env") || existsSync(scriptEnv)) && !process.argv.includes("--force")) {
  console.error(`Já existem arquivos de "${name}". Use --force só se quiser recriar (as chaves mudam e invalidam o que já foi colado no Railway).`);
  process.exit(1);
}

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
const jwt = (payload, secret) => {
  const data = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
};

const secret = randomBytes(36).toString("base64url");
const pw = randomBytes(24).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const exp = now + 10 * 365 * 86400;
const anon = jwt({ role: "anon", iss: "supabase", iat: now, exp }, secret);
const service = jwt({ role: "service_role", iss: "supabase", iat: now, exp }, secret);

// Chave da WikiRota e do Turnstile: lidas do .env.local do projeto, se houver.
let wikirota = "";
const local = join(infra, "..", ".env.local");
if (existsSync(local)) {
  const m = readFileSync(local, "utf8").match(/^WIKIROTA_API_KEY=(.*)$/m);
  if (m) wikirota = m[1].trim();
}

const GATEWAY = "https://${{gateway.RAILWAY_PUBLIC_DOMAIN}}";
const APP = "https://${{app.RAILWAY_PUBLIC_DOMAIN}}";

const files = {
  "db.env": `# Serviço "db" — volume em /var/lib/postgresql/data
POSTGRES_PASSWORD=${pw}
JWT_SECRET=${secret}
JWT_EXP=3600
POSTGRES_HOST=/var/run/postgresql
PGPORT=5432
POSTGRES_PORT=5432
PGPASSWORD=${pw}
PGDATABASE=postgres
POSTGRES_DB=postgres
PGDATA=/var/lib/postgresql/data/pgdata
# Não registrar os comandos nos logs (a inicialização define senhas em texto):
PGOPTIONS=-c log_statement=none
`,
  "auth.env": `# Serviço "auth" — imagem supabase/gotrue:v2.174.0
GOTRUE_API_HOST=0.0.0.0
GOTRUE_API_PORT=9999
API_EXTERNAL_URL=${GATEWAY}
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:${pw}@db.railway.internal:5432/postgres
GOTRUE_SITE_URL=${APP}
GOTRUE_URI_ALLOW_LIST=${APP}
GOTRUE_DISABLE_SIGNUP=true
GOTRUE_JWT_ADMIN_ROLES=service_role
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_SECRET=${secret}
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_MAILER_AUTOCONFIRM=true
GOTRUE_SMTP_ADMIN_EMAIL=nao-responder@cotaflow.local
GOTRUE_SMTP_HOST=localhost
GOTRUE_SMTP_PORT=2500
GOTRUE_SECURITY_CAPTCHA_ENABLED=${captcha ? "true" : "false"}
GOTRUE_SECURITY_CAPTCHA_PROVIDER=turnstile
GOTRUE_SECURITY_CAPTCHA_SECRET=${captcha ? "COLE_AQUI_A_CHAVE_SECRETA_DO_TURNSTILE" : ""}
GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_REAUTHENTICATION=false
GOTRUE_PASSWORD_MIN_LENGTH=6
`,
  "rest.env": `# Serviço "rest" — imagem postgrest/postgrest:v12.2.12
PGRST_DB_URI=postgres://authenticator:${pw}@db.railway.internal:5432/postgres
PGRST_DB_SCHEMAS=public,storage
PGRST_DB_ANON_ROLE=anon
PGRST_JWT_SECRET=${secret}
PGRST_DB_USE_LEGACY_GUCS=false
PGRST_APP_SETTINGS_JWT_SECRET=${secret}
PGRST_APP_SETTINGS_JWT_EXP=3600
PGRST_DB_MAX_ROWS=1000
PGRST_SERVER_PORT=3000
`,
  "storage.env": `# Serviço "storage" — imagem supabase/storage-api:v1.24.7 — volume em /var/lib/storage
ANON_KEY=${anon}
SERVICE_KEY=${service}
POSTGREST_URL=http://rest.railway.internal:3000
PGRST_JWT_SECRET=${secret}
DATABASE_URL=postgres://supabase_storage_admin:${pw}@db.railway.internal:5432/postgres
FILE_SIZE_LIMIT=10485760
STORAGE_BACKEND=file
FILE_STORAGE_BACKEND_PATH=/var/lib/storage
TENANT_ID=cotaflow
REGION=railway
GLOBAL_S3_BUCKET=cotaflow
ENABLE_IMAGE_TRANSFORMATION=false
# O Railway injeta PORT=8080; o gateway espera 5000:
SERVER_PORT=5000
PORT=5000
`,
  "gateway.env": `# Serviço "gateway" — pasta infra/railway/gateway (Dockerfile) — domínio público
PORT=8000
REST_UPSTREAM=rest.railway.internal:3000
AUTH_UPSTREAM=auth.railway.internal:9999
STORAGE_UPSTREAM=storage.railway.internal:5000
`,
  "app.env": `# Serviço "app" — o site (repositório, raiz) — domínio público
NEXT_PUBLIC_SUPABASE_URL=${GATEWAY}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAFQidpXSEwANDmeD
${captcha ? "" : "NEXT_PUBLIC_CAPTCHA_DISABLED=1\n"}WIKIROTA_API_KEY=${wikirota}
`,
};

mkdirSync(outDir, { recursive: true });
for (const [file, text] of Object.entries(files)) writeFileSync(join(outDir, file), text, { mode: 0o600 });

writeFileSync(
  scriptEnv,
  `# Para os scripts (restauração e teste) contra o ambiente "${name}" do Railway. NÃO versionar.
POSTGRES_PASSWORD=${pw}
JWT_SECRET=${secret}
ANON_KEY=${anon}
SERVICE_ROLE_KEY=${service}

# Preencher depois que os serviços existirem (não são segredos):
PUBLIC_API_URL=
# Endereço e porta do "TCP Proxy" do serviço db (ativar só durante a restauração):
DB_HOST=
DB_PORT=
`,
  { mode: 0o600 }
);

console.log(`Gerado: ${outDir} (6 arquivos) e ${scriptEnv}`);
if (!wikirota) console.log("Aviso: WIKIROTA_API_KEY não encontrada no .env.local; preencha em app.env.");
