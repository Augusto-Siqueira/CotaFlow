-- CotaFlow — bases da transportadora (garagens), com coordenadas exatas
-- marcadas manualmente num mapa. Usadas como opção rápida e precisa nos
-- campos Origem (base_origin) e Destino final (final_destination), em vez
-- de depender da geocodificação por nome de cidade (que resolve pro centro
-- da cidade, não pro endereço real da base).

create table if not exists company_bases (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  latitude numeric not null,
  longitude numeric not null,
  created_at timestamptz not null default now()
);

alter table company_bases enable row level security;

create policy "company_bases_allow_all" on company_bases for all using (true) with check (true);
