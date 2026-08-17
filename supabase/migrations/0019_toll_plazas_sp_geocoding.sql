-- CotaFlow — Geocoding das praças de SP (ARTESP) por município.
--
-- A ARTESP não publica lat/long (só rodovia+km — ver 0015), então o
-- matching de rota (tollMatching.ts) não achava nenhuma praça de SP. Este
-- arquivo resolve uma coordenada aproximada por cidade via Nominatim, para
-- cada uma das 147 praças, e grava a precisão real (não estimada por
-- casas decimais — ver 0018) junto.
--
-- Mapeamento de praça -> cidade feito à mão, não por regex: nomes como
-- "Piratininga (CART)", "Gramadão", "Restinga" não têm uma regra mecânica
-- confiável de extração. Onde a cidade não é a mesma da praça (ex: a
-- praça fica num bairro de outra cidade, ou é um ponto do Rodoanel sem
-- nome de cidade nenhum no rótulo), a aproximação é reconhecidamente mais
-- grosseira e entra com precisão bem mais larga (6.000 a 15.000 m).
--
-- IMPORTANTE — isso é geocoding por CENTRO DE CIDADE, não a coordenada
-- real da praça. Confirmado em teste real: numa mesma região metropolitana
-- com rodovias paralelas (Anhanguera/Bandeirantes) ou rodovias diferentes
-- passando perto uma da outra (Campinas/Jundiaí), o matching pode casar
-- praças de MAIS de uma rodovia para a mesma rota, porque o centro da
-- cidade não diferencia em qual rodovia a praça realmente fica. É por
-- isso que confidenceFor() nunca dá "alta" confiança pra essas praças
-- (coordinate_precision_m sempre acima do limite de alta confiança) — o
-- resultado deve ser conferido em "Ver praças", não tomado como certeza.
-- Resolver isso de vez exigiria a coordenada real de cada praça (survey
-- próprio ou achar o nó de pedágio no OpenStreetMap), não só geocoding.

