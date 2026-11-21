-- =============================================================================
-- Agorbis · 0052 · Aportes no monetarios sin identidad pública implícita
-- -----------------------------------------------------------------------------
-- La descripción/cantidad de un aporte forman parte de la ejecución pública
-- del proyecto. Su `user_id` sólo hace falta para ownership, moderación,
-- exportación y baja; la interfaz pública no lo usa y PostgREST tampoco debe
-- ofrecerlo por accidente.
-- =============================================================================

revoke select on public.project_contributions from anon, authenticated;

grant select (
  id,
  project_id,
  kind,
  description,
  quantity,
  unit,
  status,
  created_at,
  updated_at
) on public.project_contributions to anon, authenticated;
