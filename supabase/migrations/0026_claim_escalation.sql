-- =============================================================================
-- 0026 · Escalamiento por silencio (D58)
--
-- Un reclamo sin acuse de recibo institucional dentro de su ventana de
-- respuesta pasa a mostrarse también en la comunidad padre. Lo decide un cron
-- sobre una condición verificable, nunca un botón: un botón mediría militancia
-- en vez de silencio.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 · Ventana de respuesta por nivel.
--
-- Tabla y no constante, igual que `content_quotas`: cuánto es razonable esperar
-- depende del territorio y se va a ajustar con datos reales, sin desplegar.
-- Sin fila = ese nivel no escala nunca.
-- -----------------------------------------------------------------------------
create table if not exists public.claim_response_windows (
  level        smallint primary key,
  response_days int not null,

  constraint claim_response_windows_level_chk check (level between 0 and 5),
  constraint claim_response_windows_days_chk check (response_days between 1 and 365)
);

comment on table public.claim_response_windows is
  'Días que tiene una institución para acusar recibo antes de que el reclamo escale. Sin fila = el nivel no escala.';

-- Cuanto más chico el territorio, más corta la espera: un bache de barrio no
-- necesita 45 días de análisis. Los niveles 0 y 1 no tienen fila a propósito
-- (D58: por encima del país no hay institución con competencia).
insert into public.claim_response_windows (level, response_days) values
  (2, 45),  -- País
  (3, 30),  -- Provincia o estado
  (4, 20),  -- Ciudad o municipio
  (5, 15)   -- Barrio
on conflict (level) do nothing;

-- -----------------------------------------------------------------------------
-- 2 · Estado del reloj en el reclamo.
-- -----------------------------------------------------------------------------
alter table public.claims
  add column if not exists response_due_at timestamptz,
  -- Momento del primer evento institucional. Detiene el reloj para siempre:
  -- que después la institución abandone el reclamo es otro problema, y medirlo
  -- como silencio inicial sería mentir sobre lo que pasó.
  add column if not exists first_response_at timestamptz,
  add column if not exists escalated_at timestamptz,
  -- Puntero de visibilidad, no mudanza (D58). `community_id` no se toca.
  add column if not exists escalated_to_community_id uuid
    references public.communities (id) on delete set null;

comment on column public.claims.escalated_to_community_id is
  'Comunidad padre donde además se muestra el reclamo tras escalar. El reclamo sigue perteneciendo a community_id.';

-- El listado de elevados de una comunidad padre es la consulta caliente.
create index if not exists claims_escalated_to_idx
  on public.claims (escalated_to_community_id, escalated_at desc)
  where escalated_to_community_id is not null;

-- El barrido del cron: sólo mira reclamos con reloj corriendo.
create index if not exists claims_pending_response_idx
  on public.claims (response_due_at)
  where first_response_at is null and escalated_at is null;

-- -----------------------------------------------------------------------------
-- 3 · El reloj arranca al publicar.
-- -----------------------------------------------------------------------------
create or replace function public.set_claim_response_due()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_days int;
begin
  select w.response_days into v_days
  from public.claim_response_windows w
  join public.communities c on c.level = w.level
  where c.id = new.community_id;

  -- Sin ventana configurada para ese nivel, el reclamo simplemente no escala.
  new.response_due_at := case
    when v_days is null then null
    else new.created_at + make_interval(days => v_days)
  end;
  return new;
end;
$$;

drop trigger if exists claims_set_response_due on public.claims;
create trigger claims_set_response_due
  before insert on public.claims
  for each row execute function public.set_claim_response_due();

-- Reclamos que ya existían: se les calcula el vencimiento desde su creación.
update public.claims c
set response_due_at = c.created_at + make_interval(days => w.response_days)
from public.communities com
join public.claim_response_windows w on w.level = com.level
where com.id = c.community_id
  and c.response_due_at is null
  and c.escalated_at is null;

-- -----------------------------------------------------------------------------
-- 4 · Cualquier evento institucional detiene el reloj.
--
-- D58: se mide acuse de recibo, no calidad de respuesta. Decir "recibido, en
-- análisis" tiene que ser barato o la métrica castiga la falta de equipo
-- digital en vez de la falta de voluntad.
-- -----------------------------------------------------------------------------
create or replace function public.stop_claim_response_clock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.organization_id is not null then
    update public.claims
    set first_response_at = coalesce(first_response_at, now())
    where id = new.claim_id
      and first_response_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists claim_events_stop_clock on public.claim_events;
create trigger claim_events_stop_clock
  after insert on public.claim_events
  for each row execute function public.stop_claim_response_clock();

