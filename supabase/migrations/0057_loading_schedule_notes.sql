-- CotaFlow — observações livres em cada carga da Programação.
-- Quem edita a programação grava (regra de escrita já existente na tabela).
-- O motorista vê as observações das próprias cargas no app e pode mandar uma
-- junto com o comprovante de entrega: ela fica no comprovante e é acrescentada
-- (não substitui) às observações da carga, identificada como dele.
alter table loading_schedules add column if not exists notes text;
alter table delivery_proofs add column if not exists notes text;

-- Roda com os direitos do dono porque o motorista não pode alterar a programação.
create or replace function public.delivery_proofs_append_notes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line text;
begin
  if new.notes is null or btrim(new.notes) = '' then
    return new;
  end if;
  line := 'Motorista'
    || case when new.destination <> '' then ' (' || new.destination || ')' else '' end
    || ' em ' || to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI')
    || ': ' || btrim(new.notes);
  update loading_schedules
     set notes = case
       when notes is null or btrim(notes) = '' then line
       else notes || E'\n' || line
     end
   where id = new.schedule_id;
  return new;
end;
$$;

drop trigger if exists delivery_proofs_append_notes on delivery_proofs;
create trigger delivery_proofs_append_notes
  after insert on delivery_proofs
  for each row execute function public.delivery_proofs_append_notes();
