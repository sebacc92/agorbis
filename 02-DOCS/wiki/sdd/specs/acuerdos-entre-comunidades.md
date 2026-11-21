---
type: spec
title: Spec — Acuerdos entre comunidades
description: QUÉ y POR QUÉ de los acuerdos votados por una o varias comunidades — problema, metas, comportamiento y criterios de aceptación.
tags: [sdd, spec, comunidades, voto]
timestamp: 2026-11-08T23:30:00Z
topic: sdd
slug: acuerdos-entre-comunidades
status: clarified (aprobada por el responsable el 08-11-2026: "lo apruebo")
---

# Spec — Acuerdos entre comunidades

> Slug: `acuerdos-entre-comunidades` · Status: clarified, aprobada el 2026-11-08 · Created: 2026-11-08
> Inherits: [constitution](../constitution.md) (borrador, no ratificada: las
> restricciones heredadas salen de los invariantes de `CLAUDE.md` y de D68,
> D74 y D76 en `DECISIONS.md`) · Entrada:
> [brief de decisión](../ideas/acuerdos-entre-comunidades.md)

## Problem & why

Hoy en Agorbis una comunidad consulta (encuesta), discute (debate), reclama y
propone (proyecto), pero no tiene forma de **comprometerse** a algo como
comunidad, ni de comprometerse junto con otra. Un problema que cruza un
límite (un arroyo entre dos localidades, un hospital compartido, una ruta) se
publica dos veces y la voluntad queda partida. Y dentro de una misma
comunidad, cuando la gente se pone de acuerdo en algo, ese acuerdo no queda
registrado como tal: es una encuesta más, mezclada con las consultas.

El responsable lo definió el 08-11-2026: un acuerdo es algo que **se aprueba
por voto**, entre dos comunidades, entre más de dos, o dentro de una sola.

## Cost of not building it

Hoy, poco. Producción abrió el 02-11-2026 y casi todas las 3.901 comunidades
están vacías: no hay dos comunidades con gente suficiente para acordar nada,
y un acuerdo interno con menos de cinco participantes terminaría "sin
resultado" (D68). El costo real aparece cuando haya gente: sin esta función,
lo que una comunidad decide junta no se distingue de lo que consulta, y lo
que dos comunidades necesitan decidir juntas no se puede decidir en la
plataforma.

## The cheapest alternative

Una encuesta binaria con la pregunta "¿Acordamos X?" publicada en la
comunidad madre común (la provincia, el país), nombrando a las comunidades en
el texto. Ya existe, cuesta cero y respeta D68. No alcanza por tres razones:
vota toda la madre y no cada comunidad por separado, así que una comunidad
grande decide por la chica; el resultado no queda registrado como compromiso
de nadie; y para un acuerdo interno no agrega nada. El brief la deja como
experimento de demanda hasta el 06-12-2026, y esta spec no lo contradice:
puede escribirse ahora y construirse cuando la señal llegue.

## Goals

- Una comunidad puede aprobar por voto un texto de compromiso propio, y ese
  compromiso queda registrado y consultable como acuerdo, distinto de una
  encuesta.
- Dos o más comunidades pueden aprobar el mismo texto, cada una con su propio
  voto, y el acuerdo existe sólo si todas lo aprueban.
- Nadie puede abrir una votación en una comunidad ajena sin que alguien de
  esa comunidad lo pida.
- En todo momento la pantalla dice en qué estado está el acuerdo, y nunca
  dice "aprobado" antes de que lo esté.
- El voto sigue siendo secreto, con resultados sólo al cierre y con cinco
  participantes o más por comunidad (D68).

## Non-goals / out of scope

- Acuerdos entre comunidades de distinto país, o con la Tierra y los
  continentes: no hay institución con competencia para responder (misma razón
  por la que la escalación de reclamos para en el país).
- Firma o aval de instituciones verificadas sobre un acuerdo.
- Roles nuevos (representantes, delegadas) que acepten por su comunidad.
- Seguimiento del cumplimiento del acuerdo, plazos, hitos o rendición: queda
  para otra ronda, si los acuerdos aprobados existen.
- Editar el texto una vez abierta la votación; enmiendas; contrapropuestas.
- Mayorías calificadas o quórums por población: en este ciclo, mayoría simple
  con el mínimo de D68.
- Ranking o mapa de "comunidades que más acuerdan" (D60 prohíbe tablas de
  posiciones entre territorios).
- Notificaciones nuevas más allá de las que ya existen para encuestas.

## Users & context

- **Quien propone.** Residente de una comunidad, con los acuerdos legales
  vigentes aceptados. Escribe el texto del compromiso y elige las comunidades
  que deberían votarlo (la suya y, si corresponde, otras).
