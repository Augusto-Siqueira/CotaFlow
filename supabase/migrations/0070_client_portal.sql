-- CotaFlow — portal do cliente (perfil "cliente"): uma pessoa de fora (ex.: Btech)
-- vê SÓ os comprovantes de entrega das empresas ligadas ao usuário dela.
--
-- Segurança em camadas:
--  1. O perfil cliente deixa de contar como "equipe" (is_staff).
--  2. Toda tabela do schema public e o armazenamento de arquivos ganham uma
--     regra RESTRITIVA que nega qualquer acesso ao perfil cliente (mesmo onde a
--     leitura é liberada a qualquer usuário logado).
--  3. Os dados do portal saem só pela função client_portal_loads(), que filtra
--     pelas empresas do usuário e devolve apenas os campos combinados.
--  4. As fotos ficam num armazenamento separado (client-proofs), com uma pasta
--     por empresa, só com cópias das fotos dos comprovantes; quem entrega o
--     link é o servidor do CotaFlow, depois de conferir a empresa.

-- Empresas (como aparecem na Programação) que cada usuário cliente enxerga.
create table if not exists client_portal_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  client_name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_name)
);
-- RLS sem nenhuma regra = ninguém lê pelo navegador (só o servidor, com a chave de serviço).
alter table client_portal_links enable row level security;

create or replace function public.is_portal_client()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'cliente';
$$;

-- "Equipe" = qualquer perfil logado, menos motorista e cliente.
create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('motorista', 'cliente');
$$;

-- Regra restritiva em TODAS as tabelas do schema public: o perfil cliente não
-- lê nem grava nada diretamente. (Tabela criada depois desta migration precisa
-- da mesma regra; o teste infra/scripts/smoke-portal.mjs confere todas.)
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop policy if exists "zz_deny_portal_client" on public.%I', t.tablename);
    execute format(
      'create policy "zz_deny_portal_client" on public.%I as restrictive for all to authenticated using (not public.is_portal_client()) with check (not public.is_portal_client())',
      t.tablename
    );
  end loop;
end $$;

-- Arquivos: o cliente também não lista, lê nem envia nada diretamente.
drop policy if exists "zz_deny_portal_client" on storage.objects;
create policy "zz_deny_portal_client" on storage.objects
  as restrictive for all to authenticated
  using (not public.is_portal_client())
  with check (not public.is_portal_client());

-- Armazenamento separado com as cópias das fotos dos comprovantes (uma pasta por empresa).
insert into storage.buckets (id, name, public)
values ('client-proofs', 'client-proofs', false)
on conflict (id) do nothing;

-- Funções de apoio do app que rodam com permissão ampliada: fechadas para o cliente.
create or replace function public.fleet_plates()
returns table(plate text, kind text)
language sql
stable security definer
set search_path to 'public'
as $$
  select plate, kind from fleet_units where not public.is_portal_client() order by plate;
$$;

create or replace function public.fuel_last_km(p_plate text)
returns integer
language sql
stable security definer
set search_path to 'public'
as $$
  select max(odometer_km) from fuel_entries
  where plate = upper(btrim(p_plate)) and not public.is_portal_client();
$$;

create or replace function public.my_driver_labels()
returns setof text
language sql
stable security definer
set search_path to 'public'
as $$
  select coalesce(nullif(trim(nickname), ''), name) from drivers where user_id = auth.uid() and not public.is_portal_client()
  union
  select name from drivers where user_id = auth.uid() and not public.is_portal_client();
$$;

-- Dados do portal: cargas em viagem ou concluídas das empresas do usuário, com os
-- comprovantes já enviados. Só os campos combinados com a Transbochnia (nada de
-- frete, cotação ou observações internas da equipe).
create or replace function public.client_portal_loads(p_from date, p_to date)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare result jsonb;
begin
  if not public.is_portal_client() then
    raise exception 'Acesso restrito ao portal do cliente.' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(row_to_json(x) order by x.schedule_date desc, x.id), '[]'::jsonb)
    into result
  from (
    select
      ls.id,
      ls.schedule_date,
      ls.client_name,
      ls.destination,
      ls.plate,
      ls.trailer_plate,
      ls.driver,
      ls.status,
      ls.delivered_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', dp.id,
          'destination', dp.destination,
          'client_name', dp.client_name,
          'invoice_number', dp.invoice_number,
          'cte_number', dp.cte_number,
          'invoice_weight_kg', dp.invoice_weight_kg,
          'unloaded_weight_kg', dp.unloaded_weight_kg,
          'notes', dp.notes,
          'created_at', dp.created_at,
          'photo_count', coalesce(array_length(dp.photos, 1), 0)
        ) order by dp.created_at)
        from delivery_proofs dp
        where dp.schedule_id = ls.id
      ), '[]'::jsonb) as proofs
    from loading_schedules ls
    where ls.client_name in (select l.client_name from client_portal_links l where l.user_id = auth.uid())
      and ls.status in ('em_viagem', 'entregue')
      and ls.schedule_date between p_from and p_to
  ) x;
  return result;
end;
$$;

revoke all on function public.client_portal_loads(date, date) from public;
grant execute on function public.client_portal_loads(date, date) to authenticated;
