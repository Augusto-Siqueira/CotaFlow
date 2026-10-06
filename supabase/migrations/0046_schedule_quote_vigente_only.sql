-- CotaFlow — na programação de carregamento só dá pra vincular cotação
-- VIGENTE (nada de rascunho nem obsoleta). A tela já filtra a lista, e isto
-- barra no banco também.
--
-- Só confere quando o vínculo está sendo criado ou trocado: uma carga antiga
-- cuja cotação ficou obsoleta depois continua podendo mudar de status.
create or replace function public.check_loading_schedule_quote()
returns trigger
language plpgsql
as $$
begin
  if new.quote_id is not null
     and (tg_op = 'INSERT' or new.quote_id is distinct from old.quote_id) then
    if not exists (
      select 1 from quotes q where q.id = new.quote_id and q.status = 'vigente'
    ) then
      raise exception 'Só é possível vincular cotações vigentes à programação.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists loading_schedules_quote_vigente on loading_schedules;
create trigger loading_schedules_quote_vigente
  before insert or update on loading_schedules
  for each row execute function public.check_loading_schedule_quote();
