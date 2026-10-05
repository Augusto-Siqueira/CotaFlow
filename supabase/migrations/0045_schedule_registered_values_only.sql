-- CotaFlow — a programação de carregamento só aceita dados cadastrados:
-- cliente (nome fantasia, ou razão social se não houver fantasia), placa do
-- cavalo/truck e do semi-reboque (frota) e motorista (apelido, ou nome se não
-- houver apelido). A tela já valida, mas isto barra no banco também, pra
-- nada fora do cadastro entrar por nenhum caminho.
--
-- Só confere o campo que está sendo inserido ou alterado: mexer só no status
-- de uma carga antiga (lançada antes desta regra) continua funcionando.
create or replace function public.check_loading_schedule_registered()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.client_name is distinct from old.client_name then
    if not exists (
      select 1 from clients c
      where lower(coalesce(nullif(btrim(c.trade_name), ''), c.name)) = lower(btrim(new.client_name))
    ) then
      raise exception 'Cliente não cadastrado: %', new.client_name;
    end if;
  end if;

  if new.plate is not null
     and (tg_op = 'INSERT' or new.plate is distinct from old.plate) then
    if not exists (
      select 1 from fleet_units f
      where f.plate = upper(btrim(new.plate)) and f.kind <> 'semirreboque'
    ) then
      raise exception 'Placa do cavalo/truck não cadastrada na frota: %', new.plate;
    end if;
  end if;

  if new.trailer_plate is not null
     and (tg_op = 'INSERT' or new.trailer_plate is distinct from old.trailer_plate) then
    if not exists (
      select 1 from fleet_units f
      where f.plate = upper(btrim(new.trailer_plate)) and f.kind = 'semirreboque'
    ) then
      raise exception 'Placa do semi-reboque não cadastrada na frota: %', new.trailer_plate;
    end if;
  end if;

  if new.driver is not null
     and (tg_op = 'INSERT' or new.driver is distinct from old.driver) then
    if not exists (
      select 1 from drivers d
      where lower(coalesce(nullif(btrim(d.nickname), ''), d.name)) = lower(btrim(new.driver))
    ) then
      raise exception 'Motorista não cadastrado: %', new.driver;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists loading_schedules_registered_values on loading_schedules;
create trigger loading_schedules_registered_values
  before insert or update on loading_schedules
  for each row execute function public.check_loading_schedule_registered();
