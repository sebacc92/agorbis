# Agorbis · backup y recuperación

Este procedimiento es la estrategia mínima de la política normal de lanzamiento. Mientras
el proyecto esté en Supabase Free (D91) no hay backup administrado: la única
capa es la exportación lógica propia de DB y Storage, con un paquete cifrado
verificable fuera de la máquina que lo genera; al pasar a Pro se suma el backup
diario administrado. No
incorpora R2 ni PITR. El tooling nunca restaura en cloud, nunca usa `--linked`
y fija el project ref de Producción en `ibtvlvpxwourrxwcrfkf`.

Google Drive es el destino off-host elegido para una **transferencia manual
futura** a `Agorbis - Backups cifrados/Producción/`. En esta fase no existe una
copia remota acreditada: no se configuró OAuth, no se montó ni sincronizó Drive
y no se subió ningún archivo. Esta dependencia externa debe incorporarse al
inventario de proveedores y queda pendiente de validación jurídica y
documental antes de usar datos reales.

## Estado actual al 08-09-2026

Se creó `backup-20260908T232222Z` desde el commit limpio `de75cb1`: base
productiva con 60 migraciones hasta `0061` y exportación de Storage. El paquete
`.tar.gpg` ocupa 781.782 bytes; su descifrado, inventario interno y checksums
se verificaron antes de publicarlo. El SHA-256 del archivo cifrado es
`569e22285598898b328e6ebdd1e7bcae043e87f92b8b094bb20ae7d023dc0ab6`.
El original y su `.sha256` están fuera del repositorio, en la carpeta local
elegida por el responsable. No se subieron a Drive ni se acredita otra copia
fuera de la máquina.

El ensayo de restore sigue **pendiente**. La
[revisión de compatibilidad](supabase-cloud-restore-review-2026-09-08.md)
encontró siete índices cloud adicionales, además de las diferencias Iceberg y
ACL conocidas. También exige baseline de aplicación post-0061, aislamiento
cifrado de Docker y respetar el commit del backup. Estos resultados no cambian
las actas históricas ni convierten el gate completo de recuperación en PASS.

## Estado excepcional D72

Al 29 de agosto de 2026 no hay evidencia de que el primer backup real de
Producción haya sido ejecutado. El estado correcto es:

```text
GATE_ID=recovery.production-backup-not-verified
PRODUCTION_BACKUP_STATUS=not_verified
RISK_ACCEPTED_BY_OWNER=true
RISK_OWNER=Sebastian Cardoso Castillo
```

`RISK_ACCEPTED_BY_OWNER=true` pertenece exclusivamente a esa fila del acta, para
un HEAD exacto. Es la confirmación booleana del owner, no el resultado del gate:
la fila conserva `RAW_RESULT=FAIL`, `EVIDENCE_STATUS=NOT_VERIFIED` y
`RELEASE_DISPOSITION=RISK_ACCEPTED_BY_OWNER`. No es una variable global, no
convierte `not_verified` en `PASS`, no prueba que exista un dump, manifiesto,
checksum, cifrado, restore o RPO/RTO productivo y no acepta ningún otro riesgo.

Google Drive se registra como subestado informativo `inactive`. No se configuró
OAuth, cliente, montaje o sincronización; no se subió, descargó ni restauró un
paquete real. La carpeta informada no es evidencia de una copia. No es un
octavo gate renunciable ni recibe una aceptación separada mientras siga
inactivo; activarlo exige revisión/versionado y hoy debe bloquear por
`configuration.no-unknown-release-config`.

La certificación excepcional sigue siendo exclusivamente dry-run. No ejecuta
ningún comando de backup de este documento, no crea ni borra ese material y no
autoriza un deployment. Genera un artifact congelado, las actas JSON/Markdown y
el issuance externo ligados al HEAD/request/policy/artifact. El cutover es un
consumidor separado y sólo puede invocarse con el request y act hash exactos:

```bash
pnpm run release:open:exceptional:cutover \
  --request <misma-ruta-absoluta.json> \
  --act-hash <actHash>
```

Ante un crash posterior al claim, la recuperación CLOSED también es separada:

