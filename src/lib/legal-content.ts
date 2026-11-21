import type { Locale } from "./i18n-core";

export interface LegalSection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface LegalDocumentContent {
  title: string;
  summary: string;
  sections: LegalSection[];
}

export interface AaipDatabaseRegistrationStatusContent {
  pendingMessage: string;
  approvedLabel: string;
}

export const aaipDatabaseRegistrationStatusContent: Record<
  Locale,
  AaipDatabaseRegistrationStatusContent
> = {
  es: {
    pendingMessage:
      "Inscripción de la base ante la AAIP: en trámite. Aún no se cuenta con una constancia aprobada ni con un número de registro de la base. El código del responsable y las referencias del trámite no sustituyen ese número.",
    approvedLabel: "Número de registro de la base ante la AAIP",
  },
  en: {
    pendingMessage:
      "AAIP database registration: pending. No approved registration certificate or database registration number is currently available. Controller and filing references do not replace that number.",
    approvedLabel: "AAIP database registration number",
  },
};

export interface ExternalEvidenceStatusContent {
  registerSummaryPending: string;
  registerWarning: string;
  pendingLabel: string;
  processingLocationPending: string;
  transferSafeguardsPending: string;
  providerRetentionPending: string;
}

/**
 * Copy no versionado para representar ausencia de evidencia. Nunca se inyecta
 * en las variables que describen hechos confirmados de proveedores.
 */
export const externalEvidenceStatusContent: Record<
  Locale,
  ExternalEvidenceStatusContent
> = {
  es: {
    registerSummaryPending:
      "Este registro identifica los proveedores conocidos y distingue los datos confirmados de los campos que siguen pendientes de evidencia externa.",
    registerWarning:
      "Los campos marcados como pendientes no están confirmados ni jurídicamente aprobados. Agorbis no completa países, contratos, plazos o salvaguardas por inferencia.",
    pendingLabel: "Pendiente de evidencia externa",
    processingLocationPending:
      "Agorbis todavía no cuenta con evidencia suficiente para publicar la lista completa y exacta de lugares de tratamiento y acceso aplicables a este proveedor.",
    transferSafeguardsPending:
      "El mecanismo argentino aplicable al primer request y a otros flujos sin una decisión previa vigente permanece pendiente de acreditación. No se presenta un DPA genérico, cláusulas extranjeras ni el consentimiento posterior como sustituto.",
    providerRetentionPending:
      "Los plazos y mecanismos de eliminación de los proveedores, incluidos logs, correo, backups y cachés, permanecen pendientes de evidencia contractual y de la configuración efectiva. No se afirma un plazo común.",
  },
  en: {
    registerSummaryPending:
      "This register identifies the known providers and distinguishes confirmed information from fields that remain pending external evidence.",
    registerWarning:
      "Fields marked as pending are neither confirmed nor legally approved. Agorbis does not infer countries, contracts, periods, or safeguards.",
    pendingLabel: "Pending external evidence",
    processingLocationPending:
      "Agorbis does not yet have sufficient evidence to publish the complete and exact list of processing and access locations applicable to this provider.",
    transferSafeguardsPending:
      "The Argentine mechanism applicable to the first request and other flows without a current prior decision remains pending evidence. A generic DPA, foreign clauses, and later consent are not presented as substitutes.",
    providerRetentionPending:
      "Provider retention periods and deletion mechanisms, including logs, email, backups, and caches, remain pending contractual evidence and effective-configuration verification. No common period is asserted.",
  },
};