with plaza_data (name, concessionaria, latitude, longitude, precision_m) as (
  values

    -- AUTOBAN
    ('Caieiras', 'AUTOBAN', -23.3644621, -46.7484765, 3000),
    ('Campo Limpo', 'AUTOBAN', -23.207791, -46.788919, 3000),
    ('Itupeva', 'AUTOBAN', -23.1531055, -47.0580347, 3000),
    ('Limeira', 'AUTOBAN', -22.5615068, -47.401766, 3000),
    ('Limeira (Bandeirantes)', 'AUTOBAN', -22.5615068, -47.401766, 3000),
    ('Nova Odessa', 'AUTOBAN', -22.7805746, -47.2993805, 3000),
    ('Perus', 'AUTOBAN', -23.4084915, -46.7436432, 5000),
    ('Sumaré', 'AUTOBAN', -22.8217964, -47.267105, 3000),
    ('Valinhos', 'AUTOBAN', -22.97056, -46.99583, 3000),
    ('Valinhos (P2)', 'AUTOBAN', -22.97056, -46.99583, 3000),

    -- CART
    ('Assis', 'CART', -22.6620892, -50.420623, 3000),
    ('Caiuá', 'CART', -21.8319357, -51.9887179, 3000),
    ('Ourinhos', 'CART', -22.9777918, -49.868204, 3000),
    ('Palmital', 'CART', -22.786384, -50.2198965, 3000),
    ('Piratininga (CART)', 'CART', -22.4136363, -49.1351479, 3000),
    ('Presidente Bernardes', 'CART', -22.0064609, -51.5542973, 3000),
    ('Rancharia', 'CART', -22.2294981, -50.8922333, 3000),
    ('Regente Feijó', 'CART', -22.2191056, -51.3034558, 3000),
    ('Santa Cruz do Rio Pardo', 'CART', -22.9060715, -49.6277378, 3000),

    -- COLINAS
    ('Boituva', 'COLINAS', -23.2838893, -47.6738231, 3000),
    ('Boituva (Bloqueio)', 'COLINAS', -23.2838893, -47.6738231, 3000),
    ('Indaiatuba', 'COLINAS', -23.0908356, -47.2180677, 3000),
    ('Indaiatuba (Bloqueio)', 'COLINAS', -23.0908356, -47.2180677, 3000),
    ('Itupeva (Colinas)', 'COLINAS', -23.1531055, -47.0580347, 3000),
    ('Pórtico Aeroporto (PaP)', 'COLINAS', -23.0908356, -47.2180677, 6000),
    ('Pórtico Bloqueio Indaiatuba (PaP)', 'COLINAS', -23.0908356, -47.2180677, 3000),
    ('Pórtico Campinas (PaP)', 'COLINAS', -22.9056391, -47.059564, 6000),
    ('Pórtico Itu 1 (PaP)', 'COLINAS', -23.2637798, -47.2998462, 3000),
    ('Pórtico Itu 2 (PaP)', 'COLINAS', -23.2637798, -47.2998462, 3000),
    ('Pórtico Praça Indaiatuba (PaP)', 'COLINAS', -23.0908356, -47.2180677, 3000),
    ('Pórtico Salto 1 (PaP)', 'COLINAS', -23.1989983, -47.2913682, 3000),
    ('Pórtico Salto 2 (PaP)', 'COLINAS', -23.1989983, -47.2913682, 3000),
    ('Pórtico Salto 3 (PaP)', 'COLINAS', -23.1989983, -47.2913682, 3000),
    ('Porto Feliz', 'COLINAS', -23.2110713, -47.5247163, 3000),
    ('Rio Claro (Colinas)', 'COLINAS', -22.4100108, -47.5603933, 3000),
    ('Rio das Pedras', 'COLINAS', -22.8441256, -47.6065667, 3000),

    -- ECOPISTAS
    ('Caçapava', 'ECOPISTAS', -23.099204, -45.707645, 3000),
    ('Guararema', 'ECOPISTAS', -23.4136776, -46.0383744, 3000),
    ('Itaquaquecetuba', 'ECOPISTAS', -23.4754492, -46.3514033, 3000),
    ('São José dos Campos', 'ECOPISTAS', -23.1867782, -45.8854538, 6000),

    -- ECOVIAS IMIGRANTES
    ('Batistini (Bloqueio)', 'ECOVIAS IMIGRANTES', -23.7080345, -46.5506747, 8000),
    ('Diadema (Bloqueio)', 'ECOVIAS IMIGRANTES', -23.6866428, -46.6246935, 3000),
    ('Eldorado (Bloqueio)', 'ECOVIAS IMIGRANTES', -23.7080345, -46.5506747, 8000),
    ('Piratininga (Imigrantes)', 'ECOVIAS IMIGRANTES', -23.9664177, -46.3861401, 5000),
    ('Riacho Grande', 'ECOVIAS IMIGRANTES', -23.7080345, -46.5506747, 8000),
    ('Santos', 'ECOVIAS IMIGRANTES', -23.9609448, -46.3166316, 6000),
    ('São Vicente', 'ECOVIAS IMIGRANTES', -23.9664177, -46.3861401, 5000),

    -- INTERVIAS
    ('Araras', 'INTERVIAS', -22.3569192, -47.3838766, 3000),
    ('Descalvado', 'INTERVIAS', -21.8797111, -47.6507427, 3000),
    ('Iracemápolis', 'INTERVIAS', -22.5869091, -47.5160966, 3000),
    ('Leme', 'INTERVIAS', -22.1844807, -47.385295, 3000),
    ('Limeira (Intervias)', 'INTERVIAS', -22.5615068, -47.401766, 3000),
    ('Mogi Mirim', 'INTERVIAS', -22.433123, -46.958246, 3000),
    ('Pirassununga', 'INTERVIAS', -21.9980468, -47.4280861, 3000),
    ('Rio Claro', 'INTERVIAS', -22.4100108, -47.5603933, 3000),
    ('Santa Cruz das Palmeiras', 'INTERVIAS', -21.823475, -47.248023, 3000),

    -- RENOVIAS
    ('Aguaí', 'RENOVIAS', -22.0592036, -46.979384, 3000),
    ('Águas da Prata', 'RENOVIAS', -21.9464285, -46.7192121, 3000),
    ('Casa Branca', 'RENOVIAS', -21.7743137, -47.0852175, 3000),
    ('Espírito Santo do Pinhal', 'RENOVIAS', -22.1929522, -46.7470021, 3000),
    ('Estiva Gerbi', 'RENOVIAS', -22.2742719, -46.9523302, 3000),
    ('Itobi', 'RENOVIAS', -21.730853, -46.9743, 3000),
    ('Jaguariúna', 'RENOVIAS', -22.70374, -46.985062, 3000),
    ('Mococa', 'RENOVIAS', -21.464731, -47.002405, 3000),
    ('Pórtico Jaguariúna', 'RENOVIAS', -22.70374, -46.985062, 3000),
    ('Pórtico Santo Antônio de Posse', 'RENOVIAS', -22.6053304, -46.9197291, 3000),
    ('São João da Boa Vista', 'RENOVIAS', -21.9687099, -46.7969216, 3000),

    -- RODOANEL OESTE
    ('Rodoanel Oeste - Praça 1 (Raimundo Pereira de Magalhães)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 10 (Padroeira E Ramo A)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 11 (Raposo Tavares I Ramo E)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 12 (Raposo Tavares E Ramo A)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 13 (Osasco E - Régis Bittencourt)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 2 (Bandeirantes I Ramo F)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 3 (Bandeirantes E Ramo A)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 4 (Anhanguera I Ramo F)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 5 (Anhanguera I Ramo E)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 6 (Anhanguera E Ramo A)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 7 (Castelo Branco I Ramo E)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 8 (Castelo Branco E Ramo A)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Oeste - Praça 9 (Padroeira I Ramo F)', 'RODOANEL OESTE', -23.5506507, -46.6333824, 15000),

    -- RODOVIA DOS TAMOIOS
    ('Caraguatatuba', 'RODOVIA DOS TAMOIOS', -23.62028, -45.41306, 3000),
    ('Jambeiro', 'RODOVIA DOS TAMOIOS', -23.2556416, -45.6919926, 3000),
    ('Paraibuna', 'RODOVIA DOS TAMOIOS', -23.3864203, -45.6626797, 3000),

    -- RODOVIAS DO TIETÊ
    ('Agudos', 'RODOVIAS DO TIETÊ', -22.4719836, -48.9884476, 3000),
    ('Anhembi', 'RODOVIAS DO TIETÊ', -22.7891096, -48.1316776, 3000),
    ('Areiópolis', 'RODOVIAS DO TIETÊ', -22.6758064, -48.6673653, 3000),
    ('Botucatu (Tietê)', 'RODOVIAS DO TIETÊ', -22.8879628, -48.4410712, 3000),
    ('Conchas', 'RODOVIAS DO TIETÊ', -23.0133538, -48.0077595, 3000),
    ('Monte Mor', 'RODOVIAS DO TIETÊ', -22.945043, -47.312182, 3000),
    ('Rafard', 'RODOVIAS DO TIETÊ', -23.0143559, -47.5306721, 3000),
    ('Rio das Pedras (Açúcar)', 'RODOVIAS DO TIETÊ', -22.8441256, -47.6065667, 3000),
    ('Salto', 'RODOVIAS DO TIETÊ', -23.1989983, -47.2913682, 3000),

    -- ROTA DAS BANDEIRAS
    ('Atibaia', 'ROTA DAS BANDEIRAS', -23.1177393, -46.5547861, 3000),
    ('Engenheiro Coelho', 'ROTA DAS BANDEIRAS', -22.4896659, -47.2119005, 3000),
    ('Igaratá', 'ROTA DAS BANDEIRAS', -23.2063475, -46.156934, 3000),
    ('Itatiba', 'ROTA DAS BANDEIRAS', -23.0055542, -46.8397726, 3000),
    ('Jundiaí', 'ROTA DAS BANDEIRAS', -23.1887668, -46.884506, 5000),
    ('Louveira', 'ROTA DAS BANDEIRAS', -23.08639, -46.95056, 3000),
    ('Paulínia A', 'ROTA DAS BANDEIRAS', -22.7630391, -47.1532213, 3000),
    ('Paulínia B', 'ROTA DAS BANDEIRAS', -22.7630391, -47.1532213, 3000),
    ('Pórtico Cosmópolis (PaP)', 'ROTA DAS BANDEIRAS', -22.6437398, -47.1972086, 3000),
    ('Pórtico Engenheiro Coelho (PaP)', 'ROTA DAS BANDEIRAS', -22.4896659, -47.2119005, 3000),
    ('Pórtico Jundiaí (PaP)', 'ROTA DAS BANDEIRAS', -23.1887668, -46.884506, 3000),
    ('Pórtico km 74 (PaP)', 'ROTA DAS BANDEIRAS', -23.1887668, -46.884506, 6000),
    ('Pórtico Paulínia A (PaP)', 'ROTA DAS BANDEIRAS', -22.7630391, -47.1532213, 3000),
    ('Pórtico Paulínia B (PaP)', 'ROTA DAS BANDEIRAS', -22.7630391, -47.1532213, 3000),
    ('Pórtico Paulínia Jd. Betel (PaP)', 'ROTA DAS BANDEIRAS', -22.7630391, -47.1532213, 3000),

    -- SPMAR
    ('Rodoanel Leste - Praça 1 (Alça de Ligação/Papa João XXIII)', 'SPMAR', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Leste - Praça 2 (Pista Interna/Trecho Sul)', 'SPMAR', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Leste - Praça 5 e 6 (Alça Interna e Externa/Ayrton Senna)', 'SPMAR', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Leste - Praça 7 (Interseção com Via Dutra)', 'SPMAR', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Sul - Praça 1 (Trecho Sul/Trecho Oeste, Pista Interna)', 'SPMAR', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Sul - Praça 2 (Trecho Sul/Imigrantes, Pista Externa)', 'SPMAR', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Sul - Praça 3 (Trecho Sul/Imigrantes, Pista Externa)', 'SPMAR', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Sul - Praça 4 (Trecho Sul/Imigrantes, Pista Interna)', 'SPMAR', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Sul - Praça 5 (Trecho Sul/Via Anchieta, Pista Interna)', 'SPMAR', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Sul - Praça 6 (Interseção Trecho Leste, Pista Externa)', 'SPMAR', -23.5506507, -46.6333824, 15000),
    ('Rodoanel Sul - Praça 7 (Av. Papa João XXIII, Mauá)', 'SPMAR', -23.6669527, -46.4616922, 5000),

    -- SPVIAS
    ('Alambari', 'SPVIAS', -23.550338, -47.897971, 3000),
    ('Avaré', 'SPVIAS', -23.1045215, -48.9259103, 3000),
    ('Buri', 'SPVIAS', -23.79849, -48.598924, 3000),
    ('Gramadão', 'SPVIAS', -23.3718195, -48.184685, 10000),
    ('Iaras', 'SPVIAS', -22.8742567, -49.1593923, 3000),
    ('Itararé', 'SPVIAS', -24.1010472, -49.3023836, 3000),
    ('Itatinga', 'SPVIAS', -23.1042417, -48.6134874, 3000),
    ('Morro do Alto (Itapetininga)', 'SPVIAS', -23.588607, -48.048326, 6000),
    ('Morro do Alto (Tatuí)', 'SPVIAS', -23.3489848, -47.8490165, 6000),
    ('Quadra', 'SPVIAS', -23.299332, -48.054657, 3000),

    -- VIAPAULISTA
    ('Batatais', 'VIAPAULISTA', -20.892867, -47.592149, 3000),
    ('Boa Esperança do Sul', 'VIAPAULISTA', -21.9930206, -48.3917372, 3000),
    ('Botucatu (ViaPaulista)', 'VIAPAULISTA', -22.8879628, -48.4410712, 3000),
    ('Cel. Macedo', 'VIAPAULISTA', -23.6304001, -49.313234, 3000),
    ('Guatapará', 'VIAPAULISTA', -21.496092, -48.0360685, 3000),
    ('Itai', 'VIAPAULISTA', -23.4172598, -49.0935788, 3000),
    ('Jaú', 'VIAPAULISTA', -22.2933031, -48.5593432, 5000),
    ('Restinga', 'VIAPAULISTA', -20.5381768, -47.4009795, 10000),
    ('Santa Rita do Passa Quatro', 'VIAPAULISTA', -21.7103738, -47.4777943, 3000),
    ('São Carlos', 'VIAPAULISTA', -22.0180395, -47.891154, 5000),
    ('São Simão', 'VIAPAULISTA', -21.479873, -47.5523028, 3000),

    -- VIARONDON
    ('Avaí', 'VIARONDON', -22.1564662, -49.3316395, 3000),
    ('Castilho', 'VIARONDON', -20.8695636, -51.4877792, 3000),
    ('Glicério', 'VIARONDON', -21.3814805, -50.2100452, 3000),
    ('Guaraçaí', 'VIARONDON', -21.0322387, -51.2100464, 3000),
    ('Lavínia', 'VIARONDON', -21.1665477, -51.0410539, 3000),
    ('Pirajuí', 'VIARONDON', -21.9957877, -49.4549675, 3000),
    ('Promissão', 'VIARONDON', -21.5404913, -49.8574709, 3000),
    ('Rubiácea', 'VIARONDON', -21.2996334, -50.7298698, 3000)
)
update toll_plazas p
set latitude = v.latitude,
    longitude = v.longitude,
    coordinate_precision_m = v.precision_m
from plaza_data v
where p.concessionaria = v.concessionaria
  and p.name = v.name
  and p.source = 'artesp';
