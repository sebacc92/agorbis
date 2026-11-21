# Preparación del próximo despliegue

Estado actualizado al 9 de septiembre de 2026. El despliegue
está autorizado y sigue sujeto a los controles existentes. Google ya está
activo en Supabase; Facebook permanece fuera del lanzamiento. El protocolo
Google `0066` está implementado y probado localmente. El responsable aprobó el
aviso y su casilla; `0067` incorpora su versión `2026-09-09.1`, aplicada sólo
localmente. No requiere rehacer autenticación.

## Camino acordado: terminar la entrega sin exigir nuevos correos

El responsable eligió continuar usando las condiciones estándar y la evidencia
pública disponible de los proveedores. Se esperan las respuestas de AAIP y del
seguimiento a Supabase ya enviados. Las consultas preparadas a Resend y
Cloudflare quedan como recursos opcionales para aclarar lagunas concretas; su
envío no es un requisito técnico de publicación.

La aprobación del aviso tiene su
[registro concreto](google-notice-owner-approval-2026-09-09.md). No registra una
aceptación global de riesgos ni autoriza por sí sola pruebas que escriban
en producción. Los hechos desconocidos permanecen identificados. La vía
excepcional existente admite decisiones específicas del responsable sobre
determinados pendientes; no convierte esas decisiones en acreditación legal.

Orden práctico para el responsable:

1. **Cuentas de ensayo disponibles.** El responsable confirmó el 9 de septiembre
   que dispone de las dos cuentas Google propias: una cuyo correo ya está
   registrado y confirmado en Agorbis y otra nueva para Agorbis. Se identificarán
   como B y A, respectivamente, sin guardar sus direcciones en el repositorio.
   Esta confirmación no autoriza todavía el enlace de identidad ni el ensayo.
2. **Aviso aprobado e integrado.** El
   [aviso Google bilingüe](google-access-notice-review.md), su casilla y la
   activación `0067` están fijados por versión/hash y referencia de aprobación.
   La cobertura separada reconoce ese artefacto. No se reutiliza el aviso
   general ni hace falta pedir otra aprobación del mismo texto.
3. **Revisar una prueba concreta antes de ejecutarla.** La
   [alternativa aislada y matriz](google-production-readiness.md) sigue
   documentada. Si se usa producción para evitar recursos adicionales, la
   propuesta debe especificar las cuentas, la ventana, las escrituras y la
   reversión. Requiere la confirmación que el responsable pidió antes de
   realizar pruebas productivas. No es una prueba aislada aunque use dos
   cuentas propias.
4. **Publicar y comprobar.** El agente completa la actualización compatible con
   el sitio abierto, los checks y el paquete exacto; presenta las excepciones
   pendientes para ese candidato antes de usarlas. Luego ejecuta las
   migraciones y el despliegue autorizados, con la reversión preparada, y guía
   la prueba real. Facebook permanece fuera del lanzamiento y correo continúa.

Google ya está activado en Supabase. En esta etapa no hace falta activarlo otra
vez, cambiar credenciales, contratar planes ni enviar nuevas consultas. La
configuración efectiva de redirects, SMTP y recuperación se contrastará con
las capturas disponibles; cualquier dato faltante se pedirá de forma concreta
y sin secretos OAuth.

## Actualización del sitio abierto preparada localmente

El flujo de actualización `OPEN_UPDATE` ya está integrado en la preparación,
el artefacto, el acta, el canary y el ejecutor de publicación. Conserva el sitio
abierto y sus cinco crons. No utiliza el cierre de emergencia como procedimiento
normal para lanzar Google.

Se construyen dos paquetes del mismo código: recuperación con Google/Facebook
apagados y candidato con Google encendido/Facebook apagado. El candidato fija
el hash de su recuperación. Esa recuperación conserva correo, retiro del
consentimiento Google, exportación y snapshot aprobado `0067`; la versión vieja
por sí sola no acredita esa compatibilidad. El cleanup normal del ensayo vuelve
al origen observado, después de retirar consentimientos de prueba y cerrar sus
sesiones. La recuperación de emergencia usa el paquete nuevo compatible.

