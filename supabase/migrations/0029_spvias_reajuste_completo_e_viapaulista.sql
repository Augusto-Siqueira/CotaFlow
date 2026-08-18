-- CotaFlow — Duas frentes fechadas na mesma leva:
--
-- 1) Reajuste 2026 das 9 praças restantes da SPVias (Itararé já foi
--    corrigida na 0028; essas ficaram pra trás na mesma vigência antiga
--    01/07/2025). Fonte: notícia oficial de reajuste —
--    rodovias.motiva.com.br/spvias, vigente a partir de 01/07/2026.
--    Mesmo padrão: fecha a tarifa antiga (valid_until), nunca sobrescreve.
--
-- 2) Tarifas da ViaPaulista (L29) — concessão nova, praças já cadastradas
--    em `toll_plazas` (0015/0016) mas sem tarifa carregada. Fonte: Anexo 1
--    do contrato, tabela de tarifas com vigência 23/11/2025 a 22/11/2026 —
--    valores "Manual" (arredondados), únicos até 6 eixos (categorias 7 e
--    8 — 7-8 eixos — não são publicadas nessa tabela, mesmo padrão de
--    lacuna já visto em AUTOPISTA FLUMINENSE etc.).

-- ── 1) SPVias — reajuste 2026 ──────────────────────────────────────────

update toll_tariffs
set valid_until = '2026-06-30'
where toll_plaza_id in (
  select id from toll_plazas
  where concessionaria = 'SPVIAS'
    and name in ('Morro do Alto (Tatuí)', 'Morro do Alto (Itapetininga)',
                 'Gramadão', 'Avaré', 'Buri', 'Alambari', 'Quadra',
                 'Itatinga', 'Iaras')
)
and valid_from = '2025-07-01'
and valid_until is null;

insert into toll_tariffs (toll_plaza_id, category_id, amount, valid_from, source, source_reference)
select p.id, c.id, v.amount, date '2026-07-01', 'concessionaria',
       'Notícia oficial de reajuste — rodovias.motiva.com.br/spvias, vigente a partir de 01/07/2026 — consultada em 18/08/2026'