- **Quien adhiere.** Residente de otra comunidad nombrada en la propuesta. Es
  quien decide que su comunidad vote: sin su adhesión, ahí no se abre nada.
- **Quien vota.** Residente de una comunidad participante, en el mismo
  contexto que una encuesta: desde el teléfono, en pocos segundos, con la
  garantía de que su elección no queda guardada.
- **Quien lee.** Cualquier persona, con o sin sesión, que entra a la página
  del acuerdo o lo ve en la comunidad: entiende de un vistazo quiénes están
  adentro, en qué estado está y, al cierre, qué decidió cada comunidad.
- **Institución que responde.** Lee un acuerdo aprobado como la posición de
  una o varias comunidades, con fecha y participación, sin firmarlo.

## Behaviour

- **Main path, una comunidad.** Una residente escribe un texto de compromiso
  y lo propone en su comunidad. Otra residente de la misma comunidad lo
  adhiere. Con esa adhesión se abre una votación secreta "¿Aprobamos este
  acuerdo?" con dos opciones. La proponente fijó una duración al proponer; la
  fecha de cierre se calcula en el momento de abrir la votación, así la
  espera de adhesiones nunca acorta el plazo para votar. Al cierre, si
  hubo cinco participantes o más y hubo más "sí" que "no", el acuerdo pasa a
  "aprobado" y queda registrado con texto, comunidad, fechas, resultado
  agregado y cantidad de participantes. Si hubo más "no" o empate, pasa a
  "rechazado". Si hubo menos de
  cinco, pasa a "sin quórum" y no muestra conteos.
- **Quiénes pueden participar.** La comunidad de la proponente participa
  siempre. Toda comunidad participante es de nivel provincia para abajo y del
  mismo país; el país, los continentes y la Tierra no participan, ni siquiera
  en un acuerdo interno. Dos participantes nunca se contienen entre sí.
- **Main path, varias comunidades.** Igual, pero la propuesta nombra dos o
  más comunidades que cumplen la regla anterior. Queda en
  "propuesto" y cada comunidad nombrada aparece como "esperando adhesión". La
  votación se abre en todas a la vez cuando la última comunidad adhirió. Cada
  comunidad vota por separado con el mismo plazo. El acuerdo es "aprobado"
  sólo si **todas** lo aprobaron con quórum; con una sola que rechace, es
  "rechazado"; con una sola sin quórum y ninguna que rechace, es "sin quórum".
  La página muestra el resultado de cada comunidad por separado y nunca los
  suma en un número único.
- **Lo que ve cada persona.** La propuesta y el acuerdo se ven en cada
  comunidad participante y en el inicio de sus residentes, con su estado en
  palabras: "propuesto a Necochea y Miramar", "en votación hasta el 3 de
  diciembre", "aprobado el 4 de diciembre", "rechazado", "sin quórum", "sin
  adhesión". Quien puede votar ve el botón de votar; quien ya votó ve su
  constancia sin elección; quien no es residente lee y nada más.
- **Edge: nadie adhiere.** Si pasada la ventana de adhesión alguna comunidad
  no adhirió, la propuesta pasa a "sin adhesión" y no se abre en ninguna. No
  se vota con un subconjunto: otro conjunto de comunidades es otro acuerdo.
- **Edge: la proponente se arrepiente.** Puede retirar la propuesta mientras
  esté en "propuesto". Abierta la votación, ya no.
- **Edge: comunidades que se contienen.** La propuesta no acepta una
  comunidad y una que la contenga (la ciudad y su provincia): sus residentes
  votarían dos veces. Lo dice al elegir, no después.
- **Edge: residente de dos comunidades participantes.** No existe: cada
  persona tiene una sola residencia y las comunidades no se contienen.
- **Edge: texto largo o vacío.** Mismos límites que la descripción de una
  encuesta; el texto es obligatorio y no se puede cambiar una vez abierta la
  votación.
- **Error: sin sesión o sin residencia.** Proponer, adherir y votar llevan a
  ingresar o a elegir residencia, como el resto de las publicaciones (D115).
- **Error: la base rechaza.** Si la base rechaza proponer, adherir o votar
  (no es miembro, falta el gate legal, ya votó), la pantalla traduce el
  rechazo y nunca muestra la acción como hecha (D74).
- **Error: no se pudo leer el estado.** La página dice que no pudo leerlo y
  ofrece recargar; no muestra un estado inventado.

## Acceptance criteria

- Given una residente con los acuerdos legales vigentes, When propone un
  acuerdo sólo para su comunidad, Then el acuerdo aparece en su comunidad en
  estado "propuesto" y no hay ninguna votación abierta todavía.
