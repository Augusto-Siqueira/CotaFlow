-- CotaFlow — layout de PDF por cliente + dois campos de cotação que o
-- layout Kemin precisa e que ainda não existiam: validade (data) e prazo de
-- entrega (texto livre, ex: "1 dia após carregado").
--
-- `pdf_layout` decide, na hora de gerar o PDF (ver src/lib/pdf), qual
-- template usar pra aquele cliente — 'padrao' é o layout atual do CotaFlow,
-- 'kemin' é o formato de tabela que a Kemin do Brasil exige (Valor Líquido
-- do Frete / Pedágios / Seguro / Impostos discriminados / Valor Bruto).
-- Mesmo padrão de catálogo fechado já usado em quotes_status_check (0033).
alter table clients add column if not exists pdf_layout text not null default 'padrao';

alter table clients add constraint clients_pdf_layout_check
  check (pdf_layout in ('padrao', 'kemin'));

-- Nulos em cotações antigas (criadas antes deste layout existir) e em
-- qualquer cotação que não precise desses campos — não são obrigatórios
-- pro layout padrão, só aparecem no PDF quando o layout do cliente pede.
alter table quotes add column if not exists validity_date date;
alter table quotes add column if not exists delivery_deadline text;
