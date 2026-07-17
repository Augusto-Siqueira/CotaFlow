-- CotaFlow — Seção 4: Modelagem de Dados (clients, vehicles, quotes)

create extension if not exists "pgcrypto";

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  segment text,
  default_insurance_pct numeric,
  created_at timestamptz not null default now()
);

create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  axles int,
  capacity_kg numeric,
  antt_category text
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  origin text,
  destination text,
  distance_km numeric,
  vehicle_id uuid references vehicles(id),
  product text,
  nf_value numeric,
  gross_freight numeric,
  toll_cost numeric,
  insurance_pct numeric,
  insurance_value numeric,
  icms_pct numeric,
  net_freight numeric,
  full_freight numeric,
  transit_time_hours numeric,
  free_time_hours numeric,
  over_time_cost numeric,
  status text not null default 'rascunho',
  created_at timestamptz not null default now(),
  version int not null default 1
);

create index if not exists quotes_client_id_idx on quotes(client_id);
create index if not exists quotes_vehicle_id_idx on quotes(vehicle_id);

-- MVP ainda não tem autenticação (Fase 4 do roadmap trata RBAC completo).
-- RLS habilitado com policy permissiva para a chave anon poder ler/escrever
-- via o client atual. Restrinja isso assim que o RBAC/Auth entrar em cena.
alter table clients enable row level security;
alter table vehicles enable row level security;
alter table quotes enable row level security;

create policy "clients_allow_all" on clients for all using (true) with check (true);
create policy "vehicles_allow_all" on vehicles for all using (true) with check (true);
create policy "quotes_allow_all" on quotes for all using (true) with check (true);