- Given un acuerdo "propuesto" en una comunidad, When otra residente de esa
  comunidad lo adhiere, Then se abre una votación secreta de dos opciones
  cuya fecha de cierre es el momento de apertura más la duración fijada al
  proponer; la misma persona no puede adherir dos veces ni la proponente
  adherir su propia propuesta, y la base lo rechaza aunque se saltee el
  formulario.
- Given una votación abierta de un acuerdo, When una residente vota, Then
  queda una constancia de que participó sin su elección, no puede votar de
  nuevo, y ninguna pantalla muestra conteos antes del cierre.
- Given una votación cerrada con cinco participantes o más y más "sí" que
  "no" en cada comunidad participante, When alguien abre el acuerdo, Then lo
  ve "aprobado" con la fecha y, por cada comunidad, su resultado agregado y
  su cantidad de participantes, sin un total combinado.
- Given una votación cerrada con más "no" que "sí" o empate en al menos una
  comunidad, When alguien abre el acuerdo, Then lo ve "rechazado" y ve qué
  comunidad lo rechazó.
- Given una votación cerrada con menos de cinco participantes en alguna
  comunidad y ninguna que haya rechazado, When alguien abre el acuerdo, Then
  lo ve "sin quórum" y no ve conteos de esa comunidad.
- Given una propuesta que nombra dos comunidades, When sólo una adhirió al
  vencer la ventana de adhesión, Then la propuesta pasa a "sin adhesión" y no
  hay votación abierta en ninguna de las dos.
- Given una propuesta que nombra dos comunidades, When la segunda adhiere,
  Then la votación se abre en las dos en el mismo momento y con la misma fecha
  de cierre, calculada al abrir.
- Given el formulario de proponer, When se elige una comunidad de otro país,
  una que contenga a la propia o esté contenida en ella, el país, un
  continente o la Tierra, Then el formulario lo rechaza y dice por qué antes
  de enviar, y la base lo rechaza igual aunque se saltee el formulario; la
  pantalla traduce ese rechazo.
- Given el formulario de proponer, When se elige una duración de votación
  menor a 7 días o mayor a 30, Then el formulario lo rechaza antes de enviar
  y la base lo rechaza aunque se saltee el formulario.
- Given una propuesta con comunidades que todavía no adhirieron, When pasan
  30 días desde la propuesta sin la última adhesión, Then la propuesta pasa a
  "sin adhesión", ya no se puede adherir y no hay votación abierta.
- Given una propuesta en estado "propuesto", When la proponente la retira,
  Then desaparece de las comunidades nombradas y no se puede adherir; Given
  una votación ya abierta, When la proponente intenta retirarla, Then la base
  lo rechaza y la pantalla lo dice.
- Given una persona sin sesión, When abre un acuerdo en votación o ya
  cerrado, Then lee el texto, las comunidades y el estado, no ve botones de
  proponer, adherir ni votar, y el llamado principal la lleva a crear cuenta.
  (Qué ve de una propuesta todavía sin adhesión queda en Points to clarify.)
- Given que la base rechaza una adhesión o un voto, When la persona lo
  intenta, Then ve el motivo traducido y el acuerdo no cambia de estado en
  pantalla.
- Given cualquier acuerdo, When se lee en inglés, Then todos los textos de la
  interfaz están traducidos y el texto del compromiso se muestra tal como se
  escribió (D56).
- Given un acuerdo aprobado, When una institución verificada lo lee, Then ve
  lo mismo que cualquiera; no hay ninguna acción de firma o aval.

## Points to clarify

- **suposición tomada** — Quien adhiere es cualquier residente de la otra
  comunidad, distinta de la proponente; en la comunidad propia hace falta
  otra residente. *Base:* es el único control contra abrir votaciones ajenas
  sin inventar roles, y "dos personas piden que la comunidad vote" es un
  umbral bajo pero real. *Riesgo:* en comunidades de una sola residente
  activa no se puede proponer nada; es coherente con D68 (nada se decide con
  menos de cinco).
- **suposición tomada** — Sólo comunidades del mismo país, de nivel provincia
  para abajo, que no se contengan entre sí. *Base:* la escalación de reclamos
  para en el país por falta de institución competente; y la membresía
  jerárquica haría votar dos veces a quien vive en una comunidad contenida.
  *Riesgo:* deja afuera acuerdos entre provincias con el país, y acuerdos
  internacionales; van a Non-goals.
- **suposición tomada** — La ventana de adhesión es de 30 días desde la
  propuesta y el plazo de votación lo elige la proponente entre 7 y 30 días.
  *Base:* los límites de cierre que ya tienen las encuestas. *Riesgo:* si el
  responsable quiere otros plazos, cambian dos criterios de aceptación, no la
  forma.
