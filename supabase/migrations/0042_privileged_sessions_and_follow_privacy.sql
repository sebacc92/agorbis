-- =============================================================================
-- Agorbis · 0042 · Factores privilegiados y follows privados
-- =============================================================================

begin;

-- Un AAL2 cualquiera no alcanza para moderar: una sesión robada AAL1 puede
-- llamar directamente al endpoint de enrollment de GoTrue y registrar un TOTP
-- sin pasar por nuestra UI. Sólo factores aprobados por el step-up server-side
-- (contraseña actual + factor exacto) habilitan privilegios cívicos.
create table if not exists private.privileged_mfa_factors (
  factor_id uuid primary key
    references auth.mfa_factors(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  approved_at timestamptz not null default statement_timestamp()
);

create index if not exists privileged_mfa_factors_user_idx
  on private.privileged_mfa_factors (user_id, factor_id);

create table if not exists private.mfa_enrollment_tickets (
  factor_id uuid primary key
    references auth.mfa_factors(id) on delete cascade,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  constraint mfa_enrollment_tickets_future_chk
    check (expires_at > created_at)
);

create index if not exists mfa_enrollment_tickets_expiry_idx
  on private.mfa_enrollment_tickets (expires_at);

revoke all on private.privileged_mfa_factors,
  private.mfa_enrollment_tickets
from public, anon, authenticated, service_role;

-- Sólo el backend con service_role puede ligar el factor recién creado a una
-- comprobación primaria. El ticket dura cinco minutos y nombra el factor
-- exacto: otro enrollment concurrente no puede consumirlo.
create or replace function public.authorize_mfa_enrollment(
  p_user uuid,
  p_factor uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;

  delete from private.mfa_enrollment_tickets t
  where t.expires_at <= statement_timestamp();

  if not exists (
    select 1
    from auth.mfa_factors f
    where f.id = p_factor
      and f.user_id = p_user
      and f.factor_type::text = 'totp'
      and f.status::text = 'unverified'
  ) then
    return false;
  end if;

  insert into private.mfa_enrollment_tickets (
    factor_id, user_id, created_at, expires_at
  ) values (
    p_factor, p_user, statement_timestamp(),
    statement_timestamp() + interval '5 minutes'
  )
  on conflict (factor_id) do update
    set user_id = excluded.user_id,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at;
  return true;
end;
$$;

-- Se consume después de que GoTrue verificó el TOTP. Ningún factor creado por
-- una llamada directa al SDK tiene ticket y, por lo tanto, no puede convertirse
-- en credencial de moderación aunque obtenga un JWT AAL2 válido.
create or replace function public.approve_mfa_enrollment(
  p_user uuid,
  p_factor uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_authorized uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'AGORBIS_SERVICE_ROLE_REQUIRED'
      using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1
    from auth.mfa_factors f
    where f.id = p_factor
      and f.user_id = p_user
      and f.factor_type::text = 'totp'
      and f.status::text = 'verified'
    for update
  ) then
    return false;
  end if;

  delete from private.mfa_enrollment_tickets t
  where t.factor_id = p_factor
    and t.user_id = p_user
    and t.expires_at > statement_timestamp()
  returning t.factor_id into v_authorized;
  if v_authorized is null then
    return false;
  end if;

  insert into private.privileged_mfa_factors (factor_id, user_id)
  values (p_factor, p_user)
  on conflict (factor_id) do update
    set user_id = excluded.user_id,
        approved_at = statement_timestamp();
  return true;
end;
$$;

-- Reemplaza el helper de 0039: además de rol y AAL2, la sesión debe estar
-- respaldada por el mismo factor aprobado. Comparar session_id como texto evita
-- que un claim inesperado provoque un cast UUID antes de fallar cerrado.
create or replace function public.current_session_uses_approved_factor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null
    and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    and exists (
      select 1
      from auth.sessions s
      join private.privileged_mfa_factors approved
        on approved.factor_id = s.factor_id
       and approved.user_id = s.user_id
      where s.id::text = auth.jwt() ->> 'session_id'
        and s.user_id = auth.uid()
        and s.aal::text = 'aal2'
    ),
    false
  );
$$;

create or replace function private.session_is_moderator(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user is not null
    and p_user is not distinct from auth.uid()
    and private.raw_is_moderator(p_user)
    and public.current_session_uses_approved_factor(),
    false
  );
$$;

create or replace function public.is_admin(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user is not distinct from auth.uid()
    and private.session_is_moderator(p_user)
    and exists (
      select 1 from public.profiles p
      where p.id = p_user and p.role = 'admin'
    ),
    false
  );
$$;

-- Una promoción no puede crear una ventana de moderación sin credenciales
-- preparadas. Esto también exige un correo confirmado y contraseña propia;
-- OAuth-only debe definirla antes de recibir el rol.
create or replace function private.guard_privileged_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role in ('moderator', 'admin')
     and (tg_op = 'INSERT' or new.role is distinct from old.role)
     and not (
       exists (
         select 1
         from private.privileged_mfa_factors approved
         join auth.mfa_factors f on f.id = approved.factor_id
         where approved.user_id = new.id
           and f.user_id = new.id
           and f.factor_type::text = 'totp'
           and f.status::text = 'verified'
       )
       and exists (
         select 1
         from auth.users u
         where u.id = new.id
           and u.email_confirmed_at is not null
           and nullif(u.encrypted_password, '') is not null
       )
     ) then
    raise exception 'AGORBIS_PRIVILEGED_MFA_REQUIRED'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  return new;
end;
$$;

drop trigger if exists aa_profiles_privileged_role on public.profiles;
create trigger aa_profiles_privileged_role
  before insert or update of role on public.profiles
  for each row execute function private.guard_privileged_role_assignment();

-- Seguir comunidades revela residencia e intereses. Los agregados públicos ya
-- salen por funciones específicas; la relación cruda pertenece sólo a la
-- persona y a una sesión moderadora AAL2 aprobada.
drop policy if exists follows_select_all on public.follows;
drop policy if exists follows_select_own_or_moderator on public.follows;
create policy follows_select_own_or_moderator
  on public.follows for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_moderator(auth.uid())
  );

revoke execute on function public.authorize_mfa_enrollment(uuid, uuid),
  public.approve_mfa_enrollment(uuid, uuid)
from public, anon, authenticated, service_role;
grant execute on function public.authorize_mfa_enrollment(uuid, uuid),
  public.approve_mfa_enrollment(uuid, uuid)
to service_role;

revoke execute on function public.current_session_uses_approved_factor()
from public, anon, authenticated, service_role;
grant execute on function public.current_session_uses_approved_factor()
to authenticated;

revoke execute on function private.guard_privileged_role_assignment()
from public, anon, authenticated, service_role;

commit;
