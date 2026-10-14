-- Senhas dos papéis internos (a imagem os cria sem senha utilizável).
-- Roda uma única vez, na criação do volume do banco.
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
