# Agorbis · runbook de producción

> Candidato ampliado del 09-09-2026: agrega `0062`–`0067` al
> baseline `0001`–`0058` + `0060` + `0061` (60 migraciones), para un total de 66. `0066` prepara
> el registro de avisos y decisiones Google sin insertar un aviso aprobado ni
> habilitar el proveedor; `0067` incorpora el aviso aprobado `2026-09-09.1`,
> sin insertar aceptaciones de usuarios. Las referencias siguientes a 60/60 describen la
> observación histórica, no certifican este candidato. Consultar
> [el avance de esta entrega](release-readiness-progress-2026-09-08.md) antes de
> desplegar. El sitio ya está abierto: no ejecutar un cierre/apertura D72 como
> paso automático de mantenimiento ni cerrar el acceso por correo.

La política de evidencia Supabase read-only D72 es `v4` para este candidato;
no se reutilizan recibos de 64 o 65 migraciones ni se reetiquetan sus hashes.
Backup/restore conserva `post-0065` con 64 y `post-0066` con 65, y agrega
`post-0067` con 66. La aprobación del aviso no acredita las pruebas OAuth reales
ni cierra las evidencias externas pendientes. No aplicar las migraciones remotas
mientras el candidato siga bloqueado.

Este documento define el procedimiento de salida y recuperación. No autoriza un
deploy: cada corte necesita un responsable humano, una ventana acordada y un
commit candidato validado primero con Supabase local. El único proyecto cloud,
`ibtvlvpxwourrxwcrfkf`, es exclusivamente Producción; no existe staging cloud.
La clasificación A/B/C y la secuencia mínima están en
[`GO_LIVE_CHECKLIST.md`](GO_LIVE_CHECKLIST.md); una recomendación que figure en
este runbook no bloquea el corte salvo que esté incluida expresamente en A.

## Responsables y objetivos

- Responsable de corte: Sebastian Cardoso Castillo.
- Responsable de incidentes, privacidad y moderación: Sebastian Cardoso
  Castillo.
- Riesgo aceptado: al inicio existe una sola persona operadora. El acceso
  administrativo efectivo debe usar MFA. La redundancia adicional de métodos y
  códigos de recuperación de todos los proveedores se completa inmediatamente
  después del lanzamiento.
- RPO inicial: 24 horas como máximo. Si el plan habilita PITR, reducirlo y dejar
  documentado el valor real.
- RTO inicial: 4 horas para recuperar lectura y autenticación; 8 horas para
  restaurar todas las funciones de escritura.
- Referencia local medida: el restore integral del release `0001`–`0058`,
  incluidos DB, Auth, Storage, validaciones y cleanup, completó en
  `291.996184353` segundos (4 min 51.996 s). No extrapolar ese tiempo a una
  descarga de Producción ni usarlo como garantía contractual.
- Moderación: riesgo urgente en 24 h, reportes comunes en 72 h y apelaciones en
  7 días.

## Materialización reproducible del release

