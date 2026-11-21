-- =============================================================================
-- Agorbis · 0043 · Límites autoritativos y contratos de escritura finitos
-- -----------------------------------------------------------------------------
-- La validación de formularios mejora la experiencia, pero un cliente puede
-- llamar PostgREST/RPC/Storage directamente. Esta migración pone los mismos
-- topes en PostgreSQL, serializa los cupos ante concurrencia y retira capacidades
-- de DDL/automatización que nunca necesita un navegador.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- Longitudes y valores numéricos. Se usa btrim para que un payload directo no
-- pueda convertir espacios en contenido válido cuando la action los descartaría.
-- -----------------------------------------------------------------------------
alter table public.project_comments
  drop constraint if exists project_comments_body_trimmed_chk;
alter table public.project_comments
  add constraint project_comments_body_trimmed_chk check (
    char_length(btrim(body)) between 1 and 1000
  );

alter table public.claim_events
  drop constraint if exists claim_events_payload_chk;
alter table public.claim_events
  add constraint claim_events_payload_chk check (
    char_length(btrim(title)) between 3 and 180
    and (body is null or char_length(btrim(body)) between 1 and 3000)
    and (
      evidence_url is null
      or (
        evidence_url = btrim(evidence_url)
        and char_length(evidence_url) <= 2048
        and evidence_url ~ '^https?://'
      )
    )
    and (
      status is null
      or status in (
        'open', 'under_review', 'acknowledged', 'in_progress',
        'resolved', 'rejected', 'removed'
      )
    )
  );

alter table public.content_sources
  drop constraint if exists content_sources_payload_chk;
alter table public.content_sources
  add constraint content_sources_payload_chk check (
    char_length(btrim(title)) between 3 and 180
    and url = btrim(url)
    and char_length(url) <= 2048
    and url ~ '^https?://'
    and (
      publisher is null
      or char_length(btrim(publisher)) between 1 and 120
    )
  );

alter table public.project_milestones
  drop constraint if exists project_milestones_payload_chk;
alter table public.project_milestones
  add constraint project_milestones_payload_chk check (
    char_length(btrim(title)) between 3 and 160
    and (
      description is null
      or char_length(btrim(description)) between 1 and 1000
    )
    and sort_order between 0 and 300
  );

alter table public.project_tasks
  drop constraint if exists project_tasks_payload_chk;
alter table public.project_tasks
  add constraint project_tasks_payload_chk check (
    char_length(btrim(title)) between 3 and 180
    and (
      description is null
      or char_length(btrim(description)) between 1 and 1000
    )
    and (
      skills_needed is null
      or char_length(btrim(skills_needed)) between 1 and 300
    )
  );

alter table public.project_contributions
  drop constraint if exists project_contributions_payload_chk;
alter table public.project_contributions
  add constraint project_contributions_payload_chk check (
    char_length(btrim(description)) between 5 and 1000
    and (quantity is null or (quantity > 0 and quantity <= 1000000000))
    and (unit is null or char_length(btrim(unit)) between 1 and 40)
  );

-- `numeric` admite NaN e Infinity. El límite superior excluye ambos y evita
-- que una sola promesa vuelva inusable el agregado del proyecto.
alter table public.project_pledges
  drop constraint if exists project_pledges_amount_chk;
alter table public.project_pledges
  add constraint project_pledges_amount_chk check (
    amount > 0 and amount <= 1000000000
  );

alter table public.projects
  drop constraint if exists projects_pledged_total_chk;
alter table public.projects
  add constraint projects_pledged_total_chk check (
    pledged_total >= 0 and pledged_total <= 999999999999.99
  );

-- -----------------------------------------------------------------------------
-- Cupos y ventanas. Los advisory locks vuelven correcto el count+insert cuando
-- dos requests llegan a la vez; consume_window_limit serializa cada ventana.
-- Filas removidas/declinadas siguen contando para que borrar no reinicie cupo.
-- -----------------------------------------------------------------------------
create or replace function private.guard_civic_extension_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_count bigint;
  v_source_key text;
  v_target_key text;
