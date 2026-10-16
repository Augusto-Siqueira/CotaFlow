-- CotaFlow — bloco de notas da Programação: um texto livre por dia,
-- compartilhado pela equipe. Quem edita a programação escreve; a equipe lê.
-- O motorista não vê.

create table if not exists schedule_day_notes (
  schedule_date date primary key,
  body text not null default '',
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table schedule_day_notes enable row level security;

drop policy if exists "schedule_day_notes_read" on schedule_day_notes;
drop policy if exists "schedule_day_notes_insert" on schedule_day_notes;
drop policy if exists "schedule_day_notes_update" on schedule_day_notes;

create policy "schedule_day_notes_read" on schedule_day_notes
  for select to authenticated using (public.is_staff());
create policy "schedule_day_notes_insert" on schedule_day_notes
  for insert to authenticated with check (public.can_edit_schedule());
create policy "schedule_day_notes_update" on schedule_day_notes
  for update to authenticated
  using (public.can_edit_schedule())
  with check (public.can_edit_schedule());