El lock operacional fija `/usr/bin/flock` del paquete Ubuntu noble amd64
`util-linux_2.39.3-9ubuntu6.6_amd64.deb`, actualizado por
[USN-8702-1](https://ubuntu.com/security/notices/USN-8702-1). El 7 de septiembre
de 2026 se descargó el
[paquete oficial](https://security.ubuntu.com/ubuntu/pool/main/u/util-linux/util-linux_2.39.3-9ubuntu6.6_amd64.deb),
se verificó su SHA-256
`08eb17ba3b83378ed1e73d8335d0ce03b429c0bbeb07e374f536234edab02465`
contra el índice APT y se comparó el binario extraído con el instalado. El
SHA-256 permitido de `flock` es
`e619344dc3eec4023498465679262f9ca27d1e8cef9cfc4c1ae72b428577b806`.
`dpkg -V util-linux` no encontró diferencias y el historial de dpkg registra
la actualización desde `2.39.3-9ubuntu6.5` el 2 de septiembre. Otro digest
continúa bloqueando el corte; una actualización del sistema exige repetir
esta verificación y versionar el pin antes de publicar.
Desde el 2026-10-20 sólo el job `release-gates` de CI (`pnpm test.release`)
materializa esta toolchain: fija Ubuntu 24.04, instala ese paquete desde el
archivo oficial tras verificar su SHA-256 y verifica también el digest de
`flock`. Los jobs requeridos de PR (`verificar`, `integracion`) instalan desde
un store aislado con `umask 0022` pero no bajan `.deb` puntuales ni exigen
estos digests, para que un parche de Ubuntu o de Node no bloquee una PR de
producto. `release-gates` fija `AGORBIS_REQUIRE_PINNED_TOOLCHAIN=1`: ahí la
falta de la toolchain canónica es un fallo, no un salto.
También instalan `git` y `git-man` oficiales de Ubuntu noble
`1:2.43.0-1ubuntu7.4`, verificando ambos paquetes y el SHA-256 de `/usr/bin/git`
`eb54b535467e0975c1284d4c4d08eea779aeb248a5d34b02e2ee171382e22201`;
el downgrade desde el Git del runner se limita al runner efímero para respetar
ese pin (ver la nota 2026-10-29 sobre cómo se renueva).
CI copia la distribución oficial Node 22.22.0 a un directorio propiedad del
runner e instala el standalone oficial pnpm 11.15.0 con `pnpm self-update` en
un scratch separado; copia ese paquete real a la ruta canónica del gate D72,
verifica ambos binarios y, tras instalar las dependencias desde su propio store
frío, valida las entradas, permisos y propietarios con el gate D72 real.

El release no reutiliza el `node_modules` del checkout de trabajo ni ningún
store global/cacheado de pnpm. Un store creado previamente con `umask 0002`
puede conservar archivos `0664` y rematerializarlos así aunque el install nuevo
use `0022`; la closure de Wrangler debe rechazar ese árbol. Preparar un worktree
y un store nuevos sin borrar ni modificar los existentes:

```bash
set -euo pipefail
test -z "$(git status --porcelain=v1)"
agorbis_release_head="$(git rev-parse HEAD)"
agorbis_release_root="$(mktemp -d "${TMPDIR:-/tmp}/agorbis-release.XXXXXX")"
agorbis_release_worktree="${agorbis_release_root}/worktree"
agorbis_release_store="${agorbis_release_root}/pnpm-store"
test ! -e "$agorbis_release_worktree"
test ! -L "$agorbis_release_worktree"
test ! -e "$agorbis_release_store"
test ! -L "$agorbis_release_store"
umask 0022
test "$(node --version)" = "v22.22.0"
test "$(pnpm --version)" = "11.15.0"
git worktree add --detach "$agorbis_release_worktree" "$agorbis_release_head"
cd "$agorbis_release_worktree"
test ! -e node_modules
test ! -L node_modules
test ! -e "$agorbis_release_store"
test ! -L "$agorbis_release_store"
test "$(pnpm config get sideEffectsCache)" = "false"
pnpm install --frozen-lockfile --store-dir "$agorbis_release_store"
agorbis_release_effective_store="$(realpath "$(pnpm store path --store-dir "$agorbis_release_store")")"
agorbis_release_store="$(realpath "$agorbis_release_store")"
case "$agorbis_release_effective_store" in
  "$agorbis_release_store"|"$agorbis_release_store"/*) ;;
  *) echo "El store efectivo de pnpm escapó del scratch aislado." >&2; exit 1 ;;
esac
export pnpm_config_store_dir="$agorbis_release_store"
export pnpm_config_verify_deps_before_run=error
node scripts/test-exceptional-wrangler-integrity.mjs
```

`verifyDepsBeforeRun=error` conserva la verificación de dependencias y detiene
`run/exec` si requieren reinstalar, evitando que pnpm regenere shims durante
la certificación. No usar `false` ni cambiar el hash para admitir un árbol
distinto. Ver [la opción oficial](https://pnpm.io/settings/build#verifydepsbeforerun).

El último gate debe pasar con la closure
`e44e24b5134db166eb7e4096a468cdbd4a9110959457a1b82f19894d9bd4ae9b` (nota
2026-11-19, re-baseline con Wrangler 4.160.1).
Conservar ese worktree y ese store durante toda la certificación y el corte; no
reinstalar desde otro store. El checkout original queda intacto. Registrar las
rutas temporales para una limpieza posterior revisada, fuera de la ventana de
release.

### Protocolo cross-store hostil

Reejecutar este protocolo cuando cambien pnpm, la policy de integridad o la
receta de CI. Demuestra que reutilizar un store creado con `0002` falla cerrado
y que un store nuevo creado con `0022` produce la closure pinneada. Usa sólo
worktrees y stores temporales nuevos; no elimina datos:

```bash
set -euo pipefail
test -z "$(git status --porcelain=v1)"
agorbis_protocol_head="$(git rev-parse HEAD)"
agorbis_protocol_root="$(mktemp -d "${TMPDIR:-/tmp}/agorbis-store-protocol.XXXXXX")"
agorbis_hostile_seed="${agorbis_protocol_root}/hostile-seed"
agorbis_hostile_reuse="${agorbis_protocol_root}/hostile-reuse"
agorbis_isolated_worktree="${agorbis_protocol_root}/isolated"
agorbis_hostile_store="${agorbis_protocol_root}/hostile-store"
agorbis_isolated_store="${agorbis_protocol_root}/isolated-store"
test "$(node --version)" = "v22.22.0"
test "$(pnpm --version)" = "11.15.0"
for agorbis_protocol_target in \
  "$agorbis_hostile_seed" \
  "$agorbis_hostile_reuse" \
  "$agorbis_isolated_worktree" \
  "$agorbis_hostile_store" \
  "$agorbis_isolated_store"; do
  test ! -e "$agorbis_protocol_target"
  test ! -L "$agorbis_protocol_target"
done
git worktree add --detach "$agorbis_hostile_seed" "$agorbis_protocol_head"
git worktree add --detach "$agorbis_hostile_reuse" "$agorbis_protocol_head"
git worktree add --detach "$agorbis_isolated_worktree" "$agorbis_protocol_head"
(
  cd "$agorbis_hostile_seed"
  umask 0002
  test "$(pnpm config get sideEffectsCache)" = "false"
  pnpm install --frozen-lockfile --store-dir "$agorbis_hostile_store"
)
(
  cd "$agorbis_hostile_reuse"
  umask 0022
  test "$(pnpm config get sideEffectsCache)" = "false"
  test ! -e node_modules
  test ! -L node_modules
  pnpm install --frozen-lockfile --store-dir "$agorbis_hostile_store"
  if node scripts/test-exceptional-wrangler-integrity.mjs; then
    echo "ERROR: la closure aceptó un store hostil" >&2
    exit 1
  fi
)
(
  cd "$agorbis_isolated_worktree"
  umask 0022
  test "$(pnpm config get sideEffectsCache)" = "false"
  test ! -e node_modules
  test ! -L node_modules
  test ! -e "$agorbis_isolated_store"
  test ! -L "$agorbis_isolated_store"
  pnpm install --frozen-lockfile --store-dir "$agorbis_isolated_store"
  node scripts/test-exceptional-wrangler-integrity.mjs
)
```

El segundo bloque debe fallar por integridad y el tercero debe pasar con el hash
pinneado. No convertir el hash del store hostil en una alternativa permitida.

### Nota 2026-10-20 · re-baseline de hashes D72 en `d54c32b`

El commit `d54c32b` (18-10-2026, "feat(civic): overhaul civic engagement…")
cambió, dentro de un commit de features y sin explicación, el `closureHash` de
`scripts/exceptional-wrangler-integrity.mjs` de
`6565c2259dc3c189276aba2343f51c7e449f4a5c52186d45a714c8d14b94dbc3` a
`51731623f361d7a157a82152329868b815d52879af40850afcf51a603f1ab2a7`, los tres
vectores dorados (`upload`, `open`, `closed`) de
`scripts/test-exceptional-release-cutover-policy.mjs` y la closure citada arriba.
`pnpm-lock.yaml` no cambió: `lockHash` sigue en
`3a33dac0c020100c1c4d78f5604ba1789945a843158bd009f5e9539c80773aaf`, igual que
el importer, el snapshot y el entrypoint de Wrangler. Esos valores no se
tocaron en esta revisión.

Verificación local de sólo lectura hecha ese día:

- El checkout de trabajo no es certificable: su store se creó con `umask 0002`
  y `verifyExceptionalWranglerIntegrity` lo rechaza con el error
  `node_modules interno de pnpm debe ser un directorio regular 0755.`, tal como
  exige este runbook.
- Sobre una copia en scratch de ese `node_modules` con los permisos de grupo
  normalizados a `0022`, la closure calculada fue
  `79da5dbe99d12072fc7995bc7f7995261c0f67885d1bf1f3921f6441f6e98269`: no
  coincide con `51731623…` ni con `6565c225…`. Una copia normalizada no
  reemplaza un store frío, así que el resultado no confirma ni refuta el
  nuevo valor.
- En CI, el 11-09-2026 (run 34649875496), `test-exceptional-wrangler-integrity`
  ya fallaba contra `6565c225…` en un store frío creado con `0022`, con el error
  `No coincide closure runtime de Wrangler con la policy versionada.`

Conclusión: `51731623…` no está verificado contra un store frío. Antes de
cualquier release hay que reejecutar el protocolo cross-store hostil de esta
sección, registrar el hash que produce el store aislado y, si difiere,
re-baselinear en un commit propio que explique el origen del cambio (versión de
pnpm, receta de CI o policy) en vez de dentro de un commit de features.

### Nota 2026-10-21 · cuarentena de versiones y cambio de toolchain pendiente

Aplicado sin tocar `pnpm-lock.yaml` (`lockHash` sigue en `3a33dac0…`):

- `pnpm-workspace.yaml` fija `minimumReleaseAge: 10080` (7 días). La clave
  existe con ese nombre en pnpm 11.15.0; al declararla, pnpm activa
  `minimumReleaseAgeStrict` y vuelve a verificar cada entrada del lockfile
  ("Lockfile passes supply-chain policies (753 entries)" en una copia de
  scratch, con el lockfile byte a byte igual). Se borró
  `minimumReleaseAgeExclude`: las nueve versiones de workerd, workers-types,
  miniflare y wrangler se publicaron el 25-08-2026 (`pnpm view … time`).
- `.github/dependabot.yml` usa el mismo `cooldown` de 7 días, grupos por
  familia (qwik, cloudflare, vite-vitest, typescript, supabase) e ignora los
  majors de `@types/node` mientras `engines.node` sea `22.x`.

Pendiente para un commit `toolchain:` propio (no se aplicó: el protocolo
cross-store exige un `HEAD` commiteado con el árbol limpio, y el `closureHash`
vigente `51731623…` tampoco está verificado contra un store frío):

- quitar `typescript-plugin-css-modules` (`package.json` y `plugins` de
  `tsconfig.json`; no hay `*.module.css`) y, con él, less, sass, stylus,
  `@parcel/watcher` (también de `allowBuilds`) y `probe-image-size`;
- overrides `sharp@<0.35.5` → `0.35.5` y `undici@>=7.0.0 <7.29.1` → `7.29.1`
  (miniflare fija `sharp` 0.35.2 y `undici` 7.29.0 exactos; los rangos
  anteriores `<0.35.0` y `<6.28.0` no los cubrían) y borrar los overrides sin
  paquete en el árbol (`@tootallnate/once`, `js-yaml`, `smol-toml`, `tar`);
- borrar los 14 ignores que ese árbol deja sin objeto (2 de sharp, 10 de
  undici, `probe-image-size` y `postcss-selector-parser`).

pnpm conserva los peers opcionales ya resueltos de vite aunque se quite el
plugin: hay que sacar `less`/`sass`/`stylus` de las claves y dependencias de
los snapshots de vite, correr `pnpm install --lockfile-only` y podar las
entradas que quedan inalcanzables. Con eso el lockfile queda estable
(`--frozen-lockfile` y una segunda resolución no lo cambian) y `pnpm audit`
deja sólo los advisories de vite/launch-editor del 06-10-2026 (se arreglan con
vite 8.2.4, el override de vitest a 7.3.7 y `launch-editor` 2.14.2) y
GHSA-x586-xvc8-g7q6, que decide el responsable. Ese commit cambia `lockHash` y,
porque miniflare entra a la closure de Wrangler, `closureHash` y los vectores
dorados de `scripts/test-exceptional-release-cutover-policy.mjs`: se
re-baselinean con el protocolo cross-store hostil de arriba, sobre el commit, y
el hash del store aislado se registra en esta sección.

### Nota 2026-10-29 · re-baseline de `lockHash` y `closureHash` sobre `e07aaab`

Protocolo cross-store hostil de esta sección, ejecutado tal cual sobre el
commit de toolchain `e07aaab6e652337322af5630a9eb415a15f46634`, con Node
22.22.0, pnpm 11.15.0 y `sideEffectsCache: false`, en
`/tmp/agorbis-store-protocol.vXMeXq` (tres worktrees detached y dos stores
nuevos):

1. Semilla hostil con `umask 0002`: instaló.
2. Reutilización del store hostil con `umask 0022`: el gate rechazó el árbol
   (en ese momento, por `lockHash`, la primera comparación de la policy).
3. Store aislado nuevo con `umask 0022`: el gate no coincidía con la policy
   vigente (esperado) y `readExceptionalWranglerIntegrity` calculó
   `lockHash`
   `46929cffc0129f3a9a4f0ed5197d16cbdbd4a89aa3e1c9ec3e689a88020fd343`,
   igual al SHA-256 del archivo commiteado, y `closureHash`
   `2005ed1c5504893531d2727ef09b9ffed7fc9732ce455086d56c577cb1f0016b`;
   `entrypointHash` `780661a5…` y el entrypoint de ejecución `713313d4…` no
   cambiaron, igual que el importer y el snapshot de Wrangler.

Este commit pinea esos dos valores en
`scripts/exceptional-wrangler-integrity.mjs`, recalcula los tres vectores
dorados de `scripts/test-exceptional-release-cutover-policy.mjs` (derivan de
la policy) y no toca ningún otro gate. `51731623…` queda como historial: nunca
se verificó contra un store frío (nota 2026-10-20). La segunda corrida del
protocolo, sobre este mismo commit y con otro store frío, es la que confirma
que el valor se reproduce; su resultado se registra a continuación.

Segunda corrida, sobre `69ca7eb9e509ea88cfbf2f2dcacd2398f490a19c` (el commit
que pinea los valores) en `/tmp/agorbis-store-protocol.qnc1Op`, con otros tres
worktrees y otros dos stores nuevos: el bloque 2 rechazó el store hostil con
`No coincide closure runtime de Wrangler con la policy versionada` (ya no por
`lockHash`), y el bloque 3 pasó el gate con la policy pineada y volvió a
calcular `closureHash` `2005ed1c…` y `lockHash` `46929cff…`. Dos stores fríos
independientes dan el mismo valor; el remoto lo confirma `release-gates`.

### Nota 2026-10-29 · commit de toolchain para el audit alto

Aplicado sobre el árbol de D99, en commit propio y sin tocar Qwik:

- `vite` 8.2.2 → 8.2.4 y los tres overrides de la familia vitest a `vite`
  7.3.7 (GHSA-587h-7wmj-h5pm, launch-editor); override nuevo
  `launch-editor@<2.14.2` → 2.14.2 por la misma causa.
- Override nuevo `undici@>=7.0.0 <7.30.1` → 7.30.1: miniflare fija 7.29.0
  exacto y los cuatro advisories altos de octubre (GHSA-xjj6-f33q-929c,
  GHSA-4w7w-5xrc-9h26, GHSA-2m5v-pch6-74hx, GHSA-qrxm-fqhp-jwvm) no entraban en
  el rango `<6.28.0` que había.
- Se borran las diez excepciones de undici que dejan de coincidir con el
  árbol y se anota GHSA-qxg6-89mg-rqv8 (`@vitest/mocker`, moderate, dev-only,
  arreglo en vitest 4). `check-audit-ignores` queda en 15 entradas.
- `pnpm audit --audit-level=high` deja sólo GHSA-x586-xvc8-g7q6 (Qwik core,
  rango sin punto) y GHSA-mrhx-c7xc-m3w5 (zod 3.25.76 del router); los decide
  el responsable, ver D100.

La poda de `typescript-plugin-css-modules` y sus peers (nota 2026-10-21) sigue
pendiente: no bloquea `verificar` y va en su propio commit.

`pnpm-lock.yaml` pasa a
`46929cffc0129f3a9a4f0ed5197d16cbdbd4a89aa3e1c9ec3e689a88020fd343`; el
importer, el snapshot y el entrypoint de Wrangler no cambian (se comprobó
extrayendo los bloques del lockfile antes y después), pero miniflare arrastra
undici dentro de la closure, así que `closureHash` sí cambia. El re-baseline
de `lockHash` y `closureHash` se hace con el protocolo cross-store hostil de
arriba sobre este commit, en el commit siguiente (nota 2026-10-29, re-baseline).

### Nota 2026-11-19 · commit de toolchain: parches que cierran ocho excepciones

Al vencer la revisión de las 17 excepciones de `pnpm audit` se reauditó el
lockfile sin ellas. Ocho se cierran con overrides en `pnpm-workspace.yaml`
hacia parches de la misma versión mayor, en commit propio y sin tocar Qwik,
wrangler ni `package.json`:

- `svgo` 4.0.2 → 4.1.0 y 3.3.4 → 3.3.5 (la copia del router):
  GHSA-w27v-7q3p-w38r y GHSA-4vpr-x523-8j87.
- `brace-expansion` 1.1.18 → 1.1.21 y 5.0.9 → 5.0.12: GHSA-qhr7-859c-m2p7,
  GHSA-6j4f-fj2g-mc7p y GHSA-q2hr-2g5m-vwhr.
- `shell-quote` 1.10.0 → 1.11.0 (GHSA-pqg4-j6r4-53mv), `source-map-js` 1.2.1 →
  1.2.2 (GHSA-68fv-2mgg-jv7q) y `postcss-selector-parser` 7.1.4 → 7.1.6
  (GHSA-rj75-hqrm-r3gf).

sharp sube a 0.35.5 sólo donde no toca a Wrangler: el directo y el de
`vite-imagetools` (`sharp@<0.35.0` y `sharp@>=0.35.3 <0.35.5` → 0.35.5). El
0.35.2 exacto de miniflare no se fuerza. Se probó `sharp@<0.35.5` → 0.35.5 y
el protocolo cross-store lo rechazó con `El importer de Wrangler no coincide
exactamente con la policy`: desde 0.35.3 sharp declara `@types/node` como peer
opcional y la clave de Wrangler en el lockfile pasa a
`wrangler@4.126.0(@cloudflare/workers-types@5.20260825.1)(@types/node@22.20.1)`,
lo que obliga a re-pinear `importerResolution`, `snapshotKey`, sus dos hashes y
`packageRealpathRelative`. Ese cambio de identidad va con la próxima subida de
wrangler, en su propio re-baseline; hasta entonces GHSA-rgj7-g3m4-5g8c y
GHSA-wq5f-xc86-pv6w siguen como excepción, acotadas a miniflare.

Todas las versiones tienen más de siete días publicadas (cuarentena). Quedan
nueve excepciones, con revisión al 2026-12-19: zod 3.25.76 del router y Qwik
core (D100), las cuatro que esperan vitest 4 (vitest, `@vitest/mocker` y dos
de tinypool), las dos de sharp en miniflare y `probe-image-size`, cuyo arreglo
7.3.1 figura en el advisory pero no está publicado en npm; esa se va con la
poda de `typescript-plugin-css-modules` (nota 2026-10-21, todavía pendiente).
`pnpm audit` pasa de 24 avisos a 11; GHSA-g3hv-75wg-m249 (minimatch 10.2.6 de
ESLint, moderada, arreglo sólo en 11.x) queda sin excepción porque no llega
al umbral alto.

`pnpm-lock.yaml` pasa a
`14c2b110a1be71b1420dba51bf4ef61dc0d3e306ff411626cdbb31cdd22d2d1b`; el
importer y los snapshots de Wrangler y miniflare no cambian (se comparó el
lockfile antes y después). El re-baseline de `lockHash`, y de `closureHash` si
cambia, se hace con el protocolo cross-store hostil de arriba sobre este
commit, en el commit siguiente.

### Nota 2026-11-19 · re-baseline de `lockHash` sobre `c9338a6`

Protocolo cross-store hostil de esta sección sobre el commit de toolchain
`c9338a6bc3929ef5afdc323bf3f2b1bb8a3f0b7c`, con Node 22.22.0, pnpm 11.15.0 y
`sideEffectsCache: false`. Una diferencia con la receta: los tres worktrees
detached se crearon en `.worktrees/d72-protocolo-b-*` del repo (ignorada por
git) y no bajo `mktemp`, porque el harness del agente sólo admite worktrees
ahí; los dos stores sí fueron nuevos y temporales.

1. Semilla hostil con `umask 0002`: instaló.
2. Reutilización del store hostil con `umask 0022`: el gate rechazó el árbol
   (por `lockHash`, la primera comparación de la policy).
3. Store aislado nuevo con `umask 0022`: el gate no coincidía con la policy
   vigente (esperado) y `readExceptionalWranglerIntegrity` calculó `lockHash`
   `14c2b110a1be71b1420dba51bf4ef61dc0d3e306ff411626cdbb31cdd22d2d1b`, igual al
   SHA-256 del archivo commiteado, y `closureHash`
   `2005ed1c5504893531d2727ef09b9ffed7fc9732ce455086d56c577cb1f0016b`, **sin
   cambio**: ninguno de los paquetes parcheados entra a la closure de Wrangler.
   `entrypointHash` `780661a5…` y el entrypoint de ejecución `713313d4…`
   tampoco cambiaron.

Este commit pinea sólo `lockHash` en
`scripts/exceptional-wrangler-integrity.mjs` y recalcula los tres vectores
dorados de `scripts/test-exceptional-release-cutover-policy.mjs`, que derivan
de la policy. No toca ningún otro gate.

Segunda corrida, sobre `c76e5df` (el commit que pinea el valor), con otros
tres worktrees y otros dos stores nuevos: el bloque 2 rechazó el store hostil
con `No coincide closure runtime de Wrangler con la policy versionada` (ya no
por `lockHash`) y el bloque 3 pasó el gate con la policy pineada. En ese
mismo worktree aislado, con `verifyDepsBeforeRun=error`, `pnpm test.release`
completo salió 0. El remoto lo confirma `release-gates`.

### Nota 2026-11-19 · poda de `typescript-plugin-css-modules` y bumps de rutina

Segundo commit de toolchain del día, sobre el árbol ya re-baselineado. Cierra
lo que la nota del 21-10 dejó pendiente y sube lo que tenía versión nueva
dentro de su versión mayor.

Poda:

- Sale `typescript-plugin-css-modules` de `package.json` y de `plugins` en
  `tsconfig.json` (no hay ningún `*.module.css`).
- Como avisaba la nota del 21-10, pnpm conserva los peers opcionales ya
  resueltos de vite. No alcanzó con quitarles el sufijo: mientras los bloques
  `less@`, `sass@` y `stylus@` sigan en `packages` y `snapshots`, la próxima
  resolución los vuelve a enganchar. Hubo que borrar esos seis bloques, los
  sufijos `(less@…)(sass@…)(stylus@…)` de las claves y las seis líneas de
  dependencia, y después correr `pnpm dedupe`, que poda lo inalcanzable
  (`probe-image-size`, `@parcel/watcher` y otros). Las opciones
  `--lockfile-only` y `--fix-lockfile` de `pnpm install` responden "Already up
  to date" y no podan.
- Con eso se borran la excepción GHSA-gjj5-9665-rwrc (`probe-image-size`), el
  override de `postcss-selector-parser` (ya no está en el árbol) y
  `@parcel/watcher` de `allowBuilds`. Quedan ocho excepciones.

Bumps, todos con más de siete días publicados: `vite` 8.2.4 → 8.3.8,
`eslint` 10.9.0 → 10.14.0, `typescript-eslint` 8.67.0 → 8.72.2, `prettier`
3.9.6 → 3.10.0 (no reformatea ningún archivo), `globals` 17.11.0 → 17.14.0,
`@types/node` 22.20.1 → 22.20.5, `@playwright/test` 1.62.1 → 1.65.0,
`tailwindcss` y `@tailwindcss/vite` 4.3.3 → 4.3.5, `@supabase/supabase-js`
2.112.3 → 2.119.0 y `@supabase/ssr` 0.12.4 → 0.12.7. `sharp` y `svgo` pasan a
declarar `^0.35.5` y `^4.1.0`, lo que ya resolvían los overrides.

Quedan afuera a propósito: `wrangler` y `@cloudflare/workers-types` (son la
identidad de Wrangler en la policy de D72), Qwik (parche propio sobre beta.40
y excepción D100 atada a esa versión), el CLI de `supabase` (pineado por los
scripts de release) y los saltos de versión mayor de TypeScript, vitest y
`@types/node`.

`pnpm-lock.yaml` pasa a
`5b9197070cb440a06b7becdc6f7c5ec119bc6c7cd62aa1beee9731e899c2771b`; el
importer y los snapshots de Wrangler y miniflare no cambian. El re-baseline
de `lockHash` va en el commit siguiente, con el protocolo cross-store.

### Nota 2026-11-19 · re-baseline de `lockHash` sobre `4f8438c`

Protocolo cross-store hostil sobre el segundo commit de toolchain,
`4f8438c0051774b4c8b764c4a919665108da277b`, con Node 22.22.0, pnpm 11.15.0 y
`sideEffectsCache: false`; worktrees en `.worktrees/d72-protocolo-d-*` y dos
stores nuevos y temporales, como en la nota anterior.

1. Semilla hostil con `umask 0002`: instaló.
2. Reutilización del store hostil con `umask 0022`: rechazada por `lockHash`.
3. Store aislado nuevo con `umask 0022`: `lockHash`
   `5b9197070cb440a06b7becdc6f7c5ec119bc6c7cd62aa1beee9731e899c2771b`, igual al
   SHA-256 del archivo commiteado, y `closureHash` `2005ed1c…`, otra vez **sin
   cambio**; `entrypointHash` `780661a5…` y el entrypoint de ejecución
   `713313d4…` tampoco cambiaron.

Este commit pinea sólo `lockHash` y recalcula los tres vectores dorados del
cutover. No toca ningún otro gate.

Segunda corrida, sobre `6e7fc70` (el commit que pinea el valor), con otros
tres worktrees y otros dos stores nuevos: el bloque 2 rechazó el store hostil
con `No coincide closure runtime de Wrangler con la policy versionada` y el
bloque 3 pasó el gate. En ese worktree aislado, con
`verifyDepsBeforeRun=error`, `pnpm test.release` completo salió 0.

### Nota 2026-11-19 · Wrangler 4.126.0 → 4.160.1 y nueva identidad en la policy

Tercer commit de toolchain del día. `wrangler` pasa a 4.160.1 y
`@cloudflare/workers-types` a 5.20261110.1 (las dos con más de siete días
publicadas; wrangler pide `^5.20261110.1` como peer). Con él suben miniflare
`5.20261110.1-beta`, workerd `1.20261110.1` y esbuild 0.28.2.

Qué cambia además de `package.json` y el lockfile:

- **Versión pineada.** `4.126.0` estaba escrita en catorce archivos: la policy
  de integridad, el artefacto, el cutover, el runner de cutover, la policy y
  el fixture del canary, el preflight, seis tests y dos documentos de
  operación. Todos pasan a `4.160.1` en este commit.
- **Identidad de Wrangler en la policy.** La clave del lockfile ahora lleva
  `@types/node` (lo arrastra sharp ≥ 0.35.3 como peer opcional de miniflare):
  `wrangler@4.160.1(@cloudflare/workers-types@5.20261110.1)(@types/node@22.20.5)`.
  Se re-pinean `importerResolution`, `importerBlockHash`, `snapshotKey`,
  `snapshotBlockHash`, `packageRealpathRelative`, `packageIntegrity`,
  `entrypointHash` (`d35986bc…`) y el entrypoint de ejecución (`2400f3b5…`).
  **Consecuencia:** desde ahora subir `@types/node` también cambia la identidad
  de Wrangler y exige este mismo re-baseline.
- **Miniflare beta.** `scripts/d72-closed-no-write-proof.mjs` ejecuta el Worker
  CLOSED dentro del Miniflare de Wrangler. La beta rechaza `type: "worker"` en
  `workers[].config` (`Unrecognized key`); sin ese campo la misma
  configuración responde igual. Es el único uso de esa API en el repo.
- **Overrides y excepciones.** miniflare ya pide sharp 0.35.5 y undici 7.30.1:
  se borran las dos excepciones de sharp (GHSA-rgj7-g3m4-5g8c y
  GHSA-wq5f-xc86-pv6w), el override `undici@>=7.0.0 <7.30.1` y el rango
  `sharp@>=0.35.3 <0.35.5`. Quedan seis excepciones: zod y Qwik core (D100) y
  las cuatro que esperan vitest. `pnpm audit` baja a 8 avisos.

Lo que este cambio **no** prueba: los scripts de cutover excepcional y del
canary interpretan la salida de `wrangler versions upload/deploy`, y esa
salida real de 4.160.1 no se ejercitó (exige credenciales y tocar Producción).
Sus tests usan salidas sintéticas. `pnpm deploy:open` (D107) no depende de
eso: invoca `wrangler deploy` directo, sin interpretar su salida.

`pnpm-lock.yaml` pasa a
`4b92469bd5bbe29902a1acfc1529efa1c4c676fe327e904e81c00dd7b0c7a73b`. El
re-baseline de `lockHash` y `closureHash` va en el commit siguiente.

### Nota 2026-11-19 · re-baseline de `lockHash` y `closureHash` sobre `3a5c630`

Protocolo cross-store hostil sobre el commit de Wrangler 4.160.1,
`3a5c63031d162ba039dbab45f1ca356018e55878`, con Node 22.22.0, pnpm 11.15.0 y
`sideEffectsCache: false`; worktrees en `.worktrees/d72-protocolo-f-*` y dos
stores nuevos y temporales.

1. Semilla hostil con `umask 0002`: instaló.
2. Reutilización del store hostil con `umask 0022`: rechazada por `lockHash`.
3. Store aislado nuevo con `umask 0022`: la identidad pineada en `3a5c630`
   (importer, snapshot, ruta real, integridad) pasó las comparaciones
   estructurales y `readExceptionalWranglerIntegrity` calculó `lockHash`
   `4b92469bd5bbe29902a1acfc1529efa1c4c676fe327e904e81c00dd7b0c7a73b`, igual al
   SHA-256 del archivo commiteado; `closureHash`
   `e44e24b5134db166eb7e4096a468cdbd4a9110959457a1b82f19894d9bd4ae9b`, nuevo
   porque cambia toda la closure de Wrangler; `entrypointHash` `d35986bc…` y
   el entrypoint de ejecución `2400f3b5…`, iguales a los que se habían leído
   del checkout de trabajo.

Este commit pinea `lockHash` y `closureHash`, recalcula los tres vectores
dorados del cutover y actualiza la closure citada en "Materialización
reproducible del release". `2005ed1c…` queda como historial de Wrangler
4.126.0.

Segunda corrida, sobre `1842f5f` (el commit que pinea los valores), con otros
tres worktrees y otros dos stores nuevos: el bloque 2 rechazó el store hostil
con `No coincide closure runtime de Wrangler con la policy versionada` y el
bloque 3 pasó el gate. En ese worktree aislado, con
`verifyDepsBeforeRun=error`, `pnpm test.release` completo salió 0.

Sobre el mismo commit, en el checkout de trabajo, `pnpm deploy:open --dry-run`
terminó en "Prueba completa: build, preflight y wrangler dry-run en PASS" con
`wrangler 4.160.1` (Total Upload 3330.57 KiB, gzip 886.68 KiB). Antes hubo que
reinstalar `node_modules` limpio desde el store dedicado: tras varias
instalaciones incrementales quedaban tres copias de Wrangler en `.pnpm` y la
closure local no coincidía, aunque el store aislado sí pasaba.

### Nota 2026-10-29 · el pin de Git pasa a 1:2.43.0-1ubuntu7.4

`release-gates` (run 40906527104) falló con HTTP 404 al bajar
`git_2.43.0-1ubuntu7.3_amd64.deb`: Ubuntu publicó `1:2.43.0-1ubuntu7.4` el
16-10-2026 (LP #2171054, compatibilidad con la actualización de seguridad de
curl) y el archivo retira del pool el `.deb` reemplazado. El pin anterior no
era inseguro; dejó de existir. Verificación hecha ese día, reproducible:

1. `InRelease` de `noble-security` con firma válida de "Ubuntu Archive
   Automatic Signing Key (2018)" (`gpgv` con el keyring del sistema).
2. `main/binary-amd64/Packages.gz` con SHA-256
   `34c3bb06905e18ab7bdb5978b1a2ebc7101b437d2f719e26c7d1e722723ab0d0`, el que
   declara ese `InRelease`.
3. En ese índice: `git_2.43.0-1ubuntu7.4_amd64.deb`
   `c79b7948ef9860c97ec74293a90178676e63368a0711c95c28a55af4edf1adab` y
   `git-man_2.43.0-1ubuntu7.4_all.deb`
   `77f57651734edc24b5a9e7863bc261bf302060ac3c12bbb08a459966ea4d30a6`; los
   paquetes descargados coinciden.
4. `/usr/bin/git` extraído con `dpkg-deb -x`:
   `eb54b535467e0975c1284d4c4d08eea779aeb248a5d34b02e2ee171382e22201`,
   4 066 232 bytes, modo 0755 (mismo tamaño que el 7.3), `git version 2.43.0`.

Los tres lugares que fijan el digest cambian juntos: el paso de CI,
`scripts/d72-non-stateful-composite-collector.mjs` y
`scripts/run-exceptional-open-cutover.mjs`. El librarian de Launchpad conserva
los `.deb` retirados, pero sus descargas superaron los 120 s: no sirve como
fuente primaria del gate. Cuando Ubuntu publique el próximo `git`, repetir
estos cuatro pasos antes de tocar el pin.

### Nota 2026-10-24 · Producción pasa a un proyecto Supabase nuevo y a la cuenta Cloudflare SEBA

Ver D92. El responsable creó el proyecto Supabase `ibtvlvpxwourrxwcrfkf`
(organización `agorbis`, región `us-east-2`, Postgres 17, plan Free según D91)
y conectó la cuenta de Cloudflare SEBA (`4d78fb10c1ae65281ec851479d5045dc`).
El repositorio, las políticas D72 y sus tests apuntan ahora a ese proyecto, a
su clave publicable y a esa cuenta. El Worker `agorbis` existe en SEBA como
script inicial sin dominios, crons ni `workers.dev`, subido el 24-10-2026 sólo
para poder cargar los tres secretos antes del primer release.

Pendiente antes del corte: la zona `agorbis.com` en la cuenta SEBA, el plan
Workers Paid, los widgets Turnstile A y B de esa cuenta, los tres Worker
Secrets, el proveedor Google o su desactivación, Resend como SMTP, las 69
migraciones con dry-run y push autorizados, y los perfiles de ledger del
tooling de backup, que todavía aceptan sólo `post-0061` a `post-0067`.

### Nota 2026-10-30 · zona `agorbis.com` en SEBA y zone id vigente

Ver D92. El responsable verificó el 30-10-2026 que la zona `agorbis.com` ya
está en la cuenta SEBA con zone id `1649628cde7b43fc40bceaca54d02e16`, que
apex y `www` están vinculados como custom domains al Worker `agorbis`, que
los widgets Turnstile A y B existen para `agorbis.com`, que Workers Paid sigue
pendiente y que el inventario de Worker Secrets sigue vacío (etapa `none`).
La fecha es de verificación, no de creación de la zona.

Al agregar el dominio en SEBA, Cloudflare creó una zona nueva con un id
distinto del que el repositorio fijaba desde D72 (`7af64f3d…`, de la cuenta
anterior). Ese id vivía sólo en los scripts de Cloudflare: el colector de
estado cerrado, las auditorías DNS y de caché, el fixture de canary D72 y el
test de caché. Con el id viejo, cada control fallaba cerrado contra SEBA: cero
custom domains en el filtro `zone_id`, 403 o 404 en `dns_records`,
`pagerules` y `rulesets`. Los cinco archivos pasan al id vigente en un solo
commit. `wrangler*.jsonc` no lleva zone id (la política del Worker lo
prohíbe), el inventario de recuperación tampoco, y ningún hash de release lo
cubre.

Lo que responde hoy apex y `www` es el script inicial del 24-10: un 503
`text/plain` sin `no-store` ni CSP. No es el perfil cerrado del repositorio,
así que `cloudflare-closed-state.mjs` no se ejecuta contra él como si tuviera
los bindings y secretos definitivos; esa verificación corresponde después de
`deploy:closed`. Las auditorías DNS y de caché, de sólo lectura, sí pueden
correr ya con el id vigente. La topología no web de Resend se compara por
nombre, tipo, contenido, TTL y proxied, no por ids de registro, y debe
coincidir con la versión pinneada; si no coincide, se corrige la zona, no el
hash.

### Nota 2026-11-01 · topología DNS no web v2 por Resend Forge

Ver D104. Resend migró a Forge y reemplazó el MX y el TXT SPF de
`send.agorbis.com` por los CNAME `send` y `rsend` y un TXT de verificación en
el apex. La auditoría GET-only del 01-11-2026 encontró 12 registros no web, y
la línea de base pasa a `agorbis-non-web-dns-topology/2026-11-01/v2`
(`e7f8e3d4…`). Es el único caso en que se movió el hash. Para cualquier otro
cambio sigue valiendo la regla de arriba: se corrige la zona.

## Salida simple a Producción (D107)

Desde el 02-11-2026 Producción se abre con un solo comando. Reemplaza como
camino obligatorio al flujo excepcional de D72 (canary, acta, cutover); ese
código sigue en el repositorio pero ya no se exige. La lista "Gate previo al
corte" de abajo queda como referencia: lo que sigue vigente lo controlan el
build y el preflight.

1. Dejar `main` limpio y pusheado (`HEAD` igual a `origin/main`).
2. Opcional: `pnpm deploy:open --dry-run` hace el build y el `wrangler deploy
--dry-run` sin subir nada.
3. `pnpm deploy:open`:
   - muestra los siete riesgos de la política D72 vigente y pide escribir
     `ACEPTO` por `/dev/tty`;
   - guarda el request en `~/.local/share/agorbis-release-requests/` (0700/0600);
   - corre el build abierto con `test`, `test.release` y el preflight real;
   - ejecuta `wrangler deploy --config wrangler.jsonc --strict`, que sube la
     versión abierta y sus cinco crons;
   - corre el smoke público de sólo lectura.
4. Verificar a mano la lista que imprime el comando: alta con Turnstile,
   correo de confirmación, gate legal, login, recuperación de contraseña,
   TOTP, foto privada en un reclamo, CSP y cookies.
5. Si algo falla: `pnpm deploy:closed` vuelve al perfil CLOSED (503 y cero
   crons).

`pnpm test.e2e` no corre en este comando: la CI lo corre en cada push a `main`
con un worker y un reintento. Mirar la CI en verde antes del paso 3.

## Gate previo al corte

1. Confirmar que desarrollo, integración, pruebas destructivas y restauraciones
   usan Supabase local. Los previews no reciben `SUPABASE_SECRET_KEY` ni datos
   reales de Producción. Las Legacy API Keys ya están deshabilitadas, el JWT
   secret legado fue revocado y Producción usa una `sb_secret_...` nueva y
   dedicada, server-only, con
   `SUPABASE_LEGACY_SERVICE_ROLE_DISABLED=true` como atestación.
   Confirmar que `wrangler.jsonc` conserva exactamente los dos custom domains,
   cinco Cron Triggers, `workers_dev=false`, `preview_urls=false`, el binding
   `ASSETS` y los tres secretos requeridos. El build publicable es únicamente
   `pnpm build.cloudflare`: genera el artefacto y ejecuta siempre el preflight.
   Verificar además el `account_id` versionado y
   `CLOUDFLARE_WORKERS_PLAN=paid`; Free no tiene el presupuesto de CPU requerido.
   Para el corte inicial, el responsable confirmó manualmente el 26-08-2026:
   0 Cache Rules activas, 0 Cache Response Rules activas, 0/3 Page Rules, sin
   Cache Everything, Edge TTL forzado ni reglas sobre HTML/Auth, y sin realizar
   cambios. Para revisiones futuras, ejecutar el auditor GET-only de Cache Rules
   y Page Rules legacy de la zona:

   ```bash
   pnpm cloudflare:cache-audit -- \
     --output-root "$HOME/.local/share/agorbis-cloudflare-cache-audits"
   ```

   El token se acepta sólo desde `CLOUDFLARE_API_TOKEN` o por prompt oculto; el
   snapshot y su manifiesto SHA-256 quedan fuera del repositorio con modos
   0700/0600. Cache Response Rules se revisa además en Dashboard mientras no
   esté cubierta por el gate automatizado. Si una regla activa hace elegible o
   altera el cache de HTML dinámico, Auth, callbacks, cuenta o API, o aparece una
   estructura/acción desconocida, detener el corte. Marcar
   `CLOUDFLARE_ZONE_DYNAMIC_CACHE_RULES_REVIEWED=true` sólo después de corregir
   y volver a inspeccionar el estado efectivo.
   Exportar además la zona completa y registrar A/AAAA/CNAME/TTL efectivos de
   apex y `www`. Al 26-08-2026 ambos están conectados como Custom Domains al
   Worker cerrado: el apex sirve el 503 esperado y `www` redirige 308 hacia el
   mismo path/query del apex; existen cero Cron Triggers y Vercel ya no es el
   destino DNS web. Comparar el export con esa línea de base y fallar si se
   altera cualquier MX, SPF, DKIM o DMARC.

2. Dentro del worktree aislado preparado arriba, aplicar desde cero las
   migraciones `0001`–`0058` + `0060` + `0061` en Supabase local y ejecutar:

   ```bash
   pnpm build.cloudflare
   pnpm audit --audit-level=low
   pnpm exec supabase db lint --local --level warning --fail-on warning
   pnpm db.test
   pnpm test.e2e
   ```

   Producción es el proyecto `ibtvlvpxwourrxwcrfkf`, creado vacío el 25-10-2026
   (D92). Su ledger inicial fueron las 69 migraciones de `supabase/migrations/`
   (`0001`–`0072` sin `0059`, `0068` ni `0069`), aplicadas con un único push
   autorizado tras su dry-run. Desde D109 suma `0073` (Privacidad
   `2026-11-02.1`): se aplica justo antes del `pnpm deploy:open` que publica
   ese texto, y el widget A pasa a invisible recién después. Desde D118 suma
   `0074` (acuerdos entre comunidades), aplicada por el responsable el
   09-11-2026. Desde D120 suma `0075` (moderación de acuerdos), que el
   responsable aplica con `supabase db push` antes del `pnpm deploy:open`
   que la necesita; la candidata D72 pasa a `0062-0075/v1` y el backup
   conoce `post-0075`. Desde D127 suma `0076` (gobiernos locales de Argentina
   en el nivel 4 y cinco localidades bonaerenses al nivel 5): mueve
   comunidades existentes, así que va con backup previo y `supabase db push`
   antes del `pnpm deploy:open`; la candidata pasa a `0062-0076/v1` y el
   backup conoce `post-0076`. El baseline 60/60 del proyecto anterior,
   verificado el 06-09-2026, ya no describe Producción. 0059 sigue sólo en
   `migration-drafts`. La coincidencia del ledger no sustituye la auditoría de
   RLS. Para inspeccionar cloud se escribe siempre el destino completo:

   ```bash
   pnpm exec supabase migration list --project-ref "ibtvlvpxwourrxwcrfkf"
   ```

   No usar nunca `--linked`. Toda migración futura exige dry-run con
   `--project-ref "ibtvlvpxwourrxwcrfkf" --skip-vault` y otra autorización
   explícita antes del push real; no cargar roles, Vault ni seed.

   Desde una red sin IPv6, la CLI necesita el enlace local para usar el pooler
   IPv4: en el plan Free la conexión directa sólo existe por IPv6 (D105). Se
   enlaza únicamente Producción, con
   `pnpm exec supabase link --project-ref "ibtvlvpxwourrxwcrfkf"`, y los
   comandos siguen nombrando `--project-ref` explícito. El enlace no habilita
   `--linked`. Un enlace a cualquier otro proyecto se reemplaza antes de
   correr el auditor D72 de Supabase.

3. Revisar Security Advisor sin hallazgos críticos. Los hallazgos no críticos
   de Performance Advisor se registran para la primera semana y no bloquean por
   sí mismos. Confirmar RLS, grants de funciones y que Realtime no publique datos
   de voto. Probar desde SQL que las constancias de participación no contienen
   opciones y que no existe ninguna fila individual de boleta o reparto: sólo
   tallies privados agregados, actualizados en todas sus opciones/propuestas en
   cada emisión. Verificar que los logs de API, proxy, observabilidad y auditoría
   no capturen cuerpos ni parámetros de las RPC de voto. No habilitar un listado
   de votantes por opción. Este modelo evita una elección persistida vinculable;
   anonimato frente al propio controlador requeriría un protocolo criptográfico
   separado y no debe prometerse como propiedad de esta versión.
4. Verificar Auth: URLs exactas para `/auth/callback` y `/auth/confirm`,
   confirmación de correo, recuperación, contraseña segura, y el gate específico
   de Google OAuth si se habilita, límite de correo de `6` por hora (y
   `SUPABASE_AUTH_EMAIL_RATE_LIMIT_PER_HOUR=6` para el preflight), protección de
   contraseña filtrada y TOTP habilitado para
   enrollment/verification con máximo 2 factores. Un GET del correo debe mostrar
   la confirmación sin consumir el token; sólo el POST explícito lo usa.
   Probar que un moderador `aal1` no puede leer ni escribir por UI ni
   PostgREST, y que después de verificar TOTP el JWT nuevo es `aal2`.
   No promover roles de moderación hasta que la cuenta tenga contraseña propia
   y TOTP verificado. No abrir el registro al público hasta integrar Turnstile
   end-to-end para el dominio final, incluida la validación server-side A y el
   guard B de Supabase Auth contra llamadas públicas directas.
5. Verificar Resend: dominio, SPF, DKIM, DMARC, remitente, bounces, complaints,
   tracking de enlaces desactivado y plantillas ES/EN. Un envío repetido debe ser
   idempotente.
6. Confirmar que `CRON_SECRET` tiene al menos 32 caracteres y que cada cron
   registra ejecución, duración, cantidad procesada, backlog y error.
   Verificar explícitamente los cinco schedules configurados en
   `wrangler.jsonc` y sus handlers:
   `/internal/process-account-deletions`, `/internal/cleanup-claim-uploads`,
   `/internal/purge-retained-data`, `/internal/sync-notifications` y
   `/internal/escalate-claims`. Sin `Authorization` deben responder 401.
   La corrida diaria de retención debe dejar también duración y cantidad
   agregada `abandonedOAuth`; nunca correos o IDs. Hasta instalar un monitor
   externo, el responsable revisa diariamente que los cinco jobs hayan corrido
   y trata una ausencia como incidente operativo. `scheduled()` debe despachar
   internamente al fetch handler Qwik con una `Request` sintética autenticada;
   una ejecución programada nunca hace una llamada HTTP externa a Agorbis.
7. En local, borrar una cuenta de prueba con avatar y borradores, comprobar
   que deja de poder mutar inmediatamente y que el cron conserva la gracia de
   15 minutos antes de retirar esos objetos. Simular además un fallo recuperable
   y validar alerta, reintento, dead-letter y barrido de huérfanos sin tocar la
   evidencia de un reclamo publicado.
8. Verificar los límites del runtime Edge: cada una de las cuatro evidencias de
   un reclamo debe quedar en 950 KiB o menos, el bucket `claims` debe aplicar el
   mismo máximo y la exportación web debe rechazar paquetes por encima de 3 MiB
   en vez de entregar JSON truncado. Auditar objetos históricos antes del corte;
   si existe alguno mayor al nuevo límite, migrarlo o retirarlo de ese proxy.
9. El Paso 1 de AAIP ya emitió el código público del responsable
   `RL-2026-81658385-APN-DNPDP#AAIP`; conservar su constancia fuera del
   repositorio. El Paso 2 fue presentado bajo
   `EX-2026-82087278- -APN-DNPDP#AAIP`, pero ese expediente no es una
   aprobación ni el número de registro de la base: conservar el acuse y esperar
   la constancia aprobatoria antes de abrir el registro.
   Completar también el registro `/subencargados`. Confirmar los destinos reales
   ES/EN, DPA, base argentina y retención de cada flujo que se declare. Para el
   primer request que recibe Cloudflare Workers, documentar cláusulas modelo AAIP
   efectivamente incorporadas, una aprobación documentada de AAIP o una
   excepción concreta del artículo 12. El preflight debe rechazar cualquier
   “pendiente”, un DPA genérico y el consentimiento del alta usado como única
   respuesta: esa acción ocurre después y no es retroactiva. El consentimiento
   expreso puede respaldar las transferencias posteriores a destinos no
   adecuados; por eso las respuestas de Supabase, Resend y Cloudflare se siguen
   inmediatamente, pero no forman un bloqueo conjunto si no surge otra
   prohibición contractual.
   El país de transferencia quedó vacío en la presentación y debe corregirse:
   Estados Unidos ya es un destino confirmado; no inventar el resto de la red
   global ni de los subencargados. Conservar evidencia de la incorporación del
   DPA Cloudflare v6.4 a la cuenta. Sus términos de Developer Platform permiten
   retirar o suspender contenido que divulgue información personal sensible;
   por ello el DPA no sustituye la prohibición, reporte y remoción de datos
   sensibles de terceros.
   Los pedidos listos para enviar y la evidencia que debe conservarse están en
   [`TRANSFER_SAFEGUARDS_REQUESTS.md`](TRANSFER_SAFEGUARDS_REQUESTS.md).
10. Antes del go-live, mantener al menos una copia recuperable del código fuera
    del disco de desarrollo: remote Git privado o bundle verificado copiado a
    otro dominio de fallo. Esto evita que el release dependa de un único disco.
    `scripts/scan-secrets.mjs` debe pasar antes del commit y del push. Secret
    scanning y Push protection son hardening cuando el proveedor/plan los
    ofrezca; no sustituyen la rotación inmediata de una credencial expuesta.
11. Inspeccionar el artefacto construido: `dist/_worker.js` debe contener los
    handlers `fetch` y `scheduled`, y `dist/q-manifest.json` debe corresponder a
    un build Qwik de Producción. Confirmar `run_worker_first=true`, binding
    `ASSETS`, logs custom al 100 %, `invocation_logs=false`, traces
    deshabilitadas y que `agorbis.com`/`www` son los únicos custom domains.
    Confirmar que `sitemap.xml`, `404.html` y `q-manifest.json` están excluidos
    de Static Assets y que el scanner de `dist/` y `server/` no encuentra
    valores de secrets ni formatos de credenciales. Cloudflare ahora recibe
    HTTP/HTTPS de Agorbis;
    el preflight y `/subencargados` deben describir Workers, DNS y Turnstile A/B,
    no la topología histórica DNS-only.

    Referencias oficiales: [Cron Triggers de
    Cloudflare](https://developers.cloudflare.com/workers/configuration/cron-triggers/),
    [handlers scheduled](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)
    y [validación server-side de
    Turnstile](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Recomendado durante la primera semana (no bloquea el corte inicial)

- Ejecutar un ensayo de carga progresivo con datos representativos, nunca sobre
  datos reales de Producción.
- Conectar un monitor externo de ausencia de cron y de
  `/internal/health`; hasta entonces mantener la revisión manual diaria exigida
  por el gate.
- Configurar un log drain con acceso restringido, destino y retención
  documentados. Agorbis ya redacta correos, credenciales, UUID persistentes y
  campos de identidad y conserva `requestId`/`incidentId` para correlación.
- Programar un correo canario a una casilla operativa y alertar por no
  recepción, bounce o complaint. El smoke manual de SMTP y Auth sí sigue siendo
  obligatorio antes de abrir el registro.

## Gate específico de transferencias internacionales

El aviso `/transferencias-internacionales` y su aceptación no se agrupan con
Privacidad, Términos, edad o Normas. La versión y el hash del aviso deben
coincidir con la fila actual de `international_transfer_notice_versions`; la
aceptación durable se guarda por cuenta, versión, hash, idioma, origen y hora en
`user_international_transfer_consents`. Cambiar destinatario, datos, finalidad,
destino, riesgo, salvaguarda o consecuencia exige una nueva versión y una nueva
decisión.

Probar en Supabase local y repetir en el smoke controlado de Producción sólo las
comprobaciones no destructivas que dependan del proveedor real:

1. sin la casilla separada, registro y Google no salen hacia el proveedor y el
   widget A del registro todavía no se carga;
2. marcarla habilita el flujo, pero no crea por sí solo una aceptación durable
   atribuida a un correo no verificado;
3. una sesión sin la versión vigente llega a `/consentimiento`, no puede
   participar y sólo obtiene permisos después de registrar la decisión actual;
4. negarse conserva la lectura pública y bloquea el alta o mantenimiento de la
   cuenta; retirar el consentimiento inicia la baja porque los proveedores son
   esenciales;
5. `pnpm lint` ejecuta `scripts/check-legal.mjs` y detecta cualquier cambio de
   contenido sin la versión/hash correspondiente.

Este gate sólo cubre transferencias posteriores a la acción afirmativa. Antes
del corte, revisar evidencia contractual del mecanismo declarado en
`PUBLIC_TRANSFER_SAFEGUARDS{,_EN}` para el primer request y cualquier flujo que
llegue a Cloudflare Workers sin una decisión afirmativa previa y acreditable para ese
tratamiento: lectura pública y, cuando corresponda, ingreso, recuperación,
seguridad y ejercicio de derechos. Consentimiento y DPA, por sí solos, no
satisfacen retroactivamente ese checkpoint.
Contrastar el instrumento y su efectiva incorporación con la guía oficial de
[transferencias internacionales de la AAIP](https://www.argentina.gob.ar/transferencias-internacionales),
no sólo con la descripción comercial del proveedor.

## Gate específico de Turnstile A/B

La app sólo renderiza el widget **A**. El navegador entrega su token al handler
de Agorbis; el handler lo consume con Siteverify y exige `success`, `action` y
`hostname` antes de ejecutar Auth. Luego usa `SUPABASE_SECRET_KEY` para la
llamada server-only a Supabase, reenvía la IP confiable con
`Sb-Forwarded-For` y **no envía `captchaToken`**.

La configuración **B** existe únicamente en Supabase Dashboard →
Authentication → Bot and Abuse Protection y permite sólo `agorbis.com`. No se
renderiza, no genera un token dentro del flujo legítimo y su site key/secret no
se copian a la app, al repositorio ni al Worker. B sólo hace fallar las llamadas
directas que usen la publishable/anon key sin CAPTCHA.

Antes del corte, comprobar y cargar como atestación exacta del Dashboard:

```dotenv
SUPABASE_AUTH_CAPTCHA_ENABLED="true"
SUPABASE_AUTH_CAPTCHA_PROVIDER="turnstile"
SUPABASE_AUTH_IP_FORWARDING_ENABLED="true"
SUPABASE_AUTH_REQUIRE_CURRENT_PASSWORD_ENABLED="true"
SUPABASE_AUTH_SIGNUPS_ENABLED="true"
SUPABASE_AUTH_EMAIL_CONFIRMATIONS_ENABLED="true"
SUPABASE_AUTH_DOUBLE_CONFIRM_EMAIL_CHANGES_ENABLED="true"
SUPABASE_AUTH_ANONYMOUS_SIGN_INS_ENABLED="false"
SUPABASE_AUTH_PHONE_AUTH_ENABLED="false"
SUPABASE_AUTH_MIN_PASSWORD_LENGTH="12"
SUPABASE_AUTH_PASSWORD_REQUIREMENTS="letters_digits"
SUPABASE_PLAN="free"
SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED="false"
SUPABASE_AUTH_MFA_TOTP_ENROLL_ENABLED="true"
SUPABASE_AUTH_MFA_TOTP_VERIFY_ENABLED="true"
SUPABASE_AUTH_MFA_MAX_ENROLLED_FACTORS="2"
SUPABASE_AUTH_SITE_URL="https://agorbis.com"
SUPABASE_AUTH_REDIRECT_URLS="https://agorbis.com/auth/callback,https://agorbis.com/auth/confirm"
SUPABASE_AUTH_SECURITY_NOTIFICATIONS_ENABLED="password_changed,email_changed,identity_linked,identity_unlinked,mfa_factor_enrolled,mfa_factor_unenrolled"
SUPABASE_LEGACY_SERVICE_ROLE_DISABLED="true"
TURNSTILE_SUPABASE_GUARD_HOSTNAMES="agorbis.com"
```

Las variables anteriores no configuran proveedores; sólo bloquean el preflight
si no coinciden con lo revisado. Las credenciales A del Worker son únicamente
`PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET` y `TURNSTILE_HOSTNAMES`.
La protección contra contraseñas filtradas exige Supabase Pro o superior; el
arranque usa Free, `SUPABASE_PLAN="free"` exige atestarla en `"false"` y el
preflight lo avisa en cada corrida (D91). La política de contraseñas vigente
es 12 caracteres con letras y números: `letters_digits` en el vocabulario del
CLI, sin mayúsculas ni símbolos obligatorios (D101); el rótulo del Dashboard
("Letters and digits") no es el valor a atestar. Las dos Redirect URLs son
exactas y el proyecto de producción no acepta comodines de previews.

Evidencia mínima obligatoria en local y en el smoke controlado de Producción:

1. una llamada directa no mutante a Auth con `sb_publishable_...` y sin CAPTCHA
   devuelve `error.code === "captcha_failed"`;
2. un formulario legítimo de Agorbis obtiene un token A fresco, Siteverify lo
   acepta y el handler completa Auth con `SUPABASE_SECRET_KEY`, sin
   `captchaToken`;
3. omitir, falsificar o repetir A falla antes de cualquier llamada Auth;
4. enviar A directamente al guard B falla: son configuraciones con secrets
   distintos y A ya fue consumido;
5. ni la site key ni el secret B aparecen en Worker bindings, DOM, bundle,
   logs o artefactos.

Aplicar A al registro —cargándolo después de la casilla del Aviso de
transferencias—, ingreso con contraseña, magic link, recuperación y reenvío de
confirmación. No aplicarlo al cambio de contraseña, enrollment TOTP
ni baja de cuenta: esas superficies autenticadas no necesitan CAPTCHA. Probar
en cambio reautenticación, límite autoritativo por cuenta, auditoría y, donde
corresponda, `aal2`.

## Gate específico de Google OAuth

Estado del candidato del 8 de septiembre de 2026: Google **ya está activo en
Supabase**, confirmado por el operador y por la lectura documentada de settings.
D97 abrió con Google `false`, Facebook `false` y correo disponible; desde
D122 el objetivo del perfil abierto es Google `true`, y este gate rige para esa
activación. La autorización de commit/despliegue sigue vigente y su ejecución
requiere satisfacer los checks. Este gate no ordena apagar el proveedor como
supuesto inicial ni afirma que Agorbis esté cerrado. Tampoco autoriza por sí solo
recursos de prueba o escrituras de ensayo en producción.

`0066` implementa el protocolo separado con aviso bilingüe, versión/hash,
aceptación y retiro, pero no inserta un aviso aprobado ni aprueba cobertura
Google. La migración posterior `0067` incorpora el aviso aprobado
`2026-09-09.1`; su preparación local no acredita aplicación en producción.
Sin aviso vigente aprobado, Agorbis no ofrece iniciar Google aunque el
proveedor esté activo en Supabase. El plan operativo actual, las alternativas
aisladas y los pendientes están en
[Google en producción](google-production-readiness.md); la
[propuesta específica](google-consent-proposal.md) documenta el protocolo.
Los antecedentes de proveedor apagado corresponden a releases anteriores, no
certifican la configuración de este candidato.

No existe una operación «continuar con Google sólo si la cuenta ya existe».
Los botones de `/ingresar` y `/registro` llaman al mismo OAuth y cualquiera puede
crear una cuenta. Ambos exigen edad mínima, privacidad y transferencias generales;
registro agrega términos y normas. Google requiere además su casilla opcional
separada, enlazada al snapshot ES/EN aprobado. El POST vuelve a consultar el aviso
y rechaza una versión/hash que ya no coincida. La cookie de contexto vincula
nonce, proveedor, intención, destino interno por hash y decisión por diez minutos.

Tras el callback PKCE y el saneamiento de tokens, `grant_google_auth_consent()`
registra la decisión con el JWT propio. Si falla, el callback revoca y limpia la
sesión recién obtenida. Los acuerdos generales durables siguen registrándose en
`/consentimiento` cuando falten, antes de permitir participación. Un acceso
directo al endpoint OAuth de Supabase no acredita el preconsentimiento: aunque
llegue a crear una identidad, un callback sin contexto válido rechaza y limpia la
sesión nueva; no transforma un consentimiento posterior en autorización previa.

Client Secret, cookies, códigos y tokens nunca se pegan por chat ni se guardan en
HAR, tickets, trazas o logs. Los secretos OAuth permanecen únicamente en Supabase.

### Evidencia E2E obligatoria

Primero ejecutar la matriz real en el entorno aislado propuesto, con datos
sintéticos y cuentas autorizadas. Un frontend local conectado al Supabase
productivo sigue escribiendo en producción. Si se elige ese ensayo, acordar antes
su desviación respecto de staging y su alcance; no prometer un canary exclusivo:
un proveedor activo expone su endpoint OAuth a otras personas y ocultar el botón
no lo restringe a las cuentas de prueba.

Conservar sólo resultados saneados, commit, versiones legales y fecha; limpiar
cookies entre casos sin exportarlas. La matriz completa está en el
[plan de Google](google-production-readiness.md#matriz-para-el-ensayo-real).
Como mínimo:

1. **Cuenta nueva desde registro e ingreso:** sin los acuerdos requeridos o sin
   la casilla Google separada no sale al proveedor. Con el aviso aprobado, el
   callback registra la decisión Google propia, pero la cuenta nueva sigue en
   `/consentimiento` hasta completar los acuerdos generales; no participa antes.
   Continúa a onboarding sin copiar automáticamente nombre/foto al perfil público.
2. **Cuenta existente y enlace por correo:** conserva una única cuenta/perfil y
   el destino interno seguro. Comprobar correo confirmado coincidente y, en el
   entorno aislado, correo no confirmado: no hereda aceptaciones plantadas ni
   crea un perfil duplicado. Correo y recuperación siguen funcionando; no
   habilitar enlace/desenlace manual para superar un fallo.
3. **Cancelación, vencimiento y manipulación:** probar rechazo del proveedor,
   código faltante/repetido, más de diez minutos y alteraciones de nonce,
   proveedor, intención, destino o versión/hash. No obtiene participación ni
   una sesión nueva utilizable mediante el retorno inválido; si hubo canje,
   revoca y limpia esa sesión. No filtra la descripción cruda del proveedor.
4. **Aviso y registro:** comprobar cambio de aviso entre carga y POST y entre
   POST y callback, aviso ausente y decisión omitida. Sin aviso aprobado no
   inicia Google; sin registro confirmado no conserva la nueva sesión. Simular
   fallos de RPC/saneamiento localmente, sin provocarlos en producción.
5. **Retiro y exportación:** consultar y retirar desde `/perfil/acceso-google`.
   El retiro no cierra la sesión actual ni borra/desvincula la identidad Google;
   el correo permanece disponible. Un retorno iniciado antes del retiro no puede
   volver a consentir. Un nuevo inicio requiere otra decisión expresa. Verificar
   que la exportación incluye eventos y estado propios y que RLS niega lecturas
   de decisiones ajenas. Retirar sigue disponible sin aviso vigente y sin
   depender del gate de participación.
6. **Bypass del formulario:** ensayar el endpoint OAuth sin las cookies de
   Agorbis sólo en el entorno y con las cuentas autorizados. El callback debe
   rechazarlo, revocar/limpiar la sesión nueva y registrar una razón saneada como
   `missing_or_expired_preflight`. No confundir esa limpieza con eliminación de
   una identidad ya creada. El endpoint Supabase no se vuelve privado por
   proteger formularios de Agorbis.
7. **Cookie saneada:** reconstruir y decodificar en memoria las cookies
   fragmentadas `sb-*-auth-token*`. En HTTPS deben ser `Secure`, `HttpOnly`,
   `SameSite=Lax` y no contener `provider_token` ni `provider_refresh_token`.
   Buscar texto plano en DevTools no demuestra su ausencia. Comprobar recarga,
   navegación, cierre y reingreso además del primer callback.
8. **Retención y baja, sólo con fixtures locales:** conservar las pruebas de
   cuentas OAuth abandonadas, los límites/idempotencia de la purga y su acceso
   restringido. `0066` no fija por sí misma un plazo de retención para decisiones
   Google. No agregar purgas, borrados ni enlaces reales a la ventana productiva
   sin su autorización específica.

### Métricas, publicación y rollback

Preparar un tablero agregado de Supabase/Cloudflare para:

- callbacks iniciados/completados y fallos por `intent`, excluyendo
  cancelaciones voluntarias de la tasa de error;
- razones `exchange_failed`, `missing_code`, `missing_or_expired_preflight`,
  `provider_token_persisted` y `google_consent_not_recorded` del scope
  `auth/oauth-callback`, y fallos de limpieza;
- cuentas OAuth abandonadas y cantidad purgada `abandonedOAuth`, duración/error
  del cron y ausencia de la corrida diaria por más de 26 horas;
- duplicados de perfil, conflictos de enlace y tickets de recuperación, como
  conteos sin correo, nombre, token ni contenido.

Cualquier token persistido, participación sin aceptación, retiro revertido por
un callback anterior, duplicado de perfil o credencial en logs detiene el ensayo
y abre un incidente. Como umbral inicial, detener también si los fallos técnicos
—sin cancelaciones— superan 5 % en 15 minutos con al menos 20 intentos, o si los
5xx superan 1 %. Ajustar umbrales sólo con una línea base documentada.

Antes del corte autorizado, completar evidencia y aviso aprobado, ejecutar los
checks y el ensayo aislado, congelar commit y preparar un artefacto de reversión
compatible. Confirmar alineación entre Supabase y el bundle/Worker: Google `false` y
Facebook `false` al arranque (D97), Google `true` sólo cuando se active; pasar la certificación remota correspondiente al nuevo ledger
y dominio SQL D72 `v3` antes de publicar. Google ya está activo: verificar el
estado, sin repetir la activación. Si el operador lo desactiva mientras completa
los pendientes, reactivarlo únicamente al iniciar la ventana autorizada, tras la
preparación y justo antes de la certificación remota que exige Google activo.
No ejecutar un cierre/apertura D72 automático sobre el sitio ya público.

Después de publicar, hacer el smoke autorizado de registro/ingreso, callback,
consentimiento, sesión y correo, y observar al menos 30 minutos. Ese smoke no
reemplaza la matriz aislada ni puede prometer aislamiento de cuentas en un
endpoint público.

Para rollback, deshabilitar primero Google en Supabase y restaurar un artefacto
validado con Google y Facebook `false`, manteniendo el sitio y el correo
abiertos. Cambiar sólo la UI no cierra `/auth/v1/authorize`. Conservar el esquema,
eventos y barreras de retiro de `0066`; no borrar decisiones ni restaurar
aceptaciones retiradas. Reparar SQL hacia adelante si hace falta. Deshabilitar el
proveedor no revoca sesiones Supabase ya emitidas; ante una exposición, aplicar
el procedimiento de incidente, con rotación en Google/Supabase y revocación del
alcance autorizado. No borrar cuentas, perfiles o contenido como parte del
rollback ordinario. Preservar logs saneados y repetir el E2E antes de reabrir
Google.

## Límites autoritativos de participación

Los formularios anticipan estos límites, pero la fuente de verdad es la base.
No aumentarlos sólo en TypeScript: cualquier cambio se hace con una migración y
una prueba concurrente/adversarial.

- Comentarios de proyecto: 10 por minuto por cuenta y 500 por
  cuenta/proyecto; cuerpo de 1 a 1.000 caracteres no vacíos.
- Eventos de reclamo, fuentes y relaciones: 30 por hora por cuenta y 500 por
  contenido. Un contenido cuenta tanto como origen como destino de una
  relación.
- Hitos: 20 altas por hora por cuenta y 50 por proyecto. Tareas: 60 altas por
  hora y 200 por proyecto.
- Aportes no monetarios: 20 por hora y 100 por cuenta/proyecto. Descripción de
  5 a 1.000 caracteres, unidad de hasta 40 y cantidad positiva de hasta
  1.000.000.000.
- Compromiso monetario declarado: más de cero y hasta 1.000.000.000 por
  cuenta/proyecto. No se aceptan `NaN`/infinito y el total del proyecto debe
  permanecer dentro de `numeric(14,2)`.

El cierre de encuestas vencidas se ejecuta exclusivamente mediante
`/internal/sync-notifications` con `CRON_SECRET`; cargar la bandeja de una cuenta
no dispara ese trabajo global.

## Operación del borrado de cuentas

La solicitud prepara una outbox antes de eliminar Auth y bloquea nuevas
mutaciones de esa cuenta. La limpieza posterior es asíncrona e idempotente:
`/internal/process-account-deletions` corre cada hora y espera un mínimo de
15 minutos desde la baja de Auth. La ventana normal entre solicitud y limpieza
de avatar/borradores es, por lo tanto, de 15 a 75 minutos.

En cada corrida hay que observar trabajos reclamados, completados, fallidos,
dead-letter, antigüedad del más viejo y objetos huérfanos retirados. El mismo
proceso barre en lotes limitados los objetos de `claims` y `avatars` que llevan
más de 24 horas sin una relación válida. La evidencia ya publicada permanece
ligada al reclamo visible, pero quitar el vínculo del perfil no garantiza
anonimato si su texto o imagen identifica a una persona; el barrido automático
no debe tratarla como borrador huérfano y toda solicitud de derechos exige
revisión de contenido.

Un trabajo se reintenta automáticamente con leases de 15 minutos. Al llegar a
20 intentos queda en dead-letter y requiere intervención:

1. inspeccionar `last_error` y los eventos correlacionados por `X-Request-ID`;
2. comprobar si Auth desapareció y hacer inventario de objetos antes de tocar
   Storage;
3. corregir credenciales, permisos o indisponibilidad del proveedor;
4. reactivar el trabajo con la RPC exclusiva de `service_role`;
5. ejecutar o esperar el cron y confirmar que el backlog, los objetos y el job
   convergen al estado completado.

Alertar ante cualquier dead-letter, respuesta 5xx o trabajo con antigüedad mayor
a dos ejecuciones. No borrar filas de la outbox para silenciar una alarma. Los
jobs completados se retienen 30 días y luego se purgan.

## Backup y restauración

La base PostgreSQL, los metadatos de Storage y los bytes de sus objetos tienen
coberturas diferentes. Un backup de base no recupera los archivos de los
buckets.

Antes de cualquier restauración operativa, publicar una configuración revisada
con `triggers.crons=[]` o aislar el target de forma equivalente y comprobar en
Cloudflare que no quedan invocaciones programadas activas contra el destino. Los
triggers sólo se reponen después de validar DB, Auth, Storage, secretos, health y
smoke; nunca deben ejecutar housekeeping sobre un restore parcial.

1. Mientras `SUPABASE_PLAN="free"` (D91) no hay backups físicos administrados:
   la exportación lógica del paso 2 es la única copia, se repite al menos una
   vez por semana y antes de cada migración, y el RPO real es el intervalo
   entre exportaciones. El objetivo de 24 horas exige automatizar la exportación
   diaria o pasar a Pro. Al pasar a Pro, conservar además los backups físicos
   diarios y verificar que exista un punto posterior a la última migración del
   estado productivo exacto que se respalda: `0061`, `0065`, `0066` o `0067`.
   Un punto histórico de un ledger anterior no sustituye ese control. PITR no
   está habilitado ni es requisito inicial.
2. Generar además el backup lógico `v5` de DB y la exportación separada de todos
   los buckets mediante `pnpm backup:supabase:production`, seleccionando
   explícitamente `--managed-profile supabase-cloud-storage-v1.70.7-20260908`
   para el catálogo productivo auditado el 08-09-2026. Ver el comando completo y
   las limitaciones de recuperación en [BACKUP_AND_RESTORE.md](BACKUP_AND_RESTORE.md).
   Este perfil permite capturar y verificar el respaldo; su restore local sigue
   bloqueado hasta auditar la compatibilidad DDL/ACL y el cifrado de los
   volúmenes Docker. La contraseña DB se
   ingresa sólo por TTY oculto. El creador admite los ledgers completos exactos
   `post-0061` (60 migraciones: `0001`–`0058` + `0060` + `0061`),
   `post-0065` (64: ese inventario más `0062`–`0065`), `post-0066` (65: el
   inventario post-0065 más `0066`) y `post-0067` (66: el inventario post-0066
   más `0067`), y exige el mismo estado y hash antes y
   después de capturar. El restore también reconoce paquetes históricos
   exactos `pre-0060` y `post-0060`, siempre sin 0059, gaps ni migraciones
   desconocidas. Cifrar después el paquete, verificar su descifrado y SHA-256 y
   conservar al menos una copia
   cifrada fuera de la máquina de desarrollo, con el material de descifrado
   separado. Una clave OpenPGP dedicada y una segunda copia física son
   recomendaciones, no la única implementación aceptable. No guardar
   artefactos dentro del árbol versionado.
3. Crear para cada corrida un manifiesto que identifique fuente y fecha, versión
   del formato, migración esperada, bucket/ruta, tamaño en bytes y SHA-256 de
   cada artefacto u objeto. Calcular los hashes durante la exportación y
   verificarlos antes de cualquier restauración; una lista de nombres sin hash
   no prueba integridad.
4. Restaurar una vez por trimestre en Supabase local o en otro destino aislado.
   Nunca usar Producción como target del ensayo. Verificar primero el
   manifiesto, restaurar la DB, recrear la configuración de buckets y cargar los
   objetos; volver a descargar una muestra o todos los objetos y comparar sus
   SHA-256.
5. Validar versión de migraciones, conteos por tabla y bucket, foreign keys,
   políticas/RPC esenciales, referencias a objetos y login de una cuenta de
   prueba. Distinguir en el acta qué cubre el dump lógico, qué depende del
   backup físico de Supabase y qué se reconstruye desde el inventario externo
   de Auth/configuración.
6. Registrar fecha, duración, responsable, origen/target, identificador del
   manifiesto, conteos esperados/obtenidos y cualquier diferencia. El acta no
   incluye claves, tokens, cuerpos ni datos personales. Un backup sin hash o
   sin restauración ensayada no cuenta como gate cumplido.

## Actualizar producción ya abierta

Para el estado observado el 9 de septiembre de 2026, usar el perfil explícito
`OPEN_UPDATE` descrito en [los próximos pasos](production-launch-next-steps.md).
El procedimiento CLOSED que sigue es histórico y sólo corresponde a un origen
cerrado verificado. No cerrar Agorbis, retirar sus cinco crons ni cambiar
proveedores para encajar una actualización Google en ese procedimiento.

`wrangler.open-recovery.jsonc` conserva configuración, dominios y crons de
producción con Google/Facebook apagados. Su build se congela antes que el
candidato y queda vinculado por hash. La recuperación conserva las funciones de
retiro/exportación `0066` y el aviso `0067`. La publicación OPEN exige certificado
final y acta v3; un diagnóstico no la habilita.

La recuperación OPEN usa el mismo ejecutor con `--recover-open`, request/act/claim
hashes y cápsula FINAL del release. No depende del HEAD posterior ni del plazo de
promoción, pero rechaza una versión activa ajena. No revierte SQL ni elimina
cuentas, identidades o registros de consentimiento. La limpieza de la prueba
sólo afecta al alcance expresamente autorizado; la cuenta existente B no se
borra ni se desvincula como cleanup.

## Despliegue desde un origen cerrado

1. Congelar cambios y registrar el commit candidato.
2. Aplicar primero migraciones compatibles hacia adelante.
3. Desde el worktree limpio, verificar la cuenta activa con `wrangler whoami`,
   ejecutar el runner excepcional con el request absoluto actual y exigir sus
   dos dry-runs Wrangler sobre el artifact congelado. No usar
   `--env` ni editar el account/zone id en el repositorio. El proceso de build
   recibe las 22 variables `PUBLIC_*` exclusivamente desde
   `scripts/cloudflare-public-build-environment.mjs`: el perfil cerrado usa
   confirmadas y pendientes vacías; el perfil abierto ejecuta `check-open` y se
   detiene antes de compilar mientras quede una requerida pendiente. Vite usa
   `envDir=false` en este flujo y no lee `.env`, `.env.local` ni variantes de
   modo. El preflight compara las variables compartidas con `wrangler.jsonc` y
   bloquea cualquier divergencia antes de publicar.

   La `sb_secret_...` dedicada a Cloudflare, el `CRON_SECRET` exclusivo y el
   secret vigente del widget Turnstile A ya están cargados como Worker Secrets.
   No reingresarlos ni rotarlos durante la apertura. El widget B de Supabase
   Auth permanece separado y no se rota por este cambio. Después del smoke,
   revocar únicamente credenciales reemplazadas y cualquier token OIDC residual
   de Vercel.

   Exportar DNS inmediatamente antes del comando y compararlo con la línea de
   base cerrada vigente. No hace falta modificar DNS para abrir: apex y `www`
   ya son Custom Domains del Worker cerrado. El export histórico Vercel se
   conserva sólo como evidencia y no se restaura como rollback operativo.
   Confirmar que el correo permanece intacto y que no existe un registro web
   residual de Vercel.

   La cuenta ya usa Paid y el Worker cerrado ya está desplegado con los dos
   custom domains, `workers_dev=false`, previews apagadas, cero schedules y los
   tres Worker Secrets. Antes de abrir, verificar de nuevo ese estado y el
   inventario 3/3 sin reingresar ni rotar secretos:

   ```bash
   node scripts/cloudflare-closed-state.mjs \
     --phase custom-domains \
     --secret-stage complete
   set -o pipefail
   ./node_modules/.bin/wrangler secret list --name agorbis --cwd /tmp --format json |
     node scripts/cloudflare-secret-inventory.mjs --stage=complete
   ```

   Cualquier clave extra, faltante, duplicada o con tipo inesperado bloquea.
   Sólo los nombres y tipos se consultan o imprimen. Registrar el deployment y
   Version ID cerrados; no ejecutar otro `secret put`, `deploy:closed` ni cambio
   de dominio durante esta verificación. Comprobar 503 `no-store`, TLS, CSP,
   ambos custom domains, cero schedules, `workers_dev`/previews apagados y
   ausencia de valores secretos en artefactos/logs. La comprobación DNS debe
   usar DNS-over-HTTPS
   contra Cloudflare y Google, no `dig` por puerto 53: una red local puede
   interceptar ese puerto aunque el comando nombre un resolver externo. El gate
   fail-closed consulta además el inventario público vigente de rangos Cloudflare:

   ```bash
   node scripts/cloudflare-public-dns.mjs \
     --hostname agorbis.com \
     --confirm READ_ONLY_PUBLIC_DNS
   node scripts/cloudflare-public-dns.mjs \
     --hostname www.agorbis.com \
     --confirm READ_ONLY_PUBLIC_DNS
   ```

   `invocation_logs=false` evita los invocation logs persistentes automáticos,
   pero una sesión autenticada de Real-time Logs/`wrangler tail` recibe metadata
   de request de Cloudflare, incluida IP, URL y geolocalización de red. Durante
   smoke usar únicamente probes sin query ni datos personales, filtros de
   versión/IP cuando correspondan, no copiar la salida cruda y cerrar el tail al
   terminar. Confirmar por resumen saneado que `logs=[]`, `exceptions=[]` y que
   no aparece ningún secreto.

   Para releases posteriores los secretos sobreviven
   al deploy; una rotación repite sus gates por etapa y nunca materializa valores
   en `.env`, `.env.local` ni archivos temporales.

   Sólo después de validar la fase cerrada, obtener exit `20`, revisar el acta y
   recibir la autorización final literal, ejecutar:

   ```bash
   pnpm run release:open:exceptional:cutover \
     --request <misma-ruta-absoluta.json> \
     --act-hash <actHash>
   ```

   El dry-run emite primero el issuance `0600` externo
   `~/.local/state/agorbis/exceptional-cutovers/issued/<requestHash>.issued.json`,
   ligado a acta JSON/Markdown y artifact. El consumidor vuelve a ligar HEAD,
   policy, request, acta, issuance, artifact y `actHash` explícito. Antes del TTY
   y del upload, un inventario Cloudflare GET-only paginado exige cero markers
   previos. Bajo el lock publica y relee la cápsula CLOSED atómica; sólo
   entonces pide la frase TTY final, revalida todo y crea el claim `0600`. Sube
   esa versión con tag HEAD y digest ligado a todo el bundle, y verifica por GET el
   UUID y la unicidad del marker antes de crons y promoción. Instala exactamente
   los cinco crons y mueve 100 % del tráfico al Version ID recibido.

   OPEN y recovery comparten el lock global
   `agorbis.production-mutation.lock`, cuyo descriptor hereda todo hijo Wrangler
   mutante. Un marker previo/duplicado/incierto consume el acta: no reanudarla;
   crear otro HEAD y recertificar request/artifact/acta/issuance. La ventana usa
   un único host, operador y UID designados y confiables porque Versions no
   ofrece CAS remoto. Ante un fallo crítico, el hijo Wrangler debe estar
   terminado antes de restaurar el Version ID cerrado auditado y reconciliar
   schedules a cero.

   Si un crash deja esa restauración incierta después del claim, ejecutar sólo:

   ```bash
   pnpm run release:open:exceptional:recover-closed \
     --request-hash <requestHash> \
     --act-hash <actHash>
   ```

   La frase TTY exacta es `AUTORIZO RECOVERY CLOSED DE AGORBIS PARA
<requestHash> CON ACTA <actHash>`. Recovery usa la cápsula ya publicada, no
   depende del artifact ni de la expiración del acta, y sólo restaura el Version
   ID closed ligado más cero crons. El pointer de cápsula es un hardlink: todo
   backup/restore del state root debe preservar hardlinks (`tar` o `rsync -H`).
   Recovery histórico debe ejecutarse desde código versionado compatible con el
   `policyHash` del claim. El UID operativo se considera confiable porque
   controla también worktree, binarios y credenciales; no compartirlo con
   procesos no confiables.
   Como fallback fail-closed independiente, `pnpm deploy:closed` mantiene los
   mismos custom domains sirviendo el 503 y cero schedules. No usar un
   `wrangler deploy` manual para abrir Producción.

4. Ejecutar smoke público, incluido el par de pruebas Turnstile —directo sin
   CAPTCHA devuelve `captcha_failed` y flujo A legítimo funciona sin
   `captchaToken` hacia Supabase—, el gate versionado de transferencias, login,
   publicación de prueba controlada, voto, exportación, cron y health check.
   Confirmar además que `www.agorbis.com/*` responde 308 hacia la misma ruta en
   `https://agorbis.com/*` antes de cargar HTML, y que no existe una URL pública
   `workers.dev` ni una preview URL.
   Ejecutar primero `pnpm smoke:production:readonly` con
   `PUBLIC_SUPABASE_URL` y `PUBLIC_SUPABASE_ANON_KEY` de Producción: sus 22
   controles no crean usuarios, no usan secretos y no ejecutan crons
   autorizados. Después completar manualmente el flujo A, SMTP, recuperación,
   cookies y TOTP con una cuenta canaria; esas pruebas stateful no se
   reemplazan con un bypass automatizado de Turnstile. Ejecutar
   `pnpm smoke:production:crons` únicamente dentro de la ventana de corte, con
   `CRON_SECRET` obtenido de su custodia y la confirmación literal
   `AGORBIS_PRODUCTION_CRON_SMOKE_CONFIRM=RUN_AGORBIS_PRODUCTION_CRONS`; ese
   comando sí ejecuta housekeeping real y se detiene en el primer error.
5. Observar 5xx, latencia p95, errores Auth, conexiones DB, Storage, edad de la
   cola de moderación y entregas de correo durante al menos 30 minutos.
   Conservar `X-Request-ID` en el log drain para correlacionar una respuesta con
   los fallos de consulta del mismo request sin registrar contenido de usuario.

## Rollback

- **Primer corte:** conservar el Version ID validado de
  `wrangler.closed.jsonc`, que responde 503 y cuyo `scheduled()` no ejecuta
  housekeeping. Abrir con el config canónico sólo para la ventana de smoke. Si
  falla, ejecutar `pnpm deploy:closed`: publica el perfil cerrado conocido y
  reconcilia explícitamente los mismos custom domains, modo 503 y cero Cron
  Triggers. La línea de rollback mantiene los dominios conectados al Worker; el
  snapshot Vercel del 25-08-2026 es sólo evidencia histórica y no debe
  restaurarse como rollback operativo. Vercel quedó contractualmente fuera de
  la arquitectura y no es un failover.
- **Versiones posteriores:** revertir primero a la versión anterior conocida
  del Worker mediante el historial de deployments. Un rollback de código no
  modifica bindings, routes ni Cron Triggers: reconciliar por separado los tres
  contra `wrangler.jsonc`. Si el defecto está sólo en `scheduled()`,
  deshabilitar temporalmente los triggers mediante una revisión explícita hasta
  publicar la corrección.
- Las migraciones se diseñan hacia adelante: no ejecutar `down` destructivos
  durante un incidente. Deshabilitar la función afectada y aplicar una migración
  correctiva.
- Si hay corrupción, poner escrituras en mantenimiento, preservar evidencia y
  restaurar en un proyecto nuevo antes de cambiar tráfico.
- Nunca usar `db reset`, seeds ni datos demo contra producción.

## Incidentes

1. Clasificar: P0 (filtración/toma de cuenta/integridad de votos), P1
   (escrituras caídas o abuso activo), P2 (degradación), P3 (defecto menor).
2. Asignar un identificador, hora de inicio, responsable y canal de coordinación.
3. Contener sin destruir evidencia: revocar claves, bloquear RPC, pausar correo o
   cerrar escrituras según el caso.
4. Comunicar hechos confirmados, alcance y próxima actualización; no especular.
5. Rotar secretos comprometidos, revisar sesiones y conservar logs con acceso
   restringido.
6. Completar postmortem con causa, impacto, línea de tiempo, correcciones y tests
   que impidan repetición.

Mientras exista un único operador, una recuperación de MFA de moderación sigue
este procedimiento de emergencia verificable:

1. suspender primero el rol de moderación y revocar todas sus sesiones;
2. abrir un incidente y comprobar por separado el correo confirmado de la
   cuenta y el acceso al control plane de Supabase protegido por su propio MFA;
3. aplicar un enfriamiento mínimo de 24 horas, salvo que mantener el bloqueo
   cause un incidente P0 documentado;
4. retirar el factor desde Supabase Auth, registrar un TOTP nuevo y confirmar
   `aal2` antes de restituir el rol; y
5. conservar sólo identificador, tiempos, controles superados y resultado.

Cuando exista un segundo operador, la retirada del factor y la restitución del
rol pasan además a requerir su aprobación independiente. Nunca se solicitan ni
guardan el secreto TOTP, códigos temporales ni documentos de identidad completos
en logs, correo, chat o tickets.

## Privacidad y moderación

- Mantener un registro de tratamientos, proveedores y retención.
- Responder solicitudes de datos mediante un flujo autenticado, con exportación
  que falle ante cualquier colección incompleta.
- No borrar el audit log necesario para demostrar una decisión; restringir su
  acceso y aplicar la retención publicada.
- Las suspensiones deben conservar acceso a exportación, apelación y borrado.
- Revisar trimestralmente permisos de administradores, moderadores, Supabase,
  Resend y Cloudflare; exigir MFA a quienes tengan acceso operativo.

### Solicitudes de acceso, rectificación y supresión

Sebastian recibe el pedido en el correo público de privacidad y abre un caso
con identificador, fecha/hora, derecho solicitado, vencimiento y estado. El
registro no copia más datos de los necesarios ni se mezcla con soporte común.

1. Acusar recepción y verificar identidad de manera proporcional, sin pedir
   contraseñas, OTP, secreto TOTP ni documentos completos por correo. Una sesión
   reautenticada puede ser suficiente; toda excepción se documenta.
2. Fijar el vencimiento legal desde la recepción: acceso en **10 días corridos**;
   rectificación, actualización, confidencialidad o supresión en **5 días
   hábiles**. La exportación automática ayuda, pero no reemplaza datos de origen,
   destinatarios, logs o proveedores que la persona también haya pedido.
3. Si el dato está discutido, bloquear su uso o marcarlo en revisión mientras se
   verifica. Inventariar base, Auth, Storage, logs, correo, backups y terceros sin
   entregar datos de otra persona.
4. Corregir, suprimir o justificar por escrito la limitación aplicable. Si el
   dato fue comunicado a un proveedor u otro destinatario, notificarle la
   corrección/supresión cuando corresponda y guardar evidencia mínima.
5. Revisar texto e imágenes de contenido conservado: `author_id = null` no lo
   vuelve automáticamente anónimo. Redactar o retirar cuando la finalidad ya no
   justifique conservar datos identificables.
6. Responder por canal seguro, registrar fecha y resultado, y comunicar los
   canales de reclamo ante AAIP. Alertar al inicio de cada día por casos que
   venzan en 48 horas; una ausencia de respuesta es un incidente operativo.

Revisar mensualmente métricas de cantidad, plazos, rechazos, receptores
notificados y reincidencias, sin usar el contenido de los pedidos para analítica
de producto.
