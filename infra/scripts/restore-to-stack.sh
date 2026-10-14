#!/usr/bin/env bash
# Restaura um backup (gerado por backup-supabase.sh) na pilha de DESTINO.
# APAGA o que houver no destino antes de copiar — por isso exige confirmação:
#
#   CONFIRM_RESTORE=sim bash scripts/restore-to-stack.sh backups/<data> [arquivo-env] [projeto-compose]
#
# Exemplos:
#   ensaio local (destino de teste):  ... backups/2026... .env.dest cotaflow-dest
#   pilha principal local:            ... backups/2026... .env cotaflow-infra
# Passos: migrations -> limpa destino -> usuários -> dados do banco -> fotos -> conferência.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP="${1:?Informe a pasta do backup (ex.: backups/20261015-120000)}"
ENV_FILE="${2:-.env}"
PROJECT="${3:-cotaflow-infra}"
[ "${CONFIRM_RESTORE:-}" = "sim" ] || { echo "Isto APAGA o destino ($PROJECT). Rode com CONFIRM_RESTORE=sim para continuar."; exit 1; }
[ -d "$BACKUP" ] || { echo "Pasta não encontrada: $BACKUP"; exit 1; }

set -a; . "./$ENV_FILE"; set +a
export MSYS_NO_PATHCONV=1
HERE="$(pwd -W 2>/dev/null || pwd)"
DB_URL="postgresql://postgres:${POSTGRES_PASSWORD}@host.docker.internal:${DB_PORT}/postgres"
# Superusuário da imagem: só ele pode adiar as chaves estrangeiras durante a carga.
ADMIN_URL="postgresql://supabase_admin:${POSTGRES_PASSWORD}@host.docker.internal:${DB_PORT}/postgres"
CLIENT=(docker run --rm -v "${HERE}:/work" -w /work postgres:17-alpine)
DC="docker compose -p $PROJECT --env-file $ENV_FILE"
psql_db() { $DC exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

if [ "${SKIP_MIGRATIONS:-}" = "1" ]; then echo "1/6 Migrations: puladas (SKIP_MIGRATIONS=1)"; else echo "1/6 Migrations (estrutura do banco)…"; fi
if [ "${SKIP_MIGRATIONS:-}" != "1" ]; then
  for f in $(ls ../supabase/migrations/*.sql | sort); do
    psql_db -f - < "$f" >/dev/null || { echo "FALHOU na migration $f"; exit 1; }
  done
fi

echo "2/6 Limpando o destino…"
psql_db <<'SQL'
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('truncate table public.%I restart identity cascade', t.tablename);
  end loop;
end $$;
truncate table auth.users cascade;
SQL

# O pg_dump/pg_restore 17 grava "SET transaction_timeout", que o banco 15 não
# conhece: filtramos essa linha. Cada carga roda numa transação única (ou
# entra tudo ou não entra nada) e com as chaves estrangeiras adiadas
# (session_replication_role = replica), pois a ordem das tabelas num backup só
# de dados não respeita as chaves.
echo "3/6 Usuários e logins (auth)…"
"${CLIENT[@]}" sh -c "(echo 'SET session_replication_role = replica;'; sed '/transaction_timeout/d' /work/$BACKUP/auth.sql) | psql '$ADMIN_URL' -v ON_ERROR_STOP=1 -q --single-transaction -o /dev/null"

echo "4/6 Dados do banco (public)…"
"${CLIENT[@]}" sh -c "(echo 'SET session_replication_role = replica;'; pg_restore --data-only --no-owner -f - /work/$BACKUP/public.dump | sed '/transaction_timeout/d') | psql '$ADMIN_URL' -v ON_ERROR_STOP=1 -q --single-transaction -o /dev/null"

echo "5/6 Fotos…"
if [ -d "$BACKUP/photos" ]; then
  CLEAN=1 API_URL="$PUBLIC_API_URL" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" SRC_DIR="$BACKUP/photos" node scripts/storage-upload.mjs
else
  echo "   (sem pasta de fotos neste backup)"
fi

echo "6/6 Conferência das contagens…"
"${CLIENT[@]}" psql "$DB_URL" -At -F ' | ' -f /work/sql/counts.sql > "$BACKUP/counts.destino.txt"
if diff -u "$BACKUP/counts.txt" "$BACKUP/counts.destino.txt"; then
  echo "OK: todas as contagens são iguais à origem."
else
  echo "ATENÇÃO: há diferenças acima (origem = -, destino = +)."; exit 2
fi
