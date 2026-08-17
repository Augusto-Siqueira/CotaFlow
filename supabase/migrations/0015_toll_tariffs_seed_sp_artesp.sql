-- CotaFlow — Seed de praças e tarifas de pedágio do Estado de São Paulo.
--
-- Fonte: ARTESP, arquivo "Valor Atual das Tarifas"
-- (https://www.artesp.sp.gov.br/artesp/setor-regulado/rodovia/pedagios),
-- documento datado de 01/07/2025, mais o Anexo 1 da concessão ViaPaulista
-- (L29), vigência 23/11/2025 a 22/11/2026.
--
-- O arquivo consolidado da ARTESP só publica uma coluna "Comercial por
-- Eixo" por praça (não a tabela completa por categoria) — mas essa coluna
-- É a tarifa base (categoria M1_0), então as demais categorias são
-- derivadas via tarifa_base x multiplicador. Isso foi conferido batendo os
-- números com a tabela completa que a ViaPaulista publica separadamente
-- (Anexo 1): as duas seguem exatamente a mesma regra. A ViaPaulista, por
-- publicar os valores já calculados/arredondados por categoria, entra
-- aqui com os valores exatos do documento (coluna "Manual"), não
-- derivados — evita herdar diferença de arredondamento.
--
-- Sem coordenadas: a ARTESP só informa rodovia+km, não lat/long. Geocoding
-- fica para uma etapa posterior, antes do motor de matching com a rota.
--
-- Categorias derivadas para as praças "tarifa por eixo": M1_0 até M8_0.
-- Não inclui M0_5 (moto) nem M1_5 (semirreboque de passeio) porque o
-- resumo da ARTESP não distingue esses casos — só a ViaPaulista publica.
--
-- IDEMPOTENTE: pode ser reexecutado sem duplicar (todos os inserts têm
-- `on conflict do nothing`). Praça e tarifa são inseridas em statements
-- SEPARADOS de propósito — um CTE que escreve não fica visível para o
-- resto da mesma query, então o join da tarifa não enxergaria as praças
-- recém-inseridas se estivesse tudo num statement só.

-- 1) Praças -----------------------------------------------------------
insert into toll_plazas (name, concessionaria, rodovia, uf, km, source)
select v.name, v.concessionaria, v.rodovia, 'SP', v.km, 'artesp'
from (values

    -- LOTE 1 — AUTOBAN (Anhanguera-Bandeirantes)
    ('Perus', 'AUTOBAN', 'SP-330', 26.495, 13.70),
    ('Valinhos', 'AUTOBAN', 'SP-330', 82.000, 13.60),
    ('Valinhos (P2)', 'AUTOBAN', 'SP-330', 81.000, 13.60),
    ('Nova Odessa', 'AUTOBAN', 'SP-330', 118.000, 12.10),
    ('Limeira', 'AUTOBAN', 'SP-330', 152.000, 9.20),
    ('Caieiras', 'AUTOBAN', 'SP-348', 36.200, 13.70),
    ('Campo Limpo', 'AUTOBAN', 'SP-348', 39.047, 13.70),
    ('Itupeva', 'AUTOBAN', 'SP-348', 77.430, 13.60),
    ('Sumaré', 'AUTOBAN', 'SP-348', 115.520, 12.10),
    ('Limeira (Bandeirantes)', 'AUTOBAN', 'SP-348', 159.550, 9.20),

    -- LOTE 6 — INTERVIAS
    ('Mogi Mirim', 'INTERVIAS', 'SP-147', 52.000, 11.10),
    ('Limeira (Intervias)', 'INTERVIAS', 'SP-147', 91.300, 12.60),
    ('Iracemápolis', 'INTERVIAS', 'SP-147', 127.200, 8.60),
    ('Araras', 'INTERVIAS', 'SP-191', 27.500, 9.80),
    ('Rio Claro', 'INTERVIAS', 'SP-191', 59.000, 5.00),
    ('Santa Cruz das Palmeiras', 'INTERVIAS', 'SP-215', 65.550, 9.00),
    ('Descalvado', 'INTERVIAS', 'SP-215', 104.400, 9.20),
    ('Leme', 'INTERVIAS', 'SP-330', 181.760, 11.20),
    ('Pirassununga', 'INTERVIAS', 'SP-330', 215.000, 11.20),

    -- LOTE 11 — RENOVIAS
    ('Jaguariúna', 'RENOVIAS', 'SP-340', 123.500, 17.60),
    ('Estiva Gerbi', 'RENOVIAS', 'SP-340', 192.840, 10.50),
    ('Casa Branca', 'RENOVIAS', 'SP-340', 221.292, 9.40),
    ('Mococa', 'RENOVIAS', 'SP-340', 254.690, 8.90),
    ('Espírito Santo do Pinhal', 'RENOVIAS', 'SP-342', 191.890, 13.10),
    ('Águas da Prata', 'RENOVIAS', 'SP-342', 240.000, 6.30),
    ('Aguaí', 'RENOVIAS', 'SP-344', 219.000, 6.60),
    ('São João da Boa Vista', 'RENOVIAS', 'SP-344', 230.440, 7.40),
    ('Itobi', 'RENOVIAS', 'SP-350', 252.140, 13.40),
    ('Pórtico Jaguariúna', 'RENOVIAS', 'SP-340', 123.500, 8.80),
    ('Pórtico Santo Antônio de Posse', 'RENOVIAS', 'SP-340', 147.030, 8.80),

    -- LOTE 13 — Rodovias das Colinas
    ('Indaiatuba', 'COLINAS', 'SP-075', 60.800, 19.40),
    ('Indaiatuba (Bloqueio)', 'COLINAS', 'SP-075', 62.000, 19.40),
    ('Rio Claro (Colinas)', 'COLINAS', 'SP-127', 12.625, 8.80),
    ('Rio das Pedras', 'COLINAS', 'SP-127', 58.650, 14.20),
    ('Boituva (Bloqueio)', 'COLINAS', 'SP-280', 110.800, 13.80),
    ('Boituva', 'COLINAS', 'SP-280', 111.300, 13.80),
    ('Itupeva (Colinas)', 'COLINAS', 'SP-300', 76.680, 10.60),
    ('Porto Feliz', 'COLINAS', 'SP-300', 136.722, 11.00),
    ('Pórtico Aeroporto (PaP)', 'COLINAS', 'SP-075', 66.700, 1.50),
    ('Pórtico Bloqueio Indaiatuba (PaP)', 'COLINAS', 'SP-075', 62.000, 3.50),
    ('Pórtico Campinas (PaP)', 'COLINAS', 'SP-075', 70.650, 2.70),
    ('Pórtico Itu 1 (PaP)', 'COLINAS', 'SP-075', 26.750, 4.30),
    ('Pórtico Itu 2 (PaP)', 'COLINAS', 'SP-075', 32.100, 2.80),
    ('Pórtico Praça Indaiatuba (PaP)', 'COLINAS', 'SP-075', 60.800, 3.50),
    ('Pórtico Salto 1 (PaP)', 'COLINAS', 'SP-075', 33.150, 2.80),
    ('Pórtico Salto 2 (PaP)', 'COLINAS', 'SP-075', 43.350, 4.30),
    ('Pórtico Salto 3 (PaP)', 'COLINAS', 'SP-075', 44.400, 4.30),

    -- LOTE 20 — SPVias
    ('Morro do Alto (Tatuí)', 'SPVIAS', 'SP-127', 128.900, 15.90),
    ('Morro do Alto (Itapetininga)', 'SPVIAS', 'SP-127', 133.900, 15.90),
    ('Gramadão', 'SPVIAS', 'SP-127', 196.725, 14.30),
    ('Avaré', 'SPVIAS', 'SP-255', 240.300, 10.80),
    ('Buri', 'SPVIAS', 'SP-258', 250.145, 15.40),
    ('Itararé', 'SPVIAS', 'SP-258', 326.670, 9.90),
    ('Alambari', 'SPVIAS', 'SP-270', 135.300, 12.10),
    ('Quadra', 'SPVIAS', 'SP-280', 158.300, 19.40),
    ('Itatinga', 'SPVIAS', 'SP-280', 208.400, 19.40),
    ('Iaras', 'SPVIAS', 'SP-280', 278.000, 13.20),

    -- LOTE 22 — Ecovias dos Imigrantes
    ('Santos', 'ECOVIAS IMIGRANTES', 'SP-055', 250.464, 18.30),
    ('São Vicente', 'ECOVIAS IMIGRANTES', 'SP-055', 279.950, 10.90),
    ('Riacho Grande', 'ECOVIAS IMIGRANTES', 'SP-150', 31.106, 38.70),
    ('Diadema (Bloqueio)', 'ECOVIAS IMIGRANTES', 'SP-160', 15.917, 3.10),
    ('Eldorado (Bloqueio)', 'ECOVIAS IMIGRANTES', 'SP-160', 20.100, 5.70),
    ('Batistini (Bloqueio)', 'ECOVIAS IMIGRANTES', 'SP-160', 25.579, 9.10),
    ('Piratininga (Imigrantes)', 'ECOVIAS IMIGRANTES', 'SP-160', 32.381, 38.70),

    -- LOTE 7 — Rota das Bandeiras
    ('Louveira', 'ROTA DAS BANDEIRAS', 'SP-063', 10.370, 3.90),
    ('Igaratá', 'ROTA DAS BANDEIRAS', 'SP-065', 26.500, 13.30),
    ('Atibaia', 'ROTA DAS BANDEIRAS', 'SP-065', 79.900, 10.60),
    ('Itatiba', 'ROTA DAS BANDEIRAS', 'SP-065', 110.100, 15.30),
    ('Paulínia A', 'ROTA DAS BANDEIRAS', 'SP-332', 135.500, 12.00),
    ('Paulínia B', 'ROTA DAS BANDEIRAS', 'SP-332', 132.550, 16.70),
    ('Engenheiro Coelho', 'ROTA DAS BANDEIRAS', 'SP-332', 159.700, 9.20),
    ('Jundiaí', 'ROTA DAS BANDEIRAS', 'SP-360', 77.100, 6.10),
    ('Pórtico Paulínia Jd. Betel (PaP)', 'ROTA DAS BANDEIRAS', 'SP-332', 119.100, 5.50),
    ('Pórtico km 74 (PaP)', 'ROTA DAS BANDEIRAS', 'SP-360', 74.000, 3.80),
    ('Pórtico Cosmópolis (PaP)', 'ROTA DAS BANDEIRAS', 'SP-332', 146.500, 1.30),
    ('Pórtico Engenheiro Coelho (PaP)', 'ROTA DAS BANDEIRAS', 'SP-332', 159.700, 7.90),
    ('Pórtico Jundiaí (PaP)', 'ROTA DAS BANDEIRAS', 'SP-360', 77.100, 2.30),
    ('Pórtico Paulínia A (PaP)', 'ROTA DAS BANDEIRAS', 'SP-332', 135.500, 6.50),
    ('Pórtico Paulínia B (PaP)', 'ROTA DAS BANDEIRAS', 'SP-332', 132.550, 5.70),

    -- LOTE 16 — CART (Auto Raposo Tavares)
    ('Piratininga (CART)', 'CART', 'SP-225', 251.900, 10.20),
    ('Santa Cruz do Rio Pardo', 'CART', 'SP-225', 300.930, 9.90),
    ('Palmital', 'CART', 'SP-270', 413.490, 12.20),
    ('Assis', 'CART', 'SP-270', 453.590, 12.70),
    ('Rancharia', 'CART', 'SP-270', 512.300, 10.40),
    ('Regente Feijó', 'CART', 'SP-270', 541.540, 10.40),
    ('Presidente Bernardes', 'CART', 'SP-270', 590.750, 13.70),
    ('Caiuá', 'CART', 'SP-270', 639.000, 10.30),
    ('Ourinhos', 'CART', 'SP-327', 14.500, 10.30),

    -- LOTE 19 — ViaRondon
    ('Avaí', 'VIARONDON', 'SP-300', 367.767, 8.50),
    ('Pirajuí', 'VIARONDON', 'SP-300', 400.833, 8.00),
    ('Promissão', 'VIARONDON', 'SP-300', 455.715, 9.60),
    ('Glicério', 'VIARONDON', 'SP-300', 497.912, 10.60),
    ('Rubiácea', 'VIARONDON', 'SP-300', 562.008, 9.10),
    ('Lavínia', 'VIARONDON', 'SP-300', 590.482, 7.20),
    ('Guaraçaí', 'VIARONDON', 'SP-300', 621.270, 7.00),
    ('Castilho', 'VIARONDON', 'SP-300', 655.485, 5.20),

    -- LOTE 21 — Rodovias do Tietê
    ('Monte Mor', 'RODOVIAS DO TIETÊ', 'SP-101', 29.700, 10.10),
    ('Rafard', 'RODOVIAS DO TIETÊ', 'SP-101', 55.800, 7.20),
    ('Conchas', 'RODOVIAS DO TIETÊ', 'SP-300', 192.100, 9.70),
    ('Anhembi', 'RODOVIAS DO TIETÊ', 'SP-300', 228.200, 11.00),
    ('Botucatu (Tietê)', 'RODOVIAS DO TIETÊ', 'SP-300', 259.300, 7.70),
    ('Areiópolis', 'RODOVIAS DO TIETÊ', 'SP-300', 285.000, 8.60),
    ('Agudos', 'RODOVIAS DO TIETÊ', 'SP-300', 314.000, 8.40),
    ('Salto', 'RODOVIAS DO TIETÊ', 'SP-308', 109.300, 4.90),
    ('Rio das Pedras (Açúcar)', 'RODOVIAS DO TIETÊ', 'SP-308', 147.300, 11.00),

    -- LOTE 23 — Ecopistas
    ('Itaquaquecetuba', 'ECOPISTAS', 'SP-070', 32.900, 5.70),
    ('Guararema', 'ECOPISTAS', 'SP-070', 57.800, 5.40),
    ('São José dos Campos', 'ECOPISTAS', 'SP-070', 92.500, 5.40),
    ('Caçapava', 'ECOPISTAS', 'SP-070', 114.000, 5.50),

    -- LOTE 24 — Rodoanel Mário Covas, Trecho Oeste
    ('Rodoanel Oeste - Praça 1 (Raimundo Pereira de Magalhães)', 'RODOANEL OESTE', 'SP-021', 0.360, 3.50),
    ('Rodoanel Oeste - Praça 2 (Bandeirantes I Ramo F)', 'RODOANEL OESTE', 'SP-021', 3.630, 3.50),
    ('Rodoanel Oeste - Praça 3 (Bandeirantes E Ramo A)', 'RODOANEL OESTE', 'SP-021', 3.050, 3.50),
    ('Rodoanel Oeste - Praça 4 (Anhanguera I Ramo F)', 'RODOANEL OESTE', 'SP-021', 7.000, 3.50),
    ('Rodoanel Oeste - Praça 5 (Anhanguera I Ramo E)', 'RODOANEL OESTE', 'SP-021', 6.790, 3.50),
    ('Rodoanel Oeste - Praça 6 (Anhanguera E Ramo A)', 'RODOANEL OESTE', 'SP-021', 6.210, 3.50),
    ('Rodoanel Oeste - Praça 7 (Castelo Branco I Ramo E)', 'RODOANEL OESTE', 'SP-021', 15.610, 3.50),
    ('Rodoanel Oeste - Praça 8 (Castelo Branco E Ramo A)', 'RODOANEL OESTE', 'SP-021', 14.290, 3.50),
    ('Rodoanel Oeste - Praça 9 (Padroeira I Ramo F)', 'RODOANEL OESTE', 'SP-021', 20.870, 3.50),
    ('Rodoanel Oeste - Praça 10 (Padroeira E Ramo A)', 'RODOANEL OESTE', 'SP-021', 19.460, 3.50),
    ('Rodoanel Oeste - Praça 11 (Raposo Tavares I Ramo E)', 'RODOANEL OESTE', 'SP-021', 24.700, 3.50),
    ('Rodoanel Oeste - Praça 12 (Raposo Tavares E Ramo A)', 'RODOANEL OESTE', 'SP-021', 24.000, 3.50),
    ('Rodoanel Oeste - Praça 13 (Osasco E - Régis Bittencourt)', 'RODOANEL OESTE', 'SP-021', 25.360, 3.50),

    -- LOTE 25 — SPMar, Trecho Sul
    ('Rodoanel Sul - Praça 1 (Trecho Sul/Trecho Oeste, Pista Interna)', 'SPMAR', 'SP-021', 50.000, 5.40),
    ('Rodoanel Sul - Praça 2 (Trecho Sul/Imigrantes, Pista Externa)', 'SPMAR', 'SP-021', 70.200, 5.40),
    ('Rodoanel Sul - Praça 3 (Trecho Sul/Imigrantes, Pista Externa)', 'SPMAR', 'SP-021', 70.300, 5.40),
    ('Rodoanel Sul - Praça 4 (Trecho Sul/Imigrantes, Pista Interna)', 'SPMAR', 'SP-021', 71.400, 5.40),
    ('Rodoanel Sul - Praça 5 (Trecho Sul/Via Anchieta, Pista Interna)', 'SPMAR', 'SP-021', 75.500, 5.40),
    ('Rodoanel Sul - Praça 6 (Interseção Trecho Leste, Pista Externa)', 'SPMAR', 'SP-021', 86.950, 5.40),
    ('Rodoanel Sul - Praça 7 (Av. Papa João XXIII, Mauá)', 'SPMAR', 'SPA-086/021', 0.300, 5.40),

    -- LOTE 25 — SPMar, Trecho Leste
    ('Rodoanel Leste - Praça 1 (Alça de Ligação/Papa João XXIII)', 'SPMAR', 'SP-021', 88.000, 4.10),
    ('Rodoanel Leste - Praça 2 (Pista Interna/Trecho Sul)', 'SPMAR', 'SP-021', 87.940, 4.10),
    ('Rodoanel Leste - Praça 5 e 6 (Alça Interna e Externa/Ayrton Senna)', 'SPMAR', 'SP-021', 124.740, 4.10),
    ('Rodoanel Leste - Praça 7 (Interseção com Via Dutra)', 'SPMAR', 'SP-021', 127.485, 4.10),

    -- LOTE 27 — Rodovia dos Tamoios
    ('Jambeiro', 'RODOVIA DOS TAMOIOS', 'SP-099', 16.100, 5.80),
    ('Paraibuna', 'RODOVIA DOS TAMOIOS', 'SP-099', 59.300, 12.30),
    ('Caraguatatuba', 'RODOVIA DOS TAMOIOS', 'SPI-097/055', 13.500, 5.50)
) as v (name, concessionaria, rodovia, km, base_rate)
on conflict (concessionaria, name) do nothing;

