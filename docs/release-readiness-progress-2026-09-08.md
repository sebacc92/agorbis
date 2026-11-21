# Agorbis · avance técnico y siguiente etapa

Actualizado el 8 de septiembre de 2026, después del respaldo productivo preparado
con el commit `de75cb1`. No registra un despliegue ni una aprobación legal. El
sitio ya era accesible; esta entrega no es su primera publicación.

## Estado actual posterior al respaldo

El primer backup real de Producción ya fue creado, cifrado y verificado
localmente. El commit `de75cb1` incorpora el perfil completo y explícito del
catálogo cloud, conservando los controles y los backups locales históricos.
La copia cifrada verificada no acredita todavía un restore real ni una copia
fuera de esta máquina. Esos dos resultados siguen **NOT_VERIFIED**; el gate de
recuperación no pasa a verde por la creación del paquete.

La validación local de sólo lectura, ejecutada con Node 22.22.0 después de ese
commit, confirma:

- Inventario público, política de gates `D72/2026-09-08/v5` y catálogo de
  evidencias: válidos, sin modificar sus requisitos.
- Apertura pública: **BLOCKED**, con doce entradas pendientes. Una corresponde
  al aviso/cobertura Google; las otras once, a AAIP y a textos ES/EN de
  ubicaciones, retención y salvaguardas.
- Inventario de migraciones: 65 archivos candidatos y `0059` únicamente en
  borradores. Esta lectura local no afirma que el candidato esté aplicado en
  Producción.
- Inventario de recuperación: estructura válida, con doce capturas todavía
  pendientes; `--require-ready` permanece **BLOCKED**. Algunas son exportaciones
  técnicas recuperables por lecturas autorizadas; el número no equivale a doce
  decisiones que deba responder el responsable.

El [plan de preparación del despliegue](production-launch-next-steps.md) separa
las tareas técnicas que pueden avanzar de las evidencias y decisiones aún
necesarias. Google sigue confirmado activo y Facebook fuera de alcance. No se
modifican sus requisitos por una respuesta genérica de un proveedor.

Las capturas de sólo lectura del 8 de septiembre, a las 23:44–23:45 UTC,
confirmaron en Supabase `google=true`, `facebook=false`, `email=true` y
`disable_signup=false`. La versión activa del Worker mantiene el binding
`PUBLIC_GOOGLE_AUTH_ENABLED=false`; `PUBLIC_FACEBOOK_AUTH_ENABLED` no figura
entre sus bindings. El candidato preparado declara explícitamente Google
`true` y Facebook `false`. La observación cubre configuración del Worker y no
acredita los flags del bundle cliente activo. La entrega debe alinear cliente,
Worker, proveedor y aviso aprobado mediante el procedimiento de release.

Los dos registros saneados y sus recibos se conservaron fuera de Git, con
permisos privados y SHA-256 comprobados. Otra captura a las 00:00 UTC del
09-09 (21:00 del 08-09 en Argentina) confirmó:

- `agorbis.com` y `www.agorbis.com` vinculados al Worker `agorbis`, entorno
  `production`, y cinco horarios cron coincidentes con el repositorio.
- Dieciséis consultas DNS directas a ambos nameservers con respuestas
  autoritativas y `NOERROR`. Esto no prueba propagación recursiva ni DNSSEC.
- Dos widgets Turnstile de Agorbis, modo `managed`, región `world`. Se
  conservaron dominios y fingerprints de sitekeys, sin leer sus secretos.
- Lectura de registros DNS por API: **HTTP 403**, aunque la consulta de zona
  respondió 200. Lista de dominios de Resend: **HTTP 401**. No se ampliaron ni
  renovaron permisos; ambas capturas quedan bloqueadas con recibo propio.

Estos exports siguen siendo parciales: faltan configuración Auth completa,
redirects, SMTP/Resend, inventario DNS completo y custodia de secretos. No
acreditan OAuth real ni ejecución de los crons. Ninguna captura se incorporó
como recibo D72 ni cambió los inventarios o gates formales. Sus archivos 0600
y hashes se verificaron en directorios privados fuera del repositorio.

