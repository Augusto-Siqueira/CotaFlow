-- CotaFlow — v1.06: defeitos relatados (ocorrências) da frota, com triagem.
--
-- Fluxo: Triagem -> Agendada -> Em oficina -> Concluída (ou Recusada na
-- triagem). "Em oficina" é a ordem de manutenção (maintenance_orders, 0049):
-- quando a placa é liberada na ordem, o defeito ligado a ela conclui sozinho.
--
-- Severidade: 1 = pode rodar, 2 = atenção, 3 = veículo parado. Parado
-- bloqueia o início de viagem na Programação (como estar na oficina); as
-- outras só geram alerta.
--
-- Quem relata: Manutenção, Comercial (admin) e Logística. Quem decide
-- (agendar, recusar, dar entrada, excluir): Manutenção e Comercial. Todo
-- usuário logado lê.

create table if not exists maintenance_reports (
  id uuid primary key default gen_random_uuid(),
  plate text not null references fleet_units(plate) on update cascade,
  category text not null,
  severity smallint not null,
  description text not null,
  status text not null default 'triagem',
  -- De onde veio o relato (hoje só 'manual'; o app do motorista virá depois).
  source text not null default 'manual',
  reported_at timestamptz not null default now(),
  reported_by uuid default auth.uid(),
  -- Quando foi agendada a entrada na oficina (status 'agendada').
  scheduled_for timestamptz,
  workshop_id uuid references maintenance_workshops(id),
  -- Ordem de manutenção criada quando a placa entra na oficina.
  order_id uuid references maintenance_orders(id) on delete set null,
  -- Início da etapa atual (para medir o tempo em cada etapa).
  stage_since timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint maintenance_reports_category_check
    check (category in ('Freios', 'Motor', 'Elétrica', 'Pneus', 'Suspensão', 'Cabine', 'Carroceria', 'Outros')),
  constraint maintenance_reports_severity_check check (severity between 1 and 3),
  constraint maintenance_reports_status_check
    check (status in ('triagem', 'agendada', 'em_oficina', 'concluida', 'recusada')),
  constraint maintenance_reports_source_check
    check (source in ('manual', 'motorista', 'checklist')),
  constraint maintenance_reports_description_check
    check (length(trim(description)) > 0)
);

create index if not exists maintenance_reports_plate_idx
  on maintenance_reports (plate, reported_at desc);
create index if not exists maintenance_reports_open_idx
  on maintenance_reports (status)
  where status in ('triagem', 'agendada', 'em_oficina');

-- Mudou de etapa: reinicia o relógio da etapa e marca o fechamento.
create or replace function public.maintenance_reports_stage()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.stage_since := now();
    if new.status in ('concluida', 'recusada') then
      new.closed_at := coalesce(new.closed_at, now());
    else
      new.closed_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_reports_stage on maintenance_reports;
create trigger maintenance_reports_stage
  before update on maintenance_reports
  for each row execute function public.maintenance_reports_stage();

-- Placa liberada na ordem: conclui os defeitos ligados a ela.
create or replace function public.maintenance_order_released()
returns trigger
language plpgsql
as $$
begin
  if new.exit_at is not null and old.exit_at is null then
    update maintenance_reports
      set status = 'concluida', closed_at = new.exit_at
      where order_id = new.id and status = 'em_oficina';
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_order_released on maintenance_orders;
create trigger maintenance_order_released
  after update on maintenance_orders
  for each row execute function public.maintenance_order_released();

-- Ordem excluída antes de liberar: o defeito volta para a triagem.
create or replace function public.maintenance_order_deleted()
returns trigger
language plpgsql
as $$
begin
  update maintenance_reports
    set status = 'triagem', order_id = null
    where order_id = old.id and status = 'em_oficina';
  return old;
end;
$$;

drop trigger if exists maintenance_order_deleted on maintenance_orders;
create trigger maintenance_order_deleted
  before delete on maintenance_orders
  for each row execute function public.maintenance_order_deleted();

alter table maintenance_reports enable row level security;

drop policy if exists "maintenance_reports_read" on maintenance_reports;
drop policy if exists "maintenance_reports_insert" on maintenance_reports;
drop policy if exists "maintenance_reports_update" on maintenance_reports;
drop policy if exists "maintenance_reports_delete" on maintenance_reports;

create policy "maintenance_reports_read" on maintenance_reports
  for select to authenticated using (true);
create policy "maintenance_reports_insert" on maintenance_reports
  for insert to authenticated
  with check (public.can_edit_maintenance() or public.can_edit_schedule());
create policy "maintenance_reports_update" on maintenance_reports
  for update to authenticated
  using (public.can_edit_maintenance())
  with check (public.can_edit_maintenance());
create policy "maintenance_reports_delete" on maintenance_reports
  for delete to authenticated
  using (public.can_edit_maintenance());
