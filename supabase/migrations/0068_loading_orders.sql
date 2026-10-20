-- CotaFlow — Ordem de embarque (Btech São José dos Pinhais): as linhas da ordem
-- ficam junto da carga da Programação e o PDF é gerado na hora (sempre com a
-- placa, o motorista e a data atuais da carga).
--
-- lines = lista de até 6 linhas:
--   { oc, nature, compartments, tons, city, uf }
-- A mesma OC repete nas linhas do mesmo produto.
--
-- Quem altera: logística e admin (can_edit_schedule). Quem lê: a equipe e o
-- motorista da carga (a leitura de loading_schedules já só deixa o motorista
-- enxergar as cargas dele).
create table if not exists loading_orders (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null unique references loading_schedules(id) on delete cascade,
  lines jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint loading_orders_lines_check
    check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) <= 6)
);

alter table loading_orders enable row level security;

drop policy if exists "loading_orders_staff_read" on loading_orders;
drop policy if exists "loading_orders_driver_read" on loading_orders;
drop policy if exists "loading_orders_write" on loading_orders;

create policy "loading_orders_staff_read" on loading_orders
  for select to authenticated using (public.is_staff());

create policy "loading_orders_driver_read" on loading_orders
  for select to authenticated
  using (public.is_driver() and schedule_id in (select id from loading_schedules));

create policy "loading_orders_write" on loading_orders
  for all to authenticated
  using (public.can_edit_schedule())
  with check (public.can_edit_schedule());
