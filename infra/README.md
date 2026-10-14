# Migração do CotaFlow (Supabase + Vercel → Railway)

Princípio: **nada do sistema atual é alterado até a virada**. O Supabase e a
Vercel seguem no ar e ficam de plano B depois dela.

## Situação

- Fase 0 (backup) e Fase 1 (ensaio local) **prontas e ensaiadas** com dados de teste:
  migrations → backup → restauração → login com as senhas antigas → fotos → 38 testes de segurança.
- Falta: backup do Supabase **real**, ensaio com os dados reais, Railway (Fases 2 a 5).

## Fase 0 — Backup do Supabase real

1. **Conferir o cadastro aberto:** no Supabase, *Authentication → Sign In / Providers*,
   "Allow new users to sign up" deve estar **desligado**. Quem se cadastra sozinho ganha
   um login sem perfil, que lê os dados da equipe.
2. Copiar `.env.migration.example` para `.env.migration` e preencher **só no seu computador**.
3. Abrir o Docker Desktop (a "engine" precisa estar rodando).
4. Na pasta `infra`: `bash scripts/backup-supabase.sh`
5. Guardar `backups/<data>/` (e uma cópia em outro lugar) e conferir `counts.txt`.

## Fase 1 — Ensaio local (Docker)

```bash
cd infra
node scripts/gen-keys.mjs                      # .env da pilha de ORIGEM do ensaio
docker compose up -d                           # banco, login, API, fotos e gateway
# destino de teste (outra pilha, outras portas e chaves):
node scripts/gen-keys.mjs --out .env.dest --db-port 54339 --gateway-port 54331 --site-url http://127.0.0.1:3101
docker compose -p cotaflow-dest --env-file .env.dest up -d
# restaurar um backup no destino (APAGA o destino):
CONFIRM_RESTORE=sim bash scripts/restore-to-stack.sh backups/<data> .env.dest cotaflow-dest
# 38 testes de segurança (perfis, RLS, fotos) contra uma pilha:
set -a; . ./.env.dest; set +a
API_URL=$PUBLIC_API_URL ANON_KEY=$ANON_KEY SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY node scripts/smoke-test.mjs
```

Site contra a pilha de teste (acessar por `localhost`, não por `127.0.0.1`):

```bash
set -a; . infra/.env.dest; set +a
NEXT_PUBLIC_CAPTCHA_DISABLED=1 NEXT_PUBLIC_SUPABASE_URL=$PUBLIC_API_URL \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY npx next dev -p 3101
```

`NEXT_PUBLIC_CAPTCHA_DISABLED=1` só esconde o widget no site (ensaio/staging sem anti-robô).
Em produção não se define; o anti-robô é imposto pelo servidor de login.

## O que aprendemos no ensaio (vale para o Railway)

- O papel `postgres` da imagem **não é superusuário**. A carga dos dados usa
  `supabase_admin` (mesma senha do banco) com `session_replication_role = replica`.
- `pg_dump/pg_restore 17` grava `SET transaction_timeout`, que o banco 15 não conhece:
  o script remove essa linha. Cada carga roda numa transação única.
- Ordem da restauração: migrations → limpar destino → usuários (auth) → dados (public) → fotos → contagens.
- Senhas dos usuários **são preservadas** (vão criptografadas no backup de `auth.users`).
- Sessões abertas caem na virada (o segredo de assinatura do token muda).
- O site só precisa de 4 variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `WIKIROTA_API_KEY`.
- Falta validar com dados reais: versão do GoTrue do Supabase hospedado pode ter colunas
  a mais em `auth.users` do que a imagem local (o ensaio com o backup real mostra).

## Se o Docker Desktop não abrir

Erro "Inference manager … dockerInference": arquivo de socket antigo em
`%LOCALAPPDATA%\Docker\run`. **Não use "Reset to factory defaults".**
Reinicie o Windows e abra o Docker Desktop; se persistir, apague `dockerInference`
num PowerShell **como administrador**.
