-- =============================================================================
-- Agorbis · 0032 · Integridad del presupuesto participativo
-- =============================================================================
-- Completa el circuito de D59: evaluación acotada a su fase, reemplazo de voto
-- atómico, resultados inmutables después del cierre y rendiciones que sólo
-- pueden corresponder a proyectos realmente financiados.

begin;

-- -----------------------------------------------------------------------------
-- 1 · Evaluar no permite reescribir la postulación.
-- -----------------------------------------------------------------------------
create or replace function public.guard_budget_proposal_review()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.budget_phase(old.budget_id) <> 'review' then
    raise exception 'La evaluación de esta partida no está abierta';
  end if;

  if new.budget_id is distinct from old.budget_id
     or new.project_id is distinct from old.project_id
     or new.requested_amount is distinct from old.requested_amount
     or new.created_at is distinct from old.created_at then
    raise exception 'La evaluación no puede modificar la postulación';
  end if;

  if new.admitted_at is not null then
    new.admitted_at := now();
    new.admitted_by := auth.uid();
    new.rejection_note := null;
  elsif nullif(btrim(new.rejection_note), '') is not null then
    new.admitted_by := auth.uid();
    new.rejection_note := btrim(new.rejection_note);
  else
    new.admitted_by := null;
    new.rejection_note := null;
  end if;

  return new;
end;
$$;

drop trigger if exists budget_proposals_guard_review on public.budget_proposals;
create trigger budget_proposals_guard_review
  before update on public.budget_proposals
  for each row execute function public.guard_budget_proposal_review();

drop policy if exists budget_proposals_insert_author on public.budget_proposals;
create policy budget_proposals_insert_author on public.budget_proposals
  for insert to authenticated
  with check (
    public.budget_phase(budget_id) = 'intake'
    and exists (
      select 1
      from public.projects pr
      join public.community_budgets b on b.id = budget_id
      where pr.id = project_id
        and pr.author_id = auth.uid()
        and pr.community_id = b.community_id
        and pr.status <> 'removed'
    )
  );

drop policy if exists budget_proposals_update_mod on public.budget_proposals;
create policy budget_proposals_update_mod on public.budget_proposals
  for update to authenticated
  using (
    public.is_moderator(auth.uid())
    and public.budget_phase(budget_id) = 'review'
  )
  with check (
    public.is_moderator(auth.uid())
    and public.budget_phase(budget_id) = 'review'
  );

-- -----------------------------------------------------------------------------
-- 2 · Votar es atómico y sólo durante la fase de votación.
-- -----------------------------------------------------------------------------
create or replace function public.guard_budget_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_budget   public.community_budgets%rowtype;
  v_used     int;
  v_admitted boolean;
begin
  select * into v_budget from public.community_budgets where id = new.budget_id;
  if not found then
    raise exception 'La partida no existe';
  end if;

  if public.budget_phase(new.budget_id) <> 'voting' then
    raise exception 'La votación de esta partida no está abierta';
  end if;

  if not public.can_vote_budget(new.user_id, new.budget_id) then
    raise exception 'No podés votar esta partida';
  end if;

  select p.admitted_at is not null into v_admitted
  from public.budget_proposals p
  where p.id = new.proposal_id and p.budget_id = new.budget_id;
  if not coalesce(v_admitted, false) then
    raise exception 'Ese proyecto no fue admitido en esta partida';
  end if;

  if new.tokens > v_budget.max_tokens_per_proposal then
    raise exception 'Máximo % fichas por proyecto', v_budget.max_tokens_per_proposal;
  end if;

  -- Dos requests simultáneos del mismo votante no pueden observar el mismo
  -- saldo de fichas y aprobarse los dos.
  perform pg_advisory_xact_lock(hashtext(
    concat_ws(':', 'budget-vote', new.budget_id::text, new.user_id::text)
  ));

  select coalesce(sum(v.tokens), 0) into v_used
  from public.budget_votes v
  where v.budget_id = new.budget_id
    and v.user_id = new.user_id
    and v.proposal_id <> new.proposal_id;

  if v_used + new.tokens > v_budget.tokens_per_voter then
    raise exception 'Te quedan % fichas', v_budget.tokens_per_voter - v_used;
  end if;

  return new;
end;
$$;

drop policy if exists budget_votes_write_own on public.budget_votes;

