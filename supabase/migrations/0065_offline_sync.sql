-- CotaFlow — app do motorista offline.
--
-- 1) received_at: quando o lançamento CHEGOU ao servidor. Com a fila offline, a
--    data/hora do lançamento passa a ser a do preenchimento (campos que já
--    existem: fueled_at, started/finished_at, reported_at, created_at); aqui fica
--    a hora do envio, para ver quanto o item demorou e desconfiar de relógio errado.
-- 2) driver_sync_issues: itens que o servidor RECUSOU depois de o motorista tê-los
--    salvo sem sinal (placa fora da frota, destino já enviado por outra pessoa...).
--    O motorista resolve no próprio app; a equipe vê o aviso aqui.

alter table fuel_entries add column if not exists received_at timestamptz not null default now();
alter table driver_checklists add column if not exists received_at timestamptz not null default now();
alter table maintenance_reports add column if not exists received_at timestamptz not null default now();
alter table delivery_proofs add column if not exists received_at timestamptz not null default now();

create table if not exists driver_sync_issues (
  -- Mesmo código do item da fila do celular: reenviar o aviso não duplica.
  id uuid primary key,
  user_id uuid not null default auth.uid(),
  driver_name text,
  kind text not null check (kind in ('abastecimento', 'defeito', 'comprovante', 'checklist')),
  summary text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  -- Como foi resolvido: corrigido e enviado, descartado pelo motorista ou tratado pela equipe.
  resolution text check (resolution in ('enviado', 'descartado', 'tratado'))
);

create index if not exists driver_sync_issues_open_idx
  on driver_sync_issues (created_at desc) where resolved_at is null;

alter table driver_sync_issues enable row level security;

drop policy if exists "driver_sync_issues_insert" on driver_sync_issues;
drop policy if exists "driver_sync_issues_driver_read" on driver_sync_issues;
drop policy if exists "driver_sync_issues_staff_read" on driver_sync_issues;
drop policy if exists "driver_sync_issues_resolve" on driver_sync_issues;
drop policy if exists "driver_sync_issues_driver_resolve" on driver_sync_issues;

create policy "driver_sync_issues_insert" on driver_sync_issues
  for insert to authenticated
  with check (public.is_driver() and user_id = auth.uid());
create policy "driver_sync_issues_driver_read" on driver_sync_issues
  for select to authenticated using (public.is_driver() and user_id = auth.uid());
create policy "driver_sync_issues_staff_read" on driver_sync_issues
  for select to authenticated using (public.is_staff());
-- Quem cuida da área do item marca como tratado.
create policy "driver_sync_issues_resolve" on driver_sync_issues
  for update to authenticated
  using (public.can_edit_schedule() or public.can_edit_fuel() or public.can_edit_maintenance())
  with check (public.can_edit_schedule() or public.can_edit_fuel() or public.can_edit_maintenance());
-- O motorista fecha o próprio aviso quando corrige e envia, ou descarta o item.
create policy "driver_sync_issues_driver_resolve" on driver_sync_issues
  for update to authenticated
  using (public.is_driver() and user_id = auth.uid())
  with check (public.is_driver() and user_id = auth.uid());
