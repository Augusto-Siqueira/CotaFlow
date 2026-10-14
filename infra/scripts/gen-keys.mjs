// Gera as senhas e chaves da pilha e grava em infra/.env (fora do git).
//   node scripts/gen-keys.mjs            -> cria o .env (recusa sobrescrever)
//   node scripts/gen-keys.mjs --force    -> recria (INVALIDA tokens e logins ativos)
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
};
// --out .env.dest --db-port 54339 --gateway-port 54331 --site-url http://127.0.0.1:3101
const envPath = join(root, arg("out", ".env"));
const dbPort = arg("db-port", "54329");
const gatewayPort = arg("gateway-port", "54321");
const siteUrl = arg("site-url", "http://127.0.0.1:3100");

if (existsSync(envPath) && !process.argv.includes("--force")) {
  console.error(".env já existe. Use --force só se quiser recriar as chaves (isso derruba os logins).");
  process.exit(1);
}

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
function jwt(payload, secret) {
  const data = `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}`;
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`;
}

const secret = randomBytes(36).toString("base64url");
const dbPassword = randomBytes(24).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const exp = now + 10 * 365 * 86400;

const env = `# Gerado por scripts/gen-keys.mjs — NÃO versionar, NÃO colar em chat.
POSTGRES_PASSWORD=${dbPassword}
JWT_SECRET=${secret}
ANON_KEY=${jwt({ role: "anon", iss: "supabase", iat: now, exp }, secret)}
SERVICE_ROLE_KEY=${jwt({ role: "service_role", iss: "supabase", iat: now, exp }, secret)}

# Endereços (no ensaio local)
PUBLIC_API_URL=http://127.0.0.1:${gatewayPort}
SITE_URL=${siteUrl}
DB_PORT=${dbPort}
GATEWAY_PORT=${gatewayPort}

# Anti-robô: desligado no ensaio local; em produção, ligar com a chave secreta do Turnstile.
CAPTCHA_ENABLED=false
CAPTCHA_SECRET=
`;
writeFileSync(envPath, env, { mode: 0o600 });
console.log(`${envPath} criado.`);
