-- CotaFlow — Fecha 3 das 6 concessões que a 0017 deixou de fora por
-- divergência entre nº de praças no banco (`toll_plazas`) e nº de itens na
-- tabela de tarifa da ANTT. Resolvidas nesta migration, com a praça física
-- correspondente a cada uma confirmada por pelo menos duas fontes
-- (página de tarifas da concessão na ANTT + reportagem/site da
-- concessionária citando a mesma cidade e o mesmo valor), consultadas em
-- 18/08/2026:
--
--   • CONCEBRA — banco tem 2 praças (P1 Alexânia km43.1, P2 Goianápolis
--     km107.9), tarifa pública tem 11. Confirmado: Praça 1 = Alexânia,
--     Praça 2 = Goianápolis (mesmo km, fonte: triunfoconcebra.com.br).
--     Tabela oficial só publica categorias até 6 eixos (mult. 6.0) — sem
--     linha para 7-8 eixos, mesmo padrão já usado em AUTOPISTA FLUMINENSE
--     na 0017 (não é omissão, é o que a fonte publica).
--   • ECOVIAS MINAS GOIÁS — banco tem 5 praças, tarifa pública tem 6
--     (a 6ª, "Delta", não está cadastrada em `toll_plazas` — fica de fora
--     até essa praça ser adicionada). Confirmado por reajuste noticiado
--     em jul/2025 citando valor de categoria 1 por cidade, batendo 1:1
--     com a Praça 1-6 da tabela ANTT (Ipameri, Campo Alegre de Goiás,
--     Araguari I, Araguari II, Uberaba, Delta). Mesma limitação de
--     categorias (só até 6 eixos).
--   • ECOVIAS RIO MINAS — banco tem 12 praças (P04-P15; P01-P03 foram
--     desativadas e substituídas por P07/P08, por isso não existem no
--     banco). Tabela ANTT já publica exatamente as colunas P4-P15 com
--     categorias até 8 eixos — sem ambiguidade de numeração.
--
-- Continuam de fora (não resolvidas nesta migration):
--   • RIOSP — 67 praças no banco (maioria pórtico free-flow, cobrança por
--     km acumulado em vários pórticos, não por praça isolada); o modelo de
--     tarifa fixa por praça deste schema não representa esse esquema sem
--     redesenho.
--   • ROTA VERDE GOIÁS — concessão nova (iniciou cobrança em 2026); a
--     página de tarifas da ANTT está vazia ("Atualmente não existem itens
--     nessa pasta") — ainda não publicada.
--   • NOVA 364 — fontes encontradas divergem sobre qual praça física
--     corresponde a qual número de tarifa (ex.: uma fonte associa P2 a
--     Cujubim, mas o cadastro tem P02 como Itapuã) — precisa de
--     verificação num documento primário (deliberação da ANTT) antes de
--     carregar, para não cobrar a praça errada.
--
-- IDEMPOTENTE: pode ser reexecutado sem duplicar (`on conflict do nothing`
-- sobre a unique de toll_tariffs).

insert into toll_tariffs (toll_plaza_id, category_id, amount, valid_from, source, source_reference)
select p.id, c.id, v.amount, date '2026-08-18', 'antt',
       'Página de tarifas por concessão, ANTT, e fonte cruzada (site da concessionária/reportagem) — consultadas em 18/08/2026'
from (values

    -- CONCEBRA
    ('CONCEBRA', 'P1 ALEXÂNIA', 0.5, 3.70),
    ('CONCEBRA', 'P1 ALEXÂNIA', 1.0, 7.40),
    ('CONCEBRA', 'P1 ALEXÂNIA', 1.5, 11.10),
    ('CONCEBRA', 'P1 ALEXÂNIA', 2.0, 14.80),
    ('CONCEBRA', 'P1 ALEXÂNIA', 3.0, 22.20),
    ('CONCEBRA', 'P1 ALEXÂNIA', 4.0, 29.60),
    ('CONCEBRA', 'P1 ALEXÂNIA', 5.0, 37.00),
    ('CONCEBRA', 'P1 ALEXÂNIA', 6.0, 44.40),
    ('CONCEBRA', 'P2 GOIANÁPOLIS', 0.5, 2.70),
    ('CONCEBRA', 'P2 GOIANÁPOLIS', 1.0, 5.40),
    ('CONCEBRA', 'P2 GOIANÁPOLIS', 1.5, 8.10),
    ('CONCEBRA', 'P2 GOIANÁPOLIS', 2.0, 10.80),
    ('CONCEBRA', 'P2 GOIANÁPOLIS', 3.0, 16.20),
    ('CONCEBRA', 'P2 GOIANÁPOLIS', 4.0, 21.60),
    ('CONCEBRA', 'P2 GOIANÁPOLIS', 5.0, 27.00),
    ('CONCEBRA', 'P2 GOIANÁPOLIS', 6.0, 32.40),

    -- ECOVIAS MINAS GOIÁS
    ('ECOVIAS MINAS GOIÁS', 'IPAMERI', 0.5, 4.45),
    ('ECOVIAS MINAS GOIÁS', 'IPAMERI', 1.0, 8.90),
    ('ECOVIAS MINAS GOIÁS', 'IPAMERI', 1.5, 13.35),
    ('ECOVIAS MINAS GOIÁS', 'IPAMERI', 2.0, 17.80),
    ('ECOVIAS MINAS GOIÁS', 'IPAMERI', 3.0, 26.70),
    ('ECOVIAS MINAS GOIÁS', 'IPAMERI', 4.0, 35.60),
    ('ECOVIAS MINAS GOIÁS', 'IPAMERI', 5.0, 44.50),
    ('ECOVIAS MINAS GOIÁS', 'IPAMERI', 6.0, 53.40),
    ('ECOVIAS MINAS GOIÁS', 'CAMPO ALEGRE', 0.5, 4.80),
    ('ECOVIAS MINAS GOIÁS', 'CAMPO ALEGRE', 1.0, 9.60),
    ('ECOVIAS MINAS GOIÁS', 'CAMPO ALEGRE', 1.5, 14.40),
    ('ECOVIAS MINAS GOIÁS', 'CAMPO ALEGRE', 2.0, 19.20),
    ('ECOVIAS MINAS GOIÁS', 'CAMPO ALEGRE', 3.0, 28.80),
    ('ECOVIAS MINAS GOIÁS', 'CAMPO ALEGRE', 4.0, 38.40),
    ('ECOVIAS MINAS GOIÁS', 'CAMPO ALEGRE', 5.0, 48.00),
    ('ECOVIAS MINAS GOIÁS', 'CAMPO ALEGRE', 6.0, 57.60),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI I', 0.5, 3.65),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI I', 1.0, 7.30),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI I', 1.5, 10.95),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI I', 2.0, 14.60),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI I', 3.0, 21.90),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI I', 4.0, 29.20),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI I', 5.0, 36.50),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI I', 6.0, 43.80),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI II', 0.5, 2.75),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI II', 1.0, 5.50),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI II', 1.5, 8.25),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI II', 2.0, 11.00),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI II', 3.0, 16.50),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI II', 4.0, 22.00),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI II', 5.0, 27.50),
    ('ECOVIAS MINAS GOIÁS', 'ARAGUARI II', 6.0, 33.00),
    ('ECOVIAS MINAS GOIÁS', 'UBERABA', 0.5, 3.95),
    ('ECOVIAS MINAS GOIÁS', 'UBERABA', 1.0, 7.90),
    ('ECOVIAS MINAS GOIÁS', 'UBERABA', 1.5, 11.85),
    ('ECOVIAS MINAS GOIÁS', 'UBERABA', 2.0, 15.80),
    ('ECOVIAS MINAS GOIÁS', 'UBERABA', 3.0, 23.70),
    ('ECOVIAS MINAS GOIÁS', 'UBERABA', 4.0, 31.60),
    ('ECOVIAS MINAS GOIÁS', 'UBERABA', 5.0, 39.50),
    ('ECOVIAS MINAS GOIÁS', 'UBERABA', 6.0, 47.40),

    -- ECOVIAS RIO MINAS
    ('ECOVIAS RIO MINAS', 'P04 Viúva Graça', 1.0, 17.20),
    ('ECOVIAS RIO MINAS', 'P04 Viúva Graça', 1.5, 25.80),
    ('ECOVIAS RIO MINAS', 'P04 Viúva Graça', 2.0, 34.40),
    ('ECOVIAS RIO MINAS', 'P04 Viúva Graça', 3.0, 51.60),
    ('ECOVIAS RIO MINAS', 'P04 Viúva Graça', 4.0, 68.80),
    ('ECOVIAS RIO MINAS', 'P04 Viúva Graça', 5.0, 86.00),
    ('ECOVIAS RIO MINAS', 'P04 Viúva Graça', 6.0, 103.20),
    ('ECOVIAS RIO MINAS', 'P04 Viúva Graça', 7.0, 120.40),
    ('ECOVIAS RIO MINAS', 'P04 Viúva Graça', 8.0, 137.60),
    ('ECOVIAS RIO MINAS', 'P05 Viúva Graça (B)', 1.0, 17.20),
    ('ECOVIAS RIO MINAS', 'P05 Viúva Graça (B)', 1.5, 25.80),
    ('ECOVIAS RIO MINAS', 'P05 Viúva Graça (B)', 2.0, 34.40),
    ('ECOVIAS RIO MINAS', 'P05 Viúva Graça (B)', 3.0, 51.60),
    ('ECOVIAS RIO MINAS', 'P05 Viúva Graça (B)', 4.0, 68.80),
    ('ECOVIAS RIO MINAS', 'P05 Viúva Graça (B)', 5.0, 86.00),
    ('ECOVIAS RIO MINAS', 'P05 Viúva Graça (B)', 6.0, 103.20),
    ('ECOVIAS RIO MINAS', 'P05 Viúva Graça (B)', 7.0, 120.40),
    ('ECOVIAS RIO MINAS', 'P05 Viúva Graça (B)', 8.0, 137.60),
    ('ECOVIAS RIO MINAS', 'P06 Itaguaí', 1.0, 11.00),
    ('ECOVIAS RIO MINAS', 'P06 Itaguaí', 1.5, 16.50),
    ('ECOVIAS RIO MINAS', 'P06 Itaguaí', 2.0, 22.00),
    ('ECOVIAS RIO MINAS', 'P06 Itaguaí', 3.0, 33.00),
    ('ECOVIAS RIO MINAS', 'P06 Itaguaí', 4.0, 44.00),
    ('ECOVIAS RIO MINAS', 'P06 Itaguaí', 5.0, 55.00),
    ('ECOVIAS RIO MINAS', 'P06 Itaguaí', 6.0, 66.00),
    ('ECOVIAS RIO MINAS', 'P06 Itaguaí', 7.0, 77.00),
    ('ECOVIAS RIO MINAS', 'P06 Itaguaí', 8.0, 88.00),
    ('ECOVIAS RIO MINAS', 'P07 Magé', 1.0, 20.20),
    ('ECOVIAS RIO MINAS', 'P07 Magé', 1.5, 30.30),
    ('ECOVIAS RIO MINAS', 'P07 Magé', 2.0, 40.40),
    ('ECOVIAS RIO MINAS', 'P07 Magé', 3.0, 60.60),
    ('ECOVIAS RIO MINAS', 'P07 Magé', 4.0, 80.80),
    ('ECOVIAS RIO MINAS', 'P07 Magé', 5.0, 101.00),
    ('ECOVIAS RIO MINAS', 'P07 Magé', 6.0, 121.20),
    ('ECOVIAS RIO MINAS', 'P07 Magé', 7.0, 141.40),
    ('ECOVIAS RIO MINAS', 'P07 Magé', 8.0, 161.60),
    ('ECOVIAS RIO MINAS', 'P08 Guapimirim', 1.0, 21.00),
    ('ECOVIAS RIO MINAS', 'P08 Guapimirim', 1.5, 31.50),
    ('ECOVIAS RIO MINAS', 'P08 Guapimirim', 2.0, 42.00),
    ('ECOVIAS RIO MINAS', 'P08 Guapimirim', 3.0, 63.00),
    ('ECOVIAS RIO MINAS', 'P08 Guapimirim', 4.0, 84.00),
    ('ECOVIAS RIO MINAS', 'P08 Guapimirim', 5.0, 105.00),
    ('ECOVIAS RIO MINAS', 'P08 Guapimirim', 6.0, 126.00),
    ('ECOVIAS RIO MINAS', 'P08 Guapimirim', 7.0, 147.00),
    ('ECOVIAS RIO MINAS', 'P08 Guapimirim', 8.0, 168.00),
    ('ECOVIAS RIO MINAS', 'P09 Leopoldina', 1.0, 14.50),
    ('ECOVIAS RIO MINAS', 'P09 Leopoldina', 1.5, 21.75),
    ('ECOVIAS RIO MINAS', 'P09 Leopoldina', 2.0, 29.00),
    ('ECOVIAS RIO MINAS', 'P09 Leopoldina', 3.0, 43.50),
    ('ECOVIAS RIO MINAS', 'P09 Leopoldina', 4.0, 58.00),
    ('ECOVIAS RIO MINAS', 'P09 Leopoldina', 5.0, 72.50),
    ('ECOVIAS RIO MINAS', 'P09 Leopoldina', 6.0, 87.00),
    ('ECOVIAS RIO MINAS', 'P09 Leopoldina', 7.0, 101.50),
    ('ECOVIAS RIO MINAS', 'P09 Leopoldina', 8.0, 116.00),
    ('ECOVIAS RIO MINAS', 'P10 Laranjal', 1.0, 12.80),
    ('ECOVIAS RIO MINAS', 'P10 Laranjal', 1.5, 19.20),
    ('ECOVIAS RIO MINAS', 'P10 Laranjal', 2.0, 25.60),
    ('ECOVIAS RIO MINAS', 'P10 Laranjal', 3.0, 38.40),
    ('ECOVIAS RIO MINAS', 'P10 Laranjal', 4.0, 51.20),
    ('ECOVIAS RIO MINAS', 'P10 Laranjal', 5.0, 64.00),
    ('ECOVIAS RIO MINAS', 'P10 Laranjal', 6.0, 76.80),
    ('ECOVIAS RIO MINAS', 'P10 Laranjal', 7.0, 89.60),
    ('ECOVIAS RIO MINAS', 'P10 Laranjal', 8.0, 102.40),
    ('ECOVIAS RIO MINAS', 'P11 São Francisco do Glória', 1.0, 11.80),
    ('ECOVIAS RIO MINAS', 'P11 São Francisco do Glória', 1.5, 17.70),
    ('ECOVIAS RIO MINAS', 'P11 São Francisco do Glória', 2.0, 23.60),
    ('ECOVIAS RIO MINAS', 'P11 São Francisco do Glória', 3.0, 35.40),
    ('ECOVIAS RIO MINAS', 'P11 São Francisco do Glória', 4.0, 47.20),
    ('ECOVIAS RIO MINAS', 'P11 São Francisco do Glória', 5.0, 59.00),
    ('ECOVIAS RIO MINAS', 'P11 São Francisco do Glória', 6.0, 70.80),
    ('ECOVIAS RIO MINAS', 'P11 São Francisco do Glória', 7.0, 82.60),
    ('ECOVIAS RIO MINAS', 'P11 São Francisco do Glória', 8.0, 94.40),
    ('ECOVIAS RIO MINAS', 'P12 São João do Manhuaçu', 1.0, 9.70),
    ('ECOVIAS RIO MINAS', 'P12 São João do Manhuaçu', 1.5, 14.55),
    ('ECOVIAS RIO MINAS', 'P12 São João do Manhuaçu', 2.0, 19.40),
    ('ECOVIAS RIO MINAS', 'P12 São João do Manhuaçu', 3.0, 29.10),
    ('ECOVIAS RIO MINAS', 'P12 São João do Manhuaçu', 4.0, 38.80),
    ('ECOVIAS RIO MINAS', 'P12 São João do Manhuaçu', 5.0, 48.50),
    ('ECOVIAS RIO MINAS', 'P12 São João do Manhuaçu', 6.0, 58.20),
    ('ECOVIAS RIO MINAS', 'P12 São João do Manhuaçu', 7.0, 67.90),
    ('ECOVIAS RIO MINAS', 'P12 São João do Manhuaçu', 8.0, 77.60),
    ('ECOVIAS RIO MINAS', 'P13 Santa Bárbara do Leste', 1.0, 10.70),
    ('ECOVIAS RIO MINAS', 'P13 Santa Bárbara do Leste', 1.5, 16.05),
    ('ECOVIAS RIO MINAS', 'P13 Santa Bárbara do Leste', 2.0, 21.40),
    ('ECOVIAS RIO MINAS', 'P13 Santa Bárbara do Leste', 3.0, 32.10),
    ('ECOVIAS RIO MINAS', 'P13 Santa Bárbara do Leste', 4.0, 42.80),
    ('ECOVIAS RIO MINAS', 'P13 Santa Bárbara do Leste', 5.0, 53.50),
    ('ECOVIAS RIO MINAS', 'P13 Santa Bárbara do Leste', 6.0, 64.20),
    ('ECOVIAS RIO MINAS', 'P13 Santa Bárbara do Leste', 7.0, 74.90),
    ('ECOVIAS RIO MINAS', 'P13 Santa Bárbara do Leste', 8.0, 85.60),
    ('ECOVIAS RIO MINAS', 'P14 Inhapim', 1.0, 13.20),
    ('ECOVIAS RIO MINAS', 'P14 Inhapim', 1.5, 19.80),
    ('ECOVIAS RIO MINAS', 'P14 Inhapim', 2.0, 26.40),
    ('ECOVIAS RIO MINAS', 'P14 Inhapim', 3.0, 39.60),
    ('ECOVIAS RIO MINAS', 'P14 Inhapim', 4.0, 52.80),
    ('ECOVIAS RIO MINAS', 'P14 Inhapim', 5.0, 66.00),
    ('ECOVIAS RIO MINAS', 'P14 Inhapim', 6.0, 79.20),
    ('ECOVIAS RIO MINAS', 'P14 Inhapim', 7.0, 92.40),
    ('ECOVIAS RIO MINAS', 'P14 Inhapim', 8.0, 105.60),
    ('ECOVIAS RIO MINAS', 'P15 Engenheiro Caldas', 1.0, 10.60),
    ('ECOVIAS RIO MINAS', 'P15 Engenheiro Caldas', 1.5, 15.90),
    ('ECOVIAS RIO MINAS', 'P15 Engenheiro Caldas', 2.0, 21.20),
    ('ECOVIAS RIO MINAS', 'P15 Engenheiro Caldas', 3.0, 31.80),
    ('ECOVIAS RIO MINAS', 'P15 Engenheiro Caldas', 4.0, 42.40),
    ('ECOVIAS RIO MINAS', 'P15 Engenheiro Caldas', 5.0, 53.00),
    ('ECOVIAS RIO MINAS', 'P15 Engenheiro Caldas', 6.0, 63.60),
    ('ECOVIAS RIO MINAS', 'P15 Engenheiro Caldas', 7.0, 74.20),
    ('ECOVIAS RIO MINAS', 'P15 Engenheiro Caldas', 8.0, 84.80)

) as v (concessionaria, plaza_name, multiplier, amount)
join toll_plazas p on p.concessionaria = v.concessionaria and p.name = v.plaza_name
join toll_axle_categories c on c.multiplier = v.multiplier
on conflict (toll_plaza_id, category_id, valid_from) do nothing;
