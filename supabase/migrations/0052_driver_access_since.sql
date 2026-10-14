-- CotaFlow — v1.07 (ajuste): todos os motoristas com acesso ao app têm o
-- dever de fazer o check-list. Para a aderência não cobrar dias anteriores ao
-- acesso, guardamos desde quando cada motorista tem login.
--
-- `app_access_since` é preenchido sozinho quando o motorista é vinculado a um
-- usuário (drivers.user_id deixa de ser nulo) e zerado se o vínculo sair.

alter table drivers add column if not exists app_access_since date;

create or replace function public.drivers_access_since()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is not null and (old.user_id is null or new.app_access_since is null) then
    new.app_access_since := coalesce(new.app_access_since, current_date);
  elsif new.user_id is null then
    new.app_access_since := null;
  end if;
  return new;
end;
$$;

drop trigger if exists drivers_access_since on drivers;
create trigger drivers_access_since
  before update on drivers
  for each row execute function public.drivers_access_since();

-- Quem já está vinculado (ex.: o motorista de teste) passa a contar desde hoje.
update drivers
  set app_access_since = current_date
  where user_id is not null and app_access_since is null;
