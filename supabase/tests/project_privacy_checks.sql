-- Agorbis · privacidad de aportes de proyecto.
begin;

do $$
declare v_rejected boolean := false;
begin
  if has_column_privilege(
    'anon', 'public.project_contributions', 'user_id', 'select'
  ) or has_column_privilege(
    'authenticated', 'public.project_contributions', 'user_id', 'select'
  ) then
    raise exception 'FALLÓ · user_id de aportes sigue público';
  end if;

  if not has_column_privilege(
    'anon', 'public.project_contributions', 'description', 'select'
  ) then
    raise exception 'FALLÓ · la ejecución pública perdió la descripción';
  end if;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform user_id from public.project_contributions limit 1;
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FALLÓ · anon pudo consultar user_id';
  end if;
end;
$$;

rollback;

-- Los compromisos muestran el perfil elegido por la persona, no el UUID
-- interno consultable de toda la tabla.
begin;

create or replace function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.as_user(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

grant execute on function pg_temp.as_owner(), pg_temp.as_user(uuid)
to anon, authenticated;

do $$
declare
  v_sofia uuid;
  v_diego uuid;
  v_community uuid;
  v_project uuid := gen_random_uuid();
  v_rejected boolean := false;
begin
  perform pg_temp.as_owner();
  select id into v_sofia from public.profiles where username = 'sofia_mdq';
  select id into v_diego from public.profiles where username = 'diego_mza';
  select id into v_community from public.communities limit 1;

  insert into public.projects (
    id, community_id, author_id, title, summary, plan, status
  ) values (
    v_project, v_community, v_sofia,
    'Proyecto privado de prueba', 'Resumen de prueba', 'Plan de prueba',
    'funding'
  );
  insert into public.project_pledges (project_id, user_id, amount, message)
  values
    (v_project, v_sofia, 100, 'Aporte Sofia'),
    (v_project, v_diego, 200, 'Aporte Diego');

  if pg_get_function_result(
    'public.project_public_pledges(uuid,integer)'::regprocedure
  ) ilike '%user_id%' then
    raise exception 'FALLÓ · la RPC pública declara user_id';
  end if;

  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  begin
    perform count(*) from public.project_pledges;
  exception when insufficient_privilege then
    v_rejected := true;
  end;
  if not v_rejected then
    raise exception 'FALLÓ · anon leyó project_pledges directamente';
  end if;
  if (select count(*) from public.project_public_pledges(v_project, 50)) <> 2
     or (select count(*) from public.project_pledge_counts(array[v_project])) <> 1
     or (select pledge_count from public.project_pledge_counts(array[v_project])) <> 2 then
    raise exception 'FALLÓ · las RPC públicas no entregan listado/conteo seguro';
  end if;

  perform pg_temp.as_user(v_sofia);
  if (select count(*) from public.project_pledges) <> 1
     or exists (
       select 1 from public.project_pledges where user_id <> v_sofia
     ) then
    raise exception 'FALLÓ · authenticated puede leer compromisos ajenos';
  end if;

  perform pg_temp.as_owner();
  update public.projects set status = 'removed' where id = v_project;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  if exists (select 1 from public.project_public_pledges(v_project, 50))
     or exists (select 1 from public.project_pledge_counts(array[v_project])) then
    raise exception 'FALLÓ · una RPC reveló un proyecto retirado';
  end if;
end;
$$;

rollback;
