-- CotaFlow — perfis fixos e administração de usuários pela plataforma.
--
-- Perfis (app_metadata.role, um por pessoa):
--   admin       tudo + tela Usuários (criar, mudar perfil, bloquear, senha)
--   comercial   edita a parte comercial (cotações, propostas, clientes, tabelas)
--   logistica   edita a Programação
--   manutencao  edita a Manutenção
--   motorista   só o app do motorista
--
-- Até aqui a parte comercial exigia 'admin' (a 0036 chamava o Comercial de
-- admin). Agora ela aceita admin e comercial.

create or replace function public.can_edit_commercial()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'comercial');
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'vehicles', 'quotes', 'quote_deliveries', 'quote_stops',
    'quote_batches', 'antt_coefficients', 'company_bases', 'icms_rates',
    'toll_axle_categories', 'toll_plazas', 'toll_tariffs'
  ]
  loop
    execute format('drop policy if exists %I on %I', t || '_admin_write', t);
    execute format(
      'create policy %I on %I for all to authenticated using (public.can_edit_commercial()) with check (public.can_edit_commercial())',
      t || '_admin_write', t
    );
  end loop;
end $$;

drop policy if exists "proposals_admin_all" on proposals;
create policy "proposals_admin_all" on proposals
  for all to authenticated
  using (public.can_edit_commercial())
  with check (public.can_edit_commercial());

-- Registro do que o admin fez nos usuários (gravado pelo servidor do site).
create table if not exists user_admin_log (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  action text not null,
  target_id uuid,
  target_email text,
  details jsonb not null default '{}'::jsonb
);

alter table user_admin_log enable row level security;
drop policy if exists "user_admin_log_read" on user_admin_log;
create policy "user_admin_log_read" on user_admin_log
  for select to authenticated using (public.is_admin());
-- Sem política de escrita: só o servidor (chave de serviço) grava.
