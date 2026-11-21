-- =============================================================================
-- Agorbis · 0048 · Aviso de privacidad y derechos vigentes
-- -----------------------------------------------------------------------------
-- Publica una nueva versión obligatoria de Privacidad. El contenido asociado
-- explica el tally sin boletas individuales y sus límites frente al operador,
-- la membresía privada por defecto, los plazos de derechos, el canal AAIP, los
-- subencargados y la revisión de contenido que aún identifique a una persona.
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
  '2026-08-24',
  '4379ea850b2949f109fad334c0231abc9f1475c296ecf8f7543631f221564c05',
  timestamptz '2026-08-24 00:00:00+00',
  0,
  true
)
on conflict (document_type, version) do update
set content_hash = excluded.content_hash,
    effective_at = excluded.effective_at,
    minimum_age = excluded.minimum_age,
    is_current = excluded.is_current;
