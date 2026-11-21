-- =============================================================================
-- 0027 · `track_first_participation` no puede leer `new.user_id` en tablas
--        que no tienen esa columna
--
-- El trigger está enganchado a nueve tablas: cinco tienen `user_id`
-- (poll_votes, debate_comments, claim_supports, project_pledges,
-- project_contributions) y cuatro tienen `author_id` (polls, debates, claims,
-- projects). El cuerpo resolvía la columna con un CASE sobre `tg_table_name`:
--
--   v_user := case tg_table_name
--     when 'poll_votes' then new.user_id ... else new.author_id end;
--
-- PL/pgSQL parsea esa expresión contra el rowtype real de `new`. Cuando el
-- trigger corre sobre `polls` o `claims` —que no tienen `user_id`— falla con
-- `record "new" has no field "user_id"` y aborta el INSERT. El resultado es que
-- no se puede crear una encuesta ni un reclamo desde una sesión nueva.
--
-- Es intermitente y por eso costó verlo: PL/pgSQL cachea el plan de la
-- expresión por sesión, así que si en esa sesión el trigger ya corrió sobre una
-- tabla que sí tiene `user_id`, el plan cacheado se reusa y el INSERT pasa.
-- Desde una conexión fría —el caso real detrás de cada request— falla siempre.
--
-- La solución usa el mismo idioma que ya emplea `notify_request_status` en
-- 0018: `to_jsonb(new)` accede al campo por nombre en tiempo de ejecución, sin
-- exigir que exista en el rowtype.
-- =============================================================================
begin;

create or replace function public.track_first_participation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_kind text;
begin
  -- `to_jsonb` no exige que la columna exista en el rowtype: devuelve NULL.
  -- Así una sola expresión sirve para las tablas con `user_id` y para las
  -- que traen `author_id`, sin enumerar tablas y sin romper si mañana se
  -- agrega una quinta con otra forma.
  v_user := coalesce(
    (to_jsonb(new) ->> 'user_id')::uuid,
    (to_jsonb(new) ->> 'author_id')::uuid
  );
  v_kind := tg_table_name;

  -- Idéntico al original: `event` es un valor cerrado por
  -- `activation_events_event_chk` y el índice único garantiza "una sola vez
  -- por usuario". Acá sólo cambia cómo se obtiene `v_user`.
  if v_user is not null then
    insert into public.activation_events (user_id, event, metadata)
    values (v_user, 'first_participation', jsonb_build_object('kind', v_kind))
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- `notify_content_status` tiene exactamente el mismo defecto
--
-- Descubierto al ejecutar `supabase/tests/rls_checks.sql` por primera vez
-- (D44 lo daba por escrito pero nunca corrido). El trigger está enganchado a
-- `polls`, `claims`, `debates` y `projects`, y resuelve el título así:
--
--   v_title := case tg_table_name when 'polls' then new.question else new.title end;
--
-- `new.question` sólo existe en `polls`. Al cambiar el estado de un proyecto,
-- un reclamo o un debate, PL/pgSQL falla con `record "new" has no field
-- "question"` y aborta el UPDATE. En la práctica: **moderación no puede bajar
-- ni restaurar contenido que no sea una encuesta**, y ningún autor recibe la
-- notificación de cambio de estado.
--
-- Misma solución que arriba: `to_jsonb(new)` accede por nombre en tiempo de
-- ejecución sin exigir que el campo exista en el rowtype.
-- -----------------------------------------------------------------------------
create or replace function public.notify_content_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_recipient uuid; v_user uuid; v_title text; v_type text; v_href text;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_type := case tg_table_name when 'polls' then 'poll' when 'claims' then 'claim'
                               when 'debates' then 'debate' else 'project' end;
  -- Única línea que cambia respecto de 0018.
  v_title := coalesce(to_jsonb(new) ->> 'question', to_jsonb(new) ->> 'title');
  v_href := case tg_table_name
    when 'polls' then '/encuestas/' || new.id
    when 'claims' then '/reclamos/' || new.id
    when 'debates' then '/debates/' || new.id
    else '/proyectos/' || new.id end;
  v_recipient := new.author_id;

  perform public.create_notification(v_recipient, auth.uid(), 'status_change',
    'Cambió el estado de tu publicación', v_title || ' · ' || new.status,
    v_href, v_type, new.id, 'status:' || v_type || ':' || new.id || ':' || new.status || ':author');

  if tg_table_name = 'polls' and new.status = 'closed' then
    for v_user in select distinct user_id from public.poll_votes where poll_id = new.id loop
      perform public.create_notification(v_user, auth.uid(), 'poll_closed', 'Cerró una encuesta en la que votaste',
        v_title, v_href, v_type, new.id, 'poll-closed:' || new.id || ':' || v_user);
    end loop;
  elsif tg_table_name = 'claims' then
    for v_user in select user_id from public.claim_supports where claim_id = new.id loop
      perform public.create_notification(v_user, auth.uid(), 'claim_update', 'Hay novedades en un reclamo que apoyás',
        v_title || ' · ' || new.status, v_href, v_type, new.id,
        'claim-status:' || new.id || ':' || new.status || ':' || v_user);
    end loop;
  elsif tg_table_name = 'projects' then
    for v_user in
      select user_id from public.project_pledges where project_id = new.id
      union select user_id from public.project_contributions where project_id = new.id
    loop
      perform public.create_notification(v_user, auth.uid(), 'project_update', 'Avanzó un proyecto al que te sumaste',
        v_title || ' · ' || new.status, v_href, v_type, new.id,
        'project-status:' || new.id || ':' || new.status || ':' || v_user);
    end loop;
  end if;
  return new;
end;
$$;

commit;
