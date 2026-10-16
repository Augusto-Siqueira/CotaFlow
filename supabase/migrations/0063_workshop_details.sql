-- CotaFlow — cadastro de oficinas igual ao de clientes: razão social (name),
-- nome fantasia, CNPJ/CPF e segmento. As oficinas antigas ficam sem documento
-- até alguém editar (a tela exige o documento nos cadastros novos).
alter table maintenance_workshops add column if not exists trade_name text;
alter table maintenance_workshops add column if not exists document text;
alter table maintenance_workshops add column if not exists segment text;
