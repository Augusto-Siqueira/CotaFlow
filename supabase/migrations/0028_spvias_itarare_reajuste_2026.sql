-- CotaFlow — Reajuste 2026 da SPVias na praça de Itararé (SP-258, km
-- 326.67), reportado pelo usuário: Qualp mostra R$ 10,50/eixo, nosso banco
-- tinha R$ 9,90/eixo (vigência 01/07/2025, um reajuste atrás).
--
-- Confirmado na fonte oficial (rodovias.motiva.com.br/spvias, notícia de
-- reajuste de tarifas a partir de 01/07/2026): Itararé passou para
-- R$ 10,50. Mesmo padrão linear por eixo já usado nas outras tarifas da
-- SPVias (M{n}_0 = base x n).
--
-- Fecha a vigência da tarifa antiga (valid_until) em vez de sobrescrever
-- — mesmo padrão de antt_coefficients/icms_rates: histórico não se perde,
-- só passa a não valer mais a partir da data do reajuste.
--
-- Pendência à parte (não resolvida aqui): esse reajuste é de toda a
-- concessão SPVias, não só de Itararé — as outras 9 praças da SPVias
-- (seedadas na mesma 0015/0017, vigência 01/07/2025) provavelmente estão
-- igualmente desatualizadas. Fica pra quando o usuário quiser revisar a
-- concessão inteira.

update toll_tariffs
set valid_until = '2026-06-30'
where toll_plaza_id = (
  select id from toll_plazas where concessionaria = 'SPVIAS' and name = 'Itararé'
)
and valid_from = '2025-07-01'
and valid_until is null;

insert into toll_tariffs (toll_plaza_id, category_id, amount, valid_from, source, source_reference)
select p.id, c.id, v.amount, date '2026-07-01', 'concessionaria',
       'Notícia oficial de reajuste — rodovias.motiva.com.br/spvias, vigente a partir de 01/07/2026 — consultada em 18/08/2026'
from (values
  (0.5, 5.25),
  (1.0, 10.50),
  (1.5, 15.75),
  (2.0, 21.00),
  (3.0, 31.50),
  (4.0, 42.00),
  (5.0, 52.50),
  (6.0, 63.00),
  (7.0, 73.50),
  (8.0, 84.00)
) as v (multiplier, amount)
join toll_plazas p on p.concessionaria = 'SPVIAS' and p.name = 'Itararé'
join toll_axle_categories c on c.multiplier = v.multiplier
on conflict (toll_plaza_id, category_id, valid_from) do nothing;
