-- CotaFlow — Rota como lista flexível de paradas (estilo Qualp), substitui
-- os 3 grupos fixos de "pontos de passagem" (waypoints_origin_coleta/
-- coleta_entrega/entrega_destino) e a tabela de entrega fracionada
-- (quote_deliveries) por uma única lista ordenada por cotação.
--
-- Origem (base_origin) e Destino final (final_destination) continuam como
-- campos fixos em `quotes` — só o que ficava "engessado" em Coleta/Entrega
-- obrigatórios + 3 grupos de waypoint vira uma lista livre aqui. Cada parada
-- pode opcionalmente carregar peso/participação na NF (o que hoje só existia
-- em `quote_deliveries`, mas ali desvinculado de posição na rota).
--
-- Cotações antigas (criadas antes desta migration) ficam congeladas: não têm
-- linha em `quote_stops`, e o código continua lendo delas o formato antigo
-- (origin/destination obrigatórios + waypoints_* + quote_deliveries). A
-- presença de linhas aqui é o que diferencia "cotação no formato novo" de
-- "cotação antiga" — não precisa de coluna de versão extra.
create table if not exists quote_stops (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  position int not null,
  address text not null,
  lat numeric,
  lng numeric,
  weight_kg numeric,
  nf_share_pct numeric,
  created_at timestamptz not null default now(),
  unique (quote_id, position)
);

create index if not exists quote_stops_quote_id_idx on quote_stops(quote_id);

alter table quote_stops enable row level security;

drop policy if exists "quote_stops_allow_all" on quote_stops;
create policy "quote_stops_allow_all" on quote_stops for all using (true) with check (true);