El origen se comprueba de nuevo antes de subir/promover. Después de un canary,
la evidencia debe explicar el cambio legítimo de deployment y conservar la
versión/configuración de origen. No se ignoran cambios remotos ni se alarga el
vencimiento de las comprobaciones. El modo `--recover-open` del ejecutor usa el
request, acta, claim y cápsula; el vencimiento de la ventana de promoción no
impide una recuperación autorizada de ese mismo release.

El capturador Google abre un navegador y observa los recorridos de las dos
cuentas propias. Conserva únicamente resultados saneados; no guarda HAR,
trazas, cookies, códigos ni tokens. Un diagnóstico no acredita OAuth ni permite
publicar. Las pruebas sintéticas del capturador tampoco sustituyen el ensayo.

La lectura remota del 9 de septiembre a las 12:14 UTC volvió a confirmar la
versión `95459d36-a7bb-497a-abdd-9d1f62f8a76c` OPEN, Google apagado en Worker,
Facebook sin binding y cinco crons. El origen observado no certifica el destino.
Las páginas de registro, ingreso y recuperación no enviaban `Cache-Control`.
La corrección local aplica `private, no-store` y `same-origin` a los recorridos
de cuenta. El smoke de origen registra esta carencia explícitamente, sin
convertirla en un PASS de autenticación; la prueba del candidato exige observar
la política nueva. Una respuesta servida realmente desde caché continúa
rechazándose.

Quedan por producir las evidencias reales del paquete remoto, la compatibilidad
de recuperación y los recorridos con escrituras autorizadas. No se emitió un
certificado final ni un acta de publicación a partir de datos simulados. La
preparación local no aplicó migraciones remotas ni ejecutó OAuth/deploy.

## Comprobaciones históricas anteriores a la activación 0067

Con Node 22.22.0, el 9 de septiembre de 2026:

- `pnpm build.types`: PASS.
- Vitest de `google-auth-consent.spec.ts` y `google-consent-account.spec.ts`:
  26 pruebas PASS. Son pruebas locales; no acreditan OAuth real.
- `pnpm test.release-open`: PASS después de corregir el contrato de scripts.
  El contrato había quedado desactualizado por las dos pruebas de backup
  agregadas. La revisión v8 incorpora ambas y rechaza su eliminación; no
  se quitaron controles ni se cambiaron las políticas de riesgos.
- `pnpm lint`: PASS con 417 pruebas de componentes en 41 archivos, suites de
  release, inventarios, formato y escaneo de secretos. El contrato v9 añade
  las pruebas de cobertura Google separada y del origen OPEN sin quitar las
  anteriores. Se comprueba también que su eliminación sea rechazada.
- `node scripts/test-cloudflare-public-build-environment.mjs`: PASS.
- `check-open`: continúa bloqueado por el aviso/cobertura Google y los once
  valores públicos pendientes. Los mensajes de Supabase y Resend ahora aclaran
  que la evidencia puede ser su documentación y condiciones aplicables, sin
  exigir una respuesta por correo. Los valores pendientes no se rellenaron.

En esa preparación histórica no se ejecutaron un build nuevo, migraciones
remotas, ensayo OAuth real ni deploy. La integración OPEN posterior se describe
arriba; sus pruebas locales tampoco acreditan OAuth real.

## Validación local posterior a la aprobación 0067

La migración aprobada se aplicó con `supabase migration up --local`, sin reset,
en el contenedor `supabase_db_agorbis`. El candidato contiene 66 migraciones.
El snapshot incrustado coincide byte por byte con el JSON revisado en `ca7bfdb`;
PostgreSQL verificó su hash y las pruebas no dejan aceptaciones automáticas.