- **suposición tomada** — Mayoría simple de "sí" sobre "no" con el mínimo de
  cinco participantes de D68; el empate no aprueba. *Base:* es la regla que
  ya rige las encuestas y no exige decidir pesos. *Riesgo:* un acuerdo
  "aprobado" con 3 contra 2 puede parecer débil; por eso Behaviour y el
  criterio de "aprobado" muestran la participación al lado del resultado.
- **suposición tomada** — El acuerdo interno de una comunidad usa el mismo
  flujo (propuesta, adhesión, votación, registro) que el de varias, con una
  sola comunidad. *Base:* una regla en vez de dos. *Riesgo:* si el
  responsable considera que el acuerdo interno es sólo una encuesta con otro
  nombre, ese caso se quita y la función queda sólo para dos o más.
- **suposición tomada** (era pregunta abierta; resuelta en clarify por
  delegación) — El acuerdo vive dentro de la pestaña Encuestas de cada
  comunidad participante, como una sección propia al tope ("Acuerdos"), y
  tiene su página propia. *Base:* es un voto y la gente lo busca donde vota;
  una pestaña nueva en cada comunidad agrega navegación a 3.901 comunidades
  que en su mayoría no tendrán ninguno (D79 eligió pocas pestañas). *Riesgo:*
  si los acuerdos se vuelven frecuentes, merecen pestaña; es un cambio de
  navegación, no de contrato.
- **suposición tomada** (era pregunta abierta; resuelta en clarify por
  delegación) — Una propuesta todavía sin adhesión la ve todo el mundo, con
  su estado "propuesto" en palabras, como cualquier publicación. *Base:* la
  plataforma no esconde publicaciones por estado, y una visitante que lee
  "propuesto a Miramar, esperando adhesión" entiende por qué no puede votar.
  Quien propone ya pasó el gate legal y la residencia. *Riesgo:* propuestas
  sin eco quedan visibles 30 días; "sin adhesión" las cierra con honestidad.
- **decisión diferida** — Seguimiento del cumplimiento (hitos, plazos,
  rendición) y aval institucional: fuera de este ciclo a propósito.
- **decisión diferida** — Mayoría calificada o quórum por población: se
  revisa con acuerdos reales, no antes.
- **área no formulable** — Qué pasa con un acuerdo aprobado cuando una de las
  comunidades cambia (se divide, se fusiona, cambia de nombre). Hay una
  pregunta ahí y todavía no se puede enunciar bien.
- **área no formulable** — Cómo se relaciona un acuerdo con un reclamo o un
  proyecto existentes ("este acuerdo resuelve este reclamo"). Las relaciones
  entre contenidos ya existen para otros tipos; falta saber si acá aplican.

## Riesgos de método

- La constitución SDD está en borrador y no hay `config.yaml`: las
  restricciones heredadas salen de `CLAUDE.md` y `DECISIONS.md`, que en este
  proyecto son la constitución de hecho.
- Las migraciones, RLS y tests SQL que esta función necesita son archivos del
  responsable por CODEOWNERS: el agente propone borradores en
  `supabase/migration-drafts/` y el responsable los aplica.
- Producción no tiene todavía dos comunidades con cinco residentes activas:
  la función puede construirse y no usarse por meses. El brief propone medir
  la demanda hasta el 06-12-2026 antes de construir.

## Revisions

- 2026-11-08 — Borrador inicial a partir del brief y de la respuesta del
  responsable a la pregunta 1 ("se aprueba por voto; dos, más de dos, o una
  sola comunidad"). Las preguntas 2 a 4 las resolvió el agente por delegación
  explícita ("hacé lo que recomiendes") y quedan como suposiciones tomadas.
- 2026-11-08 — Revisión de ojos frescos (agente con sólo la spec y
  `CLAUDE.md`): la duración se fija al proponer y la fecha de cierre se
  calcula al abrir; los rechazos de elegibilidad, duración, doble adhesión y
  retiro los garantiza la base, no sólo el formulario; regla de elegibilidad
  completa (la propia siempre participa; país, continentes y Tierra nunca);
  criterios nuevos para la ventana de 30 días y el rango de 7 a 30; el
  criterio de visitantes se acota a acuerdos en votación o cerrados; la
  participación se muestra junto al resultado.
- 2026-11-08 — Aprobada por el responsable ("lo apruebo") tras leer las cinco
  decisiones delegadas. Clarify: las dos preguntas abiertas pasan a
  suposiciones tomadas por la misma delegación (sección Acuerdos dentro de
  Encuestas con página propia; propuestas visibles para todo el mundo). Las
  cinco suposiciones anteriores quedan validadas por la aprobación.
