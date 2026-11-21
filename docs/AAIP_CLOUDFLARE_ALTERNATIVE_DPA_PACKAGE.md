# Agorbis · paquete para presentar el DPA de Cloudflare como contrato alternativo

> **ESTADO: BORRADOR OPERATIVO, NO PRESENTADO.** No afirma que el DPA haya sido
> aceptado por la cuenta, que AAIP lo haya aprobado ni que por sí solo habilite
> una transferencia desde Argentina. Requiere completar evidencia de la fecha
> efectiva, destinos, retención y revisión jurídica antes de enviarlo.

## Nota de estado, 8 de septiembre de 2026

El paquete conserva los hechos y borradores fechados del 26 de agosto. Sus
expresiones «cuando se habilite», «primer request público» o equivalentes son
antecedentes de esa preparación: **no describen un sitio que todavía no se haya
publicado**. Agorbis ya estaba accesible según la última observación documentada.
Antes de una presentación, conciliar las fechas reales de aceptación contractual
y de inicio de cada transferencia; no declarar ausencia de usuarios, tráfico o
tratamiento previo sin evidencia. Esta nota no altera aquellas fechas ni acredita
aceptación del DPA o aprobación de AAIP.

La [revisión pública del 8 de septiembre](provider-evidence-review-2026-09-08.md)
y las [solicitudes actualizadas](TRANSFER_SAFEGUARDS_REQUESTS.md) distinguen la
documentación oficial vigente de la evidencia particular de cuenta pendiente.
Ningún documento se envió al preparar esta actualización.

## Resultado que debe producir este paquete

Un expediente de evidencia, conservado fuera del repositorio, con:

1. el DPA de Cloudflare efectivamente incorporado a la cuenta de Agorbis;
2. el acuerdo principal aplicable y evidencia de aceptación/plan;
3. una nota que pida a AAIP aprobar ese contrato alternativo;
4. una matriz de diferencias contra las cláusulas modelo argentinas;
5. anexos con tratamiento, titulares, datos, finalidades, destinos,
   subencargados, retención y medidas; y
6. acuse, respuesta y cualquier condición impuesta por AAIP.

La página oficial de AAIP indica que, para transferencias a países no
adecuados, se pueden usar sus cláusulas modelo. Si se usa un contrato que
difiere de esos modelos, debe solicitarse aprobación dentro de los treinta días
corridos de la firma, acompañando el contrato y los puntos de diferencia:
[Transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales).
La base normativa es el artículo 2 de la
[Disposición 60/2016](https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-60-2016-267922/actualizacion)
y también existe el modelo responsable–encargado aprobado por la
[Resolución 198/2023](https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-198-2023-391538/texto).

La misma información oficial no reemplaza asesoramiento jurídico. Como otra
página de AAIP todavía describe el plazo con referencia a la transferencia, la
regla operativa prudente es no superar **la primera** de estas fechas: treinta
días corridos desde la aceptación efectiva del DPA o treinta días desde la
primera transferencia. La fecha exacta debe validarse antes de presentar.

## Hechos confirmados al 26 de agosto de 2026

### Agorbis

- Exportador/responsable: Sebastian Cardoso Castillo.
- Domicilio declarado para contacto: [domicilio reservado], Provincia de
  Buenos Aires, Argentina.
- Contacto: `sebastiancardoso92@gmail.com`.
- Código de responsable: `RL-2026-81658385-APN-DNPDP#AAIP`.
- Paso 2: expediente `EX-2026-82087278- -APN-DNPDP#AAIP`, todavía sin usarlo
  como número de registro de la base.
- Servicios Cloudflare realmente previstos: DNS autoritativo, Turnstile A/B,
  reverse proxy HTTP, Custom Domains y ejecución/entrega de Qwik mediante
  Workers.

### Contrato publicado por Cloudflare

