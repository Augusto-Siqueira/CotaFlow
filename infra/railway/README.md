# Fase 2 — Ambiente de teste ("staging") no Railway

O ambiente de teste é uma cópia do sistema rodando no Railway com **uma cópia dos
dados reais**. O sistema atual (Supabase + Vercel) **não é tocado**.

## 0. Preparação (no computador)

```bash
cd infra
node scripts/gen-railway-env.mjs      # cria railway/staging/*.env e .env.staging
```

Os arquivos `railway/staging/*.env` têm senhas e chaves novas: **não vão para o git
e não se colam em chat**. Cada serviço do Railway recebe o conteúdo de um deles.

## 1. Projeto

- Railway → **New Project → Empty Project**. Nome: `CotaFlow`.
- Renomeie o ambiente padrão para `staging` (*Settings → Environments*).
- Região (por serviço, em *Settings → Deploy → Region*): **US East (Virginia)**, a mais
  perto do Brasil (o Railway não tem região na América do Sul).

## 2. Os 6 serviços (os NOMES têm que ser exatamente estes)

O nome vira o endereço interno (`db.railway.internal` etc.).

| Nome | Como criar | Pasta raiz | Volume | Variáveis (arquivo) |
|---|---|---|---|---|
| `db` | GitHub Repo (este repositório) | `/infra/railway/db` | `/var/lib/postgresql/data` | `db.env` |
| `auth` | Docker Image `supabase/gotrue:v2.174.0` | — | — | `auth.env` |
| `rest` | Docker Image `postgrest/postgrest:v12.2.12` | — | — | `rest.env` |
| `storage` | Docker Image `supabase/storage-api:v1.24.7` | — | `/var/lib/storage` | `storage.env` |
| `gateway` | GitHub Repo (este repositório) | `/infra/railway/gateway` | — | `gateway.env` |
| `app` | GitHub Repo (este repositório) | `/` (padrão) | — | `app.env` |

- Serviços de GitHub Repo: em *Settings → Source*, defina a **Root Directory** da tabela.
  Em `db` e `gateway`, defina também o *Watch Path* (`/infra/railway/db/**` e
  `/infra/railway/gateway/**`) para que mudanças no site não reconstruam o banco.
- Variáveis: serviço → **Variables → Raw Editor** → colar o arquivo inteiro → **Update Variables**.
  Linhas com `${{gateway.RAILWAY_PUBLIC_DOMAIN}}` e `${{app.RAILWAY_PUBLIC_DOMAIN}}` são
  referências do próprio Railway: funcionam depois que os domínios existem (passo 3).
- Volumes: botão direito no canvas → **Volume** → escolher o serviço → caminho da tabela.

## 3. Domínios públicos (só `gateway` e `app`)

- `gateway` → *Settings → Networking → Generate Domain* (porta **8000**).
- `app` → *Settings → Networking → Generate Domain*.
- `db`, `auth`, `rest` e `storage` **não** ganham domínio público (só rede interna).

## 4. Ordem de subida

`db` (aguarde ficar saudável) → `auth`, `rest`, `storage` → `gateway` → `app`.

- Variáveis `NEXT_PUBLIC_*` do `app` são gravadas no **build**: mudou uma, refaça o deploy do `app`.
- Teste: `https://<domínio-do-gateway>/health` responde `ok`;
  `https://<domínio-do-gateway>/auth/v1/health` responde com a versão do GoTrue.

## 5. Copiar os dados (restauração)

1. `db` → *Settings → Networking → TCP Proxy* → porta **5432**. Anote o endereço e a porta
   que o Railway mostrar (ex.: `xxxx.proxy.rlwy.net` e `12345`).
2. Em `infra/.env.staging`, preencha `PUBLIC_API_URL` (https do gateway), `DB_HOST` e `DB_PORT`.
3. Rodar (APAGA o destino e copia o backup; a conexão é criptografada):

   ```bash
   cd infra
   CONFIRM_RESTORE=sim bash scripts/restore-to-stack.sh backups/<data-do-backup> .env.staging
   ```

4. Conferência: o script termina com "OK: todas as contagens são iguais à origem".
5. **Remover o TCP Proxy** do `db` (o banco volta a ficar só na rede interna).

## 6. Testes no ambiente de teste

```bash
set -a; . ./.env.staging; set +a
API_URL=$PUBLIC_API_URL ANON_KEY=$ANON_KEY SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY node scripts/smoke-test.mjs
```

Depois: abrir o site (domínio do `app`) e entrar com um usuário real de cada perfil.

## 7. Backups (já no teste)

- `db` → *Settings → Backups*: agendar **diário**, **semanal** e **mensal**.
- Backup lógico semanal por `scripts/backup-supabase.sh` (aponte `SUPABASE_DB_URL` para o novo banco).

## Anti-robô e domínios

- No teste, o widget fica desligado (`NEXT_PUBLIC_CAPTCHA_DISABLED=1` e captcha desligado no `auth`).
- Na produção: gerar com `--name production --captcha on`, colar a chave secreta do Turnstile
  em `GOTRUE_SECURITY_CAPTCHA_SECRET` e incluir o domínio do site nos hostnames do widget.
