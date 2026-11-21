# Aprobación del aviso opcional de Google

El responsable aprobó el texto ES/EN y la casilla mostrados en la
[vista legible](google-access-notice-review.md), preparada en el commit
`ca7bfdb`. Ante la pregunta específica sobre el aviso y su casilla respondió:

> lo autorizo,adelante con eso

La aprobación se registró el 9 de septiembre de 2026 a las 03:54:54 UTC.
Ese instante corresponde al registro técnico de la autorización, no a una
afirmación sobre la hora exacta del mensaje ni sobre un despliegue productivo.

## Contenido e identidad

- Fuente revisada: `supabase/migration-drafts/google-auth-notice-2026-09-09.json`.
- SHA-256 del archivo revisado: `c48e21f2f21cf2f1713dea96cb8570e069b56dca83f49e489bbc9d8402d93280`.
- Versión del aviso Google: `2026-09-09.1`.
- Algoritmo de contenido: `sha256-postgres-jsonb-v1`.
- Hash obtenido mediante PostgreSQL local sobre `content_snapshot::text`:
  `b5a0485e6f2fb5c4d701b5a7e517fd1d03aca0fcd5aa60c083346a87946a35f3`.
- Activación preparada: `0067_activate_google_auth_notice.sql`.
- `approved_at` y `effective_at` del candidato: `2026-09-09T03:54:54.000Z`.

La migración conserva exactamente el JSON aprobado. Su hash JSONB fue obtenido
con una consulta de sólo lectura en el contenedor local `supabase_db_agorbis`;
no se calculó mediante `JSON.stringify`. El constraint de `0066` vuelve a
comprobarlo al insertar. La fecha de vigencia corresponde al candidato; el aviso
no está disponible en producción hasta aplicar la migración y publicar el flujo.

Casilla ES aprobada:

> Consiento expresamente el tratamiento de mis datos para acceder con Google y las transferencias internacionales descriptas en este aviso.

Casilla EN aprobada:

> I expressly consent to the processing of my data for Google sign-in and the international transfers described in this notice.

## Alcance

La autorización permite integrar ese texto y preparar su activación versionada.
No registra decisiones por las personas usuarias, no sustituye el consentimiento
general ni aprueba Facebook. Cada persona debe decidir expresamente si usa Google;
el correo permanece disponible.

Tampoco acepta en bloque los riesgos pendientes del lanzamiento, acredita
cumplimiento legal o autoriza el ensayo con escrituras en producción. Las dos
cuentas propias están disponibles, pero el enlace de identidad y la ventana
productiva requieren el alcance concreto previsto en el
[plan de ensayo](google-production-readiness.md).

El aviso general `2026-08-29.1` conserva su versión, hash y exclusión de Google.
La aprobación es del aviso específico y de la casilla, sin reinterpretar
aceptaciones anteriores ni afirmar que se resolvieron las incertidumbres
de destinos, retención o salvaguardas que el propio texto declara.
