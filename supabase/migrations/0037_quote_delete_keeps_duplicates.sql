-- CotaFlow — permite excluir uma cotação que já foi duplicada.
--
-- `duplicated_from_id` (0004) referenciava quotes(id) sem ação de exclusão,
-- então apagar a cotação original falhava por violação de chave estrangeira.
-- Com `on delete set null`, as cópias continuam existindo e só perdem o
-- vínculo com a original.
alter table quotes drop constraint if exists quotes_duplicated_from_id_fkey;
alter table quotes add constraint quotes_duplicated_from_id_fkey
  foreign key (duplicated_from_id) references quotes(id) on delete set null;
