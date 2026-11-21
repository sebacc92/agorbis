-- 0072 · Primer acuse institucional y campos del reclamo sellados.
-- Fixtures propias en el stack local; cada escritura termina en rollback.
begin;

create temporary table clock_fixture as
select gen_random_uuid() as claim_id, gen_random_uuid() as prior_claim_id,
  gen_random_uuid() as organization_id, gen_random_uuid() as other_organization_id,
  (select id from public.profiles where username = 'sofia_mdq') as author_id,
  (select id from public.profiles where username = 'elena_caba') as representative_id,
  (select id from public.communities where slug = 'argentina') as community_id;
grant select on clock_fixture to authenticated;

insert into public.organizations(id, community_id, name, slug, type, verified_at)
select organization_id, community_id, 'Prueba transaccional reloj',
  'clock-' || organization_id::text, 'government', now() from clock_fixture
union all
select other_organization_id, community_id, 'Otra institución transaccional',
  'clock-' || other_organization_id::text, 'government', now() from clock_fixture;
insert into public.organization_members(organization_id, user_id, role, verified_at)
select organization_id, representative_id, 'representative', now() from clock_fixture;
insert into public.claims(id, community_id, author_id, responsible_organization_id,
  title, description, category, first_response_at)
select claim_id, community_id, author_id, organization_id,
  'Primer acuse institucional', 'Fixture que termina en rollback.', 'infraestructura', null
from clock_fixture
union all
select prior_claim_id, community_id, author_id, organization_id,
  'Acuse institucional previo', 'Fixture que termina en rollback.', 'infraestructura', now() - interval '1 day'
from clock_fixture;

create function pg_temp.clock_as_rep()
returns void language plpgsql as $$
declare v_user uuid;
begin
  select representative_id into strict v_user from clock_fixture;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_user, 'role', 'authenticated', 'aal', 'aal1'
  )::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;
grant execute on function pg_temp.clock_as_rep() to authenticated;

do $$
declare f record; v_event uuid; v_failed boolean; v_initial timestamptz;
begin
  select * into strict f from clock_fixture;
  perform pg_temp.clock_as_rep();
  if not public.can_update_claim_as_org(auth.uid(), f.claim_id) then
    raise exception 'El fixture debe ser un representante válido y ajeno a la autoría';
  end if;
  v_event := public.add_claim_event_with_status(f.claim_id, f.organization_id::text,
    'official_response', 'Primer acuse verificado', 'Recibimos la documentación.', '', '', 'acknowledged');
  if not exists(select 1 from public.claim_events where id = v_event)
     or not exists(select 1 from public.claims where id = f.claim_id
       and first_response_at = transaction_timestamp() and status = 'acknowledged') then
    raise exception 'El primer evento autorizado debe persistir y detener el reloj';
  end if;

  select first_response_at into v_initial from public.claims where id = f.prior_claim_id;
  perform public.add_claim_event_with_status(f.prior_claim_id, f.organization_id::text,
    'official_response', 'Segundo acuse verificado', 'Ampliamos la respuesta.', '', '', '');
  if (select first_response_at from public.claims where id = f.prior_claim_id) is distinct from v_initial then
    raise exception 'Un segundo evento no debe reiniciar el primer acuse';
  end if;

  v_failed := false;
  if has_column_privilege('authenticated', 'public.claims', 'first_response_at', 'UPDATE') then
    raise exception 'El timestamp debe conservar su ACL sin UPDATE para authenticated';
  end if;
  begin
    update public.claims set first_response_at = now() where id = f.prior_claim_id;
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'No se debe conceder UPDATE del timestamp a authenticated'; end if;

  v_failed := false;
  begin
    perform public.add_claim_event_with_status(f.claim_id, f.other_organization_id::text,
      'official_response', 'Representación falsa', 'No autorizado.', '', '', '');
  exception when insufficient_privilege then v_failed := true;
  end;
  if not v_failed then raise exception 'Una organización ajena debe seguir rechazada'; end if;

  -- Emula una RPC con privilegio de tabla pero con la misma sesión: la guarda
  -- de profundidad 1 debe rechazar también escrituras manuales internas.
  perform set_config('role', 'postgres', true);
  v_failed := false;
  begin
    update public.claims set first_response_at = now() where id = f.prior_claim_id;
  exception when insufficient_privilege then
    if sqlerrm <> 'GEOUNITY_IMMUTABLE_CONTENT_FIELD' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'La guarda debe seguir rechazando el timestamp manual'; end if;
  v_failed := false;
  begin
    update public.claims set title = 'Reescritura institucional no autorizada' where id = f.claim_id;
  exception when insufficient_privilege then
    if sqlerrm <> 'GEOUNITY_IMMUTABLE_CONTENT_FIELD' then raise; end if;
    v_failed := true;
  end;
  if not v_failed then raise exception 'La guarda debe seguir sellando otras columnas'; end if;
  perform set_config('request.jwt.claims', '', true);
  raise notice 'OK: primer evento, reloj persistente, ACL manual, guarda manual, otras columnas y organización ajena';
end;
$$;

-- Una actualización anidada no es permiso para escribir otro campo junto con
-- el primer acuse. Este trigger existe sólo dentro del rollback del test.
create function pg_temp.clock_extra_field()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.claims set first_response_at = transaction_timestamp(),
    title = 'Reescritura anidada no autorizada'
  where id = new.claim_id;
  return new;
end;
$$;
create trigger aa_clock_extra_field after insert on public.claim_events
  for each row execute function pg_temp.clock_extra_field();

do $$
declare f record; v_claim uuid := gen_random_uuid(); v_failed boolean := false;
begin
  select * into strict f from clock_fixture;
  insert into public.claims(id, community_id, author_id, responsible_organization_id,
    title, description, category)
  values(v_claim, f.community_id, f.author_id, f.organization_id,
    'Reclamo sellado ante escritura anidada', 'Fixture que termina en rollback.', 'infraestructura');
  perform pg_temp.clock_as_rep();
  begin
    perform public.add_claim_event_with_status(v_claim, f.organization_id::text,
      'official_response', 'Intento anidado inválido', 'No debe persistir.', '', '', '');
  exception when raise_exception then
    if sqlerrm <> 'La institución responsable sólo puede actualizar el estado del reclamo' then raise; end if;
    v_failed := true;
  end;
  if not v_failed or exists(select 1 from public.claim_events where claim_id = v_claim)
     or not exists(select 1 from public.claims where id = v_claim
       and first_response_at is null and title = 'Reclamo sellado ante escritura anidada') then
    raise exception 'La excepción del reloj no debe admitir otros cambios anidados';
  end if;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  raise notice 'OK: una escritura anidada adicional revierte evento y timestamp';
end;
$$;

rollback;
