-- =============================================================================
-- Agorbis · 0058 · Corrige entidades y topología de proveedores
-- -----------------------------------------------------------------------------
-- Versiona los disclosures públicos: Supabase Pte. Ltd., Resend y Cloudflare
-- DNS autoritativo + Workers Edge Compute global como reverse proxy HTTP +
-- Turnstile A/B. No declara como cumplidas salvaguardas ni destinos que siguen
-- sujetos a confirmación.
-- =============================================================================

begin;

do $migration_guard$
begin
  if (select count(*) from public.legal_document_versions where is_current) <> 3
     or not exists (
       select 1
       from public.legal_document_versions
       where document_type = 'privacy'
         and version = '2026-08-24.2'
         and is_current
     )
     or (select count(*) from public.international_transfer_notice_versions where is_current) <> 1
     or not exists (
       select 1
       from public.international_transfer_notice_versions
       where version = '2026-08-24.1'
         and is_current
         and superseded_at is null
     ) then
    raise exception 'AGORBIS_0058_LEGAL_HISTORY_PRECONDITION_FAILED'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end;
$migration_guard$;

update public.legal_document_versions
set is_current = false
where document_type = 'privacy'
  and version = '2026-08-24.2'
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
  '2026-08-25.1',
  '19826446051822fc347faaf114f1dc6f153b642c4e4706860e63bfb8373791af',
  timestamptz '2026-08-25 00:00:00+00',
  0,
  true
);

update public.international_transfer_notice_versions
set is_current = false,
    superseded_at = timestamptz '2026-08-25 00:00:00+00'
where version = '2026-08-24.1'
  and is_current
  and superseded_at is null;

