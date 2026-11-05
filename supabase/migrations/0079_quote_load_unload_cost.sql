-- CotaFlow — valor de carga e descarga na cotação (campo logo após o Frete
-- Gross). Entra na base do ICMS junto com Gross, Pedágio e Seguro:
--   Full = (Gross + Pedágio + Seguro + Carga/Descarga) / (1 - ICMS)
--   (regra Paraná: (Gross + Seguro + Carga/Descarga) / (1 - ICMS) + Pedágio)
-- Opcional: cotações antigas e rotas de lote ficam com null (= sem esse custo),
-- então nenhum valor já gravado muda.
alter table quotes
  add column if not exists load_unload_cost numeric
  check (load_unload_cost is null or load_unload_cost >= 0);
