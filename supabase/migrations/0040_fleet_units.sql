-- CotaFlow — cadastro da frota própria: placas de cavalos mecânicos,
-- semi-reboques e trucks (separado de `vehicles`, que guarda só os TIPOS de
-- veículo usados nas cotações).
--
-- Quem altera: admin (Comercial) e logistica — a Logística é quem conhece a
-- frota no dia a dia (mesma regra de can_edit_schedule, da 0038). Todo
-- usuário logado lê.
create table if not exists fleet_units (
  id uuid primary key default gen_random_uuid(),
  -- Sempre maiúscula e sem hífen/espaço (ABC1D23), pra não duplicar a mesma
  -- placa escrita de dois jeitos.
  plate text not null unique,
  kind text not null,
  created_at timestamptz not null default now(),
  constraint fleet_units_kind_check
    check (kind in ('cavalo', 'semirreboque', 'truck')),
  constraint fleet_units_plate_check
    check (plate = upper(plate) and plate ~ '^[A-Z0-9]{7}$')
);

alter table fleet_units enable row level security;

drop policy if exists "fleet_units_read" on fleet_units;
drop policy if exists "fleet_units_write" on fleet_units;

create policy "fleet_units_read" on fleet_units
  for select to authenticated using (true);
create policy "fleet_units_write" on fleet_units
  for all to authenticated
  using (public.can_edit_schedule())
  with check (public.can_edit_schedule());

-- Programação: a carreta tem duas placas. `plate` (já existente) passa a ser
-- a do cavalo mecânico ou do truck; `trailer_plate` é a do semi-reboque,
-- opcional.
alter table loading_schedules add column if not exists trailer_plate text;
