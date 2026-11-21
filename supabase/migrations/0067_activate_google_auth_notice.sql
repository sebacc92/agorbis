-- Agorbis · 0067 · Aviso opcional Google aprobado por el responsable.
-- Texto ES/EN autorizado en conversación; evidencia y alcance en:
-- docs/google-notice-owner-approval-2026-09-09.md
-- Sólo publica el aviso específico: NO acepta por usuarios, NO enlaza cuentas
-- y NO modifica el aviso general, la participación ni el acceso por correo.
begin;

do $guard$
begin
  if exists (select 1 from public.google_auth_notice_versions) then
    raise exception 'AGORBIS_GOOGLE_NOTICE_PREEXISTING'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
end;
$guard$;

insert into public.google_auth_notice_versions
  (provider, version, content_hash, content_hash_algorithm, content_snapshot,
   effective_at, approved_at, approval_reference, is_current)
values (
  'google',
  '2026-09-09.1',
  'b5a0485e6f2fb5c4d701b5a7e517fd1d03aca0fcd5aa60c083346a87946a35f3',
  'sha256-postgres-jsonb-v1',
  $google_auth_notice${
  "es": {
    "title": "Acceso opcional con Google",
    "summary": "Usar Google es opcional. Si lo elegís, Google y Supabase intervienen para identificarte y abrir tu cuenta o sesión. Este acceso implica tratamiento internacional: no contamos con una lista completa de países ni con todos los plazos de borrado confirmados. Leé los detalles antes de decidir. Podés continuar por correo sin aceptar Google.",
    "sections": [
      {
        "title": "Qué autorizás y para qué",
        "paragraphs": [
          "Elegís usar tu cuenta de Google para crear una cuenta en Agorbis o ingresar a una existente. Solicitamos datos de identidad, correo electrónico y perfil para autenticarte. Esto puede incluir un identificador de Google, tu correo y su estado de verificación, y datos de perfil como nombre o dirección de la foto cuando Google los proporcione. Estos permisos no autorizan a Agorbis a leer tus mensajes de Gmail, archivos de Drive ni contactos.",
          "Agorbis no copia automáticamente tu nombre ni tu foto de Google a tu perfil público. Elimina los tokens del proveedor de la sesión que conserva; esto no equivale a borrar la identidad o los datos de autenticación, ni los registros que Google o Supabase puedan conservar."
        ]
      },
      {
        "title": "Quiénes intervienen y dónde",
        "paragraphs": [
          "Agorbis, cuyo responsable y contacto figuran al final de este aviso, usa Google para comprobar tu identidad y Supabase para administrar la cuenta y la sesión. La infraestructura del sitio y sus servicios generales siguen descriptos en la Política de privacidad y el Aviso de transferencias internacionales de Agorbis.",
          "Google opera infraestructura global y puede procesar información fuera de tu país. Agorbis usa las condiciones estándar de Google OAuth y no tiene un acuerdo que limite su región de procesamiento.",
          "El proyecto de Supabase de Agorbis tiene su base principal en East US (Ohio), Estados Unidos, región us-east-2. El DPA de Supabase contempla procesamiento principal en la región elegida con excepciones. Esta ubicación no acredita todos los destinos de soporte, registros, copias y subencargados. No contamos con una lista completa confirmada para este acceso."
        ]
      },
      {
        "title": "Protecciones y límites de la información disponible",
        "paragraphs": [
          "Supabase confirmó que su DPA está incorporado a sus condiciones sin una firma separada. Agorbis todavía no ha acreditado que las garantías contractuales identificadas resuelvan todos los requisitos aplicables a estas transferencias desde Argentina. No presentamos la aceptación de este aviso como una certificación de cumplimiento ni como una aprobación de la AAIP.",
          "El tratamiento en otros países puede estar sujeto a reglas y vías de reclamo distintas de las argentinas. Sin información completa de destinos y conservación, no podemos describir con precisión todas sus consecuencias. Podés decidir no incorporar Google a tu acceso y usar el correo; esa alternativa también utiliza los servicios generales de Agorbis descriptos en los avisos correspondientes."
        ]
      },
      {
        "title": "Qué se registra y cuánto tiempo permanece",
        "paragraphs": [
          "Agorbis registra tu aceptación o retiro, fecha, cuenta y, cuando corresponde, la referencia al aviso; al aceptar también registra el idioma. Esto permite consultar tu decisión y comprobar qué versión aceptaste. La consulta y la exportación de tus datos están disponibles desde tu perfil.",
          "Google informa que conserva datos durante períodos distintos según el dato, su finalidad y tus ajustes. Agorbis no tiene confirmado un plazo único de eliminación para todo este acceso. Siguen pendientes los plazos completos de registros y copias administrados por los proveedores, y la conciliación de la conservación de Agorbis. No prometemos un borrado inmediato ni simultáneo de todos esos sistemas."
        ]
      },
      {
        "title": "Cómo retirar tu decisión o solicitar el borrado",
        "paragraphs": [
          "Podés consultar o retirar esta decisión en Perfil → Tu acceso con Google (/perfil/acceso-google). El retiro impide reutilizar esa decisión para nuevos accesos, pero mantiene abierta tu cuenta y la sesión actual. No elimina ni desvincula la identidad Google y no deshace el tratamiento anterior. Un retorno iniciado antes del retiro no permite registrar una nueva aceptación; volver a usar Google requiere iniciar otro acceso y decidir otra vez sobre el aviso vigente.",
          "El acceso por correo permanece disponible. Retirar esta decisión es distinto de eliminar tu cuenta o pedir el borrado: para eso consultá Eliminar cuenta y datos, en los enlaces de abajo, o escribí al contacto responsable. Las decisiones y datos de tu cuenta de Google se administran también desde Google."
        ]
      },
      {
        "title": "Documentos para consultar",
        "paragraphs": [
          "Política de Privacidad de Google: https://policies.google.com/privacy?hl=es",
          "DPA de Supabase: https://supabase.com/legal/customer-resources/data-processing-addendum",
          "Los enlaces al pie permiten consultar la Política de privacidad de Agorbis, el Aviso de transferencias internacionales y las instrucciones de eliminación. Tu decisión sobre Google no sustituye las decisiones generales de tu cuenta."
        ]
      }
    ]
  },
  "en": {
    "title": "Optional Google sign-in",
    "summary": "Using Google is optional. If you choose it, Google and Supabase help identify you and open your account or session. This involves international processing: we do not have a complete country list or all confirmed deletion periods. Read the details before deciding. You can continue by email without accepting Google.",
    "sections": [
      {
        "title": "What you authorize and why",
        "paragraphs": [
          "You choose to use your Google account to create an Agorbis account or sign in to an existing one. We request identity, email and profile information to authenticate you. This may include a Google identifier, your email and its verification status, and profile details such as your name or picture URL when Google provides them. These permissions do not authorize Agorbis to read your Gmail messages, Drive files or contacts.",
          "Agorbis does not automatically copy your Google name or photo to your public profile. It removes provider tokens from the session it retains; this does not delete your identity or authentication data, or records Google or Supabase may retain."
        ]
      },
      {
        "title": "Who is involved and where",
        "paragraphs": [
          "Agorbis, whose controller and contact details appear below, uses Google to verify your identity and Supabase to manage your account and session. The website infrastructure and general services remain described in Agorbis's Privacy Policy and International Transfers Notice.",
          "Google operates global infrastructure and may process information outside your country. Agorbis uses standard Google OAuth terms and has no agreement restricting its processing region.",
          "Agorbis's Supabase project has its primary database in East US (Ohio), United States, region us-east-2. Supabase's DPA provides for primary processing in the selected region, with exceptions. This location does not establish every destination used for support, logs, backups and subprocessors. We do not have a complete confirmed list for this sign-in."
        ]
      },
      {
        "title": "Protections and limits of available information",
        "paragraphs": [
          "Supabase confirmed that its DPA is incorporated into its terms without a separate signature. Agorbis has not yet established that the identified contractual safeguards address all requirements applicable to these transfers from Argentina. We do not present acceptance of this notice as certification of compliance or approval by the AAIP.",
          "Processing in other countries may be subject to rules and complaint procedures that differ from Argentina's. Without complete destination and retention information, we cannot describe all consequences precisely. You may choose email instead of adding Google to your sign-in; email also uses Agorbis's general services described in the corresponding notices."
        ]
      },
      {
        "title": "What is recorded and how long it remains",
        "paragraphs": [
          "Agorbis records your acceptance or withdrawal, date, account and, where applicable, notice reference; acceptance also records the language. This lets you consult your decision and verify which version you accepted. You can view and export your data from your profile.",
          "Google states that retention periods vary by data, purpose and your settings. Agorbis has no confirmed single deletion period covering this entire sign-in. Full periods for provider-managed logs and backups, and reconciliation of Agorbis's retention policy, remain pending. We do not promise immediate or simultaneous deletion across all those systems."
        ]
      },
      {
        "title": "How to withdraw your decision or request deletion",
        "paragraphs": [
          "You can view or withdraw this decision at Profile → Your Google sign-in (/perfil/acceso-google). Withdrawal prevents this decision from being reused for new sign-ins, while keeping your account and current session open. It does not delete or unlink the Google identity or undo previous processing. A return started before withdrawal cannot record a new acceptance; using Google again requires starting another sign-in and deciding again on the current notice.",
          "Email sign-in remains available. Withdrawing this decision differs from deleting your account or requesting erasure: consult Delete account and data in the links below, or write to the controller contact. You can also manage your Google account decisions and data through Google."
        ]
      },
      {
        "title": "Documents to consult",
        "paragraphs": [
          "Google Privacy Policy: https://policies.google.com/privacy?hl=en",
          "Supabase DPA: https://supabase.com/legal/customer-resources/data-processing-addendum",
          "The links below provide Agorbis's Privacy Policy, International Transfers Notice and deletion instructions. Your Google decision does not replace your account's general decisions."
        ]
      }
    ]
  }
}
$google_auth_notice$::jsonb,
  '2026-09-09T03:54:54.000Z'::timestamptz,
  '2026-09-09T03:54:54.000Z'::timestamptz,
  'docs/google-notice-owner-approval-2026-09-09.md',
  true
);

commit;
