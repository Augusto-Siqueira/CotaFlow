-- CotaFlow — pedágio automático pela API da WikiRota (retomado em 11/2026).
--
-- Cada consulta paga à WikiRota (R$ por requisição, plano Professional) fica
-- guardada aqui. A mesma rota (pontos arredondados a ~100 m) com os mesmos
-- eixos, nos últimos 30 dias, usa o resultado guardado sem consultar de novo.
-- A contagem do mês (billed = true) mostra o consumo na tela de cotação.
-- Só o servidor grava (service role); comercial e admin leem.

create table if not exists toll_estimates (
  id uuid primary key default gen_random_uuid(),
  cache_key text not null,
  provider text not null default 'wikirota',
  points jsonb not null,            -- [{ lat, lng, label }]
  axles integer not null check (axles between 2 and 12),
  total numeric not null,
  tolls jsonb not null default '[]'::jsonb,
  distance_km numeric,
  billed boolean not null default true,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists toll_estimates_key_idx on toll_estimates (cache_key, created_at desc);
create index if not exists toll_estimates_month_idx on toll_estimates (created_at) where billed;

alter table toll_estimates enable row level security;
drop policy if exists toll_estimates_read on toll_estimates;
create policy toll_estimates_read on toll_estimates for select to authenticated using (public.can_edit_commercial());
drop policy if exists zz_deny_portal_client on toll_estimates;
create policy zz_deny_portal_client on toll_estimates as restrictive for all to authenticated
  using (not public.is_portal_client()) with check (not public.is_portal_client());
drop policy if exists zz_deny_inspector on toll_estimates;
create policy zz_deny_inspector on toll_estimates as restrictive for all to authenticated
  using (not public.is_inspector()) with check (not public.is_inspector());

notify pgrst, 'reload schema';