export const privacyContent: Record<Locale, LegalDocumentContent> = {
  es: {
    title: "Política de privacidad",
    summary:
      "Explica qué datos trata Agorbis, para qué los usa, qué se hace público y cómo ejercer tus derechos.",
    sections: [
      {
        title: "Responsable y alcance",
        paragraphs: [
          "El responsable indicado al final de esta página administra Agorbis. Esta política alcanza al sitio, sus comunidades, publicaciones, votaciones, archivos y comunicaciones relacionadas.",
          "Agorbis es una plataforma cívica independiente. No reemplaza trámites, denuncias ni canales oficiales de organismos públicos.",
        ],
      },
      {
        title: "Datos que tratamos",
        bullets: [
          "Cuenta: correo, proveedor de acceso, identificadores de autenticación, fechas de alta y último acceso.",
          "Google, si lo elegís: correo verificado, identificador estable, nombre, foto y metadatos básicos de perfil. No solicitamos contactos, calendario ni otros scopes sensibles.",
          "Perfil y territorio: nombre público, avatar, biografía, idioma, residencia declarada y preferencias de visibilidad.",
          "Contenido y colaboración visibles: publicaciones, comentarios, fuentes, respuestas institucionales, compromisos monetarios y aportes no monetarios. En un compromiso monetario se publican tu nombre público, monto, mensaje y fecha. En un aporte no monetario se publican tipo, descripción, cantidad, unidad, estado y fecha, pero no el identificador de tu cuenta. Los apoyos a reclamos se muestran como conteos, no como una lista de personas.",
          "Gestiones restringidas: reportes, apelaciones, solicitudes de comunidades u organizaciones y comunicaciones de moderación, visibles sólo para tu cuenta y las personas autorizadas que deban atenderlas.",
          "Votaciones: una constancia vinculada con tu cuenta que indica la consulta y la hora de participación, pero no la elección. La opción o asignación se procesa durante la emisión y sólo se incorpora a contadores agregados; no se conserva una boleta individual.",
          "Evidencia: imágenes y, si decidís aportarlas, coordenadas aproximadas vinculadas a un reclamo.",
          "Seguridad y operación: consentimientos, eventos de seguridad, dirección IP procesada temporalmente, registros técnicos e identificadores de incidente.",
        ],
      },
      {
        title: "Finalidades",
        bullets: [
          "Crear y proteger tu cuenta, autenticarte y recuperar el acceso.",
          "Determinar en qué comunidades podés participar según tu residencia declarada.",
          "Publicar, ordenar y moderar conversaciones y decisiones cívicas.",
          "Prevenir fraude, abuso, participación repetida y ataques al servicio sin conservar una elección individual vinculada con tu cuenta.",
          "Atender solicitudes de acceso, rectificación, exportación, oposición y borrado.",
          "Medir el funcionamiento del producto con datos mínimos. Los plazos aplicables sólo deben publicarse después de reconciliar la implementación, la configuración efectiva y la evidencia contractual.",
        ],
      },
      {
        title: "Qué información es pública",
        paragraphs: [
          "Tu correo, credenciales y residencia declarada no se publican por defecto. Tu nombre público, avatar, publicaciones y comentarios pueden ser visibles en Internet e indexados por buscadores.",
          "La lista de miembros de cada comunidad también es privada por defecto. Si elegís aparecer, se muestran juntos tu nombre, avatar y pertenencia a esa comunidad; podés retirar esa elección en cualquier momento desde la misma comunidad.",
          "Agorbis no publica quién eligió cada opción ni ofrece votos identificados o desgloses territoriales. Los resultados se muestran sólo después del cierre y únicamente cuando participaron al menos cinco cuentas.",
        ],
      },
      {
        title: "Datos sensibles y privacidad del voto",
        paragraphs: [
          "Una encuesta cívica o una ronda presupuestaria puede revelar opiniones políticas. La aplicación y la infraestructura de Supabase reciben la selección transitoriamente para validarla y sumarla. Después sólo quedan una constancia de participación sin elección y contadores agregados: no se persiste una fila que represente la boleta o el reparto de una persona.",
          "Este diseño impide que otros usuarios consulten una elección individual, pero no ofrece anonimato criptográfico frente al responsable, Supabase o una persona con acceso privilegiado a la infraestructura: parámetros, tiempos, observación entre operaciones o registros técnicos mal configurados podrían permitir inferencias. Agorbis minimiza esos registros y actualiza todos los contadores en cada emisión, pero esta versión no debe usarse para elecciones vinculantes ni procesos que exijan secreto electoral formal.",
          "Agorbis no solicita opiniones políticas, datos de salud u otros datos sensibles en el perfil. Si decidís expresar una opinión en una publicación o comentario público, tratala como información destinada a esa audiencia y evitá incluir datos sensibles de otras personas.",
        ],
      },
      {
        title: "Tratamientos necesarios y elecciones opcionales",
        paragraphs: [
          "Los datos de cuenta, seguridad, residencia y constancia de participación son necesarios para prestar el servicio y proteger su integridad. La publicación de tu membresía, las coordenadas de evidencia y cualquier futuro tratamiento opcional se solicitan por separado y permanecen desactivados por defecto.",
          "Podés retirar una elección opcional sin perder la cuenta ni afectar el tratamiento anterior que haya sido legítimo. Agorbis no vende datos personales, no crea perfiles publicitarios y no usa decisiones automatizadas con efectos jurídicos.",
        ],
      },
      {
        title: "Acceso con Google y enlace de identidades",
        paragraphs: [
          "Google puede servir tanto para ingresar como para crear una cuenta si el correo todavía no existe. Antes de iniciar ese flujo informamos esta posibilidad y pedimos la confirmación de mayoría de edad, la lectura del aviso y el consentimiento expreso al Aviso de transferencias; la aceptación legal definitiva se registra únicamente después de que exista una sesión autenticada.",
          "Supabase conserva la identidad de Google y puede enlazarla automáticamente con una cuenta cuyo correo verificado coincida, manteniendo el mismo perfil y contenido. El nombre y la foto recibidos de Google no se copian automáticamente al perfil público. El token de Google se descarta de la sesión persistida después del intercambio y Agorbis no lo usa para llamar APIs de Google.",
          "El enlace o desenlace manual de identidades permanece deshabilitado. Al borrar la cuenta se eliminan sus identidades de acceso; si sólo usás Google, podés recuperar el acceso mediante el enlace de correo disponible para cuentas existentes.",
        ],
      },
      {
        title: "Cookies y almacenamiento local",
        paragraphs: [
          "Usamos cookies estrictamente necesarias para mantener la sesión, recordar idioma y zona horaria y limitar tareas repetidas. Los tokens de sesión se guardan en cookies HttpOnly que el código del navegador no puede leer.",
          "El navegador también puede guardar el tema elegido y borradores que todavía no publicaste. Esos borradores permanecen en tu dispositivo hasta que los publiques, los descartes o borres los datos del sitio. Agorbis no usa cookies publicitarias ni de analítica en esta versión.",
        ],
      },
      {
        title: "Proveedores y transferencias",
        paragraphs: [
          "Agorbis usa proveedores de infraestructura, base de datos, autenticación, correo y protección antiabuso. El registro público identifica a los proveedores y sus funciones conocidas; sus lugares de tratamiento y acceso, retención contractual y salvaguardas permanecen pendientes de evidencia externa cuando así se indica.",
          "Cloudflare está configurado para prestar DNS, Workers y Turnstile A/B. Esa descripción funcional no determina ni acredita países o lugares completos de tratamiento y acceso, plazos de retención de proveedor ni salvaguardas contractuales.",
          "Las ubicaciones, los países y los posibles accesos posteriores aplicables a Supabase, Resend y Cloudflare siguen pendientes de verificación. Agorbis no publica un destino por inferencia ni presenta el registro de subencargados como evidencia de un dato todavía pendiente.",
          "Podés seguir leyendo el contenido público sin crear una cuenta. La baja de una cuenta no se presenta como prueba de eliminación inmediata o completa en cada proveedor: ese alcance y sus plazos permanecen pendientes de reconciliación y evidencia.",
          "La existencia, el alcance y la suficiencia de los contratos, DPA, cláusulas y demás salvaguardas aplicables permanecen pendientes de evidencia y revisión. Un contrato genérico, una cláusula extranjera o una aceptación posterior no se presentan como sustituto del mecanismo argentino que corresponda.",
          "En los formularios de acceso y registro, Turnstile A funciona en modo invisible: no muestra un recuadro ni otra señal en pantalla mientras verifica en segundo plano datos técnicos del navegador, como la dirección IP, la huella TLS, el agente de usuario y el sitio de origen. Según el Anexo de privacidad de Turnstile de Cloudflare (Turnstile Privacy Addendum, https://www.cloudflare.com/turnstile-privacy-policy/), Cloudflare trata esas señales como encargado. Según Cloudflare, Turnstile no accede a lo que escribís en los formularios.",
        ],
      },
      {
        title: "Conservación y borrado",
        paragraphs: [
          "El cronograma interno de conservación y su correspondencia con la implementación efectiva todavía no están reconciliados. Esta política no publica como verificados plazos internos ni plazos de proveedores.",
          "El alcance efectivo del borrado de cuenta, de los datos derivados, del contenido público y de las copias mantenidas por proveedores sigue pendiente de reconciliación y evidencia. No se promete una eliminación inmediata, completa o selectiva que no haya sido verificada.",
          "No existe todavía un backup productivo verificado. No se afirma que las copias de respaldo roten, venzan o permitan una restauración determinada hasta contar con evidencia de un backup real y de una prueba de restauración.",
        ],
      },
      {
        title: "Tus derechos",
        paragraphs: [
          "Podés consultar y exportar tus datos desde el perfil, corregirlos, retirar elecciones opcionales y solicitar el borrado de la cuenta. El acceso es gratuito en intervalos no inferiores a seis meses, salvo que acredites un interés legítimo para solicitarlo antes. La descarga automática no limita el derecho a pedir información adicional sobre fuentes, destinatarios, registros técnicos o tratamientos de proveedores.",
          "Respondemos las solicitudes de acceso dentro de 10 días corridos y las de rectificación, actualización, supresión o confidencialidad dentro de 5 días hábiles. Durante una verificación podemos bloquear o marcar el dato discutido; si corresponde corregir o suprimir datos comunicados a un tercero, también notificamos al destinatario.",
          "Podemos pedir una verificación proporcional antes de entregar o borrar información. Para ejercer un derecho escribí al contacto del responsable indicado al final; registramos la recepción, el plazo y la respuesta sin revelar datos de otras personas.",
          "La Agencia de Acceso a la Información Pública, autoridad de control de la Ley 25.326, puede atender denuncias y reclamos por incumplimientos en materia de protección de datos personales. Sus canales oficiales están publicados en https://www.argentina.gob.ar/aaip/datospersonales/derechos.",
        ],
      },
      {
        title: "Edad mínima y cambios",
        paragraphs: [
          "El lanzamiento inicial está reservado a personas de 18 años o más. No buscamos recopilar deliberadamente datos de menores.",
          "Si esta política cambia de forma material, se publicará una nueva versión y se solicitará una nueva aceptación cuando corresponda.",
        ],
      },
    ],
  },
  en: {
    title: "Privacy policy",
    summary:
      "This policy explains which data Agorbis processes, why it is used, what becomes public, and how to exercise your rights.",
    sections: [
      {
        title: "Controller and scope",
        paragraphs: [
          "The controller identified at the end of this page operates Agorbis. This policy covers the website, communities, posts, votes, files, and related communications.",
          "Agorbis is an independent civic platform. It does not replace official filings, complaints, or government channels.",
        ],
      },
      {
        title: "Data we process",
        bullets: [
          "Account data: email, sign-in provider, authentication identifiers, signup date, and last access.",
          "Google, when you choose it: verified email, stable identifier, name, photo, and basic profile metadata. We do not request contacts, calendars, or other sensitive scopes.",
          "Profile and territory: public name, avatar, biography, language, declared residence, and visibility choices.",
          "Visible content and collaboration: posts, comments, sources, institutional responses, monetary pledges, and non-monetary contributions. A monetary pledge publishes your public name, amount, message, and date. A non-monetary contribution publishes its type, description, quantity, unit, status, and date, but not your account identifier. Support for claims is shown as a count, not a list of people.",
          "Restricted workflows: reports, appeals, community or organization requests, and moderation communications, visible only to your account and authorized people who need to handle them.",
          "Voting: a record linked to your account showing the poll and participation time, but not the choice. The option or allocation is processed while casting and only added to aggregate counters; no individual ballot is retained.",
          "Evidence: images and, when you choose to provide them, approximate coordinates attached to a claim.",
          "Security and operations: consent records, security events, temporarily processed IP address, technical logs, and incident identifiers.",
        ],
      },
      {
        title: "Purposes",
        bullets: [
          "Create and protect your account, authenticate you, and restore access.",
          "Determine where you may participate based on your declared residence.",
          "Publish, organize, and moderate civic discussions and decisions.",
          "Prevent fraud, abuse, repeat participation, and attacks without retaining an individual choice linked to your account.",
          "Handle access, correction, export, objection, and deletion requests.",
          "Measure product health using minimal data. Applicable periods must be published only after reconciling implementation, effective configuration, and contractual evidence.",
        ],
      },
      {
        title: "Public information",
        paragraphs: [
          "Your email, credentials, and declared residence are not public by default. Your public name, avatar, posts, and comments may be visible on the Internet and indexed by search engines.",
          "Each community member list is private by default. If you choose to appear, your name, avatar, and membership in that community are shown together; you may withdraw that choice at any time from the same community.",
          "Agorbis does not publish who selected an option and does not offer identified votes or territorial breakdowns. Results are shown only after closing and only when at least five accounts participated.",
        ],
      },
      {
        title: "Sensitive data and vote privacy",
        paragraphs: [
          "A civic poll or participatory budget round may reveal political opinions. The application and Supabase infrastructure receive the selection transiently to validate and add it. Afterwards, only a participation record without the choice and aggregate counters remain: no row representing one person's ballot or allocation is persisted.",
          "This design prevents other users from retrieving an individual choice, but it does not provide cryptographic anonymity from the controller, Supabase, or a person with privileged infrastructure access: parameters, timing, observation between operations, or misconfigured technical logs could permit inferences. Agorbis minimizes those logs and updates every counter on each cast, but this version must not be used for binding elections or processes requiring formal ballot secrecy.",
          "Agorbis does not request political opinions, health information, or other sensitive data in your profile. If you choose to express an opinion in a public post or comment, treat it as information intended for that audience and do not include another person's sensitive data.",
        ],
      },
      {
        title: "Required processing and optional choices",
        paragraphs: [
          "Account, security, residence, and participation-record data are required to provide the service and protect its integrity. Publishing your membership, attaching evidence coordinates, and any future optional processing are requested separately and remain off by default.",
          "You may withdraw an optional choice without losing your account or affecting prior lawful processing. Agorbis does not sell personal data, build advertising profiles, or use automated decisions with legal effects.",
        ],
      },
      {
        title: "Google sign-in and identity linking",
        paragraphs: [
          "Google may be used both to sign in and to create an account when the email does not exist yet. Before starting that flow, we disclose this possibility and ask you to confirm your age, acknowledge the notice, and expressly consent to the International Transfer Notice; final legal acceptance is recorded only after an authenticated session exists.",
          "Supabase stores the Google identity and may automatically link it to an account with the same verified email, preserving the profile and content. The name and photo received from Google are not automatically copied to the public profile. The Google token is removed from the persisted session after the exchange, and Agorbis does not use it to call Google APIs.",
          "Manual identity linking and unlinking remain disabled. Deleting the account removes its sign-in identities; if you only use Google, you can regain access through the email-link flow available to existing accounts.",
        ],
      },
      {
        title: "Cookies and local storage",
        paragraphs: [
          "We use strictly necessary cookies to maintain your session, remember language and time zone, and throttle repetitive tasks. Session tokens are stored in HttpOnly cookies that browser code cannot read.",
          "Your browser may also store your selected theme and drafts you have not published yet. Those drafts remain on your device until you publish or discard them, or clear the site's data. This version of Agorbis does not use advertising or analytics cookies.",
        ],
      },
      {
        title: "Providers and international transfers",
        paragraphs: [
          "Agorbis uses infrastructure, database, authentication, email, and abuse-prevention providers. The public register identifies providers and their known roles; their processing and access locations, contractual retention, and safeguards remain pending external evidence where indicated.",
          "Cloudflare is configured to provide DNS, Workers, and Turnstile A/B. That functional description neither determines nor proves the complete countries or locations of processing and access, provider retention periods, or contractual safeguards.",
          "The locations, countries, and possible onward access applicable to Supabase, Resend, and Cloudflare remain pending verification. Agorbis does not infer a destination or present the subprocessor register as evidence for information that is still pending.",
          "You may continue reading public content without creating an account. Account deletion is not presented as proof of immediate or complete deletion by every provider: that scope and its periods remain pending reconciliation and evidence.",
          "The existence, scope, and sufficiency of applicable contracts, DPAs, clauses, and other safeguards remain pending evidence and review. A generic contract, foreign clause, or later acceptance is not presented as a substitute for the applicable Argentine mechanism.",
          "On the sign-in and sign-up forms, Turnstile A runs in invisible mode: it shows no box or other on-screen sign while it checks technical browser data in the background, such as the IP address, TLS fingerprint, user agent, and origin site. Under Cloudflare's Turnstile Privacy Addendum (https://www.cloudflare.com/turnstile-privacy-policy/), Cloudflare processes those signals as a processor. According to Cloudflare, Turnstile does not access what you type into forms.",
        ],
      },
      {
        title: "Retention and deletion",
        paragraphs: [
          "The internal retention schedule and its correspondence with effective implementation have not yet been reconciled. This policy does not publish internal or provider periods as verified.",
          "The effective scope of account deletion, derived data, public content, and copies held by providers remains pending reconciliation and evidence. No immediate, complete, or selective deletion is promised unless it has been verified.",
          "No verified production backup currently exists. Backup rotation, expiry, or a particular restoration capability is not asserted until there is evidence of a real backup and a restore test.",
        ],
      },
      {
        title: "Your rights",
        paragraphs: [
          "You can view and export your data from your profile, correct it, withdraw optional choices, and request account deletion. Access is free at intervals of at least six months unless you show a legitimate interest in requesting it sooner. The automated download does not limit your right to request additional information about sources, recipients, technical logs, or provider processing.",
          "We answer access requests within 10 calendar days and correction, update, deletion, or confidentiality requests within 5 business days. While a request is verified, disputed data may be blocked or marked; when corrected or deleted data was disclosed to a third party, the recipient is notified when required.",
          "We may request proportionate verification before disclosing or deleting information. To exercise a right, email the controller contact shown below; receipt, deadline, and response are logged without disclosing another person's data.",
          "Argentina's Agency for Access to Public Information, the authority overseeing Law 25,326, may receive complaints concerning personal-data violations. Its official channels are published at https://www.argentina.gob.ar/aaip/datospersonales/derechos.",
        ],
      },
      {
        title: "Minimum age and changes",
        paragraphs: [
          "The initial launch is limited to people aged 18 or older. We do not knowingly seek data from minors.",
          "If this policy changes materially, a new version will be published and renewed acceptance will be requested when appropriate.",
        ],
      },
    ],
  },
};

