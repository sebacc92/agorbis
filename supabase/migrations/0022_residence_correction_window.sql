-- =============================================================================
-- Agorbis · 0022 · Ventana segura para corregir la residencia
-- =============================================================================

begin;

-- Actividad territorial que hace definitiva la residencia elegida. Vive en
-- una función separada para que el trigger y la UI usen exactamente la misma
-- regla. SECURITY DEFINER permite revisar todas las tablas sin abrir su RLS.
create or replace function public.has_civic_activity_since(
  p_user uuid,
  p_since timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.poll_votes where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.debate_comments where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.comment_votes where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.claim_supports where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.project_pledges where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.project_comments where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.project_contributions where user_id = p_user and created_at >= p_since
    union all
    select 1 from public.polls where author_id = p_user and created_at >= p_since
    union all
    select 1 from public.debates where author_id = p_user and created_at >= p_since
    union all
    select 1 from public.claims where author_id = p_user and created_at >= p_since
    union all
    select 1 from public.projects where author_id = p_user and created_at >= p_since
  );
$$;

revoke all on function public.has_civic_activity_since(uuid, timestamptz)
  from public, anon, authenticated;

-- Consulta segura para que la pantalla explique si el cambio es una
-- corrección disponible o si realmente sigue bloqueado por 30 días.
create or replace function public.can_correct_residence(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.uid() = p.id
    and p.home_community_id is not null
    and p.residence_changed_at > now() - interval '24 hours'
    and not public.has_civic_activity_since(p.id, p.residence_changed_at),
    false
  )
  from public.profiles p
  where p.id = p_user;
$$;

revoke all on function public.can_correct_residence(uuid) from public, anon;
grant execute on function public.can_correct_residence(uuid) to authenticated;

-- La primera elección abre 24 horas para corregir un error. La ventana no se
-- reinicia con cada corrección: se conserva el timestamp original. En cuanto
-- hay participación cívica, o pasan 24 horas, vuelve a regir el cooldown.
create or replace function public.enforce_residence_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  correction_available boolean := false;
begin
  if new.home_community_id is distinct from old.home_community_id then
    if old.home_community_id is not null
       and old.residence_changed_at is not null
       and old.residence_changed_at > now() - interval '30 days' then
      correction_available :=
        old.residence_changed_at > now() - interval '24 hours'
        and not public.has_civic_activity_since(old.id, old.residence_changed_at);

      if not correction_available then
        raise exception 'Sólo podés cambiar tu residencia una vez cada 30 días. Vas a poder de nuevo el %',
          to_char(old.residence_changed_at + interval '30 days', 'DD/MM/YYYY')
          using errcode = 'check_violation';
      end if;
    end if;

    if correction_available then
      new.residence_changed_at := old.residence_changed_at;
    else
      new.residence_changed_at := now();
    end if;
  end if;
  return new;
end;
$$;

commit;
