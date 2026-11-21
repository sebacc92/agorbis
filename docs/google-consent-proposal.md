# Decisión opcional para Google: texto aprobado e implementación

Estado al 9 de septiembre de 2026: **texto ES/EN y casilla aprobados por el
responsable; activación aplicada y en validación local, sin publicar en producción**.
La [aprobación registrada](google-notice-owner-approval-2026-09-09.md) corresponde
al texto concreto preparado en `ca7bfdb`. El protocolo `0066` se conserva y
`0067_activate_google_auth_notice.sql` incorpora exactamente ese snapshot como
versión `2026-09-09.1`. No crea aceptaciones, retiros ni identidades. El aviso
general `2026-08-29.1` permanece intacto y excluye Google. Esta aprobación no
acredita las evidencias externas pendientes ni autoriza el ensayo productivo.

## Alcance de la decisión aprobada

Se implementa una decisión **separada, opcional y sin casilla preseleccionada**.
El texto siguiente reúne los hechos comprobados y declara los límites de la
evidencia; no rellena los faltantes con países, acuerdos o plazos supuestos.
Preparar este texto no equivale a aprobarlo como base jurídica suficiente.

La AAIP contempla el consentimiento expreso entre las vías para transferencias
a países no adecuados, además de otras herramientas. Esa regla general no
certifica que este aviso, con información todavía pendiente, cumpla todas
las condiciones aplicables a Agorbis. Debe evaluarse su suficiencia para el
tratamiento concreto. [Guía oficial de transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales).

No hace falta enviar correos nuevos como condición para revisar esta propuesta:
las fuentes públicas, los documentos del servicio y las respuestas ya recibidas
también son evidencia. Si una afirmación no está acreditada, sigue pendiente.

## Snapshot bilingüe aprobado

El archivo enlazado representa únicamente `content_snapshot`, con la estructura de
`LegalDocumentContent` que acepta `0066`: `es`/`en`, `title`, `summary` y
`sections` con `paragraphs`. Es documentación y **no es SQL para ejecutar**.
La migración `0067` contiene la versión, el hash calculado por PostgreSQL y la
referencia de aprobación. El archivo JSON se conserva como fuente de revisión;
editarlo no concede cobertura ni cambia el aviso publicado.

[Snapshot JSON aprobado](../supabase/migration-drafts/google-auth-notice-2026-09-09.json) · [Vista legible ES/EN](google-access-notice-review.md).

El archivo sigue fuera de `supabase/migrations`: no publica un aviso ni registra
aprobaciones. La vista legible reproduce sus títulos, resumen y párrafos.

## Casilla y acciones del recorrido

La UI conserva el enlace con versión y hash e incorpora la casilla aprobada,
que nombra expresamente el tratamiento y las transferencias:

- **ES:** «Consiento expresamente el tratamiento de mis datos para acceder con
  Google y las transferencias internacionales descriptas en este aviso». Enlace:
  «Aviso versión {versión}».
- **EN:** “I expressly consent to the processing of my data for Google sign-in
  and the international transfers described in this notice.” Link:
  “Notice version {version}”.
- Ayuda existente que se conserva en ambos idiomas: se puede ingresar por
  correo sin aceptar Google y retirar esta decisión desde el perfil.
- Acciones existentes: «Continuar con Google» y «Volver a las opciones» / “Continue
  with Google” and “Back to options”. No se presenta una aceptación por defecto
  ni se obliga a aceptar Google para usar el correo.

El texto aprobado está integrado en `SocialAuth.tsx` y su traducción EN.
El resumen corto del snapshot es
el que se ve encima de la casilla; el documento completo se muestra en
`/acceso-google`. `LegalDocument` agrega el responsable y contacto desde la
configuración pública validada. Sus párrafos son texto plano: las URLs externas
del snapshot se verían como texto, mientras los enlaces de navegación al pie y
el enlace versionado de la casilla ya son navegables. Revisar esa presentación
al implementar el texto aprobado, sin introducir HTML ni Markdown interpretado
en el snapshot.

## Límites que conserva la aprobación

1. **Revisión de texto y cumplimiento son decisiones distintas.** Declarar
   incertidumbres evita promesas falsas; no demuestra que lo informado sea
   suficiente para un consentimiento válido. Un lanzamiento excepcional con
   riesgo aceptado tampoco certifica cumplimiento legal. La aceptación del
   responsable del lanzamiento no sustituye la de cada persona usuaria.
