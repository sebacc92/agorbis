-- =============================================================================
-- Agorbis · 0021 · Endurecimiento de automatizaciones
-- =============================================================================

begin;

-- Los barrios son comunidades publicables: deben tener límites explícitos y
-- no heredar accidentalmente el significado anterior de “sin fila = sin tope”.
insert into public.content_quotas (level, content_type, monthly_limit) values
  (5, 'poll', 10), (5, 'debate', 10), (5, 'project', 10), (5, 'claim', 15)
on conflict (level, content_type) do update
  set monthly_limit = excluded.monthly_limit;

alter table public.communities drop constraint if exists communities_lat_range_chk;
alter table public.communities add constraint communities_lat_range_chk
  check (lat is null or lat between -90 and 90);
alter table public.communities drop constraint if exists communities_lng_range_chk;
alter table public.communities add constraint communities_lng_range_chk
  check (lng is null or lng between -180 and 180);

-- El cierre masivo sólo se invoca desde una sesión autenticada o service_role.
-- Quitar PUBLIC evita que una llamada anónima pueda disparar trabajo de fondo.
revoke execute on function public.sync_due_poll_notifications() from public, anon;
grant execute on function public.sync_due_poll_notifications() to authenticated, service_role;

commit;