La [auditoría del backup y su referencia de restore](supabase-cloud-restore-review-2026-09-08.md)
también quedó implementada y probada con Node 22.22.0, incluidas referencias
reales, mutaciones de DDL, manifiesto alterado y archivo no inventariado. Pasaron
los tests de backup/perfiles, formato, secretos y comprobaciones legales y de
entorno público afectadas. El resultado mantiene `executionAllowed=false`:
no se ejecutó el suplemento, un restore ni el despliegue.

Supabase respondió al caso **SU-467483**. Su Privacy Team informó que el DPA
está incorporado a los términos desde el 1 de agosto de 2026 y no requiere firma
individual; un acuerdo negociado distinto conserva su prevalencia. Se revisó
la versión 1 del DPA, fechada ese día. Esta respuesta acredita el marco
contractual general, pero no resuelve por sí sola las ubicaciones completas,
la retención por servicio ni el mecanismo argentino aplicable. La
[revisión de proveedores](provider-evidence-review-2026-09-08.md) conserva ese
alcance y el seguimiento específico. Los doce bloqueos del build siguen
pendientes; no se recibió aquí una nueva constancia de AAIP.

Después el responsable aportó `Supabase+TIA+250314.pdf`, fechado 14-03-2025:
su [recepción y revisión están completadas](supabase-tia-review-2026-09-08.md).
Se documentaron EE. UU./Singapur como destinos expresamente mencionados en
esa versión, las medidas declaradas y la diferencia de importador frente al
DPA actual. Falta confirmar vigencia, alcance por servicio, borrado y mecanismo
argentino. Se actualizó el seguimiento; no se publicaron los países como una
lista actual exhaustiva ni se cambió ningún gate.

