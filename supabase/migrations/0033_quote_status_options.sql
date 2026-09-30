-- CotaFlow — catálogo fechado de status da cotação (Rascunho / Vigente /
-- Obsoleta), pra dar suporte a filtro e edição na lista de cotações.
--
-- `quotes.status` existe desde a 0001 como texto livre, default 'rascunho'
-- — conferido no código: nenhuma tela ou rota grava um valor diferente do
-- default hoje (só o insert em quotes/new e quotes/batches/new, nenhum dos
-- dois passa `status`). O update abaixo é só defensivo, não deve tocar em
-- nenhuma linha existente.
--
-- Valores em minúsculo sem acento (mesmo padrão do default já existente);
-- exibidos capitalizados na UI — ver src/lib/quoteStatus.ts, fonte única
-- pra manter telas de lista/filtro/edição em sincronia com este constraint.
update quotes set status = 'rascunho'
  where status not in ('rascunho', 'vigente', 'obsoleta');

alter table quotes add constraint quotes_status_check
  check (status in ('rascunho', 'vigente', 'obsoleta'));
