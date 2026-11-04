-- CotaFlow — Ordens de Serviço da Manutenção (aba própria, só para salvar e
-- imprimir; por enquanto não conversa com entradas/defeitos).
-- Número de controle sequencial (Nº da OS), sem buracos: cada nova OS recebe
-- o maior número + 1 (uma sequence pularia números a cada gravação recusada).
-- A placa é escolhida da frota na
-- tela, mas fica gravada como texto: a OS é um documento histórico e continua
-- válida mesmo se o veículo sair do cadastro.
create table if not exists maintenance_service_orders (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique,
  service_date date not null,
  plate text not null check (length(trim(plate)) > 0),
  km integer check (km is null or km >= 0),
  services text not null check (length(trim(services)) > 0),
  parts text not null default '',
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists maintenance_service_orders_plate_idx on maintenance_service_orders (plate, service_date desc);
create index if not exists maintenance_service_orders_date_idx on maintenance_service_orders (service_date desc);

-- Nº da OS: o maior + 1, com trava para duas OS salvas ao mesmo tempo não
-- pegarem o mesmo número. O número não muda depois de gravado.
create or replace function public.number_maintenance_service_orders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtext('maintenance_service_orders.number'));
    select coalesce(max(number), 0) + 1 into new.number from maintenance_service_orders;
  else
    new.number := old.number;
  end if;
  return new;
end $$;
drop trigger if exists maintenance_service_orders_number on maintenance_service_orders;
create trigger maintenance_service_orders_number
  before insert or update on maintenance_service_orders
  for each row execute function public.number_maintenance_service_orders();

create or replace function public.touch_maintenance_service_orders()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists maintenance_service_orders_touch on maintenance_service_orders;
create trigger maintenance_service_orders_touch
  before update on maintenance_service_orders
  for each row execute function public.touch_maintenance_service_orders();

alter table maintenance_service_orders enable row level security;
drop policy if exists "maintenance_service_orders_read" on maintenance_service_orders;
create policy "maintenance_service_orders_read" on maintenance_service_orders
  for select to authenticated using (public.is_staff());
drop policy if exists "maintenance_service_orders_write" on maintenance_service_orders;
create policy "maintenance_service_orders_write" on maintenance_service_orders
  for all to authenticated
  using (public.can_edit_maintenance()) with check (public.can_edit_maintenance());

-- Perfis externos/restritos (0070 e 0072): bloqueados também nesta tabela.
drop policy if exists "zz_deny_portal_client" on maintenance_service_orders;
create policy "zz_deny_portal_client" on maintenance_service_orders
  as restrictive for all to authenticated
  using (not public.is_portal_client()) with check (not public.is_portal_client());
drop policy if exists "zz_deny_inspector" on maintenance_service_orders;
create policy "zz_deny_inspector" on maintenance_service_orders
  as restrictive for all to authenticated
  using (not public.is_inspector()) with check (not public.is_inspector());
