-- CotaFlow — Seed de praças de pedágio da malha federal (concessões ANTT).
--
-- Fonte: ANTT, conjunto "Dados das Praças de Pedágio" do portal de dados
-- abertos (dados.antt.gov.br/dataset/praca-de-pedagio), extração de 2026.
-- São 277 praças ativas em 36 concessionárias, cobrindo 13 UFs.
--
-- Diferente do seed da ARTESP (0015), aqui a fonte já publica latitude e
-- longitude de cada praça, então o motor de matching com a geometria da
-- rota pode usar essas praças direto, sem geocoding intermediário. Também
-- publica o sentido de cobrança (campo `direction`).
--
-- Só praças com situacao = 'Ativo' entram: as 277 do dataset estão todas
-- ativas, e `data_da_inativacao` está vazia em todas elas.
--
-- Este arquivo traz apenas a infraestrutura. As tarifas federais vêm em
-- migration separada, porque a ANTT não publica tarifa no mesmo dataset —
-- cada concessão divulga a sua tabela numa página própria.

insert into toll_plazas
  (name, concessionaria, rodovia, uf, km, municipio, latitude, longitude, direction, source)
select v.name, v.concessionaria, v.rodovia, v.uf, v.km, v.municipio,
       v.latitude, v.longitude, v.direction, 'antt'
