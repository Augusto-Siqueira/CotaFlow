#!/usr/bin/env bash
# Backup COMPLETO do Supabase para a sua máquina (somente leitura na origem).
# Gera infra/backups/<data-hora>/ com:
#   public.dump    banco (tabelas, funções, regras de segurança e dados)
#   auth.sql       usuários e logins (as senhas já vêm criptografadas)
#   counts.txt     contagem de linhas, para conferir depois da restauração
#   photos/        fotos do app do motorista (se SUPABASE_URL/KEY estiverem no .env.migration)
#
# Requisitos: Docker Desktop aberto e infra/.env.migration preenchido.
# Rodar na pasta infra:   bash scripts/backup-supabase.sh
set -euo pipefail

cd "$(dirname "$0")/.."
# Se SUPABASE_DB_URL já vier no ambiente (ensaio), não exige o arquivo.
if [ -z "${SUPABASE_DB_URL:-}" ]; then
  if [ ! -f .env.migration ]; then
    echo "Falta infra/.env.migration (copie de .env.migration.example e preencha)."; exit 1
  fi
  set -a; . ./.env.migration; set +a
fi
: "${SUPABASE_DB_URL:?Preencha SUPABASE_DB_URL no .env.migration}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="backups/$STAMP"
mkdir -p "$OUT"
# Git Bash no Windows: não converter os caminhos /work dentro do contêiner.
export MSYS_NO_PATHCONV=1
HERE="$(pwd -W 2>/dev/null || pwd)"
PG=(docker run --rm -v "$HERE:/work" -w /work postgres:17-alpine)

echo "1/4 Banco (schema public)…"
"${PG[@]}" pg_dump "$SUPABASE_DB_URL" --format=custom --no-owner --no-privileges \
  --schema=public --file="/work/$OUT/public.dump"

echo "2/4 Usuários e logins (auth)…"
"${PG[@]}" pg_dump "$SUPABASE_DB_URL" --data-only --no-owner --no-privileges --column-inserts \
  --table=auth.users --table=auth.identities --file="/work/$OUT/auth.sql"

echo "3/4 Contagens…"
"${PG[@]}" psql "$SUPABASE_DB_URL" -At -F ' | ' -f /work/sql/counts.sql > "$OUT/counts.txt"

echo "4/4 Fotos…"
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  BACKUP_DIR="$OUT/photos" node scripts/storage-download.mjs
else
  echo "   (pulado: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não preenchidos)"
fi

echo
echo "Pronto: infra/$OUT"
cat "$OUT/counts.txt"
ls -lh "$OUT"
