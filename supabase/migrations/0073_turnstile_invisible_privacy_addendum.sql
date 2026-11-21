-- =============================================================================
-- Agorbis · 0073 · Privacidad cita el anexo de Turnstile (modo invisible)
-- -----------------------------------------------------------------------------
-- Cloudflare condiciona el modo invisible de Turnstile a que la política de
-- privacidad del sitio cite su Turnstile Privacy Addendum. Esta versión de
-- Privacidad agrega ese párrafo y explica que el widget A no se ve en pantalla
-- (D109). Términos, Normas y el Aviso de transferencias no cambian.
--
-- El hash es SHA-256 de JSON.stringify(privacyContent), ver
-- scripts/check-legal.mjs. No crea aceptaciones ni backfillea consentimientos:
-- la aceptación de 2026-08-29.1 deja de ser actual y cada persona vuelve a
-- aceptar desde su sesión en /consentimiento.
-- =============================================================================

begin;

lock table public.legal_document_versions in share row exclusive mode;

do $migration_guard$
begin
  if (select count(*) from public.legal_document_versions where is_current) <> 3
     or not exists (
       select 1
       from public.legal_document_versions
       where document_type = 'privacy'
         and version = '2026-08-29.1'
         and content_hash = 'efdb395f293b7b1af31d6d79a2c70457a007279fe1d23a7b655dad4a997d039e'
         and is_current
     ) then
    raise exception 'AGORBIS_0073_PRIVACY_PRECONDITION_FAILED'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end;
$migration_guard$;

do $retire_privacy$
declare
  affected_rows integer;
begin
  update public.legal_document_versions
  set is_current = false
  where document_type = 'privacy'
    and version = '2026-08-29.1'
    and content_hash = 'efdb395f293b7b1af31d6d79a2c70457a007279fe1d23a7b655dad4a997d039e'
    and is_current;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'AGORBIS_0073_PRIVACY_RETIRE_ROWCOUNT_FAILED'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end;
$retire_privacy$;

insert into public.legal_document_versions (
  document_type,
  version,
  content_hash,
  effective_at,
  minimum_age,
  is_current
) values (
  'privacy',
  '2026-11-02.1',
  '24849a7cfbe666f8f03f24be54c702c4b402fd10dcdad12a482983c8c6c56807',
  timestamptz '2026-11-02 00:00:00+00',
  0,
  true
);

commit;
