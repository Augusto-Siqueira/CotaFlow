-- CotaFlow — novo status da programação de carregamento: "Entrega Concluída"
-- (entregue), depois de "Carregado em Viagem".
alter table loading_schedules drop constraint if exists loading_schedules_status_check;
alter table loading_schedules add constraint loading_schedules_status_check
  check (status in ('programado', 'lavando', 'carregando', 'em_viagem', 'entregue'));