from (values
    ('Morro do Alto (Tatuí)', 0.5, 8.35),
    ('Morro do Alto (Tatuí)', 1.0, 16.70),
    ('Morro do Alto (Tatuí)', 1.5, 25.05),
    ('Morro do Alto (Tatuí)', 2.0, 33.40),
    ('Morro do Alto (Tatuí)', 3.0, 50.10),
    ('Morro do Alto (Tatuí)', 4.0, 66.80),
    ('Morro do Alto (Tatuí)', 5.0, 83.50),
    ('Morro do Alto (Tatuí)', 6.0, 100.20),

    ('Morro do Alto (Itapetininga)', 0.5, 8.35),
    ('Morro do Alto (Itapetininga)', 1.0, 16.70),
    ('Morro do Alto (Itapetininga)', 1.5, 25.05),
    ('Morro do Alto (Itapetininga)', 2.0, 33.40),
    ('Morro do Alto (Itapetininga)', 3.0, 50.10),
    ('Morro do Alto (Itapetininga)', 4.0, 66.80),
    ('Morro do Alto (Itapetininga)', 5.0, 83.50),
    ('Morro do Alto (Itapetininga)', 6.0, 100.20),

    ('Gramadão', 0.5, 7.50),
    ('Gramadão', 1.0, 15.00),
    ('Gramadão', 1.5, 22.50),
    ('Gramadão', 2.0, 30.00),
    ('Gramadão', 3.0, 45.00),
    ('Gramadão', 4.0, 60.00),
    ('Gramadão', 5.0, 75.00),
    ('Gramadão', 6.0, 90.00),

    ('Avaré', 0.5, 5.70),
    ('Avaré', 1.0, 11.40),
    ('Avaré', 1.5, 17.10),
    ('Avaré', 2.0, 22.80),
    ('Avaré', 3.0, 34.20),
    ('Avaré', 4.0, 45.60),
    ('Avaré', 5.0, 57.00),
    ('Avaré', 6.0, 68.40),

    ('Buri', 0.5, 8.10),
    ('Buri', 1.0, 16.20),
    ('Buri', 1.5, 24.30),
    ('Buri', 2.0, 32.40),
    ('Buri', 3.0, 48.60),
    ('Buri', 4.0, 64.80),
    ('Buri', 5.0, 81.00),
    ('Buri', 6.0, 97.20),

    ('Alambari', 0.5, 6.40),
    ('Alambari', 1.0, 12.80),
    ('Alambari', 1.5, 19.20),
    ('Alambari', 2.0, 25.60),
    ('Alambari', 3.0, 38.40),
    ('Alambari', 4.0, 51.20),
    ('Alambari', 5.0, 64.00),
    ('Alambari', 6.0, 76.80),

    ('Quadra', 0.5, 10.20),
    ('Quadra', 1.0, 20.40),
    ('Quadra', 1.5, 30.60),
    ('Quadra', 2.0, 40.80),
    ('Quadra', 3.0, 61.20),
    ('Quadra', 4.0, 81.60),
    ('Quadra', 5.0, 102.00),
    ('Quadra', 6.0, 122.40),

    ('Itatinga', 0.5, 10.20),
    ('Itatinga', 1.0, 20.40),
    ('Itatinga', 1.5, 30.60),
    ('Itatinga', 2.0, 40.80),
    ('Itatinga', 3.0, 61.20),
    ('Itatinga', 4.0, 81.60),
    ('Itatinga', 5.0, 102.00),
    ('Itatinga', 6.0, 122.40),

    ('Iaras', 0.5, 6.95),
    ('Iaras', 1.0, 13.90),
    ('Iaras', 1.5, 20.85),
    ('Iaras', 2.0, 27.80),
    ('Iaras', 3.0, 41.70),
    ('Iaras', 4.0, 55.60),
    ('Iaras', 5.0, 69.50),
    ('Iaras', 6.0, 83.40)
) as v (plaza_name, multiplier, amount)
join toll_plazas p on p.concessionaria = 'SPVIAS' and p.name = v.plaza_name
join toll_axle_categories c on c.multiplier = v.multiplier
on conflict (toll_plaza_id, category_id, valid_from) do nothing;

-- ── 2) ViaPaulista (L29) — praças sem tarifa ────────────────────────────
-- Vigência do Anexo 1 de tarifas: 23/11/2025 a 22/11/2026.

insert into toll_tariffs (toll_plaza_id, category_id, amount, valid_from, valid_until, source, source_reference)
select p.id, c.id, v.amount, date '2025-11-23', date '2026-11-22', 'concessionaria',
       'Anexo 1 – Tabela de Tarifas de Pedágio, contrato L29 ViaPaulista, vigência 23/11/2025 a 22/11/2026 — consultado em 18/08/2026'
