-- CotaFlow — ordem dos clientes na Programação (blocos arrastáveis).
-- Uma ordem só, para todos os dias e para toda a equipe. Cliente sem posição
-- aparece depois dos posicionados, na ordem de horário de antes.

create table if not exists schedule_client_order (
  client_name text primary key,
  position integer not null,
  updated_at timestamptz not null default now()
);

alter table schedule_client_order enable row level security;

drop policy if exists "schedule_client_order_read" on schedule_client_order;
drop policy if exists "schedule_client_order_write" on schedule_client_order;

create policy "schedule_client_order_read" on schedule_client_order
  for select to authenticated using (public.is_staff());
create policy "schedule_client_order_write" on schedule_client_order
  for all to authenticated
  using (public.can_edit_schedule())
  with check (public.can_edit_schedule());
