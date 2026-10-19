-- CotaFlow — aferição do cronotacógrafo por placa (cavalo, truck e bitruck).
-- `crono_due` = vencimento; no preliminar (30 dias) é o fim do preliminar, e depois
-- é liberado o definitivo. `crono_stage` diz qual dos dois está valendo.
-- Não existe "N/A": todo veículo com motor precisa. Quem altera: o mesmo da frota.
alter table fleet_units
  add column if not exists crono_due date,
  add column if not exists crono_stage text;

alter table fleet_units drop constraint if exists fleet_units_crono_stage_check;
alter table fleet_units add constraint fleet_units_crono_stage_check
  check (crono_stage is null or crono_stage in ('preliminar', 'definitivo'));