/**
 * Aviso separado cuya decisión afirmativa se registra junto con la versión y
 * el hash exactos. Los cambios de proveedor, destino, finalidad, categoría de
 * datos, riesgo o consecuencia requieren una nueva versión de este objeto.
 */
export const internationalTransferNoticeContent: Record<
  Locale,
  LegalDocumentContent
> = {
  es: {
    title: "Aviso de transferencias internacionales",
    summary:
      "Este aviso identifica las transferencias necesarias para una cuenta y distingue los datos conocidos de las ubicaciones, la retención y las salvaguardas que siguen pendientes de evidencia externa.",
    sections: [
      {
        title: "Decisión que te pedimos",
        paragraphs: [
          "Antes de iniciar el flujo de una nueva cuenta, Agorbis presenta una acción afirmativa separada de Términos, Privacidad, edad mínima y Normas comunitarias, y registra el resultado técnico junto con la versión del aviso.",
          "La existencia de ese flujo o de una aceptación registrada no acredita por sí sola una base jurídica suficiente ni subsana la omisión de la revisión 0059 sobre consentimiento sensible. Mientras esa revisión siga omitida, Agorbis no debe describirse como jurídicamente conforme.",
        ],
      },
      {
        title: "Destinatarios, datos y finalidades",
        bullets: [
          "Supabase Pte. Ltd. presta base de datos, Auth y Storage y, para esas funciones, recibe las categorías de datos enviadas por la aplicación. Sus lugares completos de tratamiento y acceso permanecen pendientes de evidencia externa.",
          "Plus Five Five, Inc., que opera como Resend, presta el envío de confirmaciones, enlaces de acceso, recuperación y avisos de seguridad. Sus lugares completos de tratamiento y acceso permanecen pendientes de evidencia externa.",
          "Cloudflare, Inc. presta DNS, Workers y Turnstile A/B. Esas funciones pueden procesar solicitudes, respuestas y señales antiabuso; sus lugares completos de tratamiento y acceso permanecen pendientes de evidencia externa.",
        ],
      },
      {
        title: "Destinos, retención y salvaguardas pendientes",
        paragraphs: [
          "Agorbis todavía no cuenta con evidencia suficiente para publicar la lista completa y exacta de ubicaciones y países desde los que cada proveedor o subencargado trata o accede a datos. No se atribuye un destino por inferencia.",
          "Los plazos de retención de proveedores, las obligaciones contractuales y el mecanismo argentino aplicable a estas transferencias siguen pendientes de evidencia y revisión. No se afirma que un DPA genérico, cláusulas extranjeras, cifrado, minimización o una aceptación posterior constituyan una salvaguarda suficiente.",
        ],
      },
      {
        title: "Obligatoriedad y consecuencias",
        paragraphs: [
          "Podés negarte y seguir leyendo el contenido público sin cuenta. La infraestructura actual no permite crear ni mantener una cuenta sin Supabase, Resend y Cloudflare, por lo que negarte impide el alta y las funciones autenticadas.",
          "No se venden datos personales, no se usan para publicidad y el consentimiento de este aviso no incluye Google, analítica, inteligencia artificial ni otro tratamiento opcional futuro. Cualquiera de esos cambios requiere una decisión separada o una nueva versión cuando corresponda.",
        ],
      },
      {
        title: "Retiro y derechos",
        paragraphs: [
          "Podés solicitar la baja de la cuenta o escribir al contacto del responsable. La baja no se presenta como prueba de que cada proveedor haya detenido o eliminado inmediatamente todo tratamiento: el alcance y los plazos posteriores siguen pendientes de evidencia.",
          "Antes de la baja podés exportar tus datos. También podés ejercer gratuitamente acceso, rectificación, actualización, supresión y confidencialidad ante el responsable, y presentar un reclamo ante la Agencia de Acceso a la Información Pública.",
        ],
      },
    ],
  },
  en: {
    title: "International transfer notice",
    summary:
      "This notice identifies transfers needed for an account and distinguishes known information from locations, retention, and safeguards that remain pending external evidence.",
    sections: [
      {
        title: "The decision we request",
        paragraphs: [
          "Before starting a new-account flow, Agorbis presents an affirmative action separate from the Terms, Privacy, minimum age, and Community rules, and records the technical result with the notice version.",
          "The existence of that flow or a recorded acceptance does not by itself prove a sufficient legal basis or cure the omission of sensitive-consent review 0059. While that review remains omitted, Agorbis must not be described as legally compliant.",
        ],
      },
      {
        title: "Recipients, data, and purposes",
        bullets: [
          "Supabase Pte. Ltd. provides database, Auth, and Storage services and receives the data categories sent by the application for those functions. Its complete processing and access locations remain pending external evidence.",
          "Plus Five Five, Inc., doing business as Resend, sends confirmations, sign-in links, recovery messages, and security notices. Its complete processing and access locations remain pending external evidence.",
          "Cloudflare, Inc. provides DNS, Workers, and Turnstile A/B. Those functions may process requests, responses, and abuse-prevention signals; its complete processing and access locations remain pending external evidence.",
        ],
      },
      {
        title: "Destinations, retention, and safeguards pending evidence",
        paragraphs: [
          "Agorbis does not yet have sufficient evidence to publish the complete and exact list of locations and countries from which each provider or subprocessor processes or accesses data. No destination is attributed by inference.",
          "Provider retention periods, contractual duties, and the Argentine mechanism applicable to these transfers remain pending evidence and review. A generic DPA, foreign clauses, encryption, minimization, or later acceptance is not asserted to be a sufficient safeguard.",
        ],
      },
      {
        title: "Required nature and consequences",
        paragraphs: [
          "You may refuse and continue reading public content without an account. The current infrastructure cannot create or maintain an account without Supabase, Resend, and Cloudflare, so refusal prevents sign-up and authenticated features.",
          "Personal data is not sold or used for advertising. Consent to this notice does not include Google, analytics, artificial intelligence, or any future optional processing. Any such change requires a separate choice or a new version when applicable.",
        ],
      },
      {
        title: "Withdrawal and rights",
        paragraphs: [
          "You may request account deletion or write to the controller contact. Deletion is not presented as proof that every provider immediately stopped or deleted all processing: the subsequent scope and periods remain pending evidence.",
          "You may export your data before deletion. You may also exercise access, correction, update, deletion, and confidentiality rights free of charge with the controller and lodge a complaint with Argentina's Agency for Access to Public Information.",
        ],
      },
    ],
  },
};

