-- Contagem de linhas por tabela do schema public, mais usuários e fotos.
-- Roda na origem (Supabase) e no destino; as duas saídas têm que ser iguais.
select 'public.' || table_name as tabela,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as linhas
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
union all
select 'auth.users', count(*) from auth.users
union all
select 'auth.identities', count(*) from auth.identities
union all
select 'storage.objects (fotos)', count(*) from storage.objects where bucket_id = 'driver-photos'
order by 1;