Pasaron las 14 suites SQL, el build de cliente y preview, los tipos y el lint
completo, incluidas 417 pruebas unitarias en 41 archivos. El navegador local
terminó con 53 pruebas correctas y una omitida por Facebook desactivado. El
resultado final se incorpora en el
[registro del candidato](google-production-readiness.md#estado-del-candidato-con-0067-66-migraciones).

La reinstalación inicial de dependencias heredó permisos incompatibles con el
control de integridad de Wrangler. Se resolvió mediante instalación congelada
en un store local limpio, con `umask 022`, conservando lockfile, versiones,
hashes y checks. Los resultados finales corresponden a esa instalación.

El check estricto conserva once valores externos pendientes. No se ejecutaron
migraciones remotas, OAuth real ni deploy. Esa validación es anterior a los
cambios del runner OPEN descritos arriba.

## Estado comprobado

El backup real de Producción ya fue creado, cifrado y verificado localmente.
El restore desde ese backup y la copia fuera de la máquina siguen
**NOT_VERIFIED**. El perfil cloud firmado contiene 29 tablas administradas y
27 COPY; su existencia no prueba compatibilidad con el stack local de 31 tablas.
El [runbook de backup](BACKUP_AND_RESTORE.md) conserva el bloqueo temprano del
restore hasta revisar esa transición y el almacenamiento cifrado de Docker.

La aprobación e integración de `0067` resuelven la cobertura Google. La apertura
pública normal conserva once valores pendientes de
AAIP, ubicaciones ES/EN de Supabase/Resend/Cloudflare, retención ES/EN y
salvaguardas ES/EN. El inventario público y las políticas son válidos; el bloqueo
es la falta de evidencia, no un error de estructura que deba omitirse.

El inventario de recuperación es válido, pero `--require-ready` informa doce
capturas pendientes. El candidato contiene 66 migraciones; `0059` continúa sólo
en borradores. No se reutilizan certificados de candidatos anteriores para
acreditar este commit o un artefacto nuevo.

Las consultas de sólo lectura del 8 de septiembre a las 23:44–23:45 UTC
confirmaron Supabase Google `true`, Facebook `false` y correo `true`. En la
versión activa del Worker, el binding Google vale `false` y el binding Facebook
está ausente. El candidato preparado declara `true`/`false`, respectivamente.
Esta captura de configuración no determina los flags del bundle cliente activo.
La entrega pendiente debe alinear ambas partes; editar sólo una variable del
Worker no sustituye el build y despliegue coherentes. Las capturas privadas
tienen recibos y hashes verificados, con alcance parcial y sin resultado PASS
de gates ni certificación D72.

Supabase respondió al caso **SU-467483**: su Privacy Team informó la incorporación
del DPA a los términos desde el 1 de agosto de 2026, sin firma individual, con
prevalencia de acuerdos negociados distintos. El DPA versión 1 de esa fecha fue
revisado. Esto aporta evidencia del marco general; siguen pendientes las
aclaraciones específicas sobre los tratamientos, retención y salvaguardas
aplicables a Agorbis. No resuelve esas evidencias pendientes ni acredita una respuesta de
AAIP. El detalle se mantiene en la
[revisión de proveedores](provider-evidence-review-2026-09-08.md).

## Trabajo técnico que puede avanzar

1. **Completar el ensayo de recuperación.** La
   [comparación DDL/ACL completa](supabase-cloud-restore-review-2026-09-08.md)
   ya identificó siete índices cloud adicionales, además de Iceberg y ACL.
   El plan y su auditoría de referencias están implementados y probados, sin
   habilitar ejecución. Falta materializar y verificar el suplemento en un
   destino Docker cifrado y aislado, con baseline post-0061 y commit compatible;
   después ejecutar el restore y registrar el resultado. Hasta entonces el
   gate sigue pendiente.
2. **Completar las capturas técnicas recuperables.** Ya están capturados los
   ajustes públicos de proveedores Auth y los bindings de la versión activa del
   Worker, los dominios, cinco crons y metadatos de ambos widgets Turnstile.
   Las consultas DNS autoritativas respondieron; el export completo de registros
   por API quedó bloqueado por HTTP 403. Resend respondió HTTP 401 al listar
   dominios. Faltan esas dos capturas, configuración Auth completa, redirects,
   SMTP y custodia de secretos. Completar mediante los paneles o un acceso de
   lectura autorizado, sin solicitar secretos OAuth ni ampliar permisos por
   inferencia. Contrastar los exports saneados con el inventario formal antes
   de acreditar recuperación.
3. **Preparar la evidencia del candidato exacto.** Cuando terminen los cambios,
   fijar el commit limpio y recuperable y correr los checks afectados. La suite
   local verde prepara la certificación; los gates remotos necesitan su propia
   observación y los ensayos con escrituras requieren un entorno y cuentas
   autorizados. Una comprobación de sólo lectura no acredita un canary real.
4. **Mantener sincronizados los registros.** Registrar el respaldo completado y
   los exports obtenidos, conservando los pendientes de restore y copia externa.
   Las descripciones históricas del acta y las políticas con hash no se
   reetiquetan como evidencia del candidato nuevo.

## Evidencia que falta para cerrar la apertura

| Pendiente                    | Evidencia necesaria                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AAIP y conservación          | Estado documentado del Paso 2, declaración completa y conciliación de los plazos declarados con el tratamiento real. Un código RL o expediente EX no sustituye la inscripción de la base. |
| Proveedores y transferencias | Respuesta genérica SU-467483 y DPA de Supabase revisados; faltan aclaraciones específicas y evidencia aplicable de Resend/Cloudflare para destinos, retención y salvaguardas ES/EN.       |
| Aviso específico Google      | Aprobado e integrado mediante `0067`, con cobertura local verificada. Falta publicarlo mediante el artefacto y las migraciones del release autorizado.                                    |
| OAuth real                   | Redirects efectivos y matriz de cuentas nueva/existente, cancelación, decisiones, retiro y sesión, en entorno y cuentas autorizados. Los mocks locales no certifican Google real.         |
| Recuperación y custodia      | Restore completo, custodia independiente de la credencial de descifrado y evidencia de medios y recuperación de cuentas. El paquete local cifrado cubre sólo una parte.                   |
| Copia externa                | Validación del destino elegido, transferencia del ciphertext/checksum, descarga independiente y nueva verificación/restore. Google Drive sigue sin copia remota acreditada.               |
| Participación sensible       | Decisión revisada sobre el tratamiento y el borrador `0059`; no aplicar la migración ni modificar plazos o purgar datos por inferencia.                                                   |

Cuando lleguen aclaraciones específicas de Supabase o una respuesta de AAIP,
se contrastan con estos pendientes y se actualiza sólo lo que esa evidencia
permita acreditar. La respuesta genérica recibida no se amplía a tratamientos,
aprobaciones ni resultados PASS que no haya demostrado.

El responsable ya aportó el TIA del 14-03-2025 y se completó su
[revisión](supabase-tia-review-2026-09-08.md). También confirmó el envío del
[seguimiento SU-467483](supabase-follow-up-SU-467483.md); ahora se espera su
respuesta sobre vigencia y aclaraciones restantes. No se requiere reenviarlo,
volver a descargar el TIA ni volver
a pedir la firma del DPA estándar ni contratar HIPAA o soporte prioritario para
realizar esa consulta.

## Orden de trabajo después del seguimiento enviado

**Prioridad indicada después por el responsable:** continuar con privacidad
(punto 2) y postergar el trabajo de restauración/copia externa. El control de
recuperación conserva su resultado; todavía no se emitió ni aceptó una
excepción concreta para el candidato final.

El responsable también confirmó que envió a AAIP el pedido de la ficha completa
y espera respuesta. Supabase y AAIP no requieren otro envío ahora. Las consultas
a [Resend](resend-privacy-initial-request.md) y
[Cloudflare](cloudflare-privacy-initial-request.md) están preparadas como recursos
opcionales. No se registran como enviadas ni como requisitos adicionales de
deploy. El orden activo es el camino simplificado del inicio de este documento;
el detalle siguiente conserva los frentes pendientes y sus alcances.

1. **Recuperación y copia externa.** El agente completa la implementación y el
   piloto del destino aislado antes de solicitar intervención local. Después
   se ensaya el restore y se verifica una copia fuera de esta máquina. La
   contraseña no es el único pendiente: el launcher y el suplemento todavía
   requieren trabajo y pruebas. El responsable elige el medio de copia y
   desbloquea localmente cuando el procedimiento esté preparado.
2. **Privacidad y conservación.** En paralelo se esperan las aclaraciones de
   Supabase, se completa la evidencia de Resend/Cloudflare y se obtiene la ficha
   completa de AAIP. El agente concilia avisos, retención y tratamiento sensible
   con la evidencia aportada; no decide plazos o aplica el borrador 0059 por
   inferencia. No repetir gestiones ya enviadas.
3. **Google real.** Publicar el aviso específico ya aprobado y ejecutar la
   matriz real en un entorno autorizado, preservando correo. La alternativa
   propuesta es un Supabase temporal, cliente OAuth de prueba y frontend local;
   sus recursos no están creados ni autorizados por esta actualización de estado.
4. **Configuración recuperable.** Terminar exports saneados de DNS, Resend,
   redirects y SMTP/Auth, y contrastarlos con las capturas existentes. Los 403/401
   observados no se resuelven solicitando secretos OAuth por chat.
5. **Entrega final.** Certificar commit y artefacto exactos, aplicar migraciones
   mediante el procedimiento de release y publicar cliente/Worker coherentes;
   verificar el resultado con la reversión preparada. Google ya está activo
   en Supabase; Facebook continúa fuera del lanzamiento.

La cobertura específica Google está satisfecha en el candidato `0067`; los
once valores externos pendientes y el inventario de recuperación incompleto
conservan su estado. No se ejecutó un ensayo productivo ni deploy; tampoco se
convirtieron capturas parciales en certificados de recuperación. Los resultados
locales nuevos se registran por separado de las comprobaciones históricas.

Con los requisitos satisfechos, se cierra el artefacto, se certifican los gates
del candidato y se ejecutan las migraciones y la publicación mediante el
procedimiento de release, con smoke y reversión preparados. La autorización de
despliegue permanece vigente; no sustituye la evidencia que todavía falta.

## Límite de la etapa de ensayo Google

El CLI OPEN prepara dos artefactos ligados al mismo request: candidato con
Google y recuperación con Google desactivado; Facebook permanece desactivado.
Tras las autorizaciones concretas puede subirlos sin tráfico, verificar sus
bytes/configuración, adjuntar el candidato al 0 %, observar Google y recuperar
el origen o el fallback. Esta etapa produce un **diagnóstico**, no un certificado
final de los 27 gates. Dos ingresos exitosos no habilitan la publicación.

La captura observa cuentas nueva/existente, correo, cookies, PKCE, respuestas
Auth sin caché —incluido `q-data.json`— y decisiones Google. El negativo de
retiro usa una ceremonia anterior: exige rechazo del RPC con el JWT propio de
la cuenta y retorno `consent` de ese mismo nonce. Una aceptación nueva posterior
al retiro es otra decisión válida. El ensayo también puede cerrar las demás
sesiones de las dos cuentas; no borra ni desvincula la cuenta existente B.

Siguen sin productor productivo completo la recuperación por correo y entrega
SMTP; las dos pruebas Turnstile; MFA/TOTP; Storage privado y RLS; límites de
residencia; publicación/comentario/apoyo/voto; borrado de fixtures y de una
identidad efímera; y la prueba funcional completa de override/capability. Los
E2E y ensayos SQL locales no certifican esos hechos remotos. Son trabajo técnico
del agente, **no tareas pendientes del usuario ni requisitos de Facebook**.
La próxima etapa debe fijar entorno y fixtures concretos antes de implementar
o ejecutar participación y borrado; la identidad efímera será distinta de B.

El baseline vence en una hora y la capability en un máximo de veinte minutos;
el manifiesto OPEN no amplía esa ventana. Si no alcanza, se detiene y se renueva
la preparación y certificación. El diagnóstico separa recuperación de
infraestructura de retiro, cierre de sesiones y borrado todavía no verificados.
La recuperación `CANARY_ONLY` del runner depende del proceso vivo: el comando
standalone actual acepta `FINAL_RELEASE` y no constituye una recuperación
persistente invocable para una interrupción del proceso durante este ensayo.