El responsable confirmó luego que respondió el seguimiento SU-467483. Se
registró el envío declarado, sin acceder al correo ni verificar su cuerpo
exacto; la respuesta particular sigue pendiente. Se repitieron únicamente los
controles locales de apertura e inventario recuperable: doce bloqueos de
apertura e inventario aún incompleto. El [orden de trabajo](production-launch-next-steps.md#orden-de-trabajo-después-del-seguimiento-enviado)
prioriza recuperación y copia externa, con la evidencia de privacidad en
paralelo, antes de certificar Google y publicar el candidato final.

Actualización de prioridad: el responsable pidió continuar con privacidad
(punto 2), postergando el trabajo del ensayo de recuperación y copia externa.
La posibilidad de una excepción para recuperación fue explicada, pero no se
registró una aceptación para el candidato final ni se cambió su resultado.
El responsable confirmó también el envío del pedido de ficha completa a AAIP;
espera respuesta. Se prepararon consultas iniciales breves a
[Resend](resend-privacy-initial-request.md) y
[Cloudflare](cloudflare-privacy-initial-request.md), con contactos verificados
y sin adjuntos requeridos. No se enviaron por el agente ni se cambió
configuración productiva, avisos, retención o inventarios formales.

## Preparación histórica anterior al respaldo

La siguiente sección conserva el corte de preparación local posterior al
commit `93af13b`, anterior a la ejecución del backup. Sus referencias a
comprobaciones pendientes o a ausencia de consultas productivas describen ese
momento; el estado del respaldo actual figura arriba.

- Investigación de documentación oficial vigente de Supabase, Resend y
  Cloudflare, con alcance y limitaciones por producto. Pedidos particulares
  preparados; el responsable envió posteriormente una consulta inicial a
  Supabase Support y aportó su acuse. Ese corte inicial sólo contaba con el
  acuse; la respuesta posterior del caso SU-467483 se registra arriba. Resend
  y Cloudflare siguen sin enviar.
- Capturas de Supabase aportadas por el responsable: base primaria en Ohio
  (`us-east-2`), plan Pro y límite de gasto activado. Registradas como evidencia
  visual, sin acceso directo a la cuenta. Capturas posteriores muestran ocho
  copias físicas del 01 al 08-09-2026 (última 08-09 a las 07:12:29 UTC), PITR
  sin habilitar y exclusión de objetos Storage. No acredita restaurabilidad,
  respaldo de los objetos ni cobertura de otros tratamientos. PITR es opcional
  para este lanzamiento según el runbook; no se contrató ningún complemento.
- Preparación de la copia propia: el exportador existente descubre todos los
  buckets y verifica bytes/SHA-256, por lo que no se exige otra captura de
  Storage. Node 22.22.0 y el CLI local están presentes; `.env.local` es un
  archivo regular con permisos 600, sin leer ni validar aquí su contenido.
  El volumen local muestra unos 183 GiB libres; no se midió el tamaño del
  backup ni se acreditó que alcance para sus copias de trabajo. Falta verificar
  un destino local cifrado y que el responsable disponga de la contraseña DB
  para el prompt TTY oculto. No se inició el backup ni se consultó producción.
- Registro fiel de la captura TAD: expediente en «Iniciación». No se atribuyen
  aprobación, número de base ni ausencia de requerimientos a esa pantalla.
  Capturas posteriores: Tareas pendientes sin tareas vinculadas y una notificación
  AAIP visible del Paso 1, fechada 24-08-2026; ninguna del Paso 2 en esa lista.
  No se leyó el contenido de los documentos ni el correo declarado.
  Después se revisó el PDF de identificación del responsable: contiene sólo
  su código RL, sin conservación ni ficha de la base. El original permanece
  fuera del repositorio; quedó preparado un pedido de copia a AAIP, sin enviar.
- Inventario de conservación real, diferencias con el año informado y dos
  alternativas para decidir con la declaración presentada. No se seleccionaron
  plazos ni se ejecutaron purgas. La participación sensible conserva un proceso
  de revisión separado; el borrador 0059 sigue fuera de las migraciones.
- Protocolo Google 0066: snapshot bilingüe aprobado e inmutable, decisión propia
  separada, retiro desde el perfil, exportación y barrera ante retornos anteriores
  al retiro. No inserta un aviso aprobado ni convierte aceptaciones generales en
  aceptaciones de Google.
- Inicio con versión/hash contrastados en servidor; retorno ligado a nonce,
  intención, proveedor, destino y vencimiento. El callback usa el método AMR del
  JWT recibido directamente de Supabase para evitar confundir OAuth sin tokens
  del proveedor con correo. Un método desconocido falla cerrado.
- Registro Google después de sanear la sesión; si no se confirma, revocación y
  limpieza de esa nueva sesión. La consulta y el retiro no exigen participación,
  no cierran sesiones existentes y no eliminan identidades. Correo permanece
  disponible. Secretos OAuth exclusivamente en Supabase.
- Inventarios alineados: candidato 65 migraciones, última observación productiva
  60; recuperación conserva explícitamente el estado histórico post-0065 de 64.
  D72 v3 requiere evidencia nueva y no acepta recibos anteriores para este candidato.
- Workspace pnpm limitado explícitamente al paquete raíz: el `package.json`
  generado por el preview SSR no se descubre como un proyecto nuevo al verificar
  dependencias. Se conservan el lock, los hashes y los checks de integridad.

Sin snapshot Google aprobado, la aplicación preparada informa indisponibilidad
de Google aunque el flag objetivo sea `true`. Supabase ya tiene Google activo,
según confirmación y observación previas; no se modificó el proveedor. Facebook
sigue en pausa y no es un requisito del lanzamiento Google.

## Validación histórica del candidato de aplicación

Se utiliza una copia de trabajo aislada con Node 22.22.0, instalación congelada y
store pnpm nuevo. La migración 0066 se aplicó únicamente a Supabase local, sin
resetearlo; se regeneraron sus tipos. Los fixtures SQL se revierten o eliminan.

- SQL completo: **548 aserciones en 14 suites, PASS**, incluidas 78 de Google.
- Concurrencia Google con conexiones locales reales: **11 comprobaciones PASS**.
  Se verificó retiro durante grant, rechazo del retorno antiguo e idempotencia
  entre grants simultáneos, con limpieza comprobada de los fixtures.
- Unitarias completas: **417 pruebas en 41 archivos, PASS**. Incluyen AMR,
  callbacks, consentimiento opcional, versiones y retiro.
- Compilación de cliente y preview SSR, tipos y lint completo: **PASS**. Incluye
  formato, secretos, i18n, documentos legales, gates de release, integridad
  Wrangler, inventarios, backup y recuperación.
- Worker y página 404 generada: **PASS con configuración de Supabase local**.
  Esta compilación comprueba compatibilidad técnica; no es el artefacto público
  aprobado por el build estricto de producción.
- Navegador local: **52 PASS y 1 omitido (Facebook desactivado)**. Comprueba también
  ausencia de aviso Google aprobado, retorno a correo, retiro persistente desde
  el perfil y exportación del estado/evento sin perder la sesión por correo.
- Build público estricto: **BLOCKED**, conserva las doce entradas pendientes de
  evidencia. No se desactivaron checks ni se intentó subir el Worker.

El SQL y las simulaciones no certifican el OAuth real. Quedan pendientes cuentas
nueva/existente, cancelación, consentimiento, vencimiento, sesión y ausencia de
tokens del proveedor contra Google, en un entorno y con identidades autorizadas.

## Evidencia y decisiones que siguen pendientes

| Acción                               | Qué se necesita                                                                                                                              | Resultado esperado                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Completar revisión de TAD            | Bandejas generales ya mostradas; faltan detalle del expediente, correo, formulario y acuse                                                   | Conocer requerimientos y alcance exacto del año declarado; no iniciar un duplicado por la captura |
| Cerrar evidencia de proveedores      | Supabase: capturas, DPA, respuesta general y TIA revisados; faltan vigencia/alcance y aclaraciones específicas. Resend/Cloudflare pendientes | Destinos, roles, salvaguardas y retención respaldados, con texto ES/EN coherente                  |
| Decidir conservación y participación | Declaración exacta y revisión de las alternativas y del tratamiento sensible                                                                 | Política revisada por categoría/evento y transición implementable; no purgas supuestas            |
| Aprobar aviso Google                 | Texto completo ES/EN, alcances y evidencia, versión/hash y constancia de revisión                                                            | Migración de activación específica y cobertura del gate revisadas; 0066 sola no publica el aviso  |
| Autorizar ensayo real                | Alternativa mínima aislada y cuentas de prueba; o desviación productiva expresamente acordada                                                | Matriz OAuth real saneada, sin grabar credenciales ni tokens                                      |
| Preparar entrega final               | Gates y pruebas resueltos; paquete cifrado ya verificado, restore y copia externa pendientes                                                 | Commit y artefacto exactos; migraciones y Worker correspondientes; smoke autorizado               |

No hace falta que el responsable vuelva a activar Google ahora: ya está activo.
El responsable envió la consulta inicial a Supabase Support. El agente no
envió consultas, creó recursos cloud, modificó TAD ni ejecutó pruebas que
escribieran en producción durante esta preparación.

## Documentos preparados

- [AAIP y lectura de la captura](AAIP_REGISTRATION.md).
- [Evidencia pública de proveedores](provider-evidence-review-2026-09-08.md).
- [Pedidos y seguimiento de proveedores](TRANSFER_SAFEGUARDS_REQUESTS.md).
- [Conservación y consulta AAIP, sin enviar](privacy-reconciliation-next-stage.md).
- [Decisión Google y aprobación pendiente](google-consent-proposal.md).
- [Matriz real, entorno aislado y reversión](google-production-readiness.md).

La reversión del código no borra aceptaciones ni identidades. Ante un fallo de
Google, se retiran sus nuevos inicios mediante una entrega coherente de cliente
y Worker y la configuración de Supabase prevista en el plan; correo se conserva.
No eliminar 0066 ni sus registros como sustituto de una reversión revisada.
