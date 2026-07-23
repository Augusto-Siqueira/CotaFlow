-- CotaFlow — coeficientes oficiais do piso mínimo ANTT (Tabela A)
-- Fonte: Resolução ANTT nº 6.084, de 16/07/2026 (altera o Anexo II da
-- Resolução ANTT nº 5.867/2020), publicada no DOU em 17/07/2026.
-- https://anttlegis.antt.gov.br/action/ActionDatalegis.php?acao=abrirTextoAto&tipo=RES&numeroAto=00006084&seqAto=000&valorAno=2026&orgao=DG%2FANTT%2FMT&cod_modulo=623&cod_menu=9230
--
-- Tabela A = carga lotação, contratação da composição veicular completa
-- (cavalo + carreta). A resolução também tem Tabelas B/C/D (unidade de
-- tração isolada e/ou alto desempenho), que não são usadas pela Transbochnia
-- e não foram cadastradas — o schema atual (unique por eixos+tipo de carga)
-- não suporta múltiplas tabelas simultaneamente.

-- Remove os valores de exemplo cadastrados na migração 0003.
delete from antt_coefficients where cargo_type like '%(exemplo)%';

insert into antt_coefficients (axles, cargo_type, ccd, cc) values
  (2, 'Granel sólido', 4.0144, 460.59),
  (3, 'Granel sólido', 5.1355, 552.24),
  (4, 'Granel sólido', 5.8118, 597.00),
  (5, 'Granel sólido', 6.6983, 664.83),
  (6, 'Granel sólido', 7.3841, 680.01),
  (7, 'Granel sólido', 8.0516, 820.34),
  (9, 'Granel sólido', 9.2231, 908.91),

  (2, 'Granel líquido', 4.0884, 471.98),
  (3, 'Granel líquido', 5.2311, 569.57),
  (4, 'Granel líquido', 5.9661, 621.52),
  (5, 'Granel líquido', 6.8661, 693.08),
  (6, 'Granel líquido', 7.5572, 709.72),
  (7, 'Granel líquido', 8.1900, 840.50),
  (9, 'Granel líquido', 9.3822, 934.76),

  (2, 'Frigorificada ou Aquecida', 4.7095, 520.07),
  (3, 'Frigorificada ou Aquecida', 6.0159, 623.27),
  (4, 'Frigorificada ou Aquecida', 6.8646, 686.63),
  (5, 'Frigorificada ou Aquecida', 7.8666, 757.98),
  (6, 'Frigorificada ou Aquecida', 8.6661, 772.35),
  (7, 'Frigorificada ou Aquecida', 9.5884, 982.76),
  (9, 'Frigorificada ou Aquecida', 10.8870, 1067.06),

  (2, 'Conteinerizada', 5.1082, 544.75),
  (3, 'Conteinerizada', 5.7396, 577.15),
  (4, 'Conteinerizada', 6.6345, 647.29),
  (5, 'Conteinerizada', 7.3186, 662.01),
  (6, 'Conteinerizada', 8.0492, 819.69),
  (7, 'Conteinerizada', 9.1399, 886.05),

  (2, 'Carga Geral', 3.9826, 451.84),
  (3, 'Carga Geral', 5.0977, 541.86),
  (4, 'Carga Geral', 5.7822, 588.86),
  (5, 'Carga Geral', 6.6718, 657.56),
  (6, 'Carga Geral', 7.3547, 671.93),
  (7, 'Carga Geral', 8.0927, 831.66),
  (9, 'Carga Geral', 9.2027, 903.32),

  (2, 'Neogranel', 3.6023, 451.84),
  (3, 'Neogranel', 5.0962, 541.44),
  (4, 'Neogranel', 5.8094, 596.35),
  (5, 'Neogranel', 6.6718, 657.56),
  (6, 'Neogranel', 7.3547, 671.93),
  (7, 'Neogranel', 8.0927, 831.66),
  (9, 'Neogranel', 9.2027, 903.32),

  (2, 'Perigosa (granel sólido)', 4.7845, 608.79),
  (3, 'Perigosa (granel sólido)', 5.9154, 703.16),
  (4, 'Perigosa (granel sólido)', 6.6285, 753.03),
  (5, 'Perigosa (granel sólido)', 7.5150, 820.86),
  (6, 'Perigosa (granel sólido)', 8.2008, 836.04),
  (7, 'Perigosa (granel sólido)', 8.8866, 981.39),
  (9, 'Perigosa (granel sólido)', 10.0660, 1072.15),

  (2, 'Perigosa (granel líquido)', 4.8710, 632.58),
  (3, 'Perigosa (granel líquido)', 6.0236, 732.90),
  (4, 'Perigosa (granel líquido)', 6.7628, 789.96),
  (5, 'Perigosa (granel líquido)', 7.6628, 861.51),
  (6, 'Perigosa (granel líquido)', 8.3539, 878.16),
  (7, 'Perigosa (granel líquido)', 9.0049, 1013.95),
  (9, 'Perigosa (granel líquido)', 10.2051, 1110.41),

  (2, 'Perigosa (Frigorificada ou Aquecida)', 5.3176, 630.88),
  (3, 'Perigosa (Frigorificada ou Aquecida)', 6.6369, 737.63),
  (4, 'Perigosa (Frigorificada ou Aquecida)', 7.5020, 807.63),
  (5, 'Perigosa (Frigorificada ou Aquecida)', 8.5039, 878.98),
  (6, 'Perigosa (Frigorificada ou Aquecida)', 9.3034, 893.35),
  (7, 'Perigosa (Frigorificada ou Aquecida)', 10.2495, 1110.28),
  (9, 'Perigosa (Frigorificada ou Aquecida)', 11.5584, 1197.43),

  (2, 'Perigosa (conteinerizada)', 5.4926, 645.45),
  (3, 'Perigosa (conteinerizada)', 6.1608, 682.95),
  (4, 'Perigosa (conteinerizada)', 7.0556, 753.10),
  (5, 'Perigosa (conteinerizada)', 7.7398, 767.81),
  (6, 'Perigosa (conteinerizada)', 8.4886, 930.51),
  (7, 'Perigosa (conteinerizada)', 9.5873, 999.06),

  (2, 'Perigosa (carga geral)', 4.3571, 549.81),
  (3, 'Perigosa (carga geral)', 5.4821, 642.55),
  (4, 'Perigosa (carga geral)', 6.2033, 694.66),
  (5, 'Perigosa (carga geral)', 7.0930, 763.36),
  (6, 'Perigosa (carga geral)', 7.7758, 777.73),
  (7, 'Perigosa (carga geral)', 8.5321, 942.48),
  (9, 'Perigosa (carga geral)', 9.6501, 1016.33),

  (2, 'Granel Pressurizada', 7.0364, 757.81),
  (3, 'Granel Pressurizada', 7.7652, 784.82),
  (4, 'Granel Pressurizada', 9.7444, 1052.26)
on conflict (axles, cargo_type) do update
  set ccd = excluded.ccd, cc = excluded.cc;
