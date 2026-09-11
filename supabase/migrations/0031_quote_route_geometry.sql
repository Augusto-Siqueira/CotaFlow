-- Geometria oficial da rota calculada pela WikiRota (osrmRoute, com
-- fullRoute=true) no momento em que o pedágio foi calculado. Guardamos já
-- decodificada (array de {lat,lng}) pra o mapa desenhar sem precisar
-- reprocessar a polyline codificada nem gastar outra requisição da API.
--
-- Fica null pra cotações que nunca tiveram o pedágio calculado via WikiRota
-- (incluindo todas as cotações antigas, criadas antes deste recurso).
alter table quotes add column if not exists route_geometry jsonb;
