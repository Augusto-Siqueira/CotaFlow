-- CotaFlow — KM Btech: CT-e recebidos (XML do ERP).
--
-- Cada XML de CT-e da Btech que chega (pelo e-mail do ERP ou enviado à mão)
-- vira uma linha aqui. O servidor procura a viagem em aberto da placa (cavalo
-- ou carreta) e grava o CT-e como entrega da viagem; o que não encaixa fica
-- "sem_viagem" para a equipe escolher a viagem. CT-e de outros clientes não é
-- guardado.
--
-- status:
--   vinculado  : virou entrega de uma viagem (trip_id/delivery_id);
--   sem_viagem : nenhuma viagem (ou mais de uma) bate; reason diz o porquê;
--   descartado : a equipe marcou que não entra no KM;
--   cancelado  : chegou o evento de cancelamento do CT-e.

create table if not exists km_cte_inbox (
  id uuid primary key default gen_random_uuid(),
  access_key text not null unique check (access_key ~ '^[0-9]{44}$'),
  number text not null,
  series text,
  issued_at timestamptz,
  cte_type smallint not null default 0,         -- tpCTe: 0 normal, 1 complementar, 3 substituto
  sender_cnpj text,
  client text not null,                         -- recebedor/destinatário curto + cidade (igual à importação manual)
  nf text,
  freight numeric,                              -- frete peso (sem pedágio)
  weight_kg numeric,
  tractor_plate text,                           -- placa do cavalo/caminhão (ObsCont PLACA)
  trailer_plate text,                           -- carreta (observações)
  driver_cpf text,
  status text not null default 'sem_viagem' check (status in ('vinculado', 'sem_viagem', 'descartado', 'cancelado')),
  reason text,
  trip_id uuid references km_trips(id) on delete set null,
  delivery_id uuid references km_deliveries(id) on delete set null,
  linked_by text,                               -- 'automático' ou o nome de quem vinculou
  linked_at timestamptz,
  source text not null default 'manual' check (source in ('email', 'manual')),
  email_message_id text,
  xml text not null,
  received_at timestamptz not null default now()
);

create index if not exists km_cte_inbox_status_idx on km_cte_inbox (status, issued_at desc);
create index if not exists km_cte_inbox_trip_idx on km_cte_inbox (trip_id);

alter table km_cte_inbox enable row level security;

drop policy if exists km_cte_inbox_read on km_cte_inbox;
create policy km_cte_inbox_read on km_cte_inbox for select to authenticated using (public.can_edit_schedule());
drop policy if exists km_cte_inbox_write on km_cte_inbox;
create policy km_cte_inbox_write on km_cte_inbox for all to authenticated
  using (public.can_edit_schedule()) with check (public.can_edit_schedule());
drop policy if exists zz_deny_portal_client on km_cte_inbox;
create policy zz_deny_portal_client on km_cte_inbox as restrictive for all to authenticated
  using (not public.is_portal_client()) with check (not public.is_portal_client());
drop policy if exists zz_deny_inspector on km_cte_inbox;
create policy zz_deny_inspector on km_cte_inbox as restrictive for all to authenticated
  using (not public.is_inspector()) with check (not public.is_inspector());

notify pgrst, 'reload schema';
