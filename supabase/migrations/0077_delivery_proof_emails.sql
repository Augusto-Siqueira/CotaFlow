-- CotaFlow — registro dos e-mails de comprovante enviados pelo CotaFlow (Gmail),
-- com as fotos anexadas. Quem grava é o servidor (chave de serviço), depois de
-- enviar; a equipe só lê.
create table if not exists delivery_proof_emails (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null references delivery_proofs(id) on delete cascade,
  schedule_id uuid not null references loading_schedules(id) on delete cascade,
  sent_by uuid,
  sent_by_name text,
  to_addresses text[] not null,
  cc_addresses text[] not null default '{}',
  subject text not null,
  attachments integer not null default 0,
  message_id text,
  sent_at timestamptz not null default now()
);
create index if not exists delivery_proof_emails_proof_idx on delivery_proof_emails (proof_id, sent_at desc);

alter table delivery_proof_emails enable row level security;
drop policy if exists "delivery_proof_emails_read" on delivery_proof_emails;
create policy "delivery_proof_emails_read" on delivery_proof_emails
  for select to authenticated using (public.is_staff());

-- Perfis externos/restritos (0070 e 0072): bloqueados também nesta tabela.
drop policy if exists "zz_deny_portal_client" on delivery_proof_emails;
create policy "zz_deny_portal_client" on delivery_proof_emails
  as restrictive for all to authenticated
  using (not public.is_portal_client()) with check (not public.is_portal_client());
drop policy if exists "zz_deny_inspector" on delivery_proof_emails;
create policy "zz_deny_inspector" on delivery_proof_emails
  as restrictive for all to authenticated
  using (not public.is_inspector()) with check (not public.is_inspector());
