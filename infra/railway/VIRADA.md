# Virada: Supabase + Vercel → Railway (app.cotaflow.com.br)

O ambiente do Railway que já foi testado (6 serviços, dados reais copiados, 38 testes
de segurança) **vira o definitivo**. O sistema antigo não é desligado: ele fica de pé,
sem uso, como plano B.

## Endereços

| O quê | Endereço |
|---|---|
| Site | `https://app.cotaflow.com.br` |
| API (login, dados, fotos) | `https://api.cotaflow.com.br` |

**Atenção:** `cotaflow.com.br` e `www.cotaflow.com.br` já têm uma página de apresentação no ar
(outro servidor). **Não mexer** nesses dois registros. O DNS do domínio está no Registro.br
(servidores `*.sec.dns.br`) e o titular do domínio é quem tem acesso para criar os registros
de `app` e `api` (CNAME).

## A. Antes da janela (sem parar ninguém)

1. **DNS:** no Railway, `gateway` → *Settings → Networking → Custom Domain* → `api.cotaflow.com.br`;
   `app` → *Custom Domain* → `app.cotaflow.com.br`. O Railway mostra os registros (CNAME/TXT)
   a criar no provedor do domínio. Criar e esperar o "check" ficar verde.
2. **Anti-robô (Cloudflare Turnstile):** no widget do CotaFlow, incluir o hostname
   `app.cotaflow.com.br`. Copiar a **chave secreta** (só para o Railway, nunca no chat).
3. **Variáveis no Railway** (mudanças ficam "staged" até o **Deploy**):

| Serviço | Variável | Novo valor |
|---|---|---|
| `auth` | `API_EXTERNAL_URL` | `https://api.cotaflow.com.br` |
| `auth` | `GOTRUE_SITE_URL` e `GOTRUE_URI_ALLOW_LIST` | `https://app.cotaflow.com.br` |
| `auth` | `GOTRUE_SECURITY_CAPTCHA_ENABLED` | `true` |
| `auth` | `GOTRUE_SECURITY_CAPTCHA_SECRET` | (chave secreta do Turnstile) |
| `app` | `NEXT_PUBLIC_SUPABASE_URL` | `https://api.cotaflow.com.br` |
| `app` | `NEXT_PUBLIC_CAPTCHA_DISABLED` | **apagar a variável** |

   Depois do Deploy, o `app` é reconstruído (as `NEXT_PUBLIC_*` valem na hora da construção).
4. **Teste prévio** em `https://app.cotaflow.com.br` (ainda com os dados de teste): login, uma cotação,
   o PDF da cotação, a programação, e login de um motorista pelo CPF com foto no check-list.

## B. A janela (sistema parado: 30 a 60 minutos)

1. **Avisar** a equipe e os motoristas: parar de usar o sistema antigo.
2. **Backup final** do Supabase: `cd infra && bash scripts/backup-supabase.sh`.
3. **Abrir o banco do Railway por pouco tempo:** `db` → *Settings → Networking → TCP Proxy* (porta 5432) →
   anotar endereço e porta em `infra/.env.staging` (`DB_HOST`, `DB_PORT`).
4. **Restaurar** (apaga o destino e copia tudo, com conferência):
   `CONFIRM_RESTORE=sim bash scripts/restore-to-stack.sh backups/<o-novo-backup> .env.staging`
5. **Conferir:** "OK: todas as contagens são iguais à origem" + comparação das senhas dos usuários.
6. **Fechar o banco:** remover o TCP Proxy do `db`.
7. **Testes:** `scripts/smoke-test.mjs` contra `https://api.cotaflow.com.br`; login de cada perfil no site novo.
8. **Liberar** o endereço novo para todos.

## C. Desligar o sistema antigo (sem apagar nada)

1. Na **Vercel**, projeto do CotaFlow → *Settings → Environment Variables*: criar
   `REDIRECT_TO` = `https://app.cotaflow.com.br` e fazer um novo deploy. O site antigo passa a
   mandar todo mundo para o novo (redirecionamento temporário), e ninguém grava no banco velho por engano.
2. **Não** apagar o Supabase nem a Vercel por 2 a 4 semanas.

## Voltar atrás (se algo grave aparecer)

- Apagar `REDIRECT_TO` na Vercel e fazer novo deploy: o sistema antigo volta a atender.
- O que foi lançado no Railway **depois** da virada não existe no Supabase. Se houver volta,
  fazer antes um backup do Railway e decidir caso a caso o que copiar de volta.
- Motoristas que instalaram o app no endereço novo precisam voltar ao antigo (por isso a
  decisão de voltar tem que ser tomada nas primeiras horas).

## Depois

- Cadastrar os acessos dos ~70 motoristas (tela própria, a fazer).
- Backup externo diário (script + agendamento) e teste de restauração mensal.
- Acompanhar o consumo do plano nas primeiras semanas (créditos de US$ 20).
- Encerrar Supabase e Vercel só depois do período de segurança.
