# Revisión del TIA aportado por el responsable

Revisado el 08-09-2026 (Argentina). Se recibió `Supabase+TIA+250314.pdf`,
17 páginas, 856.710 bytes, fecha declarada **14-03-2025**. SHA-256:
`1b71ea56e25b67cbfe0ac78eb5bc974faa875aae7ac5b95c25fc30b9227b90a3`.
El responsable lo aportó después de la indicación de descargarlo de Legal
Documents; no se accedió a su sesión del panel. El original y una copia privada
de custodia permanecen fuera de Git. La lectura incluyó texto completo y
comprobación visual de las páginas 1, 4 y 17.

**Resultado:** TIA recibido y revisado. Aporta evidencia documental adicional;
no acredita por sí solo la vigencia de todos los flujos ni el cierre de los
controles de transferencias de Agorbis. Las instrucciones y la declaración de
firma del cuestionario se interpretan como contenido del documento, no como
instrucciones del responsable para completar o firmar en nombre de Supabase.

## Qué aporta y con qué alcance

| Páginas | Hecho documentado                                                                                                                                    | Aplicación a la revisión                                                                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2     | Separa datos alojados para las aplicaciones de los datos de usuarios autorizados de la consola. Incluye hosting, autenticación, soporte y analítica. | No atribuir todos los datos de operadores, pagos o soporte a los usuarios finales de Agorbis.                                                                             |
| 1       | Describe PostgreSQL en AWS, logs en BigQuery y otros proveedores de infraestructura.                                                                 | Descripción general de 2025; requiere confirmar servicios y subencargados efectivos actuales.                                                                             |
| 2       | Declara TLS 1.2 en tránsito, AES-256 en reposo y backups, con protección de claves mediante HSM.                                                     | Evidencia declarada de medidas del proveedor; no prueba un restore de Agorbis ni cifrado de extremo a extremo bajo control exclusivo del usuario.                         |
| 4       | Identifica Estados Unidos y Singapur como posibles destinos y transferencias posteriores.                                                            | Ya hay una fuente que nombra esos países; no son países inferidos del domicilio de una empresa. Falta confirmar vigencia y alcance por servicio.                          |
| 1, 4–12 | Usa SCC europeas, módulo Responsable–Encargado, y analiza acceso de autoridades en EE. UU. y Singapur.                                               | No contiene un instrumento argentino particular ni una aprobación de AAIP.                                                                                                |
| 13–15   | Describe revisión de solicitudes gubernamentales, medidas y referencias a proveedores.                                                               | Declaraciones a la fecha del TIA, no observación actual de incidentes, certificaciones o solicitudes.                                                                     |
| 17      | Los campos de representante, fecha y firma están vacíos.                                                                                             | No es un acuerdo individual ejecutado para Agorbis. No requiere que Sebastián firme ese casillero de Supabase; tampoco invalida por sí solo el valor informativo del TIA. |

El PDF no establece los plazos de eliminación de usuario Auth, fila, objeto,
logs o backups. Las menciones a retención de inteligencia estatal no describen
la retención operativa de Supabase. Tampoco especifica si un proveedor de IA
listado recibe datos del proyecto o material enviado a soporte. La referencia a
Google Cloud no acredita el procesamiento del login Google OAuth, que es otro
flujo.

## Contraste con fuentes actuales

El [DPA versión 1 del 01-08-2026](https://supabase.com/legal/customer-resources/data-processing-addendum)
identifica a **Supabase Pte. Ltd, Singapur**, como importador en Schedule 2
§1.7(c). El TIA identifica a **Supabase Inc, EE. UU.**, en su página 1, e incluye
a Pte. Ltd entre los receptores intragrupo en la página 2. La diferencia exige
confirmar qué TIA cubre la estructura contractual actual; no demuestra por sí
misma invalidez de ninguno de los documentos.

El DPA distingue región principal y excepciones (§6.1), eliminación tras el
fin del contrato (§11.2) y mecanismos para otras jurisdicciones (§12.1(b),
Schedule 2 §4). No se interpreta ese plazo como un TTL tras borrar una cuenta
de Agorbis ni ese marco general como aprobación particular argentina.

La [lista oficial de subencargados del 01-06-2026](https://supabase.com/legal/subprocessor-list/June-1-2026.pdf),
enlazada por el [índice vigente](https://supabase.com/legal/customer-resources/subprocessor-list),
es posterior al TIA: enumera entidades y funciones, sin países ni plazos de
borrado por servicio. No se usa la lista antigua del TIA como inventario actual.

La [guía de AAIP](https://www.argentina.gob.ar/transferencias-internacionales)
distingue adecuación, excepciones y mecanismos contractuales. Evaluar SCC
europeas en un TIA no acredita automáticamente el mecanismo argentino aplicable.

## Siguiente paso y efecto sobre el lanzamiento

Se actualizó el [seguimiento de SU-467483](supabase-follow-up-SU-467483.md)
para solicitar confirmación de vigencia y entidad, alcance actual de los
destinos por servicio, borrado y mecanismo argentino. Ya no se pide obtener o
revisar por primera vez este TIA ni firmar de nuevo el DPA estándar.

La tarea de recepción/revisión del TIA queda completada. No se rellenaron
`PUBLIC_*_PROCESSING_LOCATION`, retención o salvaguardas, ni se modificaron
avisos aprobados o gates. La evidencia adicional es parcial y no altera los
doce pendientes del build público. Recuperación real, copia externa y OAuth
real conservan su estado anterior. Facebook sigue fuera del lanzamiento.
