-- CotaFlow — Over time (R$/hora) passa a ser um atributo do veículo, não do
-- lote: cada tipo de veículo tem sua própria taxa, então ela é cadastrada uma
-- vez em `vehicles` em vez de ser digitada em cada cotação.
--
-- `quote_batches.over_time_rate` fica obsoleta (o formulário de lote não a
-- escreve mais), mas não é removida aqui para não descartar os valores dos
-- lotes já criados. Cada rota continua guardando sua própria taxa em
-- `quotes.over_time_cost`, copiada do veículo no momento em que a cotação é
-- salva — assim atualizar o cadastro do veículo não altera cotações passadas.

alter table vehicles add column if not exists over_time_rate numeric;
