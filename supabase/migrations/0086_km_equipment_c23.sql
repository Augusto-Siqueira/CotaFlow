-- CotaFlow — KM Btech: equipamento "Carreta 5 eixos 23 t" para as viagens spot.
--
-- Só um tipo novo; não tem tarifa (o spot não usa a tabela). Se um dia a frota
-- dedicada tiver esse equipamento, a tarifa entra em Ajustes.
insert into km_equipment_types (id, name, axles, position)
values ('c23', 'Carreta 5 eixos 23 t', 5, 3)
on conflict (id) do nothing;
