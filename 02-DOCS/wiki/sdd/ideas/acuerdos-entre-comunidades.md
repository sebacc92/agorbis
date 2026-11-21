---
type: idea-decision
title: Idea · acuerdos entre comunidades
description: Brief de decisión antes de cualquier spec. Qué es un acuerdo, quién lo propone, cómo se decide y qué se muestra mientras tanto.
tags: [sdd, idea, comunidades]
timestamp: 2026-11-08T19:30:00Z
topic: sdd
slug: acuerdos-entre-comunidades
status: cerrado; 1 respuesta del responsable, 3 decisiones delegadas; sigue en la spec (08-11-2026)
---

# Idea · acuerdos entre comunidades

Idea del responsable del 08-11-2026: "agregar acuerdos entre comunidades". Este
brief no es una spec ni un plan. Abre opciones, separa lo visto de lo supuesto
y recomienda la dirección más barata de probar. La spec viene después, si una
dirección sobrevive.

## Oportunidad

- **Actor.** Vecinas y vecinos de dos comunidades vecinas o hermanas (dos
  localidades de la misma provincia, dos barrios de la misma ciudad) con un
  problema o un proyecto que cruza el límite: un arroyo, una ruta, un hospital
  compartido, un basural en el borde.
- **Rodeo actual.** Publicar lo mismo dos veces, una en cada comunidad, y que
  los apoyos y los votos queden partidos. O publicarlo en la comunidad madre
  (la provincia), donde se diluye entre todo lo demás. O no hacer nada.
- **Progreso deseado.** Que una sola publicación junte el apoyo de las dos
  comunidades, que cada una vea que la otra está adentro, y que la institución
  que responde vea un solo reclamo con dos territorios detrás.
- **Restricciones.** La base decide los permisos (invariante 1): hoy
  `is_member` es jerárquico, no lateral. Voto secreto (D68). Nada ficticio
  (D74): nada dice "acordado" si no está en la base. Migraciones y RLS son
  archivos del responsable. Producción está casi vacía: 3.901 comunidades y
  muy pocas personas.

## Evidencia y supuestos

- **Visto.** Las comunidades sólo se relacionan por `parent_id` y `path`. No
  existe ninguna tabla ni vínculo lateral. D60 compara hermanas pero no las
  vincula. Un reclamo ya puede mostrarse en dos lugares sin mudarse:
  `escalated_to_community_id` es un puntero de visibilidad hacia arriba, con
  umbral por población (`claim_escalation_threshold`) y nunca por encima del
  país. Ese precedente resuelve ya la mitad del problema técnico.
- **Visto.** Un proyecto, un reclamo y una encuesta tienen una sola
  `community_id`. Los conteos, cuotas y listados territoriales dependen de eso.
- **Supuesto.** Que haya hoy, o pronto, dos comunidades con gente adentro y un
  problema compartido. Producción no lo muestra todavía.
- **Supuesto.** Que "acuerdo" para el responsable signifique algo que las dos
  comunidades aprueban, y no sólo algo que las dos ven.

## Direcciones consideradas

1. **Hermanamiento declarativo.** Un vínculo "comunidades aliadas" visible en
   las dos cabeceras, sin efecto en permisos ni en publicaciones. Lo propone
   un miembro de una y lo acepta un miembro de la otra. Mecanismo mínimo,
   primer escalón de confianza. Mayor supuesto: que un vínculo sin
   consecuencias le sirva a alguien.
2. **Adhesión lateral por apoyo, automática.** Copia del precedente de
   escalación pero hacia el costado: un reclamo de A puede recibir apoyos de
   miembros de B; cuando el apoyo desde B supera el umbral poblacional de B, el
   reclamo se muestra también en B como "reclamo compartido". Sin negociación,
   sin roles, sin votación. Mayor supuesto: que RLS permita a un miembro de B
   apoyar un reclamo de A sin romper "apoyan sólo los residentes" (hoy la
   política lo prohíbe).
3. **Pacto votado en espejo.** La misma encuesta se abre en A y en B a la vez,
   con cierre común. El acuerdo existe sólo si las dos aprueban al cierre, con
   cinco participantes o más en cada una (D68). Es lo que más se parece a
   "acuerdo" en sentido estricto. Mayor supuesto: que haya participación
   suficiente en las dos; con producción vacía, casi todos los pactos
   terminarían "sin resultado por baja participación".
