-- CotaFlow — a equipe anexa o comprovante quando o motorista não lançou na estrada.
--
-- Quem edita a Programação (logística e admin) pode incluir o comprovante de um
-- destino, com os mesmos dados do app do motorista. O comprovante fica no nome
-- do motorista da carga (user_id), e posted_by guarda quem da equipe anexou.
-- A observação entra nas observações da carga como "Equipe", não "Motorista".
--
-- Tabela que já tem as políticas restritivas do portal e do inspetor (0070 e
-- 0072): a política nova só amplia o acesso da equipe.

alter table delivery_proofs add column if not exists posted_by uuid;
alter table delivery_proofs add column if not exists posted_by_name text;

drop policy if exists "delivery_proofs_staff_insert" on delivery_proofs;
create policy "delivery_proofs_staff_insert" on delivery_proofs
  for insert to authenticated
  with check (public.can_edit_schedule());

-- Marca quem da equipe anexou (o motorista nunca passa por aqui como equipe).
create or replace function public.delivery_proofs_posted_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_driver() then
    new.posted_by := null;
    new.posted_by_name := null;
    return new;
  end if;
  new.posted_by := auth.uid();
  new.posted_by_name := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
    auth.jwt() ->> 'email'
  );
  return new;
end;
$$;

drop trigger if exists delivery_proofs_posted_by on delivery_proofs;
create trigger delivery_proofs_posted_by
  before insert on delivery_proofs
  for each row execute function public.delivery_proofs_posted_by();

-- Observação do comprovante nas observações da carga: "Equipe" quando anexado
-- pela equipe.
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
  line := case when new.posted_by is not null then 'Equipe' else 'Motorista' end
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
