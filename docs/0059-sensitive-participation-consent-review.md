# Revision tecnica de 0059: consentimiento de participacion sensible

Estado: **BORRADOR LOCAL. NO APLICAR**.

El borrador
`supabase/migration-drafts/0059_versioned_sensitive_participation_consent.sql`
implementa el mecanismo tecnico, pero vive fuera de `supabase/migrations` y
del baseline ejecutable. Deliberadamente no publica texto ni una version
`current`. Aplicado sin una version aprobada, el resultado es fail-closed:
`public.can_participate()` devuelve `false` para todas las cuentas y las
escrituras civicas protegidas son rechazadas por la base.

## Modelo tecnico

- `sensitive_participation_notice_versions` conserva el snapshot bilingue, su
  hash, la version del catalogo de scopes y su ciclo de vigencia.
- `user_sensitive_participation_consents` vincula `auth.uid()` con la version,
  hash y catalogo exactos. No existe backfill.
- `grant_current_sensitive_participation_consent(version, hash, true, locale)`
  es la unica escritura expuesta. Rechaza anonimos, negativas, locales
  invalidos, versiones obsoletas y hashes distintos.
- La aceptacion queda separada de Terminos, Privacidad, Normas comunitarias y
  consentimiento de transferencias internacionales.
- Una version nueva invalida automaticamente las aceptaciones de la anterior
  para participar, sin reescribir evidencia historica.
- `withdraw_current_sensitive_participation_consent(version, hash)` registra el
  retiro, deja la cuenta en lectura y no borra contenido ni derechos. Una nueva
  accion afirmativa puede habilitar otra vez la misma version.

## Catalogo cerrado v1 y evidencia en el esquema

| Scope tecnico                         | Superficies cubiertas                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `civic_content_publication`           | `polls`, `debates`, `claims`, `projects` y sus extensiones relacionadas                                 |
| `civic_opinion_and_debate`            | `debate_comments`, `comment_votes`, `project_comments`, respuestas institucionales y fuentes/relaciones |
| `civic_support_and_commitments`       | apoyos de reclamos, compromisos y aportes de proyectos, seguimientos                                    |
| `claims_and_evidence`                 | reclamos, eventos y reservas/publicacion de evidencia en Storage                                        |
| `poll_and_budget_ballots`             | RPCs de voto de encuesta y presupuesto, con recibos privados y tally agregado                           |
| `participation_membership_visibility` | visibilidad de membresia, solicitudes comunitarias y cambios visibles de perfil/residencia              |
| `safety_reports_and_civic_requests`   | reportes y solicitudes comunitarias u organizacionales                                                  |

El `CHECK` exige exactamente esos siete codigos y ese orden. Una superficie
nueva o un cambio de alcance requiere una migracion y una version nueva; no se
aceptan scopes desconocidos en silencio.

## Cobertura autoritativa

0059 falla antes de crear objetos si el inventario de los 25 triggers
`aa_participation_gate` no coincide exactamente con el esperado. El mismo gate
central ya es consumido por:

- RPCs atomicas de publicacion, voto y aportes;
- reservas y finalizacion de uploads;
- RLS que consulta `public.can_participate()`;
- cambios visibles de perfil mediante `private.guard_profile_system_fields()`;
- las 25 tablas con trigger inventariado.

Se mantienen disponibles las acciones necesarias para ejercer derechos o
reducir tratamiento: lectura, exportacion, baja de cuenta, retiro/eliminacion
propia y gestion de notificaciones. Las operaciones internas sin identidad de
usuario conservan el bypass ya existente para migraciones, moderacion y jobs;
0059 no agrega un bypass nuevo.

## Decisiones obligatorias antes de aplicar

1. Aprobar juridica y editorialmente el snapshot exacto en espanol e ingles.
2. Definir la version, fecha de vigencia y SHA-256 canonico del snapshot.
   La base valida formato y exige que la RPC reciba el hash almacenado, pero no
   puede recomputar por si sola `sha256-json-stringify-v1` con la serializacion
   de JavaScript. La migracion que publique el snapshot debe quedar cubierta
   por un checker reproducible equivalente a `scripts/check-legal.mjs` y el
   preflight debe fallar si snapshot y hash divergen.
3. Confirmar si los siete scopes deben aceptarse juntos o si la asesoria exige
   elecciones granulares. El esquema actual representa una unica decision para
   el catalogo completo v1.
4. Definir la retencion de la evidencia vigente e historica. 0059 no agrega un
   TTL arbitrario ni modifica la politica separada de retencion.
5. Implementar la pantalla que muestra el snapshot y envia version + hash +
   accion afirmativa a la RPC; nunca inferir aceptacion desde otra casilla.
6. Agregar el snapshot aprobado a una migracion revisada. Puede incorporarse a
   0059 antes de aplicarla o publicarse despues, sabiendo que el intervalo entre
   ambas mantiene toda participacion bloqueada.
7. Incorporar el consentimiento en los helpers/fixtures normales de tests solo
   despues de aprobar el snapshot. El test focal
   `supabase/tests/sensitive_participation_consent_review.sql` usa un aviso
   explicitamente ficticio dentro de una transaccion y no entra aun al glob
   `*_checks.sql`. Para una revisión explícita existe
   `pnpm db.test.draft-0059:ephemeral -- --acknowledge-ephemeral-local-draft`:
   clona el baseline local 0058, aplica el borrador directamente en la copia sin
   agregarlo al ledger y elimina la base efímera. No ejecutar ese runner sin una
   autorización puntual para aplicar el draft en esa copia local.

## Riesgos residuales del borrador

- Aplicar 0059 sin interfaz y sin version `current` bloquea toda participacion;
  es seguro, pero no es una apertura funcional.
- El catalogo conjunto puede ser demasiado amplio si se exige consentimiento
  granular por finalidad; requiere validacion juridica.
- La evidencia nueva aun no tiene politica de purga: debe resolverse junto con
  la politica de retencion antes de permitir aceptaciones reales.
- Una escritura futura que omita el gate central quedaria fuera. El guard de
  inventario detecta cambios en las tablas actuales, pero toda nueva RPC o tabla
  sensible debe sumar tests y versionar el catalogo.
