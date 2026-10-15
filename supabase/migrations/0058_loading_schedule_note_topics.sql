-- CotaFlow — observações da carga em TÓPICOS: cada observação lançada é uma
-- linha própria, com origem (equipe ou motorista) e data/hora.
--
-- Substitui o texto único loading_schedules.notes (0057). A coluna antiga fica
-- só para não quebrar a versão anterior do site durante o deploy; o conteúdo
-- dela é convertido aqui (uma linha = um tópico) e ela deixa de ser usada.

create table if not exists loading_schedule_notes (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references loading_schedules(id) on delete cascade,
  body text not null check (btrim(body) <> ''),
  -- 'equipe' (Programação) ou 'motorista' (enviada com o comprovante).
  source text not null default 'equipe' check (source in ('equipe', 'motorista')),
  -- Destino do comprovante, quando veio do motorista.
  destination text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists loading_schedule_notes_schedule_idx
  on loading_schedule_notes (schedule_id, created_at);

alter table loading_schedule_notes enable row level security;

drop policy if exists "schedule_notes_staff_read" on loading_schedule_notes;
drop policy if exists "schedule_notes_driver_read" on loading_schedule_notes;
drop policy if exists "schedule_notes_insert" on loading_schedule_notes;
drop policy if exists "schedule_notes_delete" on loading_schedule_notes;

create policy "schedule_notes_staff_read" on loading_schedule_notes
  for select to authenticated using (public.is_staff());
-- O subselect respeita a leitura do motorista em loading_schedules: só as cargas dele.
create policy "schedule_notes_driver_read" on loading_schedule_notes
  for select to authenticated
  using (public.is_driver() and schedule_id in (select id from loading_schedules));
create policy "schedule_notes_insert" on loading_schedule_notes
  for insert to authenticated
  with check (public.can_edit_schedule() and source = 'equipe');
create policy "schedule_notes_delete" on loading_schedule_notes
  for delete to authenticated using (public.can_edit_schedule());

-- Converte o texto antigo: cada linha vira um tópico (as do motorista ficam como 'motorista').
insert into loading_schedule_notes (schedule_id, body, source, created_by, created_at)
select s.id,
       btrim(l.line),
       case when btrim(l.line) like 'Motorista%' then 'motorista' else 'equipe' end,
       null,
       now() + (l.n * interval '1 millisecond')
  from loading_schedules s
  cross join lateral unnest(string_to_array(s.notes, E'\n')) with ordinality as l(line, n)
 where s.notes is not null
   and btrim(l.line) <> ''
   and not exists (select 1 from loading_schedule_notes x where x.schedule_id = s.id);

-- A observação do motorista no comprovante vira um tópico (antes era acrescentada ao texto).
create or replace function public.delivery_proofs_append_notes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.notes is null or btrim(new.notes) = '' then
    return new;
  end if;
  insert into loading_schedule_notes (schedule_id, body, source, destination, created_by)
  values (new.schedule_id, btrim(new.notes), 'motorista', nullif(new.destination, ''), new.user_id);
  return new;
end;
$$;
