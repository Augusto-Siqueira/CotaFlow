-- CotaFlow — CIOT dos agregados (Etapa 2: CIOT por viagem).
--
-- Cada linha é a "declaração de CIOT" que hoje é digitada nas 10 telas do
-- e-Frete. Contratado, veículos e motorista vêm dos cadastros (migration
-- 0080); aqui ficam só os dados da viagem, os valores e, depois de gerado no
-- e-Frete, o número do CIOT. Enquanto a API do e-Frete não é ligada, a tela
-- monta a ficha pronta para copiar e a Logística registra o número.
--
-- mode 'viagem' = um CIOT por carga da programação (schedule_id).
-- mode 'mensal' fica reservado para a Etapa 3 (um CIOT por veículo por mês).
--
-- Dados de pagamento e valores: leitura e escrita só can_edit_schedule
-- (admin e logística), como os cadastros de agregados.

-- Destinatário do CIOT vem do cadastro de clientes: endereço e telefone.
alter table clients
  add column if not exists street text,
  add column if not exists number text,
  add column if not exists complement text,
  add column if not exists district text,
  add column if not exists cep text,
  add column if not exists city text,
  add column if not exists phone text;

create table if not exists ciots (
  id uuid primary key default gen_random_uuid(),
  mode text not null default 'viagem' check (mode in ('viagem', 'mensal')),
  schedule_id uuid references loading_schedules(id) on delete set null,
  agregado_id uuid not null references agregados(id) on delete restrict,
  driver_id uuid references drivers(id) on delete set null,
  plates text[] not null default '{}',
  recipient_client_id uuid references clients(id) on delete set null,
  -- Viagem e carga
  trip_start date,
  trip_end date,
  origin text,
  destination text,
  distance_km numeric check (distance_km is null or distance_km >= 0),
  packaging text,
  weight_kg numeric check (weight_kg is null or weight_kg >= 0),
  cargo_code text,          -- natureza da carga (código NCM usado no e-Frete)
  cargo_description text,
  antt_cargo_type text,     -- tipo de carga da tabela ANTT (piso mínimo)
  high_performance boolean not null default false,
  empty_return boolean not null default false,
  vehicle_composition boolean not null default false,
  -- Notas fiscais: [{ "number": "1158080", "date": "2026-11-05", "value": 0 }]
  invoices jsonb not null default '[]'::jsonb,
  -- Valores
  freight_value numeric check (freight_value is null or freight_value >= 0),
  toll_value numeric not null default 0 check (toll_value >= 0),
  fuel_value numeric not null default 0 check (fuel_value >= 0),
  insurance_value numeric not null default 0 check (insurance_value >= 0),
  irrf numeric not null default 0 check (irrf >= 0),
  inss numeric not null default 0 check (inss >= 0),
  sest_senat numeric not null default 0 check (sest_senat >= 0),
  issqn numeric not null default 0 check (issqn >= 0),
  other_taxes numeric not null default 0 check (other_taxes >= 0),
  other_taxes_desc text,
  -- Pagamento (parcela única)
  payment_date date,
  payment_value numeric check (payment_value is null or payment_value >= 0),
  -- Resultado
  status text not null default 'rascunho' check (status in ('rascunho', 'emitido', 'cancelado')),
  ciot_number text,
  issued_at date,
  notes text,
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ciots_emitido_number check (status <> 'emitido' or length(trim(coalesce(ciot_number, ''))) > 0)
);

-- Uma carga tem no máximo um CIOT válido (um cancelado pode ser refeito).
create unique index if not exists ciots_schedule_active_idx
  on ciots (schedule_id) where status <> 'cancelado' and schedule_id is not null;
create index if not exists ciots_agregado_idx on ciots (agregado_id, trip_start desc);

create or replace function public.touch_ciots()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ciots_touch on ciots;
create trigger ciots_touch
  before update on ciots
  for each row execute function public.touch_ciots();

alter table ciots enable row level security;
drop policy if exists "ciots_read" on ciots;
create policy "ciots_read" on ciots
  for select to authenticated using (public.can_edit_schedule());
drop policy if exists "ciots_write" on ciots;
create policy "ciots_write" on ciots
  for all to authenticated
  using (public.can_edit_schedule()) with check (public.can_edit_schedule());
drop policy if exists "zz_deny_portal_client" on ciots;
create policy "zz_deny_portal_client" on ciots
  as restrictive for all to authenticated
  using (not public.is_portal_client()) with check (not public.is_portal_client());
drop policy if exists "zz_deny_inspector" on ciots;
create policy "zz_deny_inspector" on ciots
  as restrictive for all to authenticated
  using (not public.is_inspector()) with check (not public.is_inspector());
