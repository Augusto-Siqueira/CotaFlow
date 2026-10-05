-- CotaFlow — cadastro de motoristas (nome + CPF).
--
-- CPF guardado só com os 11 dígitos (a tela formata). Único, pra não cadastrar
-- o mesmo motorista duas vezes. Quem altera: admin (Comercial) e logistica,
-- mesma regra de can_edit_schedule (0038); todo usuário logado lê.
create table if not exists drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cpf text not null unique,
  created_at timestamptz not null default now(),
  constraint drivers_cpf_check check (cpf ~ '^[0-9]{11}$')
);

alter table drivers enable row level security;

drop policy if exists "drivers_read" on drivers;
drop policy if exists "drivers_write" on drivers;

create policy "drivers_read" on drivers
  for select to authenticated using (true);
create policy "drivers_write" on drivers
  for all to authenticated
  using (public.can_edit_schedule())
  with check (public.can_edit_schedule());
