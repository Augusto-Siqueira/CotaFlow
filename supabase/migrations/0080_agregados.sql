-- CotaFlow — cadastro de agregados (Etapa 1 do CIOT dentro do CotaFlow).
--
-- O CIOT do e-Frete pede, a cada emissão, dados que quase não mudam:
-- contratado (proprietário), veículos e motorista. Eles passam a ficar
-- cadastrados aqui, para a tela de CIOT (Etapa 2) e, depois, a integração com
-- a API do e-Frete preencherem tudo sozinhas.
--
--  * agregados        — o contratado: quem recebe o frete e sofre as retenções
--                       (INSS, SEST/SENAT, IRRF quando pessoa física).
--  * fleet_units      — as placas do agregado continuam na frota (a
--                       programação já usa essas placas) e ganham o vínculo
--                       com o agregado + os dados de veículo que o e-Frete pede
--                       (servem também ao MDF-e no futuro).
--  * driver_details   — CNH, nascimento, celular e endereço do motorista, à
--                       parte da tabela drivers porque são dados pessoais que
--                       só Logística/admin precisam ver (drivers é lida por
--                       qualquer usuário interno).
--
-- Dados pessoais e bancários: leitura e escrita só para quem edita a
-- programação (admin e logística, can_edit_schedule).

create table if not exists agregados (
  id uuid primary key default gen_random_uuid(),
  person_type text not null check (person_type in ('pf', 'pj')),
  -- Só dígitos: 11 (CPF) ou 14 (CNPJ), de acordo com person_type.
  document text not null unique,
  name text not null check (length(trim(name)) > 0),
  rntrc text,
  dependents integer not null default 0 check (dependents >= 0),
  email text,
  mobile_phone text,
  other_phone text,
  street text,
  number text,
  complement text,
  district text,
  cep text,
  city text,
  -- Pagamento padrão (o CIOT é de parcela única): conta bancária ou PIX.
  payment_method text check (payment_method in ('conta', 'pix')),
  bank_code text,
  bank_agency text,
  bank_account text,
  bank_account_type text check (bank_account_type in ('corrente', 'poupanca')),
  pix_key_type text check (pix_key_type in ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria')),
  pix_key text,
  -- 'viagem': um CIOT por carga; 'mensal': um CIOT por veículo por mês.
  ciot_mode text not null default 'viagem' check (ciot_mode in ('viagem', 'mensal')),
  -- Destinatário padrão do CIOT (ex: Arauco - Araucária). O tomador é sempre
  -- a Transbochnia, então não precisa de campo.
  recipient_client_id uuid references clients(id) on delete set null,
  -- Motorista que costuma rodar com o agregado (pode ser ele mesmo).
  driver_id uuid references drivers(id) on delete set null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agregados_document_check check (
    (person_type = 'pf' and document ~ '^[0-9]{11}$')
    or (person_type = 'pj' and document ~ '^[0-9]{14}$')
  )
);

create or replace function public.touch_agregados()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists agregados_touch on agregados;
create trigger agregados_touch
  before update on agregados
  for each row execute function public.touch_agregados();

alter table agregados enable row level security;
drop policy if exists "agregados_read" on agregados;
create policy "agregados_read" on agregados
  for select to authenticated using (public.can_edit_schedule());
drop policy if exists "agregados_write" on agregados;
create policy "agregados_write" on agregados
  for all to authenticated
  using (public.can_edit_schedule()) with check (public.can_edit_schedule());
drop policy if exists "zz_deny_portal_client" on agregados;
create policy "zz_deny_portal_client" on agregados
  as restrictive for all to authenticated
  using (not public.is_portal_client()) with check (not public.is_portal_client());
drop policy if exists "zz_deny_inspector" on agregados;
create policy "zz_deny_inspector" on agregados
  as restrictive for all to authenticated
  using (not public.is_inspector()) with check (not public.is_inspector());

-- Placas: vínculo com o agregado (null = frota própria) + dados do veículo.
-- Rodado e carroceria seguem os códigos da ANTT/MDF-e (tpRod / tpCar).
alter table fleet_units
  add column if not exists agregado_id uuid references agregados(id) on delete set null,
  add column if not exists renavam text,
  add column if not exists chassis text,
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists year_made integer check (year_made is null or year_made between 1950 and 2100),
  add column if not exists year_model integer check (year_model is null or year_model between 1950 and 2100),
  add column if not exists axles integer check (axles is null or axles between 1 and 12),
  add column if not exists color text,
  add column if not exists tare_kg numeric check (tare_kg is null or tare_kg >= 0),
  add column if not exists capacity_kg numeric check (capacity_kg is null or capacity_kg >= 0),
  add column if not exists capacity_m3 numeric check (capacity_m3 is null or capacity_m3 >= 0),
  add column if not exists wheel_type text check (wheel_type is null or wheel_type in ('01', '02', '03', '04', '05', '06')),
  add column if not exists body_type text check (body_type is null or body_type in ('00', '01', '02', '03', '04', '05')),
  add column if not exists registry_city text;
create index if not exists fleet_units_agregado_idx on fleet_units (agregado_id);

-- Dados pessoais do motorista usados no CIOT.
create table if not exists driver_details (
  driver_id uuid primary key references drivers(id) on delete cascade,
  cnh text,
  birth_date date,
  mobile_phone text,
  street text,
  number text,
  complement text,
  district text,
  cep text,
  city text,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_driver_details()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists driver_details_touch on driver_details;
create trigger driver_details_touch
  before update on driver_details
  for each row execute function public.touch_driver_details();

alter table driver_details enable row level security;
drop policy if exists "driver_details_read" on driver_details;
create policy "driver_details_read" on driver_details
  for select to authenticated using (public.can_edit_schedule());
drop policy if exists "driver_details_write" on driver_details;
create policy "driver_details_write" on driver_details
  for all to authenticated
  using (public.can_edit_schedule()) with check (public.can_edit_schedule());
drop policy if exists "zz_deny_portal_client" on driver_details;
create policy "zz_deny_portal_client" on driver_details
  as restrictive for all to authenticated
  using (not public.is_portal_client()) with check (not public.is_portal_client());
drop policy if exists "zz_deny_inspector" on driver_details;
create policy "zz_deny_inspector" on driver_details
  as restrictive for all to authenticated
  using (not public.is_inspector()) with check (not public.is_inspector());
