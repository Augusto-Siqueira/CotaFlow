-- CotaFlow — v1.07: app do motorista (perfil 'motorista', check-list diário,
-- defeitos com foto) e fechamento do acesso aos dados comerciais.
--
-- IMPORTANTE (segurança): até aqui, "todo usuário logado lê" quase tudo
-- (cotações, preços, CPF de motoristas...). Com o perfil motorista isso não
-- pode valer: as leituras abaixo passam a exigir public.is_staff() (qualquer
-- perfil MENOS motorista). O motorista só lê:
--   * o próprio cadastro (drivers.user_id = ele);
--   * as cargas em que ele é o motorista (loading_schedules.driver);
--   * os relatos de defeito e check-lists que ele mesmo criou.
--
-- Criar o acesso de um motorista (exemplo de teste), em 2 passos:
--  1) Authentication > Users > Add user (Auto Confirm User marcado):
--       e-mail  : <CPF só números>@motorista.transbochnia.com.br
--       senha   : (inicial, mínimo 6 caracteres)
--  2) SQL Editor (troque o CPF):
--       update auth.users
--         set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"motorista"}',
--             raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"must_change_password":true}'
--         where email = '12345678901@motorista.transbochnia.com.br';
--       update drivers
--         set user_id = (select id from auth.users where email = '12345678901@motorista.transbochnia.com.br')
--         where cpf = '12345678901';
--  O motorista entra com o CPF e a senha inicial e é obrigado a trocar a senha.

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'motorista';
$$;

create or replace function public.is_driver()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'motorista';
$$;

-- Vínculo motorista (cadastro) <-> usuário de login.
alter table drivers add column if not exists user_id uuid unique
  references auth.users(id) on delete set null;

-- Como o motorista aparece na programação (apelido, ou o nome se não houver).
create or replace function public.my_driver_labels()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(nickname), ''), name) from drivers where user_id = auth.uid()
  union
  select name from drivers where user_id = auth.uid();
$$;

-- 1) Leitura só para a equipe (todos os perfis, exceto motorista).
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'vehicles', 'quotes', 'quote_deliveries', 'quote_stops',
    'quote_batches', 'antt_coefficients', 'company_bases', 'icms_rates',
    'toll_axle_categories', 'toll_plazas', 'toll_tariffs',
    'fleet_units', 'drivers', 'loading_schedules',
    'maintenance_workshops', 'maintenance_orders', 'maintenance_reports'
  ]
  loop
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format(
      'create policy %I on %I for select to authenticated using (public.is_staff())',
      t || '_read', t
    );
  end loop;
end $$;

-- 2) O que o motorista pode ler.
drop policy if exists "drivers_self_read" on drivers;
create policy "drivers_self_read" on drivers
  for select to authenticated
  using (public.is_driver() and user_id = auth.uid());

drop policy if exists "loading_schedules_driver_read" on loading_schedules;
create policy "loading_schedules_driver_read" on loading_schedules
  for select to authenticated
  using (public.is_driver() and driver in (select public.my_driver_labels()));

-- 3) Defeitos: fotos e relato pelo motorista.
alter table maintenance_reports add column if not exists photos text[] not null default '{}';

drop policy if exists "maintenance_reports_insert" on maintenance_reports;
create policy "maintenance_reports_insert" on maintenance_reports
  for insert to authenticated
  with check (
    public.can_edit_maintenance()
    or public.can_edit_schedule()
    or (
      public.is_driver()
      and reported_by = auth.uid()
      and source in ('motorista', 'checklist')
      and status = 'triagem'
    )
  );

drop policy if exists "maintenance_reports_driver_read" on maintenance_reports;
create policy "maintenance_reports_driver_read" on maintenance_reports
  for select to authenticated
  using (public.is_driver() and reported_by = auth.uid());

-- 4) Itens do check-list (editáveis pela Manutenção).
create table if not exists checklist_items (
  id text primary key,
  stage text not null,
  text text not null,
  periodicity text not null default 'Diária',
  -- Categoria do defeito gerado se o motorista marcar "Problema".
  category text not null,
  position integer not null,
  active boolean not null default true,
  constraint checklist_items_category_check
    check (category in ('Freios', 'Motor', 'Elétrica', 'Pneus', 'Suspensão', 'Cabine', 'Carroceria', 'Outros'))
);

alter table checklist_items enable row level security;
drop policy if exists "checklist_items_read" on checklist_items;
drop policy if exists "checklist_items_write" on checklist_items;
create policy "checklist_items_read" on checklist_items
  for select to authenticated using (true);
