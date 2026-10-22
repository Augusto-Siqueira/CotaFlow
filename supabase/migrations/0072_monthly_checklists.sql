-- CotaFlow — check-list MENSAL das placas (feito por um funcionário da base).
--
-- Dois modelos, iguais aos formulários de papel:
--   semi  = semirreboques (inclui as carretas de bi-trem, uma por placa)
--   motor = truck, bitruck e cavalo mecânico ("Truck e outros")
-- Respostas: S (atende), N (defeito) ou NA (não se aplica ao implemento).
-- Itens de manutenção respondidos com N viram defeito na triagem da Manutenção.
--
-- Perfil novo "inspetor" (Check-list mensal): só faz e consulta os check-lists
-- mensais. O banco nega a ele todas as outras tabelas (regra restritiva), como
-- no portal do cliente.
-- Quem vê: admin, manutenção, logística (só o painel) e o inspetor.

create or replace function public.is_inspector()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'inspetor';
$$;

create or replace function public.can_do_monthly_checklist()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'manutencao', 'inspetor');
$$;

create or replace function public.can_view_monthly_checklist()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'manutencao', 'logistica', 'inspetor');
$$;

-- "Equipe" = perfis internos de escritório (o inspetor não lê o resto do sistema).
create or replace function public.is_staff()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') not in ('motorista', 'cliente', 'inspetor');
$$;

-- ---------- modelos ----------
create table if not exists monthly_checklist_items (
  id text primary key,                 -- ex.: semi-1.6, motor-2.10
  template text not null check (template in ('semi', 'motor')),
  section text not null,               -- título do bloco (ex.: ESTADO DO VEÍCULO)
  subsection text,                     -- ex.: PARA EQUIPAMENTOS TIPO TANQUE
  number text not null,                -- ex.: 1.6
  text text not null,
  -- Campo extra do item: due = 1 vencimento, due2 = 2 vencimentos (extintores),
  -- cnh = pontos + validade, date = data (última regulagem de freios).
  extra text check (extra in ('due', 'due2', 'cnh', 'date')),
  -- Vencimento que também existe no cadastro da placa (para avisar divergência).
  cert_key text check (cert_key in ('civ', 'cipp', 'crono')),
  maintenance boolean not null default false,   -- N gera defeito na manutenção
  category text,                                 -- categoria do defeito gerado
  position integer not null,
  active boolean not null default true
);
alter table monthly_checklist_items enable row level security;
drop policy if exists "monthly_items_read" on monthly_checklist_items;
drop policy if exists "monthly_items_write" on monthly_checklist_items;
create policy "monthly_items_read" on monthly_checklist_items
  for select to authenticated using (public.can_view_monthly_checklist());
create policy "monthly_items_write" on monthly_checklist_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- check-lists feitos ----------
create table if not exists monthly_checklists (
  id uuid primary key default gen_random_uuid(),
  plate text not null,
  template text not null check (template in ('semi', 'motor')),
  inspector_id uuid not null default auth.uid(),
  inspector_name text,
  driver_name text,
  driver_absent boolean not null default false,
  driver_absent_reason text,
  answers jsonb not null default '{}'::jsonb,       -- { item_id: "S" | "N" | "NA" }
  item_notes jsonb not null default '{}'::jsonb,    -- { item_id: "descrição do defeito" }
  extras jsonb not null default '{}'::jsonb,        -- { item_id: { due, due2, points, validity, date } }
  photos jsonb not null default '{}'::jsonb,        -- { item_id: [caminhos] }
  observations text,
  divergences jsonb not null default '[]'::jsonb,   -- vencimentos diferentes do cadastro
  nonconformities integer not null default 0,
  defects_created integer not null default 0,
  inspector_signature text not null,                -- imagem (PNG em data URL)
  driver_signature text,
  started_at timestamptz,
  finished_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);