-- Coherencia con lo ya cargado: un reclamo que ya tuvo evento institucional no
-- puede aparecer como silenciado.
update public.claims c
set first_response_at = e.first_at
from (
  select claim_id, min(created_at) as first_at
  from public.claim_events
  where organization_id is not null
  group by claim_id
) e
where e.claim_id = c.id and c.first_response_at is null;

-- -----------------------------------------------------------------------------
-- 5 · Umbral de apoyo, proporcional a la población (D58).
--
-- Número fijo no sirve: 20 vecinos son mucho en un barrio y nada en una
-- capital. 1% de los miembros, con piso para que una comunidad nueva pueda
-- escalar y techo para que una capital no vuelva el umbral inalcanzable.
-- -----------------------------------------------------------------------------
create or replace function public.claim_escalation_threshold(p_community uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select greatest(3, least(50, ceil(coalesce(c.member_count, 0) * 0.01)::int))
  from public.communities c
  where c.id = p_community;
$$;

grant execute on function public.claim_escalation_threshold(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6 · El barrido.
--
-- Escala los reclamos que cumplen las tres condiciones a la vez: venció la
-- ventana, nadie acusó recibo y el apoyo local llegó al umbral. Devuelve
-- cuántos escalaron.
-- -----------------------------------------------------------------------------
create or replace function public.escalate_silent_claims()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r       record;
begin
  -- Se resuelve reclamo por reclamo y no en lote para que el evento de línea de
  -- tiempo y las notificaciones se emitan sobre el conjunto exacto que acaba de
  -- escalar, sin depender de una ventana temporal para reconocerlo.
  for r in
    select
      c.id,
      c.title,
      c.author_id,
      com.parent_id,
      com.name as community_name
    from public.claims c
    join public.communities com on com.id = c.community_id
    where c.first_response_at is null
      and c.escalated_at is null
      and c.response_due_at is not null
      and c.response_due_at <= now()
      -- Un reclamo cerrado ya no espera nada de nadie.
      and c.status in ('open', 'under_review')
      and com.parent_id is not null
      -- D58: nunca por encima del país. El padre tiene que seguir siendo un
      -- nivel con instituciones que puedan responderlo.
      and com.level >= 3
      and c.support_count >= public.claim_escalation_threshold(c.community_id)
    for update of c skip locked
  loop
    update public.claims
    set escalated_at = now(),
        escalated_to_community_id = r.parent_id
    where id = r.id;

    -- Queda asentado en la línea de tiempo: el silencio es parte de la historia
    -- pública del reclamo, no un estado invisible.
    insert into public.claim_events (claim_id, event_type, title, body)
    values (
      r.id,
      'status_change',
      'Escalado por falta de respuesta',
      'Nadie acusó recibo dentro de la ventana de respuesta de ' || r.community_name || '.'
    );

    -- Se avisa a quienes pusieron el reclamo ahí: autor y apoyos. Son los
    -- únicos que pueden sostenerlo en el nivel nuevo.
    perform public.create_notification(
      recipients.user_id,
      null,
      'claim_escalated',
      'Tu reclamo subió de nivel por falta de respuesta',
      r.title,
      '/reclamos/' || r.id,
      'claim',
      r.id,
      'claim:escalated:' || r.id || ':' || recipients.user_id
    )
    from (
      select r.author_id as user_id where r.author_id is not null
      union
      select s.user_id from public.claim_supports s where s.claim_id = r.id
    ) recipients;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Igual que `sync_due_poll_notifications` (D en 0021): nada anónimo dispara
-- trabajo de fondo.
revoke execute on function public.escalate_silent_claims() from public, anon;
grant execute on function public.escalate_silent_claims() to service_role;

-- -----------------------------------------------------------------------------
-- 7 · Deuda de respuesta de una comunidad.
--
-- Métrica derivada: no necesita cooperación de ninguna institución para
-- existir, que es justamente lo que la hace creíble.
-- -----------------------------------------------------------------------------
create or replace function public.response_debt(p_community uuid)
returns table (
  organization_id uuid,
  organization_name text,
  pending_claims integer,
  longest_wait_days integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.name,
    count(*)::int,
    max(extract(day from now() - c.created_at))::int
  from public.claims c
  join public.organizations o on o.id = c.responsible_organization_id
  where c.community_id = p_community
    and c.first_response_at is null
    and c.status in ('open', 'under_review')
  group by o.id, o.name
  order by count(*) desc, max(c.created_at) asc;
$$;

grant execute on function public.response_debt(uuid) to anon, authenticated;

commit;