2. **El DPA existe; su alcance argentino sigue por revisar.** No falta pedir
   una firma nueva a Supabase. Su DPA público vigente contempla condiciones para
   transferencias; no atribuirle automáticamente una garantía específica de
   Agorbis que todavía no fue acreditada. El período de su cláusula 11.2 se
   refiere a la finalización contractual y no establece el plazo de todos los
   borrados individuales.
3. **El consentimiento Google sigue siendo obligatorio para ofrecer Google.**
   Los controles permiten revisar excepciones explícitas para cierta evidencia
   general pendiente. No permiten omitir la alineación de proveedores, la
   decisión Google revisada, los controles Auth/SMTP ni la veracidad de los
   textos. Mantener Facebook apagado no impide continuar este trabajo.
4. **La cobertura técnica separada está registrada para este artefacto.**
   `social-auth-consent-policy.mjs` mantiene el aviso general de `0060` separado
   del registro específico Google. El registro revisado fija la versión
   `2026-09-09.1`, la referencia de aprobación y la migración `0067`.
   Su verificador exige versión, hash obtenido de PostgreSQL, aprobación y
   SHA-256 completo de una migración de activación revisada. Los borradores,
   archivos modificados y versiones sin revisión no conceden cobertura.
   La activación se aplicó únicamente a la base local. No agregar Google al
   aviso general ni presentar la cobertura como validación OAuth real.
5. **Las afirmaciones del flujo describen el candidato, no una prueba real ya
   terminada.** Confirmar en el ensayo autorizado los permisos efectivamente
   solicitados, los datos recibidos, el retorno, la sesión sin tokens Google,
   el retiro y el acceso por correo. El retiro de Agorbis no revoca por sí solo
   la autorización dentro de Google ni elimina la identidad en Supabase.

El responsable aprobó expresamente el texto concreto y su casilla. Las pruebas
productivas conservan el alcance separado que solicitó; no se presume una
aceptación global de riesgos ni se exige enviar consultas adicionales.

## Protocolo implementado en el candidato local

1. `public.google_auth_notice_versions` conserva el snapshot bilingüe ES/EN, su
   versión, hash, vigencia y referencia de aprobación. Usa
   `sha256-postgres-jsonb-v1`; no intercambiarlo con el algoritmo de los avisos
   generales. El trigger protege el contenido y la evidencia de un aviso
   aprobado. `current_google_auth_notice()` sólo devuelve un aviso aprobado,
   vigente y actual. No hay lectura pública directa de la tabla.
2. `/ingresar` y `/registro` muestran una casilla **separada y no preseleccionada**
   para Google, con el resumen del snapshot y un enlace a
   `/acceso-google?version=…&hash=…`. La página pública muestra ese snapshot
   vigente en ES o EN; si el enlace corresponde a una versión/hash distinta,
   informa el cambio. Si falta un aviso aprobado o falla su lectura, no ofrece
   iniciar Google y mantiene el acceso por correo.
3. El POST vuelve a consultar el aviso en la base antes de iniciar OAuth. Exige
   la casilla expresa y coincidencia de versión/hash con el formulario. No
   acepta la decisión general de transferencias como autorización para Google.
   Usa el `issued_at` devuelto por la base como inicio de la decisión.
4. La cookie temporal `agorbis-oauth-context` vincula nonce, proveedor, intención
   de ingreso/registro, hash SHA-256 del destino interno, idioma, versión/hash del
   aviso e instante de inicio. Dura diez minutos, tiene `HttpOnly`,
   `SameSite=Lax`, `Secure` sobre HTTPS y alcance `/auth/callback`. Complementa
   la marca previa de acuerdos generales; no constituye por sí sola una
   aceptación durable. El callback consume ambas cookies y rechaza contextos
   vencidos o incoherentes.
5. Después del canje PKCE y del saneamiento que elimina los tokens del proveedor,
   el callback registra la decisión mediante `grant_google_auth_consent()` con
   la clave pública y el JWT de la propia persona. La RPC usa `auth.uid()`;
   no admite atribuirla a un usuario enviado por el formulario ni registrarla
   mediante `service_role`. Comprueba nuevamente aviso, hash, vigencia y plazo.
   Si el registro falla, revoca y limpia la sesión recién obtenida y devuelve un
   error seguro. Los acuerdos generales siguen registrándose en
   `/consentimiento` cuando correspondan, antes de permitir participación.
