# Gateway: um endereço público só para o site (como era o do Supabase),
# repassando /rest/v1, /auth/v1 e /storage/v1 para os serviços internos.
FROM caddy:2-alpine

COPY Caddyfile /etc/caddy/Caddyfile
