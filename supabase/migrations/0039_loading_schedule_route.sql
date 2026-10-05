-- CotaFlow — origem e destino (opcionais) em cada carga da programação de
-- carregamento. Texto livre, nulo quando a Logística não preenche; a tela só
-- mostra a coluna quando alguma carga do cliente tem o campo preenchido.
alter table loading_schedules add column if not exists origin text;
alter table loading_schedules add column if not exists destination text;
