-- CotaFlow — quando uma carga recebe o comprovante de TODOS os destinos, o status
-- passa sozinho para "Entrega Concluída" e fica pendente o encerramento do MDF-e
-- (alerta na Programação até o programador marcar como encerrado).
--
--   mdfe_required   : o alerta foi gerado (todos os comprovantes chegaram);
--   mdfe_closed_at  : quando o programador encerrou o MDF-e (some o alerta).

alter table loading_schedules add column if not exists mdfe_required boolean not null default false;
alter table loading_schedules add column if not exists mdfe_closed_at timestamptz;

-- Roda com os direitos do dono da tabela porque quem insere o comprovante é o
-- motorista, que não pode alterar a programação.
create or replace function public.delivery_proofs_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  needed text[];
begin
  -- Destinos da carga ("" quando a carga não tem destino informado).
  select array_agg(btrim(d))
    into needed
    from unnest(string_to_array(
      coalesce((select destination from loading_schedules where id = new.schedule_id), ''),
      ';'
    )) as d
    where btrim(d) <> '';
  if needed is null then
    needed := array[''];
  end if;

  -- Ainda falta algum destino: nada a fazer.
  if exists (
    select 1
    from unnest(needed) as d
    where not exists (
      select 1 from delivery_proofs p
      where p.schedule_id = new.schedule_id and p.destination = d
    )
  ) then
    return new;
  end if;

  -- Só gera o alerta uma vez: se o MDF-e já foi encerrado, não reabre.
  update loading_schedules
     set status = 'entregue',
         mdfe_required = (mdfe_required or mdfe_closed_at is null)
   where id = new.schedule_id;
  return new;
end;
$$;

drop trigger if exists delivery_proofs_complete on delivery_proofs;
create trigger delivery_proofs_complete
  after insert on delivery_proofs
  for each row execute function public.delivery_proofs_complete();
