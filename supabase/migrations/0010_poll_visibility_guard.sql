-- =============================================================================
-- Agorbis · 0010 · Una encuesta sin fecha de cierre no puede ocultar sus
--                   resultados "hasta que cierre"
-- -----------------------------------------------------------------------------
-- `results_visibility = 'after_close'` combinado con `closes_at is null` produce
-- una encuesta cuyos resultados **nunca** se pueden ver: `can_see_poll_results`
-- exige `status = 'closed'` o una fecha vencida, y sin fecha lo primero sólo
-- ocurre si alguien cierra la encuesta a mano. Hoy no hay interfaz para eso, así
-- que la combinación es una trampa: se publica una encuesta que nadie —ni el
-- autor— va a poder leer.
--
-- Se prohíbe en el motor y no sólo en el formulario, por el mismo motivo de
-- siempre (D6): una action se saltea llamando a PostgREST con el mismo token.
--
-- Si en el futuro se agrega "cerrar encuesta" a la UI, esta restricción se puede
-- levantar: la combinación pasaría a ser coherente.
-- =============================================================================

-- Normaliza lo que ya esté en ese estado antes de imponer la restricción.
-- `after_vote` es la opción más cercana a la intención original —esconder los
-- resultados hasta participar— y es además el default de la aplicación.
do $$
declare
  v_arregladas int;
begin
  update public.polls
     set results_visibility = 'after_vote'
   where results_visibility = 'after_close'
     and closes_at is null;

  get diagnostics v_arregladas = row_count;

  if v_arregladas > 0 then
    raise notice
      'AVISO · % encuesta(s) tenían resultados invisibles para siempre; pasaron a "after_vote"',
      v_arregladas;
  else
    raise notice 'OK · ninguna encuesta en el estado inconsistente';
  end if;
end;
$$;

alter table public.polls drop constraint if exists polls_after_close_needs_date;
alter table public.polls
  add constraint polls_after_close_needs_date
  check (results_visibility <> 'after_close' or closes_at is not null);

comment on constraint polls_after_close_needs_date on public.polls is
  'Sin fecha de cierre, "ver resultados al cerrar" los ocultaría para siempre.';
