-- CotaFlow — Infraestrutura de pedágio (Toll Engine).
--
-- Modela praça física + tarifa, e não "rota x eixos x custo": a rota até uma
-- praça é calculada dinamicamente (roteirização + waypoints já existentes),
-- então o que precisa ser dado estável é a praça em si e o tarifário vigente
-- nela — a mesma lógica já usada para `icms_rates` (matriz por UF, não por
-- cotação) e `antt_coefficients` (parametrizável, reajustado por resolução).
--
-- toll_axle_categories é a classificação nacional de veículos para pedágio
-- (a mesma usada tanto pela ANTT quanto pela ARTESP): o preço de cada
-- categoria é sempre tarifa_base x multiplicador. Confirmado batendo os
-- dados reais da Via Cristais (ANTT) e da ARTESP (ViaPaulista) — os dois
-- têm o mesmo conjunto de multiplicadores (0,5 a 8,0), embora o *código*
-- da categoria (ex: "CAT-7") não seja padronizado entre concessionárias.
-- Por isso a chave aqui é o multiplicador, não um código copiado da fonte.
create table if not exists toll_axle_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  multiplier numeric not null,
  description text
);

insert into toll_axle_categories (code, multiplier, description) values
  ('M0_5', 0.5, 'Motocicletas, motonetas e triciclos'),
  ('M1_0', 1.0, 'Automóvel, caminhonete e furgão (2 eixos, rodagem simples)'),
  ('M1_5', 1.5, 'Automóvel e caminhonete com semirreboque (3 eixos)'),
  ('M2_0', 2.0, 'Caminhão leve, ônibus, caminhão-trator e furgão (2 eixos, rodagem dupla) / automóvel com reboque (4 eixos)'),
  ('M3_0', 3.0, 'Caminhão, caminhão-trator e ônibus (3 eixos, rodagem dupla)'),
  ('M4_0', 4.0, 'Caminhão e caminhão-trator com semirreboque (4 eixos)'),
  ('M5_0', 5.0, 'Caminhão e caminhão-trator com semirreboque (5 eixos)'),
  ('M6_0', 6.0, 'Caminhão e caminhão-trator com semirreboque (6 eixos)'),
  ('M7_0', 7.0, 'Caminhão e caminhão-trator com semirreboque (7 eixos)'),
  ('M8_0', 8.0, 'Caminhão e caminhão-trator com semirreboque (8 eixos)')
on conflict (code) do nothing;

-- Infraestrutura física — não muda por cotação, só por reforma/desativação
-- da própria praça. latitude/longitude ficam nulas quando a fonte não
-- publica coordenada (caso da ARTESP, que só dá rodovia+km — precisa de
-- geocoding à parte antes do motor de matching com a rota poder usá-las).
--
-- `direction` é o sentido em que a praça cobra, no vocabulário do PNV/SNV
-- que a ANTT usa: 'Crescente', 'Decrescente' ou 'Crescente/Decrescente'
-- (cobra nos dois). Importa porque praça de sentido único só deve entrar
-- no cálculo quando a rota passa naquele sentido — ida e volta pela mesma
-- rodovia podem ter pedágio diferente. A ARTESP não publica esse dado,
-- então fica nulo nas praças de SP até virem de outra fonte.
create table if not exists toll_plazas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  concessionaria text not null,
  rodovia text,
  uf text not null,
  km numeric,
  municipio text,
  latitude numeric,
  longitude numeric,
  direction text,
  source text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (concessionaria, name)
);

create index if not exists toll_plazas_rodovia_km_idx on toll_plazas(rodovia, km);
create index if not exists toll_plazas_concessionaria_idx on toll_plazas(concessionaria);

-- Tarifário — com vigência temporal (mesmo padrão de antt_coefficients):
-- reajuste vira uma linha nova com valid_from novo, nunca sobrescreve a
-- anterior. O snapshot do valor usado numa cotação continua sendo
-- responsabilidade da cotação em si (como já acontece com icms_pct),
-- não desta tabela de referência.
create table if not exists toll_tariffs (
  id uuid primary key default gen_random_uuid(),
  toll_plaza_id uuid not null references toll_plazas(id) on delete cascade,
  category_id uuid not null references toll_axle_categories(id),
  amount numeric not null,
  valid_from date not null,
  valid_until date,
  source text not null,
  source_reference text,
  created_at timestamptz not null default now(),
  unique (toll_plaza_id, category_id, valid_from)
);

create index if not exists toll_tariffs_plaza_idx on toll_tariffs(toll_plaza_id);

alter table toll_axle_categories enable row level security;
alter table toll_plazas enable row level security;
alter table toll_tariffs enable row level security;

-- drop + create (em vez de "if not exists", que o Postgres não aceita
-- para policy) para o arquivo poder ser rodado de novo com segurança.
drop policy if exists "toll_axle_categories_allow_all" on toll_axle_categories;
drop policy if exists "toll_plazas_allow_all" on toll_plazas;
drop policy if exists "toll_tariffs_allow_all" on toll_tariffs;

create policy "toll_axle_categories_allow_all" on toll_axle_categories for all using (true) with check (true);
create policy "toll_plazas_allow_all" on toll_plazas for all using (true) with check (true);
create policy "toll_tariffs_allow_all" on toll_tariffs for all using (true) with check (true);
