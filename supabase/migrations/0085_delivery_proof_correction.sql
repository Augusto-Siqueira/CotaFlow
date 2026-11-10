-- CotaFlow — correção do comprovante de entrega pela equipe.
--
-- O motorista às vezes lança errado (peso da NF, número da nota, CT-e). Quem
-- edita a Programação pode corrigir os dados digitados no comprovante; as
-- fotos, a carga e o destino não mudam por aqui. Fica registrado quem
-- corrigiu e quando.
--
-- Tabela que já tem as políticas restritivas do portal e do inspetor (0070 e
-- 0072): a política nova só amplia o acesso da equipe.

alter table delivery_proofs add column if not exists corrected_at timestamptz;
alter table delivery_proofs add column if not exists corrected_by uuid;
alter table delivery_proofs add column if not exists corrected_by_name text;

drop policy if exists "delivery_proofs_staff_update" on delivery_proofs;
create policy "delivery_proofs_staff_update" on delivery_proofs
  for update to authenticated
  using (public.can_edit_schedule())
  with check (public.can_edit_schedule());

-- Correção feita por alguém logado (pelo site): só os dados digitados mudam,
-- e fica a marca de quem corrigiu. O servidor (sem usuário, ex.: apagar foto)
-- continua livre.
create or replace function public.delivery_proofs_correction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.schedule_id := old.schedule_id;
  new.destination := old.destination;
  new.user_id := old.user_id;
  new.photos := old.photos;
  new.created_at := old.created_at;
  new.received_at := old.received_at;
  if (new.client_name, new.invoice_number, new.cte_number, new.invoice_weight_kg, new.unloaded_weight_kg)
     is distinct from
     (old.client_name, old.invoice_number, old.cte_number, old.invoice_weight_kg, old.unloaded_weight_kg) then
    new.corrected_at := now();
    new.corrected_by := auth.uid();
    new.corrected_by_name := coalesce(
      nullif(auth.jwt() -> 'user_metadata' ->> 'name', ''),
      auth.jwt() ->> 'email'
    );
  else
    new.corrected_at := old.corrected_at;
    new.corrected_by := old.corrected_by;
    new.corrected_by_name := old.corrected_by_name;
  end if;
  return new;
end;
$$;

drop trigger if exists delivery_proofs_correction on delivery_proofs;
create trigger delivery_proofs_correction
  before update on delivery_proofs
  for each row execute function public.delivery_proofs_correction();