export const termsContent: Record<Locale, LegalDocumentContent> = {
  es: {
    title: "Términos de uso",
    summary:
      "Estas condiciones regulan el uso de Agorbis y las responsabilidades de quienes participan.",
    sections: [
      {
        title: "Cuenta y elegibilidad",
        bullets: [
          "Debés tener 18 años o más y brindar información de registro verdadera.",
          "Sos responsable de proteger tu acceso y de avisar si sospechás que otra persona lo usa.",
          "Sólo podés mantener una cuenta personal y una residencia principal declarada.",
          "Google, el correo y los enlaces de acceso son medios de autenticación; no implican que Agorbis verifique tu identidad o domicilio real.",
        ],
      },
      {
        title: "Participación cívica",
        paragraphs: [
          "Podés leer contenido público y, cuando tu cuenta y residencia lo permitan, votar, comentar, publicar, reportar y colaborar. Los resultados no son vinculantes salvo que una autoridad competente los adopte expresamente.",
          "Los reclamos no sustituyen emergencias, denuncias ni expedientes oficiales. Agorbis no representa a gobiernos ni garantiza respuestas o resultados.",
        ],
      },
      {
        title: "Tu contenido",
        paragraphs: [
          "Conservás los derechos que tengas sobre lo que publicás. Otorgás a Agorbis una licencia no exclusiva, mundial y gratuita para alojarlo, reproducirlo y mostrarlo únicamente para operar, moderar, respaldar y comunicar el servicio.",
          "Sólo debés publicar material que puedas compartir. No difundas datos personales de terceros, acusaciones sin sustento, material ilícito o evidencia que ponga a alguien en riesgo.",
        ],
      },
      {
        title: "Conducta y moderación",
        paragraphs: [
          "Las Normas comunitarias forman parte de estos términos. Podemos limitar alcance, retirar contenido o suspender cuentas para proteger a las personas y la integridad del servicio.",
          "Las decisiones relevantes quedan registradas y pueden apelarse por el canal publicado. Las urgencias de seguridad pueden resolverse primero y revisarse después.",
        ],
      },
      {
        title: "Aportes y servicios externos",
        paragraphs: [
          "Agorbis registra compromisos de dinero, materiales, tiempo o habilidades, pero no procesa ni custodia fondos. Cualquier transferencia ocurre fuera de la plataforma y bajo responsabilidad de quienes participan.",
          "El servicio depende de proveedores externos y puede cambiar, interrumpirse o suspender funciones por seguridad o mantenimiento.",
        ],
      },
      {
        title: "Baja y cambios",
        paragraphs: [
          "Podés borrar tu cuenta desde el perfil. Cierto contenido público puede conservarse anonimizado para no romper conversaciones o evidencia; la política de privacidad explica el detalle.",
          "Los cambios materiales se versionan y se vuelven a presentar para aceptación. Si no aceptás una versión obligatoria, podés exportar tus datos y cerrar la cuenta.",
        ],
      },
    ],
  },
  en: {
    title: "Terms of use",
    summary:
      "These terms govern the use of Agorbis and the responsibilities of participants.",
    sections: [
      {
        title: "Account and eligibility",
        bullets: [
          "You must be at least 18 years old and provide accurate registration information.",
          "You are responsible for protecting access to your account and reporting suspected misuse.",
          "You may maintain only one personal account and one declared primary residence.",
          "Google, email, and sign-in links are authentication methods; they do not mean Agorbis has verified your real identity or address.",
        ],
      },
      {
        title: "Civic participation",
        paragraphs: [
          "You may read public content and, when your account and residence allow it, vote, comment, post, report, and collaborate. Results are not binding unless a competent authority expressly adopts them.",
          "Claims do not replace emergency, police, court, or government filing channels. Agorbis does not represent governments and does not guarantee responses or outcomes.",
        ],
      },
      {
        title: "Your content",
        paragraphs: [
          "You retain any rights you hold in what you publish. You grant Agorbis a non-exclusive, worldwide, royalty-free license to host, reproduce, and display it only as needed to operate, moderate, back up, and communicate the service.",
          "Only publish material you are entitled to share. Do not disclose third-party personal data, unsupported accusations, unlawful material, or evidence that places someone at risk.",
        ],
      },
      {
        title: "Conduct and moderation",
        paragraphs: [
          "The Community rules form part of these terms. We may limit reach, remove content, or suspend accounts to protect people and service integrity.",
          "Material decisions are logged and may be appealed through the published channel. Urgent safety action may be taken first and reviewed afterwards.",
        ],
      },
      {
        title: "Pledges and external services",
        paragraphs: [
          "Agorbis records pledges of money, materials, time, or skills but does not process or hold funds. Any transfer occurs outside the platform under the participants' responsibility.",
          "The service depends on external providers and may change, be interrupted, or suspend features for maintenance or security.",
        ],
      },
      {
        title: "Termination and changes",
        paragraphs: [
          "You can delete your account from your profile. Some public content may remain anonymized to preserve discussions or civic evidence; the privacy policy explains this in detail.",
          "Material changes are versioned and presented again for acceptance. If you decline a required version, you may export your data and close the account.",
        ],
      },
    ],
  },
};

