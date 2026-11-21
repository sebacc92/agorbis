-- =============================================================================
-- 0028 · Presupuesto participativo (D59)
--
-- Una partida por comunidad y período. Los proyectos se postulan, la comunidad
-- reparte fichas entre ellos y el resultado asigna fondos en orden de votos
-- hasta agotar la bolsa. La v1 no mueve dinero: registra la decisión y la
-- rendición.
-- =============================================================================
begin;

-- -----------------------------------------------------------------------------
-- 1 · La partida.
--
-- Las fases se derivan de las cuatro fechas (D59): no hay columna de estado
-- que alguien tenga que mover ni cron que deba correr para que abra el voto.
-- -----------------------------------------------------------------------------
create table if not exists public.community_budgets (
  id                 uuid primary key default gen_random_uuid(),
  community_id       uuid not null references public.communities (id) on delete cascade,
  title              text not null,
  description        text,
  amount             numeric(14, 2) not null,
  currency           text not null default 'ARS',

  -- Fichas por votante. Fijo por ronda y no global: una partida de barrio y
  -- una provincial no tienen por qué usar la misma granularidad.
  tokens_per_voter   smallint not null default 10,
  -- Tope por proyecto, para que el reparto no degenere en elección única.
  max_tokens_per_proposal smallint not null default 4,

  proposals_close_at timestamptz not null,
  voting_opens_at    timestamptz not null,
  voting_closes_at   timestamptz not null,
  -- Plazo de rendición para los proyectos que reciban partida.
  report_due_at      timestamptz not null,

  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),

  constraint community_budgets_title_chk check (char_length(title) between 3 and 150),
  constraint community_budgets_description_chk check (description is null or char_length(description) <= 2000),
  constraint community_budgets_amount_chk check (amount > 0),
  constraint community_budgets_currency_chk check (currency ~ '^[A-Z]{3}$'),
  constraint community_budgets_tokens_chk check (tokens_per_voter between 1 and 100),
  constraint community_budgets_max_tokens_chk check (
    max_tokens_per_proposal between 1 and tokens_per_voter
  ),
  -- El calendario tiene que ser coherente o la fase derivada no significa nada.
  constraint community_budgets_calendar_chk check (
    proposals_close_at <= voting_opens_at
    and voting_opens_at < voting_closes_at
    and voting_closes_at <= report_due_at
  )
);

create index if not exists community_budgets_community_idx
  on public.community_budgets (community_id, voting_closes_at desc);

comment on table public.community_budgets is
  'Partida que una comunidad reparte entre proyectos por votación (D59). No representa dinero en custodia.';

