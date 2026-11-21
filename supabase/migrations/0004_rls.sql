-- =============================================================================
-- Agorbis · 0004 · Row Level Security
-- -----------------------------------------------------------------------------
-- Regla general: lectura pública del contenido cívico, escritura sólo para
-- usuarios autenticados que *residen* en la comunidad (`is_member`).
-- La UI nunca es la que decide: todo se verifica acá.
-- =============================================================================

alter table public.communities       enable row level security;
alter table public.community_info    enable row level security;
alter table public.profiles          enable row level security;
alter table public.follows           enable row level security;
alter table public.polls             enable row level security;
alter table public.poll_options      enable row level security;
alter table public.poll_votes        enable row level security;
alter table public.poll_vote_events  enable row level security;
alter table public.debates           enable row level security;
alter table public.debate_comments   enable row level security;
alter table public.comment_votes     enable row level security;
alter table public.claims            enable row level security;
alter table public.claim_supports    enable row level security;
alter table public.projects          enable row level security;
alter table public.project_pledges   enable row level security;
alter table public.project_comments  enable row level security;
alter table public.reports           enable row level security;

-- -----------------------------------------------------------------------------
-- Quién puede crear encuestas. En el MVP: sólo moderadores y admins.
-- Punto único de cambio (espejo de POLL_CREATION_ROLE en src/lib/constants.ts).
-- -----------------------------------------------------------------------------
create or replace function public.can_create_poll(p_user uuid, p_community uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_moderator(p_user) and public.is_member(p_user, p_community);
$$;

grant execute on function public.can_create_poll(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- `is_admin` es `security definer` a propósito: consultar `profiles` desde una
-- policy *sobre* `profiles` es la receta clásica de la recursión infinita en
-- Supabase. Al saltear RLS acá, el problema no puede aparecer.
-- -----------------------------------------------------------------------------
create or replace function public.is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = p_user and role = 'admin');
$$;

grant execute on function public.is_admin(uuid) to authenticated, anon;

-- -----------------------------------------------------------------------------
-- Impide la escalada de privilegios desde el cliente: `role` y
-- `verification_level` sólo los cambia un admin (o el service role).
-- -----------------------------------------------------------------------------
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    -- service_role / triggers internos: sin restricción.
    return new;
  end if;

  if (new.role is distinct from old.role
      or new.verification_level is distinct from old.verification_level)
     and not public.is_admin(auth.uid()) then
    raise exception 'No podés modificar tu rol ni tu nivel de verificación'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- =============================================================================
-- communities · sólo lectura para todo el mundo
-- =============================================================================
drop policy if exists communities_select_all on public.communities;
create policy communities_select_all on public.communities
  for select using (true);

drop policy if exists communities_admin_write on public.communities;
create policy communities_admin_write on public.communities
  for all to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

-- =============================================================================
-- community_info · lectura pública, edición sólo moderación
-- =============================================================================
drop policy if exists community_info_select_all on public.community_info;
create policy community_info_select_all on public.community_info
  for select using (true);

drop policy if exists community_info_mod_write on public.community_info;
create policy community_info_mod_write on public.community_info
  for all to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()) and updated_by = auth.uid());

-- =============================================================================
-- profiles · perfil público, cada uno edita el suyo
-- =============================================================================
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- =============================================================================
-- follows
-- =============================================================================
drop policy if exists follows_select_all on public.follows;
create policy follows_select_all on public.follows
  for select using (true);

drop policy if exists follows_insert_own on public.follows;
create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists follows_delete_own on public.follows;
create policy follows_delete_own on public.follows
  for delete to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- polls / poll_options
-- =============================================================================
drop policy if exists polls_select_visible on public.polls;
create policy polls_select_visible on public.polls
  for select using (status <> 'removed' or public.is_moderator(auth.uid()));

