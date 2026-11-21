-- =============================================================================
-- Agorbis · 0007 · Cuotas mensuales de creación de contenido
-- -----------------------------------------------------------------------------
-- Cambia el modelo de permisos: cualquier residente puede crear encuestas,
-- debates, reclamos y proyectos en las comunidades donde vive. Lo que reemplaza
-- al permiso por rol es una cuota mensual por nivel geográfico.
--
-- La idea: cuanta más gente alcanza el contenido, más caro es publicarlo. A
-- nivel global una encuesta la ven millones y el costo de equivocarse es alto;
-- a nivel ciudad es hiperlocal y la fricción tiene que ser mínima.
--
-- Coherente con D6: la cuota se aplica en un trigger, no sólo en la action.
-- Una action se saltea llamando a PostgREST con el mismo token.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Configuración. En tabla y no en constantes para poder ajustar los topes sin
-- desplegar: es un parámetro de política de producto, no de código.
-- -----------------------------------------------------------------------------
create table if not exists public.content_quotas (
  level         smallint not null,
  content_type  text not null,
  monthly_limit int not null,

  primary key (level, content_type),
  constraint content_quotas_level_chk check (level between 0 and 5),
  constraint content_quotas_type_chk check (content_type in ('poll', 'debate', 'claim', 'project')),
  constraint content_quotas_limit_chk check (monthly_limit >= 0)
);

comment on table public.content_quotas is
  'Tope mensual por usuario, por tipo de contenido y por nivel geográfico. Sin fila = sin tope.';

insert into public.content_quotas (level, content_type, monthly_limit) values
  -- Nivel 0 · Global
  (0, 'poll', 1), (0, 'debate', 1), (0, 'project', 1), (0, 'claim', 1),
  -- Nivel 1 · Continente
  (1, 'poll', 2), (1, 'debate', 2), (1, 'project', 2), (1, 'claim', 3),
  -- Nivel 2 · País
  (2, 'poll', 3), (2, 'debate', 3), (2, 'project', 3), (2, 'claim', 5),
  -- Nivel 3 · Provincia o estado
  (3, 'poll', 5), (3, 'debate', 5), (3, 'project', 5), (3, 'claim', 8),
  -- Nivel 4 · Ciudad o municipio
  -- Los reclamos van más holgados: responden a hechos del mundo real que nadie
  -- planifica. Si a alguien se le inunda la calle tres veces en un mes, el
  -- sistema no debería contestarle que agotó su cupo.
  (4, 'poll', 8), (4, 'debate', 8), (4, 'project', 8), (4, 'claim', 10)
on conflict (level, content_type) do update
  set monthly_limit = excluded.monthly_limit;

-- -----------------------------------------------------------------------------
-- Metadatos de baja.
-- -----------------------------------------------------------------------------
-- Para saber si una baja devuelve cupo hay que distinguir tres casos que hoy
-- terminan todos en `status = 'removed'`:
--   · la bajó moderación            → devuelve cupo (no es culpa del autor)
--   · la bajó el autor dentro de 24h → devuelve cupo (fue un error de tipeo)
--   · la bajó el autor pasadas 24h   → NO devuelve (corta el ciclo
--                                      publicar / borrar / republicar)
-- -----------------------------------------------------------------------------
alter table public.polls    add column if not exists removed_by uuid references public.profiles (id) on delete set null;
alter table public.polls    add column if not exists removed_at timestamptz;
alter table public.debates  add column if not exists removed_by uuid references public.profiles (id) on delete set null;
alter table public.debates  add column if not exists removed_at timestamptz;
alter table public.claims   add column if not exists removed_by uuid references public.profiles (id) on delete set null;
alter table public.claims   add column if not exists removed_at timestamptz;
alter table public.projects add column if not exists removed_by uuid references public.profiles (id) on delete set null;
alter table public.projects add column if not exists removed_at timestamptz;

