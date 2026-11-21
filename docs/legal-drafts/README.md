# Borradores legales y trazabilidad de activación

Los archivos de este directorio son artefactos de revisión. No son documentos
vigentes, no se renderizan, no registran una aceptación y no autorizan un
deployment o una migración. En particular, `draft_not_active` no equivale a
`PASS` ni a una conclusión de cumplimiento jurídico.

## Draft 2026-08-29: evidencia externa pendiente

`2026-08-29-pending-external-evidence.json` propone, en español e inglés,
reemplazos deterministas sobre las versiones históricas exactas de Privacidad y
del Aviso de transferencias. Cada propuesta parte del hash de la versión activa,
aplica rutas JSON explícitas y calcula un nuevo hash del documento completo con
`sha256-json-stringify-v1`, el mismo algoritmo usado por el procedimiento legal
versionado.

El manifest no es una migración ni un snapshot activo. Su única finalidad es
dejar preparado y auditable el texto que representa como pendientes —sin
completarlos por inferencia— los destinos, contratos, plazos y salvaguardas que
no cuentan con evidencia acreditada.

### Afirmaciones fuertes identificadas

Las rutas se expresan sobre `privacyContent` e
`internationalTransferNoticeContent`. Cada ruta comprende su variante `/es/` y
`/en/` equivalente.

| Documento      | Ruta(s) actual(es)                                 | Afirmación que requiere evidencia o reconciliación                                                             | Tratamiento del draft                                                                              |
| -------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Privacidad     | `/sections/2/bullets/5`                            | La medición usa retención limitada.                                                                            | No afirma un plazo o límite hasta reconciliar implementación, configuración y evidencia.           |
| Privacidad     | `/sections/8/paragraphs/0`                         | El registro contiene destinos y salvaguardas aplicables.                                                       | Distingue funciones conocidas de ubicaciones, retención contractual y salvaguardas pendientes.     |
| Privacidad     | `/sections/8/paragraphs/1`                         | Cloudflare ejecuta en una red global, usada como descripción de ubicación.                                     | Conserva sólo las funciones configuradas y aclara que no acreditan países o lugares completos.     |
| Privacidad     | `/sections/8/paragraphs/2`                         | Identifica un país y presenta el registro como detalle completo de destinos, salvaguardas y retención.         | No publica países o destinos por inferencia y mantiene los campos pendientes.                      |
| Privacidad     | `/sections/8/paragraphs/3`                         | La baja inicia eliminación y el tratamiento anterior fue legítimo.                                             | No promete eliminación inmediata o completa ni formula una conclusión jurídica.                    |
| Privacidad     | `/sections/8/paragraphs/4`                         | Atribuye obligaciones y suficiencia operativa a DPA incorporados a contratos.                                  | Marca existencia, alcance y suficiencia contractual como pendientes de evidencia y revisión.       |
| Privacidad     | `/sections/9/paragraphs/0`                         | Publica plazos internos exactos de 90 días, 7 días, 7 años y 5 años.                                           | Informa que el cronograma interno no está reconciliado y no publica plazos como verificados.       |
| Privacidad     | `/sections/9/paragraphs/1`                         | Describe como efectivo el alcance de borrado y conservación posterior.                                         | No promete eliminación inmediata, completa o selectiva sin verificación.                           |
| Privacidad     | `/sections/9/paragraphs/2`                         | Afirma rotación, vencimiento y ciclos documentados de backups.                                                 | Declara que no existe backup productivo verificado y no atribuye capacidades de restauración.      |
| Transferencias | `/summary`                                         | Presenta el aviso como descripción completa de salvaguardas.                                                   | Distingue lo conocido de ubicaciones, retención y salvaguardas pendientes.                         |
| Transferencias | `/sections/0/paragraphs/0..1`                      | Caracteriza la decisión como suficiente en términos legales pese a la revisión 0059 omitida.                   | Describe el registro técnico y advierte que no acredita base jurídica ni conformidad.              |
| Transferencias | `/sections/1/bullets/0`                            | Ubica el proyecto Supabase en AWS `us-east-2`, Ohio, y alude a otros destinos.                                 | Conserva función y categorías generales; deja ubicaciones y accesos pendientes.                    |
| Transferencias | `/sections/1/bullets/1`                            | Afirma que el tratamiento principal de Resend ocurre en Estados Unidos.                                        | Conserva la función de correo; deja ubicaciones y accesos pendientes.                              |
| Transferencias | `/sections/1/bullets/2`                            | Usa la red global de Cloudflare como afirmación de ubicación.                                                  | Conserva funciones configuradas; deja ubicaciones y accesos pendientes.                            |
| Transferencias | `/sections/2/title`, `/sections/2/paragraphs/0..1` | Publica país, adecuación, DPA, cifrado, minimización, retención y otras medidas como salvaguardas acreditadas. | No atribuye países y enumera esas materias únicamente como pendientes; no afirma suficiencia.      |
| Transferencias | `/sections/4/paragraphs/0`                         | Afirma el efecto de la baja y conservación posterior con acceso y plazo determinados.                          | No presenta la baja como prueba de cese o eliminación por cada proveedor y deja plazos pendientes. |