-- -----------------------------------------------------------------------------
-- 2 · Fase derivada de las fechas.
-- -----------------------------------------------------------------------------
create or replace function public.budget_phase(p_budget uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when now() < b.proposals_close_at then 'intake'
    when now() < b.voting_opens_at    then 'review'
    when now() < b.voting_closes_at   then 'voting'
    else 'closed'
  end
  from public.community_budgets b
  where b.id = p_budget;
$$;

grant execute on function public.budget_phase(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3 · Proyectos postulados.
--
-- `requested_amount` se copia de la postulación y no se lee de `projects`: el
-- presupuesto del proyecto puede cambiar después y el resultado de una ronda
-- cerrada no puede moverse retroactivamente.
-- -----------------------------------------------------------------------------
create table if not exists public.budget_proposals (
  id               uuid primary key default gen_random_uuid(),
  budget_id        uuid not null references public.community_budgets (id) on delete cascade,
  project_id       uuid not null references public.projects (id) on delete cascade,
  requested_amount numeric(14, 2) not null,
  -- Evaluación de viabilidad: sin admitir, el proyecto no entra a la votación.
  admitted_at      timestamptz,
  admitted_by      uuid references public.profiles (id) on delete set null,
  rejection_note   text,
  created_at       timestamptz not null default now(),

  constraint budget_proposals_amount_chk check (requested_amount > 0),
  constraint budget_proposals_note_chk check (rejection_note is null or char_length(rejection_note) <= 500),
  constraint budget_proposals_unique unique (budget_id, project_id)
);

create index if not exists budget_proposals_budget_idx
  on public.budget_proposals (budget_id, admitted_at);

-- -----------------------------------------------------------------------------
-- 4 · El voto: fichas repartidas.
-- -----------------------------------------------------------------------------
create table if not exists public.budget_votes (
  budget_id   uuid not null references public.community_budgets (id) on delete cascade,
  proposal_id uuid not null references public.budget_proposals (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  tokens      smallint not null,
  created_at  timestamptz not null default now(),

  primary key (proposal_id, user_id),
  constraint budget_votes_tokens_chk check (tokens > 0)
);

create index if not exists budget_votes_budget_user_idx
  on public.budget_votes (budget_id, user_id);

-- -----------------------------------------------------------------------------
-- 5 · Elegibilidad (D59).
--
-- Más estricto que una encuesta: además de residir en la comunidad, hay que
-- haberlo declarado antes de que abriera la votación. Sin eso, mudarse para
-- votar una partida sale gratis.
-- -----------------------------------------------------------------------------
create or replace function public.can_vote_budget(p_user uuid, p_budget uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_budgets b
    join public.profiles p on p.id = p_user
    where b.id = p_budget
      and public.is_member(p_user, b.community_id)
      -- `created_at` cubre a quien nunca cambió de residencia.
      and coalesce(p.residence_changed_at, p.created_at) < b.voting_opens_at
  );
$$;

grant execute on function public.can_vote_budget(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- 6 · Guardas del voto, en el motor y no en la action.
--
-- Mismo criterio que la cuota de contenido (D31): la UI puede equivocarse o
-- alguien puede llamar la API directo; la regla vive donde no se puede saltear.
-- -----------------------------------------------------------------------------
create or replace function public.guard_budget_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_budget  public.community_budgets%rowtype;
  v_used    int;
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

  -- Total repartido por esta persona en esta ronda, sin contar la fila que se
  -- está reemplazando.
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

drop trigger if exists budget_votes_guard on public.budget_votes;
create trigger budget_votes_guard
  before insert or update on public.budget_votes
  for each row execute function public.guard_budget_vote();

-- -----------------------------------------------------------------------------
-- 7 · Resultado: codicioso por fichas, saltea lo que no entra (D59).
-- -----------------------------------------------------------------------------
create or replace function public.budget_results(p_budget uuid)
returns table (
  proposal_id      uuid,
  project_id       uuid,
  project_title    text,
  requested_amount numeric,
  tokens           bigint,
  voters           bigint,
  awarded          boolean,
  awarded_amount   numeric
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
    -- Desempate estable por monto y luego por id: dos rondas iguales tienen
    -- que dar el mismo resultado, siempre.
    order by 5 desc, p.requested_amount asc, p.id
  loop
    proposal_id      := r.proposal_id;
    project_id       := r.project_id;
    project_title    := r.project_title;
    requested_amount := r.requested_amount;
    tokens           := r.tokens;
    voters           := r.voters;

    -- Sin un solo voto no se asigna nada, aunque sobre plata.
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

grant execute on function public.budget_results(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- 8 · Rendición: el espejo del reclamo (D58/D59).
-- -----------------------------------------------------------------------------
create table if not exists public.budget_reports (
  id           uuid primary key default gen_random_uuid(),
  budget_id    uuid not null references public.community_budgets (id) on delete cascade,
  project_id   uuid not null references public.projects (id) on delete cascade,
  amount_spent numeric(14, 2) not null,
  summary      text not null,
  evidence_url text,
  author_id    uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint budget_reports_amount_chk check (amount_spent >= 0),
  constraint budget_reports_summary_chk check (char_length(summary) between 20 and 3000),
  constraint budget_reports_evidence_chk check (evidence_url is null or evidence_url ~ '^https?://'),
  constraint budget_reports_unique unique (budget_id, project_id)
);

-- -----------------------------------------------------------------------------
-- 9 · RLS.
-- -----------------------------------------------------------------------------
alter table public.community_budgets enable row level security;
alter table public.budget_proposals  enable row level security;
alter table public.budget_votes      enable row level security;
alter table public.budget_reports    enable row level security;

-- La partida y su resultado son públicos: en eso consiste la función.
drop policy if exists community_budgets_select_all on public.community_budgets;
create policy community_budgets_select_all on public.community_budgets for select using (true);
drop policy if exists community_budgets_write_mod on public.community_budgets;
create policy community_budgets_write_mod on public.community_budgets for all to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

drop policy if exists budget_proposals_select_all on public.budget_proposals;
create policy budget_proposals_select_all on public.budget_proposals for select using (true);

-- Postular: el autor del proyecto, mientras la admisión esté abierta.
drop policy if exists budget_proposals_insert_author on public.budget_proposals;
create policy budget_proposals_insert_author on public.budget_proposals for insert to authenticated
  with check (
    public.budget_phase(budget_id) = 'intake'
    and exists (
      select 1 from public.projects pr
      join public.community_budgets b on b.id = budget_id
      where pr.id = project_id
        and pr.author_id = auth.uid()
        and pr.community_id = b.community_id
    )
  );

-- Admitir o rechazar es de moderación: es la evaluación de viabilidad.
drop policy if exists budget_proposals_update_mod on public.budget_proposals;
create policy budget_proposals_update_mod on public.budget_proposals for update to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

-- El voto individual no es público; el agregado sí, vía `budget_results`.
drop policy if exists budget_votes_select_own on public.budget_votes;
create policy budget_votes_select_own on public.budget_votes for select to authenticated
  using (user_id = auth.uid());
drop policy if exists budget_votes_write_own on public.budget_votes;
create policy budget_votes_write_own on public.budget_votes for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists budget_reports_select_all on public.budget_reports;
create policy budget_reports_select_all on public.budget_reports for select using (true);
drop policy if exists budget_reports_insert_author on public.budget_reports;
create policy budget_reports_insert_author on public.budget_reports for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.projects pr
      where pr.id = project_id and pr.author_id = auth.uid()
    )
  );

commit;
