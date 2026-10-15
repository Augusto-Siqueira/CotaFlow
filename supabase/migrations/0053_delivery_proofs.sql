-- CotaFlow — comprovante de entrega lançado pelo motorista no app.
--
-- Um comprovante por destino da carga: nome do cliente, nota fiscal, peso da NF,
-- peso descarregado (ambos em QUILOS, como saem na NF e no ticket) e fotos do
-- canhoto e do ticket de pesagem (obrigatória pelo menos uma).
--
-- O motorista só lança (não edita) e só nas próprias cargas; a equipe lê tudo e
-- quem edita a programação pode apagar um comprovante lançado errado (o
-- motorista então lança de novo).

create table if not exists delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references loading_schedules(id) on delete cascade,
  -- Destino da carga ("" quando a carga não tem destino informado).
  destination text not null default '',
  client_name text not null,
  invoice_number text not null,
  invoice_weight_kg numeric(12, 2) not null,
  unloaded_weight_kg numeric(12, 2) not null,
  photos text[] not null,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint delivery_proofs_unique_destination unique (schedule_id, destination),
  constraint delivery_proofs_photos_required check (cardinality(photos) >= 1),
  constraint delivery_proofs_text_required
    check (btrim(client_name) <> '' and btrim(invoice_number) <> ''),
  constraint delivery_proofs_weights_positive
    check (invoice_weight_kg > 0 and unloaded_weight_kg > 0)
);

create index if not exists delivery_proofs_schedule_idx on delivery_proofs (schedule_id);

alter table delivery_proofs enable row level security;

drop policy if exists "delivery_proofs_staff_read" on delivery_proofs;
drop policy if exists "delivery_proofs_driver_read" on delivery_proofs;
drop policy if exists "delivery_proofs_driver_insert" on delivery_proofs;
drop policy if exists "delivery_proofs_staff_delete" on delivery_proofs;

create policy "delivery_proofs_staff_read" on delivery_proofs
  for select to authenticated using (public.is_staff());

create policy "delivery_proofs_driver_read" on delivery_proofs
  for select to authenticated
  using (public.is_driver() and user_id = auth.uid());

-- O subselect respeita a leitura do motorista em loading_schedules: só passa
-- se a carga for dele.
create policy "delivery_proofs_driver_insert" on delivery_proofs
  for insert to authenticated
  with check (
    public.is_driver()
    and user_id = auth.uid()
    and schedule_id in (select id from loading_schedules)
  );

create policy "delivery_proofs_staff_delete" on delivery_proofs
  for delete to authenticated using (public.can_edit_schedule());