drop policy if exists polls_insert_moderator on public.polls;
create policy polls_insert_moderator on public.polls
  for insert to authenticated
  with check (author_id = auth.uid() and public.can_create_poll(auth.uid(), community_id));

drop policy if exists polls_update_moderator on public.polls;
create policy polls_update_moderator on public.polls
  for update to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

drop policy if exists poll_options_select_all on public.poll_options;
create policy poll_options_select_all on public.poll_options
  for select using (
    exists (
      select 1 from public.polls p
      where p.id = poll_id and (p.status <> 'removed' or public.is_moderator(auth.uid()))
    )
  );

drop policy if exists poll_options_write_author on public.poll_options;
create policy poll_options_write_author on public.poll_options
  for all to authenticated
  using (
    exists (select 1 from public.polls p where p.id = poll_id and p.author_id = auth.uid())
    or public.is_moderator(auth.uid())
  )
  with check (
    exists (
      select 1 from public.polls p
      where p.id = poll_id
        and (p.author_id = auth.uid() or public.is_moderator(auth.uid()))
    )
  );

-- =============================================================================
-- poll_votes · el voto es secreto: cada quien ve sólo el suyo.
-- Los agregados salen por `poll_results()` (security definer).
-- =============================================================================
drop policy if exists poll_votes_select_own on public.poll_votes;
create policy poll_votes_select_own on public.poll_votes
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists poll_votes_insert_member on public.poll_votes;
create policy poll_votes_insert_member on public.poll_votes
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.polls p
      where p.id = poll_id
        and p.status = 'active'
        and (p.closes_at is null or p.closes_at > now())
        and public.is_member(auth.uid(), p.community_id)
    )
  );

-- Sin UPDATE ni DELETE: en el MVP el voto no se cambia.

drop policy if exists poll_vote_events_select_all on public.poll_vote_events;
create policy poll_vote_events_select_all on public.poll_vote_events
  for select using (true);

-- =============================================================================
-- debates
-- =============================================================================
drop policy if exists debates_select_visible on public.debates;
create policy debates_select_visible on public.debates
  for select using (status <> 'removed' or public.is_moderator(auth.uid()));

drop policy if exists debates_insert_member on public.debates;
create policy debates_insert_member on public.debates
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_member(auth.uid(), community_id)
    -- Un debate necesita al menos una sub-comunidad: sin columnas no hay grilla.
    and exists (select 1 from public.communities c where c.parent_id = community_id)
  );

drop policy if exists debates_update_own_or_mod on public.debates;
create policy debates_update_own_or_mod on public.debates
  for update to authenticated
  using (author_id = auth.uid() or public.is_moderator(auth.uid()))
  with check (author_id = auth.uid() or public.is_moderator(auth.uid()));

-- =============================================================================
-- debate_comments · sólo se comenta en la columna donde uno reside
-- =============================================================================
drop policy if exists debate_comments_select_visible on public.debate_comments;
create policy debate_comments_select_visible on public.debate_comments
  for select using (
    status = 'visible' or user_id = auth.uid() or public.is_moderator(auth.uid())
  );

drop policy if exists debate_comments_insert_member on public.debate_comments;
create policy debate_comments_insert_member on public.debate_comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    -- Residir en la comunidad de la columna: un marplatense sólo escribe en la
    -- columna "Buenos Aires" de un debate argentino.
    and public.is_member(auth.uid(), column_community_id)
    and exists (
      select 1
      from public.debates d
      join public.communities col on col.id = column_community_id
      where d.id = debate_id
        and d.status = 'open'
        and col.parent_id = d.community_id
    )
  );

drop policy if exists debate_comments_update_mod on public.debate_comments;
create policy debate_comments_update_mod on public.debate_comments
  for update to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

