-- CotaFlow — Precisão explícita da coordenada de cada praça.
--
-- O motor de matching (tollMatching.ts) estimava a precisão contando casas
-- decimais da lat/long — um proxy razoável quando a coordenada vem de uma
-- fonte oficial (ANTT publica com precisão variável, mas é a coordenada
-- real da praça). Mas ao geocodificar as praças de SP por nome de
-- cidade/rodovia (a ARTESP não publica lat/long), esse proxy mentiria: um
-- ponto de centro de cidade do Nominatim vem com 6 casas decimais —
-- pareceria preciso ao olhar só os dígitos, mas na prática pode estar a
-- vários km da praça real. Por isso a precisão passa a ser um dado
-- explícito, gravado no momento da geocodificação, não inferido depois.
--
-- Nula = usa o proxy por casas decimais (comportamento anterior, mantido
-- pras praças da ANTT que já têm coordenada oficial).
alter table toll_plazas add column if not exists coordinate_precision_m numeric;

comment on column toll_plazas.coordinate_precision_m is
  'Precisão estimada da coordenada em metros, quando conhecida na origem (ex: geocoding por cidade). Nula = inferir por casas decimais da lat/long.';