-- Índices para el conteo de cuota: siempre es (autor, mes en curso).
create index if not exists polls_author_created_idx    on public.polls    (author_id, created_at desc);
create index if not exists debates_author_created_idx  on public.debates  (author_id, created_at desc);
create index if not exists claims_author_created_idx   on public.claims   (author_id, created_at desc);
create index if not exists projects_author_created_idx on public.projects (author_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Sella quién dio de baja y cuándo. Las columnas no se pueden falsear desde el
-- cliente: el trigger las sobrescribe siempre, incluso si el UPDATE las trae.
-- Sin esto, un autor podría declararse "bajado por moderación" y recuperar cupo.
-- -----------------------------------------------------------------------------
create or replace function public.stamp_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'removed' and old.status <> 'removed' then
    new.removed_by := auth.uid();
    new.removed_at := now();
  elsif new.status <> 'removed' then
    -- Restaurado: se limpian los metadatos de baja.
    new.removed_by := null;
    new.removed_at := null;
  else
    -- Ya estaba dado de baja: los metadatos son inmutables.
    new.removed_by := old.removed_by;
    new.removed_at := old.removed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists polls_stamp_removal on public.polls;
create trigger polls_stamp_removal before update on public.polls
  for each row execute function public.stamp_removal();

drop trigger if exists debates_stamp_removal on public.debates;
create trigger debates_stamp_removal before update on public.debates
  for each row execute function public.stamp_removal();

drop trigger if exists claims_stamp_removal on public.claims;
create trigger claims_stamp_removal before update on public.claims
  for each row execute function public.stamp_removal();

drop trigger if exists projects_stamp_removal on public.projects;
create trigger projects_stamp_removal before update on public.projects
  for each row execute function public.stamp_removal();

-- -----------------------------------------------------------------------------
-- quota_remaining: cuánto le queda a un usuario este mes, en un nivel y tipo.
-- Devuelve NULL cuando no hay tope (moderación, o nivel sin configurar).
-- -----------------------------------------------------------------------------
create or replace function public.quota_remaining(
  p_user         uuid,
  p_level        smallint,
  p_content_type text
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_table text;
  v_limit int;
  v_used  int;
begin
  if p_user is null then
    return 0;
  end if;

  -- Moderación y administración no tienen cuota.
  if public.is_moderator(p_user) then
    return null;
  end if;

  v_table := case p_content_type
    when 'poll'    then 'polls'
    when 'debate'  then 'debates'
    when 'claim'   then 'claims'
    when 'project' then 'projects'
  end;

  if v_table is null then
    raise exception 'Tipo de contenido desconocido: %', p_content_type;
  end if;

  select monthly_limit into v_limit
  from public.content_quotas
  where level = p_level and content_type = p_content_type;

  -- Nivel sin configurar: sin tope.
  if v_limit is null then
    return null;
  end if;

  -- Mes calendario en curso. `date_trunc` usa la zona horaria de la sesión, que
  -- en Supabase es UTC: el corte es el día 1 a las 00:00 UTC para todos.
  execute format($q$
    select count(*)
    from public.%I t
    join public.communities c on c.id = t.community_id
    where t.author_id = $1
      and c.level = $2
      and t.created_at >= date_trunc('month', now())
      and t.created_at <  date_trunc('month', now()) + interval '1 month'
      and (
        t.status <> 'removed'
        -- Baja del propio autor pasadas 24h: sigue consumiendo cupo.
        or (t.removed_by = t.author_id and t.removed_at > t.created_at + interval '24 hours')
      )
  $q$, v_table)
  into v_used
  using p_user, p_level;

  return greatest(0, v_limit - v_used);
end;
$$;

grant execute on function public.quota_remaining(uuid, smallint, text) to authenticated, anon;

-- -----------------------------------------------------------------------------
-- enforce_content_quota: el tope, aplicado en el motor.
-- -----------------------------------------------------------------------------
create or replace function public.enforce_content_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type      text;
  v_level     smallint;
  v_remaining int;
begin
  -- Sin usuario en el contexto (seed, service_role, tareas internas) no hay
  -- cuota que aplicar: esas escrituras no vienen de la UI.
  if auth.uid() is null then
    return new;
  end if;

  v_type := case tg_table_name
    when 'polls'    then 'poll'
    when 'debates'  then 'debate'
    when 'claims'   then 'claim'
    when 'projects' then 'project'
  end;

  if new.author_id is null then
    raise exception 'GEOUNITY_QUOTA: el contenido necesita un autor'
      using errcode = 'check_violation';
  end if;

  select level into v_level from public.communities where id = new.community_id;

  v_remaining := public.quota_remaining(new.author_id, v_level, v_type);

  -- NULL = sin tope.
  if v_remaining is not null and v_remaining <= 0 then
    -- El prefijo lo reconoce la action para traducirlo a un mensaje en español
    -- con la fecha de renovación y el nivel alternativo donde sí queda cupo.
    raise exception 'GEOUNITY_QUOTA_EXCEEDED: sin cupo de % en el nivel %', v_type, v_level
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists polls_enforce_quota on public.polls;
create trigger polls_enforce_quota before insert on public.polls
  for each row execute function public.enforce_content_quota();

drop trigger if exists debates_enforce_quota on public.debates;
create trigger debates_enforce_quota before insert on public.debates
  for each row execute function public.enforce_content_quota();

drop trigger if exists claims_enforce_quota on public.claims;
create trigger claims_enforce_quota before insert on public.claims
  for each row execute function public.enforce_content_quota();

drop trigger if exists projects_enforce_quota on public.projects;
create trigger projects_enforce_quota before insert on public.projects
  for each row execute function public.enforce_content_quota();

-- -----------------------------------------------------------------------------
-- quota_summary: toda la grilla de cuotas de un usuario en una sola llamada.
-- La UI la usa para pintar los contadores sin hacer N consultas.
-- -----------------------------------------------------------------------------
create or replace function public.quota_summary(p_user uuid)
returns table (
  level           smallint,
  community_id    uuid,
  community_slug  text,
  community_name  text,
  community_emoji text,
  content_type    text,
  monthly_limit   int,
  remaining       int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.level,
    c.id,
    c.slug,
    c.name,
    c.emoji,
    q.content_type,
    case when public.is_moderator(p_user) then null else cq.monthly_limit end,
    public.quota_remaining(p_user, c.level, q.content_type)
  from public.profiles pr
  join public.communities home on home.id = pr.home_community_id
  -- La cadena ancestral de la residencia: donde el usuario puede publicar.
  join public.communities c
    on home.path = c.path or home.path like c.path || '.%'
  -- Los cuatro tipos de contenido, tomados de la propia configuración.
  cross join (
    select distinct content_type from public.content_quotas
  ) q
  -- El tope concreto de ESTE nivel y ESTE tipo. Va por LEFT JOIN a propósito:
  -- un nivel sin configurar (hoy, el 5 de barrios) no tiene tope, y tiene que
  -- aparecer igual en la grilla con `monthly_limit` en NULL. Con un join
  -- interno esa comunidad desaparecería del resumen y la UI la trataría como
  -- "no podés publicar acá", justo al revés de lo que dice `quota_remaining`.
  left join public.content_quotas cq
    on cq.level = c.level and cq.content_type = q.content_type
  where pr.id = p_user
  order by c.level asc, q.content_type asc;
$$;

grant execute on function public.quota_summary(uuid) to authenticated;

-- =============================================================================
-- RLS de content_quotas y apertura de la creación de contenido
-- =============================================================================
alter table public.content_quotas enable row level security;

drop policy if exists content_quotas_select_all on public.content_quotas;
create policy content_quotas_select_all on public.content_quotas
  for select using (true);

drop policy if exists content_quotas_admin_write on public.content_quotas;
create policy content_quotas_admin_write on public.content_quotas
  for all to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- -----------------------------------------------------------------------------
-- Las encuestas ya no son exclusivas de moderación: alcanza con residir en la
-- comunidad. El tope lo pone el trigger de cuota.
-- -----------------------------------------------------------------------------
create or replace function public.can_create_poll(p_user uuid, p_community uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_member(p_user, p_community);
$$;

comment on function public.can_create_poll(uuid, uuid) is
  'Desde 0007 alcanza con residir en la comunidad; el tope mensual lo aplica enforce_content_quota.';

drop policy if exists polls_insert_moderator on public.polls;
drop policy if exists polls_insert_member on public.polls;
create policy polls_insert_member on public.polls
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(auth.uid(), community_id));

-- El autor necesita poder dar de baja lo suyo (y recuperar cupo dentro de 24h).
drop policy if exists polls_update_moderator on public.polls;
drop policy if exists polls_update_own_or_mod on public.polls;
create policy polls_update_own_or_mod on public.polls
  for update to authenticated
  using (author_id = auth.uid() or public.is_moderator(auth.uid()))
  with check (author_id = auth.uid() or public.is_moderator(auth.uid()));
