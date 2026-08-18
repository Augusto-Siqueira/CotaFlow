-- CotaFlow — Conferência de localização das 424 praças contra o OpenStreetMap.
--
-- Segunda fonte independente (Overpass API, barrier=toll_booth, 1.423 nós
-- em 13 estados) pra checar a coordenada que já temos, não só pra SP —
-- pra malha federal também, que vinha direto do CSV da ANTT sem essa
-- conferência cruzada até agora.
--
-- Resultado: 298 das 424 praças confirmadas a menos de 300m de um nó do
-- OSM — incluindo praticamente toda a malha federal que não tinha sido
-- verificada por uma segunda fonte antes. Mais 28 dentro de 1,5km
-- (variação normal — a estrutura física de uma praça já ocupa uns
-- trezentos metros).
--
-- Da divergência real (mesmo operador confirmado no OSM, mas distância
-- grande o suficiente pra não ser só ruído): só a EPR PARANÁ mostrou um
-- padrão consistente — 6 praças, 1,6 a 4km de diferença, sempre o mesmo
-- operador e o mesmo nome de praça/sentido no OSM. Coordenada corrigida
-- aqui a partir do ponto do OSM.
--
-- MOTIVA PARANÁ ("Free Flow P7 Londrina" e "Free Flow P2 Mauá da Serra")
-- também divergiu bastante do OSM (~18km), mas a distância é grande
-- demais e a nota do OSM ("Mauá da Serra / Ortigueira") é genérica o
-- suficiente pra não ter certeza de que é a mesma praça — não corrigido
-- aqui, fica sinalizado pra revisão manual.
--
-- As demais 63 divergências (RIOSP majoritariamente) não são
-- contradição: o nó mais próximo do OSM é de OUTRA concessionária, a
-- vários km — significa que o OSM simplesmente não tem aquele ponto
-- específico mapeado, não que o nosso dado esteja errado. Consistente
-- com o que já se sabia sobre RIOSP (pórticos free-flow não mapeados
-- individualmente em nenhuma fonte que achamos até agora).

update toll_plazas p
set latitude = v.latitude, longitude = v.longitude
from (values
    ('Validador 7012 Rolândia - P07', 'EPR PARANÁ', -23.3608198, -51.3993591),
    ('Free Flow Pres. Castelo Branco - P05 Decrescente', 'EPR PARANÁ', -23.292304, -52.127911),
    ('Free Flow Marialva - P06', 'EPR PARANÁ', -23.5057744, -51.7392319),
    ('Free Flow Pres. Castelo Branco - P05', 'EPR PARANÁ', -23.2922045, -52.1278851),
    ('Free Flow Marialva - P06 Decrescente', 'EPR PARANÁ', -23.5056012, -51.739184),
    ('Free Flow Rolândia - P07  Decrescente', 'EPR PARANÁ', -23.3610561, -51.3991105)
) as v (name, concessionaria, latitude, longitude)
where p.concessionaria = v.concessionaria
  and p.name = v.name
  and p.source = 'antt';
