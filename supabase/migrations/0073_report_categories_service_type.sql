-- CotaFlow — novas categorias de defeito/serviço: "Preventiva" e "Corretiva".
-- Vale para os relatos de defeito (manutenção e app do motorista) e para os
-- itens do check-list diário.
alter table maintenance_reports drop constraint if exists maintenance_reports_category_check;
alter table maintenance_reports add constraint maintenance_reports_category_check
  check (category in ('Freios', 'Motor', 'Caixa de Câmbio', 'Diferencial', 'Elétrica', 'Pneus', 'Suspensão', 'Cabine', 'Carroceria', 'Preventiva', 'Corretiva', 'Outros'));

alter table checklist_items drop constraint if exists checklist_items_category_check;
alter table checklist_items add constraint checklist_items_category_check
  check (category in ('Freios', 'Motor', 'Caixa de Câmbio', 'Diferencial', 'Elétrica', 'Pneus', 'Suspensão', 'Cabine', 'Carroceria', 'Preventiva', 'Corretiva', 'Outros'));
