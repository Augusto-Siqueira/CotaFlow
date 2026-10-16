-- CotaFlow — observações da carga:
--  * o motorista NÃO vê as anotações da equipe, só as que ele mesmo mandou;
--  * quem edita a programação pode corrigir o texto de um tópico (fica a data
--    da última edição em edited_at).

alter table loading_schedule_notes add column if not exists edited_at timestamptz;

drop policy if exists "schedule_notes_driver_read" on loading_schedule_notes;
create policy "schedule_notes_driver_read" on loading_schedule_notes
  for select to authenticated
  using (public.is_driver() and source = 'motorista' and created_by = auth.uid());

drop policy if exists "schedule_notes_update" on loading_schedule_notes;
create policy "schedule_notes_update" on loading_schedule_notes
  for update to authenticated
  using (public.can_edit_schedule())
  with check (public.can_edit_schedule());
