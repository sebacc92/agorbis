-- =============================================================================
-- Agorbis · 0031 · Privilegios de tabla explícitos
-- -----------------------------------------------------------------------------
-- Supabase cloud suele crear tablas con privilegios DML heredados de
-- `supabase_admin`, pero el CLI actual ejecuta las migraciones locales como
-- `postgres`, cuyo default ACL no concede SELECT/INSERT/UPDATE/DELETE. Sin este
-- bloque, PostgREST rechaza antes de llegar a RLS y las pruebas pueden confundir
-- "sin privilegio de tabla" con "policy correcta".
-- =============================================================================

do $$
declare
  v_table regclass;
begin
  for v_table in
    select c.oid::regclass
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relrowsecurity
      and c.relname not in (
        'ai_summaries',
        'ai_summary_generation_jobs',
        'ai_summary_generation_events'
      )
  loop
    execute format(
      'grant select, insert, update, delete on table %s to anon, authenticated',
      v_table
    );
  end loop;
end;
$$;

-- `service_role` es el backend confiable: los cron y la cache de IA necesitan
-- operar sobre tablas aun cuando no haya una policy para el navegador.
grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Las tres tablas de generación siguen siendo server-only aunque una migración
-- anterior o un entorno cloud hubiera heredado permisos más amplios.
revoke all privileges on table
  public.ai_summaries,
  public.ai_summary_generation_jobs,
  public.ai_summary_generation_events
from anon, authenticated;
