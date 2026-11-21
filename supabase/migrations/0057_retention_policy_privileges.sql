-- =============================================================================
-- Agorbis · 0057 · Privilegios mínimos para políticas de retención
-- -----------------------------------------------------------------------------
-- Supabase Cloud puede conceder DML a `authenticated` mediante sus privilegios
-- por defecto cuando una tabla se crea después de la matriz explícita de 0031.
-- Este catálogo es público sólo para lectura; toda escritura queda reservada al
-- backend confiable.
-- =============================================================================

begin;

revoke all privileges on table public.data_retention_policies
from anon, authenticated;

grant select on table public.data_retention_policies
to anon, authenticated;

grant all privileges on table public.data_retention_policies
to service_role;

-- Estas funciones invoker usan referencias calificadas, pero fijar igualmente
-- el path elimina cualquier dependencia de la configuración de sesión y cierra
-- los avisos de seguridad del catálogo de Supabase.
alter function public.touch_updated_at_visibility()
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.community_ancestors(uuid)
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.community_descendant_count(uuid)
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.adjust_member_counts(uuid, integer)
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.touch_updated_at()
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.debate_column_comments(uuid, integer)
  set search_path = pg_catalog, public, extensions, pg_temp;
alter function public.debate_column_counts(uuid)
  set search_path = pg_catalog, public, extensions, pg_temp;

commit;