create index if not exists monthly_checklists_plate_idx on monthly_checklists (plate, finished_at desc);
alter table monthly_checklists enable row level security;
drop policy if exists "monthly_read" on monthly_checklists;
drop policy if exists "monthly_delete" on monthly_checklists;
create policy "monthly_read" on monthly_checklists
  for select to authenticated using (public.can_view_monthly_checklist());
create policy "monthly_delete" on monthly_checklists
  for delete to authenticated using (public.is_admin());
-- Gravação só pela função submit_monthly_checklist (abaixo).

-- Defeitos gerados pelo check-list mensal têm origem própria.
alter table maintenance_reports drop constraint if exists maintenance_reports_source_check;
alter table maintenance_reports add constraint maintenance_reports_source_check
  check (source in ('manual', 'motorista', 'checklist', 'checklist_mensal'));

-- ---------- inspetor: bloqueado no resto do sistema ----------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop policy if exists "zz_deny_inspector" on public.%I', t.tablename);
    if t.tablename not in ('fleet_units', 'monthly_checklist_items', 'monthly_checklists') then
      execute format(
        'create policy "zz_deny_inspector" on public.%I as restrictive for all to authenticated using (not public.is_inspector()) with check (not public.is_inspector())',
        t.tablename
      );
    end if;
  end loop;
end $$;
-- Placas: o inspetor lê (para escolher a placa e conferir os vencimentos) e não altera.
drop policy if exists "fleet_units_inspector_read" on fleet_units;
create policy "fleet_units_inspector_read" on fleet_units
  for select to authenticated using (public.is_inspector());
drop policy if exists "zz_inspector_read_only" on fleet_units;
create policy "zz_inspector_read_only" on fleet_units
  as restrictive for all to authenticated
  using (true)
  with check (not public.is_inspector());

-- Nomes dos motoristas para o inspetor escolher quem acompanhou (sem CPF).
create or replace function public.monthly_checklist_drivers()
returns table(name text, nickname text)
language sql stable security definer set search_path to 'public'
as $$
  select name, nickname from drivers where public.can_do_monthly_checklist() order by coalesce(nullif(trim(nickname), ''), name);
$$;
revoke all on function public.monthly_checklist_drivers() from public;
grant execute on function public.monthly_checklist_drivers() to authenticated;

-- ---------- envio do check-list ----------
-- Grava o check-list, confere os vencimentos com o cadastro da placa (avisa a
-- divergência, não altera o cadastro) e cria um defeito na triagem para cada
-- item de manutenção marcado com N. Reenviar o mesmo id não duplica nada.
create or replace function public.submit_monthly_checklist(p jsonb)
returns uuid
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_id uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
  v_plate text := upper(btrim(p ->> 'plate'));
  v_kind text;
  v_template text;
  v_answers jsonb := coalesce(p -> 'answers', '{}'::jsonb);
  v_notes jsonb := coalesce(p -> 'item_notes', '{}'::jsonb);
  v_extras jsonb := coalesce(p -> 'extras', '{}'::jsonb);
  v_photos jsonb := coalesce(p -> 'photos', '{}'::jsonb);
  v_fleet fleet_units%rowtype;
  v_div jsonb := '[]'::jsonb;
  v_nc integer := 0;
  v_defects integer := 0;
  it record;
  v_typed date;
  v_reg date;
