-- Agorbis · las hijas públicas heredan la moderación de su contenido padre.
begin;

create or replace function pg_temp.ok(p_condition boolean, p_what text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition, false) then
    raise exception 'FALLÓ · %', p_what;
  end if;
  raise notice '  ok   · %', p_what;
end;
$$;

create or replace function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.as_anon()
returns void language plpgsql as $$
begin
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.as_user(p_username text)
returns void language plpgsql as $$
declare v_id uuid;
begin
  perform pg_temp.as_owner();
  select id into v_id from public.profiles where username = p_username;
  if v_id is null then
    raise exception 'El usuario demo % no existe', p_username;
  end if;
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_id::text,
      'role', 'authenticated',
      'aal', 'aal1'
    )::text,
    true
  );
  perform public.accept_current_legal(true);
  perform public.grant_current_international_transfer_consent(
    (select n.version
     from public.international_transfer_notice_versions n
     where n.is_current and n.effective_at <= now()),
    true, 'es'
  );
end;
$$;

create or replace function pg_temp.as_moderator()
returns void language plpgsql as $$
declare
  v_id uuid;
  v_factor uuid;
  v_session uuid := gen_random_uuid();
begin
  perform pg_temp.as_owner();
  select id into v_id
  from public.profiles
  where username = 'mod_nacional';
  select approved.factor_id into v_factor
  from private.privileged_mfa_factors approved
  where approved.user_id = v_id
  order by approved.approved_at desc
  limit 1;
  if v_id is null or v_factor is null then
    raise exception 'El moderador demo no tiene TOTP aprobado';
  end if;
  insert into auth.sessions (
    id, user_id, created_at, updated_at, factor_id, aal
  ) values (
    v_session, v_id, statement_timestamp(), statement_timestamp(),
    v_factor, 'aal2'
  );
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', v_id::text,
      'role', 'authenticated',
      'aal', 'aal2',
      'session_id', v_session::text
    )::text,
    true
  );
  perform public.accept_current_legal(true);
  perform public.grant_current_international_transfer_consent(
    (select n.version
     from public.international_transfer_notice_versions n
     where n.is_current and n.effective_at <= now()),
    true, 'es'
  );
end;
$$;

-- SECURITY INVOKER: la consulta dinámica conserva grants y RLS del rol activo.
create or replace function pg_temp.row_exists(p_table regclass, p_id uuid)
returns boolean language plpgsql stable as $$
declare v_exists boolean;
begin
  execute format(
    'select exists (select 1 from %s where id = $1)',
    p_table
  ) into v_exists using p_id;
  return v_exists;
end;
$$;

grant execute on function pg_temp.ok(boolean, text),
  pg_temp.as_owner(),
  pg_temp.as_anon(),
  pg_temp.as_user(text),
  pg_temp.as_moderator(),
  pg_temp.row_exists(regclass, uuid)
to anon, authenticated;

do $$
declare
  v_parent_author uuid;
  v_row_owner uuid;
  v_community uuid;
  v_debate_community uuid;
  v_organization uuid := gen_random_uuid();

  v_hidden_poll uuid := gen_random_uuid();
  v_visible_poll uuid := gen_random_uuid();
  v_hidden_option uuid := gen_random_uuid();
  v_visible_option uuid := gen_random_uuid();

  v_hidden_debate uuid := gen_random_uuid();
  v_visible_debate uuid := gen_random_uuid();
  v_hidden_debate_comment uuid := gen_random_uuid();
  v_visible_debate_comment uuid := gen_random_uuid();

  v_hidden_claim uuid := gen_random_uuid();
  v_visible_claim uuid := gen_random_uuid();
  v_hidden_claim_event uuid := gen_random_uuid();
  v_visible_claim_event uuid := gen_random_uuid();

  v_hidden_project uuid := gen_random_uuid();
  v_visible_project uuid := gen_random_uuid();
  v_hidden_project_comment uuid := gen_random_uuid();
  v_visible_project_comment uuid := gen_random_uuid();
  v_hidden_contribution uuid := gen_random_uuid();
  v_visible_contribution uuid := gen_random_uuid();
  v_hidden_milestone uuid := gen_random_uuid();
  v_visible_milestone uuid := gen_random_uuid();
  v_hidden_task uuid := gen_random_uuid();
  v_visible_task uuid := gen_random_uuid();

  v_budget uuid := gen_random_uuid();
  v_hidden_proposal uuid := gen_random_uuid();
  v_visible_proposal uuid := gen_random_uuid();
  v_hidden_report uuid := gen_random_uuid();
  v_visible_report uuid := gen_random_uuid();
  v_voting_budget uuid := gen_random_uuid();
  v_removed_voting_proposal uuid := gen_random_uuid();

  v_hidden_source uuid := gen_random_uuid();
  v_visible_source uuid := gen_random_uuid();
  v_hidden_response uuid := gen_random_uuid();
  v_visible_response uuid := gen_random_uuid();
  v_hidden_relation uuid := gen_random_uuid();
  v_visible_relation uuid := gen_random_uuid();

  v_rows integer;
  v_rejected boolean;
