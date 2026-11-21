-- =============================================================================
-- Agorbis · Resincronización 0011 (obsoleta desde 0047)
-- -----------------------------------------------------------------------------
-- Este archivo se conservaba para instalaciones antiguas que ya habían corrido
-- el seed previo a 0011. No debe ejecutarse sobre una base actual: 0047 migra
-- los votos existentes a recibos sin elección y tallies agregados, y cambia la
-- membresía a anónima por defecto de forma transaccional.
--
-- Si todavía existe `public.poll_votes`, aplicá las migraciones pendientes en
-- vez de intentar resincronizar flags de identidad que ya no forman parte del
-- producto.
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.poll_votes') is not null then
    raise exception
      'seed_resync_0011.sql quedó obsoleto: aplicá la migración 0047';
  end if;

  -- En el modelo actual una preferencia anónima se representa sin fila. Esto
  -- también limpia bases donde el seed histórico se aplicó después de 0047.
  delete from public.community_visibility where is_anonymous;

  raise notice
    'OK · 0047 ya gestiona privacidad de membresía y tallies agregados';
end;
$$;

commit;
