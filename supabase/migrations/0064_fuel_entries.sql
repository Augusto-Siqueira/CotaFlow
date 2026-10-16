-- CotaFlow — abastecimentos lançados pelo motorista no app (substitui a folha
-- mensal de papel: diesel e ARLA) e perfil 'abastecimento', que acompanha e
-- corrige os lançamentos.
--
-- Regras da folha:
--   * foto do odômetro obrigatória em todo abastecimento;
--   * valor R$/litro e posto só fora do pátio (posto externo);
--   * "completou o tanque?" marca os abastecimentos que fecham a média (km/l),
--     calculada na tela: km desde o último tanque cheio da placa ÷ litros desde então.

create or replace function public.can_edit_fuel()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'abastecimento');
$$;

create table if not exists fuel_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  -- Nome do motorista no momento do lançamento (o cadastro pode mudar depois).
  driver_name text,
  plate text not null references fleet_units(plate) on update cascade,
  fuel_type text not null check (fuel_type in ('diesel', 'arla')),
  fueled_at timestamptz not null default now(),
  location_type text not null check (location_type in ('patio', 'externo')),
  -- Nome/cidade do posto (fora do pátio).
  location text,
  price_per_liter numeric(10, 3),
  liters numeric(10, 2) not null check (liters > 0),
  odometer_km integer not null check (odometer_km > 0),
  full_tank boolean not null default false,
  photos text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  edited_by uuid,
  constraint fuel_entries_photo_required check (cardinality(photos) >= 1),
  constraint fuel_entries_external_needs_details check (
    location_type = 'patio'
    or (
      price_per_liter is not null and price_per_liter > 0
      and coalesce(btrim(location), '') <> ''
    )
  )
);

create index if not exists fuel_entries_plate_idx on fuel_entries (plate, fuel_type, fueled_at);
create index if not exists fuel_entries_day_idx on fuel_entries (fueled_at desc);
create index if not exists fuel_entries_user_idx on fuel_entries (user_id, fueled_at desc);

alter table fuel_entries enable row level security;

drop policy if exists "fuel_entries_staff_read" on fuel_entries;
drop policy if exists "fuel_entries_driver_read" on fuel_entries;
drop policy if exists "fuel_entries_driver_insert" on fuel_entries;
drop policy if exists "fuel_entries_edit" on fuel_entries;
drop policy if exists "fuel_entries_delete" on fuel_entries;

create policy "fuel_entries_staff_read" on fuel_entries
  for select to authenticated using (public.is_staff());
create policy "fuel_entries_driver_read" on fuel_entries
  for select to authenticated using (public.is_driver() and user_id = auth.uid());
create policy "fuel_entries_driver_insert" on fuel_entries
  for insert to authenticated
  with check (public.is_driver() and user_id = auth.uid());
create policy "fuel_entries_edit" on fuel_entries
  for update to authenticated
  using (public.can_edit_fuel())
  with check (public.can_edit_fuel());
create policy "fuel_entries_delete" on fuel_entries
  for delete to authenticated using (public.can_edit_fuel());

-- Último km registrado da placa (de qualquer motorista), para o app avisar
-- quando o km digitado for menor. Só devolve o número.
create or replace function public.fuel_last_km(p_plate text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select max(odometer_km) from fuel_entries where plate = upper(btrim(p_plate));
$$;

revoke all on function public.fuel_last_km(text) from public, anon;
grant execute on function public.fuel_last_km(text) to authenticated;
