# Revisión del respaldo productivo para restauración

La revisión local del 08-09-2026 valida la integridad del backup
`backup-20260908T232222Z` y compara su referencia Auth/Storage con un dump de
esquema del stack local fijado. Los SQL y el diff completo permanecen en el
cofre cifrado, fuera del repositorio. No se ejecutó un restore ni SQL contra
producción.

## Pareja DDL auditada

Con `canonicalizePgDump` del tooling existente:

| Referencia | SHA-256 canónico                                                   | Líneas |
| ---------- | ------------------------------------------------------------------ | ------ |
| Cloud      | `fbcee7200d4f8459f9eae4eead125cc3fb4b5f08b2122e3f6dd01b1ca55529ec` | 2759   |
| Local      | `7ab2528928d33f5462126da7587962f1279a767ee5f8e6e4c898bd9c2ebda1a4` | 2814   |

El inventario de columnas/owners coincide en las 29 tablas comunes. La
referencia local incluye las dos tablas Iceberg, sus claves, índices, RLS y
permisos; las ACL de `storage.buckets` y `storage.objects` tienen la diferencia
de grants del propietario documentada en el perfil cloud. No se aplicarían
las ACL cloud sobre el destino para forzar igualdad.

El DDL revela además siete índices que existen en producción y faltan en local:

| Tabla             | Índices                                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `auth.users`      | `idx_users_created_at_desc`, `idx_users_email`, `idx_users_last_sign_in_at_desc`, `idx_users_name` |
| `storage.objects` | `idx_objects_current_version`, `idx_objects_null_version`, `objects_bucket_id_name_version_key`    |

Los cuatro índices Auth están definidos por el
[indexworker de Auth v2.195.0](https://github.com/supabase/auth/blob/v2.195.0/internal/indexworker/indexworker.go),
fuera de sus migraciones. Las tres definiciones Storage se acreditan por el
DDL cloud; no se encontraron en las migraciones ni en el código distribuido
de la imagen local Storage v1.70.7. No se les atribuye un origen no comprobado.

Los tres índices Storage son únicos y el último usa `NULLS NOT DISTINCT`.
Las columnas `bucket_id`, `name` y `version` admiten NULL: no se puede afirmar
que el índice local `bucketid_objname` sustituya todas esas garantías.
[Semántica PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createindex.html).

## Preparación técnica

La política `supabase-managed-restore-supplement-policy.mjs` fija la pareja de
DDL completa y un plan con sólo esas siete sentencias de creación de índices.
No acepta hashes suministrados para reemplazar los esperados ni una selección
parcial del DDL. Su estado es `supplement_required`, con
`executionAllowed=false`; no ejecuta el suplemento ni habilita el runner.

La auditoría puede repetirse con Node 22, manteniendo las referencias dentro de
almacenamiento cifrado:

```bash
node scripts/audit-managed-restore.mjs \
  --backup-dir /ruta/cifrada/backup-20260908T232222Z \
  --local-managed-reference /ruta/cifrada/local-managed-schema-reference.sql
```

El resultado sólo acredita coincidencia con la pareja revisada. No se aplican
índices con este comando ni se restablecen datos de personas.

### Validación realizada

Con Node 22.22.0 pasaron el test del suplemento contra las dos referencias
reales y sus mutaciones, los tests de perfiles y la suite existente de backup.
Se verificó el CLI con el respaldo íntegro y con copias de prueba dentro del
cofre: rechazó un manifiesto alterado y un archivo ajeno al inventario. Las
copias de prueba se retiraron y el cofre se desmontó. El comando también
comprueba `SHA256SUMS.backup`; no sólo los hashes declarados por el manifiesto.

Las comprobaciones de versiones/contenido legal y entorno público de build
siguen pasando. No se modificaron los textos legales activos ni las variables
vacías de evidencia. Las pruebas locales del plan no ejecutaron el suplemento,
no crearon un destino Docker ni acreditaron recuperación o apertura pública.

## Trabajo todavía necesario

1. Probar y materializar el suplemento exclusivamente en un target temporal,
   antes de cargar datos. Verificar cada índice, su owner, validez, predicado,
   collation y unicidad, y exigir que no cambie ningún otro objeto. Mantener
   vacías las dos tablas Iceberg adicionales y comprobar todo tras reiniciar
   servicios. Nunca ejecutar el DDL de referencia completo.
2. Construir una referencia aislada de la aplicación con el ledger exacto del
   backup: 60 migraciones hasta `0061`. El stack de desarrollo tiene 65 hasta
   `0066` y debe conservarse; no es el baseline equivalente de ese respaldo.
3. Resolver y probar el [entorno cifrado aislado](isolated-restore-environment.md).
   Cifrar el archivo del backup no acredita los volúmenes Docker donde se
   restaurarían los datos.
4. Conservar la identidad del backup y el gate de commit limpio. El paquete
   pertenece a `de75cb1`; no se reetiqueta para hacerlo coincidir con herramientas
   nuevas. Preparar un backup nuevo con el tooling validado y commit fijado
   cuando corresponda ejecutar el ensayo.
5. Completar el restore real, pruebas de Auth/RLS/Storage, integridad del source
   y limpieza; después conservar y verificar una copia fuera de la máquina.

El restore de un estado post-0061 tampoco certifica por sí solo las migraciones
posteriores ni el lanzamiento del candidato post-0066.