begin
  perform pg_temp.as_owner();
  select id into v_parent_author
  from public.profiles where username = 'sofia_mdq';
  select id into v_row_owner
  from public.profiles where username = 'bruno_lp';
  select id into v_community
  from public.communities
  where id = (
    select home_community_id
    from public.profiles
    where id = v_parent_author
  );
  select parent_id into v_debate_community
  from public.communities
  where id = v_community;
  if v_debate_community is null then
    raise exception 'La comunidad demo no tiene padre para crear un debate';
  end if;
  update public.profiles
  set residence_changed_at = statement_timestamp() - interval '10 days'
  where id = v_parent_author;

  insert into public.organizations (
    id, community_id, name, slug, verified_at
  ) values (
    v_organization,
    v_community,
    'Organización visibilidad 0054',
    'organizacion-visibilidad-' || left(v_organization::text, 8),
    statement_timestamp()
  );
  insert into public.organization_members (
    organization_id, user_id, role, added_by
  ) values (
    v_organization, v_row_owner, 'representative', v_parent_author
  );

  -- Se insertan visibles para que las guardas polimórficas validen los targets;
  -- la retirada ocurre después de crear todas las hijas adversariales.
  insert into public.polls (
    id, community_id, author_id, question, type, closes_at, status
  ) values
    (
      v_hidden_poll, v_community, v_parent_author,
      'Encuesta que será retirada', 'single',
      statement_timestamp() - interval '1 day', 'closed'
    ),
    (
      v_visible_poll, v_community, v_parent_author,
      'Encuesta que seguirá visible', 'single',
      statement_timestamp() - interval '1 day', 'closed'
    );
  insert into public.poll_options (id, poll_id, label, sort_order) values
    (v_hidden_option, v_hidden_poll, 'Opción retirada', 0),
    (v_visible_option, v_visible_poll, 'Opción visible', 0);

  insert into public.debates (
    id, community_id, author_id, title, body, status
  ) values
    (
      v_hidden_debate, v_debate_community, v_parent_author,
      'Debate que será retirado', 'Cuerpo del debate retirado.', 'open'
    ),
    (
      v_visible_debate, v_debate_community, v_parent_author,
      'Debate que seguirá visible', 'Cuerpo del debate visible.', 'open'
    );
  insert into public.debate_comments (
    id, debate_id, column_community_id, user_id, body
  ) values
    (
      v_hidden_debate_comment, v_hidden_debate, v_community,
      v_row_owner, 'Comentario del debate retirado.'
    ),
    (
      v_visible_debate_comment, v_visible_debate, v_community,
      v_row_owner, 'Comentario del debate visible.'
    );

  insert into public.claims (
    id, community_id, author_id, title, description, category, status
  ) values
    (
      v_hidden_claim, v_community, v_parent_author,
      'Reclamo que será retirado', 'Descripción del reclamo retirado.',
      'otro', 'resolved'
    ),
    (
      v_visible_claim, v_community, v_parent_author,
      'Reclamo que seguirá visible', 'Descripción del reclamo visible.',
      'otro', 'resolved'
    );
  insert into public.claim_events (
    id, claim_id, actor_id, organization_id, event_type, title, body
  ) values
    (
      v_hidden_claim_event, v_hidden_claim, v_row_owner, v_organization,
      'update', 'Evento del reclamo retirado', 'Detalle privado por retirada.'
    ),
    (
      v_visible_claim_event, v_visible_claim, v_row_owner, v_organization,
      'update', 'Evento del reclamo visible', 'Detalle públicamente visible.'
    );

  insert into public.projects (
    id, community_id, author_id, title, summary, plan, status
  ) values
    (
      v_hidden_project, v_community, v_parent_author,
      'Proyecto que será retirado', 'Resumen del proyecto retirado.',
      'Plan del proyecto retirado.', 'in_progress'
    ),
    (
      v_visible_project, v_community, v_parent_author,
      'Proyecto que seguirá visible', 'Resumen del proyecto visible.',
      'Plan del proyecto visible.', 'in_progress'
    );
  insert into public.project_comments (
    id, project_id, user_id, body
  ) values
    (
      v_hidden_project_comment, v_hidden_project, v_row_owner,
      'Comentario del proyecto retirado.'
    ),
    (
      v_visible_project_comment, v_visible_project, v_row_owner,
      'Comentario del proyecto visible.'
    );
  insert into public.project_contributions (
    id, project_id, user_id, kind, description
  ) values
    (
      v_hidden_contribution, v_hidden_project, v_row_owner,
      'time', 'Aporte del proyecto retirado.'
    ),
    (
      v_visible_contribution, v_visible_project, v_row_owner,
      'time', 'Aporte del proyecto visible.'
    );
  insert into public.project_milestones (
    id, project_id, title, status, sort_order
  ) values
    (
      v_hidden_milestone, v_hidden_project,
      'Hito del proyecto retirado', 'pending', 0
    ),
    (
      v_visible_milestone, v_visible_project,
      'Hito del proyecto visible', 'pending', 0
    );
  insert into public.project_tasks (
    id, project_id, milestone_id, title, assigned_user_id, status
  ) values
    (
      v_hidden_task, v_hidden_project, v_hidden_milestone,
      'Tarea del proyecto retirado', v_row_owner, 'open'
    ),
    (
      v_visible_task, v_visible_project, v_visible_milestone,
      'Tarea del proyecto visible', v_row_owner, 'open'
    );

  insert into public.community_budgets (
    id, community_id, title, amount,
    proposals_close_at, voting_opens_at, voting_closes_at, report_due_at,
    created_by
  ) values (
    v_budget, v_community, 'Partida cerrada para visibilidad', 50,
    statement_timestamp() - interval '4 days',
    statement_timestamp() - interval '3 days',
    statement_timestamp() - interval '2 days',
    statement_timestamp() + interval '30 days',
    v_parent_author
  );
  insert into public.budget_proposals (
    id, budget_id, project_id, requested_amount, admitted_at
  ) values
    (
      v_hidden_proposal, v_budget, v_hidden_project, 40,
      statement_timestamp() - interval '3 days'
    ),
    (
      v_visible_proposal, v_budget, v_visible_project, 50,
      statement_timestamp() - interval '3 days'
    );
  insert into private.budget_proposal_tallies (
    budget_id, proposal_id, tokens, voters, participants
  ) values
    (v_budget, v_hidden_proposal, 30, 5, 5),
    (v_budget, v_visible_proposal, 20, 5, 5)
  on conflict (budget_id, proposal_id) do update set
    tokens = excluded.tokens,
    voters = excluded.voters,
    participants = excluded.participants;
  insert into public.budget_reports (
    id, budget_id, project_id, amount_spent, summary, author_id
  ) values
    (
      v_hidden_report, v_budget, v_hidden_project, 1000,
      'Rendición suficientemente larga del proyecto retirado.', v_row_owner
    ),
    (
      v_visible_report, v_budget, v_visible_project, 2000,
      'Rendición suficientemente larga del proyecto visible.', v_row_owner
    );

  insert into public.content_sources (
    id, content_type, content_id, added_by, title, url
  ) values
    (
      v_hidden_source, 'poll', v_hidden_poll, v_row_owner,
      'Fuente del contenido retirado',
      'https://example.com/fuente-retirada-' || v_hidden_source::text
    ),
    (
      v_visible_source, 'poll', v_visible_poll, v_row_owner,
      'Fuente del contenido visible',
      'https://example.com/fuente-visible-' || v_visible_source::text
    );
  insert into public.institutional_responses (
    id, organization_id, author_id, content_type, content_id,
    response_type, body
  ) values
    (
      v_hidden_response, v_organization, v_row_owner, 'claim', v_hidden_claim,
      'information', 'Respuesta institucional del reclamo que será retirado.'
    ),
    (
      v_visible_response, v_organization, v_row_owner, 'claim', v_visible_claim,
      'information', 'Respuesta institucional del reclamo que seguirá visible.'
    );
  insert into public.content_relations (
    id, source_type, source_id, target_type, target_id,
    relation_type, created_by
  ) values
    (
      v_hidden_relation, 'poll', v_visible_poll, 'project', v_hidden_project,
      'proposal_for', v_row_owner
    ),
    (
      v_visible_relation, 'poll', v_visible_poll, 'project', v_visible_project,
      'proposal_for', v_row_owner
    );

  update public.polls set status = 'removed' where id = v_hidden_poll;
  update public.debates set status = 'removed' where id = v_hidden_debate;
  update public.claims set status = 'removed' where id = v_hidden_claim;
  update public.projects set status = 'removed' where id = v_hidden_project;

  -- Partida todavía abierta para demostrar que la RPC elevada rechaza una
  -- propuesta admitida cuyo proyecto fue retirado después de la revisión.
  insert into public.community_budgets (
    id, community_id, title, amount,
    proposals_close_at, voting_opens_at, voting_closes_at, report_due_at,
    created_by
  ) values (
    v_voting_budget, v_community, 'Partida abierta con proyecto retirado', 100,
    statement_timestamp() - interval '2 days',
    statement_timestamp() - interval '1 day',
    statement_timestamp() + interval '1 day',
    statement_timestamp() + interval '30 days',
    v_parent_author
  );
  insert into public.budget_proposals (
    id, budget_id, project_id, requested_amount, admitted_at
  ) values (
    v_removed_voting_proposal,
    v_voting_budget,
    v_hidden_project,
    40,
    statement_timestamp() - interval '1 day'
  );

  perform pg_temp.as_anon();
  perform pg_temp.ok(
    not public.can_view_content('poll', v_hidden_poll)
    and not public.can_view_content('debate', v_hidden_debate)
    and not public.can_view_content('claim', v_hidden_claim)
    and not public.can_view_content('project', v_hidden_project)
    and not public.can_view_content('invalid', v_visible_project),
    'anon no obtiene un oráculo para padres retirados o tipos inválidos'
  );
  perform pg_temp.ok(
    not pg_temp.row_exists('public.poll_options', v_hidden_option)
    and not pg_temp.row_exists('public.debate_comments', v_hidden_debate_comment)
    and not pg_temp.row_exists('public.claim_events', v_hidden_claim_event)
    and not pg_temp.row_exists('public.project_comments', v_hidden_project_comment)
    and not pg_temp.row_exists('public.project_contributions', v_hidden_contribution)
    and not pg_temp.row_exists('public.project_milestones', v_hidden_milestone)
    and not pg_temp.row_exists('public.project_tasks', v_hidden_task)
    and not pg_temp.row_exists('public.budget_proposals', v_hidden_proposal)
    and not pg_temp.row_exists('public.budget_reports', v_hidden_report)
    and not pg_temp.row_exists('public.content_sources', v_hidden_source)
    and not pg_temp.row_exists('public.institutional_responses', v_hidden_response)
    and not pg_temp.row_exists('public.content_relations', v_hidden_relation),
    'anon no lee ninguna hija de un padre retirado'
  );
  v_rejected := false;
  begin
    perform assigned_user_id
    from public.project_tasks
    where id = v_visible_task;
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'anon no puede seleccionar el UUID de la cuenta asignada a una tarea'
  );
  perform pg_temp.ok(
    public.can_view_content('poll', v_visible_poll)
    and public.can_view_content('debate', v_visible_debate)
    and public.can_view_content('claim', v_visible_claim)
    and public.can_view_content('project', v_visible_project)
    and pg_temp.row_exists('public.poll_options', v_visible_option)
    and pg_temp.row_exists('public.debate_comments', v_visible_debate_comment)
    and pg_temp.row_exists('public.claim_events', v_visible_claim_event)
    and pg_temp.row_exists('public.project_comments', v_visible_project_comment)
    and pg_temp.row_exists('public.project_contributions', v_visible_contribution)
    and pg_temp.row_exists('public.project_milestones', v_visible_milestone)
    and pg_temp.row_exists('public.project_tasks', v_visible_task)
    and pg_temp.row_exists('public.budget_proposals', v_visible_proposal)
    and pg_temp.row_exists('public.budget_reports', v_visible_report)
    and pg_temp.row_exists('public.content_sources', v_visible_source)
    and pg_temp.row_exists('public.institutional_responses', v_visible_response)
    and pg_temp.row_exists('public.content_relations', v_visible_relation),
    'anon conserva todas las hijas cuyo padre sigue visible'
  );
  perform pg_temp.ok(
    (select count(*) from public.budget_results(v_budget)) = 1
    and exists (
      select 1 from public.budget_results(v_budget)
      where project_id = v_visible_project
        and not awarded
        and awarded_amount = 0
    )
    and not exists (
      select 1 from public.budget_results(v_budget)
      where project_id = v_hidden_project
    ),
    'budget_results oculta el retirado sin reasignar su presupuesto'
  );

  perform pg_temp.as_user('diego_mza');
  perform pg_temp.ok(
    not pg_temp.row_exists('public.poll_options', v_hidden_option)
    and not pg_temp.row_exists('public.debate_comments', v_hidden_debate_comment)
    and not pg_temp.row_exists('public.claim_events', v_hidden_claim_event)
    and not pg_temp.row_exists('public.project_comments', v_hidden_project_comment)
    and not pg_temp.row_exists('public.project_contributions', v_hidden_contribution)
    and not pg_temp.row_exists('public.project_milestones', v_hidden_milestone)
    and not pg_temp.row_exists('public.project_tasks', v_hidden_task)
    and not pg_temp.row_exists('public.budget_proposals', v_hidden_proposal)
    and not pg_temp.row_exists('public.budget_reports', v_hidden_report)
    and not pg_temp.row_exists('public.content_sources', v_hidden_source)
    and not pg_temp.row_exists('public.institutional_responses', v_hidden_response)
    and not pg_temp.row_exists('public.content_relations', v_hidden_relation),
    'un usuario autenticado ajeno tampoco lee las hijas retiradas'
  );

  perform pg_temp.as_user('sofia_mdq');
  perform pg_temp.ok(
    not pg_temp.row_exists('public.poll_options', v_hidden_option)
    and not pg_temp.row_exists('public.debate_comments', v_hidden_debate_comment)
    and not pg_temp.row_exists('public.claim_events', v_hidden_claim_event)
    and not pg_temp.row_exists('public.project_comments', v_hidden_project_comment)
    and not pg_temp.row_exists('public.project_contributions', v_hidden_contribution)
    and not pg_temp.row_exists('public.project_milestones', v_hidden_milestone)
    and not pg_temp.row_exists('public.project_tasks', v_hidden_task)
    and not pg_temp.row_exists('public.budget_proposals', v_hidden_proposal)
    and not pg_temp.row_exists('public.budget_reports', v_hidden_report)
    and not pg_temp.row_exists('public.content_sources', v_hidden_source)
    and not pg_temp.row_exists('public.institutional_responses', v_hidden_response)
    and not pg_temp.row_exists('public.content_relations', v_hidden_relation),
    'ser autor del padre no reabre las filas de otras personas'
  );

  update public.project_milestones
  set status = 'in_progress'
  where id = v_hidden_milestone;
  get diagnostics v_rows = row_count;
  perform pg_temp.ok(v_rows = 0, 'el autor no actualiza hitos de un proyecto retirado');

  update public.project_tasks
  set status = 'in_progress'
  where id = v_hidden_task;
  get diagnostics v_rows = row_count;
  perform pg_temp.ok(v_rows = 0, 'el autor no actualiza tareas de un proyecto retirado');

  update public.project_contributions
  set status = 'accepted'
  where id = v_hidden_contribution;
  get diagnostics v_rows = row_count;
  perform pg_temp.ok(v_rows = 0, 'el autor no actualiza aportes de un proyecto retirado');

  v_rejected := false;
  v_rows := 0;
  begin
    delete from public.content_sources where id = v_hidden_source;
    get diagnostics v_rows = row_count;
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected or v_rows = 0,
    'el autor no borra fuentes de un padre retirado'
  );

  v_rejected := false;
  v_rows := 0;
  begin
    delete from public.content_relations where id = v_hidden_relation;
    get diagnostics v_rows = row_count;
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected or v_rows = 0,
    'el autor no borra relaciones con un extremo retirado'
  );

  v_rejected := false;
  begin
    insert into public.project_milestones (
      project_id, title, status, sort_order
    ) values (
      v_hidden_project, 'Hito inyectado tras moderación', 'pending', 9
    );
  exception when others then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el autor no agrega hitos tras la retirada');

  v_rejected := false;
  begin
    insert into public.project_tasks (
      project_id, title, assigned_user_id, status
    ) values (
      v_hidden_project, 'Tarea inyectada tras moderación', v_row_owner, 'open'
    );
  exception when others then
    v_rejected := true;
  end;
  perform pg_temp.ok(v_rejected, 'el autor no agrega tareas tras la retirada');

  v_rejected := false;
  begin
    perform public.cast_budget_ballot(
      v_voting_budget,
      jsonb_build_object(v_removed_voting_proposal::text, 1)
    );
  exception when check_violation then
    v_rejected := true;
  end;
  perform pg_temp.ok(
    v_rejected,
    'cast_budget_ballot rechaza la propuesta cuyo proyecto fue retirado'
  );
  perform pg_temp.as_owner();
  perform pg_temp.ok(
    not exists (
      select 1
      from public.budget_participation_receipts receipt
      where receipt.budget_id = v_voting_budget
        and receipt.user_id = v_parent_author
    )
    and coalesce((
      select sum(tally.tokens)
      from private.budget_proposal_tallies tally
      where tally.budget_id = v_voting_budget
    ), 0) = 0,
    'el rechazo no deja recibo ni modifica tallies'
  );

  perform pg_temp.as_user('bruno_lp');
  perform pg_temp.ok(
    pg_temp.row_exists('public.debate_comments', v_hidden_debate_comment)
    and pg_temp.row_exists('public.claim_events', v_hidden_claim_event)
    and pg_temp.row_exists('public.project_comments', v_hidden_project_comment)
    and pg_temp.row_exists('public.project_contributions', v_hidden_contribution)
    and pg_temp.row_exists('public.project_tasks', v_hidden_task)
    and pg_temp.row_exists('public.budget_reports', v_hidden_report)
    and pg_temp.row_exists('public.content_sources', v_hidden_source)
    and pg_temp.row_exists('public.institutional_responses', v_hidden_response)
    and pg_temp.row_exists('public.content_relations', v_hidden_relation)
    and not pg_temp.row_exists('public.poll_options', v_hidden_option)
    and not pg_temp.row_exists('public.project_milestones', v_hidden_milestone)
    and not pg_temp.row_exists('public.budget_proposals', v_hidden_proposal),
    'el owner conserva sólo sus filas personales, no las hijas públicas generales'
  );
  update public.project_tasks
  set status = 'in_progress'
  where id = v_hidden_task;
  get diagnostics v_rows = row_count;
  perform pg_temp.ok(
    v_rows = 0,
    'ver la asignación propia no permite mutarla mientras el padre está retirado'
  );

  perform pg_temp.as_moderator();
  perform pg_temp.ok(
    public.can_view_content('poll', v_hidden_poll)
    and public.can_view_content('debate', v_hidden_debate)
    and public.can_view_content('claim', v_hidden_claim)
    and public.can_view_content('project', v_hidden_project)
    and pg_temp.row_exists('public.poll_options', v_hidden_option)
    and pg_temp.row_exists('public.debate_comments', v_hidden_debate_comment)
    and pg_temp.row_exists('public.claim_events', v_hidden_claim_event)
    and pg_temp.row_exists('public.project_comments', v_hidden_project_comment)
    and pg_temp.row_exists('public.project_contributions', v_hidden_contribution)
    and pg_temp.row_exists('public.project_milestones', v_hidden_milestone)
    and pg_temp.row_exists('public.project_tasks', v_hidden_task)
    and pg_temp.row_exists('public.budget_proposals', v_hidden_proposal)
    and pg_temp.row_exists('public.budget_reports', v_hidden_report)
    and pg_temp.row_exists('public.content_sources', v_hidden_source)
    and pg_temp.row_exists('public.institutional_responses', v_hidden_response)
    and pg_temp.row_exists('public.content_relations', v_hidden_relation),
    'una sesión moderadora AAL2 conserva el historial retirado completo'
  );
  perform pg_temp.ok(
    (select count(*) from public.budget_results(v_budget)) = 2
    and exists (
      select 1 from public.budget_results(v_budget)
      where project_id = v_hidden_project
        and awarded
        and awarded_amount = 40
    )
    and exists (
      select 1 from public.budget_results(v_budget)
      where project_id = v_visible_project
        and not awarded
        and awarded_amount = 0
    ),
    'moderación ve el resultado original y la retirada no cambia a los demás'
  );

  perform pg_temp.as_owner();
  perform pg_temp.ok(
    not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename in (
          'claim_events',
          'content_relations',
          'content_sources',
          'institutional_responses',
          'project_contributions',
          'project_milestones',
          'project_tasks',
          'budget_proposals',
          'budget_reports'
        )
        and cmd = 'SELECT'
        and qual = 'true'
    ),
    'ninguna hija moderable conserva una policy SELECT universal'
  );
  perform pg_temp.ok(
    not exists (
      select 1
      from (values
        ('claim_events', 'actor_id', 'title'),
        ('community_budgets', 'created_by', 'title'),
        ('community_info', 'updated_by', 'title'),
        ('content_relations', 'created_by', 'relation_type'),
        ('content_sources', 'added_by', 'title'),
        ('institutional_responses', 'author_id', 'body'),
        ('organizations', 'verified_by', 'name'),
        ('budget_proposals', 'admitted_by', 'requested_amount'),
        ('budget_reports', 'author_id', 'summary'),
        ('project_tasks', 'assigned_user_id', 'title')
      ) as acl(table_name, hidden_column, public_column)
      where has_column_privilege(
          'anon', format('public.%I', acl.table_name),
          acl.hidden_column, 'select'
        )
        or has_column_privilege(
          'authenticated', format('public.%I', acl.table_name),
          acl.hidden_column, 'select'
        )
        or not has_column_privilege(
          'anon', format('public.%I', acl.table_name),
          acl.public_column, 'select'
        )
        or not has_column_privilege(
          'authenticated', format('public.%I', acl.table_name),
          acl.public_column, 'select'
        )
    ),
    'la API publica contenido, no UUID operativos de perfiles'
  );
  perform pg_temp.ok(
    not exists (
      select 1
      from (values
        ('claim_events', 'actor_id'),
        ('community_budgets', 'created_by'),
        ('community_info', 'updated_by'),
        ('content_relations', 'created_by'),
        ('content_sources', 'added_by'),
        ('institutional_responses', 'author_id'),
        ('organizations', 'verified_by'),
        ('budget_proposals', 'admitted_by'),
        ('budget_reports', 'author_id'),
        ('project_tasks', 'assigned_user_id')
      ) as acl(table_name, private_column)
      where not has_column_privilege(
        'service_role', format('public.%I', acl.table_name),
        acl.private_column, 'select'
      )
    ),
    'service_role conserva UUID privados para exportación y administración'
  );
end;
$$;

rollback;
