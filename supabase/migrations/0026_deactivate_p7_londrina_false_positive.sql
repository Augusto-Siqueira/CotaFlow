-- CotaFlow — Desativa "FREE FLOW P7 LONDRINA" (MOTIVA PARANÁ), reportada
-- pelo usuário como falso positivo: o Qualp não cobra esse pedágio na
-- mesma rota, e o motor de matching já marcava a travessia como
-- "confiança baixa".
--
-- Causa: essa praça fica na PR-445 km 2.47 (Mauá da Serra) — um pórtico
-- free-flow que só cobra quem desvia da BR-376 rumo a Londrina pela
-- PR-445. A rota em questão segue pela BR-376 (mesma via das outras
-- praças da MOTIVA PARANÁ nesse trecho: P2 Mauá da Serra, P05 Tibagi
-- etc.) e nunca entra na PR-445 — mas como o motor de matching hoje só
-- considera proximidade geográfica (não sabe em qual rodovia a rota está
-- passando), esse ponto caiu dentro do raio de busca (3km) por
-- coincidência de estarem fisicamente perto uma da outra, sem a rota de
-- fato usar aquela via.
--
-- Desativar (não apagar) preserva o registro caso precisemos reativar
-- para uma rota que realmente desvie pela PR-445 no futuro.

update toll_plazas
set active = false
where concessionaria = 'MOTIVA PARANÁ' and name = 'FREE FLOW P7 LONDRINA';
