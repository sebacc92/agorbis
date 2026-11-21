-- =============================================================================
-- Agorbis · 0049 · La aceptación legal exige una identidad autenticada
-- -----------------------------------------------------------------------------
-- Una aceptación persistida antes de verificar el correo puede quedar unida al
-- mismo auth.users cuando Supabase enlaza después una identidad OAuth con email
-- verificado. El alta ya no usa una RPC elevada: tras confirmar email/OAuth, la
-- persona completa accept_current_legal() con su propia sesión.
-- =============================================================================

revoke all on function public.record_signup_legal_acceptance(uuid, boolean)
  from public, anon, authenticated, service_role;

drop function public.record_signup_legal_acceptance(uuid, boolean);
