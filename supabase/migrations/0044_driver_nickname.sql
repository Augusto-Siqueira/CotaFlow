-- CotaFlow — apelido do motorista (os dois primeiros nomes por padrão). É o
-- que aparece na hora de escolher o motorista numa programação de
-- carregamento. Editável na aba Motoristas.
alter table drivers add column if not exists nickname text;

-- Preenche quem já estiver cadastrado sem apelido: dois primeiros nomes,
-- pulando da/de/do/das/dos/e (ADILSON DA SILVA BARBOSA -> ADILSON SILVA).
update drivers
  set nickname = array_to_string(
    (array(
      select w
      from unnest(string_to_array(btrim(name), ' ')) with ordinality as t(w, ord)
      where lower(w) not in ('da', 'de', 'do', 'das', 'dos', 'e')
      order by ord
    ))[1:2],
    ' ')
  where nickname is null or btrim(nickname) = '';
