-- CotaFlow — login obrigatório + perfis (RLS).
--
-- ANTES de rodar: faça o deploy da versão com login e crie os dois usuários
-- (Authentication > Users no painel do Supabase). Esta migration troca as
-- policies "allow_all" — depois dela, quem não estiver logado não acessa nada.
--
-- Perfis (guardados em app_metadata.role, que o usuário não consegue editar
-- pelo navegador):
--   role = 'admin'  -> Comercial: lê e altera tudo
--   (sem role)      -> Logística: só lê
--
-- Pra marcar o usuário Comercial como admin, rode (trocando o e-mail):
--   update auth.users
--     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'
--     where email = 'comercial@exemplo.com.br';
-- O usuário precisa sair e entrar de novo pro token novo valer.

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
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
    execute format('drop policy if exists %I on %I', t || '_allow_all', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('drop policy if exists %I on %I', t || '_admin_write', t);

    execute format(
      'create policy %I on %I for select to authenticated using (true)',
      t || '_read', t
    );
    execute format(
      'create policy %I on %I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_write', t
    );
  end loop;
end $$;

-- `cities` é só cache de geocodificação (preenchido sozinho quando alguém abre
-- uma cotação com cidade nova) — qualquer usuário logado precisa poder gravar,
-- inclusive a Logística, senão o mapa da cotação falharia pra ela.
drop policy if exists "cities_allow_all" on cities;
drop policy if exists "cities_authenticated_all" on cities;
create policy "cities_authenticated_all" on cities
  for all to authenticated using (true) with check (true);