6. `public.user_google_auth_consent_events` conserva aceptaciones y retiros;
   RLS limita la lectura a la propia cuenta. `private.google_auth_consent_barriers`
   impide que un retorno iniciado antes de un retiro vuelva a consentir. Las
   nuevas aceptaciones tienen un límite de 30 por hora; las repeticiones
   idempotentes no consumen otra aceptación. El retiro permanece disponible.

## Retiro, consulta y exportación

`/perfil/acceso-google` permite consultar la decisión y retirarla con confirmación
expresa, mediante RPC autenticada propia. Es un derecho de cuenta: no depende de
aceptar una nueva versión legal, de un aviso Google activo ni del flag del botón.
La exportación de `/perfil/datos` incluye los eventos de decisión y el estado
actual de Google, consultados con el JWT propio.

Retirar impide reutilizar esa decisión para nuevos accesos con Google. **No cierra
la sesión actual, no borra la cuenta ni elimina o desvincula la identidad Google**;
tampoco deshace tratamientos anteriores. Un retorno OAuth iniciado antes del
retiro queda invalidado para registrar una aceptación. Volver a usar Google
requiere un nuevo inicio y otra decisión expresa sobre el aviso vigente. El
acceso por correo permanece disponible. Deshabilitar un proveedor para todo el
servicio o eliminar una cuenta son operaciones distintas del retiro individual.

## Activación y validación

El candidato tiene 66 migraciones (`0001`–`0058` + `0060`–`0067`, sin `0059`).
La última observación productiva documentada sigue siendo de 60 hasta `0061`;
no se aplicaron `0062`–`0067` en producción por este trabajo. Google está activo en Supabase
según la confirmación ya registrada; esta preparación no modifica ese estado.

`scripts/social-auth-consent-policy.mjs` reconoce sólo la activación aprobada
`0067`, fijada por SHA-256. Su comprobación de cobertura Google pasa en el
candidato; los once valores pendientes de evidencia externa siguen sin
rellenarse. Las pruebas de integridad siguen rechazando alteraciones, borradores
e inyecciones de cobertura. No sustituir esta decisión por una aceptación general.

Los checks del candidato ampliado se registran en el
[plan de preparación](google-production-readiness.md); los resultados anteriores
a `0066` no certifican esta implementación. Sigue pendiente la validación OAuth
real en un entorno y con cuentas autorizados, según la alternativa aislada y la
matriz del plan. No se requiere Facebook para ninguno de estos pasos. Los
secretos OAuth siguen sólo en Supabase.

## Fuentes y alcance de cada afirmación

Revisión documental de fuentes públicas realizada el 9 de septiembre de 2026:

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect):
  alcance de `openid`, `email` y `profile` y campos de identidad/perfil que pueden
  recibirse. La configuración del panel declarada incluye esos permisos,
  pero Agorbis no fija `options.scopes` para Google. El
  [Auth fijado para las pruebas locales](https://raw.githubusercontent.com/supabase/auth/v2.195.0/internal/api/provider/google.go)
  usa por defecto `email` y `profile`. El aviso describe los datos sin presentar
  la lista de tres scopes como una solicitud efectiva ya comprobada; el ensayo
  debe verificar la solicitud productiva.
- [Política de Google ES](https://policies.google.com/privacy?hl=es) y
  [EN](https://policies.google.com/privacy?hl=en), vigente desde el 26 de mayo de
  2026: procesamiento global y conservación variable. No acredita una región
  exclusiva de Agorbis ni un plazo único de OAuth. La ausencia de acuerdo
  regional específico proviene de la confirmación del operador del 8 de
  septiembre de 2026.
- [DPA de Supabase](https://supabase.com/legal/customer-resources/data-processing-addendum):
  cláusulas 6.1, 11.2 y 12.1. Su incorporación automática fue confirmada por el
  soporte en el ticket `SU-467483`. Ohio proviene del panel del proyecto
  aportado por el operador; no de una inferencia desde el domicilio social del
  proveedor ni del TIA de 2025.
- [AAIP: transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales):
  vías generales aplicables a transferencias, sin evaluación individual de
  este texto o de Agorbis.
- Implementación local: `src/lib/auth-actions.ts`,
  `src/lib/protected-auth.ts`, `src/routes/auth/callback/index.ts`,
  `src/components/auth/SocialAuth.tsx`,
  `src/components/legal/LegalDocument.tsx`,
  `supabase/migrations/0065_public_profile_handles.sql` y
  `supabase/migrations/0066_google_auth_consent.sql`. Estas fuentes respaldan
  la separación de decisiones, el saneamiento, la publicación de perfil y
  los efectos del retiro en el candidato; no sustituyen pruebas productivas.