from (values
    ('Guatapará', 0.5, 9.20),
    ('Guatapará', 1.0, 18.30),
    ('Guatapará', 1.5, 27.50),
    ('Guatapará', 2.0, 36.60),
    ('Guatapará', 3.0, 55.00),
    ('Guatapará', 4.0, 73.30),
    ('Guatapará', 5.0, 91.60),
    ('Guatapará', 6.0, 109.90),

    ('Boa Esperança do Sul', 0.5, 6.00),
    ('Boa Esperança do Sul', 1.0, 12.00),
    ('Boa Esperança do Sul', 1.5, 18.00),
    ('Boa Esperança do Sul', 2.0, 24.00),
    ('Boa Esperança do Sul', 3.0, 36.00),
    ('Boa Esperança do Sul', 4.0, 48.00),
    ('Boa Esperança do Sul', 5.0, 59.90),
    ('Boa Esperança do Sul', 6.0, 71.90),

    ('Jaú', 0.5, 3.50),
    ('Jaú', 1.0, 7.00),
    ('Jaú', 1.5, 10.50),
    ('Jaú', 2.0, 14.00),
    ('Jaú', 3.0, 21.00),
    ('Jaú', 4.0, 28.00),
    ('Jaú', 5.0, 35.00),
    ('Jaú', 6.0, 42.10),

    ('Botucatu (ViaPaulista)', 0.5, 3.80),
    ('Botucatu (ViaPaulista)', 1.0, 7.60),
    ('Botucatu (ViaPaulista)', 1.5, 11.50),
    ('Botucatu (ViaPaulista)', 2.0, 15.30),
    ('Botucatu (ViaPaulista)', 3.0, 22.90),
    ('Botucatu (ViaPaulista)', 4.0, 30.60),
    ('Botucatu (ViaPaulista)', 5.0, 38.20),
    ('Botucatu (ViaPaulista)', 6.0, 45.90),

    ('Itai', 0.5, 4.10),
    ('Itai', 1.0, 8.30),
    ('Itai', 1.5, 12.40),
    ('Itai', 2.0, 16.60),
    ('Itai', 3.0, 24.90),
    ('Itai', 4.0, 33.20),
    ('Itai', 5.0, 41.50),
    ('Itai', 6.0, 49.80),

    ('Cel. Macedo', 0.5, 4.10),
    ('Cel. Macedo', 1.0, 8.30),
    ('Cel. Macedo', 1.5, 12.40),
    ('Cel. Macedo', 2.0, 16.60),
    ('Cel. Macedo', 3.0, 24.90),
    ('Cel. Macedo', 4.0, 33.20),
    ('Cel. Macedo', 5.0, 41.50),
    ('Cel. Macedo', 6.0, 49.80),

    ('São Carlos', 0.5, 4.30),
    ('São Carlos', 1.0, 8.60),
    ('São Carlos', 1.5, 12.90),
    ('São Carlos', 2.0, 17.20),
    ('São Carlos', 3.0, 25.80),
    ('São Carlos', 4.0, 34.30),
    ('São Carlos', 5.0, 42.90),
    ('São Carlos', 6.0, 51.50),

    ('Santa Rita do Passa Quatro', 0.5, 5.30),
    ('Santa Rita do Passa Quatro', 1.0, 10.50),
    ('Santa Rita do Passa Quatro', 1.5, 15.80),
    ('Santa Rita do Passa Quatro', 2.0, 21.10),
    ('Santa Rita do Passa Quatro', 3.0, 31.60),
    ('Santa Rita do Passa Quatro', 4.0, 42.20),
    ('Santa Rita do Passa Quatro', 5.0, 52.70),
    ('Santa Rita do Passa Quatro', 6.0, 63.30),

    ('São Simão', 0.5, 5.30),
    ('São Simão', 1.0, 10.50),
    ('São Simão', 1.5, 15.80),
    ('São Simão', 2.0, 21.10),
    ('São Simão', 3.0, 31.60),
    ('São Simão', 4.0, 42.20),
    ('São Simão', 5.0, 52.70),
    ('São Simão', 6.0, 63.30),

    ('Batatais', 0.5, 5.80),
    ('Batatais', 1.0, 11.70),
    ('Batatais', 1.5, 17.60),
    ('Batatais', 2.0, 23.40),
    ('Batatais', 3.0, 35.10),
    ('Batatais', 4.0, 46.80),
    ('Batatais', 5.0, 58.50),
    ('Batatais', 6.0, 70.20),

    ('Restinga', 0.5, 5.80),
    ('Restinga', 1.0, 11.70),
    ('Restinga', 1.5, 17.60),
    ('Restinga', 2.0, 23.40),
    ('Restinga', 3.0, 35.10),
    ('Restinga', 4.0, 46.80),
    ('Restinga', 5.0, 58.50),
    ('Restinga', 6.0, 70.20)
) as v (plaza_name, multiplier, amount)
join toll_plazas p on p.concessionaria = 'VIAPAULISTA' and p.name = v.plaza_name
join toll_axle_categories c on c.multiplier = v.multiplier
on conflict (toll_plaza_id, category_id, valid_from) do nothing;
