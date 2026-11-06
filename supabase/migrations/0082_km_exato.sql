-- CotaFlow — KM Exato (controle de km do contrato dedicado Btech), trazido do
-- app avulso feito no claude.ai. Cada tabela espelha uma coleção do app:
--   cfg/geral  -> km_settings (regras), km_equipment_types (tipos), km_fleet
--                 (frota dedicada + saldo de abertura), km_tariffs (tabelas por
--                 vigência), km_routes (rotas do contrato), km_config_log
--   hist       -> km_history_trips (controle anterior, uma linha por viagem)
--   viagens    -> km_trips + km_deliveries + km_trip_log
--   acertos    -> km_settlements
--   abonos     -> km_waivers
-- Os cálculos (saldo, compensação, produtividade) ficam no código
-- (src/lib/kmExato), iguais aos do app original, a partir destas linhas.
--
-- Acesso (Fase 1): leitura e lançamento de viagens/entregas para quem edita a
-- programação (admin e logística); regras, tarifas, frota, rotas, acertos e
-- abonos só admin. A consulta da Btech pelo portal entra na Fase 3.

create table if not exists km_settings (
  id integer primary key default 1 check (id = 1),
  min_km_month numeric not null default 8000,        -- metaKm (cl. 5.4)
  comp_max_km numeric not null default 600,          -- compMax
  deviation_limit numeric not null default 0.1,      -- limite (fração)
  proof_deadline_days integer not null default 1,    -- prazoComp
  open_alert_days integer not null default 10,       -- diasAberta
  estimate_factor numeric not null default 1,        -- fator
  min_km_policy text not null default 'registrar' check (min_km_policy in ('registrar', 'cobrar')),
  return_factor numeric not null default 0.92,       -- retorno (valor do km do piso)
  updated_at timestamptz not null default now()
);

create table if not exists km_equipment_types (
  id text primary key,          -- 'bitruck', 'c30', 'c38'
  name text not null,
  axles integer,
  position integer not null default 0
);

create table if not exists km_fleet (
  plate text primary key check (plate = upper(plate) and plate ~ '^[A-Z0-9]{7}$'),
  type_id text not null references km_equipment_types(id),
  opening_balance numeric not null default 0,   -- saldo de abertura (controle anterior)
  position integer not null default 0,
  active boolean not null default true
);

create table if not exists km_tariffs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  valid_from date not null unique,
  method text not null check (method in ('km', 'piso')),
  reference text,
  -- { "bitruck": { "km": 6.6227, "cc": 789.96, "ccd": 6.8986 }, ... }
  values jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists km_routes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  km numeric not null check (km > 0),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists km_config_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  by_user uuid default auth.uid(),
  by_name text,
  action text not null
);

-- Controle anterior: linhas resumidas da planilha (não têm entregas detalhadas).
create table if not exists km_history_trips (
  id uuid primary key default gen_random_uuid(),
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  position integer not null default 0,
  loaded_on date not null,
  plate text not null,
  km_est numeric,
  km_billed numeric,
  km_real numeric,
  value_per_km numeric,
  diff_value numeric,
  destinations text,
  deliveries_count integer
);
create index if not exists km_history_trips_plate_idx on km_history_trips (plate, loaded_on);

create table if not exists km_trips (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,                 -- id no app original (ex: 2026-10-23_TBR3G59)
  plate text not null,
  type_id text references km_equipment_types(id),
  tractor_plate text,                    -- cavalo (quando a placa controlada é a carreta)
  mode text not null default 'dedicado' check (mode in ('dedicado', 'rota', 'spot')),
  route_name text,
  loaded_on date not null,
  km_est numeric,
  km_route numeric,
  km_comp numeric,
  km_billed numeric,
  odo_out numeric,
  odo_in numeric,
  status text not null default 'aberta' check (status in ('aberta', 'fechada', 'cancelada')),
  closed_at timestamptz,
  reason text,
  reason_note text,
  origin text,                           -- 'controle anterior' nas importadas
  cte_base text,
  freight_cte numeric,                   -- frete do CT-e no nível da viagem (importadas)
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists km_trips_plate_idx on km_trips (plate, loaded_on);
create index if not exists km_trips_loaded_idx on km_trips (loaded_on desc);

create table if not exists km_deliveries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references km_trips(id) on delete cascade,
  legacy_id text,
  position integer not null default 0,
  client text not null,
  nf text,
  cte text,
  weight_kg numeric,
  freight_cte numeric,
  delivered_on date,
  proof_sent boolean not null default false,
  proof_sent_at timestamptz,
  proof_sent_by uuid,
  proof_before boolean not null default false,   -- enviado ainda no controle anterior
  proof_file text,                               -- caminho no storage (Fase 2)
  created_at timestamptz not null default now()
);
create index if not exists km_deliveries_trip_idx on km_deliveries (trip_id, position);

create table if not exists km_trip_log (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references km_trips(id) on delete cascade,
  at timestamptz not null default now(),
  by_user uuid default auth.uid(),
  by_name text,
  action text not null
);
create index if not exists km_trip_log_trip_idx on km_trip_log (trip_id, at);

create table if not exists km_settlements (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  settled_on date not null,
  plate text,                       -- null = geral
  paid_to text,                     -- 'Transbochnia' | 'Btech' | null (ajuste)
  value numeric,
  effect numeric,                   -- efeito no saldo (negativo = a favor da Transbochnia)
  note text,
  origin text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists km_waivers (
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  plate text not null,
  reason text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (month, plate)
);

create or replace function public.touch_km_trips()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists km_trips_touch on km_trips;
create trigger km_trips_touch before update on km_trips
  for each row execute function public.touch_km_trips();

-- Políticas: leitura para admin/logística; escrita conforme a tabela.
do $$
declare
  t text;
  writer text;
begin
  foreach t in array array[
    'km_settings', 'km_equipment_types', 'km_fleet', 'km_tariffs', 'km_routes',
    'km_config_log', 'km_history_trips', 'km_trips', 'km_deliveries',
    'km_trip_log', 'km_settlements', 'km_waivers'
  ] loop
    writer := case
      when t in ('km_trips', 'km_deliveries', 'km_trip_log') then 'public.can_edit_schedule()'
      when t = 'km_config_log' then 'public.can_edit_schedule()'
      else 'public.is_admin()'
    end;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to authenticated using (public.can_edit_schedule())', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_write', t);
    execute format('create policy %I on %I for all to authenticated using (%s) with check (%s)', t || '_write', t, writer, writer);
    execute format('drop policy if exists zz_deny_portal_client on %I', t);
    execute format('create policy zz_deny_portal_client on %I as restrictive for all to authenticated using (not public.is_portal_client()) with check (not public.is_portal_client())', t);
    execute format('drop policy if exists zz_deny_inspector on %I', t);
    execute format('create policy zz_deny_inspector on %I as restrictive for all to authenticated using (not public.is_inspector()) with check (not public.is_inspector())', t);
  end loop;
end $$;
