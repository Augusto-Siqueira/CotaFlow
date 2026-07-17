-- CotaFlow — Origem (base) e Destino final (retorno vazio)
-- `origin`/`destination` já representam Coleta/Entrega (o trecho comercial,
-- cobrado do cliente). Estas colunas novas guardam o deslocamento vazio de
-- ida até a coleta e de volta após a entrega — usadas apenas internamente,
-- não aparecem na proposta em PDF enviada ao cliente.

alter table quotes add column if not exists base_origin text;
alter table quotes add column if not exists final_destination text;
