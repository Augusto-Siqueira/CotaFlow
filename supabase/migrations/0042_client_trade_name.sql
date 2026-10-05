-- CotaFlow — Nome Fantasia do cliente. A coluna `name` (já usada em cotações,
-- PDFs e filtros) passa a ser a Razão Social; `trade_name` é opcional.
alter table clients add column if not exists trade_name text;
