-- =============================================================================
-- Agorbis · 0055 · Transparencia sobre Turnstile A/B
-- -----------------------------------------------------------------------------
-- Publica una nueva versión obligatoria de Privacidad. El aviso distingue el
-- widget A que Cloudflare procesa en cinco formularios Auth del guard B que
-- sólo existe entre clientes públicos directos y Supabase Auth. B no se carga
-- ni genera un token durante una visita normal a Agorbis.
--
-- El hash es SHA-256 de JSON.stringify(privacyContent), ver
-- scripts/check-legal.mjs. Términos y Normas no cambiaron de versión.
-- =============================================================================

update public.legal_document_versions
set is_current = false
where document_type = 'privacy'
  and is_current;

insert into public.legal_document_versions (
  document_type,
  version,
  content_hash,
  effective_at,
  minimum_age,
  is_current
) values (
  'privacy',
  '2026-08-24.1',
  '5fb27c4ce61dd1c83f6a14229e3c65e4b912e1b82d876d7f9fc9e64e3bf4fa0b',
  timestamptz '2026-08-24 00:00:00+00',
  0,
  true
)
on conflict (document_type, version) do update
set content_hash = excluded.content_hash,
    effective_at = excluded.effective_at,
    minimum_age = excluded.minimum_age,
    is_current = excluded.is_current;
