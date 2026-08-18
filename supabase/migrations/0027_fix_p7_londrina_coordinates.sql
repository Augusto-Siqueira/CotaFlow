-- CotaFlow — Corrige a coordenada de "FREE FLOW P7 LONDRINA" (MOTIVA
-- PARANÁ), que estava ~21km errada no banco (herdada do CSV nacional da
-- ANTT usado na 0016).
--
-- Confirmado que a praça é real: pórtico free-flow na PR-445 km 2, no
-- entroncamento com a BR-376 (Rodovia do Café), perto de Tamarana — não
-- de Mauá da Serra, como o município cadastrado dizia (fonte: notícias
-- oficiais do Governo do PR sobre a instalação desse pórtico).
--
-- Coordenada do entroncamento PR-445/BR-376 vem de documento oficial do
-- Estado (PER — Programa de Exploração da Rodovia): 23°42'35,5"S,
-- 51°7'20,56"O = -23.7098611, -51.1223778. É o ponto mais preciso que
-- achamos, mas o pórtico em si fica ~2km rodovia adentro a partir daí —
-- por isso a precisão fica marcada como 2500m (aproximação), não como
-- coordenada exata.
--
-- CONTINUA DESATIVADA (active = false, decisão de 0026): mesmo com a
-- coordenada corrigida, esse pórtico só cobra quem sai da BR-376 para
-- entrar na PR-445 (rumo a Tamarana/Londrina) — não quem segue direto na
-- BR-376. Como o motor de matching de hoje só considera proximidade
-- (não sabe se a rota realmente virou pra PR-445 ou seguiu na BR-376),
-- reativar com a coordenada corrigida faria o falso positivo voltar —
-- e provavelmente com confiança MAIOR do que antes, já que a coordenada
-- certa fica mais perto da BR-376 do que a errada estava. Só faz sentido
-- reativar se/quando o motor souber diferenciar isso.

update toll_plazas
set
  latitude = -23.7098611,
  longitude = -51.1223778,
  municipio = 'Tamarana',
  coordinate_precision_m = 2500
where concessionaria = 'MOTIVA PARANÁ' and name = 'FREE FLOW P7 LONDRINA';
