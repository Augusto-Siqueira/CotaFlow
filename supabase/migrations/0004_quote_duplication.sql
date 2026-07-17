-- CotaFlow — Fase 2, item 10: duplicação de cotações
-- Rastreia de qual cotação uma duplicata se originou, para dar suporte ao
-- versionamento (backlog: "permitir duplicar sem perder histórico") e ao
-- comparativo de evolução de preços por cliente/rota (seção 3, tela 6).

alter table quotes add column if not exists duplicated_from_id uuid references quotes(id);

create index if not exists quotes_duplicated_from_id_idx on quotes(duplicated_from_id);
