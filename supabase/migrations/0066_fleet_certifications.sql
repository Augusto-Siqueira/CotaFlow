-- CotaFlow — capacitações das placas (CIV e CIPP) com data de vencimento.
-- Cavalo mecânico: só CIV. Truck, bitruck e semi-reboque: CIV e CIPP.
-- `*_na` = a placa não precisa dessa capacitação (então não tem data).
-- Quem altera: o mesmo da frota (fleet_units_write: admin e logística).
alter table fleet_units
  add column if not exists civ_due date,
  add column if not exists civ_na boolean not null default false,
  add column if not exists cipp_due date,
  add column if not exists cipp_na boolean not null default false;

alter table fleet_units drop constraint if exists fleet_units_civ_check;
alter table fleet_units add constraint fleet_units_civ_check
  check (not civ_na or civ_due is null);
alter table fleet_units drop constraint if exists fleet_units_cipp_check;
alter table fleet_units add constraint fleet_units_cipp_check
  check (not cipp_na or cipp_due is null);
