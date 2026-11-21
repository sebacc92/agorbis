# SQL sin proponer

Registro de SQL que no forma parte de ninguna propuesta de release. Ningún
comando de Supabase, CI ni del preflight lo descubre, y no se aplica nunca
desde acá.

No vive en `supabase/migration-drafts/` a propósito: ese directorio tiene un
inventario fijo (sólo `0059`) que verifican el preflight de Producción, el
preview de sólo lectura y la evidencia D72. Sumar archivos ahí cambiaría esa
evidencia sin que nadie haya revisado nada.

| Archivo                                           | Estado                                                                                                                                                                                                                    |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0068_phase1_simplify_participation.REJECTED.sql` | **Rechazado.** Apagaba el gate legal en la base y fabricaba constancias de aceptación (D73). Se conserva como registro                                                                                                    |
| `0069_claim_victory_notifications.sql`            | **Borrador local, no aplicar.** Su cabecera enumera lo que falta: `search_path`, avisos duplicados con `0046`, título sin i18n y sin test                                                                                 |
| `0077_uruguay_local_governments.sql`              | **Borrador, no aplicar.** 136 municipios de Uruguay como nivel 4 (D129); generado por `scripts/build-uruguay-level4-draft.mjs`. Va después de `0076`                                                                      |
| `0078_chile_local_governments.sql`                | **Borrador, no aplicar.** 345 comunas de Chile como nivel 4, sin coordenadas (D130); generado por `scripts/build-chile-level4-draft.mjs`. Va después de `0077`                                                            |
| `0079_paraguay_local_governments.sql`             | **Borrador, no aplicar.** 262 distritos de Paraguay como nivel 4, con coordenadas (D131); generado por `scripts/build-paraguay-level4-draft.mjs`. Va después de `0078`                                                    |
| `0080_bolivia_local_governments.sql`              | **Borrador, no aplicar.** 339 municipios de Bolivia como nivel 4, con coordenadas (D132); falta identificar el municipio 340. Generado por `scripts/build-bolivia-level4-draft.mjs`. Va después de `0079`                 |
| `0081_ecuador_local_governments.sql`              | **Borrador, no aplicar.** 221 cantones de Ecuador como nivel 4, sin coordenadas (D133); generado por `scripts/build-ecuador-level4-draft.mjs`. Va después de `0080`                                                       |
| `0082_peru_local_governments.sql`                 | **Borrador, no aplicar.** 194 provincias de Perú y los 50 distritos de Lima y El Callao como nivel 4, con coordenadas (D134); generado por `scripts/build-peru-level4-draft.mjs`. Va después de `0081`                    |
| `0083_colombia_local_governments.sql`             | **Borrador, no aplicar.** 1.102 municipios de Colombia como nivel 4, sin coordenadas (D135); lista de la DIVIPOLA (CC BY-SA 4.0). Generado por `scripts/build-colombia-level4-draft.mjs`. Va después de `0082`            |
| `0084_venezuela_local_governments.sql`            | **Borrador, no aplicar.** 335 municipios de Venezuela como nivel 4, con coordenadas (D136); generado por `scripts/build-venezuela-level4-draft.mjs`. Va después de `0083`                                                 |
| `0085_brasil_local_governments.sql`               | **Borrador, no aplicar.** 5.569 municipios de Brasil como nivel 4, sin coordenadas (D137); generado por `scripts/build-brasil-level4-draft.mjs`. Va después de `0084`                                                     |
| `0086_mexico_local_governments.sql`               | **Borrador, no aplicar.** 2.462 municipios y las 16 alcaldías de México como nivel 4, sin coordenadas (D138); generado por `scripts/build-mexico-level4-draft.mjs`. Va después de `0085`                                  |
| `0087_guatemala_local_governments.sql`            | **Borrador, no aplicar.** 340 municipios de Guatemala como nivel 4, con coordenadas (D139); generado por `scripts/build-guatemala-level4-draft.mjs`. Va después de `0086`                                                 |
| `0088_honduras_local_governments.sql`             | **Borrador, no aplicar.** 298 municipios de Honduras como nivel 4, con coordenadas (D140); generado por `scripts/build-cod-ab-level4-draft.mjs honduras`. Va después de `0087`                                            |
| `0089_costa_rica_local_governments.sql`           | **Borrador, no aplicar.** 84 cantones de Costa Rica como nivel 4, con coordenadas (D141); generado por `scripts/build-cod-ab-level4-draft.mjs costa-rica`. Va después de `0088`                                           |
| `0090_el_salvador_local_governments.sql`          | **Borrador, no aplicar.** 44 municipios de El Salvador como nivel 4, desde Wikidata con control oficial (D142); generado por `scripts/build-list-level4-draft.mjs el-salvador`. Va después de `0089`                      |
| `0091_nicaragua_local_governments.sql`            | **Borrador, no aplicar.** 153 municipios de Nicaragua como nivel 4, desde Wikidata con control oficial (D143); generado por `scripts/build-list-level4-draft.mjs nicaragua`. Va después de `0090`                         |
| `0092_panama_local_governments.sql`               | **Borrador, no aplicar.** 81 distritos de Panamá como nivel 4, de la ANATI (D144); generado por `scripts/build-list-level4-draft.mjs panama`. Va después de `0091`                                                        |
| `0093_republica_dominicana_local_governments.sql` | **Borrador, no aplicar.** 154 municipios de República Dominicana como nivel 4, con coordenadas (D145); falta La Victoria. Generado por `scripts/build-cod-ab-level4-draft.mjs republica-dominicana`. Va después de `0092` |
| `0094_haiti_local_governments.sql`                | **Borrador, no aplicar.** 140 comunas de Haití como nivel 4, con coordenadas (D146); faltan las comunas posteriores a 2018. Generado por `scripts/build-cod-ab-level4-draft.mjs haiti`. Va después de `0093`              |

Para proponer uno de estos cambios hay que reescribirlo con un número libre,
llevarlo a `supabase/migration-drafts/` en una PR propia que actualice la
política de inventario y su evidencia, y pasar la revisión separada que exige
la [convención](../migration-drafts/README.md).
