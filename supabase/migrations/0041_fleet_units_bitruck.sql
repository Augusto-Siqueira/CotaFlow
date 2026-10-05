-- CotaFlow — a frota tem Bitrucks além de cavalos, semi-reboques e trucks.
-- Rode DEPOIS da 0040 (só amplia a lista de tipos aceitos).
alter table fleet_units drop constraint if exists fleet_units_kind_check;
alter table fleet_units add constraint fleet_units_kind_check
  check (kind in ('cavalo', 'semirreboque', 'truck', 'bitruck'));
