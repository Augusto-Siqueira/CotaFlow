-- CotaFlow — Fecha a coordenada real das praças de SP que ficaram de fora
-- da 0020 (VIARONDON + pórticos secundários + Rio Claro/Intervias).
--
-- VIARONDON (8 praças): o KMZ dessa concessão (l19.kmz) não tem camada de
-- praças de pedágio — só "RAMO"/dispositivo por km. Resolvido via
-- OpenStreetMap (Overpass API), que tem essas 8 praças mapeadas como
-- barrier=toll_booth com operator=ViaRondon e nota com o nome da praça
-- ("Avaí - 1", "Avaí - 2" = as duas cabines/sentidos do mesmo ponto físico
-- — a coordenada gravada é a média das duas). Tarifa do OSM (charge=)
-- bate na faixa do que já tínhamos, não exatamente igual (pode já
-- refletir reajuste mais recente que o que capturamos) — não usada aqui,
-- só a coordenada.
--
-- Pórticos secundários (10 praças: Colinas 7, Rota das Bandeiras 2,
-- Renovias 1): não estavam na camada principal "Praça de Pedágio" dos
-- KMZ (0020), mas apareceram numa camada separada "PaP" (Ponto a Ponto —
-- pórtico free-flow) dentro dos mesmos arquivos, que eu não tinha
-- percorrido na primeira passada. Onde havia mais de um ponto PaP pro
-- mesmo nome de rodovia/cidade sem uma forma segura de saber qual é qual
-- (ex: 2 pontos "Indaiatuba" pra 1 praça "Aeroporto"), foi escolhido o
-- mais próximo da aproximação por cidade anterior — ainda assim, o ponto
-- em si é o pórtico real, só a escolha entre pontos equivalentes é
-- aproximada.
--
-- Rio Claro (Intervias): já estava no KMZ da 0020, mas o casamento por
-- km falhou (a tarifa, transcrita de PDF, diverge ~7km do km real do
-- KMZ). O nome vem explícito na descrição do KMZ ("PRAÇA DE PEDÁGIO
-- [RIO CLARO]"), sem ambiguidade — corrigido aqui por nome, não por km.
--
-- Fica só 1 praça sem coordenada real de 147: SPMAR "Rodoanel Sul -
-- Praça 7 (Av. Papa João XXIII, Mauá)". Achei um candidato (TCP07/TCP08,
-- "Praça P7E"/"Praça P7L") mas a descrição não confirma que é a mesma
-- praça — não forçado. Mantém o geocoding por cidade (0019) até aparecer
-- confirmação melhor.

with plaza_data (name, concessionaria, latitude, longitude, precision_m) as (
  values

    -- COLINAS
    ('Pórtico Aeroporto (PaP)', 'COLINAS', -23.06337998945842, -47.15462658763965, 200),
    ('Pórtico Campinas (PaP)', 'COLINAS', -22.9873061469282, -47.10663092406412, 200),
    ('Pórtico Itu 1 (PaP)', 'COLINAS', -23.24048554684953, -47.31558562030838, 200),
    ('Pórtico Itu 2 (PaP)', 'COLINAS', -23.29518643429592, -47.33086590256787, 200),
    ('Pórtico Salto 1 (PaP)', 'COLINAS', -23.17524389977157, -47.27144498025684, 200),
    ('Pórtico Salto 2 (PaP)', 'COLINAS', -23.22943876837821, -47.31751659321066, 200),
    ('Pórtico Salto 3 (PaP)', 'COLINAS', -23.16574099505537, -47.26615819035589, 200),

    -- INTERVIAS
    ('Rio Claro', 'INTERVIAS', -22.37301944444445, -47.48163611111111, 150),

    -- RENOVIAS
    ('Pórtico Santo Antônio de Posse', 'RENOVIAS', -22.56293113757015, -47.00043535925884, 200),

    -- ROTA DAS BANDEIRAS
    ('Pórtico Cosmópolis (PaP)', 'ROTA DAS BANDEIRAS', -22.62230895162218, -47.20045482801903, 200),
    ('Pórtico Paulínia Jd. Betel (PaP)', 'ROTA DAS BANDEIRAS', -22.81016370115974, -47.11284159505847, 200),

    -- VIARONDON
    ('Avaí', 'VIARONDON', -22.167331, -49.2396893, 100),
    ('Castilho', 'VIARONDON', -20.8308258, -51.5041068, 100),
    ('Glicério', 'VIARONDON', -21.415720800000003, -50.19496945, 100),
    ('Guaraçaí', 'VIARONDON', -20.98495335, -51.223489349999994, 100),
    ('Lavínia', 'VIARONDON', -21.1405384, -50.9768323, 100),
    ('Pirajuí', 'VIARONDON', -21.959051350000003, -49.4663916, 100),
    ('Promissão', 'VIARONDON', -21.62203215, -49.85289815, 100),
    ('Rubiácea', 'VIARONDON', -21.210226249999998, -50.7323066, 100)
)
update toll_plazas p
set latitude = v.latitude,
    longitude = v.longitude,
    coordinate_precision_m = v.precision_m
from plaza_data v
where p.concessionaria = v.concessionaria
  and p.name = v.name
  and p.source = 'artesp';
