# Agorbis · camino mínimo seguro al go-live

> El candidato ampliado del 09-09-2026 incluye seis migraciones nuevas
> (`0062`–`0067`). `0066` prepara el protocolo separado y `0067` activa el
> aviso Google aprobado, sin insertar consentimientos por las personas usuarias.
> La evidencia histórica de 60, 64 o 65 migraciones no certifica este candidato de 66.
> Los verificadores de ledger, backup y D72 fueron preparados para
> exigir el conjunto exacto y conservar la recuperación histórica. Ver
> [plan y pendientes de esta entrega](google-production-readiness.md).

La [aprobación del aviso y su casilla](google-notice-owner-approval-2026-09-09.md)
está registrada; la cobertura específica Google verifica su activación exacta.
`0067` se aplicó sólo a la base local. Los once valores externos pendientes
conservan su estado y Facebook no se agrega como requisito. Los recibos SQL
anteriores conservan su significado; este candidato requiere evidencia nueva
bajo la política Supabase read-only D72 `v4`.

Esta lista separa condiciones de lanzamiento de mejoras posteriores. Un punto
sólo pertenece a **A** si evita un incumplimiento legal o contractual concreto,
pérdida de datos, una vulnerabilidad, exposición de secretos o un fallo crítico
del producto. No convierte una herramienta o proveedor específico en requisito
cuando existe una garantía equivalente.

