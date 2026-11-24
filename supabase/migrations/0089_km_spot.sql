-- CotaFlow — KM Btech: frete do spot igual à calculadora de frete da Btech.
--
-- 1. Acréscimo do spot sobre o piso ANTT (padrão 10%), editável em Ajustes.
-- 2. Equipamento que usa a tarifa de outro com um fator: a "Carreta 6 eixos
--    35 t" usa os valores da Carreta 6 eixos 30 t × 9,51/9,06 (como na
--    calculadora), sem precisar digitar a cada tabela nova.
-- 3. Equipamentos do spot: Truck 3 eixos e Carreta 6 eixos 35 t (a Carreta 5
--    eixos 23 t já existe, 0086), e os valores do Truck e da Carreta 5 eixos
--    na tabela piso em vigor (Portaria SUROC nº 22/2026, Tabela A, granel
--    líquido perigoso: 3 eixos CCD 6,1436 · CC 732,90; 5 eixos CCD 7,8193 · CC
--    861,51). Valor do km = CCD × (1 + retorno) ÷ 2, como o cadastro faz.

alter table km_settings
  add column if not exists spot_markup numeric not null default 0.10
    check (spot_markup >= 0 and spot_markup <= 1);

alter table km_equipment_types
  add column if not exists tariff_base text references km_equipment_types(id),
  add column if not exists tariff_factor numeric check (tariff_factor is null or tariff_factor > 0);

insert into km_equipment_types (id, name, axles, position)
values ('t3', 'Truck 3 eixos', 3, 0)
on conflict (id) do nothing;

insert into km_equipment_types (id, name, axles, position, tariff_base, tariff_factor)
values ('c35', 'Carreta 6 eixos 35 t', 6, 4, 'c30', 9.51 / 9.06)
on conflict (id) do nothing;

-- Ordem: do menor para o maior.
update km_equipment_types set position = case id
  when 't3' then 0 when 'bitruck' then 1 when 'c23' then 2
  when 'c30' then 3 when 'c35' then 4 when 'c38' then 5 else position end;

update km_tariffs t
set values = t.values
  || case when t.values ? 't3' then '{}'::jsonb else jsonb_build_object('t3', jsonb_build_object(
       'ccd', 6.1436, 'cc', 732.90, 'km', round(6.1436 * (1 + s.return_factor) / 2, 4))) end
  || case when t.values ? 'c23' then '{}'::jsonb else jsonb_build_object('c23', jsonb_build_object(
       'ccd', 7.8193, 'cc', 861.51, 'km', round(7.8193 * (1 + s.return_factor) / 2, 4))) end
from km_settings s
where s.id = 1
  and t.method = 'piso'
  and t.valid_from = '2026-10-26';

notify pgrst, 'reload schema';
