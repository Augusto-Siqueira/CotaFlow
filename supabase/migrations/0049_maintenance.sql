-- CotaFlow — módulo de manutenção da frota (v1.05): oficinas cadastradas e
-- uma ordem de manutenção por entrada de placa na oficina.
--
-- Perfis: 'admin' (Comercial) e 'manutencao' lançam e alteram; qualquer
-- usuário logado lê (a Programação precisa ver quais placas estão paradas).
--
-- Pra marcar o usuário da Manutenção (trocando o e-mail), rode:
--   update auth.users
--     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"manutencao"}'
--     where email = 'manutencao@exemplo.com.br';
-- O usuário precisa sair e entrar de novo pro token novo valer.

create or replace function public.can_edit_maintenance()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'manutencao');
$$;

-- Oficinas: lista fechada (não é texto livre), cadastrada pela Manutenção.
create table if not exists maintenance_workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint maintenance_workshops_name_check check (length(trim(name)) > 0)
);
create unique index if not exists maintenance_workshops_name_key
  on maintenance_workshops (lower(trim(name)));

create table if not exists maintenance_orders (
  id uuid primary key default gen_random_uuid(),
  -- Só placas da frota cadastrada.
  plate text not null references fleet_units(plate) on update cascade,
  workshop_id uuid not null references maintenance_workshops(id),
  service_type text not null,
  service text not null,
  -- Pode ser retroativa (o responsável esqueceu de lançar).
  entry_at timestamptz not null,
  expected_exit_at timestamptz,
  -- Nulo = placa ainda em manutenção.
  exit_at timestamptz,
  odometer_km integer,
  cost numeric(12, 2),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint maintenance_orders_type_check
    check (service_type in ('preventiva', 'corretiva')),
  constraint maintenance_orders_exit_check
    check (exit_at is null or exit_at >= entry_at),
  constraint maintenance_orders_km_check
    check (odometer_km is null or odometer_km >= 0),
  constraint maintenance_orders_cost_check
    check (cost is null or cost >= 0)
);

create index if not exists maintenance_orders_plate_idx
  on maintenance_orders (plate, entry_at desc);
create index if not exists maintenance_orders_open_idx
  on maintenance_orders (plate) where exit_at is null;
create index if not exists maintenance_orders_entry_idx
  on maintenance_orders (entry_at desc);

alter table maintenance_workshops enable row level security;
alter table maintenance_orders enable row level security;

drop policy if exists "maintenance_workshops_read" on maintenance_workshops;
drop policy if exists "maintenance_workshops_write" on maintenance_workshops;
drop policy if exists "maintenance_orders_read" on maintenance_orders;
drop policy if exists "maintenance_orders_write" on maintenance_orders;

create policy "maintenance_workshops_read" on maintenance_workshops
  for select to authenticated using (true);
create policy "maintenance_workshops_write" on maintenance_workshops
  for all to authenticated
  using (public.can_edit_maintenance())
  with check (public.can_edit_maintenance());

create policy "maintenance_orders_read" on maintenance_orders
  for select to authenticated using (true);
create policy "maintenance_orders_write" on maintenance_orders
  for all to authenticated
  using (public.can_edit_maintenance())
  with check (public.can_edit_maintenance());

-- Uma placa só pode ter UMA manutenção em aberto por vez.
create unique index if not exists maintenance_orders_one_open
  on maintenance_orders (plate) where exit_at is null;
