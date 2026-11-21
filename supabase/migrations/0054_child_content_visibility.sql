-- =============================================================================
-- Agorbis · 0054 · Visibilidad heredada de contenido moderado
-- -----------------------------------------------------------------------------
-- RLS no hereda las policies de una tabla referenciada. Varias hijas públicas
-- seguían siendo consultables por PostgREST después de retirar su encuesta,
-- debate, reclamo o proyecto padre. Este cierre replica la frontera del padre
-- y conserva acceso sólo para la persona vinculada a la fila y moderación.
-- =============================================================================

-- Un único predicado evita que las policies polimórficas diverjan. Es
-- `security definer` porque debe comprobar la fila real aun cuando RLS ya la
-- oculta, pero sólo devuelve el mismo booleano observable en las tablas padre:
-- inexistente y retirado son indistinguibles para una sesión ordinaria.
create or replace function public.can_view_content(p_type text, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(case p_type
    when 'poll' then exists (
      select 1
      from public.polls p
      where p.id = p_id
        and (
          p.status <> 'removed'
          or public.is_moderator(auth.uid())
        )
    )
    when 'debate' then exists (
      select 1
      from public.debates d
      where d.id = p_id
        and (
          d.status <> 'removed'
          or public.is_moderator(auth.uid())
        )
    )
    when 'claim' then exists (
      select 1
      from public.claims c
      where c.id = p_id
        and (
          c.status <> 'removed'
          or public.is_moderator(auth.uid())
        )
    )
    when 'project' then exists (
      select 1
      from public.projects p
      where p.id = p_id
        and (
          p.status <> 'removed'
          or public.is_moderator(auth.uid())
        )
    )
    else false
  end, false);
$$;

comment on function public.can_view_content(text, uuid) is
  'Replica la visibilidad RLS del contenido padre sin distinguir contenido retirado de inexistente.';

revoke execute on function public.can_view_content(text, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.can_view_content(text, uuid)
to anon, authenticated;

-- Los UUID operativos permiten resolver perfiles públicos y reconstruir quién
-- moderó, verificó o cargó una fila. RLS puede seguir usándolos para reconocer
-- a la persona vinculada, pero no forman parte de la respuesta pública. El rol
-- de servicio conserva su grant de tabla para exportaciones y administración.
revoke select on public.claim_events,
  public.community_budgets,
  public.community_info,
  public.content_relations,
  public.content_sources,
  public.institutional_responses,
  public.organizations,
  public.budget_proposals,
  public.budget_reports,
  public.project_tasks
from anon, authenticated;

grant select (
  id,
  claim_id,
  organization_id,
  event_type,
  title,
  body,
  status,
  evidence_url,
  event_date,
  created_at
) on public.claim_events to anon, authenticated;

grant select (
  id,
  community_id,
  title,
  description,
  amount,
  currency,
  tokens_per_voter,
  max_tokens_per_proposal,
  proposals_close_at,
  voting_opens_at,
  voting_closes_at,
  report_due_at,
  created_at
) on public.community_budgets to anon, authenticated;

grant select (
  id,
  community_id,
  category,
  title,
  content,
  image_url,
  updated_at
) on public.community_info to anon, authenticated;

grant select (
  id,
  source_type,
  source_id,
  target_type,
  target_id,
  relation_type,
  created_at
) on public.content_relations to anon, authenticated;

grant select (
  id,
  content_type,
  content_id,
  title,
  url,
  publisher,
  published_at,
  verified_at,
  created_at
) on public.content_sources to anon, authenticated;

grant select (
  id,
  organization_id,
  content_type,
  content_id,
  response_type,
  body,
  source_url,
  created_at
) on public.institutional_responses to anon, authenticated;

grant select (
  id,
  community_id,
  name,
  slug,
  type,
  description,
  website,
  logo_url,
  verified_at,
  created_at
) on public.organizations to anon, authenticated;

grant select (
  id,
  budget_id,
  project_id,
  requested_amount,
  admitted_at,
  rejection_note,
  created_at
) on public.budget_proposals to anon, authenticated;

grant select (
  id,
  budget_id,
  project_id,
  amount_spent,
  summary,
  evidence_url,
  created_at
) on public.budget_reports to anon, authenticated;

grant select (
  id,
  project_id,
  milestone_id,
  title,
  description,
  assigned_organization_id,
  skills_needed,
  due_date,
  status,
  created_at
) on public.project_tasks to anon, authenticated;

-- Comentarios: el contenido visible requiere padre visible. La persona conserva
-- acceso a su propia fila retirada para revisión/exportación y moderación ve el
-- historial completo con su sesión privilegiada.
drop policy if exists debate_comments_select_visible
  on public.debate_comments;
create policy debate_comments_select_visible
  on public.debate_comments for select
  using (
    (
      status = 'visible'
      and public.can_view_content('debate', debate_id)
    )
    or user_id = auth.uid()
    or public.is_moderator(auth.uid())
  );

drop policy if exists project_comments_select_visible
  on public.project_comments;
create policy project_comments_select_visible
  on public.project_comments for select
  using (
    (
      status = 'visible'
      and public.can_view_content('project', project_id)
    )
    or user_id = auth.uid()
    or public.is_moderator(auth.uid())
  );

-- Hijas directas con contenido propio. Sólo la fila personal sobrevive a la
-- retirada del padre para esa misma cuenta; no se vuelve pública por ello.
drop policy if exists claim_events_select_all on public.claim_events;
drop policy if exists claim_events_select_visible on public.claim_events;
create policy claim_events_select_visible
  on public.claim_events for select
  using (
    public.can_view_content('claim', claim_id)
    or actor_id = auth.uid()
    or public.is_moderator(auth.uid())
  );

drop policy if exists project_contributions_select_all
  on public.project_contributions;
drop policy if exists project_contributions_select_visible
  on public.project_contributions;
create policy project_contributions_select_visible
  on public.project_contributions for select
  using (
    public.can_view_content('project', project_id)
    or user_id = auth.uid()
    or public.is_moderator(auth.uid())
  );

drop policy if exists project_milestones_select_all
  on public.project_milestones;
drop policy if exists project_milestones_select_visible
  on public.project_milestones;
create policy project_milestones_select_visible
  on public.project_milestones for select
  using (public.can_view_content('project', project_id));

drop policy if exists project_tasks_select_all on public.project_tasks;
drop policy if exists project_tasks_select_visible on public.project_tasks;
create policy project_tasks_select_visible
  on public.project_tasks for select
  using (
    public.can_view_content('project', project_id)
    or assigned_user_id = auth.uid()
    or public.is_moderator(auth.uid())
  );

drop policy if exists budget_proposals_select_all
  on public.budget_proposals;
drop policy if exists budget_proposals_select_visible
  on public.budget_proposals;
create policy budget_proposals_select_visible
  on public.budget_proposals for select
  using (public.can_view_content('project', project_id));

drop policy if exists budget_reports_select_all on public.budget_reports;
drop policy if exists budget_reports_select_visible on public.budget_reports;
create policy budget_reports_select_visible
  on public.budget_reports for select
  using (
    public.can_view_content('project', project_id)
    or author_id = auth.uid()
    or public.is_moderator(auth.uid())
  );

-- Hijas polimórficas. Una relación sólo es pública cuando lo son sus dos
-- extremos: ocultar sólo el destino seguiría revelando tipo e UUID retirados.
drop policy if exists content_sources_select_all on public.content_sources;
drop policy if exists content_sources_select_visible on public.content_sources;
create policy content_sources_select_visible
  on public.content_sources for select
  using (
    public.can_view_content(content_type, content_id)
    or added_by = auth.uid()
    or public.is_moderator(auth.uid())
  );

drop policy if exists institutional_responses_select_all
  on public.institutional_responses;
drop policy if exists institutional_responses_select_visible
  on public.institutional_responses;
create policy institutional_responses_select_visible
  on public.institutional_responses for select
  using (
    public.can_view_content(content_type, content_id)
    or author_id = auth.uid()
    or public.is_moderator(auth.uid())
  );

drop policy if exists content_relations_select_all
  on public.content_relations;
drop policy if exists content_relations_select_visible
  on public.content_relations;
create policy content_relations_select_visible
  on public.content_relations for select
  using (
    (
      public.can_view_content(source_type, source_id)
      and public.can_view_content(target_type, target_id)
    )
    or created_by = auth.uid()
    or public.is_moderator(auth.uid())
  );

-- Las policies permisivas se combinan con OR. Si quedara una policy `ALL`
-- antigua basada sólo en autoría, además de reabrir SELECT permitiría mutar
-- hijas mientras el padre está retirado. Toda escritura de extensiones exige
-- ahora que el padre siga visible para esa sesión; moderación conserva acceso.
drop policy if exists claim_events_insert_manager on public.claim_events;
create policy claim_events_insert_manager
  on public.claim_events for insert to authenticated
  with check (
    actor_id = auth.uid()
    and public.can_view_content('claim', claim_id)
    and (
      public.can_manage_content(auth.uid(), 'claim', claim_id)
      or public.can_update_claim_as_org(auth.uid(), claim_id)
    )
  );

drop policy if exists project_milestones_manage
  on public.project_milestones;
create policy project_milestones_manage
  on public.project_milestones for all to authenticated
  using (
    public.can_view_content('project', project_id)
    and public.can_manage_content(auth.uid(), 'project', project_id)
  )
  with check (
    public.can_view_content('project', project_id)
    and public.can_manage_content(auth.uid(), 'project', project_id)
  );

drop policy if exists project_tasks_insert_manager on public.project_tasks;
create policy project_tasks_insert_manager
  on public.project_tasks for insert to authenticated
  with check (
    public.can_view_content('project', project_id)
    and public.can_manage_content(auth.uid(), 'project', project_id)
  );

drop policy if exists project_tasks_update_manager_or_assignee
  on public.project_tasks;
create policy project_tasks_update_manager_or_assignee
  on public.project_tasks for update to authenticated
  using (
    public.can_view_content('project', project_id)
    and (
      public.can_manage_content(auth.uid(), 'project', project_id)
      or assigned_user_id = auth.uid()
    )
  )
  with check (
    public.can_view_content('project', project_id)
    and (
      public.can_manage_content(auth.uid(), 'project', project_id)
      or assigned_user_id = auth.uid()
    )
  );

drop policy if exists project_contributions_update_manager
  on public.project_contributions;
create policy project_contributions_update_manager
  on public.project_contributions for update to authenticated
  using (
    public.can_view_content('project', project_id)
    and public.can_manage_content(auth.uid(), 'project', project_id)
  )
  with check (
    public.can_view_content('project', project_id)
    and public.can_manage_content(auth.uid(), 'project', project_id)
  );

drop policy if exists content_sources_insert_manager
  on public.content_sources;
create policy content_sources_insert_manager
  on public.content_sources for insert to authenticated
  with check (
    added_by = auth.uid()
    and public.can_view_content(content_type, content_id)
    and public.can_manage_content(auth.uid(), content_type, content_id)
  );

drop policy if exists content_sources_delete_manager
  on public.content_sources;
create policy content_sources_delete_manager
  on public.content_sources for delete to authenticated
  using (
    public.can_view_content(content_type, content_id)
    and public.can_manage_content(auth.uid(), content_type, content_id)
  );

drop policy if exists content_relations_insert_manager
  on public.content_relations;
create policy content_relations_insert_manager
  on public.content_relations for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_view_content(source_type, source_id)
    and public.can_view_content(target_type, target_id)
    and public.can_manage_content(auth.uid(), source_type, source_id)
  );

drop policy if exists content_relations_delete_manager
  on public.content_relations;
create policy content_relations_delete_manager
  on public.content_relations for delete to authenticated
  using (
    public.can_view_content(source_type, source_id)
    and public.can_view_content(target_type, target_id)
    and public.can_manage_content(auth.uid(), source_type, source_id)
  );

-- `cast_budget_ballot` también ignora RLS. Además de que la propuesta esté
-- admitida, bloquea y comprueba el proyecto padre para que una retirada
-- concurrente gane antes del voto o espere a que la emisión termine.
create or replace function public.cast_budget_ballot(
  p_budget uuid,
  p_allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_budget public.community_budgets%rowtype;
  v_key text;
  v_value jsonb;
  v_proposal uuid;
  v_tokens integer;
  v_total integer := 0;
  v_count integer := 0;
begin
  if v_actor is null then
    raise exception 'Necesitás una cuenta para votar'
      using errcode = 'invalid_authorization_specification';
  end if;
  perform private.assert_can_participate(v_actor);
  perform pg_advisory_xact_lock(
    hashtextextended('budget-ballot:' || p_budget::text || ':' || v_actor::text, 0)
  );

  select b.* into v_budget
  from public.community_budgets b
  where b.id = p_budget
  for update;
  if not found then
    raise exception 'La partida no existe'
      using errcode = 'foreign_key_violation';
  end if;

  perform pg_advisory_xact_lock(hashtext('budget-proposals:' || p_budget::text));
  if public.budget_phase(p_budget) <> 'voting' then
    raise exception 'La votación de esta partida no está abierta'
      using errcode = 'check_violation';
  end if;
  if not public.can_vote_budget(v_actor, p_budget) then
    raise exception 'No podés votar esta partida'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (
    select 1 from public.budget_participation_receipts r
    where r.budget_id = p_budget and r.user_id = v_actor
  ) then
    raise exception 'AGORBIS_BUDGET_ALREADY_VOTED'
      using errcode = 'unique_violation';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'object' then
    raise exception 'El reparto de fichas no es válido'
      using errcode = 'check_violation';
  end if;

  for v_key, v_value in select key, value from jsonb_each(p_allocations)
  loop
    v_count := v_count + 1;
    if v_count > 100
       or v_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or jsonb_typeof(v_value) <> 'number'
       or (v_value #>> '{}') !~ '^[0-9]+$' then
      raise exception 'El reparto de fichas no es válido'
        using errcode = 'check_violation';
    end if;
    v_proposal := v_key::uuid;
    v_tokens := (v_value #>> '{}')::integer;
    if v_tokens <= 0 then
      raise exception 'El reparto no puede tener fichas negativas ni vacías'
        using errcode = 'check_violation';
    end if;
    if v_tokens > v_budget.max_tokens_per_proposal then
      raise exception 'Máximo % fichas por proyecto',
        v_budget.max_tokens_per_proposal
        using errcode = 'check_violation';
    end if;

    -- `FOR SHARE` bloquea también cambios no-clave como `status`; `KEY SHARE`
    -- permitiría retirar el proyecto entre esta validación y el recibo.
    perform 1
    from public.budget_proposals proposal
    join public.projects project on project.id = proposal.project_id
    where proposal.id = v_proposal
      and proposal.budget_id = p_budget
      and proposal.admitted_at is not null
      and project.status <> 'removed'
    for share of proposal, project;
    if not found then
      raise exception 'Ese proyecto no fue admitido en esta partida'
        using errcode = 'check_violation';
    end if;
    v_total := v_total + v_tokens;
  end loop;

  if v_count = 0 then
    raise exception 'Repartí al menos una ficha'
      using errcode = 'check_violation';
  end if;
  if v_total > v_budget.tokens_per_voter then
    raise exception 'Te quedan % fichas', v_budget.tokens_per_voter
      using errcode = 'check_violation';
  end if;

  insert into public.budget_participation_receipts (budget_id, user_id)
  values (p_budget, v_actor);

  insert into private.budget_proposal_tallies (
    budget_id, proposal_id, tokens, voters, participants
  )
  select
    p.budget_id,
    p.id,
    0,
    0,
    coalesce((
      select max(existing.participants)
      from private.budget_proposal_tallies existing
      where existing.budget_id = p_budget
    ), 0)
  from public.budget_proposals p
  where p.budget_id = p_budget
  on conflict (budget_id, proposal_id) do nothing;

  update private.budget_proposal_tallies t
  set tokens = t.tokens + coalesce(
        (p_allocations ->> t.proposal_id::text)::integer,
        0
      ),
      voters = t.voters + case
        when p_allocations ? t.proposal_id::text then 1 else 0
      end,
      participants = t.participants + 1
  where t.budget_id = p_budget;

  insert into public.activation_events (user_id, event, metadata)
  values (
    v_actor,
    'first_participation',
    jsonb_build_object('kind', 'budget_participation')
  )
  on conflict do nothing;
end;
$$;

-- `budget_results` es security-definer y, por diseño, no hereda RLS. Replica la
-- misma comprobación para no devolver título, monto ni resultado de un proyecto
-- retirado. Moderación conserva la vista completa para auditoría.
create or replace function public.budget_results(p_budget uuid)
returns table (
  proposal_id       uuid,
  project_id        uuid,
  project_title     text,
  requested_amount numeric,
  tokens            bigint,
  voters            bigint,
  awarded           boolean,
  awarded_amount    numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_remaining numeric;
  r record;
begin
  if public.budget_phase(p_budget) <> 'closed' then return; end if;
  if (
    select coalesce(max(t.participants), 0)
    from private.budget_proposal_tallies t
    where t.budget_id = p_budget
  ) < 5 then
    return;
  end if;
  select b.amount into v_remaining
  from public.community_budgets b where b.id = p_budget;
  if v_remaining is null then return; end if;

  for r in
    select
      p.id as proposal_id,
      p.project_id,
      pr.title as project_title,
      p.requested_amount,
      coalesce(t.tokens, 0)::bigint as tokens,
      coalesce(t.voters, 0)::bigint as voters,
      public.can_view_content('project', p.project_id) as is_visible
    from public.budget_proposals p
    join public.projects pr on pr.id = p.project_id
    left join private.budget_proposal_tallies t
      on t.budget_id = p.budget_id and t.proposal_id = p.id
    where p.budget_id = p_budget
      and p.admitted_at is not null
    group by p.id, p.project_id, pr.title, p.requested_amount,
      t.tokens, t.voters,
      public.can_view_content('project', p.project_id)
    order by 5 desc, p.requested_amount, p.id
  loop
    proposal_id := r.proposal_id;
    project_id := r.project_id;
    project_title := r.project_title;
    requested_amount := r.requested_amount;
    tokens := r.tokens;
    voters := r.voters;
    if r.tokens > 0 and r.requested_amount <= v_remaining then
      awarded := true;
      awarded_amount := r.requested_amount;
      v_remaining := v_remaining - r.requested_amount;
    else
      awarded := false;
      awarded_amount := 0;
    end if;
    -- El retiro cambia quién puede ver una fila, nunca el resultado histórico
    -- ni la asignación de las propuestas que siguen visibles.
    if r.is_visible then
      return next;
    end if;
  end loop;
end;
$$;
