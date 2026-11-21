# Entorno aislado y cifrado para el ensayo de recuperación

Diseño revisable al 8 de septiembre de 2026. No se han creado sus recursos ni
ejecutado una restauración. El respaldo cloud existente está cifrado y verificado;
el ensayo continúa **NOT_VERIFIED**. La [comparación offline del DDL/ACL
cloud](supabase-cloud-restore-review-2026-09-08.md) ya identificó la transición
necesaria y dispone de una auditoría probada. Falta ejecutar y verificar esa
transición exclusivamente en el destino aislado.

## Recursos y límites

La propuesta usa un archivo nuevo de hasta **24 GiB**, LUKS2 y ext4, un namespace
de red sin salida y procesos Docker/containerd exclusivos. Requiere la contraseña
local de `sudo` en una terminal para preparar y retirar esos recursos. No requiere
instalar paquetes, modificar el daemon existente, su firewall, sus volúmenes ni
configuraciones globales de swap o coredump.

Los binarios instalados son Docker 29.8.0, containerd 2.3.4, cryptsetup 2.7.0 y
Linux 7.0.0-31; hay cgroups v2 y systemd 255. Rootless queda fuera de este camino:
faltan `newuidmap`/`newgidmap`, prerrequisitos de su
[instalación oficial](https://docs.docker.com/engine/security/rootless/).

| Recurso nuevo  | Ubicación y condición                                                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Archivo LUKS   | `Documentos/backups/Agrobis/control/restore/<id>/disco.luks`, creación exclusiva, modo 0600; comprobar espacio libre real además del tamaño sparse. |
| Montaje ext4   | `/run/agorbis-restore-<id>`; ruta corta, directorio propio, propagación privada. Todos los datos persistentes del ensayo residen aquí.              |
| Clave efímera  | tmpfs nuevo y pequeño `/run/agorbis-key-<id>`, modo 0700, opción efectiva `noswap`; no usar el tmpfs general como prueba de ausencia de swap.       |
| Estado cifrado | Bajo el montaje: `docker/`, `containerd/`, `state/`, `run/`, `tmp/`, `logs/`, configuración CLI, backup descifrado, baseline y workdirs.            |
| Procesos       | Slice exclusiva `agorbisrestore<id>.slice`: supervisor, descifrado, runner, Docker, containerd, shims y todos sus contenedores.                     |

Los 24 GiB son una reserva de diseño; imágenes, dos stacks, dumps y verificaciones
deben caber con margen. Si no caben, el preflight falla antes de descifrar. La
clave aleatoria sólo sirve para este disco descartable: al retirarla, el archivo
no sustituye al paquete cifrado de backup ni a su credencial de recuperación.

## Esquema mínimo del futuro launcher

Estos fragmentos describen argumentos; **no forman un launcher ejecutable**.
Faltan las verificaciones de identidad, memoria y compatibilidad indicadas abajo.

1. Crear exclusivamente el archivo, loop, mapper LUKS y montaje nuevos; registrar
   inode, dispositivo, UUID y PID de cada recurso. Crear la slice con
   `MemorySwapMax=0` antes de iniciar cualquier lector de datos. El supervisor
   entra con `unshare --net --mount --propagation private`; activa sólo `lo` y
   prepara dentro de ese namespace los procesos siguientes.
2. Usar configuración TOML propia de containerd y JSON propia de Docker, sin
   heredar `/etc/containerd/config.toml`, `/etc/docker/daemon.json`, contextos ni
   endpoints del usuario. El mínimo de argumentos es:

   ```sh
   containerd --config "$restore_mount/containerd.toml" \
     --root "$restore_mount/containerd" \
     --state "$restore_mount/state/containerd" \
     --address "$restore_mount/run/containerd.sock"

   dockerd --config-file "$restore_mount/daemon.json" \
     --data-root "$restore_mount/docker" \
     --exec-root "$restore_mount/state/docker" \
     --pidfile "$restore_mount/run/docker.pid" \
     --host "unix://$restore_mount/run/docker.sock" \
     --containerd "$restore_mount/run/containerd.sock" \
     --feature containerd-snapshotter=true \
     --exec-opt native.cgroupdriver=systemd \
     --cgroup-parent "agorbisrestore${restore_id}.slice" \
     --bridge=none --iptables=false --ip6tables=false \
     --ip-forward=false --ip-masq=false --userland-proxy=true \
     --log-driver=json-file --default-ulimit core=1:1
   ```

   Cada salida de daemon va a un archivo 0600 dentro de `logs/`; configurar
   `TMPDIR` y `DOCKER_TMPDIR` en `tmp/`. El supervisor redirige la salida del
   runner al mismo volumen antes de leer datos. El entorno de los hijos fija
   `DOCKER_HOST` al socket propio y `DOCKER_CONFIG` a un directorio propio; debe
   quitar overrides de contexto/TLS y credenciales cloud heredadas. No modifica
   `HOME`. Sólo los subdirectorios de trabajo y el acceso al socket necesarios
   se conceden al usuario; el estado de los daemons conserva sus owners.
   Descifrar el paquete directamente dentro de LUKS, con `GNUPGHOME` propio y
   sus procesos dentro de la slice; no pasar por un montaje gocryptfs cuyo daemon
   quede fuera de los controles de memoria del ensayo.

3. Importar offline únicamente las seis imágenes fijadas por el drill, exportadas
   por nombre/digest desde el daemon existente, sin consultar contenedores ajenos
   ni copiar volúmenes. Verificar nuevamente tags, `.Id`, descriptor y RepoDigests
   después de importarlas. Hacer primero el piloto con datos sintéticos.
4. Ejecutar baseline, Supabase CLI y Node 22 dentro del mismo namespace de red,
   usando el socket explícito. No crear veth/uplink, ruta por defecto ni publicar
   puertos fuera de ese namespace. Los bridges propios permiten hablar a los
   servicios entre sí; el userland proxy debe permitir los probes a `127.0.0.1`.
   Comprobar esta conectividad en el piloto, incluyendo todos los servicios.

No basta `--data-root`: con el almacén actual, containerd guarda sus datos por
separado. Tampoco corresponde cambiar a `overlay2`/`vfs` clásico: el pin Postgres
observado es un índice OCI y el almacén clásico no conserva esa representación.
Se mantiene el snapshotter sobre ext4 y se verifica la identidad al importar.
Fuentes: [almacenamiento del daemon](https://docs.docker.com/engine/daemon/),
[almacén containerd](https://docs.docker.com/engine/storage/containerd/) y
[compatibilidad de índices](https://docs.docker.com/desktop/features/containerd/).

`--iptables=false` y bindings loopback por sí solos no acreditan aislamiento en
la red del host; Docker advierte de exposición directa por bridges sin reglas.
Aquí el namespace sin uplink es la separación adicional. Revisar su inode frente
al host y sus interfaces/rutas, además de conservar los checks del drill.
[Documentación de firewall Docker](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

## Memoria: verificaciones pendientes del piloto

- **Swap:** los dos swapfiles actuales residen en ext4 sin cifrar. La slice nueva
  debe tener `memory.swap.max=0` desde antes del descifrado; comprobar ese límite
  en la jerarquía y pertenencia de todos los PIDs, incluidos scopes de Docker,
  shims y subprocessos. `--cgroup-parent` evita que los contenedores queden fuera
  de la slice. Registrar `memory.swap.current=0` antes y después. El tmpfs de la
  clave exige `noswap` efectivo. Estas medidas son locales al ensayo y no hacen
  `swapoff`. Fuentes: [cgroups v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
  y [tmpfs](https://www.kernel.org/doc/html/latest/filesystems/tmpfs.html).
- **Coredump:** el host usa un pipe a systemd-coredump con un límite literal;
  `LimitCORE=0` no acredita ausencia de volcado. Hay un candidato acotado:
  `LimitCORE=1:1` en la unidad y `--default-ulimit core=1:1` en este Docker. Linux
  7.0 aborta el pipe para ese valor especial de **un byte** antes de lanzar el
  handler. Verificar los límites efectivos de todos los procesos, su herencia
  tras exec/reinicio y ausencia de overrides de Supabase; realizar un crash de
  proceso sintético sin datos y comprobar que no aparece un core ni un evento
  de captura del handler. No usar `ulimit -c 1`, cuya unidad puede ser bloques.
  Este mecanismo sigue pendiente de validación en el kernel instalado; no se
  cambia `core_pattern` ni la configuración global de systemd-coredump.
  [Código del kernel 7.0](https://github.com/torvalds/linux/blob/v7.0/fs/coredump.c#L918-L965).

## Baseline exacto sin alterar el stack existente

El runner actual fija `supabase_db_agorbis`, su workdir al repo y los dumps source
al directorio del tooling. Eso no permite elegir una base temporal distinta.
La modificación posterior mínima sería un par inseparable de argumentos
`--source-workdir` y `--source-project-id`, con defaults actuales para preservar
el drill local. Todos los accesos source, dumps, status, pins, labels y checks
finales deben usar esa identidad; el nombre del contenedor no se acepta por sí
solo.

La nueva base se materializa dentro de LUKS desde el **mismo commit limpio** que
declara el backup. El tooling continúa verificando esa igualdad. Un workdir
Supabase separado contiene config local sin seed, plantillas y pins verificados,
y únicamente las migraciones que devuelve `releaseMigrationStateFromManifest`;
cada archivo se compara por nombre/hash con ese commit. Se registra la lista
completa de versiones, sin inferirla de un conteo o de un número de head.
Las migraciones posteriores permanecen intactas en el checkout y no se copian a
ese workdir. Así no es necesario retroceder el stack actual ni editar el repo.

Inicializar esa base vacía en el daemon nuevo y exigir ledger, schema canónico,
ACL, catálogo administrado, imágenes y pins exactos antes de tomarla como source.
La transición cloud de 29 tablas al destino local de 31 debe estar definida y
probada previamente; seleccionar migraciones de aplicación no resuelve por sí
solo las diferencias de plataforma. No se usa el backup restaurado como baseline
para demostrar que el mismo backup restaura correctamente.

El backup existente declara un commit anterior al tooling que incorporará estos
cambios. Conservarlo y, una vez probado y fijado el nuevo tooling, crear un backup
nuevo desde ese commit limpio. No eliminar la comprobación de igualdad de commit
ni reinterpretar el respaldo anterior como evidencia del candidato nuevo.

## Comprobaciones y retirada

Antes de datos reales, verificar cadena archivo→loop→LUKS→ext4; rutas reales de
Docker/containerd, mounts de cada contenedor y logs dentro del volumen; ningún
bind escribible a rutas externas; socket/PID/namespace/cgroup exclusivos; memoria
según lo anterior; imágenes fijadas y baseline exacto. Cubrir también temporales
que ignoren `TMPDIR` mediante mounts privados de `/tmp` y `/var/tmp` respaldados
por directorios del volumen. No enviar dumps, credenciales o logs crudos a la
terminal, journal o repositorio.

Al terminar o fallar: retirar sólo contenedores/redes/volúmenes atribuidos al
ensayo; parar Docker y containerd por sus PIDs y tiempo de inicio registrados;
comprobar cero procesos/mounts activos; desmontar ext4; cerrar el mapper exacto;
desasociar el loop exacto; retirar la clave y su tmpfs, la slice y namespace
propios. Nunca usar `prune`, nombres globales, `killall`, desmontaje lazy ni
eliminar el archivo si la cadena no pudo cerrarse. Conservar dentro del cifrado
la evidencia detallada y sólo un resultado saneado fuera de él.

Quedan tres pasos concretos: implementar y verificar el suplemento DDL/ACL;
implementar baseline/guardas y aprobar el piloto sintético de almacenamiento,
red y memoria; preparar el launcher administrativo revisable. Después el usuario necesita
introducir `sudo` localmente y desbloquear el paquete cuando se le solicite;
para un backup nuevo, también la contraseña DB en su TTY local. Ningún recurso
administrativo ni contraseña fue necesario para comparar las referencias SQL
una vez abierto el cofre.
