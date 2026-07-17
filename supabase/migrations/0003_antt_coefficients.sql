-- CotaFlow — Seção 5.5: piso mínimo ANTT (coeficientes parametrizáveis)
-- Piso_ANTT = (CCD × distância_km) + CC

create table if not exists antt_coefficients (
  id uuid primary key default gen_random_uuid(),
  axles int not null,
  cargo_type text not null,
  ccd numeric not null, -- Coeficiente de Custo por Deslocamento (R$/km)
  cc numeric not null,  -- Coeficiente de Custo por Viagem (R$)
  created_at timestamptz not null default now(),
  unique (axles, cargo_type)
);

alter table antt_coefficients enable row level security;

create policy "antt_coefficients_allow_all" on antt_coefficients for all using (true) with check (true);

-- Valores de EXEMPLO para permitir testar o cálculo do piso mínimo.
-- Substitua pelos coeficientes oficiais da Resolução ANTT vigente antes de
-- usar isso para cotações reais — não têm validade legal como estão.
insert into antt_coefficients (axles, cargo_type, ccd, cc) values
  (5, 'Carga Geral (exemplo)', 4.50, 350),
  (5, 'Granel Sólido (exemplo)', 4.20, 300),
  (2, 'Carga Geral (exemplo)', 3.80, 250)
on conflict (axles, cargo_type) do nothing;
