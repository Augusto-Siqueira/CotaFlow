-- CotaFlow — Alíquotas de ICMS por par de estados (origem → destino).
--
-- O ICMS deixa de ser um valor único do lote e passa a ser resolvido por rota,
-- já que um mesmo lote pode ter rotas em estados diferentes. A alíquota
-- continua gravada em `quotes.icms_pct` (snapshot por cotação), então cotações
-- antigas não mudam se a tabela for reajustada depois.

-- 1) UF das cidades ------------------------------------------------------
-- Os nomes já estão no formato "Município/UF" (ex: "Abadia de Goiás/GO"),
-- então a UF é DERIVADA do próprio dado existente — nenhum valor é inventado.
-- Nomes digitados à mão fora desse padrão (ex: "Guarujá") ficam com uf nula;
-- nesses casos o formulário avisa que não há como resolver a alíquota.
alter table cities add column if not exists uf text;

update cities
   set uf = upper(split_part(name, '/', 2))
 where uf is null
   and name like '%/%'
   and length(split_part(name, '/', 2)) = 2;

create index if not exists cities_uf_idx on cities(uf);

-- 2) Matriz de alíquotas -------------------------------------------------
-- Sem seed: alíquota de ICMS é dado fiscal com efeito legal e deve ser
-- carregada a partir da tabela oficial do usuário, nunca presumida.
create table if not exists icms_rates (
  id uuid primary key default gen_random_uuid(),
  uf_origin text not null,
  uf_destination text not null,
  rate numeric not null,
  created_at timestamptz not null default now(),
  unique (uf_origin, uf_destination)
);

create index if not exists icms_rates_origin_idx on icms_rates(uf_origin);

alter table icms_rates enable row level security;

create policy "icms_rates_allow_all" on icms_rates for all using (true) with check (true);