begin
  -- Seeds/jobs no están controlados por el navegador. Las filas creadas por
  -- otro trigger ya fueron limitadas en la escritura exterior.
  if v_actor is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  case tg_table_name
    when 'project_comments' then
      if new.user_id is distinct from v_actor then
        raise exception 'GEOUNITY_COMMENTER_MUST_MATCH_SESSION'
          using errcode = 'insufficient_privilege';
      end if;
      perform private.consume_window_limit(
        'project-comments-minute', v_actor, 10, interval '1 minute'
      );
      perform pg_advisory_xact_lock(hashtextextended(
        'project-comments-cap:' || new.project_id::text || ':' || v_actor::text,
        0
      ));
      select count(*) into v_count
      from public.project_comments c
      where c.project_id = new.project_id and c.user_id = v_actor;
      if v_count >= 500 then
        raise exception 'GEOUNITY_PROJECT_COMMENT_CAP'
          using errcode = 'program_limit_exceeded';
      end if;

    when 'claim_events' then
      if new.actor_id is distinct from v_actor then
        raise exception 'GEOUNITY_ACTOR_MUST_MATCH_SESSION'
          using errcode = 'insufficient_privilege';
      end if;
      perform private.consume_window_limit(
        'claim-events-hour', v_actor, 30, interval '1 hour'
      );
      perform pg_advisory_xact_lock(hashtextextended(
        'claim-events-cap:' || new.claim_id::text, 0
      ));
      select count(*) into v_count
      from public.claim_events e where e.claim_id = new.claim_id;
      if v_count >= 500 then
        raise exception 'GEOUNITY_CLAIM_EVENT_CAP'
          using errcode = 'program_limit_exceeded';
      end if;

    when 'content_sources' then
      if new.added_by is distinct from v_actor then
        raise exception 'GEOUNITY_SOURCE_AUTHOR_MUST_MATCH_SESSION'
          using errcode = 'insufficient_privilege';
      end if;
      perform private.consume_window_limit(
        'content-sources-hour', v_actor, 30, interval '1 hour'
      );
      perform pg_advisory_xact_lock(hashtextextended(
        'content-sources-cap:' || new.content_type || ':' || new.content_id::text,
        0
      ));
      select count(*) into v_count
      from public.content_sources s
      where s.content_type = new.content_type and s.content_id = new.content_id;
      if v_count >= 500 then
        raise exception 'GEOUNITY_CONTENT_SOURCE_CAP'
          using errcode = 'program_limit_exceeded';
      end if;

    when 'content_relations' then
      if new.created_by is distinct from v_actor then
        raise exception 'GEOUNITY_RELATION_AUTHOR_MUST_MATCH_SESSION'
          using errcode = 'insufficient_privilege';
      end if;
      perform private.consume_window_limit(
        'content-relations-hour', v_actor, 30, interval '1 hour'
      );
      v_source_key := new.source_type || ':' || new.source_id::text;
      v_target_key := new.target_type || ':' || new.target_id::text;
      -- Orden estable: dos relaciones inversas no pueden deadlockearse.
      perform pg_advisory_xact_lock(hashtextextended(
        'content-relations-cap:' || least(v_source_key, v_target_key), 0
      ));
      perform pg_advisory_xact_lock(hashtextextended(
        'content-relations-cap:' || greatest(v_source_key, v_target_key), 0
      ));
      select count(*) into v_count
      from public.content_relations r
      where (r.source_type = new.source_type and r.source_id = new.source_id)
         or (r.target_type = new.source_type and r.target_id = new.source_id);
      if v_count >= 500 then
        raise exception 'GEOUNITY_CONTENT_RELATION_CAP'
          using errcode = 'program_limit_exceeded';
      end if;
      select count(*) into v_count
      from public.content_relations r
      where (r.source_type = new.target_type and r.source_id = new.target_id)
         or (r.target_type = new.target_type and r.target_id = new.target_id);
      if v_count >= 500 then
        raise exception 'GEOUNITY_CONTENT_RELATION_CAP'
          using errcode = 'program_limit_exceeded';
      end if;

    when 'project_milestones' then
      perform private.consume_window_limit(
        'project-milestones-hour', v_actor, 20, interval '1 hour'
      );
      perform pg_advisory_xact_lock(hashtextextended(
        'project-milestones-cap:' || new.project_id::text, 0
      ));
      select count(*) into v_count
      from public.project_milestones m where m.project_id = new.project_id;
      if v_count >= 50 then
        raise exception 'GEOUNITY_PROJECT_MILESTONE_CAP'
          using errcode = 'program_limit_exceeded';
      end if;

    when 'project_tasks' then
      perform private.consume_window_limit(
        'project-tasks-hour', v_actor, 60, interval '1 hour'
      );
      perform pg_advisory_xact_lock(hashtextextended(
        'project-tasks-cap:' || new.project_id::text, 0
      ));
      select count(*) into v_count
      from public.project_tasks t where t.project_id = new.project_id;
      if v_count >= 200 then
        raise exception 'GEOUNITY_PROJECT_TASK_CAP'
          using errcode = 'program_limit_exceeded';
      end if;

    when 'project_contributions' then
      if new.user_id is distinct from v_actor then
        raise exception 'GEOUNITY_CONTRIBUTOR_MUST_MATCH_SESSION'
          using errcode = 'insufficient_privilege';
      end if;
      perform private.consume_window_limit(
        'project-contributions-hour', v_actor, 20, interval '1 hour'
      );
      perform pg_advisory_xact_lock(hashtextextended(
        'project-contributions-cap:' || new.project_id::text || ':' || v_actor::text,
        0
      ));
      select count(*) into v_count
      from public.project_contributions c
      where c.project_id = new.project_id and c.user_id = v_actor;
      if v_count >= 100 then
        raise exception 'GEOUNITY_PROJECT_CONTRIBUTION_CAP'
          using errcode = 'program_limit_exceeded';
      end if;
  end case;

  return new;
