-- CotaFlow — comprovante "já enviado por e-mail" visível no portal do cliente.
--
-- 1. delivery_proof_emails.manual: a equipe pode registrar que o comprovante
--    foi enviado por fora do CotaFlow (Outlook etc.). Fica no mesmo registro dos
--    envios, com manual = true e sem destinatários/anexos.
-- 2. client_portal_loads passa a devolver, em cada comprovante, a data do
--    primeiro envio (emailed_at) e se foi marcado à mão (emailed_manual), para
--    o cliente diferenciar os comprovantes que já recebeu por e-mail.

alter table delivery_proof_emails add column if not exists manual boolean not null default false;

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
          'photo_count', coalesce(array_length(dp.photos, 1), 0),
          'emailed_at', (select min(e.sent_at) from delivery_proof_emails e where e.proof_id = dp.id),
          'emailed_manual', coalesce((
            select e.manual from delivery_proof_emails e where e.proof_id = dp.id order by e.sent_at limit 1
          ), false)
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
