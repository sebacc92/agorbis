# Wiki de Agorbis

Mapa del proyecto para agentes y personas nuevas. Cada página resume un área en
pocas líneas y apunta al código, las decisiones (`DECISIONS.md`) y los
documentos que mandan. Si una página contradice esas fuentes, la página está
desactualizada: se corrige la página.

## gobierno

Qué documento manda, invariantes y forma de trabajo.

| Artículo                                              | Resumen                                           | Actualizado |
| ----------------------------------------------------- | ------------------------------------------------- | ----------- |
| [Fuentes y reglas](gobierno/fuentes-y-reglas.md)      | Fuentes por tema, invariantes, commits y permisos | 2026-10-31  |

## arquitectura

| Artículo                                              | Resumen                                           | Actualizado |
| ----------------------------------------------------- | ------------------------------------------------- | ----------- |
| [Arquitectura de la app](arquitectura/app-y-clientes.md) | Qwik 2 en Workers, `src/`, clientes de Supabase | 2026-10-31  |

## datos

| Artículo                                                | Resumen                                         | Actualizado |
| ------------------------------------------------------- | ----------------------------------------------- | ----------- |
| [Modelo y comunidades](datos/modelo-y-comunidades.md)   | Materialized path, `is_member`, ledger y tipos  | 2026-10-31  |

## cuentas

| Artículo                                          | Resumen                                               | Actualizado |
| ------------------------------------------------- | ----------------------------------------------------- | ----------- |
| [Cuentas y acceso](cuentas/cuentas-y-acceso.md)   | Auth, contraseña, Turnstile, TOTP y los dos borrados  | 2026-10-31  |

## legal

| Artículo                                                   | Resumen                                       | Actualizado |
| ---------------------------------------------------------- | --------------------------------------------- | ----------- |
| [Gate y textos legales](legal/gate-y-textos-legales.md)    | Aceptación versionada, `check-legal`, `0059`  | 2026-10-31  |

## participacion

| Artículo                                                                | Resumen                                                 | Actualizado |
| ----------------------------------------------------------------------- | ------------------------------------------------------- | ----------- |
| [Encuestas y voto secreto](participacion/encuestas-voto-secreto.md)     | Constancia sin elección y tallies (D68)                 | 2026-10-31  |
| [Debates, reclamos y proyectos](participacion/debates-reclamos-proyectos.md) | Cuotas, ubicación aproximada, escalamiento, presupuesto | 2026-10-31  |

## moderacion

| Artículo                                                                      | Resumen                                             | Actualizado |
| ----------------------------------------------------------------------------- | --------------------------------------------------- | ----------- |
| [Moderación, notificaciones y perfil](moderacion/moderacion-notificaciones-perfil.md) | Cola, apelaciones, notificaciones, métricas | 2026-10-31  |

## seguridad

| Artículo                                                      | Resumen                                        | Actualizado |
| ------------------------------------------------------------- | ---------------------------------------------- | ----------- |
| [Cabeceras y terceros](seguridad/cabeceras-y-terceros.md)     | CSP con nonce, D76, `local-data.ts`, logs      | 2026-10-31  |

## i18n

| Artículo                                         | Resumen                                       | Actualizado |
| ------------------------------------------------ | --------------------------------------------- | ----------- |
| [Idiomas y manual](i18n/idiomas-y-manual.md)     | `translate()`, catálogos, D56 y `/manual`     | 2026-10-31  |

## operacion

