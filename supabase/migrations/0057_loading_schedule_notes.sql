-- CotaFlow — observações livres em cada carga da Programação.
-- Quem edita a programação grava (regra de escrita já existente na tabela).
alter table loading_schedules add column if not exists notes text;