- El documento vigente encontrado es
  [Cloudflare Data Processing Addendum v6.4, efectivo el 3 de abril de 2026](https://www.cloudflare.com/cloudflare-customer-dpa/).
- Copia PDF exacta revisada:
  [DPA v6.4](https://cf-assets.www.cloudflare.com/slt3lc6tev37/1TTgT35GoUNlKZYGuKWBFy/4e7dfc8cf402419a9b1cf624291fc69f/cloudflare_customer_dpa-v6.4_april_3_2026.pdf).
- SHA-256 observado el 26-08-2026 sobre esa copia:
  `7c778ab8510c5db073768b105805d88024e82ea4feb8ad19b559f236d51d0be3`.
  Debe recalcularse sobre el archivo efectivamente presentado.
- El DPA forma parte del acuerdo principal sólo desde la fecha en que el cliente
  lo firma o las partes acuerdan incorporarlo. La publicación web no prueba que
  Agorbis lo haya aceptado.
- Exportador: Customer; importador/encargado: Cloudflare, Inc., 101 Townsend
  Street, San Francisco, California 94107, Estados Unidos; contacto DPO
  `legal@cloudflare.com`.
- El Anexo 1 cubre End Users y Administrators, Customer Logs, IPs, contenido,
  archivos, imágenes, texto y otros objetos transmitidos o procesados.
- El DPA contempla expresamente que Customer Content pueda contener categorías
  especiales, incluidas opiniones políticas, origen racial o étnico, religión,
  creencias, afiliación sindical, salud o vida sexual, y las somete a las
  medidas del Anexo 2.
- La transferencia es continua durante el acuerdo. El criterio contractual de
  retención es hasta la terminación/expiración o hasta que deje de ser necesaria
  para las obligaciones contractuales, lo que ocurra primero. No es un TTL
  exacto por producto.
- Cloudflare publica su
  [lista de subencargados](https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/)
  y el DPA prevé aviso con al menos 30 días antes de un alta/reemplazo, más un
  plazo de 10 días para objetar.
- Cloudflare publica una política general de
  [retención](https://www.cloudflare.com/policies/privacy/) basada en finalidad,
  naturaleza, riesgo y obligaciones. La documentación de
  [Audit Logs v2](https://developers.cloudflare.com/fundamentals/account/account-security/audit-logs/)
  indica 18 meses. Esto no demuestra el TTL de Workers, Turnstile, Customer
  Logs ni tráfico para Agorbis y puede exceder el año declarado para alguna
  categoría.

## Hechos todavía no acreditados

No enviar la nota como un expediente completo mientras falte alguno de estos
elementos:

- **NECESITA RESPUESTA DE PROVEEDOR:** confirmación de la fecha y mecanismo por
  el que el DPA v6.4 quedó incorporado a la cuenta self-serve de Agorbis.
- **NECESITA RESPUESTA DE PROVEEDOR:** países donde Workers, Turnstile,
  Customer Logs, soporte y subencargados pueden procesar cada categoría. La red
  global y una lista corporativa no permiten inventar un país único.
- **NECESITA RESPUESTA DE PROVEEDOR:** TTL y mecanismo de borrado/retorno para
  tráfico, bodies, cache, Workers logs, seguridad, Turnstile, soporte, backups y
  metadata; distinguir rol encargado de datos que Cloudflare trate como
  responsable propio.
- **NECESITA VALIDACIÓN JURÍDICA:** si el DPA alternativo, una vez aprobado,
  cubre el primer request público y cada transferencia ulterior real de
  Agorbis.
- **NECESITA VALIDACIÓN JURÍDICA:** tratamiento del conflicto entre retenciones
  documentadas de más de un año y la declaración presentada.
- **NECESITA VALIDACIÓN JURÍDICA:** si AAIP exige traducción pública/certificada
  del contrato inglés o algún formulario adicional. La página oficial pide
  copia del contrato, pero no autoriza a asumir el requisito de idioma.

## Matriz preliminar de diferencias

Modelo de comparación principal:
[Acuerdo responsable–encargado RIPD aprobado por AAIP](https://www.argentina.gob.ar/sites/default/files/aaip_-_acuerdo_modelo_de_transferencia_internacional_de_datos_responsable_y_encargado_ripd_0.pdf).
También se adjunta, como antecedente,
[Anexo II de la Disposición 60/2016](https://www.argentina.gob.ar/sites/default/files/anexo_ii-contrato_modelo_de_transferencia_internacional_de_datos_personales_con_motivo_de_prestacion_de_servicios.pdf).

Esta tabla describe diferencias observables; no concluye equivalencia legal.

| Tema                          | Modelo AAIP/RIPD                                                               | DPA Cloudflare v6.4                                                                                                                           | Tratamiento en la presentación                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Rol y finalidad               | Responsable exporta a encargado para finalidades detalladas en anexos          | Customer es Controller y Cloudflare Processor; finalidad: prestar Services según Main Agreement/DPA                                           | Alineación material a describir; completar servicios y finalidades de Agorbis                                      |
| Ley aplicable                 | Ley del exportador/Argentina                                                   | DPA remite a Applicable Data Protection Laws, pero el contrato se rige por la ley del Main Agreement                                          | **Diferencia sustancial a explicar y someter a AAIP**                                                              |
| Jurisdicción                  | Tribunales del exportador o residencia del titular; autoridad competente       | Tribunales especificados en Main Agreement; anexos UE aplican sólo a transferencias europeas                                                  | **Diferencia sustancial**                                                                                          |
| Tercero beneficiario          | El titular puede invocar las cláusulas contra exportador/importador            | Cláusula 9.3 excluye derechos de terceros salvo SCC UE o ley aplicable                                                                        | **Diferencia sustancial**                                                                                          |
| Autoridad de control          | AAIP con facultades y cooperación explícita                                    | Cooperación con supervisory authorities bajo leyes aplicables; autoridad argentina no queda nombrada en anexos                                | Explicar y pedir confirmación/aprobación                                                                           |
| Categorías sensibles          | Deben declararse y recibir medidas acordes al riesgo                           | Anexo 1 reconoce expresamente special categories y remite a medidas del Anexo 2                                                               | Alineación favorable; describir opiniones políticas y otras categorías realmente posibles, sin ampliar el producto |
| Seguridad                     | Medidas administrativas, físicas y técnicas; Anexo C                           | Programa ISO/IEC 27000, cifrado, MFA, least privilege, continuidad, auditoría y medidas del Anexo 2                                           | Mapear control por control; no afirmar certificaciones distintas de las publicadas                                 |
| Incidentes                    | Modelo RIPD fija notificación al exportador dentro de 72 horas                 | DPA usa “without undue delay”, sin un máximo general de 72 horas                                                                              | Diferencia a explicar; pedir compromiso aclaratorio si es posible                                                  |
| Derechos                      | Asistencia, respuesta y transparencia hacia titulares                          | Notifica solicitudes y presta asistencia razonable; costos pueden recaer en Customer                                                          | Mapear acceso/rectificación/supresión y limitaciones/costos                                                        |
| Auditoría                     | Controles y cooperación con autoridad; evidencia disponible                    | Informes de auditor independiente; onsite acotado para datos bajo SCC UE y sujeto a condiciones/costos                                        | Diferencia de alcance y acceso; adjuntar Trust Hub/evidencia disponible                                            |
| Subencargados                 | Autorización específica o general con 15 días hábiles y contratos equivalentes | Autorización general; lista 30 días antes, objeción en 10 días; responsabilidad de Cloudflare                                                 | Plazos no son idénticos; adjuntar snapshot y mecanismo de suscripción/objeción                                     |
| Transferencias ulteriores     | Garantías equivalentes y anexos de destinos                                    | DPA impone términos no menos protectores a subencargados, pero su mecanismo de transferencias está desarrollado para UE/UK/Suiza y Global PRP | Diferencia: esos mecanismos extranjeros no son automáticamente el mecanismo argentino                              |
| Retención y terminación       | Devolución/destrucción; sólo conservación legal limitada                       | Retorno/borrado a elección tras terminar/completar servicio, salvo ley; durante el servicio usa criterio de necesidad                         | Falta TTL por producto y compatibilidad demostrada con un año                                                      |
| Solicitudes gubernamentales   | Evaluación, impugnación/suspensión según modelo                                | Aviso cuando sea permitido, minimización, revisión e impugnación hasta apelación en casos descritos                                           | Mapear diferencias de ley y remedios sin afirmar equivalencia                                                      |
| Precedencia y responsabilidad | Cláusulas modelo prevalecen y son exigibles por titular                        | DPA prevalece sobre Main Agreement en privacidad, pero mantiene límites de responsabilidad y no da derechos generales a terceros              | Diferencia sustancial a explicar                                                                                   |

## Anexo técnico propuesto de la transferencia

Completar este anexo con evidencia antes de enviarlo:

| Campo                      | Respuesta propuesta                                                                                                                                                               | Estado                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Exportador                 | Sebastian Cardoso Castillo, domicilio y contacto indicados arriba                                                                                                                 | Confirmado por el responsable                                                                    |
| Importador                 | Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, USA                                                                                                               | Confirmado por DPA v6.4                                                                          |
| Rol                        | Agorbis: responsable; Cloudflare: encargado para Customer Content/Logs y los tratamientos cubiertos por DPA                                                                       | Confirmado con límite; separar actividades donde Cloudflare sea responsable                      |
| Titulares                  | Visitantes públicos, personas con cuenta cuando se habilite, personas mencionadas en contenido y administrador de Agorbis                                                         | Código/producto; validar alcance legal                                                           |
| Servicios                  | DNS, proxy, TLS, seguridad, Turnstile A/B, Workers Edge Compute, Custom Domains y logs mínimos configurados                                                                       | Confirmado por arquitectura; verificar servicios efectivos en Dashboard                          |
| Datos de preview read-only | IP, fecha/hora, URL, método, headers técnicos, señales de red/seguridad y respuesta pública                                                                                       | Inferido del flujo HTTP; confirmar logs/retención del proveedor                                  |
| Datos interactivos futuros | Lo anterior más cookies Auth, formularios, perfil, contenido cívico, archivos y respuestas del backend que transitan por Workers                                                  | Confirmado por diseño; no activo durante la preview read-only                                    |
| Datos sensibles posibles   | Opiniones políticas reveladas por participación o contenido; texto/media podrían revelar salud, religión, afiliación sindical u otras categorías sólo si el usuario las incorpora | Confirmado como posibilidad del producto; no afirmar recolección estructurada de esas categorías |
| Finalidad                  | Entregar, ejecutar y proteger Agorbis; validar bot/abuso; enrutar requests a Supabase/Resend cuando la fase interactiva sea autorizada                                            | Confirmado por arquitectura                                                                      |
| Frecuencia                 | Continua mientras los dominios apunten al Worker                                                                                                                                  | Confirmado por DPA/arquitectura                                                                  |
| Destinos                   | Estados Unidos para Cloudflare, Inc.; red global y destinos de subencargados por completar con respuesta específica                                                               | **PENDING_PROVIDER**                                                                             |
| Retención                  | Criterio del DPA durante el acuerdo y borrado/retorno al terminar; TTL de productos por completar                                                                                 | **PENDING_PROVIDER**; no escribir “un año” sin evidencia                                         |
| Medidas                    | TLS, secretos Worker, acceso administrativo con MFA, no logging de bodies/secrets, CSP y controles reales del repo; Anexo 2 del DPA                                               | Verificar evidencia efectiva; no sumar salvaguardas no desplegadas                               |
| Derechos                   | Solicitud ante Sebastian; éste verifica identidad y coordina asistencia/borrado con Cloudflare                                                                                    | Confirmado como diseño; probar procedimiento                                                     |

## Procedimiento reproducible de armado y presentación

1. Crear fuera del repositorio un directorio de expediente con modo `0700` y
   archivos `0600`. No almacenar tokens, cookies, facturas completas ni IDs de
   cuenta en Git.
2. Descargar desde fuente oficial el DPA, Main Agreement/Self-Serve Agreement,
   lista de subencargados, medidas de seguridad y política vigente. Registrar
   URL, UTC, versión, tamaño y SHA-256 de cada archivo.
3. Exportar evidencia de aceptación efectiva del DPA para la cuenta Agorbis:
   fecha, versión y vínculo con el Main Agreement. Una captura de la página
   pública no basta.
4. Completar destinos y retención con la respuesta escrita de Cloudflare. Si no
   hay respuesta exacta, conservar el campo como pendiente; no usar “global”
   como sustituto de países en una declaración que exija países.
5. Hacer revisar por profesional la matriz anterior y convertirla en un anexo
   de diferencias definitivo. Distinguir DPA de las SCC europeas: las SCC UE no
   se transforman automáticamente en cláusulas argentinas.
6. Completar la nota siguiente, adjuntar documentos y enviarla a
   `datospersonales@aaip.gob.ar` o por el canal que AAIP confirme. La página
   oficial también permite presentación física en Av. Julio A. Roca 710, 2.º
   piso, CABA.
7. Guardar mensaje enviado, headers/acuse, adjuntos exactos y SHA-256. Registrar
   el vencimiento de treinta días y escalar si no hay constancia de recepción.
8. No declarar “aprobado” hasta recibir una respuesta inequívoca de AAIP. Si
   impone condiciones, mantener las funciones afectadas cerradas hasta
   implementarlas y probarlas.
9. Suscribirse a cambios de subencargados, versionar cada snapshot y evaluar
   objeciones dentro de los diez días contractuales de Cloudflare.
10. Actualizar `/privacidad`, `/subencargados`, el aviso internacional y el
    inventario AAIP sólo con destinos, retención y salvaguarda acreditados. Un
    cambio material requiere nueva versión y, donde corresponda, nueva decisión
    del titular.

## Borrador de nota a AAIP

Los corchetes son campos obligatorios. No enviar con placeholders.

> **Asunto:** Solicitud de aprobación de contrato alternativo para transferencia
> internacional de datos personales — Agorbis / Cloudflare
>
> A la Dirección Nacional de Protección de Datos Personales de la Agencia de
> Acceso a la Información Pública:
>
> Sebastian Cardoso Castillo, con domicilio en [domicilio reservado],
> Provincia de Buenos Aires, responsable identificado con el código
> RL-2026-81658385-APN-DNPDP#AAIP, se presenta y solicita la aprobación del
> contrato de transferencia internacional acompañado, conforme al artículo 2
> de la Disposición 60/2016 y la Resolución 198/2023.
>
> La base privada de Agorbis fue presentada bajo el expediente
> EX-2026-82087278- -APN-DNPDP#AAIP y [INDICAR NÚMERO DE REGISTRO SÓLO SI YA
> FUE EMITIDO; DE LO CONTRARIO ACLARAR QUE SIGUE PENDIENTE].
>
> El importador y encargado es Cloudflare, Inc., 101 Townsend Street, San
> Francisco, California 94107, Estados Unidos. El instrumento propuesto es el
> Cloudflare Data Processing Addendum versión 6.4, incorporado al acuerdo
> principal de la cuenta el [FECHA EFECTIVA ACREDITADA]. Cloudflare presta DNS,
> reverse proxy, seguridad, Turnstile y Workers Edge Compute para entregar y
> proteger Agorbis.
>
> Se adjuntan: (i) contrato y evidencia de incorporación; (ii) descripción de
> titulares, datos, finalidades, frecuencia, destinos y retención; (iii) medidas
> técnicas y organizativas; (iv) lista de subencargados; y (v) comparación
> detallada de las diferencias respecto del acuerdo modelo
> responsable–encargado aprobado por la AAIP, junto con la explicación de las
> garantías que se consideran aplicables.
>
> El tratamiento puede comprender contenido cívico capaz de revelar opiniones
> políticas y, si una persona lo incorpora en texto o media, otras categorías
> sensibles. El Anexo 1 del DPA contempla expresamente categorías especiales y
> las somete a las medidas de su Anexo 2. [COMPLETAR DESTINOS Y RETENCIÓN
> EXACTOS CON EVIDENCIA; NO USAR PLACEHOLDERS].
>
> Se solicita que la Agencia evalúe el instrumento y comunique si requiere
> condiciones, documentación o modificaciones adicionales. Hasta contar con
> una base válida para cada transferencia, Agorbis [DESCRIBIR ESTADO REAL DE LA
> PREVIEW Y FUNCIONES INTERACTIVAS].
>
> Contacto: sebastiancardoso92@gmail.com.
>
> Atentamente,
>
> Sebastian Cardoso Castillo

## Fuentes oficiales verificadas

- [AAIP — Transferencias internacionales](https://www.argentina.gob.ar/transferencias-internacionales)
- [Disposición 60/2016 actualizada](https://www.argentina.gob.ar/normativa/nacional/disposici%C3%B3n-60-2016-267922/actualizacion)
- [Resolución AAIP 198/2023](https://www.argentina.gob.ar/normativa/nacional/resoluci%C3%B3n-198-2023-391538/texto)
- [Modelo AAIP/RIPD responsable–encargado](https://www.argentina.gob.ar/sites/default/files/aaip_-_acuerdo_modelo_de_transferencia_internacional_de_datos_responsable_y_encargado_ripd_0.pdf)
- [Cloudflare DPA v6.4](https://www.cloudflare.com/cloudflare-customer-dpa/)
- [Cloudflare Sub-Processors](https://www.cloudflare.com/gdpr/subprocessors/cloudflare-services/)
- [Cloudflare Privacy Policy](https://www.cloudflare.com/policies/privacy/)
- [Cloudflare Audit Logs v2 — retention](https://developers.cloudflare.com/fundamentals/account/account-security/audit-logs/)

Fuentes consultadas el 26-08-2026. Revalidar versiones y hashes el día de la
presentación.