create policy "checklist_items_write" on checklist_items
  for all to authenticated
  using (public.can_edit_maintenance())
  with check (public.can_edit_maintenance());

insert into checklist_items (id, stage, text, periodicity, category, position) values
  ('a1', 'Etapa A · Antes de funcionar o veículo', 'Verificação completa ao redor do veículo — está tudo OK?', 'Diária', 'Outros', 1),
  ('a2', 'Etapa A · Antes de funcionar o veículo', 'Água do radiador verificada e no nível correto?', 'Diária', 'Motor', 2),
  ('a3', 'Etapa A · Antes de funcionar o veículo', 'Óleo do motor dentro dos limites da vareta?', 'Diária', 'Motor', 3),
  ('a4', 'Etapa A · Antes de funcionar o veículo', 'Sistema elétrico operando? (luz de freio, pisca, ré, faróis)', 'Diária', 'Elétrica', 4),
  ('a5', 'Etapa A · Antes de funcionar o veículo', 'Pneus com pressão correta e em perfeitas condições, inclusive o socorro?', 'Diária', 'Pneus', 5),
  ('a6', 'Etapa A · Antes de funcionar o veículo', 'Veículo isento de vazamentos? (óleo, água, ar, combustível)', 'Diária', 'Motor', 6),
  ('a7', 'Etapa A · Antes de funcionar o veículo', 'Parafusos das rodas corretamente fixados?', 'Semanal', 'Pneus', 7),
  ('a8', 'Etapa A · Antes de funcionar o veículo', 'Pino rei e quinta roda em perfeitas condições?', 'Diária', 'Suspensão', 8),
  ('a9', 'Etapa A · Antes de funcionar o veículo', 'Extintores perfeitos? (vencimento, lacre, pressão)', 'Semanal', 'Outros', 9),
  ('a10', 'Etapa A · Antes de funcionar o veículo', 'Documentação do veículo a bordo e dentro da validade?', 'Semanal', 'Outros', 10),
  ('b1', 'Etapa B · Logo após funcionar o veículo', 'Freios funcionando corretamente?', 'Diária', 'Freios', 11),
  ('b2', 'Etapa B · Logo após funcionar o veículo', 'Motor, caixa e diferencial sem ruídos anormais?', 'Diária', 'Motor', 12),
  ('b3', 'Etapa B · Logo após funcionar o veículo', 'Pressão do óleo do motor dentro dos limites?', 'Diária', 'Motor', 13),
  ('k1', 'Etapa B · Logo após funcionar o veículo', 'Regulagem de freios em dia? (mín. semanal ou a cada 2.000 km)', '2.000 km', 'Freios', 14)
on conflict (id) do nothing;

-- 5) Check-lists respondidos.
create table if not exists driver_checklists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  plate text references fleet_units(plate) on update cascade,
  trailer_plate text references fleet_units(plate) on update cascade,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  -- { "a1": "ok" | "prob" | "na" }
  answers jsonb not null,
  -- { "a1": "texto do problema" }
  notes jsonb not null default '{}'::jsonb,
  -- { "a1": ["caminho/da/foto.jpg"] }
  photos jsonb not null default '{}'::jsonb,
  nonconformities integer not null default 0,
  lat double precision,
  lon double precision,
  created_at timestamptz not null default now()
);

create index if not exists driver_checklists_day_idx on driver_checklists (finished_at desc);
create index if not exists driver_checklists_user_idx on driver_checklists (user_id, finished_at desc);

alter table driver_checklists enable row level security;
drop policy if exists "driver_checklists_read" on driver_checklists;
drop policy if exists "driver_checklists_insert" on driver_checklists;
create policy "driver_checklists_read" on driver_checklists
  for select to authenticated
  using (public.is_staff() or user_id = auth.uid());
create policy "driver_checklists_insert" on driver_checklists
  for insert to authenticated
  with check (public.is_driver() and user_id = auth.uid());

-- 6) Fotos (bucket privado). Cada motorista grava na própria pasta (id dele).
insert into storage.buckets (id, name, public)
values ('driver-photos', 'driver-photos', false)
on conflict (id) do nothing;

drop policy if exists "driver_photos_insert" on storage.objects;
drop policy if exists "driver_photos_read_own" on storage.objects;
drop policy if exists "driver_photos_read_staff" on storage.objects;

create policy "driver_photos_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'driver-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "driver_photos_read_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'driver-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "driver_photos_read_staff" on storage.objects
  for select to authenticated
  using (bucket_id = 'driver-photos' and public.is_staff());
