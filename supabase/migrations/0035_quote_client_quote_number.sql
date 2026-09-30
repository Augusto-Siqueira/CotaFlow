-- CotaFlow — número de cotação que o PRÓPRIO CLIENTE define (ex: Kemin
-- organiza as cotações dela pelo número interno do sistema dela, não pelo
-- ID que o CotaFlow gera). Texto livre, preenchido manualmente pelo usuário
-- no momento de criar a cotação — nada aqui é gerado automaticamente.
--
-- Usado só no cabeçalho do PDF do layout Kemin (ver src/lib/pdf), no lugar
-- do "Cotação #<id>" que o layout padrão mostra. Nulo é o caso normal pra
-- qualquer cotação de outro cliente, ou uma da Kemin ainda sem o número
-- informado.
alter table quotes add column if not exists client_quote_number text;
