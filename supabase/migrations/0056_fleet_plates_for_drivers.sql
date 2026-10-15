-- CotaFlow — o motorista não lê a tabela da frota (fechada na 0051), mas
-- precisa escolher a placa ao relatar um defeito. Esta função devolve SÓ a
-- placa e o tipo de cada unidade, para qualquer usuário logado.
create or replace function public.fleet_plates()
returns table (plate text, kind text)
language sql
stable
security definer
set search_path = public
as $$
  select plate, kind from fleet_units order by plate;
$$;

revoke all on function public.fleet_plates() from public, anon;
grant execute on function public.fleet_plates() to authenticated;