end;
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'project_comments', 'claim_events', 'content_sources',
    'content_relations', 'project_milestones', 'project_tasks',
    'project_contributions'
  ] loop
    execute format(
      'drop trigger if exists ac_authoritative_insert_limits on public.%I',
      v_table
    );
    execute format(
      'create trigger ac_authoritative_insert_limits before insert on public.%I '
      'for each row execute function private.guard_civic_extension_limits()',
      v_table
    );
  end loop;
end $$;

create index if not exists project_comments_project_user_cap_idx
  on public.project_comments (project_id, user_id);
create index if not exists project_contributions_project_user_cap_idx
  on public.project_contributions (project_id, user_id);

-- -----------------------------------------------------------------------------
-- Promesas: RPC y agregado repiten el contrato de la columna para emitir un
-- fallo estable antes de intentar escribir NaN/Infinity o desbordar el total.
-- -----------------------------------------------------------------------------
create or replace function public.set_project_pledge(
  p_project uuid,
  p_amount numeric,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Necesitás una cuenta para participar'
      using errcode = 'invalid_authorization_specification';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000 then
    raise exception 'GEOUNITY_PLEDGE_AMOUNT_INVALID'
      using errcode = 'check_violation';
  end if;

  insert into public.project_pledges (project_id, user_id, amount, message)
  values (p_project, v_actor, p_amount, nullif(btrim(p_message), ''))
  on conflict (project_id, user_id) do update
    set amount = excluded.amount,
        message = excluded.message;
end;
$$;

create or replace function public.sync_pledged_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project uuid;
  v_delta numeric;
  v_total numeric;
begin
  if tg_op = 'INSERT' then
    v_project := new.project_id;
    v_delta := new.amount;
  elsif tg_op = 'DELETE' then
    v_project := old.project_id;
    v_delta := -old.amount;
  elsif new.project_id = old.project_id then
    v_project := new.project_id;
    v_delta := new.amount - old.amount;
  else
    update public.projects
       set pledged_total = pledged_total - old.amount
     where id = old.project_id
     returning pledged_total into v_total;
    if v_total < 0 or v_total > 999999999999.99 then
      raise exception 'GEOUNITY_PLEDGED_TOTAL_INVALID'
        using errcode = 'check_violation';
    end if;
    v_project := new.project_id;
    v_delta := new.amount;
  end if;

  update public.projects
     set pledged_total = pledged_total + v_delta
   where id = v_project
   returning pledged_total into v_total;
  if v_total < 0 or v_total > 999999999999.99 then
    raise exception 'GEOUNITY_PLEDGED_TOTAL_INVALID'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Avatar: sólo un objeto real, propio y servido por el Storage de esta misma
-- petición puede quedar publicado en profiles.avatar_url.
-- -----------------------------------------------------------------------------
create or replace function private.guard_profile_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb := '{}'::jsonb;
  v_host text;
  v_expected_host text;
  v_path text;
begin
  if new.avatar_url is not distinct from old.avatar_url or new.avatar_url is null then
    return new;
  end if;

  if char_length(new.avatar_url) > 2048
     or new.avatar_url !~ '^https?://[^/?#]+/storage/v1/object/public/avatars/[^?#]+$' then
    raise exception 'GEOUNITY_AVATAR_URL_INVALID'
      using errcode = 'check_violation';
  end if;

  v_host := lower(substring(new.avatar_url from '^https?://([^/?#]+)'));
  v_path := substring(
    new.avatar_url from '/storage/v1/object/public/avatars/([^?#]+)$'
  );
  if v_path !~ (
    '^' || new.id::text ||
    '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
    '[.](jpg|png|webp|avif)$'
  ) then
    raise exception 'GEOUNITY_AVATAR_URL_INVALID'
      using errcode = 'check_violation';
  end if;

  begin
    v_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    v_headers := '{}'::jsonb;
  end;
  v_expected_host := lower(coalesce(
    nullif(v_headers ->> 'x-forwarded-host', ''),
    nullif(v_headers ->> 'host', '')
  ));
  if v_expected_host is not null and v_host is distinct from v_expected_host then
    raise exception 'GEOUNITY_AVATAR_URL_INVALID'
      using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'avatars' and o.name = v_path
  ) then
    raise exception 'GEOUNITY_AVATAR_OBJECT_NOT_FOUND'
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists ab_profiles_avatar_guard on public.profiles;
create trigger ab_profiles_avatar_guard
  before update of avatar_url on public.profiles
  for each row execute function private.guard_profile_avatar();