Fuentes de los tres gates externos: [Ley 25.326, arts. 3, 12, 21 y
24](https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/actualizacion),
[guía AAIP de transferencias](https://www.argentina.gob.ar/transferencias-internacionales),
[DPA de Cloudflare](https://www.cloudflare.com/cloudflare-customer-dpa/) y
[backups de Supabase](https://supabase.com/docs/guides/platform/backups).

## Fase A · política normal y política excepcional

La política normal sigue siendo el camino predeterminado y fail-closed. D72
adopta además una política excepcional de aceptación granular de riesgos: un
runner dry-run emite el acta y un consumidor separado, expirante y de un solo
uso ejecuta el cutover sólo después de la autorización final literal. Esta
lista, el request y el acta por sí solos no autorizan un deployment, una
migración, altas, crons ni cambios en Cloudflare, Supabase Cloud o DNS.

El contrato registra campos separados; ningún valor de una columna sustituye a
otro:

| Campo                 | Valores exactos                                    | Significado                                                                                   |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `RAW_RESULT`          | `PASS`, `FAIL`                                     | Resultado binario original; nunca se reescribe.                                               |
| `EVIDENCE_STATUS`     | `PASS`, `FAIL`, `BLOCKED_EXTERNAL`, `NOT_VERIFIED` | Estado de evidencia; `BLOCKED_EXTERNAL` no concede un waiver.                                 |
| `GATE_POLICY`         | `GATE_REQUIRED`, `NON_WAIVABLE_SECURITY_GATE`      | Política del gate.                                                                            |
| `WAIVER_POLICY`       | `OWNER_EXPLICIT`, `NEVER`                          | Indica si ese ID exacto admite aceptación individual.                                         |
| `RELEASE_DISPOSITION` | `PASS`, `STOP`, `RISK_ACCEPTED_BY_OWNER`           | Decisión final; el riesgo aceptado conserva `RAW_RESULT=FAIL` y nunca se convierte en `PASS`. |
| `SEVERITY`            | `HIGH`, `CRITICAL`                                 | Severidad declarada de la consecuencia.                                                       |

No existe waiver global. Cada riesgo aceptado necesita gate ID, HEAD exacto,
evidencia faltante, consecuencias, owner, aceptación explícita, fecha de
revisión y el `policyVersion`/`policyHash` que fija nombre, tipos de riesgo,
dependencia externa, consecuencia, fuentes y política de waiver. La remediación
y el rollback aplicables permanecen en D72 y en los runbooks referenciados. Una
firma general no cubre otra fila y cambiar el HEAD invalida el acta.
La política `D72/2026-11-01/v6` usa el hash
`59f6283b36a2805ee73710d6f1223d3c98385cf732d72e3eba31dcab4053c03e` y
`authorizedRiskOwner=Sebastian Cardoso Castillo` exactamente; cualquier otro
owner o hash bloquea el request.

La revisión del 07-09-2026 UTC registra la solicitud del responsable de
priorizar la apertura con AAIP y los datos externos de ubicaciones, retención
y salvaguardas pendientes, después de explicarse sus consecuencias. Los siete
riesgos mantienen sus resultados originales y tienen revisión obligatoria
el 14-09-2026 UTC. Los 27 controles no renunciables siguen vigentes. Este
registro no acredita conformidad, confirmaciones `/dev/tty` ni un acta D72.
La revisión v6 (D106) mueve esa fecha, ya vencida, al 30-11-2026 UTC.

### Clasificación inicial de gates

Sólo estos siete IDs tienen `GATE_POLICY=GATE_REQUIRED` y
`WAIVER_POLICY=OWNER_EXPLICIT`. Sin aceptación válida, todo `FAIL` termina en
`RELEASE_DISPOSITION=STOP`:

| Gate ID                                   | Evidencia honesta actual                          | Riesgo principal                                | Disposición excepcional posible                                           |
| ----------------------------------------- | ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- |
| `legal.aaip-registration-pending`         | `BLOCKED_EXTERNAL`; Paso 2 pendiente              | legal/regulatorio, privacidad                   | Aceptar individualmente con ID ausente y aviso de trámite                 |
| `privacy.retention-unreconciled`          | `BLOCKED_EXTERNAL`; reconciliación pendiente      | legal/regulatorio, privacidad, pérdida de datos | Aceptar sin afirmar que los plazos quedaron reconciliados                 |
| `privacy.provider-locations-unverified`   | `BLOCKED_EXTERNAL`; destinos ES/EN no acreditados | contractual, privacidad                         | Aceptar sin inventar ubicaciones ni agruparlo con retención               |
| `privacy.provider-retention-unverified`   | `BLOCKED_EXTERNAL`; retención ES/EN no acreditada | contractual, privacidad                         | Aceptar sin inventar plazos ni agruparlo con ubicaciones                  |
| `legal.transfer-safeguards-unverified`    | `BLOCKED_EXTERNAL`; instrumento no acreditado     | legal/regulatorio, contractual, privacidad      | Aceptar sin afirmar que existe una salvaguarda                            |
| `recovery.production-backup-not-verified` | `NOT_VERIFIED`; backup/restore real no acreditado | pérdida de datos, disponibilidad, operación     | Aceptar con `PRODUCTION_BACKUP_STATUS=not_verified`                       |
| `legal.sensitive-consent-0059-omitted`    | `FAIL`; `0059` sigue como draft                   | legal/regulatorio, privacidad, funcionalidad    | Aceptar la omisión y superficies exactas sin afirmar conformidad jurídica |

Google Drive permanece como subestado informativo `inactive`: sin OAuth,
sincronización, upload, descarga ni restore acreditados. No es un octavo gate
renunciable. Activarlo exige una revisión/versionado nuevo y hoy debe bloquear
por configuración desconocida.

Todos los IDs siguientes tienen
`GATE_POLICY=NON_WAIVABLE_SECURITY_GATE`, `WAIVER_POLICY=NEVER` y requieren
`RAW_RESULT=PASS`, `EVIDENCE_STATUS=PASS` y
`RELEASE_DISPOSITION=PASS` individuales:

| Gate ID                                   | Control obligatorio                                      |
| ----------------------------------------- | -------------------------------------------------------- |
| `source.git-head-clean-and-recoverable`   | HEAD exacto, worktree limpio y fuente recuperable        |
| `security.rls-enforced`                   | RLS y privilegios efectivos                              |
| `security.private-storage`                | Storage privado y acceso mediado                         |
| `security.worker-secrets-confidential`    | Worker Secrets fuera de bundle, logs y acta              |
| `security.auth-functional`                | Auth operativo                                           |
| `operations.smtp-functional`              | SMTP crítico operativo                                   |
| `security.turnstile-a`                    | Turnstile A y Siteverify                                 |
| `security.turnstile-b`                    | Turnstile B contra acceso directo                        |
| `authorization.residency-write-boundary`  | Escrituras limitadas por residencia                      |
| `privacy.no-individual-ballots`           | Ninguna boleta individual persistida o expuesta          |
| `security.anti-abuse-limits`              | Límites antiabuso autoritativos                          |
| `security.csp`                            | CSP defensiva                                            |
| `security.cookies`                        | Cookies defensivas                                       |
| `database.expected-migrations-only`       | Sólo migraciones exactas y autorizadas                   |
| `cloudflare.known-crons-only`             | Crons exactos y conocidos                                |
| `cloudflare.known-bindings-only`          | Bindings exactos y conocidos                             |
| `cloudflare.domain-config-exact`          | Cuenta y Custom Domains exactos                          |
| `data.integrity-no-corruption`            | Integridad y ausencia de corrupción                      |
| `security.secret-scan`                    | Secret scan de repositorio y artefacto                   |
| `quality.build-and-test-suite`            | Build, tipos, lint y suite requerida                     |
| `cloudflare.secret-inventory-exact`       | Inventario remoto exacto sin leer valores                |
| `network.production-dns-integrity`        | DNS y correo sin cambios inesperados                     |
| `quality.production-smoke`                | Smoke remoto GET/HEAD/POST del perfil productivo cerrado |
| `configuration.no-unknown-release-config` | Ninguna configuración de release desconocida             |
| `configuration.auth-providers-aligned`    | Proveedores alineados y consentimiento OAuth acreditado  |
| `configuration.ai-disabled`               | Funciones de IA permanecen deshabilitadas                |
| `legal.pending-external-copy-honest`      | Copy legal activo ES/EN sin afirmaciones no acreditadas  |

La matriz clasifica política, no certifica estados cloud. Un test de la
herramienta, una atestación versionada o un dry-run local no sustituyen la
evidencia remota indicada. Cada gate sólo puede promoverse a `PASS` mediante su
evidencia específica; el éxito de un paso agregado no acredita controles que no
evaluó individualmente.

Desde v5, `configuration.auth-providers-aligned` reemplaza el control que
exigía Google apagado. D97 abrió con Google deshabilitado, Facebook
deshabilitado y correo disponible; desde D122 el objetivo es Google habilitado,
Facebook deshabilitado y correo disponible, con coincidencia entre inventario,
artefacto, Worker y Supabase. Las ubicaciones ES/EN y la cobertura de
consentimiento del proveedor habilitado son obligatorias y no renunciables.
El aviso `2026-08-29.1` excluye Google: confirmar destinos no elimina ese
bloqueo. Facebook en pausa no agrega requisitos al lanzamiento de Google.
Los perfiles cerrado y de recuperación mantienen ambos proveedores apagados.

`legal.pending-external-copy-honest` usa el contenido activo ES/EN
`2026-08-29.1`. Sólo termina en `PASS` cuando la fase local, el ledger remoto y
el build/preflight exactos acreditan sus versiones, snapshots y hashes;
cualquier omisión o diferencia permanece `STOP` y no admite waiver. En el
estado D72 vigente, 0060 fue autorizada, aplicada y verificada en Producción.
La verificación remota del 06-09-2026, sobre el proyecto anterior (D92), confirmó el ledger exacto 60/60
`0001`–`0058` + `0060` + `0061`: `0061_reconcile_sequence_acl_drift.sql` ya
estaba aplicada y el dry-run devolvió `upToDate: true`. No se ejecutaron
migraciones remotas durante esa verificación. 0059 continúa únicamente en
`migration-drafts`. El ledger actualizado no sustituye la evidencia específica
de RLS ni los demás gates del release.

En esta fase `quality.production-smoke` verifica únicamente que el perfil
productivo actualmente desplegado continúe cerrado: GET, HEAD y POST deben
responder 503 fail-closed, con los headers y cookies esperados. Ese `PASS` no
acredita el perfil interactivo. Un deployment futuro requiere autorización y
un smoke interactivo post-deploy separado. El smoke cerrado y el audit de
configuración Cloudflare son read-only respecto de la configuración remota: el
primero envía GET/HEAD/POST al perfil 503 y observa la respuesta HTTP
fail-closed; el segundo usa sólo API GET. El status HTTP no demuestra por sí
solo la ausencia de escrituras. Aunque los probes HTTP terminen correctamente,
`quality.production-smoke` permanece `NOT_VERIFIED` hasta que evidencia
DB/artefacto separada acredite que el POST no escribió. Falta de esa evidencia
o una respuesta distinta de 503 fail-closed terminan en `STOP`.

### AAIP: representación honesta

- Con `AAIP_DATABASE_REGISTRATION_STATUS=pending`, el registration ID debe
  quedar ausente. No se puede llamar a la base “inscripta”; donde corresponda,
  el texto sólo indica que la inscripción está en trámite. El acta conserva
  `BLOCKED_EXTERNAL` y la aceptación individual visible.
- Con `AAIP_DATABASE_REGISTRATION_STATUS=approved`, se exige el número real de
  la constancia aprobada del Paso 2. Se rechazan vacíos, placeholders, estados
  pendientes y referencias `RL`, `EX`, `RE`, `PV` o `IF`.

El preflight normal valida el status y exige `approved` con ID real. El runner
excepcional puede evaluar `pending` con ID vacío, pero sólo continúa si el owner
acepta el gate exacto; ningún modo permite saltearlo con un placeholder.

## A-normal. Obligatorio antes de abrir Agorbis al público

- Completar y obtener la aprobación de la inscripción de la base ante AAIP
  (Paso 2), y conservar su constancia. El
  `RL-2026-81658385-APN-DNPDP#AAIP` identifica al responsable, pero no
  sustituye la inscripción de la base.
- Reconciliar la conservación `Determinable · 1 año` presentada en Paso 2 con
  el tratamiento real. Si fue declarada como máximo general, no abrir hasta
  implementar eliminación/anonimización física de toda categoría personal a
  más tardar a los 365 días. Si el texto presentado tenía otro alcance,
  conservar esa evidencia, validarlo jurídicamente y actualizar los campos
  modificables de la ficha con los plazos/eventos reales antes de afirmar
  cumplimiento. Hoy existen períodos de 5 y 7 años, datos ligados a la vida de
  la cuenta y categorías sin TTL físico completo. Usar la
  [matriz integral](./RETENTION_POLICY.md) sólo como inventario no vigente;
  ningún valor `PENDING_AAIP` o `PENDING_PROVIDER` puede superar este gate.
- Antes de habilitar publicaciones, apoyos o votos que puedan revelar una
  opinión política o un dato de salud, mostrar una explicación específica justo
  antes de la acción y poder acreditar la decisión afirmativa y la versión
  vigente. Prohibir expresamente datos sensibles de terceros y mantener
  reporte, redacción y eliminación. Si ese control no está activo, esas
  superficies permanecen deshabilitadas al abrir el sitio.
- Documentar un mecanismo argentino válido para las transferencias que ocurren
  antes de una acción de consentimiento o sin una decisión anterior vigente y
  acreditable para ese tratamiento. Completar
  `PUBLIC_TRANSFER_SAFEGUARDS` y `PUBLIC_TRANSFER_SAFEGUARDS_EN` sólo con el
  instrumento realmente aplicable. En la arquitectura actual el primer
  receptor HTTP es Cloudflare Workers. El alcance previo incluye lectura pública y, cuando
  corresponda, ingreso, recuperación, seguridad y ejercicio de derechos; el
  consentimiento expreso del aviso sólo puede cubrir los flujos posteriores
  para los que exista una decisión vigente, pero no retroactivamente el primer
  request.
- Corregir la declaración de transferencias: el campo de países quedó vacío.
  No completar destinos hasta contar con evidencia suficiente del proveedor.
  La existencia, alcance y suficiencia de DPA, cláusulas u otras salvaguardas
  permanecen pendientes de acreditación; no presentarlas como incorporadas o
  suficientes. La publicación de datos sensibles de terceros sigue prohibida y
  sujeta a reporte/remoción.
- Mantener un commit limpio, reproducible y sin secretos. Antes del corte debe
  existir al menos una copia recuperable del código fuera del disco de
  desarrollo: el repositorio Git privado o el bundle verificado copiado a otro
  dominio de fallo satisfacen este punto.
- Confirmar el ledger exacto de `ibtvlvpxwourrxwcrfkf`, siempre consultando con
  `--project-ref`. El proyecto nació vacío el 25-10-2026 (D92): antes del push
  el listado remoto no tiene filas y el dry-run enumera las 69 migraciones de
  `supabase/migrations/`; después del push autorizado, el listado muestra
  exactamente esas 69. Mantener 0059 sólo en `migration-drafts` y detener el
  corte si aparece cualquier diferencia.
- Crear el primer backup lógico de Producción de DB y Storage sobre el ledger
  post-0061 exacto y antes de abrir escrituras públicas. Debe tener manifiesto
  y SHA-256 válidos, estar cifrado,
  poder descifrarse y superar el restore ya ensayado. El material de descifrado
  no puede estar junto al paquete. Al menos una copia cifrada debe quedar fuera
  de la máquina de desarrollo; no se exige KeePassXC, una clave OpenPGP
  dedicada ni exactamente dos discos.
- Superar el build y preflight con los valores reales de Production, sin
  placeholders ni secretos públicos. Mantener Auth, RLS, Turnstile A/B, SMTP,
  Storage y los crons en la configuración ya atestada. El inventario público
  versionado debe tener cero valores requeridos pendientes: el `check-open`
  bloquea antes de que Vite compile y el build Cloudflare nunca lee
  `.env.local`.
- Antes del corte, exportar DNS y comprobar que apex y `www` permanecen
  conectados al Worker cerrado: apex con el 503 esperado, `www` con 308 hacia el
  mismo path/query del apex y cero Cron Triggers. Vercel no debe figurar como
  destino DNS web. Verificar que MX, SPF, DKIM y DMARC no cambiaron.
- Confirmar que la `SUPABASE_SECRET_KEY` dedicada a Cloudflare, el
  `CRON_SECRET` exclusivo y el `TURNSTILE_SECRET` A vigente siguen formando el
  inventario remoto exacto 3/3. No reingresarlos ni rotarlos durante la
  apertura. El secret B de Supabase no cambia. Después del smoke, retirar
  variables, tokens y proyecto Vercel y revocar sólo credenciales reemplazadas.
- Desplegar el commit exacto y ejecutar el smoke crítico: health, headers/CSP,
  redirects, Auth por email y recuperación, entrega SMTP, Turnstile A y rechazo
  directo por B, cookies, RLS/Storage y crons sin secreto `401`. Crear el primer
  operador por el flujo normal, verificar TOTP/`aal2` y recién después asignar
  `admin`.

## A-excepcional. Acta previa, sin deployment

La etapa que certifica el release excepcional es exclusivamente dry-run. Se
invoca para cada HEAD candidato con un request JSON explícito; el cutover es un
consumidor separado del acta y nunca forma parte de esta corrida:

```bash
pnpm run release:open:exceptional:dry-run --request <ruta>
```

`<ruta>` debe ser absoluta y estar fuera del worktree; su directorio padre debe
pertenecer al usuario efectivo y tener modo exacto `0700`. Las actas y el
artifact se crean allí con archivos `0600`, conservando limpio el HEAD auditado.

Antes de cualquier subproceso, el runner valida el contrato versionado
`agorbis-exceptional-release-scripts/v12` de los scripts de `package.json` usados
directa o transitivamente por la Fase K y el build. Su SHA-256 exacto es
`6f221d2a7faf949b2eb456ba41a58c524c2531283b055873f227200024f93314`.
`cloudflare-build` repite la validación inmediatamente antes de `pnpm build`.
Una redefinición, incluso si intenta encubrir deploy, migración o DNS detrás de
un nombre permitido, bloquea antes del subproceso correspondiente.

Con el contrato válido, el bloque local intenta siempre las trece validaciones
de `scripts/run-exceptional-release-local-gates.mjs` y acumula sus fallos para
el informe completo. Desde el contrato v11 `lint` ya no encadena `test` ni
`test.release`, así que van como pasos propios (D77):

1. `pnpm lint`;
2. `pnpm test`;
3. `pnpm test.release`;
4. `pnpm build.types`;
5. `pnpm audit --audit-level=low`;
6. `pnpm db.test`;
7. `pnpm test.civic`;
8. `pnpm test.components`;
9. `pnpm test.e2e`;
10. `pnpm test.canary`;
11. `pnpm test.release-open`;
12. `pnpm test.preflight`; y
13. `node scripts/test-cloudflare-public-build-environment.mjs`.

Los únicos comandos Wrangler de esta etapa son `versions upload --dry-run
--strict` contra el config open congelado y `triggers deploy --dry-run` contra
el config congelado de cinco crons. Ambos reciben `--config`, `--cwd` y el
`--env-file` vacío del artifact de forma explícita. Un argumento o una ruta
alternativa bloquean; el runner no solicita ni hereda Worker Secrets.

Después del build, el runner congela fuera del worktree `dist/`, `server/`, los
configs Wrangler aprobados y el env vacío. El árbol, su manifest y el request
quedan ligados por HEAD, policy hash, request hash y artifact hash. El manifest
y los archivos se vuelven a verificar antes y después de cada dry-run.

El request contiene exactamente `schemaVersion`, `policyVersion`, `policyHash`,
`head`, `owner`, `timestampUtc`, `deploymentAuthorized:false` y `risks`. Cada
riesgo contiene `gateId`, `evidenceStatus`, `rawResult`,
`requestedDisposition=RISK_ACCEPTED_BY_OWNER`, `acceptedConsequence` y
`reviewRequiredBy`. No incluye confirmaciones prefirmadas: el runner pide cada
una por `/dev/tty` y sólo entonces la incorpora al acta.

Cada fila exige literalmente
`ACEPTO EL RIESGO <gate-id> PARA <full-head>`. La fila de omisión de `0059`
exige además la segunda frase independiente
`ACEPTO ADEMÁS QUE AGORBIS NO DEBE DESCRIBIRSE COMO JURÍDICAMENTE CONFORME PARA <full-head>`.
No existe una confirmación global que sustituya esas declaraciones.

El runner crea, sin overwrite y con modo `0600`, dos actas junto al request:
`<nombre-sin-.json>.act.json` y `<nombre-sin-.json>.act.md`. Sus exits son:

| Exit | Significado                                                           |
| ---- | --------------------------------------------------------------------- |
| `0`  | Todos los gates en `PASS`, cero excepciones.                          |
| `20` | Dry-run completo con una o más excepciones y aviso `ESTO NO ES PASS`. |
| `1`  | Gate bloqueado o fallo de ejecución.                                  |
| `2`  | Request o uso inválido.                                               |

Estos exits describen resultados posibles, no prometen que la corrida actual
alcance `20`. El dry-run real enumera todos los gates y termina con exit `1`, sin
acta, si cualquier `NON_WAIVABLE_SECURITY_GATE` sigue `FAIL` o `NOT_VERIFIED`.

Para cada ejecución:

1. Registrar el HEAD completo de 40 hexadecimales, worktree limpio, fecha UTC,
   alcance, `RISK_OWNER=Sebastian Cardoso Castillo` y `NO_DEPLOY`.
2. Ejecutar sólo tests locales y el dry-run excepcional. Dentro de éste, las
   únicas consultas remotas admitidas son el smoke HTTP read-only del perfil
   cerrado (GET/HEAD/POST; POST rechazado antes de mutar) y el audit Cloudflare
   API GET-only. Conservar exit codes y errores literales saneados; un dry-run
   fallido sigue fallido. La sonda `POST /registro/` sólo se alcanza después de
   que GET y HEAD acreditan el perfil 503 fail-closed; si esa auditoría previa
   falla, el POST se omite.
3. Enumerar todos los gates, incluidos los no alcanzados por fail-fast. No usar
   un resultado unitario como evidencia de RLS, Storage, Auth, SMTP, DNS,
   Turnstile, bindings, crons o secrets remotos.
4. Exigir `PASS` real de todos los `NON_WAIVABLE_SECURITY_GATE`. Un gate remoto
   desconocido bloquea; no se firma para convertirlo en conocido.
5. Escribir una fila sólo para cada ID solicitado de la lista cerrada de siete:
   AAIP, retención, ubicaciones de proveedores, retención de proveedores,
   salvaguardas, backup productivo y omisión de `0059`.
6. Para backup, registrar exactamente `PRODUCTION_BACKUP_STATUS=not_verified` y
   `RISK_ACCEPTED_BY_OWNER=true` dentro de la fila
   `recovery.production-backup-not-verified`. Conservar además
   `RAW_RESULT=FAIL`, `EVIDENCE_STATUS=NOT_VERIFIED` y
   `RELEASE_DISPOSITION=RISK_ACCEPTED_BY_OWNER`. No adjuntar ni mencionar un
   paquete inexistente.
7. Para Google Drive, registrar `inactive` y la ausencia de OAuth,
   sincronización, upload, descarga y restore acreditados. Es un subestado
   informativo, no un octavo gate renunciable ni una aceptación independiente;
   activarlo debe bloquear como configuración desconocida.
8. Para `0059`, conservar el draft fuera de `supabase/migrations`, no aplicarlo
   y registrar `SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS=draft_not_applied`.
   La aceptación enumera todas las superficies afectadas y advierte que no
   demuestra conformidad jurídica.
9. Hacer que el owner acepte cada consecuencia para ese HEAD con una declaración
   individual. La aceptación no se hereda ni cubre otra fila.
10. Verificar que el acta incluye `schemaVersion`, `policyVersion`,
    `policyHash`, `head`, `owner`, `timestampUtc`, `expiresAtUtc`,
    `requestHash`, `artifactHash`, `gates[]`,
    `commands[]` sólo con label/exit code, `deploymentAuthorized:false`,
    `deploymentExecuted:false`, `productionMutationCommandsExecuted:false` y
    `contentSha256`. Cada fila incluye `facts`: `null` o los subestados
    canónicos de AAIP, backup/Drive y `0059`, sin valores inventados.
11. Terminar después de producir y revisar el acta. No aplicar migraciones,
    activar crons, habilitar altas ni modificar cloud o DNS. El acta vence a
    los 60 minutos y el corte exige la autorización final literal separada.

Cuando el exit sea `20`, el HEAD siga alineado con `origin/main`, el artifact no
haya cambiado y exista la autorización final exacta, ejecutar únicamente:

```bash
pnpm run release:open:exceptional:cutover \
  --request <misma-ruta-absoluta.json> \
  --act-hash <actHash>
```

El dry-run crea además, fuera del worktree y sin overwrite, el issuance canónico
`~/.local/state/agorbis/exceptional-cutovers/issued/<requestHash>.issued.json`.
Ese registro `0600` liga los hashes del acta JSON, su representación Markdown y
el artifact; el cutover exige también que el `actHash` recibido por CLI coincida
exactamente. El consumidor vuelve a auditar Git, el bundle y el perfil closed.
Antes del TTY y otra vez antes del upload, recorre por GET todas las páginas de
Versions y rechaza un marker previo para ese HEAD/acta/artifact. Bajo el lock
publica y relee durablemente una cápsula CLOSED ligada a los
Version/Deployment ID cerrados auditados. Recién entonces pide por `/dev/tty`
`AUTORIZO DEPLOY OPEN DE AGORBIS PARA <full-head> CON ACTA <act-hash>`; tras la
frase vuelve a verificar el bundle, CLOSED, marker y cápsula y crea un claim
atómico `0600` en el path canónico del usuario efectivo —no configurable por
`XDG_STATE_HOME`—. Luego sube la versión congelada. El upload lleva
`workers/tag=<full-head>` y un digest
que liga cuenta, Worker, HEAD, request, policy, acta y artifact. Antes de crons
y promoción, GET del UUID más el inventario paginado deben probar que existe
exactamente un marker y que es ese UUID. Luego instala los cinco crons y mueve
100 % del tráfico a esa versión.

OPEN y recovery comparten el lock global
`~/.local/state/agorbis/exceptional-cutovers/agorbis.production-mutation.lock`.
El lock de kernel queda heredado por cada hijo Wrangler mutante y se mantiene
hasta el receipt o rollback. La exclusión cubre procesos concurrentes del mismo
host, incluso requests distintos; la operación exige un host, operador y UID
designados y confiables. La API Versions no ofrece CAS entre hosts.

Un marker previo, duplicado o no verificable consume/bloquea el acta: no se
reanuda ni se vuelve a subir; se conserva/restaura closed y se genera un nuevo
HEAD, request, artifact, acta e issuance tras una recertificación completa. Si
Wrangler vence el timeout, el runner espera su terminación confirmada —SIGTERM
y, si hace falta, SIGKILL— antes de inspeccionar estado remoto o iniciar
rollback. Ante cualquier fallo posterior al claim, restaura el Version ID
closed auditado, quita los crons y exige nuevamente el perfil 503. El claim
local y el marker remoto protegen replays secuenciales. No existe un script
genérico `deploy` para abrir Producción.

Si el proceso murió o el rollback automático quedó incierto después del claim,
usar únicamente la cápsula ya publicada:

```bash
pnpm run release:open:exceptional:recover-closed \
  --request-hash <requestHash> \
  --act-hash <actHash>
```

Recovery pide por `/dev/tty` `AUTORIZO RECOVERY CLOSED DE AGORBIS PARA
<requestHash> CON ACTA <actHash>`, no depende del artifact original ni de la
vigencia del acta y sólo reconcilia el Version ID closed ligado más cero crons.
La cápsula usa un pointer hardlink; su backup y restore deben preservar
hardlinks (`tar` o `rsync -H`) o recovery la rechazará. Recovery histórico debe
ejecutarse desde código versionado compatible con el `policyHash` del claim.

El state root canónico `~/.local/state/agorbis/exceptional-cutovers/` queda
fuera del worktree y usa esta topología cerrada:

```text
issued/<requestHash>.issued.json
agorbis.production-mutation.lock
<requestHash>.claim.json
<requestHash>.wrangler.ndjson
<requestHash>.receipt.json
<requestHash>.closed-capsule.pointer.json
<requestHash>.<capsuleHash>.<nonce>.closed-capsule/
<requestHash>.recovery.<attemptId>.journal.json
<requestHash>.recovery.<attemptId>.receipt.json
```

El mismo UID controla worktree, binarios y credenciales, por lo que se considera
confiable; no compartir ese usuario operativo con procesos no confiables.

## B. Recomendable inmediatamente después del lanzamiento

- Automatizar el backup lógico diario y aplicar la retención 14 diarios,
  8 semanales y 12 mensuales; agregar una segunda copia cifrada independiente.
- Mantener tanto el remote Git privado como un bundle cifrado independiente;
  para el corte inicial alcanza uno de los dos fuera del equipo principal.
- Completar exports redacted de Auth, SMTP, DNS, Turnstile y Workers, el registro
  de secretos y la custodia de códigos de recuperación de todas las cuentas.
- Conservar y seguir los pedidos contractuales a Supabase, Resend y Cloudflare.
  Sus respuestas mejoran la evidencia y pueden exigir cambios posteriores,
  pero no se esperan como un conjunto si el consentimiento expreso cubre esos
  flujos posteriores y no aparece una prohibición contractual concreta.
- Instalar monitor externo de health/cron, correo canario y log drain con
  retención y acceso restringidos; hasta entonces revisar manualmente cada día.
- Ejecutar una prueba de carga progresiva y revisar los hallazgos no críticos de
  Performance Advisor.
- Confirmar el primer backup administrado de Supabase posterior a `0058` y
  mantener el restore drill trimestral.

## C. Hardening opcional

- KeePassXC como producto concreto, una identidad OpenPGP exclusiva para
  Agorbis y exactamente dos SSD físicos.
- PITR, R2, firma criptográfica adicional del manifiesto o un proveedor nuevo
  de copias.
- Un entorno cloud separado de canary; Supabase local, dry-run, una ventana breve
  de corte y rollback de versión cubren el lanzamiento inicial.
- Facebook OAuth, resúmenes de IA y otras funciones fuera del alcance aprobado.
  La preparación de Google sigue su [plan específico](google-production-readiness.md)
  y conserva sus bloqueos de evidencia, consentimiento y validación real.
- Automatizaciones adicionales cuando ya existe un control manual equivalente.

## Secuencia de corte preparada

> Esta secuencia corresponde a la política normal y se conserva para una
> autorización de corte futura. D72/Fase A no autoriza ejecutar ninguno de sus
> pasos mutantes ni los comandos de deployment que aparecen debajo.

Usar Node `22.22.0` y Supabase CLI `2.115.0`. Los comandos cloud de Supabase
escriben siempre el ref completo y nunca usan `--linked`.

1. Congelar el commit y preparar el worktree/store nuevos con `umask 0022` según
   la [materialización reproducible del release](PRODUCTION_RUNBOOK.md#materialización-reproducible-del-release),
   sin reutilizar ni borrar el `node_modules` habitual. Desde ese worktree,
   ejecutar `pnpm verify` (lint + test + test.release: desde el contrato v11
   `lint` solo ya no corre vitest ni los gates de release, D77),
   `pnpm build.types`, `pnpm audit --audit-level=low`,
   `pnpm db.test`, `pnpm test.e2e` y `pnpm build.cloudflare` contra Supabase
   local.
2. Confirmar que AAIP —incluida la reconciliación del año declarado—,
   Cloudflare, el mecanismo del primer request y el control de participación
   sensible están cerrados; cargar únicamente entonces los dos textos reales de
   salvaguardas en Production.
3. Repetir el listado y dry-run:

   ```bash
   pnpm exec supabase migration list \
     --project-ref "ibtvlvpxwourrxwcrfkf"
   pnpm exec supabase db push \
     --project-ref "ibtvlvpxwourrxwcrfkf" \
     --dry-run \
     --skip-vault
   ```

   Antes del primer push el listado remoto está vacío y el dry-run enumera las
   69 migraciones; el push real se ejecuta una sola vez, con autorización
   expresa del responsable y la contraseña de la base por teclado (D92).
   Después, el listado debe mostrar exactamente esas 69 y el dry-run quedar sin
   pendientes. 0059 no puede aparecer en el ledger. Verificar nuevamente lint,
   diff y advisors antes del corte.

4. Verificar las 69 filas exactas, lint/diff/advisors y crear inmediatamente el
   backup de Producción con `pnpm backup:supabase:production`. El runner acepta
   hoy sólo `post-0061` a `post-0067`: antes del corte hay que sumarle el ledger
   `post-0072` (D92), desde D109 `post-0073`, desde D118 `post-0074` y desde
   D120 `post-0075` y desde D127 `post-0076`; debe seguir rechazando 0059 o
   cualquier otra migración.
   Cifrarlo, verificar el paquete y probar su descifrado antes de abrir el
   dominio.
   Para el catálogo cloud observado el 08-09-2026, seguir el selector explícito
   de perfil y las restricciones de restore de
   [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md); no marcar el ensayo de
   recuperación aprobado sólo por disponer de un archivo cifrado verificado.
5. Desde el worktree limpio, comprobar la identidad con
   `pnpm exec wrangler whoami` y que la cuenta sea
   `4d78fb10c1ae65281ec851479d5045dc`. Comprobar que
   `CLOUDFLARE_WORKERS_PLAN=paid` coincide con el plan efectivo y que
   `CLOUDFLARE_ZONE_DYNAMIC_CACHE_RULES_REVIEWED=true` tenga evidencia fechada.
   Para el corte inicial, el responsable confirmó manualmente el 26-08-2026:
   0 Cache Rules activas, 0 Cache Response Rules activas, 0/3 Page Rules, sin
   Cache Everything, Edge TTL forzado ni reglas sobre HTML/Auth, y sin realizar
   cambios. Para revisiones futuras puede usarse
   `pnpm cloudflare:cache-audit -- --output-root <ruta-absoluta-fuera-del-repo>`;
   Cache Response Rules se revisa además en Dashboard mientras no esté cubierta
   por ese gate. Cargar los tres Worker Secrets mediante los prompts
   secuenciales del
   [`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md#despliegue), nunca desde
   `.env.local`, y exigir el inventario exacto 3/3. Confirmar el deployment
   cerrado ya activo: ambos custom domains, apex 503, `www` 308, cero crons y el
   Version ID cerrado registrado.

   Sólo después del smoke cerrado generar el request/acta/artifact excepcional
   y ejecutar el cutover consumible descrito arriba. Antes, exportar DNS y confirmar que ambos
   custom domains siguen conectados y el correo permanece intacto; no retirar
   registros web. Después del deploy, ejecutar:

   ```bash
   ./node_modules/.bin/wrangler secret list --name agorbis --cwd /tmp --format json |
     node scripts/cloudflare-secret-inventory.mjs
   ```

   El gate debe confirmar exactamente `CRON_SECRET`, `SUPABASE_SECRET_KEY` y
   `TURNSTILE_SECRET`. El output de deploy debe confirmar Worker `agorbis`, los
   dos custom domains y, únicamente en la fase abierta, los cinco Cron Triggers.
   El rollback inmediato es el Version ID cerrado registrado;
   `pnpm deploy:closed` mantiene los dominios conectados y reconcilia los crons a
   cero.

6. Ejecutar primero el smoke no destructivo, que está fijado a
   `agorbis.com` y al project ref de Producción y sólo necesita las dos
   credenciales públicas:

   ```bash
   PUBLIC_SUPABASE_URL="https://ibtvlvpxwourrxwcrfkf.supabase.co" \
   PUBLIC_SUPABASE_ANON_KEY="sb_publishable_..." \
   pnpm smoke:production:readonly
   ```

   Luego ejecutar los casos Auth/SMTP/TOTP con una cuenta canaria controlada.
   Los cinco crons se prueban de forma stateful sólo dentro de la ventana de
   corte, después de revisar que sus efectos de housekeeping sean seguros:

   ```bash
   read -rsp "CRON_SECRET: " CRON_SECRET && printf '\n'
   export CRON_SECRET
   AGORBIS_PRODUCTION_CRON_SMOKE_CONFIRM="RUN_AGORBIS_PRODUCTION_CRONS" \
   pnpm smoke:production:crons
   unset CRON_SECRET
   ```

   El prompt no imprime ni incorpora el secret al historial. Ante cualquier
   fallo crítico, revertir el deployment y no abrir el registro.

7. Confirmar apex y `www`, que `workers.dev`/preview URLs están deshabilitados,
   abrir `agorbis.com`, repetir el smoke público mínimo y observar Workers Logs
   durante la ventana de corte.

Los comandos detallados, el rollback y el acta de evidencia permanecen en
[`PRODUCTION_RUNBOOK.md`](PRODUCTION_RUNBOOK.md) y
[`BACKUP_AND_RESTORE.md`](BACKUP_AND_RESTORE.md).
