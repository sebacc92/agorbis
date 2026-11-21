# Agorbis · recuperación Git y copia externa del código

Este procedimiento crea una copia autónoma del historial comprometido sin hacer
push ni incluir secretos de entorno. Es independiente del backup de Supabase y
no sustituye el inventario de configuración/credenciales.

## Estado auditado

La auditoría local del 25 de agosto de 2026 confirma:

- `git fsck --full --strict` válido;
- repositorio completo, no shallow;
- `HEAD` en `refs/heads/master`;
- ningún secret de formato conocido en los objetos alcanzables por ramas/tags;
- ningún remote ni upstream configurado;
- sin Git LFS ni submódulos;
- refs internas de Codex presentes, pero excluidas deliberadamente.

La ausencia de remote significa que los commits actuales todavía dependen de un
único disco. Además, un Git bundle nunca incorpora cambios sin commit. Mientras
el release candidate esté dirty, el comando de creación falla antes de escribir
el directorio de salida.

## Garantías del tooling

`scripts/git-recovery.mjs`:

1. exige Node 22.x, repositorio no shallow, `HEAD` adjunto y `git fsck` válido;
2. exige índice/worktree limpios y ausencia de `refs/stash`;
3. escanea todos los objetos alcanzables por ramas/tags locales —incluidos
   blobs, mensajes de commit/tag y árboles— y vuelve a escanear cada archivo
   versionable;
4. aborta ante secretos de formato conocido, punteros Git LFS, submódulos o una
   URL remote insegura/con credenciales o gitlinks de submódulos presentes en
   cualquier punto del historial;
5. incluye únicamente `HEAD`, `refs/heads/*` y `refs/tags/*`;
6. excluye `refs/codex/*`, `refs/remotes/*`, stash, reflogs y objetos colgantes;
7. crea un bundle v2 autónomo, sin prerequisitos, con permisos `0600` dentro de
   un directorio nuevo `0700` fuera del repositorio;
8. genera `git-bundle-manifest.json` y `SHA256SUMS.git-recovery`;
9. verifica hashes, cabecera/refs y realiza un restore real en un bare repo
   temporal, seguido de `git fsck --full --strict`;
10. elimina el directorio incompleto si cualquier gate posterior a su creación
    falla.

El escaneo por patrones reduce el riesgo de copiar credenciales conocidas, pero
no demuestra que un texto arbitrario de alta entropía sea público. Por eso la
copia externa debe cifrarse aunque el scan pase.

Los SHA-256 y object IDs detectan corrupción, pero el índice no es una firma
externa: una copia situada en un medio no confiable debe cifrarse y firmarse o
mantenerse dentro de un filesystem autenticado/cifrado.

## Crear y verificar

La recertificación D72 usa un lector separado y fail-closed:

```bash
pnpm git:d72:current-state
```

Ese comando exige Node 22.22.0, configuración local mínima, HEAD limpio e igual
a `origin/main`, divergencia `0/0` y dos auditorías de recuperación idénticas.
La credencial del remoto privado se resuelve mediante el helper global mínimo
validado, pero cada acceso ejecuta una copia privada efímera del binario. Además
hace un fetch de `main` a un object store temporal fuera del repositorio,
verifica el commit con `cat-file` y `fsck`, y elimina tanto el helper como el
object store antes de emitir evidencia saneada. No actualiza refs del repositorio
ni modifica el remoto.

Primero ejecutar la auditoría:

```bash
pnpm git:recovery:audit
```

Después de crear el commit local final y dejar el worktree limpio, elegir una
ruta nueva en un filesystem cifrado y fuera del repositorio:

```bash
recovery_dir="$HOME/.local/share/agorbis-git-recovery/$(date -u +%Y%m%dT%H%M%SZ)"
pnpm git:recovery:create -- --output-dir "$recovery_dir"
pnpm git:recovery:verify -- --bundle-dir "$recovery_dir"
```

El resultado contiene exactamente:

```text
agorbis.bundle
git-bundle-manifest.json
SHA256SUMS.git-recovery
```

No agregar archivos auxiliares dentro de ese directorio: el verificador falla
cerrado ante cualquier entrada extra.

Para comprobar recuperación manual en otra máquina:

```bash
git bundle verify /ruta/agorbis.bundle
git clone /ruta/agorbis.bundle agorbis-recuperado
git -C agorbis-recuperado fsck --full --strict
```

## Cifrado y segunda copia

La opción local mínima es cifrar el paquete con la clave pública de una clave
GPG de recuperación controlada por Sebastian. La clave privada y su frase de
recuperación deben vivir fuera de la máquina de desarrollo. No pasar la frase
por argumentos ni guardarla en `.env`.

Ejemplo, después de reemplazar el fingerprint por uno verificado:

```bash
recovery_key_fingerprint="FINGERPRINT-GPG-VERIFICADO"
tar --sort=name --mtime="UTC 1970-01-01" --owner=0 --group=0 --numeric-owner \
  -C "$(dirname "$recovery_dir")" -cf - "$(basename "$recovery_dir")" |
  gpg --batch --sign --encrypt --local-user "$recovery_key_fingerprint" \
    --recipient "$recovery_key_fingerprint" \
    --output "${recovery_dir}.tar.gpg"
```

Antes de considerar válida la segunda copia, descifrarla en un directorio
temporal de otro dispositivo, ejecutar `pnpm git:recovery:verify` sobre el
contenido y eliminar ese temporal. El archivo cifrado puede guardarse en un
disco externo cifrado o almacenamiento privado ya contratado; no hace falta
agregar un proveedor nuevo para el lanzamiento.

## Remote recomendado, todavía no ejecutado

Configurar un repositorio **privado** en la cuenta GitHub existente, con MFA o
passkey y alertas de acceso. Activar secret scanning/push protection sólo si la
cuenta y el plan realmente lo ofrecen; el scan local/CI sigue siendo obligatorio.
Usar SSH o HTTPS sin tokens embebidos en la URL. El primer push requiere
autorización separada.

El mínimo previo al corte es **una** copia recuperable fuera del disco de
desarrollo: GitHub privado o el bundle verificado y cifrado en otro dominio de
fallo. La estrategia recomendada inmediatamente después es conservar ambos:
GitHub como copia operativa y el bundle como recuperación independiente del
proveedor Git.

El bundle no contiene `.git/config`, hooks, credenciales, archivos ignorados,
variables Supabase/Cloudflare ni objetos de Storage. Esos elementos se
reconstruyen desde la documentación versionada y el inventario recuperable, con
los secretos reales conservados en un gestor cifrado separado.