export const communityRulesContent: Record<Locale, LegalDocumentContent> = {
  es: {
    title: "Normas comunitarias",
    summary:
      "Reglas comunes para discutir asuntos públicos sin dañar a las personas ni manipular la participación.",
    sections: [
      {
        title: "Participá de buena fe",
        bullets: [
          "Elegí el territorio y tipo de publicación que realmente correspondan.",
          "Separá hechos, opiniones y propuestas; agregá fuentes cuando existan.",
          "No coordines cuentas, votos o reportes para fabricar apoyo o silenciar a otros.",
          "No suplantes personas, organizaciones ni autoridades.",
        ],
      },
      {
        title: "Protegé a las personas",
        bullets: [
          "No publiques amenazas, acoso, odio, explotación sexual ni instrucciones para causar daño.",
          "No reveles domicilios, documentos, teléfonos, datos médicos o ubicación precisa de terceros.",
          "No acuses a una persona identificable de delitos o faltas sin fuentes verificables y relevancia cívica clara.",
          "Si existe riesgo inmediato, contactá a emergencias o al organismo competente; no esperes respuesta de Agorbis.",
        ],
      },
      {
        title: "Cuidá la evidencia y los derechos",
        bullets: [
          "Subí imágenes propias o que tengas derecho a compartir y evitá rostros, patentes u otros identificadores innecesarios.",
          "No edites evidencia de manera engañosa ni la reemplaces después de publicarla.",
          "No publiques spam, malware, enlaces engañosos, publicidad encubierta o solicitudes de pago fraudulentas.",
        ],
      },
      {
        title: "Aplicación",
        paragraphs: [
          "La respuesta depende de gravedad, alcance, intención, reincidencia y contexto. Puede incluir advertencia, reducción de alcance, retiro, bloqueo de funciones o suspensión.",
          "Reportar de buena fe nunca garantiza que se retire contenido. Los reportes abusivos también pueden generar medidas. Las decisiones relevantes pueden apelarse.",
        ],
      },
    ],
  },
  en: {
    title: "Community rules",
    summary:
      "Shared rules for discussing public issues without harming people or manipulating participation.",
    sections: [
      {
        title: "Participate in good faith",
        bullets: [
          "Choose the territory and content type that actually fit the issue.",
          "Separate facts, opinions, and proposals; add sources when available.",
          "Do not coordinate accounts, votes, or reports to manufacture support or silence others.",
          "Do not impersonate people, organizations, or public authorities.",
        ],
      },
      {
        title: "Protect people",
        bullets: [
          "Do not publish threats, harassment, hate, sexual exploitation, or instructions to cause harm.",
          "Do not disclose another person's address, documents, phone number, medical information, or precise location.",
          "Do not accuse an identifiable person of wrongdoing without verifiable sources and clear civic relevance.",
          "For immediate danger, contact emergency services or the competent authority; do not wait for Agorbis.",
        ],
      },
      {
        title: "Protect evidence and rights",
        bullets: [
          "Upload your own images or material you are allowed to share, and avoid unnecessary faces, license plates, or identifiers.",
          "Do not misleadingly edit evidence or replace it after publication.",
          "Do not publish spam, malware, deceptive links, undisclosed advertising, or fraudulent payment requests.",
        ],
      },
      {
        title: "Enforcement",
        paragraphs: [
          "The response depends on severity, reach, intent, repetition, and context. It may include a warning, reduced reach, removal, feature restrictions, or suspension.",
          "Good-faith reporting never guarantees removal. Abusive reporting may also lead to action. Material decisions may be appealed.",
        ],
      },
    ],
  },
};

