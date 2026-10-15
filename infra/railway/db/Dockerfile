# Banco do CotaFlow no Railway: a imagem do Supabase (Postgres 15 com as
# extensões e papéis que o login, a API e as fotos esperam) + dois scripts de
# inicialização (senhas dos papéis e segredo do token). Roda só na 1ª vez, com
# o volume vazio.
FROM supabase/postgres:15.8.1.060

COPY roles.sql /docker-entrypoint-initdb.d/init-scripts/99-roles.sql
COPY jwt.sql /docker-entrypoint-initdb.d/init-scripts/99-jwt.sql

# Conexão criptografada (TLS). A imagem vem com SSL desligado; sem isso, a
# restauração pelo "TCP Proxy" público do Railway trafegaria sem criptografia.
# O certificado é gerado AQUI, no build (um diferente por build, fora do git).
RUN mkdir -p /etc/postgresql/ssl  && openssl req -new -x509 -days 3650 -nodes -subj "/CN=cotaflow-db"       -out /etc/postgresql/ssl/server.crt -keyout /etc/postgresql/ssl/server.key  && chown -R postgres:postgres /etc/postgresql/ssl  && chmod 700 /etc/postgresql/ssl  && chmod 600 /etc/postgresql/ssl/server.key

CMD ["postgres", "-D", "/etc/postgresql",      "-c", "ssl=on",      "-c", "ssl_cert_file=/etc/postgresql/ssl/server.crt",      "-c", "ssl_key_file=/etc/postgresql/ssl/server.key"]
