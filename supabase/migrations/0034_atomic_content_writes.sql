-- =============================================================================
-- Agorbis · 0034 · Escrituras de contenido indivisibles
-- =============================================================================
-- Estas operaciones abarcan más de una tabla. Desde PostgREST, dos llamadas
-- consecutivas son dos transacciones: si la segunda falla, la primera queda
-- confirmada. Las RPC `security invoker` mantienen RLS y garantizan todo-o-nada.

begin;

-- -----------------------------------------------------------------------------
-- 1 · Una encuesta nace junto con todas sus opciones.
-- -----------------------------------------------------------------------------
create or replace function public.create_poll_with_options(
  p_community uuid,
  p_question text,
  p_description text,
  p_type text,
  p_category text,
  p_max_choices smallint,
  p_results_visibility text,
  p_closes_at text,
  p_options text[]
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_poll uuid;
  v_option_count integer := coalesce(cardinality(p_options), 0);
  v_max_choices smallint := nullif(p_max_choices, 0);
  v_closes_at timestamptz := nullif(p_closes_at, '')::timestamptz;
begin
  if v_user is null then
    raise exception 'Necesitás una cuenta para publicar';
  end if;
  if v_option_count < 2 or v_option_count > 10 then
    raise exception 'Una encuesta necesita entre 2 y 10 opciones';
  end if;
  if p_type = 'binary' and v_option_count <> 2 then
    raise exception 'Una encuesta binaria necesita exactamente 2 opciones';
  end if;
  if p_type <> 'multiple' and v_max_choices is not null then
    raise exception 'Sólo una encuesta múltiple admite un máximo de opciones';
  end if;
  if v_max_choices is not null
     and (v_max_choices < 1 or v_max_choices > v_option_count) then
    raise exception 'El máximo de opciones no es válido';
  end if;
  if p_results_visibility = 'after_close' and v_closes_at is null then
    raise exception 'Los resultados al cierre requieren fecha de cierre';
  end if;
  if v_closes_at is not null and v_closes_at <= now() then
    raise exception 'La fecha de cierre tiene que ser futura';
  end if;
  if exists (
    select 1 from unnest(p_options) option
    where nullif(btrim(option), '') is null
  ) then
    raise exception 'Las opciones no pueden estar vacías';
  end if;
  if (
    select count(distinct lower(btrim(option)))
    from unnest(p_options) option
  ) <> v_option_count then
    raise exception 'Las opciones no pueden repetirse';
  end if;

  insert into public.polls (
    community_id, author_id, question, description, type, category,
    max_choices, results_visibility, closes_at
  ) values (
    p_community, v_user, p_question, nullif(btrim(p_description), ''),
    p_type, p_category, v_max_choices, p_results_visibility, v_closes_at
  ) returning id into v_poll;

  insert into public.poll_options (poll_id, label, sort_order)
  select v_poll, btrim(option), (ordinality - 1)::smallint
  from unnest(p_options) with ordinality as options(option, ordinality);

  return v_poll;
end;
$$;

revoke all on function public.create_poll_with_options(
  uuid, text, text, text, text, smallint, text, text, text[]
) from public;
grant execute on function public.create_poll_with_options(
  uuid, text, text, text, text, smallint, text, text, text[]
) to authenticated;

-- -----------------------------------------------------------------------------
-- 2 · El proyecto y su relación con el reclamo se confirman juntos.
-- -----------------------------------------------------------------------------
create or replace function public.create_project_with_relation(
  p_community uuid,
  p_title text,
  p_summary text,
  p_plan text,
  p_budget_amount numeric,
  p_currency text,
  p_resources_needed text,
  p_time_estimate text,
  p_source_claim text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_project uuid;
  v_source_claim uuid := nullif(p_source_claim, '')::uuid;
begin
  if v_user is null then
    raise exception 'Necesitás una cuenta para publicar';
  end if;

  insert into public.projects (
    community_id, author_id, title, summary, plan, budget_amount, currency,
    resources_needed, time_estimate
  ) values (
    p_community, v_user, p_title, p_summary, p_plan,
    nullif(p_budget_amount, 0),
    p_currency, nullif(btrim(p_resources_needed), ''),
    nullif(btrim(p_time_estimate), '')
  ) returning id into v_project;

  if v_source_claim is not null then
    insert into public.content_relations (
      source_type, source_id, target_type, target_id, relation_type, created_by
    ) values (
      'claim', v_source_claim, 'project', v_project, 'proposal_for', v_user
    );
  end if;

  return v_project;
end;
$$;

revoke all on function public.create_project_with_relation(
  uuid, text, text, text, numeric, text, text, text, text
) from public;
grant execute on function public.create_project_with_relation(
  uuid, text, text, text, numeric, text, text, text, text
) to authenticated;

-- -----------------------------------------------------------------------------
-- 3 · Un cambio de estado nunca queda sin su evento de línea de tiempo.
-- -----------------------------------------------------------------------------
create or replace function public.add_claim_event_with_status(
  p_claim uuid,
  p_organization text,
  p_event_type text,
  p_title text,
  p_body text,
  p_evidence_url text,
  p_event_date text,
  p_status text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_event uuid;
  v_rows integer;
  v_organization uuid := nullif(p_organization, '')::uuid;
  v_event_date date := nullif(p_event_date, '')::date;
begin
  if v_user is null then
    raise exception 'Necesitás una cuenta para actualizar el reclamo';
  end if;

  if nullif(p_status, '') is not null then
    update public.claims
    set status = p_status
    where id = p_claim;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then
      raise exception 'No pudimos actualizar el estado del reclamo';
    end if;
  end if;

  insert into public.claim_events (
    claim_id, actor_id, organization_id, event_type, title, body,
    evidence_url, event_date
  ) values (
    p_claim, v_user, v_organization, p_event_type, p_title,
    nullif(btrim(p_body), ''), nullif(btrim(p_evidence_url), ''),
    coalesce(v_event_date, current_date)
  ) returning id into v_event;

  return v_event;
end;
$$;

revoke all on function public.add_claim_event_with_status(
  uuid, text, text, text, text, text, text, text
) from public;
grant execute on function public.add_claim_event_with_status(
  uuid, text, text, text, text, text, text, text
) to authenticated;

commit;