create or replace function public.can_upload_avatar_object()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null
     or not exists (select 1 from public.profiles p where p.id = v_user)
     or not public.can_participate() then
    return false;
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('avatar-objects:' || v_user::text, 0)
  );
  return (
    select count(*) from storage.objects o
    where o.bucket_id = 'avatars'
      and split_part(o.name, '/', 1) = v_user::text
  ) < 20;
end;
$$;

drop policy if exists "geounity_avatar_insert" on storage.objects;
create policy "geounity_avatar_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars'
    and exists (select 1 from public.profiles p where p.id = auth.uid())
    and public.can_participate()
    and name ~ (
      '^' || auth.uid()::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
      '[.](jpg|png|webp|avif)$'
    )
    and public.can_upload_avatar_object()
  );

drop policy if exists "geounity_avatar_update" on storage.objects;
create policy "geounity_avatar_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and exists (select 1 from public.profiles p where p.id = auth.uid())
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_participate()
  )
  with check (
    bucket_id = 'avatars'
    and exists (select 1 from public.profiles p where p.id = auth.uid())
    and public.can_participate()
    and name ~ (
      '^' || auth.uid()::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}' ||
      '[.](jpg|png|webp|avif)$'
    )
  );

-- -----------------------------------------------------------------------------
-- La generación de IA se inicia con service_role, pero el requester sigue
-- siendo una identidad de producto: suspensión/consentimiento se comprueban
-- antes incluso de devolver una cache ya existente.
-- -----------------------------------------------------------------------------
alter function public.begin_ai_summary_generation(
  uuid, text, uuid, text, text, integer, boolean
) set schema private;
alter function private.begin_ai_summary_generation(
  uuid, text, uuid, text, text, integer, boolean
) rename to begin_ai_summary_generation_unchecked;

revoke execute on function private.begin_ai_summary_generation_unchecked(
  uuid, text, uuid, text, text, integer, boolean
) from public, anon, authenticated, service_role;

create function public.begin_ai_summary_generation(
  p_requester_id uuid,
  p_content_type text,
  p_content_id uuid,
  p_locale text,
  p_source_hash text,
  p_prompt_version integer,
  p_includes_poll_results boolean
)
returns table (
  decision text,
  lease_token uuid,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_participate(p_requester_id);
  return query
  select guarded.decision, guarded.lease_token, guarded.retry_after_seconds
  from private.begin_ai_summary_generation_unchecked(
    p_requester_id,
    p_content_type,
    p_content_id,
    p_locale,
    p_source_hash,
    p_prompt_version,
    p_includes_poll_results
  ) guarded;
end;
$$;

revoke execute on function public.begin_ai_summary_generation(
  uuid, text, uuid, text, text, integer, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.begin_ai_summary_generation(
  uuid, text, uuid, text, text, integer, boolean
) to service_role;

-- -----------------------------------------------------------------------------
-- El cierre de encuestas es un job. La bandeja ya no puede disparar un UPDATE
-- global con su JWT; el índice parcial limita el trabajo del cron a vencidas.
-- -----------------------------------------------------------------------------
revoke execute on function public.sync_due_poll_notifications()
  from public, anon, authenticated, service_role;
grant execute on function public.sync_due_poll_notifications() to service_role;

create index if not exists polls_active_due_idx
  on public.polls (closes_at, id)
  where status = 'active' and closes_at is not null;

-- Ningún rol del navegador crea FKs/triggers ni vacía tablas, incluso si un
-- grant amplio vuelve a aparecer en una migración histórica o en cloud.
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;
alter default privileges in schema public
  revoke truncate, references, trigger on tables from anon, authenticated;

revoke execute on function private.guard_civic_extension_limits(),
  private.guard_profile_avatar()
from public, anon, authenticated, service_role;

commit;
