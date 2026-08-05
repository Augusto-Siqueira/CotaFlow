-- CotaFlow — Cotação em lote (múltiplos destinos/rotas agrupados sob um
-- mesmo pedido do cliente). Cada rota do lote continua sendo um registro
-- normal em `quotes` (via `batch_id`) — só o que é constante para o lote
-- inteiro (cliente, produto, ICMS, seguro, free time, over time) vive em
-- `quote_batches`.

create table if not exists quote_batches (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id),
  label text,
  product text,
  icms_pct numeric,
  insurance_pct numeric,
  parana_rule boolean not null default false,
  free_time_hours numeric,
  over_time_rate numeric,
  created_at timestamptz not null default now()
);

alter table quotes add column if not exists batch_id uuid references quote_batches(id) on delete cascade;
alter table quotes add column if not exists min_load_ton numeric;

create index if not exists quotes_batch_id_idx on quotes(batch_id);

alter table quote_batches enable row level security;

create policy "quote_batches_allow_all" on quote_batches for all using (true) with check (true);
