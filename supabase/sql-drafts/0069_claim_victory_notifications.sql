-- =============================================================================
-- ESTADO: BORRADOR LOCAL · NO APLICAR sin revisión separada
-- -----------------------------------------------------------------------------
-- Pendientes antes de promoverlo a supabase/migrations:
--  * usa `set search_path = public`; el estándar del repo es `set search_path = ''`
--    con nombres calificados (y CI corre `supabase db lint --fail-on warning`);
--  * reemplaza public.notify_claim_event sin revisar los avisos que 0046 ya emite
--    al resolver un reclamo (riesgo de notificaciones duplicadas);
--  * el título está hardcodeado en español, sin pasar por la localización de
--    textos de sistema;
--  * no trae test en supabase/tests.
-- =============================================================================

-- =============================================================================
-- Agorbis · 0069 · Notificaciones de Victoria y Logros Vecinales
-- -----------------------------------------------------------------------------
-- Cuando un reclamo se marca como resuelto (o se agrega un evento de tipo
-- resolution), se notifica de forma celebratoria y motivante a todos los vecinos
-- que lo apoyaron y a su autor ("🏆 ¡Victoria vecinal!").
-- =============================================================================

create or replace function public.notify_claim_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare 
  v_user uuid; 
  v_claim_title text;
  v_title text;
  v_body text;
  v_is_victory boolean;
begin
  select title into v_claim_title from public.claims where id = new.claim_id;
  v_is_victory := (new.event_type = 'resolution' or new.status = 'resolved');

  if v_is_victory then
    v_title := '🏆 ¡Victoria vecinal! Se resolvió un reclamo que apoyaste';
    v_body := coalesce(v_claim_title, 'Reclamo') || ' · Problema solucionado gracias al apoyo de los vecinos';
  else
    v_title := 'Hay una actualización en un reclamo que apoyás';
    v_body := coalesce(v_claim_title, 'Reclamo') || ' · ' || coalesce(new.title, 'Nueva novedad');
  end if;

  for v_user in 
    select user_id from public.claim_supports where claim_id = new.claim_id
    union 
    select author_id from public.claims where id = new.claim_id
  loop
    if v_user is not null and (new.actor_id is null or v_user <> new.actor_id) then
      perform public.create_notification(
        v_user, 
        new.actor_id, 
        'claim_update',
        v_title,
        v_body,
        '/reclamos/' || new.claim_id, 
        'claim', 
        new.claim_id,
        'claim-event:' || new.id || ':' || v_user
      );
    end if;
  end loop;
  return new;
end;
$$;
