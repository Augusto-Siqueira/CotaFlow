-- CotaFlow — Primeira praça da EGR (Empresa Gaúcha de Rodovias), a
-- concessionária estadual do RS — mesmo papel que a ARTESP tem para SP.
-- Reportada pelo usuário testando uma rota que passa por Coxilha/RS: a
-- praça não existia em `toll_plazas`, então o motor de matching não a via
-- de jeito nenhum (não é caso de "achou mas sem tarifa" como os gaps da
-- 0023 — aqui a praça inteira estava faltando).
--
-- Coordenada: fornecida pelo usuário (câmera/mapa no local).
-- Tarifa: fornecida pelo usuário (R$ 29,40 = R$ 4,90 x 6 eixos), e batendo
-- com o modelo de cálculo que a EGR descreve publicamente — tarifa básica
-- multiplicada pelo número de eixos, mesmo princípio da ANTT (ver
-- planejamento.rs.gov.br/empresa-gaucha-de-rodovias-altera-calculo-das-
-- tarifas-de-pedagio). A tabela oficial em egr.rs.gov.br/tarifas só existe
-- como imagem (não deu pra extrair o valor por categoria de lá), por isso
-- a fonte primária aqui é o valor visto pelo usuário no local + a fórmula
-- documentada publicamente pela EGR.
--
-- Só entram as categorias M2_0-M8_0: é só o que o motor de tarifação do
-- CotaFlow consulta (frete sempre eixos >= 2 — ver categoryCodeForAxles em
-- src/lib/tollMatching.ts), então não há necessidade de adivinhar a tarifa
-- de moto/carro de passeio (categorias que a EGR também cobra diferente,
-- não estritamente linear).
--
-- Cobrança bidirecional em Coxilha desde 2022 (fonte: mesma notícia
-- acima), por isso direction = 'Crescente/Decrescente'.

insert into toll_plazas (name, concessionaria, rodovia, uf, km, municipio, latitude, longitude, direction, source, active)
values (
  'Coxilha', 'EGR', 'ERS-135', 'RS', 18.3, 'Coxilha',
  -28.162295741521675, -52.30700254440308,
  'Crescente/Decrescente', 'user-reported', true
)
on conflict (concessionaria, name) do nothing;

insert into toll_tariffs (toll_plaza_id, category_id, amount, valid_from, source, source_reference)
select p.id, c.id, v.amount, date '2026-08-18', 'user-reported',
       'Valor informado pelo usuário no local (R$ 29,40 para 6 eixos = R$ 4,90/eixo), extrapolado linearmente conforme fórmula pública da EGR (tarifa básica x nº de eixos) — consultado em 18/08/2026'
from (values
  (2.0, 9.80),
  (3.0, 14.70),
  (4.0, 19.60),
  (5.0, 24.50),
  (6.0, 29.40),
  (7.0, 34.30),
  (8.0, 39.20)
) as v (multiplier, amount)
join toll_plazas p on p.concessionaria = 'EGR' and p.name = 'Coxilha'
join toll_axle_categories c on c.multiplier = v.multiplier
on conflict (toll_plaza_id, category_id, valid_from) do nothing;