| Artículo                                               | Resumen                                        | Actualizado |
| ------------------------------------------------------ | ---------------------------------------------- | ----------- |
| [Release y operación](operacion/release-y-operacion.md) | Worker, D72, preflight, backups, CI, scripts  | 2026-10-31  |
| [FTD · auditor de deployments](ftd/auditor-cloudflare-deployments.md) | Contrato vigente de GET deployments | 2026-11-01  |
| [FTD · DNS v2 Resend Forge](ftd/dns-topologia-v2-resend-forge.md) | Topología no web v2 (D104) | 2026-11-01  |
| [FTD · auditor Supabase sin IPv6](ftd/supabase-auditor-enlace-produccion.md) | Enlace local a Producción (D105) | 2026-11-01  |
| [FTD · política D72 v6](ftd/politica-d72-v6-revision.md) | Revisión de riesgos al 30-11-2026 (D106) | 2026-11-01  |
| [FTD · salida simple](ftd/salida-simple-deploy-open.md) | `pnpm deploy:open` (D107) | 2026-11-02  |
| [FTD · registro simple](ftd/registro-simple.md) | Dos casillas, usuario sugerido (D108) | 2026-11-02  |
| [FTD · Turnstile invisible](ftd/turnstile-invisible.md) | Privacidad 2026-11-02.1 y 0073 (D109) | 2026-11-02  |
| [FTD · alta en desktop](ftd/alta-desktop.md) | Progreso común y ancho (D110) | 2026-11-02  |
| [FTD · ancho desktop](ftd/ancho-desktop.md) | Contenido a 96rem (D111) | 2026-11-02  |
| [FTD · mejoras UX noviembre](ftd/mejoras-ux-noviembre.md) | Cuatro de diez mejoras del primer uso real (D112) | 2026-11-04  |
| [FTD · adopción de ECC](ftd/adopcion-ecc.md) | Plugin de usuario, sin instalador; auditoría 40/49 (D113) | 2026-11-07  |
| [FTD · envío nunca mudo](ftd/envio-nunca-mudo.md) | Red cortada y doble toque al publicar (mejora 10 de D112) | 2026-11-07  |
| [FTD · llamados que llegan](ftd/llamados-que-llegan.md) | Enlaces que aciertan y límite de errores que se recupera (mejora 5 de D112) | 2026-11-07  |
| [FTD · comunidad vacía con algo para hacer](ftd/comunidad-vacia-con-algo-para-hacer.md) | Encuestas de la cadena, sin casillas, textos de residencia (mejora 6 de D112) | 2026-11-07  |
| [FTD · inicio con publicaciones a la vista](ftd/inicio-con-publicaciones-a-la-vista.md) | Cabecera compacta, filtro con resultado, marcas propias (mejora 7 de D112) | 2026-11-08  |

## harness y sdd

Archivos de rsc-harness (D102).

