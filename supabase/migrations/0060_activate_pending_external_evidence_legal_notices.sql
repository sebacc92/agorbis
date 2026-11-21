-- =============================================================================
-- Agorbis · 0060 · Activa avisos honestos de evidencia externa pendiente
-- -----------------------------------------------------------------------------
-- Versiona Privacidad y el Aviso de transferencias sin completar por inferencia
-- ubicaciones, países, retención, contratos ni salvaguardas. La revisión 0059
-- permanece fuera del ledger en migration-drafts y no se aplica aquí.
--
-- Esta migración no crea aceptaciones ni backfillea consentimientos. Las
-- aceptaciones de las versiones reemplazadas dejan de ser actuales.
-- =============================================================================

begin;

-- Evita que otro proceso cambie las filas versionadas entre el guard y los
-- retiros. La migración sigue siendo one-shot y falla ante cualquier drift.
lock table public.legal_document_versions,
  public.international_transfer_notice_versions
  in share row exclusive mode;

do $migration_guard$
begin
  if (select count(*) from public.legal_document_versions where is_current) <> 3
     or not exists (
       select 1
       from public.legal_document_versions
       where document_type = 'terms'
         and version = '2026-08-23'
         and content_hash = '6221c945577bdf3ea485dc254ed657e596a2e8e8cbd2b1e8a2ec8a0fee38cd2f'
         and effective_at = timestamptz '2026-08-23 00:00:00+00'
         and minimum_age = 18
         and is_current
     )
     or not exists (
       select 1
       from public.legal_document_versions
       where document_type = 'community_rules'
         and version = '2026-08-23'
         and content_hash = '225563ba3a5d2429448dd2a99e35a5f472fc00bcc5fe44ac6fd7172517285541'
         and effective_at = timestamptz '2026-08-23 00:00:00+00'
         and minimum_age = 0
         and is_current
     )
     or not exists (
       select 1
       from public.legal_document_versions
       where document_type = 'privacy'
         and version = '2026-08-25.1'
         and content_hash = '19826446051822fc347faaf114f1dc6f153b642c4e4706860e63bfb8373791af'
         and effective_at = timestamptz '2026-08-25 00:00:00+00'
         and minimum_age = 0
         and is_current
     )
     or (select count(*) from public.international_transfer_notice_versions where is_current) <> 1
     or not exists (
       select 1
       from public.international_transfer_notice_versions
       where version = '2026-08-25.1'
         and content_hash = '64bf705727ca0003f76f3d422402f42bff97dc433f138dc432f9678fae1c505a'
         and content_hash_algorithm = 'sha256-json-stringify-v1'
         and provider_register_version = '2026-08-25.1'
         and effective_at = timestamptz '2026-08-25 00:00:00+00'
         and is_current
         and superseded_at is null
     )
     or to_regclass('public.sensitive_participation_notice_versions') is not null
     or to_regclass('public.user_sensitive_participation_consents') is not null then
    raise exception 'AGORBIS_0060_LEGAL_HISTORY_PRECONDITION_FAILED'
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
    and version = '2026-08-25.1'
    and content_hash = '19826446051822fc347faaf114f1dc6f153b642c4e4706860e63bfb8373791af'
    and is_current;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'AGORBIS_0060_PRIVACY_RETIRE_ROWCOUNT_FAILED'
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
  '2026-08-29.1',
  'efdb395f293b7b1af31d6d79a2c70457a007279fe1d23a7b655dad4a997d039e',
  timestamptz '2026-08-29 00:00:00+00',
  0,
  true
);

do $retire_transfer_notice$
declare
  affected_rows integer;
begin
  update public.international_transfer_notice_versions
  set is_current = false,
      superseded_at = timestamptz '2026-08-29 00:00:00+00'
  where version = '2026-08-25.1'
    and content_hash = '64bf705727ca0003f76f3d422402f42bff97dc433f138dc432f9678fae1c505a'
    and is_current
    and superseded_at is null;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'AGORBIS_0060_TRANSFER_RETIRE_ROWCOUNT_FAILED'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end;
$retire_transfer_notice$;