from (values

    -- AUTOPISTA FLUMINENSE
    ('Conselheiro Josino', 'AUTOPISTA FLUMINENSE', 'BR-101', 'RJ', 40.5, 'Campos dos Goytacazes', -21.552594, -41.331597, 'Crescente/Decrescente'),
    ('Serrinha', 'AUTOPISTA FLUMINENSE', 'BR-101', 'RJ', 123.07, 'Campos dos Goytacazes', -22.04975, -41.685157, 'Crescente/Decrescente'),
    ('Casimiro de Abreu', 'AUTOPISTA FLUMINENSE', 'BR-101', 'RJ', 192.82, 'Casimiro de Abreu', -22.476441, -42.088519, 'Crescente/Decrescente'),
    ('Rio Bonito', 'AUTOPISTA FLUMINENSE', 'BR-101', 'RJ', 252.85, 'Rio Bonito', -22.687469, -42.539855, 'Crescente/Decrescente'),
    ('São Gonçalo', 'AUTOPISTA FLUMINENSE', 'BR-101', 'RJ', 299.69, 'São Gonçalo', -22.774713, -42.9455, 'Crescente'),

    -- AUTOPISTA LITORAL SUL
    ('P2', 'AUTOPISTA LITORAL SUL', 'BR-101', 'SC', 1.35, 'Garuva', -25.991898, -48.881469, 'Crescente/Decrescente'),
    ('P3', 'AUTOPISTA LITORAL SUL', 'BR-101', 'SC', 79.3, 'Araquari', -26.591635, -48.722079, 'Crescente/Decrescente'),
    ('P4', 'AUTOPISTA LITORAL SUL', 'BR-101', 'SC', 157.4, 'Porto Belo', -27.185065, -48.612362, 'Crescente/Decrescente'),
    ('P5', 'AUTOPISTA LITORAL SUL', 'BR-101', 'SC', 242.8, 'Palhoça', -27.885105, -48.647677, 'Crescente/Decrescente'),
    ('P1', 'AUTOPISTA LITORAL SUL', 'BR-376', 'PR', 635.3, 'São José dos Pinhais', -25.747708, -49.129655, 'Crescente/Decrescente'),

    -- AUTOPISTA PLANALTO SUL
    ('MONTE CASTELO', 'AUTOPISTA PLANALTO SUL', 'BR-116', 'SC', 81.6, 'Monte Castelo', -26.570363, -50.221795, 'Crescente/Decrescente'),
    ('FAZENDA RIO GRANDE', 'AUTOPISTA PLANALTO SUL', 'BR-116', 'PR', 134.4, 'Fazenda Rio Grande', -25.713458, -49.318037, 'Crescente/Decrescente'),
    ('SANTA CECÍLIA', 'AUTOPISTA PLANALTO SUL', 'BR-116', 'SC', 152.0, 'Santa Cecília', -27.010584, -50.428716, 'Crescente/Decrescente'),
    ('RIO NEGRO', 'AUTOPISTA PLANALTO SUL', 'BR-116', 'PR', 204.1, 'Rio Negro', -26.07058, -49.739911, 'Crescente/Decrescente'),
    ('CORREIA PINTO', 'AUTOPISTA PLANALTO SUL', 'BR-116', 'SC', 233.16, 'Correia Pinto', -27.010584, -50.374335, 'Crescente/Decrescente'),

    -- AUTOPISTA REGIS BITTENCOURT
    ('Campina Grande do Sul', 'AUTOPISTA REGIS BITTENCOURT', 'BR-116', 'PR', 57.1, 'Campina Grande do Sul', -25.289252, -48.933841, 'Crescente/Decrescente'),
    ('São Lourenço da Serra', 'AUTOPISTA REGIS BITTENCOURT', 'BR-116', 'SP', 298.8, 'São Lourenço da Serra', -23.787647, -46.913922, 'Crescente/Decrescente'),
    ('Miracatu', 'AUTOPISTA REGIS BITTENCOURT', 'BR-116', 'SP', 370.4, 'Miracatu', -24.157869, -47.32628, 'Crescente/Decrescente'),
    ('Juquiá', 'AUTOPISTA REGIS BITTENCOURT', 'BR-116', 'SP', 426.6, 'Juquiá', -24.389325, -47.722391, 'Crescente/Decrescente'),
    ('Cajati', 'AUTOPISTA REGIS BITTENCOURT', 'BR-116', 'SP', 485.7, 'Cajati', -24.722483, -48.08258, 'Crescente/Decrescente'),
    ('Barra do Turvo', 'AUTOPISTA REGIS BITTENCOURT', 'BR-116', 'SP', 542.9, 'Barra do Turvo', -24.964044, -48.412, 'Crescente/Decrescente'),

    -- CONCEBRA
    ('P1 ALEXÂNIA', 'CONCEBRA', 'BR-60', 'GO', 43.1, 'Alexânia', -16.115707, -48.58924, 'Crescente/Decrescente'),
    ('P2 GOIANÁPOLIS', 'CONCEBRA', 'BR-60', 'GO', 107.9, 'Goianápolis', -16.438631, -49.019137, 'Crescente/Decrescente'),

    -- CONCER
    ('P2', 'CONCER', 'BR-40', 'RJ', 45.5, 'Areal', -22.284389, -43.120269, 'Crescente/Decrescente'),
    ('P1', 'CONCER', 'BR-40', 'RJ', 102.0, 'Duque de Caxias', -22.609965, -43.285552, 'Crescente/Decrescente'),
    ('P3', 'CONCER', 'BR-40', 'MG', 816.7, 'Simão Pereira', -21.928252, -43.316282, 'Crescente/Decrescente'),

    -- ECOSUL
    ('Praça Cristal', 'ECOSUL', 'BR-116', 'RS', 430.8, 'Cristal', -31.026386, -52.04943, 'Crescente/Decrescente'),
    ('Praça Retiro', 'ECOSUL', 'BR-116', 'RS', 510.7, 'Pelotas', -31.625261, -52.318116, 'Crescente/Decrescente'),
    ('Praça Pavão', 'ECOSUL', 'BR-116', 'RS', 541.2, 'Capão do Leão', -31.820075, -52.526711, 'Crescente/Decrescente'),
    ('Praça Capão Seco', 'ECOSUL', 'BR-392', 'RS', 52.3, 'Rio Grande', -31.851958, -52.326177, 'Crescente/Decrescente'),
    ('Praça Glória', 'ECOSUL', 'BR-392', 'RS', 111.4, 'Canguçu', -31.449786, -52.640644, 'Crescente/Decrescente'),

    -- ECOVIAS CAPIXABA
    ('P1 - Pedro Canário', 'ECOVIAS CAPIXABA', 'BR-101', 'ES', 1.0, 'Pedro Canário', -18.184708, -39.922116, 'Crescente/Decrescente'),
    ('P2 - São Mateus', 'ECOVIAS CAPIXABA', 'BR-101', 'ES', 85.8, 'São Mateus', -18.863974, -39.938705, 'Crescente/Decrescente'),
    ('P3 - Aracruz', 'ECOVIAS CAPIXABA', 'BR-101', 'ES', 171.7, 'Aracruz', -19.563099, -40.177621, 'Crescente/Decrescente'),
    ('P4 - Serra', 'ECOVIAS CAPIXABA', 'BR-101', 'ES', 242.0, 'Serra', -20.032565, -40.396624, 'Crescente/Decrescente'),
    ('P5 - Guarapari', 'ECOVIAS CAPIXABA', 'BR-101', 'ES', 320.8, 'Guarapari', -20.519316, -40.478609, 'Crescente/Decrescente'),
    ('P6 - Itapemirim', 'ECOVIAS CAPIXABA', 'BR-101', 'ES', 398.9, 'Itapemirim', -20.878586, -40.966118, 'Crescente/Decrescente'),
    ('P7 - Mimoso do Sul', 'ECOVIAS CAPIXABA', 'BR-101', 'ES', 452.0, 'Mimoso do Sul', -21.158397, -41.280614, 'Crescente/Decrescente'),

    -- ECOVIAS DO ARAGUAIA
    ('P3 - Porangatu', 'ECOVIAS DO ARAGUAIA', 'BR-153', 'GO', 12.5, 'Porangatu', -12.943414, -49.133122, 'Crescente/Decrescente'),
    ('P4 - Estrela do Norte', 'ECOVIAS DO ARAGUAIA', 'BR-153', 'GO', 116.12, 'Estrela do Norte', -13.791358, -49.034842, 'Crescente/Decrescente'),
    ('P5 - Campinorte', 'ECOVIAS DO ARAGUAIA', 'BR-153', 'GO', 182.04, 'Campinorte', -14.372969, -49.158264, 'Crescente/Decrescente'),
    ('P6 - Hidrolina', 'ECOVIAS DO ARAGUAIA', 'BR-153', 'GO', 233.4, 'Hidrolina', -14.799372, -49.284164, 'Crescente/Decrescente'),
    ('P7 - Jaraguá', 'ECOVIAS DO ARAGUAIA', 'BR-153', 'GO', 367.5, 'Jaraguá', -15.827072, -49.281722, 'Crescente/Decrescente'),
    ('P1 - Aliança do Tocantins', 'ECOVIAS DO ARAGUAIA', 'BR-153', 'TO', 640.0, 'Aliança do Tocantins', -11.4461, -48.990283, 'Crescente/Decrescente'),
    ('P2 - Alvorada', 'ECOVIAS DO ARAGUAIA', 'BR-153', 'TO', 744.91, 'Alvorada', -12.34, -49.15, 'Crescente/Decrescente'),
    ('P9 - Corumbá de Goiás', 'ECOVIAS DO ARAGUAIA', 'BR-414', 'GO', 404.08, 'Corumbá de Goiás', -16.001028, -48.840289, 'Crescente/Decrescente'),
    ('P8 - Santa Rita do Novo Destino', 'ECOVIAS DO ARAGUAIA', 'BR-80', 'GO', 155.5, 'Santa Rita do Novo Destino', -14.814189, -49.042442, 'Crescente/Decrescente'),

    -- ECOVIAS DO CERRADO
    ('P6 - CACHOEIRA ALTA', 'ECOVIAS DO CERRADO', 'BR-364', 'GO', 92.85, 'Cachoeira Alta', -18.47, -51.08, 'Crescente/Decrescente'),
    ('P7 - JATAÍ', 'ECOVIAS DO CERRADO', 'BR-364', 'GO', 156.18, 'Jataí', -18.11, -51.48, 'Crescente/Decrescente'),
    ('P1 - UBERLÂNDIA', 'ECOVIAS DO CERRADO', 'BR-365', 'MG', 646.0, 'Uberlândia', -18.88, -48.52, 'Crescente/Decrescente'),
    ('P2 - MONTE ALEGRE', 'ECOVIAS DO CERRADO', 'BR-365', 'MG', 704.12, 'Monte Alegre de Minas', -18.88, -49.04, 'Crescente/Decrescente'),
    ('P3 - ITUIUTABA', 'ECOVIAS DO CERRADO', 'BR-365', 'MG', 765.37, 'Ituiutaba', -18.96, -49.59, 'Crescente/Decrescente'),
    ('P4 - SANTA VITÓRIA', 'ECOVIAS DO CERRADO', 'BR-365', 'MG', 834.45, 'Santa Vitória', -18.912533, -50.224138, 'Crescente/Decrescente'),

    -- ECOVIAS MINAS GOIÁS
    ('ARAGUARI I', 'ECOVIAS MINAS GOIÁS', 'BR-50', 'MG', 13.94, 'Araguari', -18.54, -48.05, 'Crescente/Decrescente'),
    ('ARAGUARI II', 'ECOVIAS MINAS GOIÁS', 'BR-50', 'MG', 51.5, 'Araguari', -18.75, -48.24, 'Crescente/Decrescente'),
    ('UBERABA', 'ECOVIAS MINAS GOIÁS', 'BR-50', 'MG', 104.98, 'Uberaba', -19.18, -48.16, 'Crescente/Decrescente'),
    ('IPAMERI', 'ECOVIAS MINAS GOIÁS', 'BR-50', 'GO', 144.0, 'Ipameri', -17.12, -47.72, 'Crescente/Decrescente'),
    ('CAMPO ALEGRE', 'ECOVIAS MINAS GOIÁS', 'BR-50', 'GO', 226.0, 'Campo Alegre de Goiás', -17.77, -47.75, 'Crescente/Decrescente'),

    -- ECOVIAS PONTE
    ('NITEROÍ-1', 'ECOVIAS PONTE', 'BR-101', 'RJ', 322.23, 'Niterói', -22.877944, -43.115734, 'Decrescente'),

    -- ECOVIAS RIO MINAS
    ('P07 Magé', 'ECOVIAS RIO MINAS', 'BR-116', 'RJ', 118.2, 'Magé', -22.607222, -43.028611, 'Crescente/Decrescente'),
    ('P04 Viúva Graça', 'ECOVIAS RIO MINAS', 'BR-116', 'RJ', 211.674, 'Seropédica', -22.716277, -43.716858, 'Crescente/Decrescente'),
    ('P05 Viúva Graça (B)', 'ECOVIAS RIO MINAS', 'BR-116', 'RJ', 213.103, 'Seropédica', -22.715213, -43.730252, 'Crescente/Decrescente'),
    ('P15 Engenheiro Caldas', 'ECOVIAS RIO MINAS', 'BR-116', 'MG', 433.6, 'Engenheiro Caldas', -19.027777, -41.989444, 'Crescente/Decrescente'),
    ('P14 Inhapim', 'ECOVIAS RIO MINAS', 'BR-116', 'MG', 488.7, 'Inhapim', -19.468055, -42.133888, 'Crescente/Decrescente'),
    ('P13 Santa Bárbara do Leste', 'ECOVIAS RIO MINAS', 'BR-116', 'MG', 551.88, 'Santa Bárbara do Leste', -19.991666, -42.143611, 'Crescente/Decrescente'),
    ('P12 São João do Manhuaçu', 'ECOVIAS RIO MINAS', 'BR-116', 'MG', 610.94, 'São João do Manhuaçu', -20.430277, -42.163055, 'Crescente/Decrescente'),
    ('P11 São Francisco do Glória', 'ECOVIAS RIO MINAS', 'BR-116', 'MG', 664.0, 'São Francisco do Glória', -20.823611, -42.321111, 'Crescente/Decrescente'),
    ('P10 Laranjal', 'ECOVIAS RIO MINAS', 'BR-116', 'MG', 724.02, 'Laranjal', -21.278333, -42.412222, 'Crescente/Decrescente'),
    ('P09 Leopoldina', 'ECOVIAS RIO MINAS', 'BR-116', 'MG', 784.32, 'Leopoldina', -21.638611, -42.710277, 'Crescente/Decrescente'),
    ('P08 Guapimirim', 'ECOVIAS RIO MINAS', 'BR-493', 'RJ', 13.86, 'Guapimirim', -22.67, -42.98, 'Crescente/Decrescente'),
    ('P06 Itaguaí', 'ECOVIAS RIO MINAS', 'BR-493', 'RJ', 112.7, 'Itaguaí', -22.820833, -43.805, 'Crescente/Decrescente'),

    -- ELOVIAS
    ('P2', 'ELOVIAS', 'BR-40', 'RJ', 45.819, 'Petrópolis', -22.284389, -43.120269, 'Crescente/Decrescente'),
    ('P1', 'ELOVIAS', 'BR-40', 'RJ', 101.825, 'Duque de Caxias', -22.610206, -43.285708, 'Crescente/Decrescente'),
    ('P3', 'ELOVIAS', 'BR-40', 'MG', 819.379, 'Simão Pereira', -21.928252, -43.316282, 'Crescente/Decrescente'),

    -- EPR IGUAÇU
    ('P8 FREEFLOW AMPERE', 'EPR IGUAÇU', '182', 'PR', 517.4, 'Ampére', -25.988737, -53.382903, 'Crescente/Decrescente'),
    ('P9 FREEFLOW VITORINO', 'EPR IGUAÇU', '280', 'PR', 234.3, 'Vitorino', -26.204017, -52.845956, 'Crescente/Decrescente'),
    ('P01 FREEFLOW SANTA LUCIA - NORTE', 'EPR IGUAÇU', 'BR-163', 'PR', 154.0, 'Santa Lúcia', -25.359202, -53.575788, 'Crescente'),
    ('P01 FREEFLOW SANTA LUCIA - SUL', 'EPR IGUAÇU', 'BR-163', 'PR', 156.1, 'Santa Lúcia', -25.345684, -53.586687, 'Decrescente'),
    ('P02 PRUDENTROPOLIS', 'EPR IGUAÇU', 'BR-277', 'PR', 308.29, 'Prudentópolis', -25.309611, -51.168325, 'Crescente/Decrescente'),
    ('P03 CANDOI', 'EPR IGUAÇU', 'BR-277', 'PR', 393.04, 'Candói', -25.443731, -51.859064, 'Crescente/Decrescente'),
    ('P04 LARANJEIRAS DO SUL', 'EPR IGUAÇU', 'BR-277', 'PR', 468.11, 'Laranjeiras do Sul', -25.346486, -52.491192, 'Crescente/Decrescente'),
    ('P05 CASCAVEL', 'EPR IGUAÇU', 'BR-277', 'PR', 571.34, 'Cascavel', -25.021742, -53.278772, 'Crescente/Decrescente'),
    ('P06 CÉU AZUL', 'EPR IGUAÇU', 'BR-277', 'PR', 615.34, 'Céu Azul', -25.084119, -53.713553, 'Crescente/Decrescente'),
    ('P07 SÃO MIQUEL DO IGUAÇU', 'EPR IGUAÇU', 'BR-277', 'PR', 706.07, 'São Miguel do Iguaçu', -25.426994, -54.364086, 'Crescente/Decrescente'),

    -- EPR PARANÁ
    ('Validador 7012 Rolândia - P07', 'EPR PARANÁ', '444', 'PR', 3.3, 'Arapongas', -23.372791, -51.43724, 'Crescente/Decrescente'),
    ('Free Flow Jataizinho - P08 Decrescente', 'EPR PARANÁ', 'BR-369', 'PR', 126.0, 'Jataizinho', -23.283089, -50.9555, 'Crescente/Decrescente'),
    ('Free Flow Jataizinho - P08', 'EPR PARANÁ', 'BR-369', 'PR', 126.0, 'Jataizinho', -23.28058, -50.958563, 'Crescente/Decrescente'),
    ('Validador 7011 Rolândia - P07', 'EPR PARANÁ', 'BR-369', 'PR', 180.2, 'Rolândia', -23.358784, -51.39698, 'Crescente/Decrescente'),
    ('Free Flow Rolândia - P07', 'EPR PARANÁ', 'BR-369', 'PR', 180.2, 'Rolândia', -23.355625, -51.393128, 'Crescente/Decrescente'),
    ('Free Flow Rolândia - P07  Decrescente', 'EPR PARANÁ', 'BR-369', 'PR', 180.2, 'Rolândia', -23.3508, -51.387389, 'Crescente/Decrescente'),
    ('Free Flow Pres. Castelo Branco - P05 Decrescente', 'EPR PARANÁ', 'BR-376', 'PR', 145.8, 'Presidente Castelo Branco', -23.310828, -52.109825, 'Crescente/Decrescente'),
    ('Free Flow Pres. Castelo Branco - P05', 'EPR PARANÁ', 'BR-376', 'PR', 145.8, 'Presidente Castelo Branco', -23.285167, -52.146114, 'Crescente/Decrescente'),
    ('Free Flow Marialva - P06 Decrescente', 'EPR PARANÁ', 'BR-376', 'PR', 196.0, 'Marialva', -23.509475, -51.722148, 'Crescente/Decrescente'),
    ('Free Flow Marialva - P06', 'EPR PARANÁ', 'BR-376', 'PR', 196.0, 'Marialva', -23.500056, -51.764972, 'Crescente/Decrescente'),

    -- EPR VIA MINEIRA
    ('P1 - Itabirito', 'EPR VIA MINEIRA', 'BR-40', 'MG', 577.2, 'Itabirito', -20.27288, -43.95112, 'Crescente/Decrescente'),
    ('P2 - Lafaiete', 'EPR VIA MINEIRA', 'BR-40', 'MG', 642.85, 'Conselheiro Lafaiete', -20.76702, -43.80668, 'Crescente/Decrescente'),
    ('P3 - Barbacena', 'EPR VIA MINEIRA', 'BR-40', 'MG', 714.1, 'Barbacena', -21.26271, -43.66224, 'Crescente/Decrescente'),

    -- LITORAL PIONEIRO
    ('P07 QUATIGUÁ', 'LITORAL PIONEIRO', '092', 'PR', 286.74, 'Siqueira Campos', -24.643739, -49.840669, 'Crescente/Decrescente'),
    ('P02 SENGES', 'LITORAL PIONEIRO', '151', 'PR', 187.7, 'Sengés', -24.123056, -49.543889, 'Crescente/Decrescente'),
    ('P06 JAGUARIAÍVA', 'LITORAL PIONEIRO', '151', 'PR', 223.1, 'Jaguariaíva', -24.319166, -49.778611, 'Crescente/Decrescente'),
    ('P05 CARAMBEÍ', 'LITORAL PIONEIRO', '151', 'PR', 304.25, 'Carambeí', -24.912222, -50.086388, 'Crescente/Decrescente'),
    ('P08 JACAREZINHO AUX I', 'LITORAL PIONEIRO', 'Acesso para SP-278', 'PR', 1.653, 'Jacarezinho', -23.008611, -49.906388, 'Crescente/Decrescente'),
    ('P01 SÃO JOSÉ DOS PINHAIS', 'LITORAL PIONEIRO', 'BR-277', 'PR', 60.25, 'São José dos Pinhais', -25.55, -49.04, 'Crescente/Decrescente'),
    ('P03 JACAREZINHO', 'LITORAL PIONEIRO', 'BR-369', 'PR', 1.4, 'Jacarezinho', -23.003888, -49.909722, 'Crescente/Decrescente'),
    ('P09 JACAREZINHO AUX II', 'LITORAL PIONEIRO', 'Saída para BR-153', 'PR', 1.698, 'Jacarezinho', -23.008333, -49.906388, 'Crescente/Decrescente'),

    -- MOTIVA MINAS SP
    ('2 (Vargem)', 'MOTIVA MINAS SP', 'BR-381', 'SP', 7.3, 'Vargem', -22.908685, -46.424877, 'Crescente/Decrescente'),
    ('1 Norte (Mairiporã)', 'MOTIVA MINAS SP', 'BR-381', 'SP', 65.7, 'Mairiporã', -23.322298, -46.581097, 'Decrescente'),
    ('1 Sul (Mairiporã)', 'MOTIVA MINAS SP', 'BR-381', 'SP', 66.6, 'Mairiporã', -23.330558, -46.578337, 'Crescente'),
    ('1 Norte - Defasada (Mairiporã)', 'MOTIVA MINAS SP', 'BR-381', 'SP', 67.8, 'Mairiporã', -23.34121, -46.573664, 'Decrescente'),
    ('8 (Itatiaiuçu)', 'MOTIVA MINAS SP', 'BR-381', 'MG', 545.9, 'Itatiaiuçu', -20.268346, -44.423711, 'Crescente/Decrescente'),
    ('7 (Carmópolis de Minas)', 'MOTIVA MINAS SP', 'BR-381', 'MG', 597.7, 'Carmópolis de Minas', -20.591486, -44.701506, 'Crescente/Decrescente'),
    ('6 (Santo Antônio do Amparo)', 'MOTIVA MINAS SP', 'BR-381', 'MG', 658.3, 'Santo Antônio do Amparo', -21.000367, -44.966967, 'Crescente/Decrescente'),
    ('5 (Carmo da Cachoeira)', 'MOTIVA MINAS SP', 'BR-381', 'MG', 735.5, 'Carmo da Cachoeira', -21.5457, -45.240203, 'Crescente/Decrescente'),
    ('4 (São Gonçalo)', 'MOTIVA MINAS SP', 'BR-381', 'MG', 805.2, 'São Gonçalo do Sapucaí', -21.970441, -45.631188, 'Crescente/Decrescente'),
    ('3 (Cambuí)', 'MOTIVA MINAS SP', 'BR-381', 'MG', 900.9, 'Cambuí', -22.628487, -46.07789, 'Crescente/Decrescente'),

    -- MOTIVA PARANÁ
    ('P01 SERTANEJA', 'MOTIVA PARANÁ', '323', 'PR', 2.97, 'Sertaneja', -22.915601, -50.817212, 'Crescente/Decrescente'),
    ('FREE FLOW P7 LONDRINA', 'MOTIVA PARANÁ', '445', 'PR', 2.47, 'Mauá da Serra', -23.889283, -51.183664, 'Crescente/Decrescente'),
    ('FREE FLOW P2 MAUÁ DA SERRA', 'MOTIVA PARANÁ', 'BR-376', 'PR', 294.8, 'Mauá da Serra', -23.905773, -51.199273, 'Crescente/Decrescente'),
    ('P03 ORTIGUEIRA', 'MOTIVA PARANÁ', 'BR-376', 'PR', 316.35, 'Ortigueira', -24.034399, -51.089008, 'Crescente/Decrescente'),
    ('P04 IMBAÚ', 'MOTIVA PARANÁ', 'BR-376', 'PR', 370.95, 'Ortigueira', -24.382178, -50.790301, 'Crescente/Decrescente'),
    ('P05 TIBAGI', 'MOTIVA PARANÁ', 'BR-376', 'PR', 448.55, 'Tibagi', -24.923695, -50.409044, 'Crescente/Decrescente'),
    ('P06 WITMARSUM', 'MOTIVA PARANÁ', 'BR-376', 'PR', 529.85, 'Palmeira', -25.346974, -49.843065, 'Crescente/Decrescente'),

    -- NOVA 364
    ('Free Flow Pimenta Bueno2 - P07', 'NOVA 364', 'BR-364', 'RO', 122.2, 'Pimenta Bueno', -12.110803, -60.746925, 'Crescente/Decrescente'),
    ('Free Flow Pimenta Bueno1 - P06', 'NOVA 364', 'BR-364', 'RO', 221.3, 'Pimenta Bueno', -11.527534, -61.333997, 'Crescente/Decrescente'),
    ('Free Flow Pres. Médici - P05', 'NOVA 364', 'BR-364', 'RO', 272.4, 'Cacoal', -11.384193, -61.73566, 'Crescente/Decrescente'),
    ('Free Flow Ouro Preto  - P04', 'NOVA 364', 'BR-364', 'RO', 399.3, 'Ouro Preto do Oeste', -10.6081, -62.3395, 'Crescente/Decrescente'),
    ('Free Flow Jarú -  P03', 'NOVA 364', 'BR-364', 'RO', 452.3, 'Theobroma', -10.287172, -62.670764, 'Crescente/Decrescente'),
    ('Free Flow Itapuã - P02', 'NOVA 364', 'BR-364', 'RO', 562.3, 'Alto Paraíso', -9.5397, -63.0767, 'Crescente/Decrescente'),
    ('Free Flow Candeias - P01', 'NOVA 364', 'BR-364', 'RO', 686.9, 'Candeias do Jamari', -8.792398, -63.650532, 'Crescente/Decrescente'),

    -- NOVA 381
    ('Free Flow Governador Valadares - P05', 'NOVA 381', 'BR-381', 'MG', 176.55, 'Governador Valadares', -19.028744, -42.147708, 'Crescente/Decrescente'),
    ('Free Flow Belo Oriente - P04', 'NOVA 381', 'BR-381', 'MG', 227.5, 'Belo Oriente', -19.348242, -42.433175, 'Crescente/Decrescente'),
    ('Free Flow Jaguaraçú - P03', 'NOVA 381', 'BR-381', 'MG', 280.15, 'Jaguaraçu', -19.609967, -42.766233, 'Crescente/Decrescente'),
    ('Free Flow João Monlevade - P02', 'NOVA 381', 'BR-381', 'MG', 342.27, 'João Monlevade', -19.853947, -43.132689, 'Crescente/Decrescente'),
    ('Free Flow Caeté - P01', 'NOVA 381', 'BR-381', 'MG', 411.85, 'Caeté', -19.743897, -43.615283, 'Crescente/Decrescente'),

    -- NOVA ROTA DO OESTE
    ('P1', 'NOVA ROTA DO OESTE', 'BR-163', 'MT', 33.6, 'Itiquira', -17.219391, -54.758685, 'Crescente/Decrescente'),
    ('P7', 'NOVA ROTA DO OESTE', 'BR-163', 'MT', 586.9, 'Nova Mutum', -13.91952, -56.093419, 'Crescente/Decrescente'),
    ('P8', 'NOVA ROTA DO OESTE', 'BR-163', 'MT', 664.45, 'Lucas do Rio Verde', -13.26599, -56.022777, 'Crescente/Decrescente'),
    ('P9', 'NOVA ROTA DO OESTE', 'BR-163', 'MT', 766.7, 'Sorriso', -12.441635, -55.653798, 'Crescente/Decrescente'),
    ('P2', 'NOVA ROTA DO OESTE', 'BR-364', 'MT', 214.4, 'Rondonópolis', -16.393565, -54.714281, 'Crescente/Decrescente'),
    ('P3', 'NOVA ROTA DO OESTE', 'BR-364', 'MT', 316.55, 'Campo Verde', -15.81, -55.31, 'Crescente/Decrescente'),
    ('P4', 'NOVA ROTA DO OESTE', 'BR-364', 'MT', 383.1, 'Santo Antônio de Leverger', -15.702041, -55.829527, 'Crescente/Decrescente'),
    ('P5', 'NOVA ROTA DO OESTE', 'BR-364', 'MT', 479.1, 'Jangada', -15.349875, -56.415628, 'Crescente/Decrescente'),
    ('P6', 'NOVA ROTA DO OESTE', 'BR-364', 'MT', 579.1, 'Nobres', -14.599728, -56.240858, 'Crescente/Decrescente'),

    -- PANTANAL
    ('P1-Mundo Novo', 'PANTANAL', 'BR-163', 'MS', 28.2, 'Mundo Novo', -23.865169, -54.329788, 'Crescente/Decrescente'),
    ('P2-Itaquirai', 'PANTANAL', 'BR-163', 'MS', 113.0, 'Itaquiraí', -23.167432, -54.19897, 'Crescente/Decrescente'),
    ('P3-Caarapó', 'PANTANAL', 'BR-163', 'MS', 228.2, 'Caarapó', -22.476042, -54.860799, 'Crescente/Decrescente'),
    ('P4-Rio Brilhante', 'PANTANAL', 'BR-163', 'MS', 313.5, 'Rio Brilhante', -21.865146, -54.528504, 'Crescente/Decrescente'),
    ('P5-Campo Grande', 'PANTANAL', 'BR-163', 'MS', 431.8, 'Campo Grande', -20.882783, -54.504644, 'Crescente/Decrescente'),
    ('P6-Jaraguari', 'PANTANAL', 'BR-163', 'MS', 533.8, 'Jaraguari', -20.04, -54.41, 'Crescente/Decrescente'),
    ('P7-São Gabriel', 'PANTANAL', 'BR-163', 'MS', 605.0, 'São Gabriel do Oeste', -19.473376, -54.496991, 'Crescente/Decrescente'),
    ('P8-Rio Verde', 'PANTANAL', 'BR-163', 'MS', 704.3, 'Rio Verde de Mato Grosso', -18.722782, -54.814951, 'Crescente/Decrescente'),
    ('P9-Sonora', 'PANTANAL', 'BR-163', 'MS', 819.2, 'Sonora', -17.766671, -54.750815, 'Crescente/Decrescente'),

    -- RIOSP
    ('Free Flow Itaguaí', 'RIOSP', 'BR-101', 'RJ', 414.9, 'Itaguaí', -22.91, -43.89, 'Crescente/Decrescente'),
    ('Free Flow Mangaratiba', 'RIOSP', 'BR-101', 'RJ', 447.3, 'Mangaratiba', -23.00632, -44.099135, 'Crescente/Decrescente'),
    ('Free Flow Paraty', 'RIOSP', 'BR-101', 'RJ', 538.5, 'Paraty', -23.05, -44.58, 'Crescente/Decrescente'),
    ('Moreira César Norte', 'RIOSP', 'BR-116', 'SP', 87.0, 'Pindamonhangaba', -22.93, -45.36, 'Decrescente'),
    ('Moreira César Sul', 'RIOSP', 'BR-116', 'SP', 87.0, 'Pindamonhangaba', -22.93, -45.36, 'Crescente'),
    ('Jacareí Norte', 'RIOSP', 'BR-116', 'SP', 165.1, 'Jacareí', -23.3, -46.01, 'Decrescente'),
    ('Jacareí Sul', 'RIOSP', 'BR-116', 'SP', 165.1, 'Jacareí', -23.3, -46.01, 'Crescente'),
    ('Guararema Sul', 'RIOSP', 'BR-116', 'SP', 180.7, 'Guararema', -23.34, -46.15, 'Crescente'),
    ('Guararema Norte', 'RIOSP', 'BR-116', 'SP', 182.4, 'Santa Isabel', -23.35, -46.16, 'Decrescente'),
    ('Arujá Norte', 'RIOSP', 'BR-116', 'SP', 204.3, 'Arujá', -23.41, -46.36, 'Decrescente'),
    ('Arujá Sul', 'RIOSP', 'BR-116', 'SP', 204.3, 'Arujá', -23.41, -46.36, 'Crescente'),
    ('Arujá Rodoanel', 'RIOSP', 'BR-116', 'SP', 204.8, 'Arujá', -23.42, -46.37, 'Decrescente'),
    ('Free Flow PPF001 Sul - PFS001 Sul', 'RIOSP', 'BR-116', 'SP', 206.0, 'Guarulhos', -23.417379, -46.37647, 'Crescente'),
    ('Free Flow PPF001 Sul - PFS002 Sul', 'RIOSP', 'BR-116', 'SP', 206.0, 'Guarulhos', -23.417379, -46.37647, 'Crescente'),
    ('Free Flow PPF001 Sul - PFS003 Sul', 'RIOSP', 'BR-116', 'SP', 206.0, 'Guarulhos', -23.417379, -46.37647, 'Crescente'),
    ('Free Flow PPF001 Sul - PFS004 Sul', 'RIOSP', 'BR-116', 'SP', 206.0, 'Guarulhos', -23.417379, -46.37647, 'Crescente'),
    ('Free Flow PPF001 Sul - PFS005 Sul', 'RIOSP', 'BR-116', 'SP', 206.0, 'Guarulhos', -23.417379, -46.37647, 'Crescente'),
    ('Viúva Graça Norte', 'RIOSP', 'BR-116', 'RJ', 207.1, 'Seropédica', -22.716155, -43.716697, 'Decrescente'),
    ('Viuvinha Norte', 'RIOSP', 'BR-116', 'RJ', 208.6, 'Seropédica', -22.715133, -43.730239, 'Decrescente'),
    ('Free Flow PFE009 - BAIRRO Norte', 'RIOSP', 'BR-116', 'SP', 210.2, 'Guarulhos', -23.429571, -46.412718, 'Decrescente'),
    ('Free Flow PFE009 - PEDARD Norte', 'RIOSP', 'BR-116', 'SP', 210.2, 'Guarulhos', -23.429571, -46.412718, 'Decrescente'),
    ('Free Flow PFE009 - PEDARU Norte', 'RIOSP', 'BR-116', 'SP', 210.2, 'Guarulhos', -23.429571, -46.412718, 'Decrescente'),
    ('Free Flow PFE009 - PFS010 Norte', 'RIOSP', 'BR-116', 'SP', 210.2, 'Guarulhos', -23.429571, -46.412718, 'Decrescente'),
    ('Free Flow PFE001 - PFS001 Sul', 'RIOSP', 'BR-116', 'SP', 211.7, 'Guarulhos', -23.43512, -46.426737, 'Crescente'),
    ('Free Flow PFE001 - PFS002 Sul', 'RIOSP', 'BR-116', 'SP', 211.7, 'Guarulhos', -23.43512, -46.426737, 'Crescente'),
    ('Free Flow PFE001 - PFS003 Sul', 'RIOSP', 'BR-116', 'SP', 211.7, 'Guarulhos', -23.43512, -46.426737, 'Crescente'),
    ('Free Flow PFE001 - PFS004 Sul', 'RIOSP', 'BR-116', 'SP', 211.7, 'Guarulhos', -23.43512, -46.426737, 'Crescente'),
    ('Free Flow PFE001 - PFS005 Sul', 'RIOSP', 'BR-116', 'SP', 211.7, 'Guarulhos', -23.43512, -46.426737, 'Crescente'),
    ('Free Flow PFE008 - BAIRRO Norte', 'RIOSP', 'BR-116', 'SP', 214.1, 'Guarulhos', -23.44491, -46.449184, 'Decrescente'),
    ('Free Flow PFE008 - PEDARD Norte', 'RIOSP', 'BR-116', 'SP', 214.1, 'Guarulhos', -23.44491, -46.449184, 'Decrescente'),
    ('Free Flow PFE008 - PEDARU Norte', 'RIOSP', 'BR-116', 'SP', 214.1, 'Guarulhos', -23.44491, -46.449184, 'Decrescente'),
    ('Free Flow PFE008 - PFS010 Norte', 'RIOSP', 'BR-116', 'SP', 214.1, 'Guarulhos', -23.44491, -46.449184, 'Decrescente'),
    ('Free Flow PFE002 - PFS002 Sul', 'RIOSP', 'BR-116', 'SP', 219.0, 'Guarulhos', -23.463679, -46.495578, 'Crescente'),
    ('Free Flow PFE002 - PFS003 Sul', 'RIOSP', 'BR-116', 'SP', 219.0, 'Guarulhos', -23.463679, -46.495578, 'Crescente'),
    ('Free Flow PFE002 - PFS004 Sul', 'RIOSP', 'BR-116', 'SP', 219.0, 'Guarulhos', -23.463679, -46.495578, 'Crescente'),
    ('Free Flow PFE002 - PFS005 Sul', 'RIOSP', 'BR-116', 'SP', 219.0, 'Guarulhos', -23.463679, -46.495578, 'Crescente'),
    ('Free Flow PFE007 - BAIRRO Norte', 'RIOSP', 'BR-116', 'SP', 223.35, 'Guarulhos', -23.479177, -46.530417, 'Decrescente'),
    ('Free Flow PFE007 - PEDARD Norte', 'RIOSP', 'BR-116', 'SP', 223.35, 'Guarulhos', -23.479177, -46.530417, 'Decrescente'),
    ('Free Flow PFE007 - PEDARU Norte', 'RIOSP', 'BR-116', 'SP', 223.35, 'Guarulhos', -23.479177, -46.530417, 'Decrescente'),
    ('Free Flow PFE007 - PFS008 Norte', 'RIOSP', 'BR-116', 'SP', 223.35, 'Guarulhos', -23.479177, -46.530417, 'Decrescente'),
    ('Free Flow PFE007 - PFS009 Norte', 'RIOSP', 'BR-116', 'SP', 223.35, 'Guarulhos', -23.479177, -46.530417, 'Decrescente'),
    ('Free Flow PFE007 - PFS010 Norte', 'RIOSP', 'BR-116', 'SP', 223.35, 'Guarulhos', -23.479177, -46.530417, 'Decrescente'),
    ('Free Flow PFE003 - PFS002 Sul', 'RIOSP', 'BR-116', 'SP', 224.4, 'Guarulhos', -23.484416, -46.539191, 'Crescente'),
    ('Free Flow PFE003 - PFS003 Sul', 'RIOSP', 'BR-116', 'SP', 224.4, 'Guarulhos', -23.484416, -46.539191, 'Crescente'),
    ('Free Flow PFE003 - PFS004 Sul', 'RIOSP', 'BR-116', 'SP', 224.4, 'Guarulhos', -23.484416, -46.539191, 'Crescente'),
    ('Free Flow PFE003 - PFS005 Sul', 'RIOSP', 'BR-116', 'SP', 224.4, 'Guarulhos', -23.484416, -46.539191, 'Crescente'),
    ('Free Flow PFE004 - PFS003 Sul', 'RIOSP', 'BR-116', 'SP', 227.0, 'São Paulo', -23.497507, -46.560039, 'Crescente'),
    ('Free Flow PFE004 - PFS004 Sul', 'RIOSP', 'BR-116', 'SP', 227.0, 'São Paulo', -23.497507, -46.560039, 'Crescente'),
    ('Free Flow PFE004 - PFS005 Sul', 'RIOSP', 'BR-116', 'SP', 227.0, 'São Paulo', -23.497507, -46.560039, 'Crescente'),
    ('Free Flow PFE006 - BAIRRO Norte', 'RIOSP', 'BR-116', 'SP', 228.85, 'São Paulo', -23.50926, -46.572718, 'Decrescente'),
    ('Free Flow PFE006 - PEDARD Norte', 'RIOSP', 'BR-116', 'SP', 228.85, 'São Paulo', -23.50926, -46.572718, 'Decrescente'),
    ('Free Flow PFE006 - PEDARU Norte', 'RIOSP', 'BR-116', 'SP', 228.85, 'São Paulo', -23.50926, -46.572718, 'Decrescente'),
    ('Free Flow PFE006 - PFS006 Norte', 'RIOSP', 'BR-116', 'SP', 228.85, 'São Paulo', -23.50926, -46.572718, 'Decrescente'),
    ('Free Flow PFE006 - PFS007 Norte', 'RIOSP', 'BR-116', 'SP', 228.85, 'São Paulo', -23.50926, -46.572718, 'Decrescente'),
    ('Free Flow PFE006 - PFS008 Norte', 'RIOSP', 'BR-116', 'SP', 228.85, 'São Paulo', -23.50926, -46.572718, 'Decrescente'),
    ('Free Flow PFE006 - PFS009 Norte', 'RIOSP', 'BR-116', 'SP', 228.85, 'São Paulo', -23.50926, -46.572718, 'Decrescente'),
    ('Free Flow PFE006 - PFS010 Norte', 'RIOSP', 'BR-116', 'SP', 228.85, 'São Paulo', -23.50926, -46.572718, 'Decrescente'),
    ('Free Flow PFE005 - BAIRRO Norte', 'RIOSP', 'BR-116', 'SP', 231.3, 'São Paulo', -23.526095, -46.588329, 'Decrescente'),
    ('Free Flow PFE005 - PEDARD Norte', 'RIOSP', 'BR-116', 'SP', 231.3, 'São Paulo', -23.526095, -46.588329, 'Decrescente'),
    ('Free Flow PFE005 - PEDARU Norte', 'RIOSP', 'BR-116', 'SP', 231.3, 'São Paulo', -23.526095, -46.588329, 'Decrescente'),
    ('Free Flow PFE005 - PFS006 Norte', 'RIOSP', 'BR-116', 'SP', 231.3, 'São Paulo', -23.526095, -46.588329, 'Decrescente'),
    ('Free Flow PFE005 - PFS007 Norte', 'RIOSP', 'BR-116', 'SP', 231.3, 'São Paulo', -23.526095, -46.588329, 'Decrescente'),
    ('Free Flow PFE005 - PFS008 Norte', 'RIOSP', 'BR-116', 'SP', 231.3, 'São Paulo', -23.526095, -46.588329, 'Decrescente'),
    ('Free Flow PFE005 - PFS009 Norte', 'RIOSP', 'BR-116', 'SP', 231.3, 'São Paulo', -23.526095, -46.588329, 'Decrescente'),
    ('Free Flow PFE005 - PFS010 Norte', 'RIOSP', 'BR-116', 'SP', 231.3, 'São Paulo', -23.526095, -46.588329, 'Decrescente'),
    ('Itatiaia Norte', 'RIOSP', 'BR-116', 'RJ', 324.8, 'Itatiaia', -22.49, -44.57, 'Decrescente'),
    ('Itatiaia Sul', 'RIOSP', 'BR-116', 'RJ', 324.8, 'Itatiaia', -22.49, -44.57, 'Crescente'),

    -- RODOVIA DO AÇO
    ('SAPUCAIA', 'RODOVIA DO AÇO', 'BR-393', 'RJ', 125.7, 'Sapucaia', -21.962326, -42.861675, 'Crescente/Decrescente'),
    ('PARAÍBA DO SUL', 'RODOVIA DO AÇO', 'BR-393', 'RJ', 195.2, 'Paraíba do Sul', -22.208911, -43.382139, 'Crescente/Decrescente'),
    ('BARRA DA PIRAI', 'RODOVIA DO AÇO', 'BR-393', 'RJ', 265.2, 'Barra do Piraí', -22.485435, -43.919084, 'Crescente/Decrescente'),

    -- ROTA VERDE GOIÁS
    ('Free Flow Santa Helena de Goiás - P05', 'ROTA VERDE GOIÁS', 'BR-452', 'GO', 44.9, 'Santa Helena de Goiás', -17.944974, -50.517476, 'Crescente/Decrescente'),
    ('Free Flow Bom Jesus de Goiás - P06', 'ROTA VERDE GOIÁS', 'BR-452', 'GO', 99.85, 'Bom Jesus de Goiás', -18.114585, -50.039087, 'Crescente/Decrescente'),
    ('Free Flow Bom Jesus de Goiás - P07', 'ROTA VERDE GOIÁS', 'BR-452', 'GO', 147.59, 'Bom Jesus de Goiás', -18.276646, -49.631116, 'Crescente/Decrescente'),
    ('Free Flow Abadia de Goiás - P01A', 'ROTA VERDE GOIÁS', 'BR-60', 'GO', 172.0, 'Abadia de Goiás', -16.747265, -49.422998, 'Decrescente'),
    ('Free Flow Abadia de Goiás - P01B', 'ROTA VERDE GOIÁS', 'BR-60', 'GO', 182.595, 'Abadia de Goiás', -16.792644, -49.505717, 'Crescente'),
    ('Free Flow Indiara - P02A', 'ROTA VERDE GOIÁS', 'BR-60', 'GO', 233.75, 'Indiara', -17.082876, -49.837071, 'Decrescente'),
    ('Free Flow Indiara - P02B', 'ROTA VERDE GOIÁS', 'BR-60', 'GO', 233.85, 'Indiara', -17.082695, -49.837551, 'Crescente'),
    ('Free Flow Jandaia - P03A', 'ROTA VERDE GOIÁS', 'BR-60', 'GO', 281.6, 'Jandaia', -17.263997, -50.229512, 'Decrescente'),
    ('Free Flow Jandaia - P03B', 'ROTA VERDE GOIÁS', 'BR-60', 'GO', 281.7, 'Jandaia', -17.263889, -50.229722, 'Crescente'),
    ('Free Flow Acreuna - P04B', 'ROTA VERDE GOIÁS', 'BR-60', 'GO', 325.89, 'Acreúna', -17.5426, -50.5082, 'Crescente'),
    ('Free Flow Acreuna - P04A', 'ROTA VERDE GOIÁS', 'BR-60', 'GO', 326.0, 'Acreúna', -17.542722, -50.508903, 'Decrescente'),

    -- TRANSBRASILIANA
    ('P 01', 'TRANSBRASILIANA', 'BR-153', 'SP', 35.8, 'Onda Verde', -20.588611, -49.318055, 'Crescente/Decrescente'),
    ('P 02', 'TRANSBRASILIANA', 'BR-153', 'SP', 98.9, 'José Bonifácio', -20.9975, -49.628333, 'Crescente/Decrescente'),
    ('P 03', 'TRANSBRASILIANA', 'BR-153', 'SP', 183.8, 'Lins', -21.710555, -49.808611, 'Crescente/Decrescente'),
    ('P 04', 'TRANSBRASILIANA', 'BR-153', 'SP', 268.1, 'Vera Cruz', -22.336311, -49.898833, 'Crescente/Decrescente'),

    -- VIA ARAUCÁRIA
    ('P01 São Luiz do Purunã', 'VIA ARAUCÁRIA', 'BR-277', 'PR', 140.0, 'Balsa Nova', -25.47, -49.66, 'Crescente/Decrescente'),
    ('P02 Porto Amazonas', 'VIA ARAUCÁRIA', 'BR-277', 'PR', 165.7, 'Porto Amazonas', -25.47, -49.9, 'Crescente/Decrescente'),
    ('P03 Irati', 'VIA ARAUCÁRIA', 'BR-277', 'PR', 256.1, 'Irati', -25.44, -50.72, 'Crescente/Decrescente'),
    ('P04 Imbituva', 'VIA ARAUCÁRIA', 'BR-373', 'PR', 216.0, 'Imbituva', -25.16, -50.54, 'Crescente/Decrescente'),
    ('P05 Lapa', 'VIA ARAUCÁRIA', 'BR-476', 'PR', 191.42, 'Lapa', -25.725664, -49.699992, 'Crescente/Decrescente'),

    -- VIA BRASIL
    ('P3 - Trairão', 'VIA BRASIL', 'BR-163', 'PA', 636.015, 'Trairão', -4.620594, -55.951381, 'Crescente/Decrescente'),
    ('P1 - Claúdia', 'VIA BRASIL', 'BR-163', 'MT', 897.0, 'Cláudia', -11.339218, -55.331222, 'Crescente/Decrescente'),
    ('P2 - Guarantã do Norte', 'VIA BRASIL', 'BR-163', 'MT', 1089.45, 'Terra Nova do Norte', -9.756473, -54.89443, 'Crescente/Decrescente'),

    -- VIA CAMPO
    ('P01 - Floresta', 'VIA CAMPO', '317', 'PR', 129.6, 'Floresta', -23.636463, -52.10762, 'Crescente/Decrescente'),
    ('P02 - Mamborê', 'VIA CAMPO', 'BR-369', 'PR', 363.0, 'Campo Mourão', -24.197723, -52.501062, 'Crescente/Decrescente'),
    ('P03 - Corbélia', 'VIA CAMPO', 'BR-369', 'PR', 479.0, 'Corbélia', -24.743943, -53.268683, 'Crescente/Decrescente'),

    -- VIA COSTEIRA
    ('P1-Laguna', 'VIA COSTEIRA', 'BR-101', 'SC', 298.66, 'Laguna', -28.350722, -48.739429, 'Crescente/Decrescente'),
    ('P2-Tubarão', 'VIA COSTEIRA', 'BR-101', 'SC', 344.7, 'Tubarão', -28.554278, -49.054214, 'Crescente/Decrescente'),
    ('P3-Araranguá', 'VIA COSTEIRA', 'BR-101', 'SC', 404.55, 'Maracajá', -28.89774, -49.473136, 'Crescente/Decrescente'),
    ('P4-São João do Sul', 'VIA COSTEIRA', 'BR-101', 'SC', 457.53, 'São João do Sul', -29.243667, -49.754475, 'Crescente/Decrescente'),

    -- VIA CRISTAIS
    ('P1 - Paracatu', 'VIA CRISTAIS', 'BR-40', 'MG', 17.65, 'Paracatu', -17.09831, -47.02624, 'Crescente/Decrescente'),
    ('P2 - Lagoa Grande', 'VIA CRISTAIS', 'BR-40', 'MG', 91.295, 'Lagoa Grande', -17.50598, -46.56465, 'Crescente/Decrescente'),
    ('P3 - João Pinheiro', 'VIA CRISTAIS', 'BR-40', 'MG', 172.985, 'João Pinheiro', -17.94577, -46.03425, 'Crescente/Decrescente'),
    ('P4 - São Gonçalo do Abaeté', 'VIA CRISTAIS', 'BR-40', 'MG', 254.1, 'São Gonçalo do Abaeté', -18.13265, -45.40817, 'Crescente/Decrescente'),
    ('P5 - Felixlândia', 'VIA CRISTAIS', 'BR-40', 'MG', 328.705, 'Felixlândia', -18.5654, -45.02116, 'Crescente/Decrescente'),
    ('P6 - Curvelo', 'VIA CRISTAIS', 'BR-40', 'MG', 405.353, 'Curvelo', -19.0793, -44.65495, 'Crescente/Decrescente'),
    ('P7 - Capim Branco', 'VIA CRISTAIS', 'BR-40', 'MG', 487.341, 'Capim Branco', -19.60121, -44.22196, 'Crescente/Decrescente'),

    -- VIA SUL
    ('P1-Três Cachoeiras', 'VIA SUL', 'BR-101', 'RS', 35.2, 'Três Cachoeiras', -29.520461, -49.996581, 'Crescente/Decrescente'),
    ('P2-Santo Antônio da Patrulha', 'VIA SUL', 'BR-290', 'RS', 19.4, 'Santo Antônio da Patrulha', -29.885897, -50.448964, 'Crescente/Decrescente'),
    ('P3-Gravatai', 'VIA SUL', 'BR-290', 'RS', 60.0, 'Gravataí', -29.925023, -50.859104, 'Crescente/Decrescente'),
    ('P7-Victor Graeff', 'VIA SUL', 'BR-386', 'RS', 204.4, 'Victor Graeff', -28.502039, -52.644709, 'Crescente/Decrescente'),
    ('P6-Fontoura Xavier', 'VIA SUL', 'BR-386', 'RS', 262.7, 'Fontoura Xavier', -28.905316, -52.396797, 'Crescente/Decrescente'),
    ('P5-Paverama', 'VIA SUL', 'BR-386', 'RS', 375.8, 'Paverama', -29.626833, -51.775773, 'Crescente/Decrescente'),
    ('P4-Montenegro', 'VIA SUL', 'BR-386', 'RS', 426.0, 'Montenegro', -29.81976, -51.360405, 'Crescente/Decrescente'),

    -- WAY 153
    ('Praça 03 - Prata', 'WAY 153', 'BR-153', 'MG', 128.49, 'Prata', -19.47152, -48.87108, 'Crescente/Decrescente'),
    ('Praça 04 - Fronteira', 'WAY 153', 'BR-153', 'MG', 225.83, 'Fronteira', -20.14244, -49.111056, 'Crescente/Decrescente'),
    ('Praça 01 - Piracanjuba', 'WAY 153', 'BR-153', 'GO', 553.265, 'Professor Jamil', -17.16337, -49.21284, 'Crescente/Decrescente'),
    ('Praça 02 - Itumbiara', 'WAY 153', 'BR-153', 'GO', 685.39, 'Itumbiara', -18.26855, -49.24592, 'Crescente/Decrescente'),
    ('Praça 05 - Campo Florido', 'WAY 153', 'BR-262', 'MG', 853.19, 'Conceição das Alagoas', -19.77688, -48.45822, 'Crescente/Decrescente'),

    -- WAY 262
    ('Praça 01 - Florestal', 'WAY 262', 'BR-262', 'MG', 384.78, 'Florestal', -19.909936, -44.506876, 'Crescente/Decrescente'),
    ('Praça 02 - Nova Serrana - Free Flow', 'WAY 262', 'BR-262', 'MG', 452.95, 'Nova Serrana', -19.812626, -45.103461, 'Crescente/Decrescente'),
    ('Praça 03 - Luz', 'WAY 262', 'BR-262', 'MG', 505.4, 'Luz', -19.788222, -45.584607, 'Crescente/Decrescente'),
    ('Praça 04 - Campos Altos', 'WAY 262', 'BR-262', 'MG', 591.8, 'Campos Altos', -19.647218, -46.240041, 'Crescente/Decrescente'),
    ('Praça 05 - Ibiá - Free Flow', 'WAY 262', 'BR-262', 'MG', 665.1, 'Ibiá', -19.55027, -46.850368, 'Crescente/Decrescente'),
    ('Praça 06 - Perdizes', 'WAY 262', 'BR-262', 'MG', 721.63, 'Perdizes', -19.617598, -47.34653, 'Crescente/Decrescente')
) as v (name, concessionaria, rodovia, uf, km, municipio, latitude, longitude, direction)
on conflict (concessionaria, name) do nothing;
