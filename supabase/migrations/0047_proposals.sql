-- CotaFlow — Propostas Comerciais: HTML gerado fora (no Claude) e guardado
-- aqui, com um link próprio pra enviar ao cliente, que abre SEM login e só lê.
--
-- Segurança:
--  * A tabela só é acessível ao admin (Comercial). Visitante sem login NUNCA
--    lê a tabela direto; só consegue abrir UMA proposta, pelo código do link,
--    através da função open_proposal (security definer).
--  * O código (token) é aleatório (48 caracteres hex) — impossível de adivinhar.
--  * Link pode ser desativado ou ter validade; a função só devolve proposta
--    ativa e dentro da validade.
--  * Cada abertura soma na contagem e atualiza primeira/última visualização.
create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client_name text,
  html text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  active boolean not null default true,
  expires_at date,
  view_count integer not null default 0,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table proposals enable row level security;

drop policy if exists "proposals_admin_all" on proposals;
create policy "proposals_admin_all" on proposals
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.open_proposal(p_token text)
returns table (title text, client_name text, html text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r proposals%rowtype;
begin
  select * into r
  from proposals p
  where p.token = p_token
    and p.active
    and (p.expires_at is null or p.expires_at >= current_date);

  if not found then
    return;
  end if;

  update proposals
    set view_count = view_count + 1,
        first_viewed_at = coalesce(first_viewed_at, now()),
        last_viewed_at = now()
    where id = r.id;

  return query select r.title, r.client_name, r.html;
end;
$$;

revoke all on function public.open_proposal(text) from public;
grant execute on function public.open_proposal(text) to anon, authenticated;