4. **Publicación compartida con dos dueñas.** Un proyecto o reclamo con una
   comunidad dueña y comunidades "adheridas" aceptadas por un miembro de la
   otra. Cuenta en los dos listados. Mayor supuesto: que un miembro cualquiera
   pueda comprometer a su comunidad; sin roles, cualquiera "acepta" por todos.
5. **Nada lateral: usar la madre común.** No construir vínculo alguno. Guiar a
   publicar en el ancestro común (la provincia o el país) con las dos
   comunidades nombradas en el texto. Costo cero. Mayor supuesto: que la
   dilución en la madre no mate el reclamo. Sirve también como experimento de
   demanda: si nadie publica cosas cruzadas en la madre, la demanda no está.
6. **Convenio institucional.** Dos instituciones verificadas (los dos
   municipios) firman un convenio sobre un reclamo compartido. Otro actor,
   otro problema: necesita que existan instituciones verificadas en las dos
   comunidades. No ahora.
7. **Rol de representante que firma.** Alguien con autoridad delegada acepta
   acuerdos por su comunidad. Requiere roles que hoy no existen y que la
   plataforma eligió no tener. Fuera.

## Comparación

Criterios iguales para las tres finalistas: 1 (hermanamiento), 2 (adhesión
lateral por apoyo) y 3 (pacto votado). Escala baja, media, alta.

| Criterio                   | 1 Hermanamiento | 2 Adhesión por apoyo | 3 Pacto votado |
| -------------------------- | --------------- | -------------------- | -------------- |
| Valor para quien participa | Baja            | Alta                 | Alta           |
| Evidencia de demanda       | Ninguna         | Ninguna              | Ninguna        |
| Tiempo hasta aprender algo | Corto           | Medio                | Largo          |
| Reversibilidad             | Alta            | Alta (puntero)       | Media          |
| Riesgo con los invariantes | Bajo            | Medio (RLS lateral)  | Alto (D68 x2)  |
| Esfuerzo (migración, RLS)  | Bajo            | Medio                | Alto           |

Objeción más fuerte a cada una:

- **1.** Un vínculo sin consecuencias es decoración. Se construye, nadie lo usa,
  y queda como una función más que mantener.
- **2.** Abrir el apoyo a no residentes rompe la regla que hace creíble al
  conteo: "20 vecinos" dejaría de significar vecinos. Haría falta contar los
  apoyos por comunidad de origen y mostrarlos separados, nunca sumados.
- **3.** Con la participación actual, casi ningún pacto llegaría a cinco
  participantes en las dos comunidades. Sería una función que casi siempre
  termina en "sin resultado", y eso enseña a no usarla.

## Recomendación

**Dirección 2, adhesión lateral por apoyo con umbral, como destino. Dirección 5
como primer paso, hoy.** Confianza: **baja**, porque no hay ninguna evidencia
de demanda y producción está vacía.

Razón que decide: la 2 reutiliza un mecanismo que ya existe y ya se decidió
(escalación por silencio y apoyo, puntero de visibilidad, umbral por
población), no inventa roles ni autoridad, y respeta "el reclamo no se muda".
Lo que agrega es el sentido lateral y el conteo de apoyo por comunidad de
origen. La 5 cuesta cero y responde la pregunta que importa antes de construir:
¿alguien necesita esto?

Supuestos de los que depende: que el conteo de apoyos por comunidad de origen
sea aceptable para el responsable; que RLS pueda permitir el apoyo lateral sólo
entre comunidades hermanas o vecinas y no entre cualquier par; que la
institución que responde acepte ver un reclamo con dos territorios.

Rechazadas: la 1 por decorativa; la 3 por D68 con la participación actual,
aunque es la que más se parece a un "acuerdo" y puede volver cuando haya
gente; la 4 porque un miembro cualquiera no puede comprometer a su comunidad;
la 6 y la 7 porque necesitan actores que no existen.

Hecho que más probablemente daría vuelta la elección: que el responsable
quiera un acuerdo en sentido estricto, aprobado por las dos comunidades, y no
un reclamo compartido. En ese caso la dirección es la 3 y hay que esperar a
tener participación.

## Decisiones que le tocan al responsable

Cuatro preguntas. La respuesta a cada una cambia lo que se construye:

1. **¿Qué es un acuerdo?** (a) una publicación que las dos comunidades ven y
   apoyan, o (b) algo que las dos comunidades aprueban por voto.
2. **¿Quién lo inicia y quién acepta del otro lado?** (a) nadie acepta: lo
   decide el apoyo de la otra comunidad al superar su umbral; (b) un miembro
   cualquiera de la otra comunidad; (c) alguien con un rol nuevo.
