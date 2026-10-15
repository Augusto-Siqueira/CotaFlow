-- CotaFlow — comprovante de entrega: número do CT-e, preenchido pelo motorista.
-- Nulo nos comprovantes lançados antes desta mudança; o app exige o campo nos novos.
alter table delivery_proofs add column if not exists cte_number text;
