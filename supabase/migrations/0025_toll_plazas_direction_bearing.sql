-- CotaFlow — Praça de mão única: cobra só num sentido da rodovia.
--
-- A coluna `direction` já existia desde 0014 (comentário lá já previa
-- esse caso: "praça de sentido único só deve entrar no cálculo quando a
-- rota passa naquele sentido"), mas o motor de matching nunca chegou a
-- usá-la — só guardava o dado, sem filtrar nada. Descoberto quando o
-- usuário reportou que a praça de Coxilha (EGR, ERS-135, cadastrada em
-- 0024) só cobra no sentido Passo Fundo -> Erechim, não no retorno.
--
-- Em vez de tentar encaixar isso no vocabulário Crescente/Decrescente do
-- SNV (que é por rodovia, não fica óbvio sem a referência de km da fonte),
-- guardamos o rumo (bearing, 0-360°) do sentido cobrado — comparável
-- diretamente contra o rumo de deslocamento da rota no ponto da
-- travessia, sem precisar saber a convenção de km da concessionária.
-- Nulo = cobra nos dois sentidos (default, preserva o comportamento atual
-- de toda praça existente).
--
-- Rumo calculado a partir das coordenadas de Passo Fundo (-28.2580547,
-- -52.4096248) e Erechim (-27.634909, -52.273737): ~11.7°, ou seja quase
-- para o norte, com leve componente a leste — condizente com a ERS-135
-- seguindo majoritariamente nessa direção entre as duas cidades.

alter table toll_plazas add column if not exists charge_direction_bearing_deg numeric;

comment on column toll_plazas.charge_direction_bearing_deg is
  'Rumo (graus, 0-360, sentido horário a partir do norte) do sentido de deslocamento que essa praça cobra. Nulo = cobra nos dois sentidos.';

update toll_plazas
set charge_direction_bearing_deg = 11.7
where concessionaria = 'EGR' and name = 'Coxilha';

update toll_plazas
set direction = 'Passo Fundo -> Erechim (sentido único)'
where concessionaria = 'EGR' and name = 'Coxilha';