insert into public.international_transfer_notice_versions (
  version,
  content_hash,
  content_snapshot,
  content_hash_algorithm,
  provider_register_version,
  effective_at,
  is_current
) values (
  '2026-08-29.1',
  '052a72a73375da6930313cbc9f2736f8b63f0ad321342b9fdd66f727a34a1baa',
  $transfer_notice$
  {"es":{"title":"Aviso de transferencias internacionales","summary":"Este aviso identifica las transferencias necesarias para una cuenta y distingue los datos conocidos de las ubicaciones, la retención y las salvaguardas que siguen pendientes de evidencia externa.","sections":[{"title":"Decisión que te pedimos","paragraphs":["Antes de iniciar el flujo de una nueva cuenta, Agorbis presenta una acción afirmativa separada de Términos, Privacidad, edad mínima y Normas comunitarias, y registra el resultado técnico junto con la versión del aviso.","La existencia de ese flujo o de una aceptación registrada no acredita por sí sola una base jurídica suficiente ni subsana la omisión de la revisión 0059 sobre consentimiento sensible. Mientras esa revisión siga omitida, Agorbis no debe describirse como jurídicamente conforme."]},{"title":"Destinatarios, datos y finalidades","bullets":["Supabase Pte. Ltd. presta base de datos, Auth y Storage y, para esas funciones, recibe las categorías de datos enviadas por la aplicación. Sus lugares completos de tratamiento y acceso permanecen pendientes de evidencia externa.","Plus Five Five, Inc., que opera como Resend, presta el envío de confirmaciones, enlaces de acceso, recuperación y avisos de seguridad. Sus lugares completos de tratamiento y acceso permanecen pendientes de evidencia externa.","Cloudflare, Inc. presta DNS, Workers y Turnstile A/B. Esas funciones pueden procesar solicitudes, respuestas y señales antiabuso; sus lugares completos de tratamiento y acceso permanecen pendientes de evidencia externa."]},{"title":"Destinos, retención y salvaguardas pendientes","paragraphs":["Agorbis todavía no cuenta con evidencia suficiente para publicar la lista completa y exacta de ubicaciones y países desde los que cada proveedor o subencargado trata o accede a datos. No se atribuye un destino por inferencia.","Los plazos de retención de proveedores, las obligaciones contractuales y el mecanismo argentino aplicable a estas transferencias siguen pendientes de evidencia y revisión. No se afirma que un DPA genérico, cláusulas extranjeras, cifrado, minimización o una aceptación posterior constituyan una salvaguarda suficiente."]},{"title":"Obligatoriedad y consecuencias","paragraphs":["Podés negarte y seguir leyendo el contenido público sin cuenta. La infraestructura actual no permite crear ni mantener una cuenta sin Supabase, Resend y Cloudflare, por lo que negarte impide el alta y las funciones autenticadas.","No se venden datos personales, no se usan para publicidad y el consentimiento de este aviso no incluye Google, analítica, inteligencia artificial ni otro tratamiento opcional futuro. Cualquiera de esos cambios requiere una decisión separada o una nueva versión cuando corresponda."]},{"title":"Retiro y derechos","paragraphs":["Podés solicitar la baja de la cuenta o escribir al contacto del responsable. La baja no se presenta como prueba de que cada proveedor haya detenido o eliminado inmediatamente todo tratamiento: el alcance y los plazos posteriores siguen pendientes de evidencia.","Antes de la baja podés exportar tus datos. También podés ejercer gratuitamente acceso, rectificación, actualización, supresión y confidencialidad ante el responsable, y presentar un reclamo ante la Agencia de Acceso a la Información Pública."]}]},"en":{"title":"International transfer notice","summary":"This notice identifies transfers needed for an account and distinguishes known information from locations, retention, and safeguards that remain pending external evidence.","sections":[{"title":"The decision we request","paragraphs":["Before starting a new-account flow, Agorbis presents an affirmative action separate from the Terms, Privacy, minimum age, and Community rules, and records the technical result with the notice version.","The existence of that flow or a recorded acceptance does not by itself prove a sufficient legal basis or cure the omission of sensitive-consent review 0059. While that review remains omitted, Agorbis must not be described as legally compliant."]},{"title":"Recipients, data, and purposes","bullets":["Supabase Pte. Ltd. provides database, Auth, and Storage services and receives the data categories sent by the application for those functions. Its complete processing and access locations remain pending external evidence.","Plus Five Five, Inc., doing business as Resend, sends confirmations, sign-in links, recovery messages, and security notices. Its complete processing and access locations remain pending external evidence.","Cloudflare, Inc. provides DNS, Workers, and Turnstile A/B. Those functions may process requests, responses, and abuse-prevention signals; its complete processing and access locations remain pending external evidence."]},{"title":"Destinations, retention, and safeguards pending evidence","paragraphs":["Agorbis does not yet have sufficient evidence to publish the complete and exact list of locations and countries from which each provider or subprocessor processes or accesses data. No destination is attributed by inference.","Provider retention periods, contractual duties, and the Argentine mechanism applicable to these transfers remain pending evidence and review. A generic DPA, foreign clauses, encryption, minimization, or later acceptance is not asserted to be a sufficient safeguard."]},{"title":"Required nature and consequences","paragraphs":["You may refuse and continue reading public content without an account. The current infrastructure cannot create or maintain an account without Supabase, Resend, and Cloudflare, so refusal prevents sign-up and authenticated features.","Personal data is not sold or used for advertising. Consent to this notice does not include Google, analytics, artificial intelligence, or any future optional processing. Any such change requires a separate choice or a new version when applicable."]},{"title":"Withdrawal and rights","paragraphs":["You may request account deletion or write to the controller contact. Deletion is not presented as proof that every provider immediately stopped or deleted all processing: the subsequent scope and periods remain pending evidence.","You may export your data before deletion. You may also exercise access, correction, update, deletion, and confidentiality rights free of charge with the controller and lodge a complaint with Argentina's Agency for Access to Public Information."]}]}}
  $transfer_notice$::jsonb,
  'sha256-json-stringify-v1',
  '2026-08-29.1',
  timestamptz '2026-08-29 00:00:00+00',
  true
);

commit;
