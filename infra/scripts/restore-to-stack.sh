#!/usr/bin/env bash
# Restaura um backup (gerado por backup-supabase.sh) numa pilha de DESTINO,
# local (Docker) ou remota (Railway). APAGA o que houver no destino antes de
# copiar — por isso exige confirmação:
#
#   CONFIRM_RESTORE=sim bash scripts/restore-to-stack.sh backups/<data> <arquivo-env>
#
# O arquivo-env (em infra/) aponta o destino:
#   POSTGRES_PASSWORD, DB_PORT, PUBLIC_API_URL, SERVICE_ROLE_KEY
#   DB_HOST   (opcional; padrão host.docker.internal = pilha local no Docker.
#              No Railway: endereço do "TCP Proxy" do serviço db)
# Exemplos:
#   ensaio local:   CONFIRM_RESTORE=sim bash scripts/restore-to-stack.sh backups/2026... .env.dest
#   Railway teste:  CONFIRM_RESTORE=sim bash scripts/restore-to-stack.sh backups/2026... .env.staging
# SKIP_MIGRATIONS=1 pula as migrations (destino que já as tem).
# Passos: migrations -> limpa destino -> usuários -> dados do banco -> fotos -> conferência.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP="${1:?Informe a pasta do backup (ex.: backups/20261015-120000)}"
ENV_FILE="${2:-.env}"
[ "${CONFIRM_RESTORE:-}" = "sim" ] || { echo "Isto APAGA o destino. Rode com CONFIRM_RESTORE=sim para continuar."; exit 1; }
[ -d "$BACKUP" ] || { echo "Pasta não encontrada: $BACKUP"; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Arquivo de ambiente não encontrado: $ENV_FILE"; exit 1; }

set -a; . "./$ENV_FILE"; set +a
: "${POSTGRES_PASSWORD:?}" "${DB_PORT:?Preencha DB_PORT no $ENV_FILE}" "${PUBLIC_API_URL:?Preencha PUBLIC_API_URL no $ENV_FILE}" "${SERVICE_ROLE_KEY:?}"
DB_HOST="${DB_HOST:-host.docker.internal}"
# Destino remoto (Railway): a conexão TEM que ser criptografada. Local: não precisa.
if [ "$DB_HOST" = "host.docker.internal" ]; then SSL="prefer"; else SSL="require"; fi

export MSYS_NO_PATHCONV=1
ROOT="$(cd .. && (pwd -W 2>/dev/null || pwd))"
CLIENT=(docker run --rm -i -v "${ROOT}:/work" -w /work/infra postgres:17-alpine)
DB_URL="postgresql://postgres:${POSTGRES_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres?sslmode=${SSL}"
# Superusuário da imagem: só ele pode adiar as chaves estrangeiras durante a carga.
ADMIN_URL="postgresql://supabase_admin:${POSTGRES_PASSWORD}@${DB_HOST}:${DB_PORT}/postgres?sslmode=${SSL}"
B="/work/infra/$BACKUP"

echo "Destino: banco em ${DB_HOST}:${DB_PORT} (conexão: ${SSL}) · API em ${PUBLIC_API_URL}"
"${CLIENT[@]}" psql "$DB_URL" -At -c "select 'conexão ok: ' || current_user" >/dev/null \
  || { echo "Não consegui conectar ao banco de destino. Confira DB_HOST, DB_PORT e a senha."; exit 1; }

# Reaplicar as migrations num destino que JÁ tem a estrutura é perigoso: as
# migrations antigas recriam regras "liberadas para todos" (allow_all) e a
# execução pára antes das que as removem. Por isso, se o destino já tem as
# tabelas, as migrations são puladas (FORCE_MIGRATIONS=1 só se tiver certeza).
HAS_SCHEMA="$("${CLIENT[@]}" psql "$DB_URL" -At -c "select to_regclass('public.clients') is not null")"
if [ "$HAS_SCHEMA" = "t" ] && [ "${SKIP_MIGRATIONS:-}" != "1" ] && [ "${FORCE_MIGRATIONS:-}" != "1" ]; then
  echo "Aviso: o destino já tem a estrutura; as migrations serão PULADAS (segurança)."
  SKIP_MIGRATIONS=1
fi

if [ "${SKIP_MIGRATIONS:-}" = "1" ]; then
  echo "1/6 Migrations: puladas"
else
  echo "1/6 Migrations (estrutura do banco)…"
  for f in $(ls ../supabase/migrations/*.sql | sort); do
    "${CLIENT[@]}" psql "$DB_URL" -v ON_ERROR_STOP=1 -q -o /dev/null -f "/work/supabase/migrations/$(basename "$f")" \
      || { echo "FALHOU na migration $f"; exit 1; }
  done
fi

echo "2/6 Limpando o destino…"
"${CLIENT[@]}" psql "$DB_URL" -v ON_ERROR_STOP=1 -q -o /dev/null <<'SQL'
set client_min_messages = warning;
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
"${CLIENT[@]}" sh -c "(echo 'SET session_replication_role = replica;'; sed '/transaction_timeout/d' $B/auth.sql) | psql '$ADMIN_URL' -v ON_ERROR_STOP=1 -q --single-transaction -o /dev/null"

echo "4/6 Dados do banco (public)…"
"${CLIENT[@]}" sh -c "(echo 'SET session_replication_role = replica;'; pg_restore --data-only --no-owner -f - $B/public.dump | sed '/transaction_timeout/d') | psql '$ADMIN_URL' -v ON_ERROR_STOP=1 -q --single-transaction -o /dev/null"

echo "5/6 Fotos…"
if [ -d "$BACKUP/photos" ]; then
  CLEAN=1 API_URL="$PUBLIC_API_URL" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" SRC_DIR="$BACKUP/photos" node scripts/storage-upload.mjs
else
  echo "   (sem pasta de fotos neste backup)"
fi

echo "6/6 Conferência das contagens…"
"${CLIENT[@]}" psql "$DB_URL" -At -F ' | ' -f /work/infra/sql/counts.sql > "$BACKUP/counts.destino.txt"
if diff -u "$BACKUP/counts.txt" "$BACKUP/counts.destino.txt"; then
  echo "OK: todas as contagens são iguais à origem."
else
  echo "ATENÇÃO: há diferenças acima (origem = -, destino = +)."; exit 2
fi