3. **¿Entre qué comunidades?** (a) sólo hermanas (mismo padre); (b) hermanas y
   vecinas por distancia; (c) cualquier par del mismo país.
4. **¿Qué se muestra mientras tanto?** Hasta que la otra comunidad entra, la
   publicación dice "propuesto a {{B}}" y nada más. ¿Acepta ese estado
   intermedio o prefiere que no se muestre nada hasta que esté hecho?

## Respuestas del responsable

**1. Qué es un acuerdo (08-11-2026).** Algo que se aprueba por voto. Puede ser
entre dos comunidades, entre más de dos, o dentro de una sola: los habitantes
de una comunidad que se ponen de acuerdo entre sí.

Consecuencias:

- Cae la recomendación de la dirección 2 (adhesión por apoyo) y pasa a la 3,
  **pacto votado**, generalizada: un acuerdo es un texto de compromiso que una o
  más comunidades votan por separado, con cierre común, y que existe sólo si
  todas lo aprueban. Con una sola comunidad es un acuerdo interno.
- Aplica D68 entera: voto secreto, resultados al cierre, cinco participantes o
  más **en cada comunidad**. Con una sola comunidad chica, la mayoría de los
  acuerdos terminarían "sin resultado por baja participación" hasta que haya
  gente; la función tiene que decirlo antes de abrir la votación, no después.
- Lo más barato y seguro es construirlo sobre las encuestas que ya existen:
  un acuerdo sería un conjunto de encuestas binarias enlazadas (una por
  comunidad) más el texto del compromiso y un estado propio. RLS, el gate
  legal y el voto secreto ya están resueltos ahí; lo nuevo es el enlace, el
  texto y el estado.
- D74 manda el vocabulario: "propuesto" mientras se junta a las comunidades,
  "en votación" mientras hay una ronda abierta, y "aprobado" sólo cuando todas
  cerraron con mayoría y quórum. "Rechazado" y "sin quórum" son estados
  distintos y se muestran distintos.
- Lo que distingue un acuerdo interno de una encuesta binaria común: el texto
  es un compromiso de la comunidad, no una consulta; queda registrado como tal
  y se puede volver a él. Si el responsable no ve esa diferencia, el acuerdo
  interno es una encuesta y no hace falta construir nada para ese caso.

**2 a 4, resueltas por el agente (08-11-2026).** El responsable delegó:
"hacé lo que recomiendes, mejor para el proyecto y la humanidad". Decisiones
tomadas, con base, en la spec:

- **2.** La otra comunidad entra cuando una residente de ahí adhiere la
  propuesta (opción a). En la comunidad propia hace falta otra residente
  distinta de la proponente.
- **3.** Comunidades del mismo país, de provincia para abajo, que no se
  contengan entre sí.
- **4.** El estado "propuesto a …" se muestra, con "esperando adhesión" por
  comunidad, y vence a los 30 días como "sin adhesión".

Sigue en `../specs/acuerdos-entre-comunidades.md`.

## Not Now

- Pacto votado en espejo (3): vuelve cuando dos comunidades tengan más de
  cinco participantes activas cada una.
- Convenios institucionales (6) y roles de representante (7).
- Acuerdos entre comunidades de distinto país: no hay institución con
  competencia para responder (misma razón por la que la escalación para en el
  país).
- Un ranking o mapa de "comunidades que más acuerdan": D60 ya prohibió las
  tablas de posiciones entre territorios.

## Próximo experimento

- **Método.** Dirección 5 sin código: observar durante cuatro semanas si en
  producción aparecen publicaciones en comunidades madre (provincia, país) que
  nombren dos localidades o barrios, y cinco conversaciones con personas de
  localidades vecinas que ya estén en Agorbis.
- **Audiencia.** Las comunidades que primero tengan dos o más residentes
  activas.
- **Señal a favor.** Al menos dos publicaciones cruzadas espontáneas, o tres
  de cinco personas que describan un problema que cruza el límite y hoy no
  saben dónde publicarlo.
- **Señal de muerte.** Cero publicaciones cruzadas y nadie que nombre un
  problema compartido en cuatro semanas: la idea espera a que haya gente.
- **Plazo.** Hasta el 06-12-2026, antes de la revisión de D72 versión 7.

Si la señal es a favor y el responsable responde las cuatro preguntas, el paso
siguiente es `specify` con este brief como entrada.
