-- CotaFlow — autocompletar de cidades nos campos de rota
-- Cada cidade digitada nos campos de rota/entregas é salva aqui, para sugerir
-- o nome completo já na próxima cotação (busca por prefixo via datalist).

create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists cities_name_idx on cities(name);

alter table cities enable row level security;

create policy "cities_allow_all" on cities for all using (true) with check (true);