```bash
pnpm run release:open:exceptional:recover-closed \
  --request-hash <requestHash> \
  --act-hash <actHash>
```

OPEN y recovery comparten un lock global por cuenta/Worker en el mismo host,
operador y UID designados. El cutover publica atómicamente una cápsula CLOSED
antes del upload. Su pointer es un hardlink: todo backup y restore del state
root canónico `~/.local/state/agorbis/exceptional-cutovers/` debe preservar
hardlinks con `tar` o `rsync -H`; una copia que los rompa será rechazada por
recovery. No abrir Producción con un `wrangler deploy` manual o un deploy
genérico.

Los gates y comandos existentes conservan su significado y deben seguir
fallando mientras falte evidencia; en particular, una excepción no puede hacer
pasar `recovery-inventory --require-ready`.

El riesgo residual aceptable por esta vía es pérdida total o parcial de datos y
mayor tiempo o imposibilidad de recuperación ante corrupción, borrado,
indisponibilidad o pérdida del proveedor/proyecto. No se atenúa afirmando que el
drill local o el backup administrado del proveedor equivalen al backup
productivo propio que falta.

Fuentes operativas: [backups de Supabase](https://supabase.com/docs/guides/platform/backups),
[precios de Supabase](https://supabase.com/pricing) y
[manual de GnuPG](https://www.gnupg.org/documentation/manuals/gnupg/).

## Arquitectura mínima para el lanzamiento normal

1. **Capa administrada:** sólo desde Supabase Pro, que toma backups físicos
   diarios y conserva siete días. En Free (D91) esta capa no existe y la
   exportación propia es la única copia. Tampoco incluye los bytes de Storage y
   se elimina junto con el proyecto.
2. **Exportación propia:** antes de abrir al público se genera una exportación
   lógica `v5` completa de DB y Storage, sin mutaciones concurrentes.
3. **Cifrado y prueba:** se crea un `.tar.gpg` con GnuPG, usando una frase
   simétrica de alta entropía (por ejemplo, seis o más palabras elegidas al
   azar, no una frase humana predecible) introducida sólo por pinentry, o una
   clave OpenPGP ya controlada. El empaquetador obliga a descifrarlo
   inmediatamente y vuelve a validar identidad, manifiesto y los 25 checksums
   antes de publicar el resultado.
4. **Copia independiente:** después de probar localmente cifrado, descifrado y
   restore, se colocan en un directorio local de transferencia privado sólo el
   ciphertext `.tar.gpg` y su `.tar.gpg.sha256`. El responsable sube ambos
   manualmente a Google Drive. La copia remota se acredita recién después de
   descargar ambos a otro directorio local y repetir checksum, descifrado y
   restore; la existencia de la carpeta remota no es evidencia suficiente.
5. **Credencial separada:** la frase o clave capaz de descifrar se custodia
   independientemente del paquete, mediante un gestor cifrado confiable,
   hardware seguro o custodia offline equivalente. Nunca se pasa por argv,
   variables de entorno, archivos temporales, chat ni repositorio.

**Recomendable inmediatamente después del lanzamiento:** agregar una segunda
copia independiente, automatizar la ventana diaria y formalizar el gestor de
secretos elegido. **Hardening opcional:** usar KeePassXC en particular, crear
un par OpenPGP dedicado, comprar exactamente dos SSD, sumar R2 o activar PITR.

Costo incremental mínimo: GnuPG, USD 0, y el almacenamiento de Google Drive que
el responsable controle. El costo y las condiciones del proveedor deben
validarse antes de la primera copia. Supabase Free no agrega costo; Pro parte
de USD 25/mes y suma los backups físicos diarios (D91). PITR no se activa al
lanzamiento.

## Objetivos y retención

- **RPO operativo:** 24 horas. El backup propio se ejecuta diariamente después
  del backup físico; una exportación inestable se rechaza y se repite en la
  siguiente ventana controlada.
- **RTO objetivo:** 4 horas para una recuperación pequeña con accesos y medios
  disponibles; 8 horas para reconstrucción completa en un proyecto cloud nuevo
  más validaciones y DNS.
- **RTO medido local:** 291.996184353 segundos (4 min 51.996 s) para el
  restore drill completo. No equivale al RTO cloud: no incluye provisión,
  rotación de claves, configuración de Auth/SMTP ni cambio DNS.
- **Retención propia:** 14 diarios, 8 semanales y 12 mensuales. Google Drive
  deberá conservar esa rotación cuando la dependencia y el primer round-trip
  queden validados; todavía no se afirma que exista esa copia.
- **Ensayo:** trimestral y después de cambios importantes de Supabase CLI,
  Postgres, Auth, Storage o formato de backup.

La retención debe reflejarse en el registro AAIP. Los paquetes contienen datos
de Auth, sesiones, participación cívica y potencialmente datos sensibles: no se
guardan indefinidamente ni se usan como datasets de desarrollo.

## Qué garantiza el formato `v5`

Cada paquete contiene:

- `roles.sql`, `schema.sql`, `data.sql` y el ledger
  `supabase_migrations` por separado;
- una referencia de schemas administrados Auth/Storage que sólo se compara y
  nunca se aplica;
- inventario exacto de tablas administradas, owners, columnas y ACL según el
  perfil seleccionado: 31 local o 29 cloud auditado;
- 22 `COPY` Auth y 7 `COPY` Storage en local, o 5 Storage en el perfil cloud;
- exclusión únicamente de `storage.buckets_vectors` y
  `storage.vector_indexes`, y sólo cuando tienen cero filas;
- buckets, metadata y blobs Storage content-addressed por SHA-256;
- las 11 plantillas Auth y el inventario de recuperación;
- `backup-manifest.json` y `SHA256SUMS.backup` con permisos restrictivos.

El gate consulta el ledger real y exige un estado completo, una vez cada ID.
El creador admite `post-0061` (60: `0001`–`0058` + `0060` + `0061`),
`post-0065` (64: ese inventario más `0062`–`0065`), `post-0066` (65: el
inventario post-0065 más `0066`) o `post-0067` (66: el inventario post-0066
más `0067_activate_google_auth_notice.sql`). Se valida el mismo estado y hash antes y después de capturar;
no se admite migrar durante el backup. El restore conserva además los paquetes
históricos `pre-0060` y `post-0060`. Un checkout histórico no certifica un
ledger futuro, ni un paquete post-0065 o post-0066 se reetiqueta post-0067. Ningún estado
admite 0059, gaps ni otras migraciones. `0059` debe continuar ausente de
Producción y existir sólo en `supabase/migration-drafts`. Antes y después de
descargar Storage repite y compara canónicamente roles, schema, data,
schema/data del ledger, referencia administrada, catálogo Auth/Storage y ACL.
Storage se vuelve a listar y descargar mediante su API oficial.

`0066` incorpora avisos/decisiones Google y barreras de revocación; sus tablas,
funciones, trigger, ACL y RLS forman parte del esquema/restauración. Restaurar
esas estructuras no aprueba un aviso ni habilita Google. La migración original
las crea vacías; un backup posterior debe conservar el estado realmente
respaldado sin inventar aceptaciones. En una reversión de Worker conservar
también estos datos y usar una corrección SQL hacia adelante si corresponde.
`0067` agrega el aviso Google aprobado; una copia post-0067 debe conservar
ese snapshot, versión, hash y aprobación sin convertirlos en consentimientos
individuales. Las copias post-0066 mantienen su estado histórico exacto.

Esto demuestra **estabilidad observada**, no una snapshot distribuida atómica.
Para el primer backup, hacerlo antes del deployment público y sin otras
mutaciones cloud. Después del lanzamiento, usar una ventana de baja actividad;
si se necesita garantía transaccional estricta, hay que implementar una breve
ventana read-only que también cubra Auth y accesos directos a Supabase. El
tooling actual no afirma ni impone esa salvaguarda.

SHA-256 detecta corrupción accidental cuando el valor esperado conserva una
cadena de confianza independiente. El `.sha256` adyacente permite verificar
una transferencia, pero no autentica por sí solo el ciphertext si ambos fueran
reemplazados juntos. OpenPGP aporta confidencialidad y detección interna de
modificaciones, pero el modo public-key sin firma no autentica al creador. El
hash no sustituye el cifrado, la firma cuando corresponda ni la custodia
independiente de la credencial/evidencia.

## Backup local y restore certificado

Supabase local debe estar iniciado. El destino es persistente, fuera del repo y
con una ruta nueva:

```bash
backup_dir="$HOME/.local/share/agorbis-restore-drills/$(date -u +%Y%m%dT%H%M%SZ)"
pnpm backup:supabase:local -- \
  --output-dir "$backup_dir" \
  --with-drill-fixture
```

El fixture crea un bucket privado y un blob de 87 bytes; el `finally` los retira
del origen. El drill usa un segundo stack temporal, aislado en loopback, y
ejecuta:

1. `roles.sql` como `supabase_admin`;
2. `schema.sql` y `data.sql` como `postgres`;
3. schema y data del ledger como `postgres`;
4. blobs por Storage API;
5. suite SQL, Auth, RLS, lint y diffs;
6. cleanup exacto de containers, volumes, networks y directorios temporales.

`migration-history-schema.sql` sólo puede contener los `ALTER OWNER` auditados
del schema `supabase_migrations`. Nunca se restauran
`auth.schema_migrations` ni `storage.migrations`; nunca se aplica
`managed-schema-reference.sql`.

El drill verde final del release candidate, ejecutado el 25 de agosto de 2026
sobre el backup `20260825T172959Z`, restauró 58/58 migraciones (`0001`–`0058`),
las 65 migraciones administradas de Storage (`0`–`64`), Auth, usuarios,
identidades, sesiones/MFA, 86 tablas, 100 policies, 193 funciones, tres buckets,
el fixture completo, las 11 plantillas y el inventario recuperable v1. Lint
`public/private` terminó sin findings y las ocho warnings administradas fueron
idénticas source↔target. El diff canónico quedó limpio; la API oficial de
Storage sólo regeneró `metadata`, `updated_at` y `version`, conservando bytes,
ruta, SHA-256, ID, `owner`, `owner_id` y `user_metadata`. El origen quedó
intacto, no hubo containers, volumes, networks ni directorios temporales
residuales, y el tiempo total medido fue exactamente `291.996184353` segundos
(4 min 51.996 s).

Sólo el formato actual (`v5`) se acepta para nuevos drills. Los backups `v1–v4`
se conservan y sus checksums siguen siendo verificables, pero el restore runner
no promete restaurarlos.

## Backup de Producción: procedimiento y perfiles

El 8 de septiembre de 2026 el primer intento se detuvo antes del dump: el
catálogo productivo tiene 29 tablas administradas, frente a las 31 del stack
local fijado. La comparación del catálogo completo confirmó que faltan
`storage.iceberg_namespaces` y `storage.iceberg_tables`; las columnas y owners
de las 29 tablas comunes coinciden. En `storage.buckets` y `storage.objects`
los ocho grants del administrador de Storage a sí mismo tienen `grantable=true`,
sin diferencias de privilegios efectivos ni permisos de columnas. Las
migraciones de Storage v1.70.7 omiten las tablas Iceberg en modo multitenant;
esta diferencia no demuestra una versión cloud más antigua.

El perfil explícito `supabase-cloud-storage-v1.70.7-20260908` fija todas las
firmas de ese catálogo y la política `/v3`: 29 tablas inventariadas y 27 COPY
incluidos (22 Auth y 5 Storage). Las dos tablas Vector siguen exigiéndose vacías
y excluidas; no se incorporan historiales administrados. No se acepta un
subconjunto aprendido durante la captura. El perfil local histórico `/v1`
conserva sus 31 tablas, 29 COPY y hashes anteriores.

Ambos perfiles usan backup v5. La verificación del perfil cloud exige la fuente
productiva autorizada y un commit limpio, además de los controles existentes.
El restore runner rechaza este perfil antes de invocar Docker: faltan auditar
la compatibilidad DDL/ACL del destino y disponer de almacenamiento cifrado para
sus volúmenes. Un archivo cifrado verificado no equivale a un ensayo de
recuperación aprobado ni cierra ese gate de lanzamiento.

La única credencial que se escribe durante cada ejecución es
`SUPABASE_DB_PASSWORD`, directamente en una terminal con eco deshabilitado. No
se pasa por argv, pipe, chat, repo, Worker binding ni archivo. Debe recuperarse desde el
gestor y pegarse en el prompt.

Preparación única:

1. preparar scratch local cifrado, un directorio local para paquetes cifrados y
   otro directorio local de verificación; ninguno puede estar sincronizado;
2. asegurar que `.env.local` sea `600` y contenga la nueva
   `SUPABASE_SECRET_KEY=sb_secret_...` de Producción; el runner lee sólo esa
   entrada y prohíbe `SUPABASE_DB_PASSWORD` en el archivo;
3. mantener la sesión del CLI de Supabase o un `SUPABASE_ACCESS_TOKEN` temporal;
4. dejar el repositorio en un release commit limpio;
5. confirmar el ledger productivo exacto que se respaldará: `post-0061`
   (60 migraciones), `post-0065` (64), `post-0066` (65) o `post-0067` (66), según los inventarios
   completos descritos arriba, siempre con 0059 ausente, sin gaps ni migraciones
   desconocidas; el runner comprueba que el estado y su hash coincidan antes y
   después de capturar;
6. no realizar cambios en Supabase durante la exportación.

```bash
pnpm backup:supabase:production -- \
  --managed-profile supabase-cloud-storage-v1.70.7-20260908 \
  --output-dir "$HOME/.local/share/agorbis-production-backups/AAAA-MM-DDTHH-MM-SSZ"
```

El runner pide la contraseña por `/dev/tty`, fija el project ref, usa Node 22 y
CLI 2.115.0, no hereda Resend/Turnstile u otros secretos hacia subprocessos y
borra el directorio incompleto si un gate falla. La `sb_secret_` es privilegiada;
la frase “sólo lectura” describe el comportamiento del script, no los permisos
de la clave.

En Producción, Supabase CLI 2.115.0 se usa únicamente para derivar y validar el
endpoint mediante su `db dump --dry-run`; el shell emitido no se ejecuta. Las
consultas y las seis clases inventariadas de dump corren en el contenedor
Postgres fijado por image ID, con Supabase Root 2021 CA versionada y pinneada,
montada read-only, y TLS `verify-full`. Una rotación de CA o endpoint debe
actualizar primero los pins y tests fail-closed; mientras no coincidan, el
backup queda bloqueado.

Después se cifra. El camino mínimo no requiere crear una clave: GnuPG solicita
y confirma una frase robusta mediante su pinentry, nunca mediante Node ni la
línea de comandos. Crear previamente los directorios locales reales; el
empaquetador rechaza rutas inexistentes o symlinks. Ninguna de estas rutas debe
ser una carpeta de Google Drive montada o sincronizada:

```bash
install -d -m 700 "$HOME/.local/share/agorbis-production-backups"
install -d -m 700 "$HOME/.local/share/agorbis-encrypted-packages"
install -d -m 700 "$HOME/.local/share/agorbis-encrypted-verification"
pnpm backup:package:encrypted -- \
  --backup-dir "$HOME/.local/share/agorbis-production-backups/AAAA-MM-DDTHH-MM-SSZ" \
  --destination-dir "$HOME/.local/share/agorbis-encrypted-packages" \
  --verification-work-dir "$HOME/.local/share/agorbis-encrypted-verification" \
  --symmetric
```

Como alternativa, una clave OpenPGP existente y controlada sirve sin que sea
dedicada; la prueba inmediata necesita acceso a su clave privada y pinentry:

```bash
pnpm backup:package:encrypted -- \
  --backup-dir "$HOME/.local/share/agorbis-production-backups/AAAA-MM-DDTHH-MM-SSZ" \
  --destination-dir "$HOME/.local/share/agorbis-encrypted-packages" \
  --verification-work-dir "$HOME/.local/share/agorbis-encrypted-verification" \
  --recipient-fingerprint "FINGERPRINT_GPG_COMPLETO"
```

Para el primer go-live, usar `--symmetric` salvo que el modo public-key incluya
además una firma o el SHA-256 esperado quede custodiado por un canal
independiente: cifrar sólo a una clave pública no autentica por sí mismo quién
creó el paquete.

El empaquetador verifica primero los 25/25 checksums del formato `v5`, usa
`tar` ordenado, escribe mediante `.partial`, descifra en un directorio temporal
`700`, valida nuevamente el `backup-manifest.json` detallado y
`SHA256SUMS.backup` que permanecen dentro del ciphertext, y elimina ese
temporal. Sólo entonces publica sin reemplazo los **dos** artefactos de
transferencia `v3`: `<basename>.tar.gpg` y `<basename>.tar.gpg.sha256`; ambos
quedan `600`. Hace `fsync` de archivos y directorio y revalida el resultado
durable; nunca elimina el backup fuente. No genera manifiesto detallado
exterior, fingerprint ni listado de objetos. La salida JSON saneada puede
informar formato, basenames seguros, tamaño, SHA-256 y hora de verificación,
pero no se copia como tercer archivo.

Los directorios existentes deben pertenecer al operador, ser `700` y estar en
un filesystem que soporte hardlinks y `fsync`; el tooling los valida pero no
cambia sus permisos. Los nuevos paquetes aceptan sólo backups `v5`. El
verificador mantiene compatibilidad de lectura con manifiestos exteriores
históricos `v1` y `v2` mediante `--package-manifest`, pero una transferencia
nueva exige el par `v3`; no debe copiar esos manifiestos históricos a Google
Drive. Para verificar el paquete local antes de transferir:

```bash
pnpm backup:verify:encrypted -- \
  --package "$HOME/.local/share/agorbis-encrypted-packages/AAAA-MM-DDTHH-MM-SSZ.tar.gpg" \
  --checksum "$HOME/.local/share/agorbis-encrypted-packages/AAAA-MM-DDTHH-MM-SSZ.tar.gpg.sha256" \
  --verification-work-dir "$HOME/.local/share/agorbis-encrypted-verification"
```

El directorio de trabajo debe existir, tener espacio suficiente y residir en
un filesystem local cifrado: durante la prueba contiene datos en claro y el
script lo elimina al terminar. Para preparar la transferencia manual, usar una
ruta local privada fuera de cualquier árbol sincronizado. El comando crea o
valida el directorio `700`, copia sólo dos archivos `600`, verifica sus bytes y
no conecta con Google:

```bash
install -d -m 700 "$HOME/.local/share/agorbis-backup-transfer/production"
pnpm backup:copy:encrypted -- \
  --package "$HOME/.local/share/agorbis-encrypted-packages/AAAA-MM-DDTHH-MM-SSZ.tar.gpg" \
  --checksum "$HOME/.local/share/agorbis-encrypted-packages/AAAA-MM-DDTHH-MM-SSZ.tar.gpg.sha256" \
  --destination-dir "$HOME/.local/share/agorbis-backup-transfer/production"
```

El responsable debe subir manualmente **exactamente** esos dos basenames a
`Agorbis - Backups cifrados/Producción/`. La frase o clave de descifrado, los
manifiestos interiores y cualquier salida detallada quedan fuera de Drive.
Después debe descargar ambos archivos a una ruta local distinta, por ejemplo
`$HOME/.local/share/agorbis-backup-download/production`, volver a ejecutar
`backup:verify:encrypted` y completar el restore local. El directorio descargado
debe ser `700` y ambos archivos deben restringirse a `600` antes de verificarlos.
Sólo ese round-trip permite marcar la copia remota como verificada.

Para dimensionar espacio, sea `B` el tamaño del backup en claro y `C` el del
ciphertext. Durante el empaquetado y su prueba pueden coexistir el scratch `B`,
el ciphertext `C`, un tar descifrado de hasta aproximadamente `B` y su
extracción de hasta aproximadamente `B`: reservar como mínimo `3B + C`, más el
espacio independiente que necesite el stack Docker del restore. El directorio
de transferencia necesita `C` más el checksum pequeño. Antes de usar datos
reales hay que medir `B`, verificar espacio libre y conservar margen operativo;
no hay un máximo numérico acreditable sin medir Producción.

Antes de retirar el staging en claro, el backup productivo concreto se restaura
en un stack Supabase local nuevo, temporal y aislado. Esta vía conserva todos
los pins, digests, historiales administrados, ejecutores, lint, diffs y cleanup
del drill local, pero exige una confirmación adicional y nunca crea un fixture
que no estuviera en Producción:

```bash
pnpm restore:drill:local -- \
  --backup-dir "/RUTA/STAGING/AAAA-MM-DDTHH-MM-SSZ" \
  --confirm-local-only \
  --confirm-production-backup
```

El checkout debe estar limpio y coincidir exactamente con el commit declarado
por el manifiesto. El stack local original se usa sólo como referencia de
schema/runtime administrado y debe permanecer intacto; sus valores y conteos no
se comparan con Producción. El target sí debe coincidir con todos los datos del
backup. Después de reiniciar Auth y Storage sólo pueden regenerarse
`storage.objects.metadata`, `updated_at` y `version`; ID, bucket, path,
`owner`, `owner_id`, `user_metadata`, Auth, sesiones, MFA y los demás datos se
comparan exactamente. Los buckets, paths, bytes y SHA-256 se verifican además
mediante la API oficial de Storage.

CI usa el mismo inventario versionado de cinco pins que el restore drill
(`postgres-version`, `storage-version`, `storage-migration`, `rest-version` y
`gotrue-version`). Antes de `supabase start` crea un `.temp` efímero que debe
contener únicamente esos cinco archivos no secretos. La preparación se niega a
ejecutar fuera de GitHub Actions, sobre rutas con symlinks o sobre un `.temp`
preexistente; el readiness posterior vuelve a validar sus bytes exactos.
Dentro de GitHub Actions también vuelve a exigir modos 700/600. En un stack
local ya administrado por Supabase CLI acepta los modos públicos 755/664 del
proveedor, pero nunca relaja nombres, bytes, archivos regulares ni symlinks.

Antes de borrar cualquier staging en claro, confirmar el round-trip del paquete
off-host, su `.sha256`, un descifrado real y el restore local desde la copia
descargada. Ningún script borra automáticamente el staging ni rota versiones:
esas operaciones destructivas se hacen sólo con un inventario de retención
revisado.

## Recuperación real

1. recuperar la frase o clave desde su custodia independiente;
2. copiar el `.tar.gpg` y su `.tar.gpg.sha256` a un target aislado y verificar
   el checksum con el basename exacto;
3. descifrar y verificar `SHA256SUMS.backup` antes de cualquier restore;
4. deshabilitar los cinco Cron Triggers en la configuración de recuperación y
   verificar que no existan ejecuciones programadas contra un target parcial;
5. crear un proyecto Supabase de recuperación nuevo, no sobrescribir el
   proyecto afectado;
6. restaurar DB/Storage con el orden probado y luego reconstruir Auth, SMTP,
   templates, Turnstile, Cloudflare Workers y DNS según `RECOVERY_INVENTORY.md`;
7. emitir credenciales nuevas y ejecutar el preflight/smoke completo;
8. reponer los cinco Cron Triggers sólo después de validar health, Auth, Storage
   y los handlers autorizados;
9. cambiar DNS sólo con autorización y conservar el origen para análisis.

La exportación real de Producción, la elección/custodia de la credencial, la
copia off-host y cualquier restore cloud requieren una acción humana separada.
Nada de eso fue ejecutado por este lote local.

Para cerrar las filas excepcionales hace falta, mediante otra autorización,
crear el backup productivo, validar manifiesto/checksums, cifrar, descifrar y
restaurar; luego transferir sólo el ciphertext y checksum al destino off-host,
descargarlos a otra ruta y repetir verificación y restore. Recién esa evidencia
permite que una evaluación posterior reemplace `not_verified`/`inactive` por un
`PASS`; nunca se edita retroactivamente el acta que aceptó el riesgo.