create policy budget_votes_insert_own on public.budget_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.budget_phase(budget_id) = 'voting'
  );

create policy budget_votes_update_own on public.budget_votes
  for update to authenticated
  using (
    user_id = auth.uid()
    and public.budget_phase(budget_id) = 'voting'
  )
  with check (
    user_id = auth.uid()
    and public.budget_phase(budget_id) = 'voting'
  );

create policy budget_votes_delete_own on public.budget_votes
  for delete to authenticated
  using (
    user_id = auth.uid()
    and public.budget_phase(budget_id) = 'voting'
  );

create or replace function public.replace_budget_vote(
  p_budget uuid,
  p_allocations jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Necesitás una cuenta para votar';
  end if;
  if public.budget_phase(p_budget) <> 'voting' then
    raise exception 'La votación de esta partida no está abierta';
  end if;
  if not public.can_vote_budget(v_user, p_budget) then
    raise exception 'No podés votar esta partida';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'object' then
    raise exception 'El reparto de fichas no es válido';
  end if;
  if exists (
    select 1
    from jsonb_each_text(p_allocations) allocation
    where allocation.value::int < 0
  ) then
    raise exception 'El reparto no puede tener fichas negativas';
  end if;

  -- El bloqueo debe preceder al delete: si todavía no hay filas, dos requests
  -- concurrentes no tendrían ningún row lock que los ordene y podrían mezclar
  -- repartos distintos.
  perform pg_advisory_xact_lock(hashtext(
    concat_ws(':', 'budget-vote', p_budget::text, v_user::text)
  ));

  -- Una excepción en cualquier insert revierte también este delete: el voto
  -- anterior nunca se pierde por intentar guardar un reparto inválido.
  delete from public.budget_votes
  where budget_id = p_budget and user_id = v_user;

  insert into public.budget_votes (budget_id, proposal_id, user_id, tokens)
  select
    p_budget,
    allocation.key::uuid,
    v_user,
    allocation.value::smallint
  from jsonb_each_text(p_allocations) as allocation
  where allocation.value::int > 0;
end;
$$;

revoke all on function public.replace_budget_vote(uuid, jsonb) from public;
grant execute on function public.replace_budget_vote(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 3 · El agregado no condiciona el voto: se publica recién al cerrar.
-- -----------------------------------------------------------------------------
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
set search_path = public
as $$
declare
  v_remaining numeric;
  r           record;
begin
  if public.budget_phase(p_budget) <> 'closed' then
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
      coalesce(sum(v.tokens), 0)::bigint as tokens,
      count(distinct v.user_id)::bigint as voters
    from public.budget_proposals p
    join public.projects pr on pr.id = p.project_id
    left join public.budget_votes v on v.proposal_id = p.id
    where p.budget_id = p_budget
      and p.admitted_at is not null
    group by p.id, p.project_id, pr.title, p.requested_amount
    order by 5 desc, p.requested_amount asc, p.id
  loop
    proposal_id      := r.proposal_id;
    project_id       := r.project_id;
    project_title    := r.project_title;
    requested_amount := r.requested_amount;
    tokens           := r.tokens;
    voters           := r.voters;

    if r.tokens > 0 and r.requested_amount <= v_remaining then
      awarded        := true;
      awarded_amount := r.requested_amount;
      v_remaining    := v_remaining - r.requested_amount;
    else
      awarded        := false;
      awarded_amount := 0;
    end if;

    return next;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4 · Una rendición pertenece a un proyecto de esa ronda y ya financiado.
-- -----------------------------------------------------------------------------
alter table public.budget_reports
  drop constraint if exists budget_reports_proposal_fkey;
alter table public.budget_reports
  add constraint budget_reports_proposal_fkey
  foreign key (budget_id, project_id)
  references public.budget_proposals (budget_id, project_id)
  on delete cascade;

drop policy if exists budget_reports_insert_author on public.budget_reports;
create policy budget_reports_insert_author on public.budget_reports
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.budget_phase(budget_id) = 'closed'
    and exists (
      select 1
      from public.projects pr
      where pr.id = project_id and pr.author_id = auth.uid()
    )
    and exists (
      select 1
      from public.budget_results(budget_id) result
      where result.project_id = budget_reports.project_id
        and result.awarded
    )
  );

commit;