begin
  if not public.can_do_monthly_checklist() then
    raise exception 'Seu perfil não faz check-list mensal.' using errcode = '42501';
  end if;
  if exists (select 1 from monthly_checklists where id = v_id) then
    return v_id;
  end if;
  select * into v_fleet from fleet_units where plate = v_plate;
  if not found then
    raise exception 'Placa % não cadastrada na frota.', v_plate using errcode = '23503';
  end if;
  v_kind := v_fleet.kind;
  v_template := case when v_kind = 'semirreboque' then 'semi' else 'motor' end;
  if coalesce(p ->> 'inspector_signature', '') !~ '^data:image/png;base64,' then
    raise exception 'Falta a assinatura do responsável.' using errcode = '23514';
  end if;

  for it in
    select * from monthly_checklist_items where template = v_template and active order by position
  loop
    if (v_answers ->> it.id) = 'N' then
      v_nc := v_nc + 1;
    end if;
    -- Vencimento digitado x cadastro da placa.
    if it.cert_key is not null and nullif(v_extras -> it.id ->> 'due', '') is not null then
      v_typed := (v_extras -> it.id ->> 'due')::date;
      v_reg := case it.cert_key when 'civ' then v_fleet.civ_due when 'cipp' then v_fleet.cipp_due else v_fleet.crono_due end;
      if v_reg is distinct from v_typed then
        v_div := v_div || jsonb_build_object('item', it.number, 'cert', it.cert_key, 'checklist', v_typed, 'cadastro', v_reg);
      end if;
    end if;
    -- Defeito na triagem para item de manutenção com N.
    if it.maintenance and (v_answers ->> it.id) = 'N' then
      insert into maintenance_reports (id, plate, category, severity, description, source, photos, reported_at)
      values (
        gen_random_uuid(),
        v_plate,
        coalesce(it.category, 'Outros'),
        case when it.category = 'Freios' then 3 else 2 end,
        '[Check-list mensal] ' || it.number || ' ' || it.text ||
          coalesce(' — ' || nullif(btrim(v_notes ->> it.id), ''), ''),
        'checklist_mensal',
        coalesce(array(select jsonb_array_elements_text(v_photos -> it.id)), '{}'),
        now()
      );
      v_defects := v_defects + 1;
    end if;
  end loop;

  insert into monthly_checklists (
    id, plate, template, inspector_id, inspector_name, driver_name, driver_absent, driver_absent_reason,
    answers, item_notes, extras, photos, observations, divergences, nonconformities, defects_created,
    inspector_signature, driver_signature, started_at, finished_at
  ) values (
    v_id, v_plate, v_template, auth.uid(), nullif(btrim(p ->> 'inspector_name'), ''),
    nullif(btrim(p ->> 'driver_name'), ''), coalesce((p ->> 'driver_absent')::boolean, false),
    nullif(btrim(p ->> 'driver_absent_reason'), ''),
    v_answers, v_notes, v_extras, v_photos, nullif(btrim(p ->> 'observations'), ''), v_div, v_nc, v_defects,
    p ->> 'inspector_signature', nullif(p ->> 'driver_signature', ''),
    nullif(p ->> 'started_at', '')::timestamptz, coalesce(nullif(p ->> 'finished_at', '')::timestamptz, now())
  );
  return v_id;
end;
$$;
revoke all on function public.submit_monthly_checklist(jsonb) from public;
grant execute on function public.submit_monthly_checklist(jsonb) to authenticated;

