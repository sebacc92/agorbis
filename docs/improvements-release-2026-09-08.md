# Entrega de mejoras del 8 de septiembre de 2026

> Antecedente del commit `93af13b`, con 64 migraciones hasta `0065`.
> La preparación posterior incorpora el protocolo Google `0066` y alcanza 65;
> su evidencia y pendientes están en [el avance actualizado](release-readiness-progress-2026-09-08.md).
> Los resultados siguientes conservan su alcance histórico.

El operador autorizó resolver cinco mejoras de aplicación, una mejora adicional
de UI/UX, avanzar los pendientes de Google y finalmente hacer commit y desplegar.
Google está activo en Supabase por confirmación del operador; Facebook permanece
en pausa. No se solicitaron ni copiaron secretos OAuth. El alcance y la
implementación se describen en [mejoras-priorizadas.md](mejoras-priorizadas.md).

## Base y migraciones del candidato

La observación productiva anterior termina en `0061` (60 migraciones). El nuevo
candidato tiene exactamente 64: `0001`–`0058`, `0060`–`0065`; `0059` sigue fuera
del directorio ejecutable. Las cuatro nuevas se aplicaron únicamente a Supabase
local, sin reset:

| Migración | Cambio                                                | Compatibilidad con la app anterior                                                  |
| --------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0062      | Orden global de búsqueda y sobrecarga con `p_sort`    | Conserva firma anterior y límites                                                   |
| 0063      | Registro privado de solicitudes manuales y recibos    | No altera ni ejecuta la saga de baja                                                |
| 0064      | Preferencias, filtros y comunidades de notificaciones | Preferencias por defecto activas; conserva historial y avisos esenciales            |
| 0065      | Reserva de alias y consulta pública limitada          | Conserva RPC por UUID y alta de cuentas; backfill y trigger bajo lock transaccional |

El lock de `0065` puede demorar brevemente altas y cambios de perfil mientras se
crea el inventario de alias. No elimina datos ni amplía la proyección pública.

Preflight exige los 64 IDs y los nombres nuevos exactos. Backup reconoce estados
históricos y `post-0065`; un respaldo empieza y termina con el mismo ledger y
hash. No admite estados parciales ni deriva durante la captura. D72 exige una
certificación nueva del candidato: evidencia `0061` o de una versión anterior
del dominio no se reetiqueta. Las RPC invoker y los triggers nuevos quedan
incluidos en la comparación, además de RLS y ACL.

## Bloqueos comprobados de publicación

El build Cloudflare estricto rechaza el candidato antes de producir un artefacto
publicable. Los dos textos de procesamiento de Google ya están confirmados. Sus
pendientes no incluyen Facebook:

1. El aviso general vigente excluye Google. Falta completar y revisar la decisión
   opcional específica; se preparó una [propuesta concreta](google-consent-proposal.md).
2. Falta la constancia/número de inscripción de la base en AAIP.
3. Faltan ubicaciones respaldadas ES/EN de Supabase, Resend y Cloudflare.
4. Faltan salvaguardas aplicables y retención de proveedores respaldadas ES/EN.

Son doce bloqueos del inventario: uno de consentimiento y once evidencias
generales previas. No se usa la excepción de una publicación anterior para esta
entrega ni se desactivan los controles. No se aplican migraciones productivas
mientras no exista un candidato aprobable.

## Prueba y orden de publicación una vez resueltos

1. Completar las evidencias y la decisión Google sin imponerla al acceso por
   correo. Pasar checks, congelar el commit y preparar un checkout/dependencias
   nuevos conforme al runbook.
2. Ejecutar la matriz OAuth con cuentas nuevas y existentes, cancelación,
   consentimientos, retorno vencido/repetido, sesión y ausencia de tokens del
   proveedor. La alternativa mínima propuesta usa un Supabase temporal separado
   y frontend local; todavía no se crearon recursos. El alcance y la desviación
   de probar en producción requieren la confirmación específica descrita en
   [google-production-readiness.md](google-production-readiness.md).
3. Capturar y verificar backup del ledger productivo anterior y artefacto/versión
   vigente. Verificar compatibilidad de reversión y las cuatro migraciones.
4. En la ventana autorizada, aplicar exactamente las cuatro migraciones y
   certificar ledger, integridad, permisos y configuración reales. Un dry-run o
   un ensayo SQL local no equivale a una migración productiva aplicada.
5. Google ya está activo: no requiere otra activación. Si el operador lo apaga
   temporalmente, reactivarlo después de preparar y validar todo, justo antes de
   la certificación remota que exige Google activo. Facebook permanece apagado.
6. Publicar el Worker con flags cliente/runtime Google `true`, Facebook `false`
   sólo después de superar los controles aplicables. Verificar rutas públicas,
   CSS al navegar, correo, sesiones, búsqueda y nuevos recorridos, además del
   ensayo Google acotado aprobado. No cerrar el sitio por defecto.

## Reversión

Detener los nuevos inicios Google en Supabase y restaurar un artefacto compatible
con Google y Facebook desactivados, manteniendo email y el sitio abiertos. Un
rollback de Worker no retira identidades ni aceptaciones ya creadas por OAuth.

Las cuatro migraciones son compatibles con consumidores anteriores. Ante un
rollback de código, conservar tablas, preferencias, recibos y reservas de alias;
no ejecutar un down destructivo ni devolver un alias a otra persona. Los UUID
siguen funcionando. Un problema en SQL requiere una corrección hacia adelante
revisada; una restauración de datos es un procedimiento separado de incidente,
con backup verificado y alcance explícito.

Después de migrar, el próximo respaldo y ensayo de recuperación deben reconocer
`post-0065`. No reutilizar una evidencia de backup `post-0061` como prueba de
recuperación del esquema nuevo.

## Resultados finales locales

- Checkout de verificación `/tmp/agorbis-improvements-release`, store nuevo
  `/tmp/agorbis-improvements-release-store`, Node22.22.0, pnpm11.15.0, lock
  congelado y umask0022. Ningún `.env` productivo se copió.
- Build de cliente y preview SSR, TypeScript, ESLint, formato, scanner de secretos,
  i18n y hashes legales: PASS. La suite completa de `lint` incluye las políticas
  de release, recuperación, Cloudflare y Supabase y pasó sin omitir checks.
- Vitest: 304 pruebas PASS en37 archivos.
- Base local: 13 suites y470 aserciones PASS; los fixtures se revierten.
- Playwright final: 51 PASS, 1 omitida por Facebook deshabilitado, sin fallos.
  Incluye CSS SPA/historial, correo y cuenta, borradores aislados por usuario,
  errores de publicación, notificaciones, búsqueda, perfiles y recibos públicos.
- Build Cloudflare estricto: bloqueado, exit1, por los doce pendientes descritos
  arriba. No hubo upload, cambio de Worker ni migraciones productivas.
- OAuth real con Google: no ejecutado. Las pruebas de callback/sesión usan
  transporte simulado y las de correo usan exclusivamente Supabase local.

Logs locales: `/tmp/agorbis-improvements-final-e2e.log` (incluye build y checks),
`/tmp/agorbis-improvements-db.log`,
`/tmp/agorbis-improvements-final-strict-build.log`.

La corrida anterior de navegador tuvo un fallo en el selector de comunidad de
la prueba nueva; se corrigió a su rol accesible y la corrida final completa pasó.
La copia de trabajo anterior también fue rechazada por drift de cuatro shims
pnpm de Wrangler. Se resolvió con checkout y store nuevos, preservando la
política y la closure esperada; no se aceptó el árbol distinto.
