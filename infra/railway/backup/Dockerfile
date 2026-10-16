# Serviço de backup: Node (sem dependências) + pg_dump. O banco é Postgres 15;
# o cliente 17 consegue copiar bancos de versões anteriores.
FROM node:22-alpine

RUN apk add --no-cache postgresql17-client

WORKDIR /app
COPY server.mjs .
USER node
CMD ["node", "server.mjs"]