| Artículo                                                    | Resumen                         | Actualizado |
| ----------------------------------------------------------- | ------------------------------- | ----------- |
| [Decisiones del harness](harness/decisions.md)              | Plan aceptado de rsc            | 2026-10-31  |
| [Plan de instalación](harness/installation-plan.md)         | Qué instaló rsc y por qué       | 2026-10-31  |
| [Constitución SDD](sdd/constitution.md)                     | Borrador, pendiente             | 2026-10-31  |
| [Verificación · envío nunca mudo](sdd/verifications/envio-nunca-mudo-2026-11-07.md) | Gate, FTD y criterios: PASS (D114) | 2026-11-07  |
| [Verificación · llamados que llegan](sdd/verifications/llamados-que-llegan-2026-11-07.md) | Gate, FTD y criterios: PASS (D115) | 2026-11-07  |
| [Verificación · comunidad vacía](sdd/verifications/comunidad-vacia-con-algo-para-hacer-2026-11-07.md) | Gate, FTD y criterios (D116) | 2026-11-07  |
| [Idea · acuerdos entre comunidades](sdd/ideas/acuerdos-entre-comunidades.md) | Brief de decisión: siete direcciones, recomendación y cuatro preguntas al responsable | 2026-11-08  |
| [Spec · acuerdos entre comunidades](sdd/specs/acuerdos-entre-comunidades.md) | QUÉ y POR QUÉ: voto por comunidad, adhesión, estados honestos; borrador para aprobar | 2026-11-08  |
| [Plan · acuerdos entre comunidades](sdd/plans/acuerdos-entre-comunidades.md) | CÓMO: rondas sobre encuestas binarias, estado derivado, RPCs definer; borrador | 2026-11-09  |
| [Avance · acuerdos entre comunidades](sdd/progress/acuerdos-entre-comunidades.md) | T001–T012 hechas con evidencia; revisión D113 aplicada; quedan ítems del responsable (push, pin D72, db push) | 2026-11-09  |
| [Verificación · acuerdos entre comunidades](sdd/verifications/acuerdos-entre-comunidades-2026-11-09.md) | Trece criterios con prueba; gate FAIL sólo por el pin D72 de migraciones 0062–0073 | 2026-11-09  |
| [Décima ronda de UI/UX](ftd/decima-ronda-ui-ux.md) | Diez mejoras aprobadas el 09-11-2026, una por commit: acceso, comunidad en el teléfono, tarjetas, miga, guía, buscar, perfil | 2026-11-09  |
| [Moderación de acuerdos](ftd/moderacion-de-acuerdos.md) | D120: reporte, ocultar/restaurar por RPC con memoria del estado previo, rondas incluidas; migración 0075 | 2026-11-09 |
| [Acceso y primeros pasos](ftd/acceso-y-primeros-pasos.md) | D121: diez mejoras del registro, el ingreso y el onboarding; checklist de Google para el responsable | 2026-11-09 |
| [Ronda de diseño](ftd/ronda-de-diseno.md) | D123: íconos propios, color por tipo, Manrope para títulos, un solo chip, tarjetas sin redundancia, cabecera por nivel, ilustraciones | 2026-11-10 |
| [Segunda ronda de diseño](ftd/ronda-de-diseno-2.md) | D124: jerarquía en el detalle, un buscador, perfil con identidad, miga colapsada, movimiento y pie compacto | 2026-11-10 |
| [Tercera ronda de diseño](ftd/ronda-de-diseno-3.md) | D125: portada de visitantes, comunidad de cerca, categorías con íconos, tipografía fluida, barrido de glifos | 2026-11-10 |
| [Cuarta ronda de diseño](ftd/ronda-de-diseno-4.md) | D126: búsqueda, mapa, herramientas de comunidad, etapas, detalles de reclamo, proyecto y debate, perfil público, controles globales, avisos y HTML válido en botones | 2026-11-12 |
| [Quinta ronda de diseño](ftd/ronda-de-diseno-5.md) | Veinte mejoras en cuatro tandas, todas implementadas: defectos visibles, coherencia con el sistema visual, densidad en teléfono, formularios y cuenta | 2026-11-15 |
| [Toolchain de noviembre](ftd/toolchain-audit-noviembre.md) | Excepciones de `pnpm audit` renovadas al 19-12, ocho cerradas con parches y re-baseline de `lockHash` de D72 | 2026-11-19 |
| [Verificación · nivel 4 de Argentina](sdd/verifications/nivel4-argentina-2026-11-20.md) | `pnpm verify` en verde y SQL probado con `rollback` en local (D127) | 2026-11-20 |
| [Verificación · nivel 4 de Uruguay, Chile y Paraguay](sdd/verifications/nivel4-uruguay-chile-paraguay-2026-11-20.md) | `pnpm verify` en verde y los tres borradores probados juntos con `rollback` en local (D129–D131) | 2026-11-20 |
| [Verificación · apoyar](sdd/verifications/apoyar-donaciones-2026-11-20.md) | Función en PASS; `test.release` en rojo por los hashes de tests SQL que cambió `cd91279` (D128) | 2026-11-20 |
| [Apoyar: donaciones](ftd/apoyar-donaciones.md) | D128: página `/apoyar` con enlace saliente a Cafecito, apagado hasta cargar la URL; sin beneficios ni registro de donantes | 2026-11-20 |
| [Difusión: tres arreglos](ftd/difusion-arreglos.md) | Sitemap con todas las comunidades, tarjeta al compartir una comunidad y entradas a `/apoyar` desde la portada y el menú de cuenta | 2026-11-21 |
| [Nivel 4 de Argentina](ftd/nivel4-argentina.md) | D127: 1.981 gobiernos locales desde Georef en un borrador SQL sin aplicar; cinco localidades bonaerenses bajan a nivel 5 | 2026-11-20 |
| [Nivel 4 de Uruguay](ftd/nivel4-uruguay.md) | D129: piloto fuera de Argentina; 136 municipios desde la Corte Electoral en un borrador SQL sin aplicar | 2026-11-20 |
| [Nivel 4 de Chile](ftd/nivel4-chile.md) | D130: 345 comunas desde la DPA 2023, sólo nombres y sin coordenadas, en un borrador SQL sin aplicar | 2026-11-20 |
| [Nivel 4 de Paraguay](ftd/nivel4-paraguay.md) | D131: 262 distritos del COD-AB (INE) con coordenadas, contrastados con las intendencias electas; borrador SQL sin aplicar | 2026-11-20 |
| [Nivel 4 de Bolivia](ftd/nivel4-bolivia.md) | D132: 339 municipios del COD-AB con coordenadas; falta identificar el 340 antes de promover | 2026-11-20 |
| [Nivel 4 de Ecuador](ftd/nivel4-ecuador.md) | D133: 221 cantones del COD-AB (INEC), sin coordenadas, en un borrador SQL sin aplicar | 2026-11-20 |
| [Nivel 4 de Perú](ftd/nivel4-peru.md) | D134: 194 provincias y los distritos de Lima y El Callao, nombres del IGN con tildes de Wikidata; borrador SQL sin aplicar | 2026-11-20 |
| [Nivel 4 de Colombia](ftd/nivel4-colombia.md) | D135: 1.102 municipios, lista de la DIVIPOLA y nombres del COD-AB, sin coordenadas; borrador SQL sin aplicar | 2026-11-20 |
| [Nivel 4 de Venezuela](ftd/nivel4-venezuela.md) | D136: 335 municipios del COD-AB (INE) con coordenadas; borrador SQL sin aplicar | 2026-11-20 |
| [Nivel 4 de Brasil](ftd/nivel4-brasil.md) | D137: 5.569 municipios del IBGE, slug con la sigla del estado, sin coordenadas; borrador SQL sin aplicar | 2026-11-20 |
| [Nivel 4 de México](ftd/nivel4-mexico.md) | D138: 2.462 municipios y 16 alcaldías del INEGI, sin coordenadas; borrador SQL sin aplicar | 2026-11-20 |
| [Nivel 4 de Guatemala](ftd/nivel4-guatemala.md) | D139: 340 municipios del COD-AB (CONRED) con coordenadas; borrador SQL sin aplicar | 2026-11-20 |
| [Nivel 4 de Honduras y Costa Rica](ftd/nivel4-honduras-costa-rica.md) | D140–D141: 298 municipios y 84 cantones con el molde común de COD-AB; El Salvador, Nicaragua y Panamá esperan fuente oficial | 2026-11-20 |
| [Nivel 4 de El Salvador, Nicaragua y Panamá](ftd/nivel4-salvador-nicaragua-panama.md) | D142–D144: 44 y 153 municipios desde Wikidata con control oficial, y 81 distritos de la ANATI; borradores SQL sin aplicar | 2026-11-20 |
| [Nivel 4 de República Dominicana](ftd/nivel4-republica-dominicana.md) | D145: 154 municipios del COD-AB (ONE) con coordenadas; La Victoria y Cuba pendientes | 2026-11-20 |
| [Nivel 4 de Haití](ftd/nivel4-haiti.md) | D146: 140 comunas del COD-AB (CNIGS) con coordenadas y tildes francesas; las comunas posteriores a 2018 pendientes | 2026-11-21 |
| [Acuerdos · buscador en todo el país](ftd/acuerdos-buscador-todo-el-pais.md) | Con el nivel 4 el buscador sólo veía 500 comunidades; ahora busca en el servidor y el E2E de acuerdos vuelve a pasar | 2026-11-21 |
| [Manual con menú lateral](ftd/manual-menu-lateral.md) | `/manual` con menú a la izquierda, 15 preguntas esenciales, 86 de detalle en 13 temas, buscador y ancla por pregunta | 2026-11-21 |
| [Migración 0074 · acuerdos](../../supabase/migrations/0074_agreements.sql) | Promovida el 09-11-2026 con autorización del responsable; test en `supabase/tests/agreements_checks.sql` | 2026-11-09  |
| [Decisiones SDD](sdd/decisions.md)                         | Registro append-only de alcance de la cadena | 2026-11-08  |
| [Verificación · inicio a la vista](sdd/verifications/inicio-con-publicaciones-a-la-vista-2026-11-08.md) | Gate, FTD y criterios (D117) | 2026-11-08  |
