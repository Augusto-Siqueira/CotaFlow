-- CotaFlow — cotação por tonelada: lotação mínima (t). Vazio = valores por carga
-- (como sempre). Preenchido = tela e PDF mostram os valores divididos por ela,
-- com a observação de que abaixo dela fatura-se a lotação mínima.
alter table quotes add column if not exists min_load_tons numeric;
alter table quotes drop constraint if exists quotes_min_load_tons_check;
alter table quotes add constraint quotes_min_load_tons_check
  check (min_load_tons is null or (min_load_tons > 0 and min_load_tons <= 200));
