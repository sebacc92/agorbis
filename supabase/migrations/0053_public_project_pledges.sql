-- =============================================================================
-- Agorbis · 0053 · Compromisos públicos sin exponer `user_id`
-- -----------------------------------------------------------------------------
-- Mostrar quién se comprometió es una elección explícita del producto, pero el
-- UUID interno no debe quedar consultable como una columna pública. La tabla
-- vuelve a ser self-only y dos RPC estrechas entregan identidad de perfil ya
-- pública y conteos agregados para proyectos visibles.
-- =============================================================================

drop policy if exists project_pledges_select_all on public.project_pledges;
drop policy if exists project_pledges_select_own on public.project_pledges;
create policy project_pledges_select_own
  on public.project_pledges
  for select to authenticated
  using (user_id = auth.uid());

revoke select on public.project_pledges from public, anon, authenticated;
revoke insert, update, delete on public.project_pledges from anon;
grant select on public.project_pledges to authenticated;

create or replace function public.project_public_pledges(
  p_project uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  amount numeric,
  message text,
  created_at timestamptz,
  author_username text,
  author_display_name text,
  author_avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pledge.id,
    pledge.amount,
    pledge.message,
    pledge.created_at,
    profile.username,
    profile.display_name,
    profile.avatar_url
  from public.project_pledges pledge
  join public.projects project on project.id = pledge.project_id
  join public.profiles profile on profile.id = pledge.user_id
  where pledge.project_id = p_project
    and project.status <> 'removed'
  order by pledge.created_at desc, pledge.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

comment on function public.project_public_pledges(uuid, integer) is
  'Compromisos e identidad pública elegida para un proyecto visible; nunca retorna el UUID interno de la cuenta.';

create or replace function public.project_pledge_counts(p_projects uuid[])
returns table (project_id uuid, pledge_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if cardinality(coalesce(p_projects, '{}'::uuid[])) > 100 then
    raise exception 'AGORBIS_PROJECT_COUNT_LIMIT'
      using errcode = 'program_limit_exceeded';
  end if;

  return query
  with requested as (
    select distinct requested_id
    from unnest(coalesce(p_projects, '{}'::uuid[])) requested_id
    where requested_id is not null
  )
  select project.id, count(pledge.id)::bigint
  from requested
  join public.projects project on project.id = requested.requested_id
  left join public.project_pledges pledge on pledge.project_id = project.id
  where project.status <> 'removed'
  group by project.id;
end;
$$;

comment on function public.project_pledge_counts(uuid[]) is
  'Cantidad agregada de compromisos para hasta 100 proyectos visibles.';

revoke execute on function public.project_public_pledges(uuid, integer),
  public.project_pledge_counts(uuid[])
from public, anon, authenticated, service_role;
grant execute on function public.project_public_pledges(uuid, integer),
  public.project_pledge_counts(uuid[])
to anon, authenticated;