export const moderationContent: Record<Locale, LegalDocumentContent> = {
  es: {
    title: "Moderación y apelaciones",
    summary:
      "Cómo se revisan reportes, qué medidas puede tomar Agorbis y cómo pedir una segunda revisión.",
    sections: [
      {
        title: "Proceso de revisión",
        bullets: [
          "Un reporte entra en una cola con fecha, motivo y contenido relacionado.",
          "Moderación revisa el contenido, su contexto, las normas aplicables y el historial estrictamente necesario.",
          "Las medidas quedan en un registro de auditoría que el usuario afectado no puede modificar.",
          "La persona afectada recibe el motivo y duración, salvo que hacerlo cree un riesgo para otra persona o una investigación legítima.",
        ],
      },
      {
        title: "Medidas posibles",
        paragraphs: [
          "Puede no tomarse acción, solicitarse una corrección, limitarse la visibilidad, retirarse contenido, restringirse una función o suspenderse temporal o permanentemente una cuenta.",
          "Las suspensiones impiden nuevas acciones de participación, pero conservan acceso a la información necesaria para exportar datos, apelar o borrar la cuenta.",
        ],
      },
      {
        title: "Apelar",
        paragraphs: [
          "Podés apelar una decisión desde el canal disponible en tu cuenta. Indicá la decisión, explicá qué contexto falta y aportá fuentes relevantes; no repitas el contenido denunciado si puede dañar a alguien.",
          "Siempre que sea posible, la apelación la revisa una persona distinta. El resultado y su fundamento quedan registrados. El canal no reemplaza recursos legales o administrativos que puedan corresponder.",
        ],
      },
      {
        title: "Tiempos y emergencias",
        paragraphs: [
          "La cola muestra su antigüedad y se atiende por riesgo y fecha. El objetivo inicial es revisar riesgos urgentes en 24 horas, reportes comunes en 72 horas y apelaciones en siete días.",
          "Para amenazas inmediatas o delitos en curso, contactá a emergencias o a la autoridad competente.",
        ],
      },
    ],
  },
  en: {
    title: "Moderation and appeals",
    summary:
      "How reports are reviewed, which actions Agorbis may take, and how to request a second review.",
    sections: [
      {
        title: "Review process",
        bullets: [
          "A report enters a queue with its date, reason, and related content.",
          "Moderation reviews the content, context, applicable rules, and only the history needed for the decision.",
          "Actions are stored in an audit log that the affected user cannot modify.",
          "The affected person receives the reason and duration unless disclosure would put someone at risk or compromise a legitimate investigation.",
        ],
      },
      {
        title: "Possible actions",
        paragraphs: [
          "A review may result in no action, a correction request, limited visibility, content removal, feature restriction, or temporary or permanent account suspension.",
          "Suspension blocks new participation while preserving the access needed to export data, appeal, or delete the account.",
        ],
      },
      {
        title: "Appeals",
        paragraphs: [
          "You may appeal a decision through the channel available in your account. Identify the decision, explain missing context, and provide relevant sources; do not repeat reported material when doing so could harm someone.",
          "Whenever possible, a different person reviews the appeal. The result and rationale are logged. This channel does not replace any legal or administrative remedy available to you.",
        ],
      },
      {
        title: "Timing and emergencies",
        paragraphs: [
          "The queue displays case age and is handled according to risk and submission date. Initial targets are 24 hours for urgent safety issues, 72 hours for standard reports, and seven days for appeals.",
          "For immediate threats or crimes in progress, contact emergency services or the competent authority.",
        ],
      },
    ],
  },
};
