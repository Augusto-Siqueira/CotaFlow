-- CotaFlow — momento em que a viagem foi concluída (status "Entrega Concluída").
-- Serve para a tela Comprovantes contar os 3 dias de alerta de comprovante
-- faltando. Preenchido sozinho quando o status vira "entregue" (pela equipe ou
-- pelo envio dos comprovantes) e limpo se a carga sair desse status. As cargas
-- já concluídas antes desta migration ficam sem o campo: a tela usa a data da
-- carga no lugar.
alter table loading_schedules add column if not exists delivered_at timestamptz;

create or replace function public.loading_schedules_set_delivered_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'entregue' then
    if tg_op = 'INSERT' or old.status is distinct from 'entregue' then
      new.delivered_at := now();
    end if;
  else
    new.delivered_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists loading_schedules_delivered_at on loading_schedules;
create trigger loading_schedules_delivered_at
  before insert or update of status on loading_schedules
  for each row execute function public.loading_schedules_set_delivered_at();