-- 2) Tarifas derivadas (tarifa_base x multiplicador) -------------------
insert into toll_tariffs (toll_plaza_id, category_id, amount, valid_from, source, source_reference)
select p.id, c.id, v.base_rate * c.multiplier, date '2025-07-01', 'artesp',
       'Valor Atual das Tarifas — ARTESP, 01/07/2025'
from (values

    -- LOTE 1 — AUTOBAN (Anhanguera-Bandeirantes)
    ('AUTOBAN', 'Perus', 13.70),
    ('AUTOBAN', 'Valinhos', 13.60),
    ('AUTOBAN', 'Valinhos (P2)', 13.60),
    ('AUTOBAN', 'Nova Odessa', 12.10),
    ('AUTOBAN', 'Limeira', 9.20),
    ('AUTOBAN', 'Caieiras', 13.70),
    ('AUTOBAN', 'Campo Limpo', 13.70),
    ('AUTOBAN', 'Itupeva', 13.60),
    ('AUTOBAN', 'Sumaré', 12.10),
    ('AUTOBAN', 'Limeira (Bandeirantes)', 9.20),

    -- LOTE 6 — INTERVIAS
    ('INTERVIAS', 'Mogi Mirim', 11.10),
    ('INTERVIAS', 'Limeira (Intervias)', 12.60),
    ('INTERVIAS', 'Iracemápolis', 8.60),
    ('INTERVIAS', 'Araras', 9.80),
    ('INTERVIAS', 'Rio Claro', 5.00),
    ('INTERVIAS', 'Santa Cruz das Palmeiras', 9.00),
    ('INTERVIAS', 'Descalvado', 9.20),
    ('INTERVIAS', 'Leme', 11.20),
    ('INTERVIAS', 'Pirassununga', 11.20),

    -- LOTE 11 — RENOVIAS
    ('RENOVIAS', 'Jaguariúna', 17.60),
    ('RENOVIAS', 'Estiva Gerbi', 10.50),
    ('RENOVIAS', 'Casa Branca', 9.40),
    ('RENOVIAS', 'Mococa', 8.90),
    ('RENOVIAS', 'Espírito Santo do Pinhal', 13.10),
    ('RENOVIAS', 'Águas da Prata', 6.30),
    ('RENOVIAS', 'Aguaí', 6.60),
    ('RENOVIAS', 'São João da Boa Vista', 7.40),
    ('RENOVIAS', 'Itobi', 13.40),
    ('RENOVIAS', 'Pórtico Jaguariúna', 8.80),
    ('RENOVIAS', 'Pórtico Santo Antônio de Posse', 8.80),

    -- LOTE 13 — Rodovias das Colinas
    ('COLINAS', 'Indaiatuba', 19.40),
    ('COLINAS', 'Indaiatuba (Bloqueio)', 19.40),
    ('COLINAS', 'Rio Claro (Colinas)', 8.80),
    ('COLINAS', 'Rio das Pedras', 14.20),
    ('COLINAS', 'Boituva (Bloqueio)', 13.80),
    ('COLINAS', 'Boituva', 13.80),
    ('COLINAS', 'Itupeva (Colinas)', 10.60),
    ('COLINAS', 'Porto Feliz', 11.00),
    ('COLINAS', 'Pórtico Aeroporto (PaP)', 1.50),
    ('COLINAS', 'Pórtico Bloqueio Indaiatuba (PaP)', 3.50),
    ('COLINAS', 'Pórtico Campinas (PaP)', 2.70),
    ('COLINAS', 'Pórtico Itu 1 (PaP)', 4.30),
    ('COLINAS', 'Pórtico Itu 2 (PaP)', 2.80),
    ('COLINAS', 'Pórtico Praça Indaiatuba (PaP)', 3.50),
    ('COLINAS', 'Pórtico Salto 1 (PaP)', 2.80),
    ('COLINAS', 'Pórtico Salto 2 (PaP)', 4.30),
    ('COLINAS', 'Pórtico Salto 3 (PaP)', 4.30),

    -- LOTE 20 — SPVias
    ('SPVIAS', 'Morro do Alto (Tatuí)', 15.90),
    ('SPVIAS', 'Morro do Alto (Itapetininga)', 15.90),
    ('SPVIAS', 'Gramadão', 14.30),
    ('SPVIAS', 'Avaré', 10.80),
    ('SPVIAS', 'Buri', 15.40),
    ('SPVIAS', 'Itararé', 9.90),
    ('SPVIAS', 'Alambari', 12.10),
    ('SPVIAS', 'Quadra', 19.40),
    ('SPVIAS', 'Itatinga', 19.40),
    ('SPVIAS', 'Iaras', 13.20),

    -- LOTE 22 — Ecovias dos Imigrantes
    ('ECOVIAS IMIGRANTES', 'Santos', 18.30),
    ('ECOVIAS IMIGRANTES', 'São Vicente', 10.90),
    ('ECOVIAS IMIGRANTES', 'Riacho Grande', 38.70),
    ('ECOVIAS IMIGRANTES', 'Diadema (Bloqueio)', 3.10),
    ('ECOVIAS IMIGRANTES', 'Eldorado (Bloqueio)', 5.70),
    ('ECOVIAS IMIGRANTES', 'Batistini (Bloqueio)', 9.10),
    ('ECOVIAS IMIGRANTES', 'Piratininga (Imigrantes)', 38.70),

    -- LOTE 7 — Rota das Bandeiras
    ('ROTA DAS BANDEIRAS', 'Louveira', 3.90),
    ('ROTA DAS BANDEIRAS', 'Igaratá', 13.30),
    ('ROTA DAS BANDEIRAS', 'Atibaia', 10.60),
    ('ROTA DAS BANDEIRAS', 'Itatiba', 15.30),
    ('ROTA DAS BANDEIRAS', 'Paulínia A', 12.00),
    ('ROTA DAS BANDEIRAS', 'Paulínia B', 16.70),
    ('ROTA DAS BANDEIRAS', 'Engenheiro Coelho', 9.20),
    ('ROTA DAS BANDEIRAS', 'Jundiaí', 6.10),
    ('ROTA DAS BANDEIRAS', 'Pórtico Paulínia Jd. Betel (PaP)', 5.50),
    ('ROTA DAS BANDEIRAS', 'Pórtico km 74 (PaP)', 3.80),
    ('ROTA DAS BANDEIRAS', 'Pórtico Cosmópolis (PaP)', 1.30),
    ('ROTA DAS BANDEIRAS', 'Pórtico Engenheiro Coelho (PaP)', 7.90),
    ('ROTA DAS BANDEIRAS', 'Pórtico Jundiaí (PaP)', 2.30),
    ('ROTA DAS BANDEIRAS', 'Pórtico Paulínia A (PaP)', 6.50),
    ('ROTA DAS BANDEIRAS', 'Pórtico Paulínia B (PaP)', 5.70),

    -- LOTE 16 — CART (Auto Raposo Tavares)
    ('CART', 'Piratininga (CART)', 10.20),
    ('CART', 'Santa Cruz do Rio Pardo', 9.90),
    ('CART', 'Palmital', 12.20),
    ('CART', 'Assis', 12.70),
    ('CART', 'Rancharia', 10.40),
    ('CART', 'Regente Feijó', 10.40),
    ('CART', 'Presidente Bernardes', 13.70),
    ('CART', 'Caiuá', 10.30),
    ('CART', 'Ourinhos', 10.30),

    -- LOTE 19 — ViaRondon
    ('VIARONDON', 'Avaí', 8.50),
    ('VIARONDON', 'Pirajuí', 8.00),
    ('VIARONDON', 'Promissão', 9.60),
    ('VIARONDON', 'Glicério', 10.60),
    ('VIARONDON', 'Rubiácea', 9.10),
    ('VIARONDON', 'Lavínia', 7.20),
    ('VIARONDON', 'Guaraçaí', 7.00),
    ('VIARONDON', 'Castilho', 5.20),

    -- LOTE 21 — Rodovias do Tietê
    ('RODOVIAS DO TIETÊ', 'Monte Mor', 10.10),
    ('RODOVIAS DO TIETÊ', 'Rafard', 7.20),
    ('RODOVIAS DO TIETÊ', 'Conchas', 9.70),
    ('RODOVIAS DO TIETÊ', 'Anhembi', 11.00),
    ('RODOVIAS DO TIETÊ', 'Botucatu (Tietê)', 7.70),
    ('RODOVIAS DO TIETÊ', 'Areiópolis', 8.60),
    ('RODOVIAS DO TIETÊ', 'Agudos', 8.40),
    ('RODOVIAS DO TIETÊ', 'Salto', 4.90),
    ('RODOVIAS DO TIETÊ', 'Rio das Pedras (Açúcar)', 11.00),

    -- LOTE 23 — Ecopistas
    ('ECOPISTAS', 'Itaquaquecetuba', 5.70),
    ('ECOPISTAS', 'Guararema', 5.40),
    ('ECOPISTAS', 'São José dos Campos', 5.40),
    ('ECOPISTAS', 'Caçapava', 5.50),

    -- LOTE 24 — Rodoanel Mário Covas, Trecho Oeste
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 1 (Raimundo Pereira de Magalhães)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 2 (Bandeirantes I Ramo F)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 3 (Bandeirantes E Ramo A)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 4 (Anhanguera I Ramo F)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 5 (Anhanguera I Ramo E)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 6 (Anhanguera E Ramo A)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 7 (Castelo Branco I Ramo E)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 8 (Castelo Branco E Ramo A)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 9 (Padroeira I Ramo F)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 10 (Padroeira E Ramo A)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 11 (Raposo Tavares I Ramo E)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 12 (Raposo Tavares E Ramo A)', 3.50),
    ('RODOANEL OESTE', 'Rodoanel Oeste - Praça 13 (Osasco E - Régis Bittencourt)', 3.50),

    -- LOTE 25 — SPMar, Trecho Sul
    ('SPMAR', 'Rodoanel Sul - Praça 1 (Trecho Sul/Trecho Oeste, Pista Interna)', 5.40),
    ('SPMAR', 'Rodoanel Sul - Praça 2 (Trecho Sul/Imigrantes, Pista Externa)', 5.40),
    ('SPMAR', 'Rodoanel Sul - Praça 3 (Trecho Sul/Imigrantes, Pista Externa)', 5.40),
    ('SPMAR', 'Rodoanel Sul - Praça 4 (Trecho Sul/Imigrantes, Pista Interna)', 5.40),
    ('SPMAR', 'Rodoanel Sul - Praça 5 (Trecho Sul/Via Anchieta, Pista Interna)', 5.40),
    ('SPMAR', 'Rodoanel Sul - Praça 6 (Interseção Trecho Leste, Pista Externa)', 5.40),
    ('SPMAR', 'Rodoanel Sul - Praça 7 (Av. Papa João XXIII, Mauá)', 5.40),

    -- LOTE 25 — SPMar, Trecho Leste
    ('SPMAR', 'Rodoanel Leste - Praça 1 (Alça de Ligação/Papa João XXIII)', 4.10),
    ('SPMAR', 'Rodoanel Leste - Praça 2 (Pista Interna/Trecho Sul)', 4.10),
    ('SPMAR', 'Rodoanel Leste - Praça 5 e 6 (Alça Interna e Externa/Ayrton Senna)', 4.10),
    ('SPMAR', 'Rodoanel Leste - Praça 7 (Interseção com Via Dutra)', 4.10),

    -- LOTE 27 — Rodovia dos Tamoios
    ('RODOVIA DOS TAMOIOS', 'Jambeiro', 5.80),
    ('RODOVIA DOS TAMOIOS', 'Paraibuna', 12.30),
    ('RODOVIA DOS TAMOIOS', 'Caraguatatuba', 5.50)
) as v (concessionaria, name, base_rate)
join toll_plazas p on p.concessionaria = v.concessionaria and p.name = v.name
cross join toll_axle_categories c
where c.code in ('M1_0', 'M2_0', 'M3_0', 'M4_0', 'M5_0', 'M6_0', 'M7_0', 'M8_0')
on conflict (toll_plaza_id, category_id, valid_from) do nothing;