Este inventario no dice que cada afirmación histórica sea falsa. Dice que, con
la evidencia acreditada actualmente en el repositorio, no debe seguir
presentándose como un hecho verificado para un lanzamiento excepcional.

### Versiones y hashes propuestos

| Documento               | Versión base   | SHA-256 base                                                       | Versión propuesta | SHA-256 propuesto                                                  | SHA-256 ES                                                         | SHA-256 EN                                                         |
| ----------------------- | -------------- | ------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Privacidad              | `2026-08-25.1` | `19826446051822fc347faaf114f1dc6f153b642c4e4706860e63bfb8373791af` | `2026-08-29.1`    | `efdb395f293b7b1af31d6d79a2c70457a007279fe1d23a7b655dad4a997d039e` | `0eb2f64bb2dba207a1a02dd076bb7661c5f9853417a757742cd9dacd8609f72c` | `cb72d78689fa81124952b5ba759bfd83bf82dc41a71971b7949168365252c153` |
| Aviso de transferencias | `2026-08-25.1` | `64bf705727ca0003f76f3d422402f42bff97dc433f138dc432f9678fae1c505a` | `2026-08-29.1`    | `052a72a73375da6930313cbc9f2736f8b63f0ad321342b9fdd66f727a34a1baa` | `b1e6a44da8ef839c208f632adbedaf127c30f60509581e2f2d4f70494ea71883` | `d34a3893733f2e76a3b1889db8f4fa61685bad68d83775d0d014e56a069ce776` |

### Verificación y eventual activación

Con Node 22.22.0, el control focal es:

```bash
node scripts/check-pending-external-evidence-legal-draft.mjs
```

El control conserva este manifest como fuente histórica `draft_not_active` y
comprueba que sus 38 operaciones coincidan exactamente con el contenido activo
`2026-08-29.1`, sus hashes ES/EN, el snapshot SQL preparado y el acta separada
`docs/legal-activations/2026-08-29-pending-external-evidence.json`. También
verifica que las afirmaciones inventariadas ya no estén en el bundle y que la
advertencia ES/EN sobre 0059 y ausencia de conformidad permanezca visible.

La activación en código fue preparada bajo D72, pero no prueba evidencia
externa ni autoriza por sí misma un deployment. La migración separada
`0060_activate_pending_external_evidence_legal_notices.sql` fue autorizada,
aplicada y verificada en el proyecto explícito de Producción. El ledger remoto
exacto es `0001`–`0058` + `0060`. La migración 0059 permanece exclusivamente en
`supabase/migration-drafts`, está ausente de Producción y no forma parte de esta
activación; su omisión conserva el estado factual y nunca se registra como
`PASS`.
