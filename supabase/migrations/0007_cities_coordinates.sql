-- CotaFlow — cache de coordenadas geográficas das cidades
-- Evita geocodificar a mesma cidade repetidas vezes ao desenhar o mapa da
-- rota (Nominatim limita a 1 requisição/segundo e exige cache local).

alter table cities add column if not exists latitude numeric;
alter table cities add column if not exists longitude numeric;
