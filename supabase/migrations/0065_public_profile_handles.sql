-- URLs públicas legibles sin ampliar los cuatro campos del perfil público.
-- Las reservas impiden que un enlace histórico termine en otra persona.
begin;

create table private.public_profile_handles (
  handle_hash bytea primary key check (octet_length(handle_hash) = 32),
  user_id uuid references public.profiles(id) on delete set null
);

comment on table private.public_profile_handles is
  'Reserva privada de alias públicos por SHA-256. Al borrar la cuenta sólo queda la reserva sin user_id, no un perfil ni un redireccionamiento. El hash puede contrastarse con nombres conocidos: no es una promesa de anonimización irreversible.';

create index public_profile_handles_user_idx
  on private.public_profile_handles(user_id) where user_id is not null;
alter table private.public_profile_handles enable row level security;
revoke all on private.public_profile_handles
  from public, anon, authenticated, service_role;

-- Mantiene el backfill y la instalación del trigger en la misma instantánea
-- de escrituras: no se pierde un alias por un alta/renombre concurrente.
lock table public.profiles in share row exclusive mode;

insert into private.public_profile_handles(handle_hash, user_id)
select pg_catalog.sha256(pg_catalog.convert_to(username, 'UTF8')), id
from public.profiles;

create function private.reserve_public_profile_handle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.public_profile_handles as reserved(handle_hash, user_id)
  values (pg_catalog.sha256(pg_catalog.convert_to(new.username, 'UTF8')), new.id)
  on conflict (handle_hash) do update set user_id = excluded.user_id
    where reserved.user_id = excluded.user_id;
  if not found then
    raise exception 'Ese nombre de usuario ya está tomado.'
      using errcode = 'unique_violation';
  end if;
  return new;
end;
$$;

-- AFTER INSERT permite que la FK ya encuentre el perfil recién creado.
create trigger profiles_reserve_public_handle
  after insert or update of username on public.profiles
  for each row execute function private.reserve_public_profile_handle();
revoke all on function private.reserve_public_profile_handle()
  from public, anon, authenticated, service_role;

create function public.public_profile_by_username(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from private.public_profile_handles h
  join public.profiles p on p.id = h.user_id
  where char_length(p_username) <= 100
    and lower(btrim(p_username)) ~ '^[a-z0-9_]{3,20}$'
    and h.handle_hash = pg_catalog.sha256(
      pg_catalog.convert_to(lower(btrim(p_username)), 'UTF8')
    );
$$;
revoke all on function public.public_profile_by_username(text)
  from public, anon, authenticated, service_role;
grant execute on function public.public_profile_by_username(text)
  to anon, authenticated;
comment on function public.public_profile_by_username(text) is
  'Resuelve un alias actual o histórico a los mismos cuatro campos que public_profile(uuid). Las reservas de cuentas eliminadas no devuelven filas.';

-- Una metadata OAuth antigua puede proponer un alias ahora reservado. Como
-- con un nombre actualmente ocupado, se crea el placeholder del onboarding.
-- Se reintenta también la carrera entre altas/cambios simultáneos de nombre.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
  v_attempt integer;
begin
  v_username := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if v_username !~ '^[a-z0-9_]{3,20}$'
     or exists (
       select 1 from private.public_profile_handles h
       where h.handle_hash = pg_catalog.sha256(
         pg_catalog.convert_to(v_username, 'UTF8')
       )
     ) then
    v_username := 'user_' || left(replace(new.id::text, '-', ''), 12);
  end if;

  for v_attempt in 1..5 loop
    begin
      insert into public.profiles(id, username, display_name)
      values (
        new.id, v_username,
        nullif(new.raw_user_meta_data ->> 'display_name', '')
      ) on conflict (id) do nothing;
      return new;
    exception when unique_violation then
      if v_attempt = 5 then raise; end if;
      v_username := 'user_' || left(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 12);
    end;
  end loop;
  return new;
end;
$$;
revoke all on function public.handle_new_user()
  from public, anon, authenticated, service_role;

commit;
