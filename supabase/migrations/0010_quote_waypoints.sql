-- CotaFlow — pontos de passagem, pra forçar a rota do mapa a passar por
-- cidades específicas entre os pontos principais. Um texto por trecho
-- (gap) da rota, com os nomes separados por vírgula na ordem em que devem
-- ser visitados. Sem tabela própria — aqui só a ordem importa, não há
-- metadado por ponto (peso, valor etc.) como em quote_deliveries.

alter table quotes add column if not exists waypoints_origin_coleta text;
alter table quotes add column if not exists waypoints_coleta_entrega text;
alter table quotes add column if not exists waypoints_entrega_destino text;
