-- CotaFlow — Locais com cerca (geofence) para o status automático.
--
-- Cada local é uma área no mapa: polígono (importado das cercas da A52) ou
-- círculo (centro + raio: da A52 ou desenhado no CotaFlow — ex.: oficinas, que a A52
-- não tem). A posição dos caminhões será comparada com essas cercas para
-- sugerir Carregando / Em viagem / Chegou ao destino / entrada e saída da
-- oficina.
--
-- Importação da A52: a52_address_id identifica a cerca de lá; ao importar de
-- novo, a cerca é atualizada sem duplicar e sem trocar o nome dado aqui.

create table if not exists geo_places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'cliente',
  city text,
  uf text,
  -- Polígono: [[lat, lon], ...] (mínimo 3 pontos).
  polygon jsonb,
  -- Centro (do círculo, ou ponto médio do polígono para centralizar o mapa).
  center_lat double precision,
  center_lon double precision,
  -- Raio em metros (só para cerca em círculo).
  radius_m integer,
  source text not null default 'manual',
  a52_address_id bigint unique,
  a52_client_id bigint,
  a52_name text,
  cnpj text,
  workshop_id uuid references maintenance_workshops(id) on delete set null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geo_places_name_check check (length(btrim(name)) > 0),
  constraint geo_places_kind_check check (kind in ('cliente', 'oficina', 'patio', 'posto', 'outro')),
  constraint geo_places_source_check check (source in ('manual', 'a52')),
  constraint geo_places_radius_check check (radius_m is null or radius_m between 30 and 2000),
  constraint geo_places_fence_check check (
    (polygon is not null and jsonb_typeof(polygon) = 'array' and jsonb_array_length(polygon) >= 3)
    or (center_lat is not null and center_lon is not null and radius_m is not null)
  )
);

create index if not exists geo_places_kind_idx on geo_places (kind) where active;
-- Uma oficina tem um local só.
create unique index if not exists geo_places_workshop_key on geo_places (workshop_id) where workshop_id is not null;

create or replace function public.touch_geo_places()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists geo_places_touch on geo_places;
create trigger geo_places_touch
  before update on geo_places
  for each row execute function public.touch_geo_places();

alter table geo_places enable row level security;
-- Leitura: a equipe interna. Escrita: quem edita a Programação ou a Manutenção.
drop policy if exists "geo_places_read" on geo_places;
create policy "geo_places_read" on geo_places
  for select to authenticated using (public.is_staff());
drop policy if exists "geo_places_write" on geo_places;
create policy "geo_places_write" on geo_places
  for all to authenticated
  using (public.can_edit_schedule() or public.can_edit_maintenance())
  with check (public.can_edit_schedule() or public.can_edit_maintenance());
drop policy if exists "zz_deny_portal_client" on geo_places;
create policy "zz_deny_portal_client" on geo_places
  as restrictive for all to authenticated
  using (not public.is_portal_client()) with check (not public.is_portal_client());
drop policy if exists "zz_deny_inspector" on geo_places;
create policy "zz_deny_inspector" on geo_places
  as restrictive for all to authenticated
  using (not public.is_inspector()) with check (not public.is_inspector());
