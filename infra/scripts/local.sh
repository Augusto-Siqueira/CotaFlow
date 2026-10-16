#!/usr/bin/env bash
# Ambiente LOCAL de testes do CotaFlow (nada aqui toca a produção).
#
#   npm run local          liga banco/login/fotos (Docker), aplica migrations
#                          novas, cria dados de teste e abre o site em
#                          http://localhost:3101
#   npm run local:down     desliga os containers (os dados ficam guardados)
#
# Precisa do Docker Desktop aberto. Usuários de teste: infra/.local-users.json
set -euo pipefail

cd "$(dirname "$0")/.."          # pasta infra
INFRA="$(pwd)"
ROOT="$(cd .. && pwd)"
APPLIED="$INFRA/.local-migrations"

if [ "${1:-up}" = "down" ]; then
  docker compose down
  exit 0
fi

docker info >/dev/null 2>&1 || { echo "Abra o Docker Desktop e rode de novo."; exit 1; }
[ -f .env ] || { echo "Falta infra/.env (rode: node scripts/gen-keys.mjs)."; exit 1; }

echo "== Ligando banco, login, API e fotos..."
docker compose up -d >/dev/null
DB="$(docker compose ps -q db)"
for _ in $(seq 1 60); do
  docker exec "$DB" pg_isready -U postgres -q 2>/dev/null && break
  sleep 1
done

psql_db() { docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

# Migrations: aplica só as que ainda não rodaram AQUI (lista em .local-migrations).
# Nunca reaplica as antigas: elas recriam regras de acesso abertas (incidente da virada).
if [ ! -f "$APPLIED" ]; then
  if [ "$(psql_db -At -c "select to_regclass('public.clients') is not null")" = "t" ]; then
    echo "== Banco local já tem a estrutura: marcando as migrations atuais como aplicadas."
    for f in "$ROOT"/supabase/migrations/*.sql; do basename "$f"; done > "$APPLIED"
  else
    : > "$APPLIED"
  fi
fi
for f in "$ROOT"/supabase/migrations/*.sql; do   # o * já vem em ordem
  name="$(basename "$f")"
  grep -qx "$name" "$APPLIED" && continue
  echo "== Aplicando migration $name"
  if ! out="$(psql_db -1 < "$f" 2>&1)"; then
    echo "$out" | grep -v NOTICE
    echo "A migration $name falhou; nada dela foi gravado. Corrija e rode de novo."
    exit 1
  fi
  echo "$name" >> "$APPLIED"
done

echo "== Dados de teste"
(cd "$ROOT" && node infra/scripts/seed-local.mjs)

set -a; . ./.env; set +a
echo "== Site em http://localhost:3101  (Ctrl+C para parar o site)"
cd "$ROOT"
# As variáveis abaixo vencem o .env.local (que aponta para o Supabase antigo).
NEXT_PUBLIC_CAPTCHA_DISABLED=1 \
NEXT_PUBLIC_SUPABASE_URL="$PUBLIC_API_URL" \
NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY" \
SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npx next dev -p 3101