-- 3) ViaPaulista (L29) — praças ----------------------------------------
-- Publica a tabela completa por categoria (Anexo 1), então as tarifas
-- entram com os valores exatos ("Manual"), não derivados.
insert into toll_plazas (name, concessionaria, rodovia, uf, km, source)
select v.name, 'VIAPAULISTA', v.rodovia, 'SP', v.km, 'artesp'
from (values
    ('Guatapará', 'SP-255', 45.500),
    ('Boa Esperança do Sul', 'SP-255', 117.220),
    ('Jaú', 'SP-255', 165.600),
    ('Botucatu (ViaPaulista)', 'SP-255', 229.040),
    ('Itai', 'SP-255', 306.000),
    ('Cel. Macedo', 'SP-255', 331.500),
    ('São Carlos', 'SP-318', 254.374),
    ('Santa Rita do Passa Quatro', 'SP-330', 253.000),
    ('São Simão', 'SP-330', 281.000),
    ('Batatais', 'SP-334', 344.000),
    ('Restinga', 'SP-334', 375.000)
) as v (name, rodovia, km)
on conflict (concessionaria, name) do nothing;

-- 4) ViaPaulista (L29) — tarifas exatas --------------------------------
insert into toll_tariffs (toll_plaza_id, category_id, amount, valid_from, valid_until, source, source_reference)
select p.id, c.id, v.amount, date '2025-11-23', date '2026-11-22', 'artesp',
       'Anexo 1 — Tabela de Tarifas de Pedágio, ViaPaulista (L29)'
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
