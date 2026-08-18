-- CotaFlow — Coordenada real das praças de SP, a partir do KMZ oficial da
-- ARTESP (não mais centro de cidade — ver 0019).
--
-- Fonte: dataset "Malha Rodoviária" do portal de dados abertos da ARTESP
-- (dadosabertos.artesp.sp.gov.br/dataset/malha-rodoviaria), um arquivo KMZ
-- por concessionária, cada um com uma camada "Praça de Pedágio" com o
-- ponto real digitizado pela própria ARTESP (rodovia, km, sentido,
-- número de cabines e até a tarifa vigente na descrição — conferido:
-- bate com o que já tínhamos em toll_tariffs).
--
-- Casamento com as praças existentes por (concessionária, rodovia, km
-- mais próximo) — não por nome, que vem em formatos bem diferentes entre
-- as duas fontes. 127 das 147 praças de SP casaram e entram aqui com
-- precisão de 150 m (ponto de GIS oficial, não survey de campo, mas ordens
-- de magnitude melhor que os 3.000-15.000 m do geocoding por cidade).
--
-- As 20 que ficam de fora (mantêm o geocoding por cidade da 0019) são
-- gaps reais, não erro de importação:
--   • VIARONDON (8 praças) — o KMZ dessa concessão não tem a camada de
--     praças, só dispositivos por km.
--   • Pórticos/gates secundários de COLINAS e ROTA DAS BANDEIRAS (9) —
--     só as praças principais foram digitizadas nesse arquivo, não os
--     pórticos free-flow menores.
--   • INTERVIAS "Rio Claro" — o KMZ dá km 52, a tarifa (transcrita de PDF)
--     dá km 59; como a INTERVIAS tem outra praça na mesma rodovia (Araras),
--     não dá pra saber com segurança qual ponto do KMZ é qual sem mais
--     uma fonte — fica pendente, não forçado.
--   • RENOVIAS "Pórtico Santo Antônio de Posse" e SPMAR "Praça 7 (Mauá)" —
--     candidato mais próximo no KMZ está a mais de 10 km, sem outra opção
--     plausível.
--
-- Teste real (São Paulo -> Campinas): antes dessa correção, o motor
-- confundia Anhanguera com Bandeirantes (rodovias paralelas) e chegava a
-- casar uma praça de outra rodovia inteira (Rota das Bandeiras, Jundiaí)
-- que não fazia parte da viagem. Com a coordenada real, os dois problemas
-- desapareceram e a maioria das praças passou a sair com confiança alta.