-- ---------- itens dos formulários ----------
insert into monthly_checklist_items (id, template, section, subsection, number, text, extra, cert_key, maintenance, category, position) values
-- Semirreboques
('semi-1.1','semi','ESTADO DO VEÍCULO',null,'1.1','Para transporte de PP - O certificado de inspeção veicular (CIV) encontra-se dentro do prazo de validade?','due','civ',false,null,101),
('semi-1.2','semi','ESTADO DO VEÍCULO',null,'1.2','Para transporte de PP - O certificado de inspeção (CIPP) encontra-se dentro do prazo de validade?','due','cipp',false,null,102),
('semi-1.3','semi','ESTADO DO VEÍCULO',null,'1.3','O licenciamento do veículo encontra-se dentro do prazo de validade?','due',null,false,null,103),
('semi-1.4','semi','ESTADO DO VEÍCULO',null,'1.4','Adesivos (padrão frota) laterais, traseira, número de frota, tara estão em boas condições?',null,null,true,'Carroceria',104),
('semi-1.5','semi','ESTADO DO VEÍCULO',null,'1.5','Placa legível e lacrada?',null,null,true,'Carroceria',105),
('semi-1.6','semi','ESTADO DO VEÍCULO',null,'1.6','Pneus estão em bom estado e dentro da tolerância de profundidade do sulco? Pneu socorro em bom estado?',null,null,true,'Pneus',106),
('semi-1.7','semi','ESTADO DO VEÍCULO',null,'1.7','O sistema elétrico está funcionando perfeitamente? (verificar toda sinalização)',null,null,true,'Elétrica',107),
('semi-1.8','semi','ESTADO DO VEÍCULO',null,'1.8','Pára-choque normatizado? (verificar plaqueta normatizada)',null,null,true,'Carroceria',108),
('semi-1.9','semi','ESTADO DO VEÍCULO',null,'1.9','Sistema de freios está funcionando corretamente? (realizar teste prático)',null,null,true,'Freios',109),
('semi-1.10','semi','ESTADO DO VEÍCULO',null,'1.10','Limpeza externa do veículo está perfeita?',null,null,false,null,110),
('semi-1.11','semi','ESTADO DO VEÍCULO',null,'1.11','Está sem vazamentos de ar e suspensores de eixos estão funcionando adequadamente? (buscar identificar sons que caracterizem possíveis vazamentos de ar)',null,null,true,'Suspensão',111),
('semi-1.12','semi','ESTADO DO VEÍCULO',null,'1.12','O veículo está sem vazamentos de óleo?',null,null,true,'Outros',112),
('semi-1.13','semi','ESTADO DO VEÍCULO',null,'1.13','O pino rei apresenta-se em perfeitas condições, devidamente fixado, sem trincas ou desgaste? (Quando necessário: remover cavalo mecânico para verificar)',null,null,true,'Carroceria',113),
('semi-1.14','semi','ESTADO DO VEÍCULO',null,'1.14','Os pés de apoio estão funcionando adequadamente? (Realizar teste prático sempre que possível)',null,null,true,'Carroceria',114),
('semi-1.15','semi','ESTADO DO VEÍCULO',null,'1.15','As cintas e catracas utilizadas na fixação de cargas estão em perfeitas condições? (Nota: aplicável apenas a cargas secas, sayders, etc)',null,null,true,'Carroceria',115),
('semi-1.16','semi','ESTADO DO VEÍCULO',null,'1.16','Possui faixa de sinalização refletiva (laterais e para-choque) e as faixas laterais compreendem no mínimo 1/3 do equipamento?',null,null,true,'Carroceria',116),
('semi-2.1','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA',null,'2.1','Estrutura geral está perfeita (sem trincas, amassados, manchas de produtos ou peças quebradas)?',null,null,true,'Carroceria',201),
('semi-2.2','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA',null,'2.2','Compartimento de carga e/ou tanque está limpo?',null,null,false,null,202),
('semi-2.3','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA',null,'2.3','(Para equipamentos carga seca, sider ou basculante): Assoalho em perfeito estado?',null,null,true,'Carroceria',203),
('semi-2.4','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','2.4','As válvulas de fundo e de segurança estão funcionando corretamente e isentas de vazamento?',null,null,true,'Carroceria',204),
('semi-2.5','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','2.5','A vedação das tampas está em bom estado?',null,null,true,'Carroceria',205),
('semi-2.6','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','2.6','As mangueiras estão em bom estado?',null,null,true,'Carroceria',206),
('semi-2.7','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','2.7','A escada está em bom estado?',null,null,true,'Carroceria',207),
('semi-2.8','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','2.8','A plataforma está em bom estado?',null,null,true,'Carroceria',208),
('semi-2.9','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','2.9','Os acoplamentos estão em bom estado?',null,null,true,'Carroceria',209),
('semi-2.10','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','2.10','Pontos de aterramento isentos de pintura e/ou corrosão? (lixar se necessário)',null,null,true,'Carroceria',210),
('semi-2.11','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','2.11','Os mangotes utilizados para descarga apresentam-se em perfeitas condições? Ver indícios de fadigas, rasgos, etc',null,null,true,'Carroceria',211),
('semi-2.12','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO BASCULANTE','2.12','As mangueiras do sistema hidráulico apresentam-se em perfeitas condições? Ver indícios de ruptura, rasgos, etc.',null,null,true,'Outros',212),
('semi-2.13','semi','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO BASCULANTE','2.13','Os pontos de fixação da caixa de carga estão em perfeitas condições? Ver desgastes e/ou trincas',null,null,true,'Carroceria',213),
('semi-3.1','semi','EQUIPAMENTOS OBRIGATÓRIOS (CARGA PERIGOSA)',null,'3.1','(02) extintores dentro do prazo de validade','due2',null,false,null,301),
('semi-3.2','semi','EQUIPAMENTOS OBRIGATÓRIOS (CARGA PERIGOSA)',null,'3.2','Calços de Madeira para estacionamento (2 por equipamento)',null,null,false,null,302),
('semi-3.3','semi','EQUIPAMENTOS OBRIGATÓRIOS (CARGA PERIGOSA)',null,'3.3','Cones de Sinalização (10) Produtos classificados: (04 cones 75cm com faixa refletiva)',null,null,false,null,303),
('semi-3.4','semi','EQUIPAMENTOS OBRIGATÓRIOS (CARGA PERIGOSA)',null,'3.4','Enxada e pá',null,null,false,null,304),
('semi-3.5','semi','EQUIPAMENTOS OBRIGATÓRIOS (CARGA PERIGOSA)',null,'3.5','Suportes de Placas',null,null,false,null,305),
('semi-4.1','semi','AVALIAÇÃO PRÁTICA – "OBRIGATÓRIA"',null,'4.1','Solicitar ao motorista e acompanhá-lo na regulagem dos freios do veículo','date',null,true,'Freios',401),
-- Truck e outros (truck, bitruck e cavalo mecânico)
('motor-1.2','motor','DADOS DO MOTORISTA',null,'1.2','Apresentação pessoal está boa (UNIFORME completo, sapato, CRACHÁ, higiene, limpeza, etc)?',null,null,false,null,102),
('motor-1.3','motor','DADOS DO MOTORISTA',null,'1.3','Está portando CNH e MOPP e estes encontram-se dentro do prazo de validade?','cnh',null,false,null,103),
('motor-2.1','motor','ESTADO DO VEÍCULO',null,'2.1','Está portando cópia das licenças ambientais? ANTT? Estes documentos apresentam-se dentro do prazo de validade?',null,null,false,null,201),
('motor-2.2','motor','ESTADO DO VEÍCULO',null,'2.2','Adesivos (padrão frota) laterais, portas, número de frota, tara estão em boas condições?',null,null,true,'Cabine',202),
('motor-2.3','motor','ESTADO DO VEÍCULO',null,'2.3','O licenciamento do veículo encontra-se dentro do prazo de validade?','due',null,false,null,203),
('motor-2.4','motor','ESTADO DO VEÍCULO',null,'2.4','Para transporte de PP - O certificado de inspeção veicular (CIV) encontra-se dentro do prazo de validade?','due','civ',false,null,204),
('motor-2.5','motor','ESTADO DO VEÍCULO',null,'2.5','Para transporte de PP - O certificado de inspeção (CIPP) encontra-se dentro do prazo de validade?','due','cipp',false,null,205),
('motor-2.6','motor','ESTADO DO VEÍCULO',null,'2.6','Placas (frontal e traseira) legíveis e lacrada (traseira)?',null,null,true,'Carroceria',206),
('motor-2.7','motor','ESTADO DO VEÍCULO',null,'2.7','Cabine está em bom estado (sem amassados, riscos, peças quebradas)?',null,null,true,'Cabine',207),
('motor-2.8','motor','ESTADO DO VEÍCULO',null,'2.8','Pneus estão em bom estado e dentro da tolerância de profundidade do sulco?',null,null,true,'Pneus',208),
('motor-2.9','motor','ESTADO DO VEÍCULO',null,'2.9','O sistema elétrico está funcionando perfeitamente? (Realizar teste prático: sinalização, buzina, motor arranque, limpador parabrisas, chave geral)',null,null,true,'Elétrica',209),
('motor-2.10','motor','ESTADO DO VEÍCULO',null,'2.10','Sistema de freios está funcionando corretamente? (realizar teste prático)',null,null,true,'Freios',210),
('motor-2.11','motor','ESTADO DO VEÍCULO',null,'2.11','Tacógrafo está funcionando corretamente? Está lacrado? Possui certificado de calibração?','due','crono',true,'Elétrica',211),
('motor-2.12','motor','ESTADO DO VEÍCULO',null,'2.12','Limpeza externa do veículo está perfeita?',null,null,false,null,212),
('motor-2.13','motor','ESTADO DO VEÍCULO',null,'2.13','Limpeza interna (cabine) do veículo está perfeita?',null,null,false,null,213),
('motor-2.14','motor','ESTADO DO VEÍCULO',null,'2.14','Para veículos que ainda possuem bomba injetora: a bomba injetora está lacrada?',null,null,true,'Motor',214),
('motor-2.15','motor','ESTADO DO VEÍCULO',null,'2.15','Extintor da cabine em perfeito estado, dentro do prazo de validade?','due',null,false,null,215),
('motor-2.16','motor','ESTADO DO VEÍCULO',null,'2.16','O para-brisa está em perfeitas condições (sem trincas, riscos ou quebrado)?',null,null,true,'Cabine',216),
('motor-2.17','motor','ESTADO DO VEÍCULO',null,'2.17','Os espelhos retrovisores estão em perfeitas condições? (sem trincas, riscos ou quebrado)',null,null,true,'Cabine',217),
('motor-2.18','motor','ESTADO DO VEÍCULO',null,'2.18','O cinto de segurança está funcionando corretamente?',null,null,true,'Cabine',218),
('motor-2.19','motor','ESTADO DO VEÍCULO',null,'2.19','O veículo está sem vazamentos de ar e suspensores de eixos estão funcionando adequadamente? (buscar identificar sons que caracterizem possíveis vazamentos)',null,null,true,'Suspensão',219),
('motor-2.20','motor','ESTADO DO VEÍCULO',null,'2.20','O veículo está sem vazamentos de óleo (combustível/hidráulico/lubrificante)? Motor está sem vazamentos?',null,null,true,'Motor',220),
('motor-2.21','motor','ESTADO DO VEÍCULO',null,'2.21','O sistema de direção (parafusos, barras, terminais, acoplamentos) está em perfeitas condições (sem folgas)?',null,null,true,'Outros',221),
('motor-3.1','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.1','Possui chave de boca, de fenda e alicate universal?',null,null,false,null,301),
('motor-3.2','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.2','Possui chave de roda, macaco e triângulo?',null,null,false,null,302),
('motor-3.3','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.3','Para o transporte de PP: Lanternas com (2) Pilhas (anti explosão quando no transporte de inflamáveis)',null,null,false,null,303),
('motor-3.4','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.4','Para o transporte de PP: (04) Placas de Sinalização "Perigo: Afaste-se"',null,null,false,null,304),
('motor-3.5','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.5','Para o transporte de PP: Fita Zebrada',null,null,false,null,305),
('motor-3.6','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.6','Para o transporte de PP: Suporte para Fita Zebrada',null,null,false,null,306),
('motor-3.7','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.7','Abafador de chamas',null,null,false,null,307),
('motor-3.8','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.8','Para o transporte de PP: Suportes de Placas',null,null,false,null,308),
('motor-3.9','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.9','Adaptador de bocas inferiores, possui ao menos (um adaptador)?',null,null,false,null,309),
('motor-3.10','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.10','Para o transporte de PP: Calços de Madeira para estacionamento (2 por equipamento).',null,null,false,null,310),
('motor-3.11','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.11','Para o transporte de PP: Cones de Sinalização (10) Produtos classificados: (04 cones 75cm com faixa refletiva)',null,null,false,null,311),
('motor-3.12','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.12','Para transporte de PP: Enxada e pá',null,null,false,null,312),
('motor-3.13','motor','FERRAMENTAS E EQUIPAMENTOS OBRIGATÓRIOS',null,'3.13','Para o transporte de PP: As placas utilizadas estão em bom estado de conservação?',null,null,false,null,313),
('motor-4.1','motor','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA',null,'4.1','Estrutura geral está perfeita (sem trincas, amassados, manchas de produtos ou peças quebradas)?',null,null,true,'Carroceria',401),
('motor-4.2','motor','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA',null,'4.2','Compartimento de carga e/ou tanque está limpo?',null,null,false,null,402),
('motor-4.3','motor','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA',null,'4.3','(Para equipamentos carga seca, sayder ou basculante): Assoalho em perfeito estado?',null,null,true,'Carroceria',403),
('motor-4.4','motor','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','4.4','As válvulas de fundo e de segurança estão funcionando corretamente e isentas de vazamento?',null,null,true,'Carroceria',404),
('motor-4.5','motor','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','4.5','A vedação das tampas está em bom estado?',null,null,true,'Carroceria',405),
('motor-4.6','motor','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','4.6','As mangueiras estão em bom estado?',null,null,true,'Carroceria',406),
('motor-4.7','motor','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','4.7','A escada está em bom estado?',null,null,true,'Carroceria',407),
('motor-4.8','motor','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','4.8','A plataforma está em bom estado?',null,null,true,'Carroceria',408),
('motor-4.9','motor','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','4.9','Os acoplamentos estão em bom estado?',null,null,true,'Carroceria',409),
('motor-4.10','motor','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','4.10','Pontos de aterramento isentos de pintura e/ou corrosão? (lixar se necessário)',null,null,true,'Carroceria',410),
('motor-4.11','motor','ESTADO FÍSICO DO COMPARTIMENTO DE CARGA','PARA EQUIPAMENTOS TIPO TANQUE','4.11','Os mangotes utilizados para descarga apresentam-se em perfeitas condições? Ver indícios de fadigas, rasgos, etc',null,null,true,'Carroceria',411),
('motor-5.1','motor','AVALIAÇÃO PRÁTICA – "OBRIGATÓRIA"',null,'5.1','Solicitar ao motorista e acompanhá-lo na regulagem dos freios do veículo','date',null,true,'Freios',501),
('motor-5.2','motor','AVALIAÇÃO PRÁTICA – "OBRIGATÓRIA"',null,'5.2','Solicitar ao motorista e acompanhá-lo na realização completa do Check List Diário.',null,null,false,null,502),
('motor-5.3','motor','AVALIAÇÃO PRÁTICA – "OBRIGATÓRIA"',null,'5.3','Declaro que, durante a execução do presente check list, realizei avaliação geral do veículo e não evidenciei qualquer irregularidade?',null,null,false,null,503)
on conflict (id) do nothing;

-- Portal do cliente (0070): as tabelas novas também ficam fechadas para ele.
drop policy if exists "zz_deny_portal_client" on monthly_checklist_items;
create policy "zz_deny_portal_client" on monthly_checklist_items
  as restrictive for all to authenticated
  using (not public.is_portal_client()) with check (not public.is_portal_client());
drop policy if exists "zz_deny_portal_client" on monthly_checklists;
create policy "zz_deny_portal_client" on monthly_checklists
  as restrictive for all to authenticated
  using (not public.is_portal_client()) with check (not public.is_portal_client());
