-- CotaFlow — Seção 4 / 5.6: fracionado (múltiplas entregas com rateio proporcional)

create table if not exists quote_deliveries (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  destination text not null,
  weight_kg numeric not null,
  freight_share_pct numeric,
  freight_value numeric
);

create index if not exists quote_deliveries_quote_id_idx on quote_deliveries(quote_id);

alter table quote_deliveries enable row level security;

create policy "quote_deliveries_allow_all" on quote_deliveries for all using (true) with check (true);