insert into public.international_transfer_notice_versions (
  version,
  content_hash,
  content_snapshot,
  content_hash_algorithm,
  provider_register_version,
  effective_at,
  is_current
) values (
  '2026-08-25.1',
  '64bf705727ca0003f76f3d422402f42bff97dc433f138dc432f9678fae1c505a',
  $transfer_notice$
  {"es":{"title":"Aviso de transferencias internacionales","summary":"Describe las transferencias internacionales necesarias para crear y operar una cuenta, sus destinatarios, riesgos, salvaguardas y cómo retirar el consentimiento.","sections":[{"title":"Decisión que te pedimos","paragraphs":["Antes de enviar los datos de una nueva cuenta, Agorbis solicita una acción afirmativa separada, previa, expresa e informada. Este aviso no se combina con la aceptación de Términos, la lectura de Privacidad, la edad mínima ni las Normas comunitarias.","El consentimiento alcanza solamente a las transferencias de cuenta que ocurren después de marcar la casilla. No pretende autorizar retroactivamente la entrega inicial de este sitio ni reemplaza el mecanismo separado que debe cubrir el acceso, la recuperación, la seguridad y el ejercicio de derechos."]},{"title":"Destinatarios, datos y finalidades","bullets":["Supabase Pte. Ltd.: recibe correo, credenciales protegidas, identificadores de autenticación, perfil, residencia declarada, contenido, actividad, archivos y metadatos de seguridad para prestar base de datos, Auth y Storage. El proyecto principal está en AWS us-east-2, Ohio, Estados Unidos; servicios auxiliares y subencargados pueden operar en otros destinos publicados en el registro.","Plus Five Five, Inc., que opera como Resend: recibe el correo destinatario y el contenido y metadatos mínimos de confirmaciones, enlaces de acceso, recuperación y avisos de seguridad. Su tratamiento principal se realiza en Estados Unidos.","Cloudflare, Inc.: presta DNS autoritativo, aloja, ejecuta y entrega Agorbis mediante Workers Edge Compute en su red global y actúa como reverse proxy HTTP. Procesa solicitudes y respuestas, incluidas dirección IP, URL, encabezados, cookies de sesión, formularios, archivos, contenido cívico y registros operativos necesarios para prestar y proteger el servicio. También presta Turnstile A/B: A evalúa señales del navegador o dispositivo y el resultado del desafío en los formularios indicados; B protege directamente Supabase Auth y no se carga en una visita normal."]},{"title":"Destinos, riesgos y salvaguardas","paragraphs":["Estados Unidos no integra actualmente la lista de países con legislación adecuada reconocida por la AAIP. Los proveedores o sus subencargados también pueden tratar datos en los demás destinos identificados en el Registro de subencargados vigente.","Las transferencias quedan expuestas a leyes extranjeras distintas de las argentinas, solicitudes válidas de autoridades extranjeras, transferencias ulteriores autorizadas y mayores dificultades prácticas para ejercer derechos. Los DPA, la minimización, los controles de acceso, el cifrado en tránsito, la retención limitada y las demás medidas publicadas reducen esos riesgos, pero no garantizan riesgo cero ni sustituyen por sí solos una base argentina válida."]},{"title":"Obligatoriedad y consecuencias","paragraphs":["Podés negarte y seguir leyendo el contenido público sin cuenta. La infraestructura actual no permite crear ni mantener una cuenta sin Supabase, Resend y Cloudflare, por lo que negarte impide el alta y las funciones autenticadas.","No se venden datos personales, no se usan para publicidad y el consentimiento de este aviso no incluye Google, analítica, inteligencia artificial ni otro tratamiento opcional futuro. Cualquiera de esos cambios requiere una decisión separada o una nueva versión cuando corresponda."]},{"title":"Retiro y derechos","paragraphs":["Podés retirar este consentimiento en cualquier momento desde la baja de cuenta o escribiendo al contacto del responsable. El retiro no tiene efecto retroactivo: detiene las transferencias futuras basadas en él y, como la cuenta no puede operar sin estos proveedores, inicia su desactivación y eliminación. Sólo se conserva lo exigido por ley o necesario para ejercer o defender derechos, con acceso restringido y por el plazo informado.","Antes de la baja podés exportar tus datos. También podés ejercer gratuitamente acceso, rectificación, actualización, supresión y confidencialidad ante el responsable, y presentar un reclamo ante la Agencia de Acceso a la Información Pública."]}]},"en":{"title":"International transfer notice","summary":"This notice describes the international transfers required to create and operate an account, their recipients, risks, safeguards, and how to withdraw consent.","sections":[{"title":"The decision we request","paragraphs":["Before sending new-account data, Agorbis requests a separate, prior, express, and informed affirmative action. This notice is not combined with acceptance of the Terms, acknowledgement of Privacy, minimum age, or Community rules.","Consent covers only account transfers that occur after you select the checkbox. It does not purport to retroactively authorize initial delivery of this website or replace the separate mechanism that must cover access, recovery, security, and exercise of rights."]},{"title":"Recipients, data, and purposes","bullets":["Supabase Pte. Ltd. receives email, protected credentials, authentication identifiers, profile, declared residence, content, activity, files, and security metadata to provide its database, Auth, and Storage services. The primary project is in AWS us-east-2, Ohio, United States; auxiliary services and subprocessors may operate in other destinations published in the register.","Plus Five Five, Inc., doing business as Resend, receives the recipient email and the minimum content and metadata needed for confirmations, sign-in links, recovery, and security notices. Its primary processing takes place in the United States.","Cloudflare, Inc. provides authoritative DNS, hosts, executes, and delivers Agorbis through Workers Edge Compute on its global network, and acts as an HTTP reverse proxy. It processes requests and responses, including the IP address, URL, headers, session cookies, forms, files, civic content, and operational logs needed to provide and protect the service. It also provides Turnstile A/B: A evaluates browser or device signals and the challenge result on the listed forms; B protects Supabase Auth directly and is not loaded during an ordinary visit."]},{"title":"Destinations, risks, and safeguards","paragraphs":["The United States is not currently on the AAIP list of countries recognized as having adequate legislation. Providers or their subprocessors may also process data in the other destinations identified in the current Subprocessor register.","Transfers are exposed to foreign laws that differ from Argentine law, valid requests from foreign authorities, authorized onward transfers, and greater practical difficulty exercising rights. DPAs, minimization, access controls, encryption in transit, limited retention, and the other published measures reduce those risks but do not guarantee zero risk or by themselves replace a valid Argentine basis."]},{"title":"Required nature and consequences","paragraphs":["You may refuse and continue reading public content without an account. The current infrastructure cannot create or maintain an account without Supabase, Resend, and Cloudflare, so refusal prevents sign-up and authenticated features.","Personal data is not sold or used for advertising. Consent to this notice does not include Google, analytics, artificial intelligence, or any future optional processing. Any such change requires a separate choice or a new version when applicable."]},{"title":"Withdrawal and rights","paragraphs":["You may withdraw consent at any time through account deletion or by writing to the controller contact. Withdrawal has no retroactive effect: it stops future transfers based on consent and, because the account cannot operate without these providers, starts deactivation and deletion. Only information required by law or needed to exercise or defend rights is retained, with restricted access and for the disclosed period.","You may export your data before deletion. You may also exercise access, correction, update, deletion, and confidentiality rights free of charge with the controller and lodge a complaint with Argentina's Agency for Access to Public Information."]}]}}
  $transfer_notice$::jsonb,
  'sha256-json-stringify-v1',
  '2026-08-25.1',
  timestamptz '2026-08-25 00:00:00+00',
  true
);

commit;
