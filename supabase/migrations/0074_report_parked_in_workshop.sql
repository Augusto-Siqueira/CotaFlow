-- CotaFlow — defeito que entra em "Em oficina" fica com gravidade 3 (Parado),
-- venha da triagem, de agendada ou lançado direto na oficina.
create or replace function public.maintenance_reports_parked()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'em_oficina' and (tg_op = 'INSERT' or old.status is distinct from 'em_oficina') then
    new.severity := 3;
  end if;
  return new;
end;
$$;

drop trigger if exists maintenance_reports_parked on maintenance_reports;
create trigger maintenance_reports_parked
  before insert or update of status on maintenance_reports
  for each row execute function public.maintenance_reports_parked();

-- Os que já estão na oficina também passam a Parado.
update maintenance_reports set severity = 3 where status = 'em_oficina' and severity <> 3;
