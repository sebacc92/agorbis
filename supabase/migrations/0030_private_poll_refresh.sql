-- =============================================================================
-- Agorbis · 0030 · Actualización de encuestas sin señal pública por voto
-- -----------------------------------------------------------------------------
-- `poll_vote_events` permitía actualizar resultados con Realtime, pero también
-- publicaba ante `anon` el instante exacto de actividad de cualquier encuesta,
-- incluso cuando sus resultados todavía estaban reservados. El navegador pasa
-- a refrescar periódicamente los agregados mediante RPC, que conserva las
-- reglas de `results_visibility` ligadas a la sesión.
-- =============================================================================

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'poll_vote_events'
  ) then
    alter publication supabase_realtime drop table public.poll_vote_events;
  end if;
end;
$$;

drop trigger if exists poll_votes_emit_event on public.poll_votes;
drop function if exists public.emit_poll_vote_event();
drop table if exists public.poll_vote_events;