-- =============================================================================
-- comment_votes · votar requiere residir en la comunidad dueña del debate
-- =============================================================================
drop policy if exists comment_votes_select_own on public.comment_votes;
create policy comment_votes_select_own on public.comment_votes
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists comment_votes_write_member on public.comment_votes;
create policy comment_votes_write_member on public.comment_votes
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.debate_comments dc
      join public.debates d on d.id = dc.debate_id
      where dc.id = comment_id
        and dc.status = 'visible'
        and d.status = 'open'
        and public.is_member(auth.uid(), d.community_id)
    )
  );

-- =============================================================================
-- claims
-- =============================================================================
drop policy if exists claims_select_visible on public.claims;
create policy claims_select_visible on public.claims
  for select using (status <> 'removed' or public.is_moderator(auth.uid()));

drop policy if exists claims_insert_member on public.claims;
create policy claims_insert_member on public.claims
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(auth.uid(), community_id));

drop policy if exists claims_update_own_or_mod on public.claims;
create policy claims_update_own_or_mod on public.claims
  for update to authenticated
  using (author_id = auth.uid() or public.is_moderator(auth.uid()))
  with check (author_id = auth.uid() or public.is_moderator(auth.uid()));

drop policy if exists claim_supports_select_own on public.claim_supports;
create policy claim_supports_select_own on public.claim_supports
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists claim_supports_insert_member on public.claim_supports;
create policy claim_supports_insert_member on public.claim_supports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.claims c
      where c.id = claim_id
        and c.status <> 'removed'
        and public.is_member(auth.uid(), c.community_id)
    )
  );

drop policy if exists claim_supports_delete_own on public.claim_supports;
create policy claim_supports_delete_own on public.claim_supports
  for delete to authenticated
  using (user_id = auth.uid());

-- =============================================================================
-- projects
-- =============================================================================
drop policy if exists projects_select_visible on public.projects;
create policy projects_select_visible on public.projects
  for select using (status <> 'removed' or public.is_moderator(auth.uid()));

drop policy if exists projects_insert_member on public.projects;
create policy projects_insert_member on public.projects
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(auth.uid(), community_id));

drop policy if exists projects_update_own_or_mod on public.projects;
create policy projects_update_own_or_mod on public.projects
  for update to authenticated
  using (author_id = auth.uid() or public.is_moderator(auth.uid()))
  with check (author_id = auth.uid() or public.is_moderator(auth.uid()));

-- Los compromisos son públicos: mostrar quién se sumó es parte del producto.
drop policy if exists project_pledges_select_all on public.project_pledges;
create policy project_pledges_select_all on public.project_pledges
  for select using (true);

drop policy if exists project_pledges_write_member on public.project_pledges;
create policy project_pledges_write_member on public.project_pledges
  for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.status in ('proposal', 'funding', 'in_progress')
        and public.is_member(auth.uid(), p.community_id)
    )
  );

drop policy if exists project_comments_select_visible on public.project_comments;
create policy project_comments_select_visible on public.project_comments
  for select using (
    status = 'visible' or user_id = auth.uid() or public.is_moderator(auth.uid())
  );

drop policy if exists project_comments_insert_member on public.project_comments;
create policy project_comments_insert_member on public.project_comments
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.status <> 'removed'
        and public.is_member(auth.uid(), p.community_id)
    )
  );

drop policy if exists project_comments_update_mod on public.project_comments;
create policy project_comments_update_mod on public.project_comments
  for update to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));

-- =============================================================================
-- reports · cualquiera reporta, sólo moderación lee y resuelve
-- =============================================================================
drop policy if exists reports_insert_authenticated on public.reports;
create policy reports_insert_authenticated on public.reports
  for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'pending');

drop policy if exists reports_select_own_or_mod on public.reports;
create policy reports_select_own_or_mod on public.reports
  for select to authenticated
  using (reporter_id = auth.uid() or public.is_moderator(auth.uid()));

drop policy if exists reports_update_mod on public.reports;
create policy reports_update_mod on public.reports
  for update to authenticated
  using (public.is_moderator(auth.uid()))
  with check (public.is_moderator(auth.uid()));
