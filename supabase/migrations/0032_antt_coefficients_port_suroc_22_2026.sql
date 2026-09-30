-- CotaFlow — coeficientes oficiais do piso mínimo ANTT (Tabela A), atualização
-- extraordinária por variação do diesel.
--
-- Fonte: Portaria SUROC nº 22, de 28/09/2026 (ANTT), publicada em edição
-- extra do DOU em 29/09/2026, vigente a partir de 30/09/2026 — atualiza o
-- Anexo II da Resolução ANTT nº 5.867/2020 (a mesma que a 0008 já
-- atualizava via Resolução 6.084/2026, de julho). Gatilho: diesel S10 subiu
-- de R$ 6,97/L (base de julho) para R$ 7,33/L (média ANP 20-26/09/2026),
-- variação suficiente para acionar reajuste extraordinário pela Lei
-- 13.703/2018.
--
-- Extraído direto de https://calculadorafrete.antt.gov.br (calculadora
-- oficial da ANTT), que expõe CCD e CC no HTML de resposta e confirma
-- textualmente "VALORES CALCULADOS CONFORME RESOLUÇÃO ANTT Nº 5.867/2020,
-- ATUALIZADA EM 30/09/2026 PELA PORT.SUROC Nº22/2026". Não encontramos o
-- texto da portaria em si publicado com tabela numérica (DOU/ANTTlegis
-- bloqueados neste ambiente) — a calculadora foi a fonte primária acessível
-- mais confiável, validada com sessão e token anti-forgery novos.
--
-- Confirmado nas 9 categorias abaixo: reajuste "normal", só repassando
-- diesel — CC (carga/descarga) idêntico à 0008, CCD (deslocamento) sobe
-- entre +1% e +3% por eixo. Granel sólido, Granel líquido, Frigorificada ou
-- Aquecida, Carga Geral, Neogranel, Perigosa (granel sólido), Perigosa
-- (granel líquido), Perigosa (Frigorificada ou Aquecida), Perigosa (carga
-- geral).
--
-- ATENÇÃO — achado nas 3 categorias restantes, não é só reajuste de preço:
-- Conteinerizada, Perigosa (conteinerizada) e Granel Pressurizada tiveram a
-- faixa de eixos RECLASSIFICADA, não apenas reajustada. O valor de N eixos
-- na tabela nova bate quase exato (CC idêntico ao centavo, na maioria) com
-- o valor de N-1 eixos na tabela antiga — ou seja, as faixas de eixo baixo
-- foram fundidas (2 e 3 eixos viraram uma faixa só nas duas primeiras;
-- Granel Pressurizada fundiu 2, 3 E 4 eixos numa faixa única). Bate com a
-- "revisão técnica" da tabela que a ANTT vinha anunciando em notícias da
-- época. A Transbochnia não opera com nenhuma dessas 3 categorias
-- (confirmado com o usuário em 30/09/2026) — aplicado mesmo assim, pela
-- completude da tabela A, mas vale re-conferir contra o texto oficial da
-- portaria se algum dia passarem a operar com elas.
insert into antt_coefficients (axles, cargo_type, ccd, cc) values

  -- Granel sólido
  (2, 'Granel sólido', 4.1056, 460.59),
  (3, 'Granel sólido', 5.2555, 552.24),
  (4, 'Granel sólido', 5.9476, 597.00),
  (5, 'Granel sólido', 6.8548, 664.83),
  (6, 'Granel sólido', 7.5641, 680.01),
  (7, 'Granel sólido', 8.2316, 820.34),
  (9, 'Granel sólido', 9.4318, 908.91),

  -- Granel líquido
  (2, 'Granel líquido', 4.1796, 471.98),
  (3, 'Granel líquido', 5.3511, 569.57),
  (4, 'Granel líquido', 6.1019, 621.52),
  (5, 'Granel líquido', 7.0226, 693.08),
  (6, 'Granel líquido', 7.7372, 709.72),
  (7, 'Granel líquido', 8.3700, 840.50),
  (9, 'Granel líquido', 9.5909, 934.76),

  -- Frigorificada ou Aquecida
  (2, 'Frigorificada ou Aquecida', 4.8234, 520.07),
  (3, 'Frigorificada ou Aquecida', 6.1659, 623.27),
  (4, 'Frigorificada ou Aquecida', 7.0345, 686.63),
  (5, 'Frigorificada ou Aquecida', 8.0623, 757.98),
  (6, 'Frigorificada ou Aquecida', 8.8911, 772.35),
  (7, 'Frigorificada ou Aquecida', 9.8134, 982.76),
  (9, 'Frigorificada ou Aquecida', 11.1479, 1067.06),

  -- Conteinerizada (faixa de eixos reclassificada — ver nota acima)
  (2, 'Conteinerizada', 5.2282, 544.75),
  (3, 'Conteinerizada', 5.2282, 544.75),
  (4, 'Conteinerizada', 5.8755, 577.15),
  (5, 'Conteinerizada', 6.7910, 647.29),
  (6, 'Conteinerizada', 7.4986, 662.01),
  (7, 'Conteinerizada', 8.2292, 819.69),

  -- Carga Geral
  (2, 'Carga Geral', 4.0738, 451.84),
  (3, 'Carga Geral', 5.2177, 541.86),
  (4, 'Carga Geral', 5.9180, 588.86),
  (5, 'Carga Geral', 6.8284, 657.56),
  (6, 'Carga Geral', 7.5347, 671.93),
  (7, 'Carga Geral', 8.2727, 831.66),
  (9, 'Carga Geral', 9.4114, 903.32),

  -- Neogranel
  (2, 'Neogranel', 3.6743, 451.84),
  (3, 'Neogranel', 5.2162, 541.44),
  (4, 'Neogranel', 5.9453, 596.35),
  (5, 'Neogranel', 6.8284, 657.56),
  (6, 'Neogranel', 7.5347, 671.93),
  (7, 'Neogranel', 8.2727, 831.66),
  (9, 'Neogranel', 9.4114, 903.32),

  -- Perigosa (granel sólido)
  (2, 'Perigosa (granel sólido)', 4.8756, 608.79),
  (3, 'Perigosa (granel sólido)', 6.0354, 703.16),
  (4, 'Perigosa (granel sólido)', 6.7644, 753.03),
  (5, 'Perigosa (granel sólido)', 7.6715, 820.86),
  (6, 'Perigosa (granel sólido)', 8.3808, 836.04),
  (7, 'Perigosa (granel sólido)', 9.0666, 981.39),
  (9, 'Perigosa (granel sólido)', 10.2747, 1072.15),

  -- Perigosa (granel líquido)
  (2, 'Perigosa (granel líquido)', 4.9621, 632.58),
  (3, 'Perigosa (granel líquido)', 6.1436, 732.90),
  (4, 'Perigosa (granel líquido)', 6.8986, 789.96),
  (5, 'Perigosa (granel líquido)', 7.8193, 861.51),
  (6, 'Perigosa (granel líquido)', 8.5339, 878.16),
  (7, 'Perigosa (granel líquido)', 9.1849, 1013.95),
  (9, 'Perigosa (granel líquido)', 10.4138, 1110.41),

  -- Perigosa (Frigorificada ou Aquecida)
  (2, 'Perigosa (Frigorificada ou Aquecida)', 5.4315, 630.88),
  (3, 'Perigosa (Frigorificada ou Aquecida)', 6.7869, 737.63),
  (4, 'Perigosa (Frigorificada ou Aquecida)', 7.6718, 807.63),
  (5, 'Perigosa (Frigorificada ou Aquecida)', 8.6996, 878.98),
  (6, 'Perigosa (Frigorificada ou Aquecida)', 9.5284, 893.35),
  (7, 'Perigosa (Frigorificada ou Aquecida)', 10.4745, 1110.28),
  (9, 'Perigosa (Frigorificada ou Aquecida)', 11.8192, 1197.43),

  -- Perigosa (conteinerizada) (faixa de eixos reclassificada — ver nota acima)
  (2, 'Perigosa (conteinerizada)', 5.6126, 645.45),
  (3, 'Perigosa (conteinerizada)', 5.6126, 645.45),
  (4, 'Perigosa (conteinerizada)', 6.2966, 682.95),
  (5, 'Perigosa (conteinerizada)', 7.2121, 753.10),
  (6, 'Perigosa (conteinerizada)', 7.9198, 767.81),
  (7, 'Perigosa (conteinerizada)', 8.6686, 930.51),

  -- Perigosa (carga geral)
  (2, 'Perigosa (carga geral)', 4.4482, 549.81),
  (3, 'Perigosa (carga geral)', 5.6021, 642.55),
  (4, 'Perigosa (carga geral)', 6.3392, 694.66),
  (5, 'Perigosa (carga geral)', 7.2495, 763.36),
  (6, 'Perigosa (carga geral)', 7.9558, 777.73),
  (7, 'Perigosa (carga geral)', 8.7121, 942.48),
  (9, 'Perigosa (carga geral)', 9.8588, 1016.33),

  -- Granel Pressurizada (2, 3 e 4 eixos fundidos numa faixa única — ver nota acima)
  (2, 'Granel Pressurizada', 7.1929, 757.81),
  (3, 'Granel Pressurizada', 7.1929, 757.81),
  (4, 'Granel Pressurizada', 7.1929, 757.81)

on conflict (axles, cargo_type) do update
  set ccd = excluded.ccd, cc = excluded.cc;
