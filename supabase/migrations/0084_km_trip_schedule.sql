-- CotaFlow — KM Btech ligado à Programação.
--
-- A viagem da Btech passa a ser lançada no KM Btech, antes do carregamento, e
-- cria a carga da Programação (e a ordem de embarque). schedule_id guarda essa
-- carga: o KM manda nela (placa, data, destinos e ordem acompanham as edições
-- da viagem). Se a carga for excluída na Programação, a viagem continua e só
-- perde a ligação.
--
-- Só coluna nova numa tabela que já tem as políticas (0082): nada muda no
-- acesso do portal nem do inspetor.
alter table km_trips
  add column if not exists schedule_id uuid unique references loading_schedules(id) on delete set null;