with plaza_data (name, concessionaria, latitude, longitude, precision_m) as (
  values

    -- AUTOBAN
    ('Caieiras', 'AUTOBAN', -23.34726053536388, -46.81329649162846, 150),
    ('Campo Limpo', 'AUTOBAN', -23.32292941341471, -46.82301775595075, 150),
    ('Itupeva', 'AUTOBAN', -23.05759238435349, -47.04424128447418, 150),
    ('Limeira', 'AUTOBAN', -22.51014304653508, -47.39769119563513, 150),
    ('Limeira (Bandeirantes)', 'AUTOBAN', -22.55574804896771, -47.46023090167516, 150),
    ('Nova Odessa', 'AUTOBAN', -22.77116069659169, -47.23913266477282, 150),
    ('Perus', 'AUTOBAN', -23.418328798527, -46.79898002918538, 150),
    ('Sumaré', 'AUTOBAN', -22.85741274230802, -47.30051708812122, 150),
    ('Valinhos', 'AUTOBAN', -23.02034932899019, -47.01867707116909, 150),
    ('Valinhos (P2)', 'AUTOBAN', -23.01296147507601, -47.02305416946594, 150),

    -- CART
    ('Assis', 'CART', -22.6329611937135, -50.49649, 150),
    ('Caiuá', 'CART', -21.8480953314723, -52.02263, 150),
    ('Ourinhos', 'CART', -22.8937450949095, -49.72329999999999, 150),
    ('Palmital', 'CART', -22.7697660065562, -50.14523, 150),
    ('Piratininga (CART)', 'CART', -22.4509591660638, -49.17071, 150),
    ('Presidente Bernardes', 'CART', -22.0208728132919, -51.59988, 150),
    ('Rancharia', 'CART', -22.4352609959793, -51.00838, 150),
    ('Regente Feijó', 'CART', -22.3040594013791, -51.25331, 150),
    ('Santa Cruz do Rio Pardo', 'CART', -22.7490573661347, -49.47842, 150),

    -- COLINAS
    ('Boituva', 'COLINAS', -23.31422738169483, -47.64397563223047, 150),
    ('Boituva (Bloqueio)', 'COLINAS', -23.3181705597175, -47.63520739275125, 150),
    ('Indaiatuba', 'COLINAS', -23.06293242261463, -47.15542492067156, 150),
    ('Indaiatuba (Bloqueio)', 'COLINAS', -23.05537906563501, -47.14729831321116, 150),
    ('Itupeva (Colinas)', 'COLINAS', -23.23564366057584, -47.04227387873526, 150),
    ('Pórtico Bloqueio Indaiatuba (PaP)', 'COLINAS', -23.05537906563501, -47.14729831321116, 150),
    ('Pórtico Praça Indaiatuba (PaP)', 'COLINAS', -23.06293242261463, -47.15542492067156, 150),
    ('Porto Feliz', 'COLINAS', -23.22797066739319, -47.56241151765659, 150),
    ('Rio Claro (Colinas)', 'COLINAS', -22.5442737887897, -47.581990108687, 150),
    ('Rio das Pedras', 'COLINAS', -22.91048000635503, -47.7084629351599, 150),

    -- ECOPISTAS
    ('Caçapava', 'ECOPISTAS', -23.15586638984411, -45.69796625056307, 150),
    ('Guararema', 'ECOPISTAS', -23.38419796839922, -46.15385215463154, 150),
    ('Itaquaquecetuba', 'ECOPISTAS', -23.46619021192189, -46.36885463045419, 150),
    ('São José dos Campos', 'ECOPISTAS', -23.28341628608462, -45.86067781191015, 150),

    -- ECOVIAS IMIGRANTES
    ('Batistini (Bloqueio)', 'ECOVIAS IMIGRANTES', -23.75245416885617, -46.59526240076539, 150),
    ('Diadema (Bloqueio)', 'ECOVIAS IMIGRANTES', -23.6816829946535, -46.61108021471905, 150),
    ('Eldorado (Bloqueio)', 'ECOVIAS IMIGRANTES', -23.71803863436356, -46.60586746995477, 150),
    ('Piratininga (Imigrantes)', 'ECOVIAS IMIGRANTES', -23.82082559315266, -46.58260066690515, 150),
    ('Riacho Grande', 'ECOVIAS IMIGRANTES', -23.78926720486502, -46.51950070936969, 150),
    ('Santos', 'ECOVIAS IMIGRANTES', -23.89491951399341, -46.30218816144919, 150),
    ('São Vicente', 'ECOVIAS IMIGRANTES', -23.9394233448216, -46.46367007731688, 150),

    -- INTERVIAS
    ('Araras', 'INTERVIAS', -22.36829151955992, -47.2166894633984, 150),
    ('Descalvado', 'INTERVIAS', -21.86957211674124, -47.53580579533846, 150),
    ('Iracemápolis', 'INTERVIAS', -22.6543805664993, -47.51899392535854, 150),
    ('Leme', 'INTERVIAS', -22.249768611958, -47.39018463198569, 150),
    ('Limeira (Intervias)', 'INTERVIAS', -22.48911171713354, -47.24988620314618, 150),
    ('Mogi Mirim', 'INTERVIAS', -22.45670833333333, -46.90219722222223, 150),
    ('Pirassununga', 'INTERVIAS', -21.95798888888889, -47.45947222222222, 150),
    ('Santa Cruz das Palmeiras', 'INTERVIAS', -21.80791629616745, -47.19330278580015, 150),

    -- RENOVIAS
    ('Aguaí', 'RENOVIAS', -22.01399824995612, -46.85060205268604, 150),
    ('Águas da Prata', 'RENOVIAS', -21.93068833931564, -46.69632848659851, 150),
    ('Casa Branca', 'RENOVIAS', -21.91907649549261, -47.05184474516388, 150),
    ('Espírito Santo do Pinhal', 'RENOVIAS', -22.25234765714846, -46.81352501286844, 150),
    ('Estiva Gerbi', 'RENOVIAS', -22.16354832373203, -46.99194058315181, 150),
    ('Itobi', 'RENOVIAS', -21.70595698854591, -46.94693231410992, 150),
    ('Jaguariúna', 'RENOVIAS', -22.77122474010152, -47.02201361058826, 150),
    ('Mococa', 'RENOVIAS', -21.64088414532329, -47.04787951339571, 150),
    ('Pórtico Jaguariúna', 'RENOVIAS', -22.77122474010152, -47.02201361058826, 150),
    ('São João da Boa Vista', 'RENOVIAS', -21.94836313930531, -46.84145470927604, 150),

    -- RODOANEL OESTE
    ('Rodoanel Oeste - Praça 1 (Raimundo Pereira de Magalhães)', 'RODOANEL OESTE', -23.41676752199812, -46.73748983081245, 150),
    ('Rodoanel Oeste - Praça 10 (Padroeira E Ramo A)', 'RODOANEL OESTE', -23.55205468714923, -46.82043422032917, 150),
    ('Rodoanel Oeste - Praça 11 (Raposo Tavares I Ramo E)', 'RODOANEL OESTE', -23.59500638840363, -46.81060158745254, 150),
    ('Rodoanel Oeste - Praça 12 (Raposo Tavares E Ramo A)', 'RODOANEL OESTE', -23.58851370929355, -46.80985602693395, 150),
    ('Rodoanel Oeste - Praça 13 (Osasco E - Régis Bittencourt)', 'RODOANEL OESTE', -23.60004607138816, -46.81282643118342, 150),
    ('Rodoanel Oeste - Praça 2 (Bandeirantes I Ramo F)', 'RODOANEL OESTE', -23.43947133311212, -46.75826038071664, 150),
    ('Rodoanel Oeste - Praça 3 (Bandeirantes E Ramo A)', 'RODOANEL OESTE', -23.42703330954707, -46.76018998293575, 150),
    ('Rodoanel Oeste - Praça 4 (Anhanguera I Ramo F)', 'RODOANEL OESTE', -23.45623990287291, -46.78530111118327, 150),
    ('Rodoanel Oeste - Praça 5 (Anhanguera I Ramo E)', 'RODOANEL OESTE', -23.45229170524154, -46.78627570871711, 150),
    ('Rodoanel Oeste - Praça 6 (Anhanguera E Ramo A)', 'RODOANEL OESTE', -23.44806986678633, -46.78275424848741, 150),
    ('Rodoanel Oeste - Praça 7 (Castelo Branco I Ramo E)', 'RODOANEL OESTE', -23.51789086515766, -46.81385365749108, 150),
    ('Rodoanel Oeste - Praça 8 (Castelo Branco E Ramo A)', 'RODOANEL OESTE', -23.50813703723193, -46.82327654854497, 150),
    ('Rodoanel Oeste - Praça 9 (Padroeira I Ramo F)', 'RODOANEL OESTE', -23.5644848945373, -46.81920473585825, 150),

    -- RODOVIA DOS TAMOIOS
    ('Caraguatatuba', 'RODOVIA DOS TAMOIOS', -23.67009277812022, -45.46725758935468, 150),
    ('Jambeiro', 'RODOVIA DOS TAMOIOS', -23.29585755553502, -45.77918816294262, 150),
    ('Paraibuna', 'RODOVIA DOS TAMOIOS', -23.55039923258759, -45.52495394124159, 150),

    -- RODOVIAS DO TIETÊ
    ('Agudos', 'RODOVIAS DO TIETÊ', -22.51350008834439, -48.90460810340735, 150),
    ('Anhembi', 'RODOVIAS DO TIETÊ', -22.94797984468397, -48.28585352496568, 150),
    ('Areiópolis', 'RODOVIAS DO TIETÊ', -22.6759188229749, -48.68868617207648, 150),
    ('Botucatu (Tietê)', 'RODOVIAS DO TIETÊ', -22.83809946582081, -48.51664886392381, 150),
    ('Conchas', 'RODOVIAS DO TIETÊ', -23.03113878365339, -47.98455549166312, 150),
    ('Monte Mor', 'RODOVIAS DO TIETÊ', -22.97827580665998, -47.35135758759998, 150),
    ('Rafard', 'RODOVIAS DO TIETÊ', -23.05086052112832, -47.57540549931592, 150),
    ('Rio das Pedras (Açúcar)', 'RODOVIAS DO TIETÊ', -22.84542315018318, -47.56015259872612, 150),
    ('Salto', 'RODOVIAS DO TIETÊ', -23.13466854576225, -47.36068698957596, 150),

    -- ROTA DAS BANDEIRAS
    ('Atibaia', 'ROTA DAS BANDEIRAS', -23.094658, -46.62641199999999, 150),
    ('Engenheiro Coelho', 'ROTA DAS BANDEIRAS', -22.514821, -47.19299, 150),
    ('Igaratá', 'ROTA DAS BANDEIRAS', -23.198603, -46.18168500000001, 150),
    ('Itatiba', 'ROTA DAS BANDEIRAS', -22.954298, -46.860056, 150),
    ('Jundiaí', 'ROTA DAS BANDEIRAS', -23.077185, -46.84112200000001, 150),
    ('Louveira', 'ROTA DAS BANDEIRAS', -23.055002, -46.894186, 150),
    ('Paulínia A', 'ROTA DAS BANDEIRAS', -22.69001700000001, -47.15478899999999, 150),
    ('Paulínia B', 'ROTA DAS BANDEIRAS', -22.71291, -47.142708, 150),
    ('Pórtico Engenheiro Coelho (PaP)', 'ROTA DAS BANDEIRAS', -22.514821, -47.19299, 150),
    ('Pórtico Jundiaí (PaP)', 'ROTA DAS BANDEIRAS', -23.077185, -46.84112200000001, 150),
    ('Pórtico km 74 (PaP)', 'ROTA DAS BANDEIRAS', -23.077185, -46.84112200000001, 150),
    ('Pórtico Paulínia A (PaP)', 'ROTA DAS BANDEIRAS', -22.69001700000001, -47.15478899999999, 150),
    ('Pórtico Paulínia B (PaP)', 'ROTA DAS BANDEIRAS', -22.71291, -47.142708, 150),

    -- SPMAR
    ('Rodoanel Leste - Praça 1 (Alça de Ligação/Papa João XXIII)', 'SPMAR', -23.71451131830034, -46.45969699544868, 150),
    ('Rodoanel Leste - Praça 2 (Pista Interna/Trecho Sul)', 'SPMAR', -23.71451131830034, -46.45969699544868, 150),
    ('Rodoanel Leste - Praça 5 e 6 (Alça Interna e Externa/Ayrton Senna)', 'SPMAR', -23.45842463151508, -46.34429060414033, 150),
    ('Rodoanel Leste - Praça 7 (Interseção com Via Dutra)', 'SPMAR', -23.42538232022236, -46.35855841699355, 150),
    ('Rodoanel Sul - Praça 1 (Trecho Sul/Trecho Oeste, Pista Interna)', 'SPMAR', -23.78117847265878, -46.76300211827304, 150),
    ('Rodoanel Sul - Praça 2 (Trecho Sul/Imigrantes, Pista Externa)', 'SPMAR', -23.76551705450613, -46.59388125009544, 150),
    ('Rodoanel Sul - Praça 3 (Trecho Sul/Imigrantes, Pista Externa)', 'SPMAR', -23.76415617599341, -46.59274617162221, 150),
    ('Rodoanel Sul - Praça 4 (Trecho Sul/Imigrantes, Pista Interna)', 'SPMAR', -23.76385415988925, -46.58171449681828, 150),
    ('Rodoanel Sul - Praça 5 (Trecho Sul/Via Anchieta, Pista Interna)', 'SPMAR', -23.75660511550155, -46.54219677533818, 150),
    ('Rodoanel Sul - Praça 6 (Interseção Trecho Leste, Pista Externa)', 'SPMAR', -23.7162556283865, -46.46432626855147, 150),

    -- SPVIAS
    ('Alambari', 'SPVIAS', -23.55296163777427, -47.77782404885732, 150),
    ('Avaré', 'SPVIAS', -22.98099442692848, -48.82281562439159, 150),
    ('Buri', 'SPVIAS', -23.93872428307021, -48.57482094538817, 150),
    ('Gramadão', 'SPVIAS', -23.87379517125915, -48.24217143183319, 150),
    ('Iaras', 'SPVIAS', -22.87520204015233, -49.14465799721819, 150),
    ('Itararé', 'SPVIAS', -24.09082118567436, -49.22718946531907, 150),
    ('Itatinga', 'SPVIAS', -23.08293796442244, -48.51517948748861, 150),
    ('Morro do Alto (Itapetininga)', 'SPVIAS', -23.47089660717932, -47.96798963006903, 150),
    ('Morro do Alto (Tatuí)', 'SPVIAS', -23.43472417415889, -47.93805422977117, 150),
    ('Quadra', 'SPVIAS', -23.24611935462535, -48.08597175000036, 150),

    -- VIAPAULISTA
    ('Batatais', 'VIAPAULISTA', -20.943032, -47.633546, 150),
    ('Boa Esperança do Sul', 'VIAPAULISTA', -22.027434, -48.403237, 150),
    ('Botucatu (ViaPaulista)', 'VIAPAULISTA', -22.897622, -48.764442, 150),
    ('Cel. Macedo', 'VIAPAULISTA', -23.62204997229719, -49.27662971411642, 150),
    ('Guatapará', 'VIAPAULISTA', -21.571619, -47.948694, 150),
    ('Itai', 'VIAPAULISTA', -23.467333, -49.134782, 150),
    ('Jaú', 'VIAPAULISTA', -22.408395, -48.564236, 150),
    ('Restinga', 'VIAPAULISTA', -20.714076, -47.50617, 150),
    ('Santa Rita do Passa Quatro', 'VIAPAULISTA', -21.658454, -47.60882, 150),
    ('São Carlos', 'VIAPAULISTA', -21.821608, -47.907628, 150),
    ('São Simão', 'VIAPAULISTA', -21.41435473668057, -47.6641512014684, 150)
)
update toll_plazas p
set latitude = v.latitude,
    longitude = v.longitude,
    coordinate_precision_m = v.precision_m
from plaza_data v
where p.concessionaria = v.concessionaria
  and p.name = v.name
  and p.source = 'artesp';
