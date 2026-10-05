-- CotaFlow — módulo de programação de carregamento (substitui o caderno da
-- Logística): uma linha por carga programada, agrupada por cliente na tela.
--
-- Perfis: continua valendo app_metadata.role. 'admin' (Comercial) e
-- 'logistica' podem criar/alterar a programação; qualquer usuário logado lê.
-- A Logística só ganha escrita AQUI — nas demais tabelas segue somente
-- leitura (is_admin() da 0036 não muda).
--
-- Pra marcar o usuário da Logística (trocando o e-mail), rode:
--   update auth.users
--     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"logistica"}'
--     where email = 'logistica@exemplo.com.br';
-- O usuário precisa sair e entrar de novo pro token novo valer.

create or replace function public.can_edit_schedule()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'logistica');
$$;

create table if not exists loading_schedules (
  id uuid primary key default gen_random_uuid(),
  schedule_date date not null,
  client_name text not null,
  cargo text not null,
  -- Texto livre de propósito (ex: "28 ton", "30.000 kg"): é como o caderno
  -- funciona hoje; vira número quando o cadastro de veículos/cargas entrar.
  weight text,
  plate text,
  driver text,
  loading_time time,
  status text not null default 'programado',
  -- Opcional: nem toda operação tem cotação.
  quote_id uuid references quotes(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint loading_schedules_status_check
    check (status in ('programado', 'lavando', 'carregando', 'em_viagem'))
);

create index if not exists loading_schedules_date_idx
  on loading_schedules (schedule_date);

alter table loading_schedules enable row level security;

drop policy if exists "loading_schedules_read" on loading_schedules;
drop policy if exists "loading_schedules_write" on loading_schedules;

create policy "loading_schedules_read" on loading_schedules
  for select to authenticated using (true);
create policy "loading_schedules_write" on loading_schedules
  for all to authenticated
  using (public.can_edit_schedule())
  with check (public.can_edit_schedule());
