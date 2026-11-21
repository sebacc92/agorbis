# Decisiones de Agorbis

Todo lo que se decidió por fuera del documento de producto, con el porqué.
Si alguna te parece equivocada, está bien: acá queda el razonamiento para poder
discutirlo con datos y no con intuiciones.

---

## Modelo de datos

### D1 · Materialized path en vez de `ltree`

Se usa `path text` con segmentos separados por puntos
(`earth.south-america.argentina.buenos-aires.mar-del-plata`) y un índice
`btree` con `text_pattern_ops` para las búsquedas por prefijo.

Motivos:

- `ltree` no admite guiones en las etiquetas sin comillas, y todos los slugs son
  kebab-case (`mar-del-plata`, `south-america`). Habría que mantener dos
  representaciones distintas del mismo identificador.
- PostgREST y `supabase-js` manejan `text` de forma nativa; con `ltree` toda
  consulta jerárquica pasaría a ser una RPC.
- Un `CHECK` sobre el formato de `path` garantiza que jamás entre un `%` o un
  `_` desde los datos, así que el `LIKE 'prefijo.%'` de `is_member` no puede ser
  engañado con comodines.

El costo es que renombrar un slug obliga a reescribir los `path` de sus
descendientes. Con datos geográficos eso es rarísimo y, cuando pase, es un
`UPDATE` con `replace()` sobre el prefijo.

### D2 · Nivel 5 (barrios) reservado pero no implementado

El `CHECK` de `level` acepta hasta 5 y `CHILD_LEVEL_LABEL` ya tiene la etiqueta
"Barrios". No hace falta ninguna migración de esquema para habilitarlos: sólo
insertar filas.

### D3 · El secreto del voto es una restricción de esquema, no de UI

`poll_votes` tiene RLS que sólo deja leer los votos propios. Los agregados salen
de `poll_results()` / `poll_stats()`, funciones `security definer` que devuelven
números y nunca identidades. Ni siquiera un bug en la UI puede filtrar quién
votó qué.

### D4 · `poll_votes.poll_type` denormalizado con FK compuesto

Para garantizar "un voto por usuario" en encuestas `single` y `binary` sin
carreras, hace falta un índice único parcial — y un índice no puede consultar
otra tabla. Entonces:

- `polls` tiene `unique (id, type)`.
- `poll_votes` tiene `poll_type` con `foreign key (poll_id, poll_type)
references polls (id, type) on update cascade`.
- Índice: `unique (poll_id, user_id) where poll_type <> 'multiple'`.

El FK compuesto mantiene la denormalización sincronizada sola, y un trigger
impide cambiar el tipo de una encuesta que ya tiene votos. El resultado es que
el doble voto es **imposible a nivel motor**, no "improbable si la aplicación
hace bien las cosas".

Del mismo modo, `foreign key (poll_id, option_id) references poll_options
(poll_id, id)` hace imposible votar una opción de otra encuesta.

### D5 · Realtime sobre una tabla-señal, no sobre `poll_votes`

> **Estado actual:** esta decisión histórica fue reemplazada por D61 y la
> migración 0030. La tabla-señal ya no existe.

Supabase Realtime respeta RLS: si sólo se pueden leer los votos propios, los
clientes nunca recibirían los votos ajenos y los resultados "en vivo" no se
moverían. Publicar `poll_votes` entero rompería el secreto del voto.

La solución es `poll_vote_events (id, poll_id, created_at)`: un trigger inserta
una fila por cada voto, sin `user_id` ni `option_id`. El cliente escucha esa
tabla y, cuando ve movimiento, vuelve a pedir los agregados por RPC (que aplica
`results_visibility`). Se filtra la existencia de un voto y su timestamp, nunca
su contenido.

Las ráfagas se agrupan con un debounce de 600 ms para no disparar una consulta
por voto.

### D6 · Rate limiting en trigger, no sólo en la action

`enforce_debate_column` rechaza un comentario si el usuario escribió otro hace
menos de 15 segundos. Está en la base porque una action se puede saltear
llamando a PostgREST directamente con el mismo token. La action existe igual,
pero sólo para traducir el error a un mensaje amable.

Lo mismo con la regla de 30 días para cambiar de residencia
(`enforce_residence_cooldown`).

### D7 · `member_count` por trigger sobre toda la cadena

Cuando alguien elige o cambia residencia, `sync_member_counts` suma o resta 1 en
**todas** las comunidades cuyo `path` sea prefijo del elegido. Es O(profundidad)
—como mucho 5 filas— y evita tener que contar residentes en cada render de la
landing.

### D8 · `sort_order` en vez de `position`

`position` es palabra reservada en PostgreSQL (`position(x in y)`) y rompe
tanto un `RETURNS TABLE (... position smallint ...)` como un `select position
from …`. Se renombró la columna de `poll_options` a `sort_order`.

### D9 · `poll_feed()` en vez de conteos embebidos

El listado de encuestas necesita el total de votos de cada una, pero RLS oculta
los votos ajenos: un `count` embebido de PostgREST devolvería 1. `poll_feed()`
es `security definer`, hace los agregados en el motor y **replica a mano la
regla de visibilidad** (`status <> 'removed' or is_moderator()`), porque
`security definer` saltea RLS y hay que reponerla explícitamente.

### D10 · `is_admin()` como `security definer`

Consultar `profiles` desde una policy sobre `profiles` es la receta clásica de
la recursión infinita en Supabase. `is_admin()` y `is_moderator()` saltean RLS,
así que el problema no puede aparecer.

---

## Producto

### D11 · Las columnas del debate global son continentes

La regla general es "una columna por hijo directo". Para un debate en `earth`
eso daría 6 columnas (continentes) y para uno en `argentina`, 24. El caso que se
evitó explícitamente es el de un debate global con 195 columnas de países: la
grilla sería inusable y el scroll horizontal, infinito.

Como la regla ya es "hijos directos", el debate global da continentes de forma
natural. No hizo falta ninguna excepción en el código; queda documentado porque
el planteo original lo mencionaba como decisión a tomar.

Además, un trigger y la policy de `debates` impiden crear un debate en una
comunidad sin hijos: sería un debate sin columnas.

### D12 · Votar comentarios requiere residir en la comunidad del debate

El documento define dónde se puede _comentar_ (sólo la columna propia) pero no
dónde se puede _votar_. Se optó por lo más amplio que sigue siendo coherente:
podés votar cualquier comentario de un debate de una comunidad donde residís.
Un marplatense puede votar un comentario de la columna Córdoba en un debate
argentino, pero no puede tocar nada en un debate de Chile.

### D13 · Se puede editar el compromiso de aporte, no el voto

`project_pledges` tiene `unique (project_id, user_id)` y la UI hace `upsert`:
podés corregir el monto o retirarte. Un compromiso es una intención que cambia;
un voto, no. El voto sigue siendo inmutable en el MVP, como pide el documento.

### D14 · Los reclamos ordenan por "recientes" o "más apoyados"

El orden por apoyos no usa cursor: en ese modo lo que interesa es la primera
página. Paginar por apoyos con cursor requeriría un cursor compuesto
`(support_count, created_at, id)` y el conteo cambia mientras navegás, así que
no valía la complejidad para el MVP. El orden cronológico sí pagina por cursor.

### D15 · El registro no pide username; el onboarding sí

`handle_new_user` genera un placeholder `user_<hex>` para satisfacer el
`NOT NULL UNIQUE`, y el wizard pide el definitivo en el primer paso. Así el
formulario de registro tiene dos campos en vez de tres y la validación de
unicidad ocurre en un paso donde el usuario ya está comprometido con el flujo.

"Necesita onboarding" se detecta con `home_community_id is null`, sin columna
extra.

---

## Frontend

### D16 · Qwik 2 (`@qwik.dev/*`), no Qwik City 1

> La elección de adapter Vercel que aparece al final de esta decisión quedó
> reemplazada por D71. Se conserva aquí como historial técnico.

El scaffold del repo ya venía con `@qwik.dev/core` y `@qwik.dev/router`
2.0.0-beta. Es el sucesor de `@builder.io/qwik-city` (Qwik City pasó a llamarse
Qwik Router). Las convenciones que pide el documento —`routeLoader$`,
`routeAction$`, `zod$`, `server$`— son idénticas; sólo cambia el paquete.

El adapter de deploy es `@qwik.dev/router/adapters/vercel-edge/vite`, en
`adapters/vercel-edge/vite.config.ts`.

### D17 · Cookies: hay que codificar al escribir

Qwik decodifica con `decodeURIComponent` al **leer** una cookie, pero escribe el
string tal cual. Sin un `encodeURIComponent` explícito en el adaptador de
`@supabase/ssr`, cualquier valor de sesión con un `%` se corrompería en el
round-trip. Está resuelto en `qwikCookieAdapter` (`src/lib/supabase.ts`).

### D18 · `getUser()` y no `getSession()` en el servidor

`getSession()` sólo lee la cookie y confía en ella. `getUser()` valida el JWT
contra Supabase. Todo lo que decide permisos usa `getUser()`. El resultado se
cachea en `sharedMap` para no repetir la validación en cada `routeLoader$` de la
misma navegación.

### D19 · Props de componentes siempre serializables

Qwik serializa las props de un `component$` para la resumabilidad. Por eso
`LocationPicker` recibe `navBase` y `confirmBase` como _strings_ a los que se
les concatena el slug, en vez de una función `(slug) => string`, que no es
serializable.

### D20 · Votar comentarios con `server$`, comentar con `globalAction$`

En una grilla hay decenas de botones de voto. Con una action compartida, apretar
uno pondría a **todos** en estado "cargando", porque comparten el store. Los
votos usan `server$` con estado local por tarjeta (optimista, con rollback si el
servidor rechaza).

Los formularios de los que hay uno solo por página (comentar, reportar,
comprometerse) usan `globalAction$`, que además funciona sin JavaScript.

### D21 · Gráficos en SVG propio

Barras horizontales dibujadas como `<rect>` en un `viewBox` relativo. La
animación de entrada es CSS puro (`transform: scaleX` con `transform-origin`
izquierdo), así que dibujar los resultados cuesta **cero** JavaScript. El
`<svg>` lleva un `aria-label` con los resultados en texto para lectores de
pantalla.

### D22 · Selector de ubicación por URL, sin formularios anidados

Todo el estado del selector vive en la query string (`?parent=&q=`) y la
navegación es por links. El buscador es un `<form method="get">` nativo. Se
evitó a propósito la primera versión, que tenía un `<form>` de búsqueda dentro
del `<form>` de selección: HTML inválido que los navegadores resuelven de formas
distintas.

La confirmación —el único POST— es un paso aparte, que además es exactamente lo
que pedía el documento: mostrar la cadena completa antes de confirmar.

### D23 · Dark mode por clase, con script bloqueante

`@custom-variant dark (&:where(.dark, .dark *))` en Tailwind v4, y un script
inline síncrono en el `<head>` que aplica la clase antes del primer pintado
leyendo `localStorage` y, si no hay preferencia guardada,
`prefers-color-scheme`. Sin eso hay un destello blanco al entrar en modo oscuro.

Los colores concretos viven en variables semánticas (`--surface-card`,
`--ink-muted`, …) expuestas como utilidades `@utility`. Los componentes usan
`bg-surface` / `text-ink-muted` y nunca un color crudo, así que agregar un tema
nuevo es cambiar un bloque de variables.

### D24 · El cliente de Supabase no entra en el bundle inicial

El cliente de Supabase no se usa en el navegador. `LiveResults` pide los
agregados mediante `server$`, por lo que el bundle de cliente no incorpora
GoTrue ni Realtime. Se verifica con `grep -rl GoTrueClient dist/build/`.

### D25 · Subida de imágenes desde el servidor

Las cookies de sesión son `httpOnly`, así que el cliente de browser no tiene
sesión y no puede subir a Storage con las credenciales del usuario. Las imágenes
viajan en el `multipart/form-data` de la action y se suben desde el servidor,
que sí tiene el JWT. La ruta `<user_id>/<uuid>.<ext>` es la que espera la policy
de `storage.objects`.

### D26 · Sin librería de toasts

Los errores se muestran inline, al lado de lo que falló, con `role="alert"`. Un
toast en una esquina obliga a mover la vista y desaparece antes de que termines
de leerlo. El componente `Alert` cubre los cuatro tonos que se usan.

---

## Alcance y deuda conocida

Cosas que siguen a medias a propósito, con su costo real:

1. **Los debates traen hasta 400 comentarios y muestran 20 por columna.** Con un
   debate muy activo hay que pasar a paginación por columna.
2. **El desglose de una encuesta por sub-comunidad se calcula al vuelo.** Con
   muchos votos conviene una vista materializada.
3. **La verificación telefónica y de identidad no existe.** Sólo está el campo
   `verification_level`.
4. **La visibilidad de membresía se administra comunidad por comunidad.** Falta
   el panel consolidado en `/perfil` documentado después de D52.
5. **`community_public_members` no tiene un índice dedicado para su cursor.**
   El índice de username alcanza al volumen actual, pero falta medirlo a escala.
6. **Quedan dependencias PostCSS sin uso.** D39 enumera cuáles se pueden retirar.

### Países transcontinentales

Asignaciones que alguien puede discutir, tomadas y sostenidas:
Rusia → Europa; Turquía, Chipre, Georgia, Armenia, Azerbaiyán y Kazajistán →
Asia. Los 195 países son los 193 miembros de la ONU más Ciudad del Vaticano y
Palestina. Las banderas se derivan del código ISO 3166-1 alpha-2 mediante
indicadores regionales (`scripts/gen-geo.mjs`), no se pegaron a mano.

---

# Iteración 2

## Seed y entorno

### D27 · Casts explícitos en todos los `VALUES` del seed

Cuando una columna de un `VALUES` es `NULL` en **todas** las filas, PostgreSQL
la infiere como `text`. En el bloque de los 195 países, `lat` y `lng` son NULL
en todas, y el `INSERT` fallaba con:

```
ERROR: 42804: column "lat" is of type double precision but expression is of type text
```

Los cinco bloques de `communities` ahora castean explícitamente
(`i.lat::double precision`, `i.description::text`). El cast está también en
`scripts/gen-geo.mjs`, para que regenerar el seed no reintroduzca el bug.

No aplica al resto de los `VALUES` del seed —todos tienen al menos una fila con
valor no nulo por columna— ni a las migraciones: `0005_storage.sql` usa un
`INSERT ... VALUES` directo, donde Postgres coacciona contra el tipo de la
columna destino y no infiere nada.

### D28 · `pgcrypto` en el esquema `extensions`

En Supabase (cloud y local) pgcrypto vive en `extensions`, que no está en el
`search_path` del SQL Editor: `crypt()` y `gen_salt()` fallaban con "function
does not exist". El seed las califica (`extensions.crypt`) y la migración 0001
crea la extensión ahí también en un Postgres pelado, para que el mismo archivo
funcione en los tres entornos.

`gen_random_uuid()`, que se usa como DEFAULT en casi todas las tablas, es de
core desde PostgreSQL 13 y no depende de esta extensión.

### D29 · Los usuarios demo se insertan con cadenas vacías, nunca NULL

GoTrue mapea las columnas de token de `auth.users` (`confirmation_token`,
`recovery_token`, `email_change`, …) a `string` de Go y no a `sql.NullString`.
Un NULL rompe el escaneo de la fila entera y el login devuelve **HTTP 500
`unexpected_failure` / "Database error querying schema"**, no un error de
credenciales. El síntoma no apunta a su causa, que es lo que hace caro este bug.

El seed inserta `''` en las nueve columnas de token y `false` en `is_sso_user` e
`is_anonymous`. Además hay un bloque `DO` de verificación que **recorre por
introspección** todas las columnas de texto y booleanas de `auth.users`: falla
duro en las que se sabe que rompen el login y avisa por `NOTICE` de las demás.
Se eligió introspección en vez de una lista fija porque el conjunto de columnas
cambia entre versiones de GoTrue, y una lista fija envejece en silencio.

---

## Creación de contenido y cuotas

### D30 · Cuota mensual por nivel geográfico en vez de permiso por rol

**Revierte la decisión original** de que sólo moderación pudiera crear
encuestas. Ahora cualquier residente crea encuestas, debates, reclamos y
proyectos en las comunidades donde vive, y lo que regula es una cuota mensual
por nivel:

| Nivel          | Encuestas | Debates | Proyectos | Reclamos |
| -------------- | --------- | ------- | --------- | -------- |
| 0 · Global     | 1         | 1       | 1         | 1        |
| 1 · Continente | 2         | 2       | 2         | 3        |
| 2 · País       | 3         | 3       | 3         | 5        |
| 3 · Provincia  | 5         | 5       | 5         | 8        |
| 4 · Ciudad     | 8         | 8       | 8         | 10       |

El principio es que **el costo de publicar escale con el alcance**: una encuesta
global la ven millones y equivocarse sale caro; una municipal es hiperlocal y de
bajo riesgo, y ahí la fricción tiene que ser mínima. El cuello de botella está
arriba, no abajo.

Los reclamos van más holgados en todos los niveles porque responden a hechos del
mundo real que nadie planifica: si a alguien se le inunda la calle tres veces en
un mes, el sistema no debería contestarle que agotó su cupo.

Los valores viven en la tabla `content_quotas` y no en constantes: son un
parámetro de política de producto y hay que poder ajustarlos sin desplegar.

### D31 · La cuota se aplica en un trigger, no en la action

Coherente con D6. `enforce_content_quota` corre `BEFORE INSERT` en las cuatro
tablas y rechaza con un mensaje identificable (`GEOUNITY_QUOTA_EXCEEDED`) que la
action traduce a español con la fecha de renovación. Una action se saltea
llamando a PostgREST con el mismo token; un trigger no.

Cuando `auth.uid()` es NULL —seed, `service_role`, tareas internas— la cuota no
se aplica: esas escrituras no vienen de la UI.

### D32 · Distinguir quién dio de baja el contenido, para devolver el cupo

La regla pedida tiene tres casos que terminaban todos en `status = 'removed'`:

- la bajó moderación → **devuelve** cupo (no es culpa del autor);
- la bajó el autor dentro de 24 h → **devuelve** (fue un error de tipeo);
- la bajó el autor pasadas 24 h → **no devuelve** (corta el ciclo
  publicar / borrar / republicar).

Para poder distinguirlos se agregaron `removed_by` y `removed_at` a las cuatro
tablas, selladas por el trigger `stamp_removal`. Las columnas son **inmutables
desde el cliente**: el trigger las sobrescribe siempre, incluso si el `UPDATE`
las trae. Sin eso, un autor podría declararse "bajado por moderación" y
recuperar cupo a voluntad.

### D33 · `quota_summary()` como única fuente de la UI

La misma función que consulta el trigger alimenta los contadores de la
interfaz. No hay una copia de la lógica en TypeScript, así que la UI no puede
decir "te quedan 3" mientras la base rechaza el insert.

El mes es calendario y no se acumula. `date_trunc('month', now())` usa la zona
de la sesión, que en Supabase es UTC: el corte es el día 1 a las 00:00 UTC para
todo el mundo. Es una simplificación consciente — alguien en UTC-3 ve renovarse
su cupo a las 21:00 del último día del mes.

### D34 · Confirmación previa en dos fases, sin JavaScript

Los cuatro formularios publican en dos pasos: el primer envío devuelve
`{ preview }` sin tocar la base, se muestra cómo va a quedar, y un segundo envío
con `confirm=si` publica. Todo con `globalAction$` y `<form>`, así que funciona
sin JavaScript.

La excepción es la foto de un reclamo: un `<input type="file">` no se puede
repoblar desde el servidor, así que la imagen se sube en la **primera** fase y
en la confirmación viaja sólo su URL. El costo es una imagen huérfana en Storage
si el usuario abandona en la pantalla de confirmación; el beneficio es que la
vista previa muestra la foto real. Desde 0013, `claim_uploads` registra esos
archivos y el cron diario elimina los que siguen sin vincularse después de 24 h.

### D35 · El "máximo de opciones" de una encuesta múltiple es texto, no esquema

La primera iteración sólo lo comunicaba en la descripción. La migración 0015
cerró esa deuda: agregó `polls.max_choices`, su restricción de rango y la
validación dentro de `prepare_poll_vote`. Un advisory lock serializa los votos
del mismo usuario y encuesta, por lo que dos inserts concurrentes tampoco
pueden superar el máximo. La action repite el chequeo sólo para devolver un
mensaje inmediato; PostgreSQL sigue siendo la autoridad.

---

## Identidad y layout

### D36 · Ultravioleta, con los tonos de relleno separados de los de texto

Violeta primario (`#7C3AED` claro / `#A78BFA` oscuro), ámbar como complementario
cálido y verde azulado para datos. Los neutros llevan tinte violeta (hue ~265)
en vez de ser grises puros, para que todo se sienta de la misma familia.

El hallazgo que ordenó la paleta: **los tonos 500 de ámbar y teal no sirven como
texto**. Sobre blanco dan 2.15:1 y 2.49:1, muy por debajo del 4.5:1 que pide AA.
Se resolvió separando los usos:

| Familia | Relleno | Texto sobre claro | Texto sobre oscuro |
| ------- | ------- | ----------------- | ------------------ |
| Violeta | 600     | 700 (7.1:1)       | 300                |
| Ámbar   | 500     | 700 (5.0:1)       | 400                |
| Teal    | 500     | 700 (5.5:1)       | 400                |

Los componentes no eligen: usan `text-brand`, `text-accent`, `text-data`, que
resuelven el tono correcto por tema. Se mantiene el sistema de D23.

Además, `warn` **no** es ámbar sino naranja (`#EA580C`), deliberadamente más
rojo: si la advertencia comparte color con el acento de los CTAs, deja de leerse
como advertencia. Y `success` es esmeralda, no teal, para que "salió bien" y
"esto es un dato" no se confundan.

Para daltonismo, los votos ▲▼ y los estados activos se distinguen además del
color por forma (flecha llena vs. vacía), peso tipográfico y el signo `+`/`−`
del puntaje.

### D37 · Escala de acento por nivel geográfico

Cada nivel tiene su matiz dentro de la familia violeta, expuesto como
`--level-0` … `--level-5`: global más profundo, ciudad más claro. En modo oscuro
la escala se **invierte**, porque un violeta profundo sobre fondo noche no se
distingue del fondo. Se usa en puntos de 6 px en la grilla de cuotas, el
selector de nivel y el buscador — es una ayuda de orientación, no una decoración.

### D38 · Tres anchos semánticos

El problema no era el ancho global sino que todo usaba el mismo contenedor:

- `container-reading` (42rem) — formularios de una columna, auth, onboarding, y
  la prosa larga vía la utilidad `measure`.
- `container-content` (80rem) — listados, perfil, tabs, detalles.
- `container-full` (100%) — **la grilla de debates**, que es donde más se sufría:
  su razón de ser es mostrar muchas columnas a la vez.

Dentro de una página `container-full`, la prosa del debate sigue limitada a
`measure`: leer un párrafo de 2500 px de ancho es incómodo aunque haya lugar.

Los listados pasaron a grilla responsive (1 / 2 / 3 columnas), que es lo que
justifica subir el contenedor a 80rem.

### D39 · Sin `postcss.config.js`

El proyecto tenía uno con `autoprefixer` + `postcss-preset-env`. Tailwind v4
prefija y resuelve anidamiento con Lightning CSS por su cuenta: medido, el
archivo con PostCSS pesaba **58.110 bytes contra 46.117 sin él** (26% más) con
salida equivalente. Se eliminó. Las dependencias `autoprefixer`, `postcss`,
`postcss-preset-env` y `cssnano` quedaron en `package.json` sin uso y se pueden
sacar en la próxima limpieza.

---

## Correcciones y deuda

### D40 · El canal de Realtime nunca se daba de baja

> **Estado actual:** el canal fue eliminado por D61. Esta corrección queda como
> registro del problema que existió mientras se usó Realtime.

`cleanup()` se estaba registrando **dentro** del `.then()` del `import()`
dinámico, es decir después de que la tarea ya había retornado. Qwik recolecta
los destructores mientras la tarea corre y descarta los que llegan más tarde, así
que cada visita a una encuesta dejaba un WebSocket abierto.

Ahora el destructor se registra de forma síncrona y da de baja el canal a través
de una variable que el `.then()` completa después.

### D41 · El cliente de browser no puede leer datos, por tipo

> **Estado actual:** ya no hay cliente Supabase en el browser. D61 conserva las
> consultas identificadas dentro de `server$` y elimina la señal anónima.

Sobre la contradicción señalada entre D24/D5 y D25: **los agregados nunca se
piden como `anon`**. `fetchResults` es un `server$`, corre en el servidor con las
cookies del usuario, y por eso `auth.uid()` está poblado y
`can_see_poll_results()` sabe que la persona votó. La suscripción de Realtime sí
es anónima, pero sólo escucha `poll_vote_events`, cuya policy es `using (true)`
justamente para eso.

Como el error era fácil de cometer en un refactor futuro, se cerró la puerta con
el tipo: `getRealtimeClient()` devuelve
`Pick<DB, "channel" | "removeChannel" | "removeAllChannels">`. `.from()`,
`.rpc()` y `.auth` no existen en ese tipo, así que pedir datos identificados
desde el browser ya no compila.

### D42 · Umbral de 5 votos en el desglose por sub-comunidad

`poll_results_by_child` omite las sub-comunidades con menos de 5 votos. Con dos
votantes, un desglose "1 y 1" permite deducir el voto de cada uno a cualquiera
que sepa quién vive ahí. El umbral vive en la función y no en la UI: es una
promesa del producto, y una promesa que sólo cumple la capa de presentación no
es una promesa.

### D43 · Resuelta · el timestamp de `poll_vote_events` filtraba metadatos

La tabla-señal de Realtime no tiene `user_id` ni `option_id`, pero **sí tiene el
momento exacto de cada voto**. En una encuesta de barrio con pocos votantes, ese
timestamp cruzado con actividad visible (un comentario, una conexión) permite
inferir quién votó cuándo — no qué votó, pero sí que votó y en qué instante.

La migración 0030 la resolvió eliminando la tabla, su trigger y su publicación
Realtime. D61 documenta por qué se eligió polling autorizado en vez de limitar
o redondear eventos que igual llegarían en el instante del voto.

### D44 · Tests de RLS: escritos y, desde 2026-08-11, ejecutados

`supabase/tests/rls_checks.sql` corre dentro de una transacción que termina en
`ROLLBACK` y verifica, con aserciones que fallan ruidosamente:

1. `is_member` en positivo y en negativo;
2. **las pruebas negativas de escritura** — que un no residente no pueda
   comentar, reclamar, publicar en nombre de otro ni darse el rol de admin;
3. el secreto del voto (cada uno ve sólo el suyo; `anon` no ve ninguno);
4. **la paridad entre las funciones `security definer` y las policies** — que
   `poll_feed` devuelva exactamente lo que `anon` puede leer de `polls`, y que
   `poll_stats.can_see` no diverja de si `poll_results` devuelve filas. Es el
   punto más frágil del sistema: la función replica la regla de visibilidad a
   mano y se desincroniza en silencio cuando cambia la policy;
5. el umbral de anonimato del desglose;
6. que el trigger de cuota rechace el insert que excede el tope, y que
   moderación no tenga tope.

**Actualización.** La suite corrió entera por primera vez contra PostgreSQL 17
con migraciones y seed aplicados: todas las aserciones quedaron en verde. La
corrida dejó
dos hallazgos que dos años de lectura no habían dado:

1. `notify_content_status` fallaba con `record "new" has no field "question"`
   sobre cualquier tabla que no fuera `polls`. Moderación no podía bajar ni
   restaurar un reclamo, un debate o un proyecto. Corregido en 0027.
2. `pg_temp.as_user` buscaba el perfil bajo el rol activo, y 0012 había
   endurecido `profiles_select_all`. Llamado desde una sesión `anon` no
   encontraba a nadie y culpaba al seed. La suite había envejecido mal
   justamente por no ejecutarse.

Vale la pena repetir por qué importa: con los privilegios de tabla mal
replicados, varias aserciones **pasaban en falso** —el escritorio quedaba
bloqueado por falta de permiso, no por la policy—. Un test de RLS sólo dice
algo si el entorno concede lo mismo que concede Supabase.

**Última corrida, 2026-08-11.** Se repitió contra las migraciones 0001–0031 y
el seed completo. Detectó que el CLI 2.113 ya no heredaba permisos DML sobre las
tablas creadas como `postgres`; 0031 los declara explícitamente sin abrir las
tres tablas privadas de IA. La suite volvió a pasar completa.

### D45 · Las claves de render se verifican con un script, no a ojo

Qwik trata una `key` falsy (`""`, `0`) como "sin clave": en vez de reutilizar el
nodo al re-renderizar, agrega uno nuevo. El síntoma es una lista que se duplica
sola, y **no lo detectan ni el typecheck ni ESLint**, porque el tipo es correcto.

Pasó cuatro veces: los tabs de comunidad (`{ key: "", label: "Info" }`), las
opciones del formulario de encuesta y los skeletons (`key={i}` con i base cero),
y los presets de fecha de cierre (`{ key: "", label: "Sin límite" }`). Las tres
primeras las arreglé revisando a mano y aun así reintroduje la cuarta.

`scripts/check-keys.mjs` marca tres patrones: índices de base cero (`key={i}`),
propiedades usadas como clave que en algún objeto literal valen `""` o `0`, y
variables usadas como clave inicializadas vacías. Corre dentro de `pnpm lint`.

La regla de fondo: **separar la clave de render del valor de dominio**. Cuando
un item necesita un valor que puede ser vacío —el segmento de URL de la pestaña
raíz, el "sin límite" que no tiene días— van dos campos, `id` y el valor.

### D46 · Los campos que dependen del estado tienen que ser controlados

En el formulario de encuesta, las opciones se prellenaban con "Sí"/"No" al
elegir tipo binario mediante `value={type === "binary" ? … : undefined}`. Al
volver a otro tipo, `value={undefined}` **no limpia** un input que ya tiene
contenido en el DOM, así que "Sí" y "No" quedaban pegados en una encuesta de
respuesta única.

Ahora las etiquetas son un `useSignal<string[]>` y el cambio de tipo reescribe la
lista de forma deliberada. Se distingue si "Sí"/"No" los puso el formulario o la
persona (`binaryPrefilled`): sólo se limpian los que no tipeó nadie.

### D47 · "Ver resultados al cerrar" exige fecha de cierre

`results_visibility = 'after_close'` con `closes_at is null` produce una encuesta
cuyos resultados **no se pueden ver nunca**: `can_see_poll_results` exige
`status = 'closed'` o una fecha vencida, y sin fecha lo primero sólo ocurre si
alguien cierra la encuesta a mano — algo para lo que hoy no hay interfaz.

Se consideró la alternativa de permitir la combinación y construir el botón
"cerrar encuesta", que la volvería coherente y habilita un caso de uso legítimo
(una consulta abierta que el autor cierra cuando juntó suficiente). Se descartó
para esta iteración: es una funcionalidad aparte, y mientras no exista la
combinación es una trampa que publica contenido ilegible.

Prohibido en tres capas, con el mismo criterio de siempre:

- **Base** — `CHECK (results_visibility <> 'after_close' or closes_at is not null)`.
  La migración normaliza a `after_vote` las filas que ya estuvieran en ese estado
  antes de imponer la restricción, e informa cuántas tocó.
- **Action** — mensaje explícito en español, para no depender del texto crudo del
  CHECK.
- **Formulario** — la opción aparece inhabilitada y explicada mientras no haya
  fecha; si estaba elegida y se pasa a "Sin límite", vuelve sola al default.

Si algún día se agrega "cerrar encuesta" a la UI, la restricción se puede
levantar sin tocar nada más.

---

# Iteración 3

## Identidad pública opcional

### D48 · Miembros visibles por defecto, voto secreto por defecto — a propósito distintos

Dos features nuevas con la misma forma —"cada quien decide si se muestra o se
esconde"— pero con **defaults opuestos**, y no por descuido:

- **Listado de miembros** (`/c/[slug]/miembros`): visible por defecto. Ser
  parte de un lugar no es sensible del mismo modo que una postura de voto, y el
  primer verbo de la visión del producto es "conocerse": una lista de miembros
  vacía porque todos partieron de "oculto" no serviría al propósito.
- **Voto público en encuestas**: secreto por defecto (mantiene D3 intacto).
  Mostrar el nombre junto a una opción es un gesto que tiene que pedirse
  explícitamente, nunca asumirse.

Ambas usan el mismo patrón de esquema: **sin fila = el default**, y la tabla
sólo guarda las excepciones. Para membresía, eso significa que la enorme
mayoría de usuarios (que nunca tocan el toggle) no generan ninguna fila. Para
el voto no aplica el mismo ahorro —cada voto es una fila igual, ya exista antes
de esta migración— así que ahí es una columna (`is_anonymous`) y no una tabla
aparte.

### D49 · La preferencia de membresía es por comunidad, no global

"Aparecer públicamente en **esta** comunidad" se tomó literal. La tabla
`community_visibility` es `(user_id, community_id) → is_anonymous`, así que
alguien puede mostrarse en su ciudad y pedir anonimato a nivel país o global —
tiene sentido: cuanto más grande la audiencia, más ganas de pasar
desapercibido, el mismo principio que ya regía las cuotas (D30). El seed
demuestra el caso: Diego es visible en Mendoza pero anónimo en Argentina.

La alternativa —un único toggle global "mostrame siempre" o "escondeme
siempre"— era más simple de construir pero no permitía ese matiz, y el pedido
decía explícitamente "en esta comunidad".

### D50 · La tabla de preferencias nunca se lee directo, ni con RLS

`community_visibility` tiene RLS que sólo deja leer la fila propia
(`user_id = auth.uid()`). Ninguna policy adicional expone las de otros, ni
siquiera filtrando por `is_anonymous = false`: **una fila con
`is_anonymous = true` revela, por su sola existencia, que ese usuario es
miembro de esa comunidad** — que es exactamente lo que alguien que pidió
anonimato no quiere que se sepa. Publicar la mitad "segura" de la tabla no
existe acá, porque la fila misma es el dato sensible, no sólo su contenido.

Los listados públicos (`community_public_members`, que no expone `user_id`
para nadie anónimo — no filtra sobre la tabla cruda, la excluye de la
proyección) y los conteos (`community_member_visibility_counts`) son
`security definer` y hacen el filtro a mano, mismo patrón que D9. `poll_votes`
sigue exactamente igual: no se le agregó ninguna policy nueva. Los votos
públicos se leen sólo a través de `poll_option_voters`
(`security definer`), nunca por selección directa de la tabla — verificado en
`rls_checks.sql` §8.4: `anon` obtiene 0 filas de `poll_votes` aunque existan
votos marcados públicos.

### D51 · `poll_votes.is_anonymous` no necesita umbral de k-anonimato

A diferencia del desglose por sub-comunidad (D42, umbral de 5 votos), la lista
de votantes públicos no tiene un piso mínimo. La diferencia es el origen del
riesgo: en el desglose, el peligro era **cruzar** dos datos que el usuario no
eligió correlacionar (dónde vive + qué votó). Acá, quien aparece con nombre lo
decidió activamente al votar — no hay nada que deducir por cruce, porque no hay
secreto que proteger de ese voto puntual. El conteo de anónimos, en paralelo,
es un agregado puro que no linkea con ningún otro dato.

### D52 · La preferencia de voto es inmutable, igual que el voto

No hay policy de `UPDATE` sobre `poll_votes` (ya era así desde el MVP: "no se
puede cambiar el voto"). Extender esa regla a `is_anonymous` fue automático y
no una decisión nueva, pero vale remarcarla: sin esto, alguien podría votar en
secreto, esperar a ver que gana su opción, y recién ahí revelarse — o al revés,
mostrarse, y luego esconderse si el resultado incomoda. La elección se congela
en el mismo instante que el voto.

## Deuda de esta iteración

- El toggle de visibilidad de membresía vive sólo en la página de Miembros de
  cada comunidad. No hay un panel centralizado en `/perfil` que muestre "así
  aparecés en cada una de tus 5 comunidades" — sería el complemento natural de
  la grilla de cuotas que ya vive ahí. Queda para la próxima.
- `community_public_members` pagina con cursor por `username`, sin índice
  dedicado (usa el índice único de `profiles.username`, que alcanza para el
  volumen actual). Con una comunidad de cientos de miles, convendría revisar el
  plan de ejecución del `JOIN` contra `communities` por prefijo de `path`.
- Los tests de RLS para esta iteración están en `rls_checks.sql` §8, con el
  mismo estado que el resto de la suite: **escritos, no ejecutados** en esta
  máquina (sin Docker/psql/CLI de Supabase). Cubren la fuga más peligrosa (leer
  la tabla cruda de preferencias) y el aislamiento por comunidad, pero no
  reemplazan una corrida real.

### D53 · Los cambios a `seed.sql` no llegan solos a una base ya sembrada

Encontrado al depurar por qué `rls_checks.sql` §8.1 y §8.4 fallaban después de
aplicar 0007→0011 en una base cloud que ya tenía el seed corrido de una
iteración anterior.

`seed.sql` sólo se ejecuta completo en un `supabase db reset`. Cuando en cambio
se aplican migraciones sueltas sobre una base que ya tiene datos —el flujo que
de hecho se usa contra Supabase cloud, migración por migración en el SQL
Editor—, cualquier `INSERT` nuevo que se agregue a `seed.sql` (no a una
migración) **no se ejecuta nunca** contra esa base. Y si el `INSERT` toca una
tabla con datos preexistentes bajo un `on conflict ... do nothing`, el
problema es silencioso: no hay error, simplemente la fila nueva no se escribe.

Pasó dos veces en este proyecto, con el mismo patrón de fondo:

- **D9 (coordenadas de países)**: se resolvió con una migración de backfill
  real (0009), porque esos datos son de esquema — le sirven a cualquier
  entorno, producción incluida.
- **Esta vez (visibilidad demo + voto público demo)**: los datos son
  exclusivamente de los usuarios de prueba (`*@agorbis.test`), que sólo
  existen en entornos de desarrollo. No corresponden a una migración de
  esquema — van en `supabase/seed_resync_0011.sql`, un script aparte,
  explícitamente fuera de `supabase/migrations/`, para no confundir "cambió el
  esquema" con "cambió el contenido de prueba".

La regla para la próxima vez que se toque contenido demo de `seed.sql`: si el
cambio importa para una base que ya corrió el seed antes, escribir también el
`UPDATE`/`INSERT` idempotente correspondiente como script aparte — no asumir
que un `supabase db reset` va a ser la forma en que se aplica.

### D54 · Una residencia principal, varias pertenencias automáticas

El producto pide **una sola residencia principal**, idealmente la ciudad,
municipio o nivel más específico disponible donde la persona vive
habitualmente. No usa “estoy en”: esa frase describe presencia momentánea y se
confundiría con geolocalización, turismo o un lugar de paso.

Esa única declaración no limita al usuario a una comunidad. Agorbis deriva
automáticamente toda su cadena: quien declara Mar del Plata también forma parte
de Buenos Aires, Argentina, América del Sur y Tierra, y puede participar en
todos esos niveles. Las comunidades fuera de esa rama se pueden seguir y leer,
pero no votar ni comentar.

Permitir dos residencias no relacionadas desde el inicio haría ambiguo quién
puede votar y facilitaría elegir territorios por conveniencia. Si más adelante
se necesitan vínculos de trabajo, estudio, propiedad o segunda residencia,
deben modelarse como vínculos distintos —con reglas y, si corresponde,
verificación propia—, no como copias de la residencia principal. El período de
30 días entre cambios sigue protegiendo la participación territorial.

### D55 · Una elección reciente se puede corregir durante 24 horas

El cooldown de 30 días no debe convertir un error de selección en un bloqueo
de un mes. Durante las primeras 24 horas se permite corregir la residencia si
la persona todavía no votó, comentó, publicó, apoyó ni comprometió aportes desde
esa elección. La ventana conserva el timestamp original: corregir no abre otras
24 horas y no permite saltar indefinidamente entre territorios.

La primera participación o el vencimiento de esa ventana vuelven definitiva la
residencia y restauran el cooldown normal. La misma función SQL decide el
permiso en el trigger y lo informa a la UI, para que el mensaje nunca contradiga
lo que realmente autoriza la base.

### D56 · El idioma de interfaz no es el idioma del contenido ciudadano

La interfaz se negocia y persiste por visitante, pero títulos, preguntas,
opciones, comentarios y respuestas se conservan exactamente como fueron
escritos. Una conversación puede mezclar idiomas. Agorbis no traduce ni
sobrescribe esas voces: sólo localiza navegación, formularios, estados, errores,
formatos y metadata. Al agregar un idioma, se incorpora uno por vez con revisión
lingüística; el orden propuesto vive en `docs/INTERNACIONALIZACION.md`.

### D57 · El resumen de IA es un artefacto derivado, exacto y server-only

Cada síntesis se identifica por contenido, locale de interfaz, hash de las
fuentes y versión de prompt. No hay fallback entre idiomas ni se muestra una
versión cuyo hash dejó de coincidir después de una edición o moderación. La
fuente se reúne con la sesión sujeta a RLS y la cache exacta se lee después con
`service_role`; el navegador no puede enumerar versiones históricas ni escribir
resultados. La primera versión de encuestas nunca consulta votos o agregados.
La generación es manual, autenticada, deduplicada con leases y limitada por
usuario para controlar costo.

## Escalamiento por silencio

### D58 · El silencio institucional escala solo, y no lo decide nadie

Un reclamo sin respuesta no se queda esperando en su comunidad. Cada nivel tiene
una ventana de respuesta (`claim_response_windows`) que arranca al publicarse.
Si la ventana vence sin que ninguna institución se haya hecho cargo, el reclamo
pasa a mostrarse también en la comunidad padre, con la duración del silencio
como dato público.

El escalamiento **no es una acción de usuario**. No hay botón "elevar": lo
resuelve un cron sobre una condición verificable. Un botón sería una superficie
de brigading —el reclamo con más militancia sube, no el más ignorado— y además
convertiría el silencio en una acusación de alguien, cuando el punto es que sea
un hecho registrado por el sistema.

**El reloj lo detiene cualquier evento con institución, no una respuesta buena.**
Basta un `claim_events` con `organization_id`. Decir "recibido, en análisis"
tiene que ser barato: un municipio chico sin equipo digital no es lo mismo que
uno que elige no contestar, y la métrica no puede confundirlos. Lo que se mide
es acuse de recibo, no calidad ni resolución.

**Escalar exige silencio y apoyo, no sólo silencio.** Si bastara el vencimiento,
un barrio con 200 reclamos sin responder inundaría la provincia y destruiría la
señal que hace útil al nivel superior. El umbral se calcula sobre la población
de la comunidad (`claim_escalation_threshold`), no como número fijo: 20 vecinos
son mucho en un barrio y nada en una capital. El silencio decide si es justo
escalar; el apoyo decide si vale la pena.

**El reclamo no se muda: se muestra en dos lugares.** `escalated_to_community_id`
es un puntero de visibilidad, no un cambio de `community_id`. Mudarlo rompería
el listado territorial, la cuota ya consumida y la noción de que el reclamo
pertenece a donde ocurre el problema.

Un reclamo escala una sola vez por nivel y nunca por encima del país (nivel 2):
más arriba no hay institución con competencia para responderlo, así que subirlo
sería ruido con forma de denuncia.

## Presupuesto participativo

### D59 · Repartir una bolsa que ya existe no es lo mismo que juntar plata

Agorbis ya tenía la primitiva de crowdfunding: `project_pledges` es dinero
propio que alguien compromete a un proyecto que eligió. El presupuesto
participativo es la operación inversa —una partida que ya existe y que la
comunidad decide **cómo repartir**— y por eso es una tabla aparte y no un
estado más de `projects`. Las dos pueden convivir en el mismo proyecto: puede
recibir partida y además compromisos individuales.

**La v1 no mueve dinero, y es a propósito.** Se registra la partida, qué
proyectos entraron, cómo votó la gente, cuánto se asignó y qué se rindió. La
transferencia ocurre afuera. Integrar pagos implicaría KYC, antifraude y
custodia de fondos de terceros: es otro producto, con otro perfil legal, y
meterlo acá convertiría un registro público en una billetera. Lo que da valor
—que la decisión y la rendición sean públicas y verificables— no necesita que
la plata pase por la plataforma.

**Se vota repartiendo fichas, no eligiendo un proyecto.** Cada votante recibe
un número fijo de fichas y las distribuye entre los proyectos que quiera. Una
elección única sólo revela la primera preferencia y hace ganar siempre al
proyecto del barrio más poblado; el reparto revela intensidad y deja que un
proyecto chico con apoyo concentrado compita. El tope por proyecto evita que
una sola persona vuelque todo su peso en uno y convierta el reparto en una
elección única disfrazada.

**El padrón es más estricto que el de una encuesta.** Opinar con residencia
autodeclarada es aceptable (D54); repartir plata, no. Para votar un
presupuesto la residencia tiene que haber sido declarada **antes de que abriera
la votación**. La regla es verificable con datos que ya existen
(`residence_changed_at`) y cierra el caso obvio: mudarse a una comunidad para
votar su partida.

**Las fases se derivan de fechas, no de un estado que alguien mueve.** Igual
que `polls.closes_at`: cuatro timestamps definen admisión, evaluación,
votación y cierre. No hay máquina de estados que pueda quedar desincronizada
con el calendario, ni cron que tenga que correr para que la votación abra.

**El resultado es codicioso por orden de fichas, y salta lo que no entra.** Se
asigna en orden de votos hasta agotar la partida; si un proyecto no entra por
monto, se lo saltea y se sigue con el próximo. Repartir proporcionalmente
dejaría a todos con medio proyecto financiado, que en obra pública no sirve
para nada.

**La rendición es el espejo del reclamo (D58).** Un proyecto que recibió
partida y no publica en qué gastó dentro de su plazo queda marcado como
vencido, con los días a la vista. Misma idea: el silencio es un hecho público,
no una acusación.

Una comunidad sin partida no muestra la pestaña. Un presupuesto vacío en todas
las comunidades salvo las que tienen recursos convertiría la función en un
recordatorio de quién no los tiene.

## Contraste entre comunidades hermanas

### D60 · Comparar territorios sin construir una tabla de posiciones

La vista de contraste muestra cómo se parecen y en qué difieren las hijas
directas de una comunidad. El riesgo no es técnico —los datos ya existen— sino
de presentación: cualquier comparación entre lugares se lee como ranking, y un
ranking de barrios es una función distinta y peor que la que queremos.

**No hay puntaje agregado ni orden único.** Cada eje —coincidencia en
encuestas, perfil de reclamos, respuesta institucional— se muestra por
separado y nunca se combina en un número. Un índice compuesto obligaría a
elegir pesos, y esos pesos serían una opinión editorial disfrazada de dato.

**Todo lo que se compara está normalizado por población.** Contar reclamos en
crudo convierte "más grande" en "peor". Se muestran tasas por cada mil
miembros, y el conteo absoluto sólo como dato secundario.

**Más reclamos no es peor lugar, y la interfaz lo dice.** Un territorio con
muchos reclamos publicados suele ser el que está mejor organizado, no el que
está peor. Dejarlo implícito garantiza la lectura contraria, así que va escrito
al lado del dato.

**Coincidencia y diferencia se muestran juntas, siempre.** Mostrar sólo dónde
difieren fabrica conflicto; mostrar sólo dónde coinciden es propaganda. El
mismo panel abre con lo que se comparte y sigue con lo que separa.

**Se hereda el umbral de k-anonimato de D42, sin excepción.** Una hija con
menos de 5 votos en una encuesta no entra en el contraste, ni siquiera dentro
de un promedio: un agregado construido sobre celdas de dos personas sigue
permitiendo deducirlas. Por la misma razón, el contraste no se muestra si
quedan menos de dos hijas con datos suficientes — con una sola no hay nada que
contrastar y el panel se convertiría en una ficha señalando a un solo lugar.

**La divergencia se mide sobre la opción ganadora, no con una distancia
estadística.** "El apoyo va de 18% en un barrio a 74% en otro" se entiende sin
explicación; una distancia de variación total, no. La métrica que la gente no
puede verificar a ojo no sirve para una herramienta cívica.

## Privacidad y reproducibilidad

### D61 · Actualización periódica en vez de un evento público por voto

Redondear `poll_vote_events.created_at` no resolvía D43: aunque la fila dijera
"12:00", el WebSocket la entregaría a las 12:07:13 y revelaría el instante real
de actividad. Limitar a un evento cada N segundos conservaba el mismo problema
para el primer voto de cada ventana y seguía avisando sobre encuestas cuyos
resultados estaban reservados.

La migración 0030 elimina la tabla, el trigger y su publicación Realtime.
`LiveResults` consulta cada 30 segundos mediante `server$`; las ventanas se
alinean con el reloj y las pestañas ocultas no consultan. Al volver a ser visible
se refresca inmediatamente. Así sólo recibe agregados quien ya supera
`results_visibility`, y no queda un canal anónimo global de actividad.

El costo es explícito: la interfaz deja de prometer instantaneidad y puede tardar
hasta 30 segundos. El beneficio es que la privacidad no depende de ocultar dos
columnas mientras se publica el momento exacto de cada participación.

### D62 · Tipos Supabase generados, alias de dominio separados

`database.types.ts` ahora es la salida completa de `supabase gen types` contra
las migraciones aplicadas. Los alias que Postgres no puede inferir desde
restricciones `CHECK` —por ejemplo `PollType`, `ContentType` y `UserRole`— viven
en `database.types.helpers.ts`.

La separación evita volver a mantener a mano miles de líneas y permite ejecutar
`pnpm db.types` sin borrar tipos de producto. La primera generación encontró
27 divergencias reales en bordes RPC y un insert de `poll_votes` que omitía
`poll_type`; ahora se envía explícitamente aunque el trigger también lo selle.

### D63 · Seed compuesto y privilegios de tabla explícitos

Supabase CLI 2.113 dejó dos supuestos viejos a la vista:

1. `seed.sql` ya no admite el metacomando de psql `\ir`. El contenido editorial
   que debe reaplicarse después de crear usuarios y comunidades se declara como
   segundo elemento de `db.seed.sql_paths`; ambos archivos siguen siendo
   idempotentes.
2. Las migraciones locales se ejecutan como `postgres`, cuyo default ACL no
   concede DML a `anon` ni `authenticated`. La migración 0031 concede DML sólo
   sobre tablas con RLS y mantiene revocados los privilegios directos de las
   tres tablas privadas de generación de IA. `service_role` recibe los permisos
   que necesitan cron, Storage y cache.

`pnpm db.test` usa psql cuando está instalado y, si no, el psql del contenedor
local. La suite verifica que los roles tengan privilegios suficientes para que
sea RLS —y no un bloqueo accidental anterior— quien decida cada operación.

### D64 · CSP estricta con nonce por respuesta

Todo el sitio emite cabeceras de seguridad desde `src/routes/plugin@cabeceras.ts`.
Antes no emitía ninguna: la app se podía embeber en un `<iframe>` ajeno —que en
una plataforma donde se vota y se apoyan reclamos es clickjacking sobre las dos
acciones que importan— y cada enlace saliente se llevaba la URL completa de
origen en el `Referer`, incluido el id del reclamo que se estaba leyendo.

Qwik Router 2 expone el canal SSR `sharedMap['@nonce']`: el plugin crea un valor
criptográficamente aleatorio por respuesta y el renderer lo copia a sus scripts
internos. `root.tsx` usa el mismo valor para el bootstrap de tema. En preview y
producción la política puede entonces declarar `script-src 'self'
'nonce-…' 'strict-dynamic'` y `script-src-attr 'none'`; un script inline
inyectado sin ese nonce no corre. Desarrollo conserva `unsafe-inline` y
`unsafe-eval` exclusivamente para el cliente HMR de Vite.

`style-src` todavía permite estilos inline porque Qwik y varios componentes
emiten atributos `style`; retirarlo exige migrarlos antes a clases estáticas. El
resto de la política cierra por defecto conexiones, frames, objetos, formularios
y recursos que la aplicación no usa, y limita Supabase al origen configurado.

**El nombre del archivo es parte de la decisión.** Qwik Router ordena los
`plugin@*` por ruta alfabética, y `plugin@i18n.ts` puede cortar el request con
un `throw redirect(303, …)` al limpiar `?lang=`. Corriendo primero, hasta esa
redirección sale con cabeceras. `test-shared.mjs` afirma ese orden, porque es
un invariante que se rompe sin ruido con sólo renombrar un archivo.

Pendiente: eliminar `unsafe-inline` de `style-src` cuando ya no queden estilos
en atributos.

### D65 · Resuelta · los cursores de paginación desempatan con `id`

Los listados paginan por cursor sobre `created_at` (`.lt("created_at", cursor)`)
sin criterio de desempate. Si dos filas comparten el timestamp exacto justo en
el borde de una página, la siguiente consulta descarta todas las que tengan ese
valor, incluidas las que nunca se mostraron. Es improbable con `timestamptz` a
microsegundos, pero deja de serlo con contenido importado o sembrado en lote.

Resuelto con un cursor compuesto `(created_at, id)`, en `src/lib/cursor.ts`.
Se verificó contra una base real: con siete filas, cinco de ellas compartiendo
el `created_at` exacto, la paginación completa las devuelve todas una sola vez.
Antes, con dos filas por página, la tercera del instante repetido **no se
salteaba: desaparecía para siempre**.

`poll_feed` ya lo resolvía así desde la migración 0006 —compara
`(p.created_at, p.id) < (p_before_created, p_before_id)`— así que el criterio
no es nuevo en el proyecto: faltaba llevarlo a los cuatro listados que se arman
desde TypeScript. La URL usa los mismos nombres de parámetro que ya usaban las
encuestas (`antes` e `id`).

### D66 · Resuelta · cada columna de un debate trae sus propios comentarios

`debates/[id]` trae `COMMENT_FETCH_LIMIT` (400) comentarios del debate entero,
ordenados por puntaje, y recién después los reparte entre las columnas con un
tope de `PER_COLUMN` (20). Con pocas sub-comunidades alcanza de sobra. Con
muchas no: un país con 200 provincias necesitaría 4.000 comentarios para llenar
todas las columnas, así que las que no aportan comentarios muy votados se
quedan sin ninguno aunque tengan actividad. Es justo lo contrario de lo que la
función promete —ver el mismo problema desde cada lugar—, y el efecto es más
fuerte cuanto más chica es la comunidad.

Lo que se corrigió ahora es el mensaje, que era directamente falso: una columna
con cinco comentarios sin cargar decía "Nadie de tu comunidad escribió todavía.
Estrenala vos." y debajo "Mostrando los mejores 0 de 5". Ahora dice cuántos hay
y que no entraron en esta carga.

Resuelto con `debate_column_comments` (migración 0035), que aplica el tope por
columna con un `LATERAL`. La verificación 15 de `rls_checks.sql` lo comprueba
sobre datos reales: con cuatro sub-comunidades activas y un tope global de
cuatro comentarios, sólo dos columnas mostraban algo; con el tope por columna,
las cuatro. La misma prueba confirma que un comentario removido no vuelve por
la función nueva —cambia cuántas filas se traen, no quién puede verlas—.

Con eso desapareció también el caso que el mensaje corregido describía, así que
la rama que avisaba "esta columna tiene N comentarios que no entraron" se
eliminó: una columna vacía vuelve a significar una columna sin comentarios.

### D67 · Borrar la cuenta anonimiza lo publicado y elimina lo personal

La decisión ya estaba tomada en el esquema desde `0001_schema.sql`, y esta
tanda sólo le puso interfaz. Los `author_id` de `polls`, `debates`, `claims` y
`projects` son `on delete set null`; los `user_id` de votos, comentarios,
apoyos, aportes, follows y reportes son `on delete cascade`.

Es la separación correcta. Una encuesta en la que votaron cincuenta personas no
es sólo de quien la abrió: borrarla les saca a ellas su participación, deja
rondas de presupuesto sin los proyectos que ganaron y debates sin la
publicación que los inició. La identidad, en cambio, es de una sola persona y se
va entera —incluido el avatar, que se borra de Storage a mano porque no lo
alcanza ninguna cascada—.

Las fotos de un reclamo **no** se borran. Están en la carpeta del usuario por la
policy de subida, no porque le pertenezcan para siempre: son la evidencia del
problema que el reclamo denuncia, y el reclamo sobrevive. Borrarlas lo dejaría
en pie pero vacío.

La pantalla dice todo esto **antes** de pedir la confirmación, y la
confirmación es escribir el propio nombre de usuario: un botón de "sí" se toca
por inercia y esto no tiene vuelta atrás. Al lado va la descarga de datos, que
no necesita permisos especiales —RLS ya deja que cada perfil lea lo suyo— y que
incluye en el propio archivo qué se anonimiza y qué se borra.

Lo único que no puede hacerse con la sesión de la persona es `deleteUser`:
`auth.users` no es suya, así que esa llamada usa `service_role`.

### D68 · Recibo sin elección y tallies agregados, no boletas individuales

> **Reemplaza para producción** las partes de D3–D5, D42, D47–D52 y D59–D61
> que dependían de `poll_votes`, votos públicos, resultados durante la ronda,
> desglose territorial o repartos presupuestarios editables.

Guardar `user_id` y `option_id` en una misma fila no protege el secreto del
voto: RLS evita que otro navegador la lea, pero el controlador de la base sigue
teniendo el vínculo completo. Separarlos en dos tablas dentro de una única
transacción tampoco alcanza. PostgreSQL asigna el mismo `xmin` a las filas
creadas o modificadas por esa transacción; una constancia identificada y una
boleta supuestamente anónima se pueden volver a correlacionar por ese metadato.

La migración 0047 elimina las filas individuales de encuesta y presupuesto. En
cada emisión atómica conserva únicamente:

- una constancia `(poll_id, user_id)` o `(budget_id, user_id)`, sin opción,
  proyecto ni fichas, para impedir una segunda participación;
- un tally privado por cada opción o propuesta. La RPC actualiza **todas** sus
  filas en cada emisión: suma el valor elegido y `+0` al resto, además del mismo
  contador de participantes. Así `xmin` no distingue qué fila recibió valor;
- ninguna API para recuperar, editar o publicar la elección individual.

Opciones, tipo de encuesta y propuestas quedan congelados desde la primera
emisión. Locks transaccionales compartidos impiden que una mutación concurrente
cambie la forma del tally entre la validación y el incremento. Una encuesta
cerrada tampoco puede reabrirse: publicar, aceptar otra participación y volver
a publicar permitiría comparar dos agregados y aislar el voto nuevo.

Los resultados de encuestas se fuerzan a `after_close`, toda encuesta exige una
fecha de cierre y tanto encuestas como presupuesto necesitan al menos cinco
participantes. Antes de eso, `poll_results`, `poll_stats`, feeds, CSV y
`budget_results` no entregan conteos exactos. También desaparecen el voto
público identificado y los contrastes por sub-comunidad: ambos necesitan
conservar un vínculo que este modelo deliberadamente destruye.

La pertenencia aplica el mismo criterio conservador: sin preferencia guardada la
persona es anónima; aparecer es un opt-in por comunidad y revocable. El conteo
público de quienes eligieron mostrarse puede ser exacto. Para anónimos se
devuelve `0` si no hay, presencia sin cantidad (`-1`) entre uno y cuatro, y el
piso en bloques de cinco desde cinco.

Este diseño protege la elección frente a otros usuarios y evita una boleta
persistida atribuible. **No es anonimato criptográfico frente al controlador**:
quien opera PostgreSQL puede observar estados sucesivos, WAL, trazas o payloads
si los registra. El runbook prohíbe loguear payloads de las RPC de emisión y
restringe el acceso a base; una garantía más fuerte requeriría un protocolo
criptográfico separado, con infraestructura y auditoría propias.

### D69 · Un widget Turnstile en la app y un guard separado en Supabase

Turnstile tiene dos configuraciones independientes, pero el usuario sólo
ejecuta **A**. Agorbis consume ese token con Siteverify y valida `success`,
`action` y `hostname` antes de tocar Auth. Después, un adaptador estrecho
server-only usa `SUPABASE_SECRET_KEY` —una `sb_secret_...` moderna— y no envía
`captchaToken` a Supabase: A ya fue consumido y los clientes secret no pasan por
el CAPTCHA destinado a la API pública.

**B** existe únicamente en Supabase Bot and Abuse Protection. Su secret y su
site key no se distribuyen en Agorbis ni en su runtime, y el flujo normal nunca genera
un token B. Su única función es hacer fallar con `captcha_failed` las llamadas
directas a Auth que usen la publishable/anon key sin CAPTCHA. Esto mantiene
separadas la prueba humana que valida Agorbis y la barrera contra el bypass de
sus handlers.

No se agrega CAPTCHA al cambio de contraseña, enrollment TOTP ni borrado de
cuenta porque son superficies autenticadas que Supabase no somete a este gate y
sumarlo impondría fricción sin resolver un bypass público. Conservan
reauthenticación, límites autoritativos, auditoría y `aal2` donde corresponde.

El nombre de la variable también es deliberado: `SUPABASE_SECRET_KEY` distingue
la credencial moderna del rol PostgreSQL efectivo `service_role`. La JWT
`service_role` que se expuso durante la preparación se revoca antes del corte;
no se acepta conservarla por compatibilidad.

### D70 · Consentimiento internacional separado, sin retroactividad ficticia

Privacidad informa el tratamiento, pero no se usa su casilla de lectura como
consentimiento especial para transferir datos a destinos no adecuados. Agorbis
publica un Aviso de transferencias internacionales bilingüe con versión y hash
propios. Su casilla es destacada e independiente de edad, Privacidad, Términos
y Normas; negarse mantiene la lectura pública pero impide crear o conservar una
cuenta con la infraestructura actual.

La prueba durable vive separada en
`user_international_transfer_consents`: cuenta, versión y hash exactos, idioma,
origen y hora de base. No se planta por correo ni se hace backfill. Una sesión
que no tenga los tres documentos legales vigentes y el aviso internacional
vigente no puede participar. Cambiar destinatarios, categorías de datos,
finalidades, destinos, riesgos, salvaguardas o consecuencias exige versionar de
nuevo; `scripts/check-legal.mjs` ata ambos contenidos a sus inserts de
migración.

Hay un límite temporal que el producto no puede borrar con texto. El primer
request ya fue procesado por Cloudflare Workers antes de que la persona vea una casilla; el
acceso público, ingreso, recuperación, seguridad y ejercicio de derechos
también pueden ocurrir sin una aceptación comprobable. Por eso el consentimiento
sólo cubre transferencias de cuenta posteriores a la acción afirmativa. Para lo
anterior, `PUBLIC_TRANSFER_SAFEGUARDS{,_EN}` debe documentar un mecanismo
argentino real ya aplicable: cláusulas modelo AAIP efectivamente incorporadas,
aprobación documentada de AAIP o una excepción concreta del artículo 12. Un DPA
genérico y el propio consentimiento del alta no superan el preflight.

El widget A del registro se difiere hasta la casilla para que Cloudflare no
reciba sus señales antes de esa decisión. No se promete lo mismo para entregar
la página ni para ingreso/recuperación: esas superficies dependen expresamente
del mecanismo previo. Retirar el consentimiento inicia la baja porque
Cloudflare, Supabase y Resend son necesarios para mantener una cuenta; no se
presenta como opcional una arquitectura que no puede operar sin ellos.

### D71 · Cloudflare Workers reemplaza integralmente a Vercel

> **Reemplaza para Producción** la elección de adapter de D16 y toda referencia
> operativa posterior a Vercel como runtime, scheduler, CDN o destino de datos.

Agorbis usa un único Cloudflare Worker global con Static Assets. La topología
reproducible vive en `wrangler.jsonc`: cuenta Cloudflare exacta, dominios
custom `agorbis.com` y `www.agorbis.com`, URLs `workers.dev` y previews
deshabilitadas, binding `ASSETS` con `run_worker_first`, y cinco Cron Triggers.
El build genera `dist/_worker.js` y el bundle SSR hermano `server/`.
`wrangler.closed.jsonc` debe ser una copia exacta salvo modo `closed` y cero
crons: permite validar DNS/TLS/secrets con un 503 y sirve como rollback del
primer corte antes de abrir el config canónico.

El handler `scheduled()` no llama un dominio público ni depende de un broker:
convierte cada expresión cron conocida en la ruta interna correspondiente y
despacha una `Request` sintética al mismo handler Qwik con
`Authorization: Bearer <CRON_SECRET>`. Un cron desconocido, un secret ausente o
una respuesta no exitosa falla cerrado. Por eso el Worker necesita los tres
secretos server-only `CRON_SECRET`, `SUPABASE_SECRET_KEY` y
`TURNSTILE_SECRET`.

Los invocation logs de plataforma quedan deshabilitados para no capturar URLs
con códigos de Auth; sólo permanecen logs estructurados y saneados de la app.
El build reemplaza, mediante firmas exactas de la dependencia pineada, tres logs
internos de Qwik que podían incluir URL, hash o `Error`; cualquier cambio de
firma bloquea el artefacto.
Las trazas están deshabilitadas. `sitemap.xml` y `404.html` se excluyen de
Static Assets para que las resuelva la aplicación. El preflight inspecciona la
configuración, `dist/` y `server/`, rechaza secretos embebidos y exige el plan
Workers pago antes del corte.

### D72 · Política excepcional de lanzamiento interactivo con aceptación explícita de riesgo

**Fecha de adopción:** 29 de agosto de 2026. **Responsable:** Sebastian
Cardoso Castillo. **Estado:** adoptada; el mecanismo excepcional incluye
dry-run, cutover y recovery CLOSED versionados. Ninguno autoriza por sí solo un
deployment: la apertura requiere que todos sus bindings y gates coincidan y la
confirmación literal final del responsable. El HEAD auditado al adoptar esta
decisión es
`e199618994411630e25eea1c05cb6b9edbd75e14`; no es por sí mismo un release
autorizado.

El objetivo empresarial es poder preparar un lanzamiento interactivo temprano
sin ocultar los riesgos regulatorios, contractuales y operativos que el camino
normal trata como bloqueos absolutos. La excepción cambia la disposición de
riesgos elegibles, no los hechos observados: un `FAIL`, `BLOCKED_EXTERNAL`,
`not_verified`, `pending` o `draft_not_applied` conserva ese estado y nunca se
reescribe como `PASS`.

#### Dos políticas que coexisten

- **Normal:** continúa siendo la política predeterminada. Todos los gates de A
  deben tener evidencia suficiente y terminar en `PASS`. El
  `release:open:dry-run` actual permanece fail-closed y no acepta waivers.
- **Excepcional:** empieza exclusivamente con
  `pnpm run release:open:exceptional:dry-run --request <ruta-absoluta.json>`,
  con un request que nombre el HEAD exacto y acepte cada riesgo elegible por
  separado. Sólo un acta e issuance válidos habilitan solicitar después el
  cutover exacto; no existe `--waive-all`, una casilla general, herencia entre
  releases ni aceptación por categoría.

El dry-run evalúa, valida la solicitud, congela el artifact y produce evidencia
local sin mutar Producción. No despliega, aplica migraciones, habilita altas o
crons, ni modifica Cloudflare, Supabase Cloud o DNS. La existencia del cutover
versionado tampoco constituye autorización: exige la frase literal final para
el HEAD y actHash exactos inmediatamente antes de mutar.

Wrangler sólo puede validar durante el dry-run el upload versionado y la
configuración congelada de cinco crons, ambos con `--dry-run`. El env file
congelado debe ser regular, no ser un symlink y contener exactamente cero
bytes. Su selección explícita evita que Wrangler cargue automáticamente `.env`,
`.env.local` u otro `.env*`; el runner tampoco incorpora Worker Secrets al
entorno de esos pasos.

Antes del primer subproceso local, el runner valida el contrato versionado
`agorbis-exceptional-release-scripts/v2`, SHA-256
`a14e7c781e8d9c5883087f0ae7c4c7b3638007138096e3f303ad78fc9b9b9a2f`, para
los scripts de `package.json` usados directa o transitivamente por la Fase K y
el build. `cloudflare-build` vuelve a validarlo inmediatamente antes de
`pnpm build`. Una diferencia bloquea antes de ejecutar el subproceso afectado;
no se interpreta como riesgo aceptable.

Con el contrato válido, la fase local intenta sus diez validaciones exactas:
`pnpm lint`, `pnpm build.types`, `pnpm audit --audit-level=low`,
`pnpm db.test`, `pnpm test.civic`, `pnpm test.components`, `pnpm test.e2e`,
`pnpm test.release-open`, `pnpm test.preflight` y
`node scripts/test-cloudflare-public-build-environment.mjs`. Acumula y reporta
todos los fallos en vez de detenerse en el primero. En el smoke cerrado, la
sonda `POST /registro/` sólo se envía después de que las comprobaciones previas
GET/HEAD acreditan el perfil 503 fail-closed; si esa auditoría previa falla, el
POST se omite.

La primera política estructurada adoptada es
`D72/2026-08-29/v1`, con SHA-256
`d3749025a53a56b8ccf01e274b627ad30837dd73a198271f102c9ab16377ab5e`.
Su `authorizedRiskOwner` canónico es exactamente
`Sebastian Cardoso Castillo`; otro nombre bloquea el request y exige una política
versionada nueva.
El hash está pineado por tests: cualquier cambio de definición exige una nueva
versión y una decisión documental correlativa.

La preparación versionada de los avisos legales `2026-08-29.1` y de la
migración separada 0060 actualiza la política activa a
`D72/2026-08-29/v2`, SHA-256
`c5116a8f4450b2340f5fd30d4c74ce4badb8ee5782c5cb9b1bc2b87ffe937ebd`.
`0060_activate_pending_external_evidence_legal_notices.sql` ya fue aplicada y
verificada en Producción. El ledger productivo exacto es `0001`–`0058` +
`0060`; `0059` permanece exclusivamente en `supabase/migration-drafts/` y
ausente de Producción. Esto permite que el checker/build exacto acredite el copy
legal activo, pero no agrega waivers, no cambia los siete riesgos elegibles ni
autoriza otra migración o un deployment.

La reconciliación de ACL de secuencias del release agrega únicamente
`0061_reconcile_sequence_acl_drift.sql` y actualiza la política activa a
`D72/2026-08-29/v3`, SHA-256
`db2e07f3620e4b350fdde2597cd6ed1763e2dfe92880e4b795ca77c4b42a9f6c`.
El gate no renunciable `database.expected-migrations-only` exige desde esta
versión el ledger exacto `0001`–`0058` + `0060` + `0061`, con 0059 aislada. El
baseline remoto verificado sigue terminando en 0060 hasta que 0061 reciba una
autorización de migración separada; esta decisión de policy no autoriza su
aplicación ni un deployment y conserva como historial inmutable la activación
legal v2 ligada a 0060.

La revisión del 7 de septiembre de 2026 UTC actualiza la política activa a
`D72/2026-09-07/v4`, SHA-256
`b6e422880131a6750f1dbe9c8d337a4e969dfa001d592e4e4b6ef92147d38e9b`,
con revisión obligatoria el 14 de septiembre de 2026 UTC. El responsable
solicitó priorizar la apertura con la constancia AAIP pendiente y completar
después los datos externos de ubicaciones, retención y salvaguardas, tras
explicarse las consecuencias de esos pendientes. Esta revisión conserva los
34 gates, los siete riesgos elegibles con sus resultados, consecuencias y
owner originales, y los 27 controles no renunciables. No convierte pendientes
en `PASS`, no afirma aprobación AAIP ni conformidad jurídica, y no registra
confirmaciones `/dev/tty` ni la emisión de un acta D72 válida. El request de
release debe generarse de nuevo sobre el commit final con
`deploymentAuthorized:false`; la autorización de despliegue comunicada en la
conversación no modifica ese campo ni demuestra resultados técnicos.

La revisión del 8 de septiembre de 2026 UTC actualiza la política a
`D72/2026-09-08/v5`, SHA-256
`44075953a9a5d3f190203f526c1023cc8a2ff33e231685f8c6bed9995099f25e`.
Reemplaza `configuration.google-auth-disabled` por
`configuration.auth-providers-aligned`, conservando sus condiciones
`NON_WAIVABLE_SECURITY_GATE` y `WAIVER_POLICY=NEVER`, los 34 gates, los siete
riesgos elegibles y la fecha de revisión del 14 de septiembre. El perfil abierto
previsto alinea Google habilitado y Facebook deshabilitado entre inventario,
artefacto, Worker y Supabase, con correo disponible. Los perfiles cerrado y de
recuperación mantienen ambos proveedores deshabilitados.

El nuevo control exige ubicaciones ES/EN respaldadas y cobertura versionada de
consentimiento para el proveedor habilitado. El aviso `2026-08-29.1` excluye
Google: ni activar un flag, ni completar destinos, ni cambiar sólo una versión
o hash resuelve esa contradicción. Facebook en pausa no agrega requisitos al
lanzamiento de Google. Esta revisión no acredita evidencia externa, ensayo
OAuth real, cambio legal aprobado ni autorización de despliegue.

Las versiones y hashes v1–v4 anteriores se conservan como historial. Requests,
actas, receipts y cápsulas de recuperación emitidos bajo ellas no se reescriben
ni se atribuyen a v5. El release futuro requiere evidencia y artefactos ligados
a su política y HEAD; para una recuperación histórica deben conservarse el
checkout y las herramientas correspondientes a la cápsula original.

#### Estados y preservación del resultado

Cada fila del acta conserva dimensiones distintas y no intercambiables:

1. `RAW_RESULT=PASS|FAIL`, resultado binario original del gate;
2. `EVIDENCE_STATUS=PASS|FAIL|BLOCKED_EXTERNAL|NOT_VERIFIED`, calidad y estado
   de la evidencia disponible;
3. `GATE_POLICY=GATE_REQUIRED|NON_WAIVABLE_SECURITY_GATE`, política aplicable;
4. `WAIVER_POLICY=OWNER_EXPLICIT|NEVER`, posibilidad de aceptar el riesgo;
5. `RELEASE_DISPOSITION=PASS|STOP|RISK_ACCEPTED_BY_OWNER`, decisión final para
   ese gate; y
6. `SEVERITY=HIGH|CRITICAL`, severidad declarada de sus consecuencias.

El valor enum `RISK_ACCEPTED_BY_OWNER` sólo puede aparecer en
`RELEASE_DISPOSITION`; no es un resultado técnico ni un estado de evidencia.
La confirmación booleana homónima exigida para el riesgo de backup se registra
como aceptación del owner dentro de esa fila, no como resultado. Permite
continuar una preparación excepcional frente a un `RAW_RESULT=FAIL` elegible,
pero la fila sigue mostrando ese `FAIL`, la evidencia faltante, las
consecuencias y el responsable.
`BLOCKED_EXTERNAL` sólo puede aparecer en `EVIDENCE_STATUS`: declara que falta
evidencia de un tercero, no que el riesgo sea automáticamente renunciable.
Todo `FAIL` no aceptado termina en `RELEASE_DISPOSITION=STOP`.

La política versionada contiene para cada ID `name`, `riskTypes`, `gatePolicy`,
`waiverPolicy`, `severity`, `dependsOnExternalEvidence`, `consequence`,
`reviewRequiredBy` y `sources`. El par `policyVersion`/`policyHash` del request y
del acta fija esa definición canónica: `acceptedConsequence` registra qué
consecuencia confirmó el owner, pero nunca reemplaza ni oculta `consequence`,
las fuentes o la clasificación de la política identificada por ese hash.

#### Riesgos elegibles para aceptación individual

La decisión empresarial permite `WAIVER_POLICY=OWNER_EXPLICIT` únicamente para
estos siete gates, cada uno en una fila propia y sin afirmar cumplimiento:

- `legal.aaip-registration-pending`: aprobación pendiente de la inscripción de
  la base ante AAIP;
- `privacy.retention-unreconciled`: retención declarada y tratamiento real aún
  no reconciliados;
- `privacy.provider-locations-unverified`: destinos de tratamiento de
  proveedores aún no acreditados;
- `privacy.provider-retention-unverified`: retención de proveedores aún no
  acreditada;
- `legal.transfer-safeguards-unverified`: salvaguardas argentinas de
  transferencias aún no acreditadas;
- `recovery.production-backup-not-verified`: primer backup productivo real y
  restore aún no verificados; y
- `legal.sensitive-consent-0059-omitted`: apertura sin aplicar el borrador
  `0059`, asumiendo expresamente la ausencia de su consentimiento específico,
  versionado y autoritativo para participación potencialmente sensible.

La lista es cerrada: un ID desconocido, un wildcard o un octavo gate bloquean.
Aceptar ubicaciones de proveedores no acepta su retención; aceptar el backup no
afirma que Google Drive esté activo; aceptar textos de proveedor no acepta las
salvaguardas; aceptar AAIP pendiente no acepta retención; aceptar `0059`
omitida no acepta ninguna degradación de RLS, privacidad de boletas, Storage o
límites antiabuso.

#### AAIP pendiente y aprobada

La política versionada y ambos modos de release distinguen sin ambigüedad:

- `AAIP_DATABASE_REGISTRATION_STATUS=pending`: el registration ID debe estar
  ausente. No se afirma que la base esté inscripta; la comunicación pública
  sólo puede indicar que la inscripción está en trámite. La fila conserva
  `RAW_RESULT=FAIL`, `EVIDENCE_STATUS=BLOCKED_EXTERNAL` y
  `RELEASE_DISPOSITION=RISK_ACCEPTED_BY_OWNER`, y permanece visible en el acta.
- `AAIP_DATABASE_REGISTRATION_STATUS=approved`: vuelve a ser obligatorio el
  número real de la constancia aprobada del Paso 2. Vacíos, placeholders,
  estados de trámite y referencias `RL`, `EX`, `RE`, `PV` o `IF` no sirven como
  registration ID y deben bloquear.

El release normal exige `approved` e ID real. El excepcional puede conservar
`pending`, ID vacío y el riesgo individual visible; no acepta que se fuerce un
ID de trámite para satisfacer el gate.

#### Backup, Google Drive y 0059 durante la excepción

El estado honesto del primer backup se registra por gate, nunca globalmente:

```text
GATE_ID=recovery.production-backup-not-verified
PRODUCTION_BACKUP_STATUS=not_verified
RISK_ACCEPTED_BY_OWNER=true
RISK_OWNER=Sebastian Cardoso Castillo
```

El booleano `RISK_ACCEPTED_BY_OWNER=true` es la confirmación explícita del owner
para este gate; la fila además conserva `RAW_RESULT=FAIL`,
`EVIDENCE_STATUS=NOT_VERIFIED` y
`RELEASE_DISPOSITION=RISK_ACCEPTED_BY_OWNER`. Esto no prueba que exista un
backup. Google Drive se informa como subestado
`inactive`, sin OAuth, sincronización, upload, descarga ni restore acreditados;
no es un gate renunciable ni requiere una aceptación separada mientras siga
inactivo. Activarlo exigiría una política versionada nueva y, hasta entonces,
debe bloquear como configuración desconocida. Ni el riesgo aceptado del backup
ni ese subestado pueden satisfacer `recovery-inventory --require-ready` o
transformarse en `PASS`.

`0059_versioned_sensitive_participation_consent.sql` permanece en
`supabase/migration-drafts`, fuera del ledger ejecutable del release
`0001`–`0058` + `0060` + `0061` y del baseline productivo verificado
`0001`–`0058` + `0060`; está ausente de Producción y no se aplica.
Si una solicitud excepcional elige omitirla, el acta debe registrar
`SENSITIVE_PARTICIPATION_CONSENT_0059_STATUS=draft_not_applied` y aceptar
individualmente el riesgo para publicaciones cívicas, opiniones/debate,
apoyos/compromisos, reclamos/evidencia, votos de encuestas y presupuestos,
visibilidad de membresía y reportes/solicitudes. No se puede describir esa
opción como jurídicamente conforme. Aplicar `0059` sigue requiriendo otra
decisión, texto ES/EN aprobado, versión/hash, tests y autorización de migración.

#### Controles no renunciables

Los siguientes IDs tienen `GATE_POLICY=NON_WAIVABLE_SECURITY_GATE`,
`WAIVER_POLICY=NEVER` y deben terminar individualmente con
`EVIDENCE_STATUS=PASS`, `RAW_RESULT=PASS` y `RELEASE_DISPOSITION=PASS` reales:

- `source.git-head-clean-and-recoverable`: HEAD exacto, worktree limpio y fuente
  recuperable;
- `security.rls-enforced`: RLS y privilegios efectivos;
- `security.private-storage`: buckets privados y acceso mediante proxies;
- `security.worker-secrets-confidential`: ningún Worker Secret en bundle, logs
  o acta;
- `security.auth-functional` y `operations.smtp-functional`: Auth y entrega
  crítica, cada uno evaluado por separado;
- `security.turnstile-a` y `security.turnstile-b`: las dos barreras, cada una en
  su propia fila;
- `authorization.residency-write-boundary`: ninguna escritura fuera de la
  residencia;
- `privacy.no-individual-ballots`: ninguna boleta individual persistida o
  expuesta;
- `security.anti-abuse-limits`: límites autoritativos conservados;
- `security.csp` y `security.cookies`: cada defensa evaluada por separado;
- `database.expected-migrations-only`: sólo migraciones exactas y autorizadas,
  sin seed, roles, Vault ni aplicaciones inesperadas;
- `cloudflare.known-crons-only`, `cloudflare.known-bindings-only` y
  `cloudflare.domain-config-exact`: crons, bindings y dominios exactos, cada uno
  en su propia fila;
- `data.integrity-no-corruption`: ninguna señal o riesgo aceptado de corrupción
  de datos;
- `security.secret-scan`, `quality.build-and-test-suite` y
  `cloudflare.secret-inventory-exact`: scans, suite y nombres de secretos como
  gates independientes;
- `network.production-dns-integrity` y `quality.production-smoke`: DNS y smoke
  remoto del perfil productivo actualmente cerrado evaluados por separado; el
  smoke cerrado exige GET/HEAD/POST en 503 fail-closed y verifica
  headers/cookies, pero no acredita el perfil interactivo; y
- `configuration.no-unknown-release-config`,
  `configuration.auth-providers-aligned` y `configuration.ai-disabled`: ninguna
  configuración desconocida, proveedores alineados con la política y cobertura
  OAuth acreditada, e IA deshabilitada. El gate de proveedores reemplaza desde
  v5 al histórico `configuration.google-auth-disabled`; y
- `legal.pending-external-copy-honest`: el bundle legal activo ES/EN no puede
  afirmar ubicaciones, contratos, retención o salvaguardas que la evidencia
  disponible no acredita. Las versiones `2026-08-29.1` sólo acreditan este gate
  cuando la fase local y el build/preflight exactos validan sus snapshots y
  hashes; una diferencia conserva `RAW_RESULT=FAIL` y
  `RELEASE_DISPOSITION=STOP`.

Un gate no renunciable ausente, fallido, no evaluado o dependiente de un estado
remoto desconocido bloquea el release excepcional. No puede reclasificarse por
la firma del responsable. Su promoción a `PASS` exige evidencia específica del
control individual: una suite o paso agregado exitoso no acredita otro gate. En
particular, `legal.pending-external-copy-honest` sólo puede pasar cuando una
versión legal honesta, revisada y versionada esté activa en el bundle ES/EN y su
checker/build exacto lo demuestre; no alcanza con conservar el draft inactivo.

#### Acta obligatoria y atribución

El dry-run que genera el acta se invoca exclusivamente así:

```bash
pnpm run release:open:exceptional:dry-run --request <ruta-absoluta.json>
```

El request JSON contiene exactamente `schemaVersion`, `policyVersion`,
`policyHash`, `head`, `owner`, `timestampUtc`, `deploymentAuthorized:false` y
`risks`. Cada elemento de `risks` contiene `gateId`, `evidenceStatus`,
`rawResult`, `requestedDisposition=RISK_ACCEPTED_BY_OWNER`,
`acceptedConsequence` y `reviewRequiredBy`. Las confirmaciones no se aceptan
prefirmadas: el runner las solicita por `/dev/tty`, una por riesgo, y recién
entonces las incorpora al acta.

La declaración exacta por fila es
`ACEPTO EL RIESGO <gate-id> PARA <full-head>`. La fila
`legal.sensitive-consent-0059-omitted` exige además, como una segunda
confirmación distinta,
`ACEPTO ADEMÁS QUE AGORBIS NO DEBE DESCRIBIRSE COMO JURÍDICAMENTE CONFORME PARA <full-head>`.
Ninguna de las dos frases admite abreviación, wildcard o sustitución global.

`<ruta-absoluta.json>` debe estar fuera del worktree. Las actas se crean a su
lado para que ni el request ni sus outputs invaliden el HEAD limpio que se está
auditando.

El acta es inmutable y específica para un release. El runner crea junto al
request, sin overwrite y con modo `0600`,
`<nombre-sin-.json>.act.json` y `<nombre-sin-.json>.act.md`. Debe registrar:

- `schemaVersion`, `policyVersion`, `policyHash`, `head`, `owner`,
  `timestampUtc`, `expiresAtUtc`, `requestHash`, `artifactHash` y
  `contentSha256`;
- `gates[]`, cada uno con `gateId`, `evidenceStatus`, `rawResult`, `gatePolicy`,
  `releaseDisposition`, `severity`, `acceptedConsequence`, `confirmation`,
  `reviewRequiredBy` y `facts`; este último es `null` salvo para subestados
  canónicos del gate aceptado;
- `commands[]` sólo con label y exit code, sin argumentos, entorno ni secretos;
  y
- `deploymentAuthorized:false`, `deploymentExecuted:false` y
  `productionMutationCommandsExecuted:false`.

Los datos canónicos no duplicados en `gates[]` —nombre, tipos de riesgo,
`waiverPolicy`, dependencia de evidencia externa, consecuencia y fuentes— se
resuelven contra la política inmutable señalada por `policyVersion` y
`policyHash`. Un hash desconocido o distinto bloquea; el acta no permite
reinterpretar esos campos.

Para cada riesgo debe constar una declaración equivalente a: “Acepto este
riesgo residual específico para el HEAD indicado; entiendo que no es un PASS,
no prueba cumplimiento jurídico y no acepta ningún otro gate”. Una firma al
pie sin filas individuales no es válida. Cambiar HEAD, alcance, resultado o
evidencia invalida el acta y exige una nueva.

El runner de dry-run deriva las dos rutas locales del nombre del request,
rechaza cualquier overwrite, falla ante placeholders o campos desconocidos,
propaga todos los errores y termina antes de cualquier deploy. Además emite un
issuance externo al worktree, canónico, `0600` y sin overwrite. Ese issuance
liga HEAD, policy, requestHash, actHash, el hash del acta Markdown, artifactHash
y expiración; un issuance ausente, modificado, vencido o ligado a otra entrada
bloquea el cutover. No modifica el significado de variables existentes; todo
cambio futuro de estados o schema debe actualizar código, tests y documentación
en el mismo cambio.

Los exit codes forman parte del contrato: `0` significa todos los gates en
`PASS` y cero excepciones; `20`, dry-run completo con al menos un
`RISK_ACCEPTED_BY_OWNER` y el aviso literal `ESTO NO ES PASS`; `1`, gate o
ejecución bloqueada; y `2`, request o uso inválido. Un `20` no se interpreta
como `0` ni autoriza deployment. La corrida real no presupone un `20`: mientras
algún control no renunciable permanezca `FAIL` o `NOT_VERIFIED`, enumera la
matriz, termina con exit `1` y no emite acta.

#### Cutover, cápsula CLOSED y lock operacional

Una vez obtenido un exit `20`, el único comando autorizado para solicitar la
apertura es:

```bash
pnpm run release:open:exceptional:cutover --request <ruta-absoluta.json> --act-hash <actHash>
```

El runner vuelve a validar Git, HEAD remoto recuperable, request, policy, acta
JSON/Markdown, artifact congelado, issuance y expiración. También exige que los
27 gates no renunciables sigan en `PASS`, que los siete riesgos conserven su
estado factual no-PASS y que el acta no haya sido consumida. Bajo el lock
operacional audita el Deployment y Version CLOSED activos, publica atómicamente
y relee durablemente una cápsula de recovery `CLOSED`; sólo entonces solicita
por `/dev/tty`
`AUTORIZO DEPLOY OPEN DE AGORBIS PARA <full-head> CON ACTA <act-hash>`. Después
de la confirmación vuelve a verificar lock, Git, bundle, expiración, CLOSED,
binding remoto y cápsula antes del claim; ninguna autorización genérica o
prefirmada sirve.

La cápsula queda ligada al HEAD, requestHash, policy, actHash, artifactHash,
issuanceHash y a esos IDs cerrados. Contiene únicamente el env vacío y las
configuraciones congeladas para restaurar la Version CLOSED al 100 % y dejar
los crons en cero. Su publicación usa un pointer fijo unido por hard link al
registro interno; archivos extra, symlinks, hard links inesperados, permisos,
hashes o bindings distintos bloquean.

Cutover y recovery adquieren el mismo lock operacional global para la cuenta de
Cloudflare y el Worker `agorbis` en el host/operador/UID designados. El lock
serializa toda mutación productiva local, se vuelve a comprobar en cada frontera
sensible y hace fallar cerrado una segunda operación concurrente o cualquier
sustitución del lock. No es un lock por request que permita dos actas en
paralelo. Cloudflare Versions no ofrece CAS remoto entre hosts; la ventana exige
operar exclusivamente desde el host designado.

El único comando autorizado para recuperar el estado cerrado ligado es:

```bash
pnpm run release:open:exceptional:recover-closed --request-hash <requestHash> --act-hash <actHash>
```

Recovery relee el claim y la cápsula publicada, exige una confirmación literal
por `/dev/tty`, restaura exclusivamente la Version CLOSED registrada al 100 %,
reconcilia los crons a cero y sólo declara éxito después de una auditoría CLOSED
actual. Puede reintentarse si queda `closed-unconfirmed`; no inventa otro
baseline ni consume un config del worktree.

No existe un bypass general ni una ruta manual equivalente. Queda prohibido
reemplazar estos runners por `wrangler deploy`, `pnpm deploy`, una invocación
directa de Wrangler o un script ad hoc, incluso durante una emergencia.

#### Rollback y regreso a la política normal

El dry-run no necesita rollback cloud porque no cambia Producción. Si el
cutover autorizado inicia una mutación y no puede confirmar el estado open, el
runner intenta de inmediato volver mediante la cápsula al Deployment CLOSED
503 y reconciliar crons a cero. Si esa recuperación inline no queda confirmada,
el operador debe ejecutar el recovery independiente exacto anterior; no debe
usar un deploy manual ni declarar go-live. No se revierte una migración ni se
borran datos sin un plan separado y revisado.

El `quality.production-smoke` previo prueba únicamente el perfil
productivo que ya está cerrado: GET, HEAD y POST deben devolver 503 fail-closed
y conservar headers/cookies esperados. No acredita un Worker interactivo. Toda
apertura exige además un smoke interactivo post-deploy separado; el acta D72 no
puede afirmarlo por adelantado. El smoke cerrado envía solicitudes de
comprobación GET/HEAD/POST al perfil 503 y observa la respuesta HTTP fail-closed;
el audit de configuración Cloudflare usa API GET-only. El status HTTP no
demuestra por sí solo la ausencia de escrituras. El harness HTTP puede completar
sus probes, pero `quality.production-smoke` permanece `NOT_VERIFIED` hasta que
evidencia DB/artefacto separada acredite que el POST no escribió. Si falta esa
evidencia o la respuesta no es 503 fail-closed, la disposición es `STOP`.
Ninguno modifica la configuración remota de Producción.

La excepción deja de ser necesaria cuando AAIP figure `approved` con ID real,
retención y transferencias estén reconciliadas con evidencia, los textos de
proveedores sean verificables, exista backup productivo y copia off-host con
round-trip/restore, y `0059` haya sido aprobada/aplicada o sus superficies
tengan una política normal distinta aprobada. El retorno se completa al pasar
el runner normal sin riesgos aceptados y cerrar cada fila residual del acta.

**Advertencia:** esta decisión registra una aceptación empresarial de riesgo.
No equivale a una opinión legal, una aprobación de AAIP, evidencia contractual,
un backup, cumplimiento jurídico ni autorización de deployment.

## Auditoría de octubre de 2026

Entre el 18 y el 19 de octubre entraron unos 30 commits "feat(ui): batch N" y
el commit `d54c32b` ("Fase 1"), sin PR ni CI. Pasaban `tsc`, ESLint y Vitest y
rompían igual el producto, el aparato legal y decisiones anteriores. Las cuatro
decisiones que siguen registran cómo se corrigió y qué regla queda para que no
se repita. El inventario completo está en
[`docs/mejoras-priorizadas.md`](docs/mejoras-priorizadas.md).

### D73 · Fase 1 revertida: el consentimiento legal se sigue pidiendo y registrando

**Fecha:** 20 de octubre de 2026. **Estado:** vigente. Un consentimiento más
liviano queda abierto como decisión del responsable (ver al final).

**Qué se intentó.** `d54c32b` quiso "eliminar la fricción legal del alta en
una Fase 1" sin tocar la base:

- `hasCurrentLegalAcceptance` devolvía `true` sin consultar nada, y
  `readParticipationStatus` asumía que se podía participar si la consulta
  fallaba (fail-open);
- `/registro` dejó de montar `LegalConsentFields` y no registraba ninguna
  aceptación; `/consentimiento` redirigía siempre al destino, así que no
  quedaba ninguna ruta para aceptar los documentos;
- el acceso social emitía la marca de consentimiento con las versiones legales
  vigentes, y la decisión del aviso de Google, sin que nadie hubiera marcado
  una casilla; `/auth/callback` la tomaba como evidencia;
- dejó el borrador `0068_phase1_simplify_participation.sql` en `docs/`, fuera
  de la convención de borradores.

**Por qué se revirtió.** La base no cambió y sigue decidiendo (D3, D70):
`guard_profile_system_fields` (0056) exige `assert_can_participate` para
cambiar nombre de usuario, nombre visible o residencia, y el trigger
`aa_participation_gate` (0039) lo exige en las tablas de participación. Con el
código de Fase 1 una cuenta nueva no podía terminar el onboarding ni votar,
comentar o publicar, y la UI le decía que el problema era no vivir ahí,
porque el gate comparte el SQLSTATE `42501` con RLS. Aplicar `0068` lo habría
"arreglado" del peor modo: `my_legal_status()` devolvía `accepted: true` y
`accepted_at: now()` para personas que nunca aceptaron nada. Eso es fabricar
constancias de consentimiento (Ley 25.326, D70), y D72 trata la prueba de
aceptación como un control no renunciable.

**Qué quedó.** Se restauró la parte legal de `src/lib/legal.ts`,
`auth-actions.ts` (y sus tests), `SocialAuth.tsx`, `/registro`, `/ingresar`,
`/consentimiento`, `/auth/callback`, `/auth/confirm` y el aviso del layout.
`readParticipationStatus` vuelve a fallar cerrado. `participationBlockMessage`
de `src/lib/db-error.ts` reconoce los centinelas del gate
(`GEOUNITY_LEGAL_ACCEPTANCE_REQUIRED`,
`AGORBIS_INTERNATIONAL_TRANSFER_CONSENT_REQUIRED`, suspensión y baja en curso)
y las acciones muestran el motivo real, con el camino a `/consentimiento`. El
borrador pasó a `supabase/sql-drafts/` como
`0068_phase1_simplify_participation.REJECTED.sql`, con una cabecera que dice
por qué no se aplica. No va en `supabase/migration-drafts/` porque el preflight
de Producción y la evidencia D72 fijan que ahí haya sólo `0059`.

**Qué haría falta para un consentimiento más liviano pero real.** Se puede
reducir la fricción sin dejar de probar nada:

1. una decisión del responsable sobre qué se acepta y cuándo; por ejemplo,
   pedir la aceptación al primer intento de participar y no al crear la cuenta
   (leer nunca la exigió);
2. una migración revisada (en `supabase/migration-drafts/` primero) que
   registre la aceptación desde la sesión, para `auth.uid()`, con versión y
   hash exactos, sin backfill y sin vía para aceptar en nombre de otra persona;
3. el aviso de transferencias sigue separado mientras la cuenta dependa de
   Cloudflare, Supabase y Resend (D70); juntarlo con los demás exige
   reescribir D70, no sólo la UI;
4. casos en `supabase/tests/rls_checks.sql` y un e2e "cuenta nueva → onboarding
   → votar" contra el ledger real antes de cambiar el flujo.

### D74 · Nada ficticio en las rutas de producción

**Fecha:** 20 de octubre de 2026. **Estado:** vigente.

Los batches de octubre montaron en las 3.901 comunidades componentes con datos
inventados presentados como reales: una alerta meteorológica fija con
`role="alert"` y "Hace 25 min", farmacias, centros de salud y refugios con
teléfonos inventados, actas con folio, quórum y SHA-256, puntajes
"verificados" sobre instituciones reales, un "plazo legal de 15 días" que la
base no define (D58), una credencial de "identidad ciudadana verificada" para
cualquier cuenta y un "cofre de datos" que exportaba un JSON estático y
afirmaba cifrado en reposo y voto "100 % disociado" (contra D68). Otros decían
"pedido confirmado", "inscripción registrada", "reconocimiento otorgado" o
"aporte registrado" cuando sólo escribían en `localStorage`. En una
plataforma cívica eso no es un detalle visual: alguien puede llamar a un
número inventado en una urgencia o creer que su firma llegó a un municipio.

Se retiraron 34 componentes y la ruta `/c/[slug]/actas`. Los componentes
mixtos conservan la parte real (conteos y estados que salen de la base) y
pierden la inventada. La planilla en papel de `/reclamos/[id]/planilla` dejó
de pedir DNI, domicilio y teléfono de terceros, y en vez de pedir que se suba
su foto al reclamo público avisa que no se fotografíe ni se suba.

La regla:

- **Ningún botón ni mensaje dice "confirmado", "publicado", "registrado",
  "enviado", "otorgado" o "verificado" sobre algo que no llegó a la base.** Si
  la acción sólo vive en el dispositivo, el texto lo dice.
- **Ningún número, nombre, teléfono, fecha o imagen de muestra se muestra como
  real.** Si alguna vez hace falta enseñar con ejemplos, van detrás de un modo
  demo explícito, apagado en producción y rotulado en pantalla. Hoy no existe
  ninguno.
- **`localStorage` es sólo para conveniencias del dispositivo** (favoritos,
  borradores, preferencias), clasificadas en `src/lib/local-data.ts` para que
  la limpieza al cerrar sesión o borrar la cuenta se las lleve (D67).
- Una cifra sin fuente ("hasta 3 veces más rápido", "duplica la velocidad")
  no entra en la UI.

`src/components/fictional-content.spec.ts` falla si vuelven las frases y
patrones retirados a `src/components` o `src/routes`. Es una red mínima, no
una prueba de honestidad: la regla vale aunque el test no la detecte.

### D75 · Qwik en beta: política de actualización

**Fecha:** 20 de octubre de 2026. **Estado:** vigente. Complementa D16.

Producción corre sobre `@qwik.dev/core`, `@qwik.dev/router` y
`eslint-plugin-qwik` `2.0.0-beta.40`, pineados exactos. Dos bugs del beta
obligaron a parchar alrededor de la dependencia, y los dos son de privacidad:
`src/lib/qwik-cloudflare-worker-router.ts` es una variante local del
middleware de Cloudflare porque el original guardaba en la Cache API
compartida respuestas `private, no-store` de cuentas distintas, y
`adapters/cloudflare-workers/qwik-log-sanitizer.ts` reescribe tres logs
internos que podían registrar URLs con códigos o un `Error` completo (D71). D16
eligió Qwik 2 sin evaluar el riesgo de depender de un beta; esta decisión lo
hace explícito.

Reglas:

1. **Los tres paquetes se actualizan juntos**, en una PR propia, nunca dentro
   de un commit de features. La PR enlaza el changelog de cada beta
   intermedia.
2. **Antes de subir se revisan los dos parches** (y los rodeos del lado del
   navegador que D112 y D114 agregaron después: `holdFocus` y
   `src/lib/action-guard.ts`, cuyo spec cruza el formato por `_deserialize`
   para que un cambio del beta falle en la suite, y el límite de errores que se
   recupera de D115). El sanitizer exige las tres
   firmas exactas y hace fallar el build si cambian: es a propósito. Si
   upstream corrigió el bug, el parche se retira en la misma PR, con su test;
   si no, se adapta y se vuelve a probar. Lo mismo con el middleware: el fork
   se mantiene mientras el original pueda cachear respuestas privadas.
3. **Verificación mínima:** `pnpm verify`, `pnpm test.e2e`,
   `pnpm build.cloudflare` y un recorrido de las rutas con formularios
   (`routeAction$`, `server$`) en preview. Un beta puede cambiar el
   comportamiento sin cambiar los tipos.
4. **Sin apuro por la novedad:** una beta nueva se toma cuando cumple una
   semana publicada o trae un arreglo de seguridad que aplica. Dependabot
   tiene que proponer la familia Qwik en un grupo propio, separado del de
   minor/patch del resto; la configuración vive en `.github/dependabot.yml`
   y en `minimumReleaseAge` de `pnpm-workspace.yaml`.
5. **Advisories del beta:** no se ignoran en bloque. `GHSA-x586-xvc8-g7q6`
   marca `2.0.0-beta.40` como vulnerable por un rango mal escrito
   (`<2.0.0-beta37`, sin punto): lo resuelve el responsable con la corrección
   upstream o una excepción explícita, con fecha, en `pnpm-workspace.yaml`.
6. **Salida del beta:** cuando haya `2.0.0` estable, se migra en una PR
   dedicada y se revisa si el fork y el parche siguen haciendo falta.

### D76 · Terceros y CSP: ningún host nuevo sin declararlo

**Fecha:** 20 de octubre de 2026. **Estado:** vigente. Complementa D64 y D70.

El código de octubre sumó terceros sin decidirlo: QR pedidos a
`api.qrserver.com`, fotos de `images.unsplash.com`, un iframe de
OpenStreetMap, dictado por voz con el reconocimiento del navegador (audio a
Google) y enlaces a mapas y mensajería. La CSP de D64 los bloqueaba, así que
esas funciones no andaban, y si alguien "arreglaba" la CSP la URL del
reclamo, la IP, las coordenadas y el audio pasaban a proveedores que no
figuran en `/subencargados` ni en la Política de privacidad.

Qué quedó, sin tocar la CSP ni la Permissions-Policy:

- **QR generado en el servidor.** `src/lib/qr.ts` arma el código como SVG
  dentro de la página (afiches, dossier, nota formal y planilla). No hay
  pedido a terceros ni dependencia nueva.
- **Sin iframes ni imágenes de terceros.** El mapa de `/c/[slug]/mapa` es un
  esquema propio con datos de Agorbis (`map-view.ts`). Las fotos de muestra se
  fueron con D74. El dictado por voz y el reproductor de debates se retiraron,
  y `microphone=()` sigue negado.
- **Los enlaces salientes los inicia la persona.** OpenStreetMap, Google Maps,
  Apple Maps, Waze, WhatsApp y Telegram son enlaces que se abren con un clic;
  no se carga nada de esos servicios por adelantado. Las coordenadas que
  llevan son las públicas, redondeadas a la misma cuadrícula de ~110 m que usa
  la base (0040), y el mensaje compartido es el que la persona ve
  (`src/lib/share.ts`).

La regla: **un host nuevo que el navegador o el Worker contacten sin un clic
de la persona** (imagen, iframe, script, fuente, API, `connect-src`) **exige,
en la misma PR, la entrada en la CSP de `src/routes/plugin@cabeceras.ts`, el
alta en `/subencargados` y en la Política de privacidad, con versión y hash
nuevos (`check-legal`), y una decisión Dn.** Si alguno de los tres falta, el
host no entra. Un enlace saliente nuevo no necesita CSP, pero no puede llevar
datos personales que la persona no vea (ubicación precisa, identificadores de
cuenta).

Pendiente: un test que recorra `src/**` y falle ante un host externo fuera de
la allowlist de la CSP y de una lista explícita de enlaces salientes.

### D77 · CI en tres niveles: lint rápido, tests de producto y gates de release

**Fecha:** 21 de octubre de 2026. **Estado:** vigente. Ajusta D72 (validaciones
locales del runner excepcional) y la política de audit anterior.

**Por qué.** La CI de `main` estaba en rojo desde septiembre y un fallo de
política de release (pins, closure de Wrangler, digests de binarios) aparecía
como "lint": `lint` encadenaba 30 pasos más los 41 tests de
`test.release-open`, y cualquier parche de Ubuntu o de Node bloqueaba una PR
de producto (auditoría del 20-10-2026, ítem 3). Con todo bloqueado por igual,
nada bloqueaba de verdad.

**Qué cambió.**

1. **Contrato de scripts v10 → v11**
   (`agorbis-exceptional-release-scripts/v11`, SHA-256
   `7fa95ed60cab7d832c19dd6b1cabe31b6ca05c9a49b659e01ce9daab7dab4584`):
   `lint` (eslint, prettier, scan-secrets, check-keys, check-i18n,
   check-legal, el borrador de evidencia legal, la fuente pública del build,
   `check-audit-ignores` y `check-db-contract`), `test` (tests de lógica pura y
   vitest) y `test.release` (`test.release-open`, cloudflare-\*, preflight,
   production-smoke, git-recovery, backups y supabase-\*). No se perdió ningún
   comando: la unión de los tres contiene todos los de `lint` en v10. `pnpm
verify` corre los tres en orden.
2. **Audit por niveles.** `verificar` bloquea desde `--audit-level=high` (antes
   `low`). Las excepciones viven en `pnpm-workspace.yaml` con paquete, ruta,
   por qué no llegan a runtime y fecha de revisión, y `check-audit-ignores`
   las valida en `lint`. `low` pasa al job `auditoria-semanal`: el audit es
   informativo, pero la corrida falla cuando una excepción venció
   (`--fail-on-expired`), para que GitHub avise.
3. **`release-gates` deja de ser requerido para una PR.** Corre
   `pnpm test.release` con la toolchain auditada exacta y
   `AGORBIS_REQUIRE_PINNED_TOOLCHAIN=1`. Los checks requeridos para llegar a
   `main` son `verificar` e `integracion`.
4. **Dependencias:** `minimumReleaseAge: 10080` (una semana) y se quitó
   `minimumReleaseAgeExclude`, que sin la edad mínima no hacía nada.
5. **Validaciones locales del runner excepcional: 11 → 13**
   (`scripts/run-exceptional-release-local-gates.mjs`): se suman `pnpm test`
   y `pnpm test.release` porque `lint` ya no los arrastra. Reemplaza la lista
   de D72 y la de los runbooks.

**Qué deja de bloquear una PR.** Las políticas D72, Cloudflare, preflight,
backups y pins (`test.release`), los digests exactos de Node, pnpm y git, y
los advisories `moderate`/`low`.

**Dónde se sigue exigiendo.** En todo release:

- `scripts/cloudflare-build.mjs` corre `pnpm test` y `pnpm test.release`
  antes de `pnpm build`, con el mismo pnpm y el mismo entorno; si una falla no
  hay artefacto. Cubre `deploy:closed`, `deploy:readonly-preview`,
  `deploy:dry-run` y `release:open:dry-run`, que antes recibían esas pruebas a
  través de `lint` (lo exige `scripts/test-preflight.mjs`).
- El runner excepcional corre sus trece validaciones, con `audit
--audit-level=low` incluido, e inyecta `AGORBIS_REQUIRE_PINNED_TOOLCHAIN=1`
  como valor fijo: la falta del pnpm o del git canónicos es un fallo, no un
  SKIP.
- `pnpm verify` es la "suite local completa" de `GO_LIVE_CHECKLIST.md` y de
  `READ_ONLY_PREVIEW_TO_INTERACTIVE_RUNBOOK.md`.

El argumento de antes para bloquear desde `low` —"una CLI vulnerable también
puede comprometer el artefacto"— sigue valiendo para el release, y por eso el
runner excepcional conserva `low`; en una PR de producto el costo era una CI
roja permanente que nadie miraba.

**Pendiente del responsable.** `pnpm audit --audit-level=high` no pasa hoy:
`GHSA-x586-xvc8-g7q6` (`@qwik.dev/core <2.0.0-beta37`, falso positivo de
semver sobre `beta.40`, ver D75) necesita una excepción explícita o el arreglo
upstream, y los advisories de vite/launch-editor se van con la actualización
de toolchain del ítem 8, que exige re-baselinear `lockHash` y `closureHash`
con el protocolo cross-store.

### D78 · Flujos de participación con datos reales y contexto conservado

**Fecha:** 22 de octubre de 2026. **Estado:** vigente. Complementa D34,
D65, D67 y D74.

La revisión de UI/UX encontró controles que aparentaban filtrar por distancia,
zonas de encuestas con porcentajes inventados y un estado de borrador que no
reflejaba una escritura efectiva. Se retiran los controles sin datos reales;
el indicador del borrador distingue guardando, guardado y error, y el guardado
incluye navegación interna y todos los campos serializables. Los archivos
adjuntos siguen requiriendo selección manual. Se preservan las claves privadas
por persona y comunidad y su limpieza al cerrar sesión (D67).

La creación de proyectos valida cada paso y lleva al primer campo pendiente
antes del envío. La confirmación previa sigue siendo una acción de dos fases
(D34); volver a editar conserva lo escrito. El destino interno validado que
motivó el registro se mantiene durante la confirmación, el consentimiento y
la elección de residencia, sin modificar los documentos ni sus requisitos.

La migración `0070_personalized_feed_filters.sql` agrega una firma compatible
para filtrar comunidad y tipo antes del límite y del cursor. Conserva el RPC
anterior para clientes previos, las reglas de seguimiento y residencia y la
protección de resultados de encuestas. **Debe aplicarse antes de desplegar
esta versión del frontend.** No se consultan páginas extra para simular un
filtro ni se incorpora sondeo periódico.

En móvil, la barra contextual del reclamo se ubica sobre la navegación usando
su altura medida, con espacio reservado y área segura. Inicio sólo se marca
activo en su ruta; los extremos del comparador de fotos coinciden con sus
etiquetas y el foco del teclado queda visible. La comunidad mantiene cuatro
acciones principales y reúne guía, hitos, difusión y accesos secundarios en
Más herramientas, accesible también sin JavaScript.

### D79 · Publicación contextual, importes precisos y resultados descriptivos

**Fecha:** 22 de octubre de 2026. **Estado:** vigente. Complementa D34,
D56, D68 y D78.

Publicar en la navegación móvil abre un selector de encuestas, debates,
reclamos y proyectos. Conserva la comunidad visitada; fuera de ella usa la
residencia ya cargada, y sin contexto orienta a explorar. No agrega consultas
ni sustituye permisos o controles de participación. Las pestañas de comunidad
conservan la sección activa durante la creación. Los formularios de acceso
quedan primero en móvil y mantienen la presentación de dos columnas en escritorio.

El presupuesto conserva el texto escrito y distingue separadores de español
e inglés. Sólo un formato válido se convierte a decimal para enviar; los
borradores conservan el idioma del importe y el campo vacío sigue siendo
opcional. Los importes muestran sus centavos cuando existen.

La búsqueda global exige los mismos tres caracteres en el encabezado y en
su página. Ctrl/Cmd+K pertenece a la paleta de comandos; la barra inclinada
enfoca un buscador visible o abre la página de búsqueda, sin dos manejadores
compitiendo. Las tarjetas mantienen el texto legible y el truncado por líneas,
sin aplicar máscaras a párrafos completos. La llamada a la acción de una
encuesta describe la navegación que realiza.

Los resultados de encuestas muestran la cantidad real de participantes por
separado de las selecciones y describen la muestra sin atribuir consenso a
toda la comunidad. Se mantienen el cierre y el umbral de cinco personas de
D68. Los filtros de la cronología anuncian su selección y la cantidad de
eventos visibles para lectores de pantalla.

**Limitación detectada al verificar (resuelta por D80).** El POST nativo de revisión devuelve
500 en Qwik Router `2.0.0-beta.40`: al ejecutar los loaders de los layouts
después de consumir el formulario, `getLoaderRequestEvent` intenta crear un
`Request` con un cuerpo ya leído. Se reproduce tanto en desarrollo como en
el bundle de producción; es independiente del formato del presupuesto. La
validación del mismo POST se verifica con la API pública de acciones
(`Accept: application/json`), y el caso HTML queda registrado como `fixme`
en `e2e/project-budget-input.spec.ts`. Queda pendiente resolver ese flujo
sin desactivar globalmente `strictLoaders` ni alterar APIs privadas del router.

### D80 · Envíos nativos, búsquedas completas y confirmaciones verificables

**Fecha:** 22 de octubre de 2026. **Estado:** vigente. Complementa D67,
D68, D74, D78 y D79. Resuelve la limitación nativa registrada en D79.

Qwik Router `2.0.0-beta.40` recibe un parche puntual de pnpm: al construir
el contexto de un loader después de leer un POST, conserva las propiedades
HTTP del `Request` y evita transferir un cuerpo ya consumido. La rama de
peticiones sin consumir permanece intacta. No se cambia de versión, ni se
desactiva `strictLoaders`, ni se accede a APIs privadas desde la aplicación.
El parche queda versionado en `patches/` y se aplica con la instalación. Su
retiro requiere una versión upstream corregida y las mismas pruebas nativas.
El cierre de dependencias cambió; los hashes de release se revisan con el
protocolo de D72 antes de desplegar, sin rebaselinarlos dentro de esta mejora.

Sin JavaScript, los asistentes muestran sus campos juntos, ocultan ayudas que
dependen de scripts y conservan el envío HTML, los errores con datos escritos,
la revisión y la confirmación explícita. Volver a editar es un POST de edición
que no publica. Los permisos, consentimientos y saneamiento de imágenes del
servidor se mantienen. La ayuda junto a Fotos aclara que los archivos no se
recuperan del borrador del dispositivo.

La migración `0071_public_member_search.sql` agrega una sobrecarga compatible
de `community_public_members` para buscar nombre o usuario y filtrar foto
antes del cursor y del límite. Conserva el opt-in explícito de visibilidad,
los permisos de lectura y los conteos de anonimato independientes de los
filtros. La firma previa sigue disponible. Sólo se aplica y verifica en local;
**debe aplicarse antes del Worker que usa esta búsqueda.** Los filtros viajan
en la URL y no requieren sondeo ni leer páginas extra para simular resultados.

Una búsqueda fallida se anuncia como error recuperable y se registra con su
identificador de petición; nunca se convierte en un listado vacío. Los
controles del historial tienen un área táctil de 44 px. Los favoritos sólo
cambian de estado después de una escritura confirmada y permiten reintentar
si el dispositivo rechaza guardar o quitar.

Las tarjetas muestran apoyos reales sin una barra de avance inventada. Las
opciones binarias usan el mismo tratamiento visual, también con etiquetas
editadas. El resumen y el audio de notificaciones describen sólo la página y
sus filtros. Marcar como leído comunica la cantidad confirmada por la base;
el sonido, la háptica y el confeti sólo ocurren después de una respuesta
exitosa con cambios reales.

### D81 · Búsqueda de reclamos, perfil y acciones accesibles

**Fecha:** 22 de octubre de 2026. **Estado:** vigente. Complementa D68 y D80.

El buscador de reclamos aplica título y descripción antes del cursor y del
límite de la consulta. Busca una subcadena literal: el escapado protege tanto
la expresión regular como la gramática de PostgREST. Los filtros y el orden
viajan en la URL. La consulta rápida de la comunidad sólo ofrece encuestas
activas con cierre futuro y retira la invitación al vencer el plazo, mediante
un temporizador local. Los resultados siguen protegidos por D68.

Los nombres del directorio institucional enlazan a sus perfiles; la solicitud
de acreditación lleva al formulario. Las preferencias de notificaciones
comparan lo editado con los valores confirmados por la acción: una edición
posterior o durante el guardado sigue pendiente. La lectura en voz alta se
cancela al salir de la ruta.

Compartir un reclamo mediante el gesto táctil espera la respuesta del sistema
o del portapapeles: informa errores y respeta la cancelación voluntaria. El
menú Agendar permite flechas, Inicio, Fin, Escape y Tab, con foco restaurado
al cerrar. El diálogo de fotos anuncia el título del reclamo.

Quitar el avatar es una opción explícita del formulario. La actualización del
perfil usa la sesión y RLS; sólo después de confirmar la fila se limpia el
archivo anterior, comprobando que pertenece a la persona. Un rechazo conserva
la foto y los campos escritos. No se permite quitar y subir una foto en el
mismo envío. Las reglas de usuario aparecen antes de validar.

### D82 · Navegación compartible y recuperación de errores de interacción

**Fecha:** 22 de octubre de 2026. **Estado:** vigente. Complementa D67,
D74, D76 y D81. Solicitada como una ronda adicional de diez mejoras.

Las secciones del perfil y las vistas de proyectos usan enlaces con estado
accesible y parámetros de URL, compatibles con recarga e historial. Cambiar
un filtro reinicia el cursor; cambiar la presentación conserva la página.
La selección de una foto muestra una vista previa local antes del guardado;
sus URL temporales se liberan al reemplazarla o salir. Los controles para
quitar favoritos identifican el título y tienen un área táctil de 44 px.

Un fallo de red al votar un comentario restaura su estado y permite
reintentar. Cada comentario tiene un enlace directo: el servidor recupera
el destino con la sesión y los mismos permisos cuando no está en la primera
selección visible, sin recorrer páginas ni exponer comentarios retirados.

El mapa filtra texto, categoría y estado antes del límite de cien reclamos;
declara ese alcance y conserva los filtros en la URL. Un error de consulta
se distingue de una búsqueda sin resultados y permite reintentar. Sus
controles de selección anuncian el estado actual también sin depender del
color. Las coordenadas mantienen la cuadrícula pública de D76.

Los resúmenes de comunidad usan una misma plantilla traducida para la vista
previa, la copia y WhatsApp. Conservan nombres ciudadanos, cantidades reales
y el origen de la página actual. La copia sólo se confirma cuando el
portapapeles responde. No se agregan servicios, dependencias, migraciones,
sondeo ni cambios de permisos o documentos legales.

### D83 · Historial accesible, fechas previstas y alcance explícito

**Fecha:** 22 de octubre de 2026. **Estado:** vigente. Complementa D67,
D74, D76, D81 y D82. Implementa las veinte mejoras pendientes de UI/UX.

El pasaporte usa umbrales coherentes de 0, 5, 10 y 25 acciones registradas.
La barra parte de cero, mide el nivel actual y declara el nivel máximo sin
inventar otro objetivo. El calendario de proyectos usa el próximo hito
pendiente o en curso cuya fecha objetivo no haya pasado: evento tentativo de
todo el día, con fin exclusivo y sin sustituir la fecha por la creación del
proyecto. Cuando no existe fecha, se informa y no se ofrece agendar.

El perfil advierte antes de abandonar ediciones sin guardar. La actividad
combina fuentes acotadas mediante un cursor estable de fecha, tipo e ID; las
comunidades seguidas tienen un cursor de fecha e ID. Ambas muestran 25 filas
por página y conservan los totales globales. Los recibos de participación
siguen sin revelar elecciones. Las cuotas disponibles enlazan a su formulario
y el mapa de actividad permite teclado y selector de fecha táctil, indicando
que sólo describe las publicaciones cargadas. Los avatares fallidos recuperan
las iniciales y los botones de cierre de sellos tienen un área de 44 px.

Los directorios institucionales aplican búsqueda literal y tipo antes de
paginar 24 registros. El historial institucional pagina 20 respuestas y
resuelve títulos por tipo en hasta cuatro consultas por lote. Los conteos
describen su alcance; una consulta fallida no se convierte en un resultado
vacío. La página de afiche comunitario genera su QR localmente y se imprime
sin navegación, reutilizando la infraestructura de imprimibles existente.

El aviso de reclamos compara los IDs cargados con un historial local acotado
de 500 tarjetas efectivamente visibles en pantalla. Reutiliza la clave
personal ya clasificada y su limpieza de D67; no adelanta una fecha global
que marque reclamos filtrados como vistos. Las citas se agregan al borrador
controlado de la columna propia sin reemplazarlo; si no caben completas en
1000 caracteres, se conserva el texto y se permite copiar. El filtro declara
que reconoce palabras en español o inglés y sólo revisa las citas cargadas.
La síntesis territorial muestra el signo real del puntaje y su alcance, sin
presentarlo como consenso general. El ingreso para reportar conserva la ruta,
los parámetros y el fragmento, y abre sólo el formulario del contenido elegido.

Todo el territorio ajusta el esquema a las coordenadas públicas cargadas; el
radio filtra los puntos y su listado por igual. Los reclamos sin ubicación
quedan separados. La geolocalización anuncia espera y errores, permite volver
al centro comunitario e ignora respuestas tardías tras restablecerlo. No se
persiste la ubicación del dispositivo ni se modifica la cuadrícula de D76.
No se agregan dependencias, proveedores, migraciones ni cambios de permisos.

### D84 · Formularios recuperables, búsquedas vigentes y controles de lectura

**Fecha:** 22 de octubre de 2026. **Estado:** vigente. Complementa D56,
D68, D74 y D83. Diez mejoras adicionales, enumeradas antes de implementarlas.

Cambiar una encuesta a binaria conserva las opciones de elección para volver
sin perderlas. El cierre se interpreta con una zona horaria explícita,
inicializada desde la preferencia validada del visitante; no depende de la
zona del proceso que ejecuta la acción. La revisión incluye fecha, hora y
zona. Una hora inexistente o ambigua por un cambio de horario se rechaza con
una explicación. El formulario nativo conserva esa misma interpretación.
Un error al consultar subcomunidades se distingue de una comunidad sin hijos
y ofrece reintentar, sin falsear un listado vacío ni relajar permisos.

Los mensajes preparados para compartir se traducen al idioma de la interfaz,
conservando el contenido ciudadano. Cancelar la hoja del sistema no es un
error; los fallos reales ofrecen reintento y copia del enlace. La paleta de
búsqueda descarta resultados anteriores al cambiar la consulta, impide abrir
un resultado pendiente u obsoleto y muestra un error recuperable.

Los atajos globales respetan los diálogos abiertos, los modificadores y la
composición de texto. El panel de accesibilidad usa colores definidos para
sus opciones activas y objetivos táctiles de al menos 44 px. En el carrusel,
las diapositivas ocultas quedan inertes, los controles anuncian la selección
y también tienen objetivos táctiles amplios.

El proyector conserva un plazo absoluto para cada turno de dos minutos y
limpia su temporizador al cerrar o desmontarse. Puede iniciar otro turno tras
llegar a cero; el fin se anuncia una vez, sin leer cada segundo. Su contenido
se puede desplazar y sus controles se acomodan a pantallas pequeñas. El
diálogo se cierra antes de devolver el foco a su disparador. La marca en la cabecera
cede espacio a las acciones cuando se amplía el texto en móvil.
No se agregan dependencias, proveedores, migraciones ni cambios de permisos.

### D85 · Participación elegible y recorridos completos

**Fecha:** 23 de octubre de 2026. **Estado:** vigente. Complementa D65,
D66, D73, D74 y D83–D84. Implementa las diez mejoras de la revisión de UI/UX
solicitadas por el responsable, quien también autorizó integrar todos los
cambios pendientes en la rama local `main`.

Publicar conserva el selector móvil y elige una comunidad de la residencia.
Las rutas de creación verifican membresía y cupo conocido antes de mostrar el
formulario; un selector muestra destinos válidos y alternativas. La base
continúa siendo la autoridad de permisos y de cupos ante cambios concurrentes.
No se consultan cupos al renderizar cada página para sostener el selector móvil.
La revisión de un reclamo distingue texto, coordenadas públicas aproximadas y
ausencia de ubicación, sin afirmar una geolocalización inexistente.

Las categorías de búsqueda envían el formulario completo con sus campos
editados, tanto por GET nativo como en la navegación reanudable. Inicio usa
únicamente los filtros de comunidad y tipo aplicados en la base antes de
paginar: se retiran los filtros duplicados sobre 24 elementos y sus conteos
parciales, conservando los indicadores de novedad de cada publicación.

Los debates mantienen los destacados iniciales por columna y permiten cargar
el resto bajo demanda con un cursor estable de fecha e ID. Se deduplican los
comentarios y se conserva la posición de lectura, sin consultas periódicas ni
cambiar RLS. La navegación de comunidad permanece bajo la cabecera al bajar.
Las fichas tienen controles de al menos 44 px y comunican su expansión; las
pantallas de cuenta ofrecen el mismo panel de accesibilidad que el resto.

Los proyectos muestran en móvil un acceso al panel de aporte cerca del título,
sin agregar otra barra fija. El Q&A confirma únicamente escrituras exitosas y
limpia sólo el texto enviado, conservando otros borradores y los errores.
No se agregan dependencias, proveedores, migraciones ni cambios de permisos.
La autorización de commit no incluye despliegue ni push remoto.

### D86 · Seguimiento fiel, formularios recuperables y distancias explícitas

**Fecha:** 23 de octubre de 2026. **Estado:** vigente. Complementa D65,
D68, D73, D76 y D85. Segunda ronda de diez mejoras de UI/UX solicitada por
el responsable, con un listado posterior de oportunidades aún sin implementar.

El seguimiento del reclamo ofrece actualizaciones al autor, moderación y
representantes verificados del organismo responsable. Las respuestas oficiales
y los cambios de estado se ofrecen sólo a moderación o a ese organismo. Se
reflejan las reglas vigentes de la RPC; la base sigue comprobando cada acción.
La prueba de la primera respuesta detectó que la guarda institucional de `0018`
rechazaba el timestamp automático del trigger de `0026`, revirtiendo también
el evento autorizado. `0072_claim_institutional_response_clock.sql` admite
únicamente ese cambio anidado de `null` a `transaction_timestamp()`, sin otros
campos modificados, para el representante verificado del organismo responsable
y con un evento de esa persona y organización. Conserva la guarda anterior,
las ACL y RLS. La suite SQL verifica la respuesta inicial, la conservación de
la hora previa y el rechazo de escrituras manuales, otras columnas y organismos
ajenos. Aplicada sólo en Supabase local, pendiente en el destino.
Las fuentes y las respuestas institucionales muestran errores por campo y un
resumen enfocable; los enlaces quedan dentro del formulario correspondiente.
Un POST rechazado conserva el texto también sin JavaScript y mantiene abierto
el formulario que necesita corregirse.

Los compromisos de un proyecto usan una acción de ruta que invalida su loader
tras la escritura confirmada. Guardar, editar y retirar actualiza los datos
personales y el progreso sin recargar manualmente. Los errores conservan el
borrador; las ediciones posteriores al envío no se descartan al recibir la
respuesta. El historial de publicaciones propias se pagina por fecha, tipo e
ID, con una fila adicional por fuente para detectar continuación. Sus cursores
no modifican las páginas de actividad o de comunidades seguidas.

La selección de fotos añade nuevos archivos al lote preparado hasta el límite
vigente. Mantiene orden y portada, reencodifica los nuevos archivos antes de
admitirlos y conserva los anteriores si falla una imagen. Los pasos de reclamos
y proyectos trasladan el foco y anuncian la nueva etapa, respetando movimiento
reducido. Ocultar los filtros de notificaciones mantiene sus controles y valores
editados, con expansión accesible.

La encuesta actualiza su estado al vencimiento y al recuperar la pestaña con
un temporizador local cancelable, sin polling. Permite consultar los resultados
cuando vence, sin calcularlos en el cliente ni saltar el cierre o el mínimo de
participación de la base. El mapa reutiliza los estados reales de los reclamos;
los focos críticos incluyen sólo estados abiertos con al menos cinco apoyos
dentro de los resultados cargados. El radio se aplica como distancia circular
en metros sobre las coordenadas públicas aproximadas. Los rótulos explican
que la distancia es en línea recta y no prometen recorridos ni tiempos de viaje.

No se agregan dependencias, proveedores ni permisos. La segunda lista es una
propuesta de trabajo; no amplía las diez implementaciones de esta ronda ni
autoriza operaciones remotas.

Verificación local: compilaciones de cliente, Worker y preview, tipos y lint
correctos; 896 pruebas unitarias en 123 archivos, 17 suites SQL y 46 escenarios
E2E seleccionados en tandas de regresión y repeticiones focales de los errores
detectados. Se comprobó también el reenvío de fuentes con ediciones pendientes
y los rechazos nativos de ambos formularios. Las señales calculadas mantienen
los atributos de error al reanudar Qwik y el foco espera al ref del resumen.
Sin push, despliegue ni migraciones remotas. Los bloqueos de release y
dependencias documentados en D85 permanecen pendientes.

### D87 · Directorios completos, recuperación de cuenta y contexto verificable

**Fecha:** 23 de octubre de 2026. **Estado:** vigente. Complementa D65,
D73, D76 y D86. Implementa las diez oportunidades de la segunda ronda por
pedido del responsable y deja otra lista de propuestas sin implementar.

El directorio de subcomunidades busca en la base antes de paginar, con orden
estable y cantidad limitada por página. La URL conserva la búsqueda. Las
herramientas comunitarias indican su propio destino activo y dejan de señalar
Info como fallback. Una página agotada de encuestas conserva el regreso al
principio y los filtros, en vez de afirmar que no hay encuestas en la comunidad.

Seleccionar explícitamente un reclamo en el mapa móvil acerca su detalle y
traslada el foco después del render; cargar la página o cambiar filtros no
desplaza a la persona. El diálogo GPS comunica el rechazo del portapapeles y
ofrece seleccionar las coordenadas públicas aproximadas para copia manual.
La cronología resuelve la institución de cada evento mediante su clave foránea,
sin atribuir respuestas históricas al responsable actual del reclamo.

La recuperación muestra únicamente el correo que escribió la persona y permite
corregirlo; conserva la respuesta genérica sobre existencia de cuentas. Un
conflicto real de nombre de usuario se asocia al campo en perfil y onboarding,
con foco para corregir y sin borrar los otros valores. El rechazo nativo de
onboarding conserva también el destino interno seguro enviado en el formulario.
El perfil conserva visible el acceso a revisar la residencia durante el plazo
de espera. La página de
residencia y la base siguen decidiendo si corresponde una corrección reciente
o un cambio; no se amplía esa autorización.

El total de personas comprometidas con un proyecto usa la RPC agregada vigente
`project_pledge_counts`, en paralelo con el resto del loader. La lista pública
sigue limitada y explica su recorte cuando corresponde. Un error de conteo
se comunica como dato no disponible, sin presentar cero ni la longitud parcial
como total. Guardar o retirar un compromiso revalida también esta cantidad.

Las pruebas de integración detectaron dos bordes de reanudación de Qwik:
los loaders filtrados recuperan el slug también desde la URL cuando el router
vacía los parámetros; el foco de un rechazo repetido observa cada resultado de
la acción. El resumen de errores de extensiones espera además los cambios de
montaje y visibilidad de su `details` con un observador temporal, desconectado
al enfocar o limpiar la tarea, sin sondeo ni nuevas consultas.

No se agregan dependencias, migraciones, proveedores, datos personales locales
ni permisos. Sin operaciones remotas; los bloqueos de release y dependencias
ya documentados no cambian.

Verificación local: cliente, Worker y preview, tipos y lint correctos;
925 pruebas unitarias en 128 archivos, 17 suites SQL y 34 pruebas E2E
seleccionadas, en tandas de regresión y repeticiones de los fallos detectados.
Se verificaron también los rechazos repetidos y nativos, el destino de regreso
de onboarding, los nombres posteriores al antiguo recorte de 300 y un proyecto
con 52 personas frente a una lista pública de 50. El caso de foco en errores de
extensiones pasó en dos ejecuciones independientes. Sin push ni despliegue.

### D88 · Escrituras confirmadas, estados desconocidos y destinos precisos

**Fecha:** 23 de octubre de 2026. **Estado:** vigente, validada localmente.
Complementa D65, D73, D76 y D85–D87. Implementa las diez propuestas
posteriores a D87 por pedido del responsable; la siguiente revisión deja veinte
oportunidades sin implementar.

El seguimiento, las fuentes y las respuestas institucionales revalidan el
loader de su detalle mediante acciones de ruta, conservando los permisos y las
validaciones existentes. La interfaz confirma únicamente escrituras aceptadas
y conserva las ediciones posteriores al envío. El envío nativo conserva sus
datos tras un rechazo. Una resolución sin institución se distingue de una
respuesta oficial, sin cambiar las autorizaciones de la RPC.

La comparativa utiliza evidencia compatible con imágenes y los orígenes ya
permitidos para mostrarlas; los documentos se mantienen como enlaces. El reloj
del reclamo recalcula al próximo cambio de plazo o día y al volver a la
pestaña, sin polling y sin anunciar un escalado que la base no confirmó.

Un fallo al leer el compromiso personal deja el estado desconocido y ofrece
reintento; no habilita un alta vacía ni una edición que pueda reemplazar el
mensaje existente. La actividad propia enlaza al comentario concreto mediante
la consulta y el ancla que ya permiten encontrarlo fuera de los destacados.

Dejar de seguir y cambiar la visibilidad pública muestran sólo resultados
confirmados. Una lectura fallida de visibilidad no se presenta como visible.
El título y las acciones para compartir una victoria apuntan al reclamo elegido.

La verificación en navegador detectó que el POST nativo de visibilidad perdía
los filtros de la URL. El destino del botón ahora combina el contexto de la
página con la acción, sin duplicar parámetros. El foco de los errores de
extensiones espera el final de navegación y el nodo actual después del render;
cada resultado se enfoca una sola vez, conservando los rechazos repetidos sin
que otro formulario vuelva a enfocar un error anterior.

El enlace de Actividad también espera el render final del debate para enfocar
el comentario y acercarlo dentro de la página, el carrusel y la lista. Sólo
atiende un destino explícito de consulta y ancla, recuperado bajo RLS; no
repite el salto al votar o revalidar otros formularios.

La validación local incluye tipos, lint, compilaciones de cliente, Worker y
preview; `pnpm test` con 985 pruebas en 142 archivos, además de los checks de
scripts; y las 17 suites SQL de `pnpm db.test`, sin cambios de esquema.
Pasaron 32 pruebas E2E seleccionadas sobre producción local, en tandas y
repeticiones de los fallos corregidos. Cubren guardados y rechazos, ediciones
durante el envío, formularios nativos, filtros de visibilidad, evidencia,
plazos, enlaces de actividad y victorias, RLS y regresiones de participación.
El caso de foco de errores de extensiones pasó en dos ejecuciones independientes.

No se agregan dependencias, migraciones, proveedores, claves locales ni
permisos. No se ejecutan operaciones remotas. Los bloqueos previos de release
y auditoría permanecen pendientes.

### D89 · Recuperación de cuenta, lecturas parciales y acciones nativas

**Fecha:** 23 de octubre de 2026. **Estado:** vigente, validada localmente.
Complementa D68, D73, D76 y D85–D88. Implementa las veinte
propuestas posteriores a D88 por pedido del responsable y deja la próxima
revisión como propuestas sin implementar.

Un rechazo del código TOTP permite retomar únicamente el factor propio aún no
verificado que corresponde al POST. No vuelve a mostrar el secreto ni registra
otro factor. El reenvío de confirmación conserva el destino interno seguro.
Su política de referencia usa `same-origin`, como las demás pantallas de cuenta,
para que el formulario HTML conserve el origen requerido por la protección CSRF.
Marcar avisos leídos revalida la bandeja y el contador; el POST nativo descarta
sólo la caché del usuario de esa solicitud para leer el contador confirmado.
Enviar o retirar una apelación revalida su historial y conserva otros borradores.

Las extensiones distinguen errores parciales de fuentes, respuestas, nombres
institucionales, representación y relaciones. Conservan los datos disponibles
y ofrecen una recarga nativa; una representación desconocida no habilita una
respuesta. Vincular contenido usa acciones del detalle para actualizar sus
relaciones y confirmar sólo una escritura aceptada, conservando la selección
y los borradores de otros formularios.

La ejecución de proyectos confirma hitos, tareas, aportes y estado general
desde acciones de ruta. Sus formularios asocian errores a campos, recuperan
el POST nativo y limpian sólo los valores enviados que no se editaron durante
la espera. Los hitos envían sólo el estado permitido; la base calcula su fecha
de finalización con el trigger vigente. Preguntas y respuestas usan páginas estables, recuperan el mensaje
enlazado o recién publicado y muestran el contexto necesario bajo RLS.
Los desplegables conservan su apertura al revalidar otros formularios. En SPA,
un mensaje nuevo fuera de la página se recupera con su consulta de destino;
el enlace a un mensaje ya presente enfoca sin recargar ni descartar borradores.
Un recibo en memoria conserva la confirmación durante esa relectura y se
descarta ante otro envío, rechazo o cambio de proyecto. Guarda sólo IDs; el
contenido y su visibilidad siguen proviniendo de la lectura bajo RLS.

Los envíos HTML revelaron que el router puede omitir los parámetros del
detalle después de una acción. El proyecto recupera entonces su ID desde el
pathname y lo valida como UUID, evitando un 404 posterior al guardado sin
aceptar un ID de consulta o del cuerpo del formulario como ruta alternativa.

Las encuestas distinguen fallos de opciones, estadísticas o resultados de la
reserva real por participación insuficiente. No muestran votos individuales
ni resultados durante la ronda, y conservan el mínimo de cinco participantes
al cierre. La confirmación de cierre y los filtros avanzados de notificaciones
usan controles HTML nativos, con las mismas autorizaciones del servidor.

Los directorios institucionales declaran los filtros que invalidan sus loaders
y conservan búsqueda, página y territorio. Los conteos comunitarios fallidos
no se presentan como ceros ni ocultan el acceso a herramientas. Los vacíos
filtrados de victorias ofrecen limpiar filtros. CUIT y teléfono tienen etiquetas
asociadas a sus controles. La revisión de zonas sin reclamos se presenta como
invitación a revisar el barrio, sin afirmar una detección territorial inexistente.
Las búsquedas recientes conservan territorio, tipo y orden y vuelven al inicio.

Las fotos son enlaces seguros a la imagen completa, mejorados con el diálogo
cuando está disponible, respetando apertura en otra pestaña. Un rechazo del
portapapeles ofrece el destino exacto en un campo seleccionable; no indica
copiar una dirección con parámetros o fragmentos ajenos al enlace compartido.

La validación local incluye tipos, lint y compilaciones de cliente, Worker y
preview. Pasaron `pnpm test` con 1.047 pruebas en 154 archivos, además de sus
checks de scripts, y las 17 suites SQL de `pnpm db.test`. Pasaron 45 casos E2E
seleccionados sobre la compilación local, en tandas y repeticiones de los fallos
corregidos. Incluyen sesiones reales, formularios nativos, errores y guardados,
filtros y cursores, RLS, reserva de resultados, fotos, copia manual y borradores.
El caso con 278 mensajes comprueba también el recibo, la recuperación del botón
y la conservación de otra respuesta en edición durante la relectura por URL.

Sin dependencias, migraciones, cambios de permisos, nuevos proveedores ni
operaciones remotas. Los bloqueos previos de release y auditoría no cambian.

### D90 · Formularios nativos, borradores preservados y evidencia precisa

**Fecha:** 24 de octubre de 2026. **Estado:** implementada y verificada localmente.
Complementa D68, D73, D76 y D85–D89. Implementa las veinte
propuestas posteriores a D89 por pedido del responsable.

Un comentario guardado limpia sólo el cuerpo enviado que no cambió durante
la espera y anuncia las ediciones que siguen en el borrador. La confirmación
se procesa una vez por comentario guardado. Los votos de comentarios sin
sesión son enlaces HTML que conservan consulta y ancla del mensaje preciso;
volver del ingreso no emite la elección. El perfil omite la insignia que
presentaba una suma de filas parciales como total de Publicaciones y Actividad.

Reportar y retirar contenido usan confirmaciones HTML accesibles sin
JavaScript. Los reportes rechazados recuperan el motivo, sin reemplazar una
edición posterior, y su éxito corresponde al contenido enviado. Cancelar un
retiro no realiza un POST y conserva el contexto de regreso. Las preferencias
de avisos recuperan también las opciones desmarcadas del POST rechazado y
abren su formulario para corregirlas. Los filtros rápidos comunican la opción
activa y tienen una superficie táctil suficiente.

Buscar ofrece un selector GET de territorios con consulta en servidor y slug
comprobado, conservando término, tipo, estado y orden. Un identificador
inexistente no amplía silenciosamente el alcance. Las solicitudes de
instituciones y comunidades revalidan su historial propio después de una
escritura confirmada. Sólo se limpian los campos enviados que siguen intactos;
las ediciones posteriores se conservan. El envío nativo aceptado redirige a
GET y confirma el recibo únicamente contra las solicitudes propias cargadas,
sin repetir la escritura al recargar. La comunidad superior también puede
indicarse por su slug sin JavaScript y se verifica antes de guardar.
CUIT y teléfono se incorporan al mensaje institucional en servidor; su longitud
cuenta para el límite del mensaje y los campos se recuperan ante un rechazo.

Los reclamos abiertos se cuentan con los estados abiertos vigentes, excluyendo
resueltos, rechazados y retirados; un fallo deja la cantidad desconocida. La
comparativa identifica el territorio consultado y sus miembros, sin inferir
residencia ni actividad reciente. La bienvenida describe el alcance real del
mapa y de los apoyos y condiciona el presupuesto a una ronda disponible. La
invitación y la firma del kit de difusión comparten una única plantilla
localizada para vista previa y copia, conservando los nombres ciudadanos; el
rechazo del portapapeles ofrece copia manual.

El presupuesto distingue fallos por sección de listas vacías, constancias
inexistentes y negativas de elegibilidad. Ofrece recarga y evita acciones que
requieren una lectura desconocida. No recupera elecciones individuales ni
publica resultados durante la ronda: mantiene las reglas de voto secreto,
cierre y participación mínima. La selección de una encuesta se reinicia al
cambiar de ID y la confirmación o el error de voto sólo se muestran para la
encuesta enviada.

El seguimiento del reclamo distingue alcanzar la meta de apoyos, una elevación
registrada y su destino, un acuse institucional, una respuesta oficial, el
estado de gestión y la resolución. Ningún paso posterior completa los
anteriores por deducción. Afiche, dossier, nota y planilla distinguen fallos de
lectura de ausencias reales; el dossier tampoco transforma una cronología
fallida en una lista vacía. Los selectores de ejecución ofrecen las
transiciones vigentes de tareas, aportes, hitos y proyecto, respetando la
autoridad real de moderación y conservando las guardas de la base.

Vincular contenido ofrece un selector HTML que busca publicaciones visibles
bajo RLS y conserva el regreso al formulario. El destino se vuelve a leer
para confirmar su identidad y título; una cadena de consulta no acredita su
contenido. Elegir un resultado prepara la selección, pero la relación se
crea sólo después de confirmar la acción autorizada del formulario de origen.
El loader del proyecto declara los parámetros de selección: Qwik filtra su URL
también durante SSR según esa lista. La cancelación HTML del retiro cambia la
consulta para provocar un GET real y cerrar la confirmación, incluso al repetirla.

Verificación D90: `pnpm build.types`, `pnpm lint`, `pnpm test` (1.142 pruebas en
168 archivos) y builds de cliente, Worker y preview aprobados. Las 17 suites SQL
y 36 casos seleccionados E2E (22 nuevos y 14 regresiones) pasaron contra Supabase
local en Docker, con JavaScript y HTML, sesiones Auth, escrituras y RLS reales.
Se verificaron también el Q&A de más de 200 mensajes y las extensiones existentes.
La API local usa `127.0.0.1:54821` y PostgreSQL `127.0.0.1:54822`; las pruebas
unitarias simulan por separado los rechazos y fallos de lectura. Esta validación
local no acredita CI remota ni modifica los bloqueos de release existentes.

Sin dependencias, migraciones, cambios de permisos, nuevos proveedores,
claves locales ni operaciones remotas. Los bloqueos previos de release y
auditoría no cambian. La autorización de integración no incluye despliegue.

### D91 · Arranque en Supabase Free con Cloudflare Workers Paid

**Fecha:** 24 de octubre de 2026. **Estado:** decidida por el responsable;
implementada en el preflight, el inventario de recuperación y la documentación.
Ajusta la premisa de Supabase Pro de los documentos de backup y del inventario
de recuperación; no cambia D68, D70, D73 ni D76.

> **Estado actual (30-10-2026):** D101 reduce la compensación «contraseña de
> 12 caracteres y cuatro clases» a 12 caracteres con letras y números
> (`letters_digits`). El resto de esta decisión sigue vigente y su texto se
> conserva tal como se decidió.

El responsable quiere comprobar si Agorbis funciona antes de pagar por la base.
Producción arranca en el plan Free de Supabase y pasa a Pro cuando la app
crezca. Cloudflare Workers sigue en Paid: los crons y los 30 s de CPU del
Worker no entran en Free, y el preflight sigue exigiendo
`CLOUDFLARE_WORKERS_PLAN=paid`.

Qué cambia con Free, según la
[página de precios](https://supabase.com/pricing) y la
[guía de seguridad de contraseñas](https://supabase.com/docs/guides/auth/password-security)
de Supabase al 24-10-2026:

- **Protección contra contraseñas filtradas.** Supabase la ofrece sólo desde
  Pro. Hasta ahora el preflight exigía atestarla en `true`; con Free eso sería
  una atestación falsa, prohibida por D74 y por la regla 6 de `CLAUDE.md`. Se
  agrega la atestación `SUPABASE_PLAN` (`free`, `pro`, `team` o `enterprise`),
  sin valor por defecto: con `free` el preflight exige
  `SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED=false` y avisa en cada
  corrida; desde `pro` vuelve a exigir `true`. Sin plan declarado o con un
  valor desconocido, falla cerrado. Compensan mientras tanto la contraseña de
  12 caracteres y cuatro clases, TOTP, Turnstile A/B y la reautenticación, que
  ya eran obligatorias.
- **Backups.** Free no tiene backups administrados. La exportación lógica
  cifrada de `pnpm backup:supabase:production` pasa a ser la única copia; se
  repite al menos una vez por semana y antes de cada migración, y el RPO real
  es el intervalo entre exportaciones. El objetivo de 24 horas exige automatizar
  la exportación diaria o pasar a Pro.
- **Pausa por inactividad.** Free pausa el proyecto tras una semana sin
  actividad. El cron horario del Worker la evita mientras el Worker esté
  publicado; si se despublica más de una semana, hay que restaurarlo a mano
  desde el Dashboard antes de volver a abrir.
- **Cupos.** 500 MB de base, 50.000 usuarios activos por mes y retención de
  logs de un día. Se revisan en el Dashboard; superar el 80 % de cualquiera
  adelanta el pase a Pro.

Pasar a Pro no requiere migración ni cambios de código: se actualizan
`SUPABASE_PLAN=pro` y la atestación de contraseñas filtradas a `true` en el
mismo cambio, se regenera el inventario de recuperación y los documentos de
backup recuperan la capa administrada.

Implementación: `scripts/production-preflight.mjs` y su test,
`scripts/recovery-inventory.mjs` con `recovery/configuration-inventory.v1.json`
regenerado, `.env.example`, README, `docs/PRODUCTION_RUNBOOK.md`,
`docs/CLOUD_CONFIGURATION.md`, `docs/RECOVERY_INVENTORY.md` y
`docs/BACKUP_AND_RESTORE.md`. Sin operaciones remotas: el proyecto de
Producción, su plan y sus ajustes los confirma el responsable en el Dashboard.

### D92 · Producción en un proyecto Supabase nuevo y en la cuenta Cloudflare SEBA

**Fecha:** 24 de octubre de 2026, proyecto recreado el 25. **Estado:** decidida
por el responsable; repositorio recableado, Worker inicial creado y proyecto
en Ohio; corte pendiente.
Complementa D72 y D91.

El responsable creó el proyecto Supabase `ibtvlvpxwourrxwcrfkf` (organización
`agorbis`, región `us-east-2`, Postgres 17, plan Free) y conectó la cuenta de
Cloudflare SEBA (`4d78fb10c1ae65281ec851479d5045dc`), distinta de la cuenta
`ad39e77a…` que el repositorio fijaba desde D72. Pidió arrancar ahí sin
reutilizar nada del entorno anterior.

Qué cambió en el repositorio, en un solo cambio mecánico y verificable:

- `wrangler*.jsonc`, las políticas D72 y sus tests, `worker-configuration.d.ts`,
  el contrato remoto de base y la documentación apuntan al proyecto, a su URL,
  a su clave publicable `sb_publishable_rV441…` y a la cuenta nueva. No queda
  ninguna referencia al proyecto ni a la cuenta anteriores.
- El inventario de recuperación registra la observación de sólo lectura del
  25-10-2026: Auth con email activo, Google y Facebook apagados, altas abiertas,
  claves legacy todavía habilitadas. La decisión de abrir con Google o sólo con
  email sigue pendiente; mientras tanto `PUBLIC_GOOGLE_AUTH_ENABLED` no cambia.

Qué se hizo fuera del repositorio, a pedido expreso del responsable: un
`wrangler deploy` del script inicial `agorbis` en SEBA (versión `c56fbcba…`),
sin dominios, crons ni `workers.dev`, para que existan el Worker y el lugar
donde cargar los tres secretos. No publica la app. Los releases siguen pasando
por los runners de D72.

**Región y textos legales.** El primer proyecto, creado el 24-10-2026 como
`tdytsrtrbwulnotyhnaj`, quedó en `us-east-1` (Virginia). Las páginas de
Privacidad y transferencias vigentes no nombran la región, lo que verifica
`src/lib/legal.spec.ts`, pero el aviso de Google activado por `0067` dice que
la base principal está en East US (Ohio), `us-east-2`: aplicarlo sobre Virginia
publicaría un dato falso (D74). Por eso el responsable recreó el proyecto,
todavía vacío, en East US (Ohio) el 25-10-2026 como `ibtvlvpxwourrxwcrfkf`; el
de Virginia se borra cuando el nuevo esté operativo. Los textos publicados y el
borrador legal pendiente siguen siendo verdaderos sin cambios.

Pendiente antes del corte, en este orden: zona `agorbis.com`
en SEBA, Workers Paid, Turnstile A y B, secretos `SUPABASE_SECRET_KEY`,
`TURNSTILE_SECRET` y `CRON_SECRET`, ajustes de Auth del Dashboard con sus
atestaciones, Resend, dry-run y push únicos de las 69 migraciones con la
contraseña por teclado, y el ledger `post-0072` en el tooling de backup, que
hoy acepta sólo `post-0061` a `post-0067`.

**Actualización 30-10-2026, verificación del responsable.** La zona
`agorbis.com` ya está en SEBA con zone id `1649628cde7b43fc40bceaca54d02e16`;
apex y `www` están vinculados al Worker `agorbis` inicial, y los widgets
Turnstile A y B existen. Workers Paid, los tres secretos y el resto de la lista
siguen pendientes. El recableado de arriba había dejado en los scripts de
Cloudflare el zone id de la cuenta anterior; se corrige en los cinco archivos
que lo fijaban, sin tocar `wrangler*.jsonc`, políticas D72 ni hashes de
release. Ver la nota del 30-10 en el runbook. La fecha es de verificación, no
de creación de la zona.

### D93 · Clases que generan CSS, escalado honesto y regreso al contenido

**Fecha:** 25 de octubre de 2026. **Estado:** implementada y verificada
localmente. Complementa D58, D68, D73, D74 y D85–D90. Primera tanda de la
revisión de veinticinco mejoras de UI/UX pedida por el responsable; la lista
completa y las diecinueve pendientes están en `docs/mejoras-priorizadas.md`.

Los tokens semánticos pasan de `@utility` fijas a colores de `@theme inline`.
Una utilidad fija no admite opacidad en Tailwind v4, así que `bg-app/85`,
`bg-surface/90`, `border-subtle/80` y otras ochenta clases no generaban CSS:
la cabecera, la barra inferior, las pestañas de comunidad y los menús eran
transparentes, y el velo de navegación no aparecía. Los nombres que nunca
existieron (`bg-brand`, `border-border`, `bg-surface-subtle`) se cambian por
tokens reales; los chips activos con `bg-brand` mostraban texto blanco sobre
nada. `src/global-css-classes.spec.ts` compila `global.css` con el Tailwind del
build y falla si una clase usada no produce CSS. La opción "Alto contraste"
del panel ponía una clase que sólo veía un media query; los mismos tokens se
aplican ahora también con la clase, y una prueba exige que coincidan.

Un reclamo ya no promete "escalar automáticamente a la Municipalidad". La base
sólo lo muestra también en la comunidad superior cuando vence el plazo, nadie
acusó recibo y se llegó al umbral, nunca por encima del país (0026, D58). El
panel de apoyo pierde su "meta de firmas" y el reloj de respuesta, que ya lo
explicaba bien, pasa debajo de la acción. Los apoyos de la app dejan de
llamarse firmas en el detalle, el afiche, el dossier, la nota formal, los
textos para compartir, el volante, Victorias, el mapa, el tour y el
formulario. La planilla en papel sigue juntando firmas, que no se suman a los
apoyos. Se retira la cifra sin fuente "multiplica por tres el apoyo".

El reparto del presupuesto se envía con "Enviar reparto (definitivo)" y una
casilla obligatoria que la acción exige también sin JavaScript. Avisa las
fichas que quedan sin repartir. El simulador sale de la votación y, en las
etapas previas, aclara que no cuenta como voto. Quien no ingresó tiene un
enlace que vuelve a la ronda. El voto secreto de D68 no cambia.

"Crear cuenta", "Ingresar" de la cabecera y la barra inferior, y el
onboarding exigido por `requireResident` conservan la página de origen
(`returnPathFor`), sin `qaction` ni pasos del propio acceso. En el teléfono, la
barra del reclamo ofrece "Ingresar para apoyar" o "Revisar mi residencia"
según el caso, con Compartir en versión compacta. No se agrega un aviso de "ya
podés participar": por URL se podría compartir y verlo otra persona, y una
cookie nueva no está entre los usos que declara la política de privacidad.

Verificación: `pnpm build.types`, `pnpm lint` y `pnpm test` (1.162 pruebas en
169 archivos). Pasaron los dieciséis casos E2E de `ui-ux-regressions`,
`budget-export-recovery` y `participation-state-followups` contra el preview
local con Supabase en Docker. En la primera corrida, el caso "Publicar ofrece
los cuatro tipos" falló una vez con un `next` anidado: el router volvió a pedir
el loader de creación con la consulta de `/ingresar` y `requireUser`, que no
cambió, la incluyó en su destino. Pasó en dos repeticiones y queda anotado
para revisar. Una prueba de encuestas fallaba por la fecha: "Cierra en 1437
días" contenía el conteo reservado de la prueba, que ahora es un valor que no
puede aparecer en un plazo.

Sin dependencias, migraciones, permisos, proveedores, claves locales ni
operaciones remotas. Los bloqueos previos de release y auditoría no cambian.

### D94 · Primer uso orientado: inicio, comunidad propia, lugar y próximo paso

**Fecha:** 25 de octubre de 2026. **Estado:** implementada y verificada
localmente. Complementa D58, D68, D74, D85 y D93. Segunda tanda de la revisión
de veinticinco mejoras de UI/UX (`docs/mejoras-priorizadas.md`, mejoras 4, 5 y
10 a 14), pedida por el responsable.

Con sesión, `/`, el logo y los regresos sin destino llevan a `/inicio`, o al
onboarding si falta la residencia (`signedInHome`). La redirección sale
`private, no-store`, y los regresos del cierre de sesión y de la baja conservan
su aviso en la portada. En el teléfono, quien tiene residencia ve "Mi
comunidad" en lugar de Explorar, que sigue en el menú y en la cabecera. Sin
sesión, un solo "Ingresar" que vuelve a la página reemplaza a Avisos y Perfil.
Con letra ampliada, las etiquetas pasan a dos líneas en vez de desbordar.

Una comunidad con sus cuatro conteos confirmados en cero invita a abrir la
primera encuesta, debate, reclamo o proyecto en lugar del tablero de ceros.
Un conteo desconocido conserva el tablero con "No disponible". Sin fichas no
se anuncia una redacción que nadie hace. El inicio vacío ofrece publicar en la
comunidad propia.

Explorar abre en Argentina; si no está cargada, cae en la Tierra sin
redirigir en bucle. Toda búsqueda recorre la jerarquía, primero lo más
específico, y nombra la comunidad que contiene cada resultado. Explorar, el
onboarding, la residencia y Buscar ofrecen pedir el lugar que falta. Desde el
último nivel de una rama, el formulario abre con la comunidad superior
elegida (`?superior=`), leída de nuevo en la base y verificada al enviar como
cualquier otra. Se retira la tarjeta estática "Puentes Cívicos" y sus 26
textos.

Publicar vuelve al detalle con `?publicado=1`. Sólo para la autoría, la ficha
muestra qué sigue: el plazo de respuesta (0026), el cierre y el mínimo de
cinco (D68), los compromisos sin transferencias de un proyecto, los avisos de
cambio de estado y de respuesta institucional, compartir y dar de baja. A otra
persona con el mismo enlace no se le muestra nada.

La portada sin sesión muestra "Pasando ahora": las últimas publicaciones
públicas, leídas con el cliente anónimo (invariante 10) y sin lo dado de baja.
Si no hay ninguna o no se pudieron leer, la sección no aparece. Propone
provincias y ejemplos argentinos, sus tarjetas ya no llevan a una Tierra
vacía y las reglas acompañan a los tres pasos.

El voto y el reparto se describen por lo que hacen: "Tu elección no queda
guardada: sólo se suma al total y registramos que participaste". La frase no
promete anonimato frente a quien opera la base. Las etiquetas distinguen
"Resultados al cierre" de "Sin resultados por baja participación", sin decir
cuántos votos faltan. Un concepto, un nombre: encuestas, Notificaciones,
Cómo funciona, "tus comunidades", "Provincia o estado". Los textos legales y
el detalle del manual no cambian.

Verificación: `pnpm build.types`, `pnpm lint` y `pnpm test` (1.181 pruebas en
171 archivos). La suite E2E completa contra el preview local con Supabase en
Docker pasó 219 de 233 casos con workers en paralelo; 3 se omiten. De los 11
fallos:

- nueve vinieron de archivos que usan a la vez la misma cuenta sembrada y
  pasaron al repetirlos en serie;
- uno esperaba el onboarding sin destino después del magic link y se corrigió
  (`435c779`);
- dos también fallan en `1b95041`, antes de estas tandas.

Esos dos son: `account-access` espera `no-referrer` en
`/reenviar-confirmacion`, que D89 llevó a `same-origin`, y
`poll-options-timezone` espera el foco en la opción recién agregada. Quedan
para revisar aparte. En serie, los diez archivos afectados dieron 56 casos
aprobados y esos dos fallos.

Sin dependencias, migraciones, permisos, proveedores, cookies, claves locales
ni operaciones remotas. Se retiran 41 textos huérfanos del catálogo inglés.
Los bloqueos previos de release y auditoría no cambian.

### D95 · Flujos directos: un reclamo, un Difundir y la lista primero

**Fecha:** 25 de octubre de 2026. **Estado:** implementada y verificada
localmente. Complementa D34, D58, D68, D80, D85, D86 y D94. Tercera tanda de
la revisión de veinticinco mejoras de UI/UX (`docs/mejoras-priorizadas.md`,
mejoras 15 a 20), pedida por el responsable.

Un reclamo se completa en una sola pantalla: título, categoría, descripción,
fotos, "Ubicación (opcional)" y qué pasa al publicar. Se retiran los pasos,
sus anuncios y la revisión del cliente. "Revisar antes de publicar" lleva a
la del servidor, que conserva la segunda fase de D34 y describe la ubicación
como pide D85. La validación del título queda en el servidor para todos,
igual que sin JavaScript. Un `minLength` del navegador habría impedido
ejercitar esa respuesta y su resumen enfocable sin scripts.

El detalle de un reclamo reúne compartir y los imprimibles en un único
"Difundir este reclamo", que es un `<details>` nativo. Se retiran la banda de
urgencia con WhatsApp y el compartir duplicado del artículo; la barra móvil
conserva su Compartir compacto. En un debate, la caja para comentar va arriba
de los comentarios de la columna propia. "Comentar desde {{columna}}" la trae
a la vista y la enfoca, y sin JavaScript el ancla igual llega.

Notificaciones muestra primero la lista. "Escuchar resumen" queda en la
cabecera, descrito como lectura de la página visible (D80), y las
preferencias pasan al final con un enlace desde arriba.

Comprometerse con un proyecto se describe como "Compromiso público, no un
pago: nadie transfiere dinero a través de Agorbis". Se aclara que alcanzar la
meta no cobra nada, porque ningún trigger la mira, y un enlace lleva a los
aportes no monetarios. Los proyectos muestran sus etapas y quién las marca
(autoría o moderación, por RLS) sin dar por cumplidas las salteadas, y los
estados usan un solo mapa: `in_progress` es "En ejecución" en todas partes.
La encuesta votada dice que el cierre llega como notificación, según las
preferencias, y ofrece otras encuestas de la comunidad.

Verificación: `pnpm build.types`, `pnpm lint` y `pnpm test` (1.187 pruebas en
172 archivos). La suite E2E completa, en serie como en CI, pasó 228 de 235
casos; 3 se omiten. De los cuatro fallos:

- dos ya fallaban en `1b95041` (D94);
- `calendar-keyboard` pasó en dos repeticiones;
- `native-community-requests` chocó con el límite de tres solicitudes de
  institución por día de la cuenta sembrada, agotado por las corridas del
  día, y pasó después de limpiar esa ventana en la base local.

Por el mismo motivo se limpiaron las reservas de fotos pendientes de esa
cuenta (`GEOUNITY_TOO_MANY_PENDING_UPLOADS`, tope de 12).

Sin dependencias, migraciones, permisos, proveedores, cookies, claves locales
ni operaciones remotas. Se retiran 28 textos huérfanos del catálogo inglés.
Los bloqueos previos de release y auditoría no cambian.

### D96 · Coherencia: movimiento opcional, detalles iguales, menos destinos y moderación por antigüedad

**Fecha:** 25 de octubre de 2026. **Estado:** implementada y verificada
localmente. Complementa D36, D59, D60, D67, D76, D93, D94 y D95. Cuarta y
última tanda de la revisión de veinticinco mejoras de UI/UX
(`docs/mejoras-priorizadas.md`, mejoras 21 a 25), pedida por el responsable.

**Movimiento y vibración.** La vibración pasa a ser opcional, como el sonido:
`agorbis_a11y_haptic` la enciende sólo con `"true"`, y encenderla cuenta como
preferencia activa. Nada vibra en `onPointerDown$`, que se dispara también al
empezar a desplazarse. Se retiraron el de `Button` y otros 36. Votar y apoyar
vibran cuando la base confirmó, no al apoyar el dedo. Un único
`prefersReducedMotion()` mira el sistema y el interruptor del panel. La regla
CSS del panel alcanza también a `<html>`, donde vive el desplazamiento suave.
El confeti queda en los dos botones que celebran a mano un hito de la
comunidad o un sello ya conseguidos. Se retira al marcar notificaciones
leídas, al copiar textos, al mover el comparador de fotos, al completar el
simulador, al terminar la guía y al tildar una lista local.

**Sistema de diseño.** `text-2xs` y `text-3xs`, en `rem` y sin interlineado
propio, reemplazan los textos de 11 y 10 px. Los de 9 y 14,5 px pasan a su
valor en `rem`. Con la letra al 130 %, ahora crecen con el resto. `Badge` baja
de 11,5 a 11 px. Los usos de `emerald-*` pasan a `success-*`, que es la misma
escala esmeralda del tema (D36). `src/design-system-ratchet.spec.ts` rechaza
texto en píxeles y congela por archivo los 278 colores crudos restantes: se
pueden bajar, no subir. Los imprimibles quedan afuera porque se diseñan para
papel. Los componentes compartidos (chips, paginación, estados y
encabezados) quedan propuestos.

**Navegación.** La cabecera muestra su navegación desde 1024 px y pierde los
destinos duplicados:

- el chip de comunidad, que repetía "Mi comunidad";
- los enlaces a Buscar, porque el buscador ya busca en todo;
- Inicio y Explorar dentro del menú de la cuenta.

Con sesión, idioma y tema pasan a Preferencias, en ese menú; sin sesión
siguen en la barra. El botón de la paleta queda desde 1280 px y su atajo no
cambia.

En una comunidad, la barra muestra Info, Encuestas, Debates, Reclamos y
Proyectos. Miembros, Presupuesto (si hay partida, D59), Sub-comunidades y
Comparar van en "Más", un `<details>` que funciona sin JavaScript. Comparar
reúne el contraste entre sub-comunidades (con dos o más, D60) y la comparativa
con las del mismo nivel, que deja de ser una herramienta aparte. El mapa
barrial y la rendición municipal se ofrecen de ciudad para abajo. La
invitación por WhatsApp pasa por `translate()` y deja de saludar a los
"vecinos" de un continente.

**Detalles.** `DetailActions` pone Guardar y Compartir debajo del título en
encuestas, debates, reclamos y proyectos. El reclamo no repite Compartir, que
ya tiene en su barra y en "Difundir" (D95). Reportar va siempre al final del
artículo. La cabecera de la encuesta muestra a lo sumo tema, estado y "Ya
votaste": el tipo ya lo dice la consigna de la votación, y los resultados
tienen su tarjeta. Fuentes y contenido relacionado se muestran vacíos sólo a
quien puede completarlos. Un fallo de carga se sigue mostrando.

**Moderación.** Pendientes y en revisión salen desde lo que más esperó; el
historial, al revés. Cada contenido tiene una tarjeta, con cada motivo y el
total de reportes abiertos. "Ocultar y resolver" oculta el contenido y cierra
todos sus reportes abiertos. "Descartar reportes" los cierra sin tocarlo.
Son dos escrituras sin transacción: si ocultar falla, no se cierra nada; si
falla el cierre, se avisa que el contenido ya quedó oculto. Cada reporte pasa
por `guard_report_update` y notifica a quien lo hizo (0046).

El estado pendiente y el bloqueo van por tarjeta, también en solicitudes,
donde aprobar una mostraba "pendiente" en todas. Las pestañas y los enlaces a
otras colas muestran cuántos esperan, sin inventar un cero si el conteo
falla. Los ajustes opcionales de una solicitud de comunidad quedan plegados.
Las coordenadas siguen a mano: un selector de mapa sumaría un tercero (D76).

Verificación: `pnpm build.types`, `pnpm lint` y `pnpm test` (1.211 pruebas en
176 archivos). La suite E2E completa, en serie como en CI, pasó 235 de 242
casos; 3 se omiten. De los cuatro fallos:

- dos ya fallaban en `1b95041` (D94);
- `assembly-projector` mostró que el proyector del debate se cerraba solo
  dentro del `Slot` de `DetailActions`. Se corrigió y pasó junto con los
  cuatro detalles;
- "Publicar ofrece los cuatro tipos" falló una vez y pasó cuatro de cuatro
  aislado. Su traza muestra una carrera del router: al redirigir a ingresar
  durante una navegación SPA, volvió a pedir los loaders de la ruta anterior
  con el nuevo `?next`, y cada vuelta anidó otro.

Sin dependencias, migraciones, permisos, proveedores, cookies ni claves
locales nuevas. La vibración cambia su valor predeterminado sobre una clave ya
clasificada. Se retiran del catálogo inglés los textos que quedaron sin uso.
Sin operaciones remotas. Los bloqueos previos de release y auditoría no
cambian.

### D97 · Arranque sólo con email: Google apagado también en el perfil abierto

**Fecha:** 25 de octubre de 2026. **Estado:** decidida por el responsable e
implementada en configuración, políticas D72 y tests. Ajusta la premisa de
D72 de que la versión abierta se reconoce por `PUBLIC_GOOGLE_AUTH_ENABLED`;
no cambia D66, D70, D73 ni el aviso de Google de `0067`.

El responsable decidió abrir Agorbis sólo con acceso por correo y sumar Google
después. Hasta hoy el repositorio asumía Google activo en el perfil abierto:
`wrangler.jsonc`, las políticas de Worker, canary, artefacto remoto e
inventario lo fijaban en `true`, y las herramientas D72 usaban ese binding como
la marca que distingue la versión candidata abierta de la de respaldo
(`wrangler.open-recovery.jsonc`, Google `false`). Abrir con Google `true` sin
el proveedor configurado en Supabase mostraría un botón que no funciona (D74).

Qué cambia:

- `PUBLIC_GOOGLE_AUTH_ENABLED` pasa a `false` en `wrangler.jsonc`, en las vars
  esperadas del Worker, en la política de canary, en el entorno público de
  build y en el inventario de recuperación. Los perfiles cerrado, de preview y
  de respaldo ya lo tenían en `false`.
- La versión candidata y la de respaldo comparten ahora todos los bindings. Su
  distinción pasa a apoyarse en lo que el runner ya verificaba: el id de
  versión, el etag del script, el tag con el HEAD y el mensaje `agorbis-d72`
  con los hashes del acto y del artefacto. El origen histórico anterior a
  Google sigue distinguiéndose por la ausencia del binding de Facebook. Se
  retira, por tanto, una comprobación redundante de bindings; las otras tres
  quedan y los tests lo dejan explícito.
- Los escenarios de test que ejercitan el camino con Google encendido (bloqueos
  por ubicaciones de tratamiento, divulgación obligatoria, consentimiento
  OAuth) encienden Google a propósito y siguen vigentes para la activación
  futura.

Qué no cambia: el aviso de Google aprobado en `0067` queda en la base, sin
mostrarse hasta activar el proveedor; `/subencargados` omite Google mientras el
binding sea `false`; el "Gate específico de Google OAuth" del runbook rige en
el momento de la activación, que exigirá además el cliente OAuth en Google
Cloud y el proveedor en Supabase.

Verificación: los pasos de `test.release` que no dependen de la toolchain, los
specs de Worker y legal, lint y tipos pasan con el objetivo sólo email.

### D98 · Quinta tanda: lo que la acción cambia se vuelve a leer, y lo que la base no hace no se afirma

**Fecha:** 26 de octubre de 2026. **Estado:** implementada y verificada
localmente. Complementa D67, D68, D74, D89, D93–D96. Sale de una revisión de
seguridad de interfaz y UI/UX de seis áreas (acceso, formularios, detalles,
navegación y accesibilidad, cuenta, moderación) que registró 5 hallazgos de
severidad alta, 36 medias y unos 45 bajos; la lista completa, con lo que
queda para el responsable, está en `docs/mejoras-priorizadas.md` (octava
ronda). No se encontró ninguna vulnerabilidad clásica confirmada: XSS, open
redirect, IDOR, salto de RLS o del voto secreto.

**Regla nueva: una acción que cambia lo que muestra un loader declara
`invalidate`.** Qwik Router 2 compila con `strictLoaders` y, en ese modo, una
acción sin `invalidate` no vuelve a leer ningún loader. Las diez acciones de
moderación, la revisión de postulaciones del presupuesto y la asignación de
organismo no lo declaraban: con JavaScript, la tarjeta seguía con reportes
abiertos y botones activos después de "Ocultar y resolver", y los E2E de
moderación, que corren sin JavaScript, no lo veían. Las acciones que
necesitan invalidar un loader se declaran en la ruta donde vive ese loader,
con la lógica en `~/lib` como handler y esquema (como relaciones y fuentes).
Un E2E con JavaScript (`moderation-queue-refresh`) comprueba la cola.

**Honestidad (D74).** El dossier de prensa volvía a afirmar "vencimiento
legal", "se elevó automáticamente para intervención gubernamental" y
"firmas", con variantes que la guardia de contenido ficticio no atrapaba;
el afiche de proyecto prometía "sumarte a la jornada" e imprimía un dominio
fijo; "Rendición de Cuentas Municipal" presentaba estados de la app como
eficacia institucional; Victorias mostraba la fecha de creación como la de
la solución y varios textos atribuían la resolución a los apoyos; los hitos
daban por "alcanzada" la fecha de creación y la guía tildaba "Votá en una
encuesta" al hacer clic en el enlace; "Generar resumen" se ofrecía con OpenAI
apagado por política de lanzamiento. Todo pasa a describir lo que hay, la
guardia suma los patrones nuevos, y la tarjeta de IA no se dibuja mientras no
haya clave y modelo.

**Acceso y cuenta.** `/auth/confirm` y la página de consentimiento de Google
ponían `Referrer-Policy: no-referrer` sobre un POST: sin JavaScript, el
navegador manda `Origin: null` y el chequeo CSRF daba 403 (lo mismo que D89
corrigió en reenviar). `requireUser` armaba `next` con la query cruda y
conservaba `qaction`: la causa más probable de los `next` anidados de D93 y
D96; pasa por `returnPathFor`. El ingreso distingue una caída de red, un
correo sin confirmar (con enlace a reenviar) y una credencial incorrecta; el
alta trata el límite de envío como la pantalla de espera para no delatar
cuentas; "Enlace enviado" pasa a "Revisá tu correo". El cambio de contraseña
verifica la contraseña actual en la app con `verifyPasswordCredential`, como
la baja, en lugar de confiar en el toggle "Require current password" de
Supabase, que es una atestación manual del preflight. "Descargar mis datos"
deja de ser un `<a download>` sobre un endpoint que redirige, y `/ingresar`
explica el `reauth=1`.

**Límites y motivos reales.** Los topes propios de la base
(`program_limit_exceeded`: 12 fotos pendientes, 20 por hora, 3 solicitudes
pendientes y 3 por día) y los `raise` de las RPC de moderación llegaban como
"Probá de nuevo" o "No pudimos…"; `limitMessage`, `moderationRaiseMessage` y
`writeFailure` (429) los traducen al motivo concreto.

**Formularios.** Recuperar un borrador se anuncia y se puede descartar en los
cuatro formularios; el pastillero de la cabecera deja de ser una segunda
región viva. En el reclamo, "Volver a editar" conserva las fotos que ya
subió la revisión (`image_paths`) en lugar de dejar miniaturas de archivos
que no se iban a enviar y volver a subirlas hasta chocar el tope. El monto
solicitado de una postulación sigue al proyecto elegido.

**Fechas, perfil y privacidad.** Los instantes (`timestamptz`) se muestran
con `formatInstant` en la zona del visitante: fases del presupuesto, reloj
de respuesta, mudanza, suspensión y seguimiento de borrado. El perfil
público deja de presentar las 20 publicaciones mostradas como "acciones en
total" ni inventa un "Desde". La baja limpia `localStorage` sólo cuando el
servidor aceptó, y "Qué se borra" dice que se borra la constancia del voto
(D68) y que las fotos quedan con el reclamo. El directorio de instituciones
sanea `website` con `safeHttpUrl`. Los imprimibles llevan `noindex`.

**Accesibilidad.** Contrastes bajo AA corregidos (WhatsApp 1,98:1, pestañas
oscuras 4,23:1, botones `success-600` 3,77:1, borde de campos 2,94:1); los
atajos de una sola tecla se pueden apagar desde el panel (`agorbis_a11y_shortcuts`,
preferencia del dispositivo, D67; WCAG 2.1.4); los toasts se pausan al
enfocar y los errores quedan hasta cerrarlos (WCAG 2.2.1); errores inline
atados al campo, estado de las reglas de contraseña legible, un solo `h1`,
emojis decorativos ocultos, enlaces que avisan la pestaña nueva y
desplazamientos que respetan "Reducir animaciones".

**Qué queda para el responsable (archivos reservados).** La política de
moderación promete motivo, aviso y apelación al ocultar contenido y el código
no hace ninguna de las tres: hace falta una migración (motivo, trigger de
notificación, apelación de contenido) o un texto legal nuevo con versión.
`actor_id` del moderador es legible por la API en las notificaciones de
suspensión y rechazo; la misma persona puede suspender y resolver la
apelación; CUIT y teléfono en texto libre sin retención. `pnpm audit
--audit-level=high` falla por zod 4.4.3 (runtime) y tres advisories dev no
ignoradas, así que `verificar` queda en rojo hasta tocar `package.json` y
`pnpm-workspace.yaml`. El toggle "Require current password" del proyecto de
Supabase, la sesión de 400 días y los códigos de respaldo de MFA son
decisiones de configuración y producto. `check-i18n` no mira los archivos de
`src/lib` que importan `./i18n` ni los mensajes de `ev.fail`: extenderlo es
el siguiente paso de invariante 8.

Verificación: `pnpm build.types`, `pnpm lint` y `pnpm test` (1.223 pruebas en
177 archivos; el único fallo, un spec de solicitudes que esperaba el 400
genérico ante el gate, se corrigió en el commit siguiente). E2E contra el
preview local con Supabase en Docker: 37 de 39 casos del subconjunto de las
áreas tocadas (acceso, moderación nativa y con JavaScript, formularios
nativos, borradores, detalles, navegación y controles globales). Los dos
fallos fueron el E2E de la cabecera, que buscaba la etiqueta vieja del botón
del tema, y "Publicar ofrece los cuatro tipos", que mostró el `next` anidado
de la carrera: `returnPathFor` descarta ahora un `next` que apunta a la misma
página, y los dos archivos pasaron completos (13 casos) al repetirlos. La
suite E2E completa en serie queda para antes del release.

Sin dependencias, migraciones, permisos, proveedores ni cookies nuevas. Una
clave de `localStorage` nueva (`agorbis_a11y_shortcuts`) bajo un prefijo ya
clasificado como preferencia del dispositivo. Sin operaciones remotas. Los
bloqueos previos de release y auditoría no cambian.

### D99 · El beta vuelve a pedir los loaders al cargar: diálogos, selectores y foco que sobreviven al redibujado

**Fecha:** 29 de octubre de 2026. **Estado:** vigente. Complementa D75 y D98.

**Qué pasaba.** Qwik Router `2.0.0-beta.40` trae `serializationStrategy:
"never"` por defecto: el valor de un `routeLoader$` no viaja en el HTML y la
primera lectura en el cliente (una tarea visible, un manejador) lo vuelve a
pedir como `q-loader-*.json` unos 300 a 600 ms después de cargar y redibuja la
página con el valor nuevo. La suite E2E completa en serie, corrida para dejar
`integracion` en condiciones de pasar, mostró tres síntomas de ese redibujado
y uno ajeno:

1. La tarea visible de `DialogFrame` volvía a correr y su limpieza cerraba el
   `<dialog>`: el proyector de asamblea se cerraba solo medio segundo después
   de abrirse (el mismo mecanismo que D98 esquivó quitando un `Slot`).
2. Los selectores de estado de la ejecución de un proyecto volvían al valor
   guardado y el formulario mandaba el estado viejo: "El estado se guardó"
   sin guardar nada. La acción recibía `open` cuando la persona había elegido
   `in_progress`.
3. El foco puesto un solo frame después de agregar una opción de encuesta o
   de abrir el menú Agendar se perdía si el nodo tardaba más en llegar.
4. Sin relación con el beta: en los contextos sin JavaScript de Playwright,
   Chromium sólo pinta cuando se lo fuerza, y la animación `details-expand`
   dejaba al botón "inestable" hasta 30 s por clic. Cuatro pruebas de
   `native-relations` tardaban 45 s cada una y vencían su tiempo en CI.

**Qué se decide.**

1. **Un diálogo abierto no se cierra por un redibujado.** `DialogFrame`
   guarda por nodo lo que tiene que deshacer (scroll del `body`, foco del
   botón que lo abrió) y lo deshace sólo cuando el `<dialog>` se cerró de
   verdad o salió del documento, no cada vez que Qwik vuelve a correr la
   tarea.
2. **Un control cuyo valor sale de un loader conserva lo que la persona
   eligió.** `StatusSelect` (`src/components/projects/ProjectExecution.tsx`)
   mantiene la elección en una señal propia y se realinea sólo cuando el
   estado guardado cambia. Es el patrón para cualquier `<select>` o `<input>`
   que se renderice desde datos del loader y pueda editarse antes de un
   refresco.
3. **El foco sobre un nodo recién creado se reintenta por frames**
   (`src/lib/focus-when-rendered.ts`), con tope, en vez de un único
   `requestAnimationFrame`.
4. **Un control que puede editarse antes del refresco recibe props
   primitivas** (`encodeStatusOptions`): Qwik vuelve a dibujar un hijo cuando
   alguna prop cambia de identidad, y con un array nuevo por render el
   refresco llegaba antes de que terminara de bajar el manejador de `change`
   y pisaba la elección aunque la señal propia existiera. Con cadenas iguales
   no hay redibujado. Se probó `serializationStrategy: "always"` en el loader
   y no evita el refresco: la señal vuelve a pedir el dato igual. Lo que sí
   lo evita es no leer el loader en el cliente al cargar: la tarea visible de
   `/proyectos/[id]` toma el id de la URL y recién lee `data.value` cuando
   hay un comentario confirmado. Cambiar el comportamiento del beta es una
   decisión aparte.
5. **Las pruebas sin JavaScript corren con `reducedMotion: "reduce"`**
   (`e2e/native-context.ts`). El CSS global respeta la preferencia y el clic
   no espera una animación que sólo avanza cuando Playwright fuerza un frame.
   No se relaja ninguna aserción: es la misma preferencia que puede tener una
   persona real.

Dos ajustes de 320 px salieron de la misma corrida, por las fuentes del runner
de CI: el encabezado de acceso oculta la marca escrita por debajo de 360 px (el
isotipo y la etiqueta accesible quedan) y la fecha del reloj de respuesta de un
reclamo puede encoger en vez de desbordar la página.

**Verificación.** Specs nuevos: `focus-when-rendered.spec.ts`,
`StatusSelect.spec.tsx` (elección conservada ante un redibujado, realineo al
cambiar el estado, `id` y opciones dentro de `Field`), más los existentes. Los
seis E2E que fallaban de forma determinista en CI pasaron tres veces seguidos
(39 de 39); el de estados de ejecución, 16 de 16 en las dos variantes;
`native-relations` baja de 45 s a 7 s por caso y la suite completa en serie,
de 26,6 a 16,7 minutos. Sin dependencias, migraciones, permisos, proveedores
ni cookies nuevas.

### D100 · Advisories en paquetes de runtime: excepciones del responsable atadas al árbol, y el riesgo residual de Zod 3

**Fecha:** 29 de octubre de 2026. **Estado:** vigente. Complementa D75 y D77.

**Por qué.** `pnpm audit --audit-level=high` bloqueaba `verificar` por dos
advisories que ninguna actualización compatible cierra:

- `GHSA-x586-xvc8-g7q6` sobre `@qwik.dev/core`. El rango publicado es
  `<2.0.0-beta37`, sin punto antes de 37, y semver ordena `beta` antes de
  `beta37`, así que marca `2.0.0-beta.40`. Upstream fija `2.0.0-beta37` como
  primera versión corregida y el camino de código que describe el advisory,
  `ResourceSerializer.$fill$` con `Promise.resolve` sobre un valor
  deserializado, es de la rama 1.x: en beta.40 los recursos se reconstruyen
  desde una señal asíncrona y ese serializador no existe. Es un falso
  positivo mecánico, no una decisión de aceptar un riesgo.
- `GHSA-mrhx-c7xc-m3w5` sobre `zod`. La copia directa pasó a 4.6.7; la copia
  `3.25.76` que trae `@qwik.dev/router` es la que valida los formularios
  (`zod$` y el `z` reexportado), no tiene arreglo en la rama 3.x, y forzarla a
  4.x rompe `zod$` en beta.40 (`instanceof z.Schema` no existe en Zod 4) y
  exige migrar la validación de 37 archivos, incluido `/consentimiento`. Qwik
  upstream sigue en Zod 3 incluso en `2.0.0-rc.4`.

**Qué se decide.**

1. **Excepciones del responsable, nunca genéricas.** `check-audit-ignores`
   sigue rechazando como dev-only cualquier paquete que llegue al Worker o al
   navegador. La única salida es una entrada que nombre el paquete con
   **todas** sus versiones presentes en el lockfile
   (`@qwik.dev/core@2.0.0-beta.40`, `zod@3.25.76,4.6.7`), cuyo motivo
   empiece con `excepción del responsable (Dn)` y que lleve fecha de
   revisión. El lint lee `pnpm-lock.yaml` y la invalida si aparece otra
   versión, una copia más o una menos: un cambio del árbol vuelve a poner el
   advisory sobre la mesa. Se anota hoy la de Qwik core; la de Zod sólo
   entra con la aprobación explícita del responsable sobre el texto final.
2. **Zod 3 no está corregido; se acota su superficie.** Las tres acciones que
   aceptan arrays de formulario (`option_id` al votar, `options` al crear una
   encuesta, `image_paths` al publicar un reclamo) cuentan los valores antes
   de que corra ningún esquema (`collectionLimits`,
   `src/lib/form-collection-limits.ts`): si un campo trae más de lo que el
   producto admite (10 opciones, 4 imágenes), la acción falla con 400 sin
   construir nada por elemento. El router ejecuta los validadores en orden
   inverso al declarado y corta en el primero que falla; el guardia se
   declara después de `zod$` y un spec fija que es el primero en correr en
   las tres acciones. El Worker ya limita el cuerpo a 5 MB. Un campo nuevo
   que acepte arrays trae su tope en la misma PR.
3. **Riesgo residual que se acepta de forma explícita, si el responsable lo
   aprueba.** Con el tope, Zod 3 nunca recibe más de 10 valores por campo en
   las tres superficies conocidas; fuera de ellas, cualquier esquema con
   `z.array` sin tope seguiría expuesto a acumular un issue por elemento
   inválido, acotado por los 5 MB de cuerpo y por los 128 MB del isolate del
   Worker: el efecto sería un error 1102 en esa request, no persistente. La
   excepción vence el 19-11-2026 y se revisa con cada cambio de versión de
   `zod` o de `@qwik.dev/router`.

**Verificación.** `scripts/test-check-audit-ignores.mjs` cubre las
excepciones con y sin versiones, con el árbol cambiado, con dos copias en
cualquier orden y sin fecha. `src/lib/form-collection-limits.spec.ts` prueba
el tope con 100.000 valores sin leer ningún elemento (un proxy que explota al
leer uno), el rechazo con 400 y mensaje, el paso dentro del tope y el orden
de los validadores en `useVote`, `useCreatePoll` y `useCreateClaim`;
`e2e/form-collection-limits.spec.ts` manda miles de valores a los tres
endpoints reales y espera el 400 del guardia, no el de Zod. Nada de esto
presenta la vulnerabilidad de Zod como corregida.

### D101 · Contraseñas de 12 caracteres con letras y números: se reduce la exigencia de cuatro clases de D91

**Fecha:** 30 de octubre de 2026. **Estado:** decidida por el responsable;
implementada en el preflight, el inventario de recuperación, la base local, la
app y la documentación. Modifica D91 en un solo punto, la contraseña "de 12
caracteres y cuatro clases" que compensaba el plan Free; D91 conserva su
texto con una nota. No cambia D68, D70, D73, D76, el gate de Turnstile A/B,
la reautenticación ni TOTP.

**Qué decide el responsable.** El proyecto de Producción
(`ibtvlvpxwourrxwcrfkf`, plan Free) exige desde el Dashboard un mínimo de
**12 caracteres** con **letras y números** ("Letters and digits") y mantiene
activado "Require current password when updating". Mayúsculas, minúsculas
combinadas y símbolos dejan de ser obligatorios. El mínimo de 12 no cambia.
TOTP sigue siendo opcional para la persona común y obligatorio (`aal2`) para
moderación y administración; Turnstile A/B, la reautenticación por nonce, la
verificación de la contraseña actual, los límites de GoTrue y el resto de las
atestaciones quedan como estaban.

**Por qué.** Las cuatro clases empujaban a patrones predecibles
("Agorbis2026!") sin sumar entropía real y hacían fallar altas legítimas. La
longitud es la protección que más pesa; el responsable prefiere una regla que
la gente cumpla con una frase larga a una que termine en un símbolo pegado al
final.

**Valor exacto.** El CLI de Supabase pineado en el repositorio (2.115.0)
acepta en `auth.password_requirements` sólo `""`, `letters_digits`,
`lower_upper_letters_digits` y `lower_upper_letters_digits_symbols`.
`letters_digits` equivale en la API de administración a
`password_required_characters =
"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789"`: al menos
una letra ASCII y al menos un dígito. La atestación
`SUPABASE_AUTH_PASSWORD_REQUIREMENTS` exige exactamente `letters_digits`;
cualquier otro valor, incluido el anterior, el rótulo del Dashboard o un valor
vacío, bloquea el preflight (D74). La app espeja la misma regla en Zod y en
los textos: una letra ASCII y un dígito, nunca una `ñ` sola como letra, porque
GoTrue tampoco la cuenta.

**Riesgo residual, aceptado y no mitigado por completo.** Supabase Free no
ofrece protección contra contraseñas filtradas (D91), y con esta decisión
tampoco hay exigencia de clases que frene una contraseña reutilizada o un
patrón común de 12 caracteres con letras y números, como "password2026x" o
"agorbis123456". Turnstile A/B y los límites por IP y por cuenta de GoTrue
encarecen el adivinado en línea; bcrypt del lado de Supabase encarece el
fuera de línea; la contraseña actual, la reautenticación y las
notificaciones de seguridad acotan lo que se puede hacer con una sesión
robada; TOTP protege a quien lo activa y a toda cuenta de moderación. Nada
de eso impide que una persona elija una contraseña ya filtrada en otro
servicio y la reutilice acá: ese riesgo queda abierto mientras el proyecto
esté en Free y lo asume el responsable. Se revisa al pasar a Pro, cuando
`SUPABASE_AUTH_LEAKED_PASSWORD_PROTECTION_ENABLED` vuelve a exigirse en
`true` sin tocar esta decisión.

**Qué muestra la interfaz.** El alta y el cambio de contraseña piden "al
menos 12 caracteres, con letras y números". El alta marca los tres
requisitos reales y dice que largo extra, mayúsculas o símbolos la hacen
más fuerte sin ser obligatorios; no califica ninguna contraseña como
"excelente". Las contraseñas existentes no se tocan: la política aplica al
crear o cambiar una.

**Implementación.** `scripts/production-preflight.mjs` y
`scripts/test-preflight.mjs` (atestación exacta, caso positivo, negativos por
valor vacío, valor anterior, `lower_upper_letters_digits` y rótulo del
Dashboard; aviso de Free reescrito); `scripts/recovery-inventory.mjs` y
`recovery/configuration-inventory.v1.json` regenerado con `--write`;
`supabase/config.toml` para paridad local y E2E; `src/lib/auth-security.ts`
y `src/lib/security.spec.ts`; `/registro`, `/perfil/contrasena` y sus
textos en `src/i18n/en/`; `e2e/account-registration.spec.ts`; README,
`.env.example`, `docs/PRODUCTION_RUNBOOK.md`, `docs/CLOUD_CONFIGURATION.md`
y `docs/RECOVERY_INVENTORY.md`. Sin hashes D72 ni políticas de release
tocadas, sin migraciones y sin operaciones remotas: el estado del Dashboard
lo confirma el responsable.

### D102 · rsc-harness como capa de agentes, subordinada a CLAUDE.md y sin sincronizar ni pushear por su cuenta

**Fecha:** 31 de octubre de 2026. **Estado:** decidida por el responsable;
instalada en el árbol local, pendiente de commit. No reemplaza ninguna
decisión anterior ni cambia una garantía del producto: es herramienta de
desarrollo, no llega al Worker ni al navegador de la persona.

**Qué se adopta.** [rsc-harness](https://github.com/ericrisco/rsc-harness)
3.6.0, instalado con `rsc onboard` (plan
`81bfc17eb976b54af385e2e35192b101d49242214bf62cbbbde1be441aab5336`: software
complejo, registro técnico, trabajo directo en `main`, destinos Claude Code y
Codex). Suma 31 skills (`.rsc/skills/`, enlazadas desde `.claude/skills/` y
`.codex/rsc/`), cinco subagentes de implementación y revisión adversarial,
hooks de Claude Code y Codex, `AGENTS.md`, `.rsc.json`, `01-TOOLS/` y
`02-DOCS/`. Se adopta por las skills de revisión y los subagentes que
refutan un diff con contexto limpio, no para reemplazar la documentación que
ya existe.

**Precedencia.** `CLAUDE.md`, este archivo y el README siguen siendo la
fuente. Si `AGENTS.md`, una skill de rsc o `02-DOCS/` dicen otra cosa,
manda `CLAUDE.md`. La constitución SDD
(`02-DOCS/wiki/sdd/constitution.md`) remite a las invariantes de
`CLAUDE.md` en lugar de copiarlas, para que no haya dos versiones que se
desfasen.

**Qué queda apagado y por qué.**

- **knowledge-sync** (`.rsc/.no-knowledge-sync`, `optOuts` en `.rsc.json`).
  Viene activo: al final de cada turno commitea `01-TOOLS/` y `02-DOCS/`, y
  en segundo plano pushea y trae la rama `rsc/knowledge`. El push y el pull
  los hace siempre el responsable, nunca un agente.
- **git-permissions** (`gitPermissions: false`). Viene activo en una
  instalación nueva y deja al agente commitear, pushear y abrir PRs sin
  preguntar. Por la misma razón, queda apagado.
- **gitmoji-guard** (`.rsc/.no-gitmoji`, `optOuts`). Rechaza los commits
  sin emoji, y la convención de Agorbis es `tipo(área): qué cambia`.
- **auto-update** (`RSC_NO_UPDATE_CHECK=1`). Consulta npm al iniciar cada
  sesión y puede correr `npx -y @ericrisco/rsc@<versión>`: código de un
  tercero, sin fijar, ejecutado en la máquina del responsable. La variable
  vive en `.claude/settings.local.json`; para Codex se exporta en el shell.
  Una versión nueva se instala sólo a mano, después de leer qué cambia.
- **trunk-guard** (`.rsc/.no-trunk-guard`). Cerraría `main` porque hay CI,
  y en este proyecto los cambios van directo a `main` cuando el responsable
  lo decide (`CLAUDE.md`, "Flujo").

**Lo que no aplica.** La skill `ship` dice que todo commit sale con la
autoría de su autor original y sin ningún trailer de IA, y manda a borrar
los que encuentre. En Agorbis el autor es el responsable y los commits
hechos con un agente llevan su línea `Co-Authored-By`: esa regla de `ship`
no se sigue, y ningún trailer existente se borra.

**Riesgo residual.** Cada sesión carga el bloque de `AGENTS.md` (unas 126
líneas en inglés) y varios hooks de rsc, que gastan contexto y pueden
empujar al agente a sus carriles FTD/SDD aunque la tarea no lo pida. En
Codex rsc no pone guards contra un commit a `main` ni un force-push: esa
política va en la configuración propia de Codex. Si en el uso real rsc
estorba más de lo que suma, se desinstala con `rsc purge` o skill por skill
con `rsc uninstall <id>`, sin tocar esta decisión salvo para anotar la baja.

### D103 · El catálogo del auditor de Supabase conserva la identidad completa de cada función

**Fecha:** 31 de octubre de 2026. **Estado:** decidida por el responsable;
implementada en el árbol local, pendiente de commit. Complementa D72: no
cambia gates, waivers, el parser del catálogo ni ninguna validación, y no
toca Producción.

**Qué pasaba.** En `D72_SUPABASE_CATALOG_SQL`
(`scripts/d72-supabase-readonly-policy.mjs`), la primera rama del `union all`
de `acl_entries` usaba `n.nspname` (tipo `name`) como `object_identity`.
PostgreSQL impone ese tipo a todas las ramas, así que la identidad
`proname(argumentos)` de cada función quedaba truncada a 63 bytes. Producción
tiene tres funciones con dos sobrecargas que comparten esos 63 bytes
(`community_public_members`, `global_search` y `personalized_feed`, que
`0062`, `0070` y `0071` amplían sin borrar la firma anterior). El catálogo
emitía entonces grants `EXECUTE` duplicados, el validador los rechazó como
corresponde y `pnpm audit:supabase:d72:readonly` terminó en
`QUERY_OUTPUT_REJECTED`. La etapa local sufrió el mismo rechazo, pero su
manejo de errores lo registra como `NOT_VERIFIED`, sin aviso.

La causa se confirmó el 31-10-2026 con consultas de sólo catálogo sobre
`ibtvlvpxwourrxwcrfkf`, en una conexión de sólo lectura
(`transaction_read_only = on`, rol `supabase_read_only_user`), sin leer filas
ni definiciones.

**Qué se decide.** La identidad se emite como `text`
(`n.nspname::text as object_identity`). La unicidad, el orden, los enums y los
topes del parser no cambian, y las sobrecargas no se borran: son parte de la
API pública y su eventual baja es otra decisión.

**Por qué cambian los hashes.** Son derivados del SQL y se recalculan solos;
ningún literal se re-baselinea.

- `D72_SUPABASE_READONLY_QUERY_SHA256.catalog`: de
  `e6d3776fb38405272f760aa9c62061e41bcc45b8c18f0472efa4085283ddef9c` a
  `88861e94bafe53b14119333f133d25b78e2b6d8cd33a9b7f1085f73e743e5175`.
- `D72_SUPABASE_READONLY_POLICY_SHA256`, que incluye ese digest: de
  `488fc2ade5c532207e4e9a8d406ace0f1ad932b3cc80bccce2ec6bf54370d6d5` a
  `e78c73c4099bf25a974df374fa40935617fabbc620dc5d92797d9049bf7c3101`.

No cambian `aggregate-checks`, la política de gates `D72/2026-09-08/v5`, el
contrato de scripts excepcional `v11` (D77), los pins de `supabase/tests` ni
`package.json`. Un recibo emitido con la política anterior conserva su hash
original como evidencia de esa política y no acredita la vigente: el
validador lo rechaza.

**Pruebas.** `scripts/test-d72-supabase-readonly-policy.mjs` fija el `::text`
y comprueba que dos grants con identidades largas que comparten 63 bytes son
válidos y que sus versiones truncadas se rechazan.
`scripts/test-run-d72-supabase-readonly.mjs` rechaza un recibo con la
política anterior. `scripts/test-d72-supabase-catalog-identity-local.mjs`
ejecuta el SQL fijado contra el PostgreSQL de Supabase local, con dos
sobrecargas de prueba dentro de una transacción revertida, lo pasa por el
parser y exige que ningún grant de función quede con una firma truncada. Esa
prueba habla sólo con un contenedor `supabase_db_*` del daemon Docker local,
nunca con Producción, y comprueba siempre que la transacción se revirtió,
también cuando falla; si fallan la verificación y la limpieza, informa las
dos. Corre en el job `integracion` de `.github/workflows/ci.yml`, después de
`pnpm db.test` y con el Supabase local que ese job ya levantó. La CI la llama
con `node`, así que `package.json` y el contrato de scripts de D77 no
cambian.

**Pendiente aparte.** `scripts/supabase-backup-lib.mjs` repite la misma
expresión en su catálogo de backup, y la etapa local del auditor convierte un
catálogo rechazado en `NOT_VERIFIED` sin distinguirlo de uno no disponible.
Las dos cosas se revisan por separado.

### D104 · La topología DNS no web pasa a v2 porque Resend migró a Forge

**Fecha:** 1 de noviembre de 2026. **Estado:** decidida por el responsable e
implementada. Complementa D72 y D92: cambia sólo la línea de base de
`network.production-dns-integrity`. No cambia el gate, los waivers, la
clasificación web ni Producción.

**Qué pasaba.** `scripts/cloudflare-dns-audit.mjs` fijaba
`agorbis-non-web-dns-topology/2026-08-31/v1`: 11 registros no web, con un MX y
un TXT SPF propios en `send.agorbis.com` para Resend. Al verificar
`agorbis.com` en Resend con Forge (30-10-2026, región `sa-east-1`), Resend
reemplazó ese par por dos CNAME y un TXT de verificación. La auditoría GET-only
del 01-11-2026 dio 12 registros no web y bloqueó.

**Qué se decide.** La línea de base pasa a
`agorbis-non-web-dns-topology/2026-11-01/v2`:

- SHA-256 no web
  `e7f8e3d420baceb49dc02b8128302bcbfd3a6713ec157607104c168d66ea257a`, tomado
  de la auditoría del 01-11-2026 (instantánea `01333a58…`) y recalculado
  desde esa instantánea.
- 12 registros: CNAME 5, MX 2, TXT 5. Controles de correo: DKIM 4, DMARC 1,
  MX 2, SPF 1.
- Salen: `send` MX y `send` TXT SPF. Entran: `send` CNAME
  `send.forge.rmta.net`, `rsend` CNAME `rsend-sae1.forge.rmta.net` y el TXT
  `resend-domain-verification` del apex. Los registros de Migadu, `_dmarc`
  (`p=quarantine`) y `resend._domainkey` no cambian.

**Por qué no es una excepción a "se corrige la zona, no el hash".** El cambio
viene del proveedor de correo declarado y coincide con los registros que
Resend muestra para el dominio. Cualquier otro cambio de la zona sigue
corrigiéndose en la zona. Un cambio deliberado nuevo (DMARC más estricto,
otro proveedor) exige otra versión con su propia `Dn`.

**Terceros (D76).** Los CNAME apuntan a infraestructura de Resend, que ya está
declarada. Ni el navegador ni el Worker los contactan, así que no cambian la
CSP ni `/subencargados`. La región de envío sigue sin publicarse:
`PUBLIC_RESEND_PROCESSING_LOCATION` queda pendiente por
`privacy.provider-locations-unverified`.

**Pruebas.** `scripts/test-cloudflare-dns-audit.mjs` fija los valores v2 y usa
un fixture con la forma Forge. Prueba además que volver al MX y SPF de v1,
perder `rsend` o redirigir `send` cambian el hash y fallan cerrados. Antes del
commit, la clasificación de la instantánea real dio `approved: true` con v2, y
la misma instantánea con el MX de v1 agregado dio 4 errores.

### D105 · El auditor D72 de Supabase admite el enlace local a Producción

**Fecha:** 1 de noviembre de 2026. **Estado:** decidida por el responsable e
implementada. Reemplaza la precondición `supabase.no-linked-project` de la
evidencia `d72-supabase-ledger-read-and-dry-run` (D72) por
`supabase.linked-project-absent-or-production`. No cambia gates, waivers,
consultas, hashes ni Producción.

**Qué pasaba.** El auditor de sólo lectura corre `supabase migration list` y
`supabase db push --dry-run` con `--project-ref` explícito. Sin enlace local,
la CLI 2.115.0 se conecta directo a `db.<ref>.supabase.co`, que en el plan
Free (D91) sólo tiene IPv6. Desde una red sin IPv6, la etapa termina en
`MIGRATION_EVIDENCE_FAILED`: la CLI responde `LegacyDbConfigIpv6Error` y
sugiere `supabase link` para usar IPv4. Además, el enlace local de la máquina
del responsable apuntaba todavía al proyecto anterior `efdttehnzuuuctnrgfmj`.

**Qué se decide.** El enlace local está permitido sólo si es al proyecto de
Producción `ibtvlvpxwourrxwcrfkf`. Los comandos de D72 siguen nombrando
`--project-ref` explícito, así que el enlace no puede desviar el destino:
sólo le da a la CLI la dirección del pooler. `--linked` sigue prohibido. El
responsable eligió este camino frente a conseguir IPv6 (datos móviles o
WARP), para simplificar el despliegue.

**Riesgo aceptado.** Con Producción enlazada, un comando manual con
`--linked` apuntaría a Producción. La regla del runbook ("No usar nunca
`--linked`") es la mitigación. La precondición sigue declarada, como antes, y
el runner no la comprueba. No se agrega una comprobación en código porque el
resultado dependería del `supabase/.temp` de cada máquina, y los tests del
runner usan la raíz real del repositorio.

### D106 · La política D72 pasa a v6 con revisión al 30-11-2026

**Fecha:** 1 de noviembre de 2026. **Estado:** decidida por el responsable e
implementada. Reemplaza la fecha de revisión del 14-09-2026 que fijaban las
revisiones v4 y v5 de D72. No cambia gates, resultados, consecuencias,
owner, waivers ni controles no renunciables.

**Qué pasaba.** Los siete riesgos elegibles de D72 (AAIP, retención,
ubicaciones y retención de proveedores, salvaguardas de transferencias,
backup productivo y omisión de 0059) tenían `reviewRequiredBy` 2026-09-14.
`validateExceptionalReleaseRequest` rechaza cualquier aceptación después de
esa fecha y pide una política nueva, así que ningún request de release podía
validar.

**Qué se decide.** La política pasa a `D72/2026-11-01/v6`, SHA-256
`59f6283b36a2805ee73710d6f1223d3c98385cf732d72e3eba31dcab4053c03e`, con
`reviewRequiredBy` 2026-11-30 para los siete. El responsable eligió cuatro
semanas: cubren la primera semana con usuarios y el backup real. El backup de
Producción se omite en este release como riesgo aceptado
(`recovery.production-backup-not-verified`), porque la base sólo tiene un
usuario invitado y ningún contenido cívico.

**Riesgo aceptado.** Hasta el 30-11-2026 se puede abrir con AAIP sin
constancia aprobatoria, sin salvaguardas de transferencias verificadas y sin
backup productivo. Cada riesgo se sigue confirmando fila por fila por
`/dev/tty` en el acta. Después de esa fecha, el próximo release exige
revisar los riesgos y emitir otra política.

**Pruebas.** `scripts/test-release-gate-policy.mjs` fija la versión, el hash
y la fecha nuevos, y falla contra la política v5. Un request con los siete
riesgos valida sin errores hoy, y el mismo request evaluado el 01-12-2026 da
siete errores de fecha de revisión vencida.

### D107 · Salida simple a Producción con `pnpm deploy:open`

**Fecha:** 2 de noviembre de 2026. **Estado:** decidida por el responsable e
implementada. Reemplaza como camino obligatorio al flujo excepcional de D72
(certificación no stateful, canary aislado, acta de 60 minutos, cutover y
recuperación ligados por hashes). No cambia la política de gates (D106), los
riesgos aceptables, el preflight ni los invariantes de CLAUDE.md.

**Qué pasaba.** El flujo de D72 exigía PASS de 27 controles no renunciables
antes de emitir el acta. Siete de ellos (Auth, SMTP, Turnstile A y B, Storage
privado, CSP y cookies) sólo podían pasar con el canary stateful, pero
`scripts/run-d72-canary.mjs` es plan-only: su executor productivo nunca se
construyó. El dry-run no podía terminar en exit 20, no había acta y el
cutover no podía correr. Además, cada corrida dependía de la suite e2e local,
inestable en una máquina con varios stacks Docker.

**Qué se decide.** `pnpm deploy:open` (`scripts/run-simple-open-release.mjs`)
abre Producción en un comando:

- exige `main` limpio e igual a `origin/main`;
- arma el request con los siete riesgos canónicos de la política vigente y
  pide al responsable escribir `ACEPTO` una vez por `/dev/tty`, así ningún
  proceso sin terminal puede abrir en su nombre;
- corre `scripts/cloudflare-build.mjs --exceptional-request`, que ejecuta
  `test`, `test.release`, el build abierto y el preflight real, y publica la
  copia legal honesta de pendientes;
- ejecuta `wrangler deploy --config wrangler.jsonc --strict --no-autoconfig`;
- corre el smoke público de sólo lectura e imprime una verificación manual de
  ocho pasos.

La vuelta atrás es `pnpm deploy:closed`. `--dry-run` hace todo sin subir.

**Riesgo aceptado.** Auth, SMTP, Turnstile, Storage privado, CSP y cookies
dejan de probarse por máquina antes de abrir: los verifica el responsable a
mano después de abrir, con el sitio ya público. La suite e2e deja de correr
en la máquina local antes del deploy; la cubre la CI de cada push. El código
de D72 queda en el repositorio y deja de ser obligatorio.

**Pruebas.** `scripts/test-simple-open-release.mjs` cubre argumentos, Git
limpio y alineado, el request válido para el validador real (y su rechazo
con la revisión vencida) y que `--dry-run` nunca despliegue ni corra el
smoke. Quitar el chequeo de `origin/main` o el `--dry-run` del deploy hace
fallar el test.

### D108 · El registro pide los acuerdos con dos casillas, también en /consentimiento

**Fecha:** 2 de noviembre de 2026. **Estado:** decidida por el responsable e
implementada. Cambia la forma del gate legal (D70, D73), no lo que registra.

**Qué pasaba.** El alta pedía los acuerdos dos veces con formas distintas: 2
casillas en `/registro` (`LegalConsentFields`) y 5 en `/consentimiento`
(Términos, Privacidad, Normas, edad y transferencias), con otro diseño y un
enlace "Volver a mi perfil" que no tenía sentido para una cuenta nueva. El
camino completo tenía 7 pantallas más el correo.

**Qué se decide.**

- `/consentimiento` usa el mismo `LegalConsentFields` que el registro: una
  casilla para Términos, Normas, Privacidad y edad, y otra, separada, para
  las transferencias internacionales con la versión del aviso. El texto es
  idéntico en los dos lugares.
- La base registra lo mismo que antes: `accept_current_legal` (cada documento
  vigente con su versión y la atestación de edad) y
  `grant_current_international_transfer_consent` (versión, hash del aviso y
  locale), siempre desde la sesión de la persona. Las casillas del registro
  siguen sin guardarse: aceptar en el alta permitiría que un tercero dejara
  una aceptación a nombre de un correo ajeno.
- Las versiones vigentes quedan a la vista debajo del formulario. Una cuenta
  nueva no ve "Volver a mi perfil"; una cuenta existente que reacepta
  documentos nuevos sí.
- El botón de `/auth/confirm` se mantiene: un scanner de correo que abre el
  enlace no debe gastar el token.
- En `/registro`, la pista de contraseña desaparece cuando la lista de
  chequeo ya dice lo mismo, las dos casillas comparten un bloque y, tras un
  rechazo de Turnstile, el aviso pide reintentar en vez de contradecir al
  widget renovado. El texto de transferencias sigue visible: es una
  declaración en primera persona y no se esconde en un desplegable.
- En el onboarding, el nombre de usuario se completa desde el nombre para
  mostrar (no desde el correo, para no publicar parte de la dirección) y
  `?paso=` no saltea el primer paso de una cuenta sin usuario elegido.

**Riesgo aceptado.** Una sola casilla cubre tres documentos y la edad, en
lugar de cuatro casillas separadas. Es la misma forma que el registro ya
usaba; la casilla de transferencias sigue separada y expresa.

**Pruebas.** `src/lib/auth-navigation-flow.spec.ts` llama a la acción con los
campos nuevos y falla con los viejos; `e2e/smoke.spec.ts` recorre el alta
con las dos casillas; `e2e/account-round-three.spec.ts` cubre la sugerencia
de usuario y el salto de paso (falla si se quita la redirección);
`e2e/account-registration.spec.ts` cubre la pista de contraseña.

### D109 · Turnstile A en modo invisible, con Privacidad 2026-11-02.1

**Fecha:** 2 de noviembre de 2026. **Estado:** decidida por el responsable e
implementada. Cambia la versión de Privacidad (D70, D73); Términos, Normas y
el Aviso de transferencias quedan igual.

**Qué pasaba.** El widget A de Turnstile estaba en modo `managed` y mostraba
un recuadro en los formularios de acceso. El responsable pidió el modo
invisible. Cloudflare lo condiciona: "As a condition of enabling invisible
mode, you must reference Cloudflare's Turnstile Privacy Addendum in your own
privacy policy" (docs de Turnstile, "Invisible mode"). La política vigente
mencionaba Turnstile A/B pero no citaba el anexo.

**Qué se decide.**

- Privacidad `2026-11-02.1` agrega, al final de "Proveedores y
  transferencias", un párrafo ES/EN: el widget A es invisible, verifica datos
  técnicos del navegador y su tratamiento por Cloudflare se rige por el
  Turnstile Privacy Addendum
  (https://www.cloudflare.com/turnstile-privacy-policy/). Lo que Turnstile
  hace o no hace se atribuye a Cloudflare, no se afirma como verificado.
- `0073_turnstile_invisible_privacy_addendum.sql` retira `2026-08-29.1` con
  guard y conteo de filas e inserta la versión nueva con su hash. No crea
  aceptaciones: cada persona vuelve a aceptar desde su sesión.
- `check-pending-external-evidence-legal-draft` admite sólo esta versión
  posterior, exige que 0073 retire la versión y el hash del acta del 29-08 y
  sigue exigiendo cada parche honesto del acta sobre el contenido vigente.
- `TurnstileGate` deja de reservar 65 px: en Producción no hay recuadro.
- El widget A pasa a `invisible` en Cloudflare recién cuando Privacidad
  2026-11-02.1 está publicada en Producción.

**Orden de despliegue.** La 0073 y el código nuevo van juntos: con uno sin el
otro, `/consentimiento` compara versiones distintas y no deja continuar.
Primero `supabase db push` (dry-run, autorización y contraseña por teclado),
después `pnpm deploy:open`, y al final el cambio de modo del widget.

**Riesgo aceptado.** La persona no ve ningún indicio de la verificación; la
transparencia queda en Privacidad y `/subencargados`. Las dos cuentas
existentes en Producción tienen que volver a aceptar Privacidad.

### D110 · El alta muestra su recorrido completo y usa el ancho en desktop

**Fecha:** 2 de noviembre de 2026. **Estado:** decidida por el responsable e
implementada. Cambia la presentación del alta (D108), no qué se pide ni qué
se registra.

**Qué pasaba.** Después de registrarse en Producción, el responsable revisó
el recorrido completo. Cada pantalla contaba sus pasos por su cuenta (el
onboarding decía 3 y los acuerdos ninguno), todo vivía en una columna de
528 px con el resto del escritorio vacío, la lista de lugares tenía un
scroll interno de 320 px, el filtro rápido mostraba "6 de 6", `/auth/confirm`
repetía "confirmá" tres veces y `/consentimiento` mostraba arriba un aviso
naranja con un botón a sí mismo.

**Qué se decide.**

- `SignupProgress` muestra los cinco pasos (cuenta, correo, acuerdos,
  nombre, comunidad): en desktop como columna fija a la izquierda y en
  celular como "Paso n de 5" con una barra. `AuthShell` lo suma con
  `progress` y amplía el contenido con `wide`.
- El paso "lugar" usa todo el ancho y la lista de residencia es una grilla
  por container queries (1, 2 o 3 columnas según el espacio, también en
  `/perfil/residencia`), sin scroll interno. El filtro rápido sólo aparece
  si recorta la lista.
- "Confirmar" usa dos columnas en desktop: la cadena de comunidades a la
  izquierda y el aviso de 30 días con el botón a la derecha.
- `/auth/confirm` deja título, subtítulo y botón; el aviso de participación
  del layout no aparece en `/consentimiento` (salvo una suspensión).
- El nombre de usuario sugerido corta en palabras enteras
  ("sebastian_cardoso").
- "Revisá tu correo" ofrece "Abrir Gmail" (u Outlook, Yahoo, iCloud,
  Proton) cuando el dominio es conocido: es un enlace que la persona abre,
  sin contactar ningún host por su cuenta (D76).

**Pruebas.** `username-suggestion.spec.ts` y `webmail.spec.ts` cubren las
funciones puras; `e2e/smoke.spec.ts` verifica el paso actual en acuerdos y
nombre y la ausencia del aviso en `/consentimiento`.

### D111 · El contenido llega a 96rem en pantallas anchas

**Fecha:** 2 de noviembre de 2026. **Estado:** decidida por el responsable e
implementada.

**Qué pasaba.** En un monitor de 1920 px el contenido (`--width-content`,
80rem) dejaba unos 320 px vacíos a cada lado. El responsable pidió aprovechar
ese ancho.

**Qué se decide.** `--width-content` pasa a 96rem (1536 px, unos 190 px por
lado a 1920) y el marco del alta, su encabezado y su pie pasan de 72rem a
80rem. La prosa larga sigue en `--width-reading` (42rem): los textos de
encuestas y proyectos, que corrían todo el ancho de su columna, suman
`measure`. Explorar comunidades usa cuatro columnas desde `2xl`.

**Pruebas.** Capturas locales a 1920 px de una comunidad y de explorar; los
e2e de navegación y regresiones visuales a 1280 px siguen en verde.

### D112 · Novena ronda: el primer uso real manda; se aplican cuatro de diez mejoras

**Fecha:** 3 de noviembre de 2026, con cierre el 4. **Estado:** aplicadas las
mejoras 1 a 4. El responsable postergó las otras seis y decidió cerrar con los
controles de cada mejora. Complementa D74, D75, D79, D94, D96, D99, D108 y D110. El
estado de cada mejora está en `docs/mejoras-priorizadas.md` (novena ronda).

**Qué pasaba.** Producción se abrió el 2 de noviembre y casi todas sus 3.901
comunidades están vacías. Una auditoría en navegador real, con cuentas nuevas y
sobre todo a 390 px, encontró fallas que `tsc`, ESLint, Vitest y los E2E no veían:
el llamado que un estado vacío pide tocar podía terminar en "Se rompió algo de
esta página"; "Revisar" dejaba la pantalla en el pie; una acción con la red caída
dejaba el botón y el velo clavados, sin ningún mensaje; "cordoba" sin tilde daba
cero; una visitante leía una encuesta sin sus opciones y, en las encuestas sin
autor, veía "Zona del autor" con "Sí, cerrar la votación".

**Qué se decide.** Sólo presentación y navegación: la base sigue decidiendo los
permisos (invariante 1), no cambia qué se registra y no hay migraciones,
dependencias ni hosts nuevos.

- Sin sesión no hay autoría: `null === null` le ofrecía la gestión a una visitante
  en todo contenido sin autor, y deja de contar. RLS sigue decidiendo si la acción
  pasa.
- Mostrar las etiquetas de una encuesta a quien no puede votar no rompe D68: el
  loader ya las devuelve a todos y el widget de la comunidad las publica. Se
  muestran sin conteos ni marcas.
- En las rutas de creación la cabecera de comunidad no se dibuja. Las pestañas se
  conservan porque D79 las eligió. El contenedor también pierde su relleno lateral:
  el formulario ya trae el suyo, y con los dos el primer campo quedaba debajo de la
  barra inferior del teléfono.
- Revisar y Volver a editar llevan la pantalla y el foco al título. Lo pide cada
  ruta con la prop `revealOnMount`, porque `FormShell` se vuelve a montar entre
  ramas. Una carga directa o un rechazo no mueven nada.
- La región viva del layout anuncia el título sólo si cambió la URL, incluida la
  búsqueda. Tras una acción en la misma URL avisa el foco o el mensaje de quien la
  hizo (WCAG 4.1.3). Tras un filtro sigue avisando que terminó.

**Un rodeo al beta que D75 debe revisar en cada actualización.** `holdFocus`, en
`src/lib/focus-when-rendered.ts`. Cada cambio de `isNavigating` redibuja el layout
raíz, que retira la página del `<main>` y la vuelve a insertar, y el navegador manda
el foco al `body`. `holdFocus` lo devuelve durante hasta 5 s y suelta al primer toque
o tecla. Lo usan el título de `FormShell` y `PublicationError`. Sobra si una versión
del beta deja de reinsertar la página, o si `isNavigating` sale del render del layout.

**Postergado por el responsable, sin implementar.** Las mejoras 5 a 10 no existen en
el código. Si se retoman, estas definiciones se revisan antes de aplicarlas:

- Las marcas "Ya votaste" y "Apoyaste" de Inicio salen de los recibos y apoyos
  propios, los mismos que ya muestra el listado. No guardan ni revelan la elección
  (D68).
- El botón de ubicación del alta deja de afirmar "Detectamos": ofrece una lista
  con la ciudad y las provincias más cercanas, porque sólo Buenos Aires tiene
  localidades y lo más cercano suele ser otra jurisdicción. Sigue usando la
  coordenada gruesa (invariante 10).
- **Recarga única tras un fallo de navegación interna**, también un rodeo al beta.
  Un `Link` a una ruta que redirige en el servidor puede romper el render con
  `NotFoundError` de `insertBefore`. Recargar siempre recupera, porque la URL ya es
  la final. El `fallback$` de `ErrorBoundary` recargaría una sola vez por entrada
  del historial, y sólo si hubo navegación interna, con un texto neutro.
- **Guardián de acciones**, también un rodeo al beta. El router no atrapa un `fetch`
  rechazado y descarta una respuesta que no sea JSON, así que la promesa de la acción
  no se resuelve nunca. Un script con nonce, como el de tema, envolvería
  `window.fetch` sólo para los POST con `qaction=` y devolvería un fallo con el
  formato de `ev.fail`. Ese formato es interno de Qwik: un spec lo pasaría por
  `_deserialize`, para que una actualización del beta falle ahí y no en Producción.
  El mensaje no afirmaría que no se guardó, porque el POST pudo haber llegado (D74).

**Pruebas.** Cada mejora se comprobó sobre su commit con `pnpm lint`,
`pnpm build.types`, `pnpm test` y sus E2E, y la mejora 3 además con
`pnpm test.release`. Sobre `3928bde`: lint y tipos en verde, 1.311 pruebas y 53 E2E en
serie. `publication-drafts.spec.ts:4` ya perdía el foco del rechazo 1 de 6 veces
antes de la ronda, con la máquina cargada; con `holdFocus` pasa 8 de 8. **No se
corrió**, por decisión del responsable: la suite E2E completa ni una revisión
adversarial. Tampoco `test.release` sobre `3928bde`. Se probó sólo en Chromium, sin
lector de pantalla real, sin teléfono real y sin tocar Producción.

**Lo que falta y no entra acá.** Cargar las localidades de las otras 23
jurisdicciones es lo que más cambiaría el primer uso fuera de Buenos Aires, y exige
una migración del responsable.

### D113 · ECC se adopta como caja de herramientas del agente, sin instalador ni copias en el repo

**Fecha:** 7 de noviembre de 2026. **Estado:** adoptado. Complementa D102 (rsc-harness)
y no cambia ninguna invariante del `CLAUDE.md`. El detalle operativo está en
`02-DOCS/wiki/ftd/adopcion-ecc.md`.

**Qué pasaba.** El responsable instaló hoy el plugin `ecc@ecc` 2.2.3 (Everything
Claude Code, repo canónico `affaan-m/ECC`) con alcance de usuario y pidió "usarlo en
Agorbis" apuntando a `WorldFlowAI/everything-claude-code`, una copia sin actividad
desde el 23 de enero de 2026. El plugin ya corría en la sesión: sus reglas en
`~/.claude/rules/ecc/`, 71 agentes `ecc:*`, skills y el hook GateGuard que exige
hechos antes de la primera orden de shell. Su instalador (`install-apply.js`)
copiaría 805 archivos a `~/.claude/` o 936 a `.claude/` del repo, duplicando lo que
el plugin provee. Su auditoría de repositorio (`harness-audit.js`, rúbrica
2026-05-19) dio 40/49 con cuatro controles en falta.

**Qué se decide.**

- **Fuente:** el plugin canónico, con alcance de usuario. No se usa la copia de
  WorldFlowAI ni el instalador, y ningún archivo de ECC entra al repo. Lo único
  versionado es esta decisión y el documento FTD.
- **Jerarquía cuando chocan.** `CLAUDE.md` y sus invariantes mandan; después
  `DECISIONS.md`; después el método de carriles de rsc (D102: Respuesta, FTD, SDD);
  ECC aporta agentes, revisiones y auditorías y cede ante todo lo anterior. Choques
  conocidos: ECC admite los tipos de commit `perf` y `ci`, acá no; ECC exige TDD y
  80 % de cobertura, acá rige "la lógica nueva trae spec" sin umbral numérico y los
  asserts no se debilitan para alcanzar un número; ECC pide buscar implementaciones
  existentes antes de escribir, compatible con D76 sólo si ningún tercero nuevo
  entra sin CSP, `/subencargados`, Privacidad y `Dn` en la misma PR.
- **Uso concreto.** Tras cada cambio de código, `ecc:code-reviewer` y
  `ecc:typescript-reviewer`. Antes de un commit que toque cuentas, entradas de
  personas, cabeceras, SQL o terceros, `ecc:security-reviewer`. En migraciones y
  RLS, `ecc:database-reviewer` propone y el responsable aplica (CODEOWNERS). En
  funciones nuevas, `ecc:tdd-guide`. En pantallas, `ecc:a11y-architect`, que cubre lo
  que motivó D112. Para las mejoras 5 y 10 de D112, `ecc:silent-failure-hunter`. Al
  cerrar cada ronda, `/ecc:harness-audit` sobre el repo, con el puntaje anotado en el
  FTD de la ronda.
- **Los cuatro controles en falta se aceptan como deliberados, no se maquillan.**
  Memoria durable: `DECISIONS.md` con 112 decisiones y `02-DOCS/wiki` ya lo son; la
  rúbrica sólo busca `.claude/memory.md` o `docs/adr/` y no se duplica nada para
  sumar puntos. Carpeta `evals/`: Vitest, Playwright, `supabase/tests` y
  `scripts/test-*` ya cubren los flujos críticos. Plantillas de issues en
  `.github/ISSUE_TEMPLATE/`: útiles cuando haya más personas; `.github/` es del
  responsable y queda como propuesta. Workflow de Cloudflare: no existe a propósito,
  Producción se abre y cierra a mano con `pnpm deploy:open` y `deploy:closed` (D107).
- **Hooks.** GateGuard de ECC y las guardas de rsc conviven sobre Bash. Si el gate
  estorba un trabajo, se apaga ese hook con `ECC_DISABLED_HOOKS`; no se quita rsc ni
  se relaja ninguna guarda del repo.

**Qué no cambia.** Flujo de push y pull en manos del responsable, archivos de
`.github/CODEOWNERS` intocables para el agente, y las once invariantes.

### D114 · Un envío nunca queda mudo: guardián de acciones en el navegador

**Fecha:** 7 de noviembre de 2026. **Estado:** aplicado. Cierra la mejora 10 de
D112 y agrega un rodeo al beta que D75 revisa en cada actualización. Complementa
D74 y D99. Detalle en `02-DOCS/wiki/ftd/envio-nunca-mudo.md`.

**Qué pasaba.** Con la red cortada al publicar o comentar, el botón quedaba
apagado y el velo tapando el formulario, sin ningún mensaje; lo mismo si el
servidor devolvía HTML en lugar de JSON (un 502 del borde, por ejemplo). Y un
segundo toque rápido mandaba otro POST, que podía duplicar un reclamo. Causa,
verificada en `@qwik.dev/router` 2.0.0-beta.40: `submitAction` hace el `fetch`
sin `try/catch` y devuelve `undefined` si la respuesta no es JSON, así que la
promesa de la acción no se resuelve nunca e `isRunning` e `isNavigating` quedan
en `true`. Además `Form` no frena un segundo `submit` cuando recibe un solo
`onSubmit$`, e `isRunning` recién apaga el botón cuando Qwik vuelve a pintar.

**Qué se decide.**

- **Un script inline con nonce en `root.tsx`**, armado en
  `src/lib/action-guard.ts` como el de accesibilidad, que corre antes del primer
  envío sin descargar nada. Envuelve `window.fetch` sólo para los POST con
  `qaction=`: un rechazo, una respuesta sin JSON, un JSON cortado o un 5xx sin
  `result` (una acción que lanzó) se convierten en una respuesta JSON con el
  formato interno de `_serialize` y un resultado `{ failed, undelivered,
message }`. El router la resuelve por su camino normal: el botón vuelve, el
  velo se va y la pantalla muestra el mensaje con el foco. Deja
  `data-action-guard="on"` en `<html>`; si no pudo instalarse, `"failed"`, y el
  E2E lo comprueba en una página real.
- **Bloqueo del doble envío en captura sobre `window`**, que corre antes que el
  cargador de Qwik (escucha en `document`). El primer `submit` de un formulario
  con `method="post"` y `action` con `qaction=` lo marca con
  `data-action-pending`; cualquier otro se frena hasta que el router despacha
  `submitcompleted` o hasta que el `fetch` de esa acción se asienta.
  (`preventdefault:submit` no sirve de criterio: Qwik 2 no lo deja como
  atributo.) `pageshow` limpia lo que haya quedado al volver desde la caché del
  navegador, y el asistente de proyectos, que envía a mano con
  `submit(FormData)`, suelta la marca él mismo cuando su validación local decide
  no enviar.
- **Honestidad (D74).** Ningún texto afirma que no se guardó: el POST pudo haber
  llegado. El mensaje es el mismo para cualquier acción (también ingresar, votar
  o comentar), así que habla de "el cambio" y no de publicar; `PublicationError`
  le pone el título "No sabemos si se publicó". Tras un corte en la revisión el
  formulario vuelve a la edición con lo escrito intacto, porque la revisión
  venía del servidor. Entre la confirmación de la base y la ficha, los cuatro
  formularios mantienen el botón bloqueado y avisan "Publicado. Abriendo la
  publicación…" con un enlace a la ficha como salida, porque
  `publicationResult` sólo devuelve `published` después de la escritura; si la
  navegación interna falla, se hace una carga completa.
- **Formato interno, vigilado.** `undeliveredResultWire` reproduce la salida de
  `_serialize` para ese objeto y el spec la pasa por `_deserialize` del core: si
  una beta cambia el formato, falla la suite y no Producción. Es la condición
  que D112 puso para este rodeo.

**Qué no cambia.** Las acciones y sus validaciones, el router, el gate legal y
RLS. Un `fetch` que cuelga sin rechazar sigue esperando al navegador: no se
inventa un tiempo límite. Una navegación completa durante el envío sigue
pudiendo duplicar si el POST llegó: la solución real es una clave de
idempotencia en la RPC, migración del responsable, y queda como propuesta.

### D115 · Los llamados a publicar llegan: enlaces que aciertan y un límite de errores que se recupera

**Fecha:** 7 de noviembre de 2026. **Estado:** aplicado. Cierra la mejora 5 de
D112 y agrega un rodeo al beta que D75 revisa en cada actualización. Complementa
D74, D93, D96 y D114. Detalle en `02-DOCS/wiki/ftd/llamados-que-llegan.md`.

**Qué pasaba.** En una comunidad vacía, tocar "Crear la primera encuesta" podía
terminar en "Se rompió algo de esta página". Se reprodujo en local de dos
maneras: una visitante que abre el diálogo "Publicar" de la barra inferior en
`/c/earth` y toca "Encuesta" termina en `/ingresar` con la pantalla rota; una
cuenta nueva sin residencia, con red de 3G lento, termina en `/onboarding` con la
pantalla rota, `insertBefore` en consola y "Cargando página…" clavado. Causa, en
`@qwik.dev/router` 2.0.0-beta.40: en una navegación interna, si el loader del
destino redirige en el servidor, el cliente devuelve el valor anterior del loader
(vacío), dispara otra navegación con `goto` y la página destino se dibuja sobre
datos vacíos mientras cambia el árbol. El `ErrorBoundary` del router nunca borra
`store.error`, así que el aviso quedaba aunque la URL final ya hubiera cargado.

**Qué se decide.**

- **Enlaces que ya saben a dónde ir.** `publicationEntryHref`
  (`src/lib/publication-entry.ts`) reproduce el orden de los loaders del
  servidor con lo que la página ya sabe de la persona: sin sesión, a ingresar
  con `next`; con sesión y sin residencia, a elegir residencia con `next`; con
  residencia pero fuera de la comunidad, al selector `/publicar`; si vive ahí, al
  formulario. Lo usan los cuatro llamados de la comunidad vacía y el diálogo
  "Publicar" de la barra inferior. El cupo agotado no se conoce en el cliente y
  sigue redirigiendo en el servidor. La base y los loaders siguen decidiendo
  (invariante 1): el enlace sólo acierta más seguido.
- **Un límite de errores que se recupera** (`RecoveringErrorBoundary`, lógica
  pura en `src/lib/error-recovery.ts`) reemplaza al del router en el layout
  raíz y conserva sus dos entradas: el store de `useErrorBoundary`, que el core
  llena con los errores de render, y el oyente de `qerror`, por donde el
  cargador avisa de un manejador que lanza o un chunk que no carga. Si el error
  llega menos de 4 s después de un cambio de **ruta** (`pathname`; ni la query
  de un filtro ni el `isNavigating` de una acción cuentan, porque recargar ahí
  tiraría el resultado de la acción), marca `history.state` y recarga la página
  una sola vez por entrada del historial: la URL ya es la final, así que la
  recarga sirve la página correcta. Mientras tanto muestra "Un momento…" en vez
  de "Se rompió algo", porque afirmar que se rompió mientras la página correcta
  está llegando sería falso (D74); si la recarga no ocurre en 5 s (un
  `beforeunload` cancelado, `history` que rechaza la marca), cede al aviso de
  siempre. Antes de recargar deja en consola una línea con el tipo del error,
  sin mensaje ni URL (invariante 10). Si tras recargar vuelve a fallar, o si el
  error no vino de una navegación, queda el aviso. Se descartó recuperar en el
  lugar sin recargar: tras el fallo el router queda trabado (`isNavigating` en
  `true`, la segunda navegación no termina) y la URL ya era la final cuando
  llegó el error, así que no había señal para borrar el error ni árbol sano que
  volver a dibujar. Se comprobó con una reproducción determinista por SPA.
- **Alcance de la capa A.** `hasResidence` sale de `profile.home_community_id`,
  la misma señal que `requireResident`, y no de la cadena de residencia, que
  puede venir vacía por un fallo de consulta. Otros enlaces a los formularios
  (Inicio, el mapa, la ficha de un reclamo) siguen apuntando directo y, para una
  visitante, pasan por la redirección del servidor: los cubre la capa B. Si se
  los quiere adelantar, usan el mismo ayudante.
- **Un cambio visible y deliberado.** Para una visitante, los enlaces del diálogo
  "Publicar" ya no apuntan al formulario sino a ingresar con el formulario como
  destino. El E2E `ui-ux-regressions` cambia su aserción por eso.

**Qué no cambia.** El router, las reglas del servidor sobre quién publica,
migraciones y archivos de `CODEOWNERS`. La recarga única es la que D112 había
pensado; es el único camino que recupera con el router trabado.

### D116 · La comunidad vacía ofrece algo que ya se puede hacer y no afirma lo que nadie eligió

**Fecha:** 7 de noviembre de 2026. **Estado:** aplicada. Es la mejora 6 de D112,
que el responsable había postergado. Complementa D68, D74, D112 y D115. El
documento de trabajo está en `02-DOCS/wiki/ftd/comunidad-vacia-con-algo-para-hacer.md`.

**Qué pasaba.** Casi todas las 3.901 comunidades de Producción están vacías. Quien
llegaba a una leía "todavía no tiene publicaciones" y cuatro llamados a publicar,
y nada que pudiera hacer ya mismo, aunque su provincia, su país y la Tierra tenían
encuestas abiertas que una residente puede votar. En "Más herramientas", la lista
"Tu camino cívico" dejaba marcar tres casillas a mano y, con las tres, decía
"¡Felicitaciones! Completaste tu camino cívico": un logro que la base nunca
registró (D74). Y la cabecera le decía "Tu residencia declarada no pertenece a
{{name}}" a cualquier persona con sesión que no fuera miembro, incluida la que
todavía no eligió dónde vive; el estado vacío le pedía "revisá tu residencia" por
el mismo motivo.

**Qué se decide.** Sólo presentación: la base sigue decidiendo los permisos
(invariante 1), no cambia qué se registra y no hay migraciones, dependencias ni
hosts nuevos.

- **Encuestas abiertas de la cadena.** Un loader de la página de comunidad
  (`useChainPolls`) consulta, sólo cuando los cuatro conteos están confirmados en
  cero, hasta tres encuestas activas de los ancestros de la cadena, ordenadas por
  cierre; las que no tienen cierre siguen abiertas (la base lo permite) y van al
  final. El estado vacío las lista con pregunta, comunidad y fecha de cierre,
  enlazadas a la encuesta. Sin conteos ni marcas: D68 no se toca. Es legítimo
  ofrecerlas porque `is_member` es jerárquico: quien vive en la comunidad vota en
  las que la contienen; por eso el título dice "que ya podés votar" sólo a una
  miembro y, a las demás, "en las comunidades que la contienen", para no
  prometer un voto que la cabecera acaba de negar. Si la consulta falla, no se
  ofrece ninguna y el fallo queda en el log por `orFallback` (sin payload), para
  que "siempre vacío" no se confunda con "roto"; el estado vacío sigue siendo
  útil con los llamados a publicar. Las funciones puras viven en
  `src/lib/chain-polls.ts`.
- **Sin casillas que felicitar.** La lista de pasos con casillas, barra de
  progreso, felicitación y "Cerrar guía" se reemplaza por tres enlaces planos,
  "Qué podés hacer acá": el mapa (de ciudad para abajo), las encuestas y un
  reclamo nuevo por `publicationEntryHref` (D115). Nada se marca ni se celebra.
  `fictional-content.spec` prohíbe el texto de la felicitación. Las claves
  `agorbis_checklist_` y `agorbis_dismiss_guide_` quedan en `local-data.ts` como
  legado, para que la limpieza del dispositivo siga borrándolas.
- **Una situación, un texto, decidido en un solo lugar.** `residenceHint`, en
  `src/lib/residence-hint.ts`, distingue sin sesión, perfil ilegible, con sesión
  sin residencia, y con residencia en otra comunidad; cabecera y estado vacío
  toman texto y botón de ahí, así no pueden desacoplarse. Sólo la última dice
  "residencia declarada". Sin residencia dice "Todavía no elegiste dónde vivís" y
  ofrece "Elegir mi residencia" hacia el onboarding con la URL actual, limpia de
  `qaction`, como destino (`returnPathFor` + `onboardingPath`, los de D115). Con
  el perfil ilegible (la lectura de `profiles` falló: la sesión ahora lo deja en
  el log) no se afirma nada sobre la persona ni se la manda a elegir de nuevo,
  porque el onboarding puede cambiar una residencia que existe: pide recargar.
  `hasResidence` sale de `profile.home_community_id`, como en D115.

**Pruebas.** Specs puros de los dos ayudantes (7 y 5 casos), siete casos nuevos
en `community-navigation-honesty.spec.tsx` (encuestas de la cadena con y sin
datos, título neutro para una visitante, herramientas sin casillas, cabecera y
estado vacío sin residencia y con perfil ilegible) y el E2E
`e2e/empty-community.spec.ts` sobre `/c/ba-25-de-mayo/` con el seed: la encuesta
de Argentina enlazada con el título neutro, sin casillas, una cuenta nueva sin
residencia que lee "elegí tu residencia" con el destino exacto del onboarding, y
Sofía, que vive en Mar del Plata, leyendo "residencia declarada" con "Revisar mi
residencia". Tres revisiones de D113 (`ecc:code-reviewer`,
`ecc:typescript-reviewer`, `ecc:silent-failure-hunter`) pidieron el log, el
título neutro, el ayudante único, el caso del perfil ilegible, `returnPathFor`,
las encuestas sin cierre y el destino exacto en el E2E; todo aplicado. La
evidencia completa está en el registro de verificación del wiki.

**Qué no cambia.** El widget de voto rápido, la pestaña Encuestas, las reglas del
servidor sobre quién vota, migraciones y archivos de `CODEOWNERS`.

### D117 · El inicio muestra publicaciones en la primera pantalla y no le pide participar a quien ya votó

**Fecha:** 8 de noviembre de 2026. **Estado:** aplicada. Es la mejora 7 de D112,
que el responsable había postergado. Complementa D68, D74, D112 y D116. El
documento de trabajo está en `02-DOCS/wiki/ftd/inicio-con-publicaciones-a-la-vista.md`.

**Qué pasaba.** `/inicio` es la primera pantalla de quien ya eligió residencia. A
390 px, la primera publicación quedaba en y≈1151: antes de la lista había un
párrafo de bienvenida, los chips de la cadena con su etiqueta "Filtrar:", el
bloque "Tu comunidad principal" con cuatro tarjetas de dos líneas y la invitación
por WhatsApp, y los chips de tipo. Al tocar un chip, lo único que cambiaba en la
primera pantalla era su color: la lista filtrada quedaba fuera de la vista y nada
decía qué se estaba mostrando. Y la tarjeta de una encuesta abierta siempre decía
"Participar del voto", aunque la persona ya hubiera votado.

**Qué se decide.** Sólo presentación y dos lecturas propias: la base sigue
decidiendo los permisos (invariante 1), no cambia qué se registra, la RPC
`personalized_feed` no se toca y no hay migraciones, dependencias ni hosts nuevos.

- **Cabecera compacta.** Se van el párrafo de bienvenida y la etiqueta "Filtrar:";
  los chips de la cadena quedan en un `nav` con nombre. El bloque de la comunidad
  principal pasa a una franja con el nombre, "Ver panel" y las cuatro acciones en
  una sola fila (emoji y nombre, sin descripciones). La invitación por WhatsApp va
  a la columna lateral en desktop y debajo de la lista o del estado vacío en el
  teléfono: sigue existiendo, pero ya no empuja lo publicado. Con eso el archivo
  deja de usar colores crudos de la paleta y sale del trinquete de D96.
- **El filtro dice lo que muestra.** Con un filtro puesto, una línea con
  `role="status"` encima de la lista dice "Mostrando encuestas de Argentina",
  "Mostrando reclamos de todas tus comunidades" o "Mostrando todas las
  publicaciones de Mar del Plata", con "Quitar filtros" al lado. Es la respuesta
  visible al chip, en la misma pantalla.
- **Marcas propias, sin tocar la elección.** El loader lee, sólo para los ids de la
  página, los recibos de participación propios (`poll_participation_receipts`) y
  los apoyos propios (`claim_supports`). RLS ya limita las dos tablas a
  `user_id = auth.uid()`; el recibo no guarda qué se votó (D68). Una encuesta
  abierta con recibo dice "Ya votaste ✓" y ofrece "Ver encuesta"; una sin recibo
  sigue diciendo "Participar del voto →"; un reclamo apoyado dice "Apoyaste ✓".
  Las funciones puras viven en `src/lib/feed-marks.ts`.
- **Sin lectura, sin afirmación.** Si una de las dos consultas falla, el inicio no
  se cae: la lista sigue, el fallo queda en el log con su alcance y sin datos
  personales, y las tarjetas dejan de afirmar. Las encuestas abiertas dicen
  "Ver encuesta", ni "Ya votaste" ni "Participar del voto", y ningún reclamo
  lleva "Apoyaste". Una encuesta cerrada dice "Ver encuesta" haya voto o no: en
  el cierre lo que importa son los resultados, no la constancia propia. La RPC
  del feed, que ya cortaba con 500, ahora también deja rastro en el log.

**Pruebas.** Spec puro de `feed-marks.ts`, spec de componente
`inicio-first-screen.spec.tsx` (encuesta votada, sin votar y cerrada, lectura
fallida, reclamo apoyado y ajeno, línea de estado con y sin filtros, cabecera
compacta con las cinco rutas y la invitación una sola vez) y el E2E
`e2e/feed-first-screen.spec.ts` a 390×844 con Sofía: la primera tarjeta dentro de
la primera pantalla, una encuesta nueva sin votar que invita a participar, la de
Argentina que ya votó con "Ya votaste", la línea de estado al tocar el chip de
Argentina y "Apoyaste" sólo en un reclamo sembrado por la prueba, porque la
spec vecina del feed corre en paralelo y siembra treinta reclamos que tapan los
del seed. Tres revisiones de D113 (`ecc:code-reviewer`, `ecc:typescript-reviewer`,
`ecc:silent-failure-hunter`), sin hallazgos críticos ni altos, pidieron: que la
región viva del filtro esté siempre en el DOM y el enlace "Quitar filtros" quede
afuera de ella; nombre accesible "Nuevo reclamo" y similares en las cuatro
acciones; el "✓" oculto al lector; el log del 500 de la RPC y el id de petición
en los logs de marcas; que `ownIds` cubra una promesa rechazada; un guardia para
un `kind` que la interfaz no conozca; la traducción que faltaba de "Todas las
publicaciones"; el caso de la encuesta cerrada en el spec; y fechas coherentes
en la fixture. Todo aplicado. Se descartaron, con el porqué en el registro de
verificación, cambiar `aria-current="page"` por `"true"` en los chips y un aviso
visible cuando las marcas no se pudieron leer.

**Qué no cambia.** La RPC `personalized_feed`, los conteos durante la ronda, el
orden del feed, la paginación por cursor, las reglas del servidor sobre quién vota
o apoya, migraciones y archivos de `CODEOWNERS`.

### D118 · Un acuerdo es un compromiso que cada comunidad vota por separado y que existe sólo si todas lo aprueban

**Fecha:** 9 de noviembre de 2026. **Estado:** implementada en local:
migración `0074` (promovida con autorización del responsable), página
`/acuerdos/[id]`, formulario de propuesta, sección en Encuestas, tarjeta en el
inicio y manual. Falta el `supabase db push` a Producción, que hace el
responsable por el runbook. Primera función que atraviesa la cadena SDD
completa: spec `02-DOCS/wiki/sdd/specs/acuerdos-entre-comunidades.md`, plan y
tareas en `sdd/plans/`, evidencia por tarea en `sdd/progress/`. Complementa
D60, D68, D70, D74 y D115.

**Qué pasaba.** Las comunidades sólo se relacionaban hacia arriba y hacia
abajo, por `parent_id`. Una comunidad podía consultar, discutir, reclamar y
proponer, pero no comprometerse a algo como comunidad ni junto con otra. Un
problema que cruza un límite se publicaba dos veces y la voluntad quedaba
partida. El responsable definió el 08-11-2026 que un acuerdo se aprueba por
voto, en una, dos o más comunidades, y delegó el resto del diseño.

**Qué se decide.**

- **Cada ronda es una encuesta binaria existente**, una por comunidad, ligada
  por `polls.agreement_id`. Así el acuerdo hereda entero D68 (recibo sin
  elección, tallies privados, resultados al cierre con cinco participantes o
  más), el gate legal, la membresía por comunidad y `cast_poll_ballot`. No hay
  un segundo sistema de voto. Esas encuestas no se listan como encuestas
  comunes: `poll_feed` y `personalized_feed` las excluyen y `/encuestas/[id]`
  redirige al acuerdo.
- **El estado final no se guarda: se deriva al leer.** `proposed`, `voting` y
  `withdrawn` están en la tabla; `approved`, `rejected`, `no_quorum` y `lapsed`
  salen de los tallies con la ronda cerrada, como ya cierran las encuestas.
  Sin cron. Por comunidad: cinco participantes o más y más "sí" que "no"
  aprueba; el empate rechaza. El acuerdo es aprobado sólo si todas aprobaron;
  rechazado si alguna rechazó; sin quórum si ninguna rechazó y alguna no llegó
  a cinco. La participación se muestra al lado del resultado y nunca se suma
  entre comunidades (D60).
- **La otra comunidad entra cuando una residente de ahí adhiere.** Nadie abre
  una votación en una comunidad ajena. En la comunidad propia hace falta otra
  residente distinta de quien propone. La votación se abre en todas a la vez
  con la última adhesión, y el cierre se calcula en ese momento: apertura más
  la duración elegida (7 a 30 días). A los 30 días sin la última adhesión la
  propuesta queda "sin adhesión". Quien propone puede retirarla sólo antes de
  que se abra.
- **Elegibilidad.** Comunidades de provincia para abajo, del mismo país, que
  no se contengan entre sí (sus residentes votarían dos veces). El país, los
  continentes y la Tierra no participan: no hay institución con competencia
  para responder, la misma razón por la que la escalación de reclamos para en
  el país. La comunidad de quien propone participa siempre. De una a cinco.
- **La base decide todo** (invariante 1). Ninguna policy de escritura:
  `propose_agreement`, `adhere_agreement` y `withdraw_agreement` son `security
definer`, validan y rechazan con mensajes estables `AGORBIS_AGREEMENT_*` que
  la app traduce. `anon` no tiene ejecución sobre ellas. La autora de cada
  ronda es quien completó la última adhesión, porque el guarda de inserción
  exige autor igual a la sesión; esas rondas no consumen la cuota mensual de
  encuestas y el acuerdo tiene cuota propia: tres propuestas abiertas por
  persona.
- **Vocabulario honesto (D74).** "Propuesto, esperando adhesión", "En votación
  hasta el …", "Aprobado", "Rechazado", "Sin quórum", "Sin adhesión",
  "Retirado". Nada dice "aprobado" antes de que la base lo derive.
- **Dónde vive.** Página propia `/acuerdos/[id]`; sección "Acuerdos" dentro
  de la pestaña Encuestas de cada comunidad participante (D79: pocas
  pestañas); tarjeta en el inicio de sus residentes. Una propuesta sin
  adhesión la ve todo el mundo, con su estado en palabras.

**Qué no cambia ni se construye ahora.** Acuerdos internacionales, firmas o
avales institucionales, roles de representantes, seguimiento del
cumplimiento, enmiendas, mayorías calificadas, notificaciones nuevas y
cualquier ranking entre comunidades.

**Pruebas.** `supabase/tests/agreements_checks.sql` (62 aserciones, con control
negativo: sin el filtro de `poll_feed` la prueba falla), specs puros de
`src/lib/agreements.ts` y `db-error.ts`, specs de componente de la página, el
formulario, la sección y el inicio, y `e2e/agreements.spec.ts` en navegador
real: adherir, proponer, apertura con la última adhesión, voto con "Ya
votaste", redirección de la ronda, inicio y un acuerdo aprobado. La guardia
`fictional-content.spec` rechaza "acuerdo firmado" o "vigente" fuera del
estado derivado. Registro de verificación en
`02-DOCS/wiki/sdd/verifications/acuerdos-entre-comunidades-2026-11-09.md`.

**Revisión D113 (09-11-2026).** Cuatro revisores de sólo lectura. Lo que
cambió por ellos: sólo moderación cambia el estado de una ronda (la autora
técnica es quien adhirió último y podía cerrar la votación de todas las
comunidades); una parte sin ronda o una ronda removida nunca derivan
"aprobado"; retirar se niega a los 30 días; las rondas no cuentan en la cuota
mensual ni aparecen como encuestas en perfil, actividad, búsqueda del inicio
ni relaciones; un fallo al leer acuerdos se dice en vez de mostrar "no hay".
Quedan para el responsable: moderación y estado `removed` de acuerdos,
visibilidad anónima de `proposer_id` y `adhered_by`, mudanza de residencia
entre comunidades participantes y qué exporta `perfil/datos`.

**Riesgo asumido.** Producción no tiene todavía dos comunidades con cinco
residentes activas, así que casi todo acuerdo terminaría "sin quórum" hasta
que haya gente. La pantalla lo avisa antes de proponer. El brief que originó
esta decisión propone medir la demanda hasta el 06-12-2026.

### D119 · Décima ronda de UI/UX: lo útil primero, sin folleto y sin casilleros pendientes

**Fecha:** 9 de noviembre de 2026. **Estado:** aplicada en `main` en diez
commits, uno por mejora, entre `a75db08` y `f8a15c5`. Documento de la ronda en
`02-DOCS/wiki/ftd/decima-ronda-ui-ux.md`. Complementa D112, D115, D116 y D117.

**Qué pasaba.** El responsable pidió recorrer todo el sitio y aplicar diez
mejoras sin preguntar. La auditoría se hizo sobre Producción el mismo día, a
390 px como visitante y con sesión en escritorio, separando lo que ya estaba
arreglado en `main` (D117) de lo que seguía vivo. Lo común a casi todo: la
primera pantalla del teléfono mostraba llamados, insignias y contadores antes
que el contenido, y algunos textos afirmaban más de lo que la base sostenía.

**Qué se decide.**

- **Ingresar espera al token.** El widget de Turnstile expone su estado y los
  botones de ingresar, enlace mágico y registro quedan deshabilitados mientras
  se verifica, con una región viva que lo dice. Sin JavaScript el botón sigue
  habilitado y decide la base. Antes, tocar antes del token devolvía un 403 y
  la recarga borraba la contraseña.
- **Una visitante recibe un solo llamado en la comunidad: crear la cuenta.**
  "Invitar vecinos" es de quien vive ahí. La encuesta destacada va antes que
  los contadores.
- **El balance dice los números de hoy.** "Lo que pasa en {{name}}" reemplaza
  a "Impacto Comunitario · Balance Cívico · Poder ciudadano medible"; un cero
  en victorias o reclamos en curso se dice "Todavía ninguno", sin flecha.
- **Las encuestas de la cadena reemplazan al pie que repetía las pestañas**,
  para todas las comunidades, no sólo las vacías (extiende D116).
- **En teléfono, la miga muestra lo cercano** y colapsa los ancestros detrás
  de "…", que se despliega al tocar; las pestañas no se parten y un degradé
  avisa que el carril sigue.
- **Una sola llamada por tarjeta de encuesta.**
- **La guía de tres pasos es para residentes** y va después del primer reclamo.
- **Buscar arranca con una línea** y el primer resultado entra en la primera
  pantalla: chips de tipo deslizables, "Filtros activos" sólo con filtros
  reales, temas destacados debajo de los resultados cuando hay consulta.
- **El pasaporte muestra lo obtenido y, como mucho, lo que sigue.** Sin
  cinco casilleros "Pendiente" ni una segunda tarjeta con los mismos sellos.
  La pestaña Resumen arranca con la residencia.

**Qué no cambia ni se construye ahora.** Encontrar la propia ciudad y "¿Dónde
vivís?" (D112, 8 y 9) siguen bloqueados por la migración de localidades. Los
tres botones de compartir juntos y el nombre cortado del encabezado quedan
anotados.

**Pruebas.** Specs nuevos de `TurnstileGate` (con SDK falso: token, expiración
y token nuevo), `CommunityBreadcrumb`, `CivicPassportCard` (propio y ajeno) y
de la pestaña Reclamos; specs ampliados de la comunidad y de `PollCard`; E2E
nuevo `search-first-screen` (primer resultado dentro de 844 px) y E2E de
acceso, comunidad, acuerdos y búsqueda en verde. `pnpm verify` sobre el último
commit de la ronda.

**Revisión D113 (09-11-2026).** Tres revisores de sólo lectura, ningún crítico.
Lo que cambió por ellos: la expiración del token de Turnstile vuelve a esperar
en vez de habilitar el botón vacío, y un vigilante de 25 segundos evita un
botón muerto si el widget no responde; la miga colapsa sólo con JavaScript y
devuelve el foco al desplegar; el pasaporte no propone la "victoria" como
primer paso ni habla en segunda persona en perfiles ajenos; las encuestas de la
cadena no prometen "que ya podés votar"; mientras un voto de acuerdo está en
vuelo se bloquean las dos opciones. Documento de la ronda con el detalle.

**Restos (09-11-2026).** El recuadro de visitante ofrece también "¿Ya tenés
cuenta? Ingresá", con vuelta a la comunidad, y el nombre del encabezado deja
de cortarse en escritorio ancho. Los avisos de Supabase sobre RPCs `security
definer` ejecutables por `anon` se revisaron una por una y ninguna sobra: las
que parecen sensibles ya se protegen por dentro (`is_moderator` sólo responde
por la propia sesión) o sostienen policies de lectura anónima. Sin migración.

### D120 · Un acuerdo se reporta y se modera como cualquier publicación, y restaurarlo devuelve exactamente lo que había

**Fecha:** 9 de noviembre de 2026. **Estado:** implementada en local:
migración `0075` (autorizada por el responsable con "sigue con lo que quedó
pendiente"), cola de moderación, botón Reportar en `/acuerdos/[id]` y manual.
Falta el `supabase db push` a Producción, que hace el responsable por el
runbook, antes de `pnpm deploy:open`. Documento de la tarea en
`02-DOCS/wiki/ftd/moderacion-de-acuerdos.md`. Cierra el primer pendiente que
dejó D118. Complementa D33, D39, D68 y D118.

**Qué pasaba.** D118 creó los acuerdos sin estado `removed`: una propuesta con
un título ofensivo o un cuerpo que incumple las normas no se podía reportar
(`reports` rechazaba el tipo) ni bajar (nadie escribe en `agreements`, y la
única salida, el retiro, es de la proponente y sólo antes de abrirse). Con la
plataforma a punto de recibir gente real, era el hueco más caro de los que
quedaron anotados.

**Decisión.**

1. **Mismo circuito que el resto.** `reports.target_type` acepta `agreement`;
   `raw_content_exists` y `raw_content_author` lo entienden, así que el guardia
   de reportes y `can_manage_content` funcionan sin casos especiales. La cola
   de moderación lista el acuerdo con su título y enlace, y "Ocultar" /
   "Restaurar" / "Ocultar y resolver" operan igual que con una encuesta.
2. **Escribe la RPC, no la tabla.** `moderate_agreement(p_agreement, p_action)`
   con `hide` o `restore`, sólo para una sesión de moderación con MFA
   (`session_is_moderator`) y dentro del gate de participación. La tabla sigue
   sin `update` para `authenticated`: el principio de 0074 ("nadie escribe
   directo") no se rompe para moderar.
3. **Memoria del estado previo.** Ocultar guarda `status_before_removal`,
   `removed_at` y `removed_by`; restaurar vuelve exactamente a ese estado y
   limpia la baja. Los checks de fechas se relajan sólo para `removed`, porque
   un acuerdo en votación conserva sus fechas mientras está oculto. Las
   operaciones son idempotentes: ocultar lo oculto no duplica rastro.
4. **Las rondas siguen al acuerdo.** Ocultar pasa a `removed` las encuestas
   ligadas (nadie vota en algo dado de baja); restaurar devuelve a `active`
   sólo las que ese ocultamiento removió (una ronda que moderación había
   removido antes sigue removida). Vuelven `active` y no `closed` porque la
   lectura ya trata una fecha vencida como cierre, y pasar a `closed`
   dispararía avisos de cierre que nadie pidió. Riesgo asumido: una ronda que
   moderación hubiera cerrado antes de fecha vuelve abierta hasta su fecha.
5. **Lo removido no existe para quien no modera.** La policy de lectura de
   `agreements` y la de `agreement_parties` esconden lo removido salvo a
   moderación; `agreement_state` devuelve `null` (la ficha responde 404),
   `community_agreements` y `personalized_feed` lo omiten, `adhere` falla. Para
   moderación la ficha muestra "Dado de baja por moderación" con un aviso y
   sin botón de reportar.
6. **Rastro.** Cada `hide` y `restore` inserta en `moderation_audit_log` con
   `target_type = 'agreements'` y el estado antes y después. Nunca el texto.

**Pruebas.** `agreements_checks.sql` suma la sección "Moderación (D120)": 84
afirmaciones en verde, entre ellas que una residente sin rol no oculta, que la
visitante no ve el acuerdo ni sus partes ni sus rondas, que la sección de la
comunidad y el inicio lo omiten, que restaurar devuelve el estado derivado
exacto de antes y que `authenticated` tampoco oculta por `update`. Specs de
`moderation-queue` (la RPC y nunca `update`; si la RPC falla no se cierra
ningún reporte), de `agreements` (etiqueta) y de la cola. `supabase db lint`
sin errores; `pnpm db.contract` coherente.

**Fuera.** Baja por la proponente más allá del retiro (un acuerdo votado no
se borra por quien lo propuso); apelaciones propias (usan el circuito
general); búsqueda global de acuerdos (sigue diferida). Siguen pendientes de
D118: visibilidad anónima de `proposer_id` y `adhered_by`, mudanza de
residencia entre comunidades participantes y qué exporta `perfil/datos`.

### D121 · El alta se entiende sola: cinco pasos a la vista, acuerdos explicados, buscador primero y navegación de documento

**Fecha:** 9 de noviembre de 2026. **Estado:** implementada en `main` en commits
por mejora. Documento de la ronda en
`02-DOCS/wiki/ftd/acceso-y-primeros-pasos.md`. Complementa D93, D108, D110,
D115 y D119. No cambia D73, D97 ni D108.

**Qué pasaba.** El responsable pidió un registro, un ingreso y unos primeros
pasos simples de entender, y sumar Google. Se recorrió el alta entera con una
cuenta nueva en el preview local a 390 px (ingreso → acuerdos → nombre →
comunidad → inicio) y se miraron las pantallas públicas de Producción. El
recorrido funciona (acuerdos 294 ms, nombre 385 ms, elegir 296 ms, confirmar
1,4 s), pero el registro no decía que son cinco pasos; los acuerdos se marcan
dos veces sin explicación (una al registrarse, sin sesión, y otra ya con el
correo confirmado, que es la que se registra: D73); en uno de tres recorridos
el router quedó trabado tras la redirección SPA de los acuerdos y el botón del
paso siguiente giró sin hacer nada (la clase de fallo de D115); "¿Dónde vivís?"
abría con el GPS y seis continentes antes del buscador; un correo con el
dominio mal escrito crea una cuenta cuya confirmación no llega nunca; quien ya
tenía cuenta veía la misma tarjeta "Revisá tu correo" y esperaba un correo que
no iba a llegar; recuperar y reenviar no esperaban el token de Turnstile como
sí hace Ingresar desde D119.

**Decisión.** Diez mejoras, sin tocar textos legales, número de casillas ni la
base:

1. Aceptar acuerdos, guardar el nombre y confirmar la comunidad navegan como
   documento (`reloadDocument`), igual que Ingresar: el navegador encadena la
   redirección y el router no puede quedar trabado. El E2E de
   `account-round-three` que contaba respuestas `qaction` acepta también el
   POST del documento.
2. `/registro` muestra "Paso 1 de 5" desde el principio: `AuthShell` dibuja la
   línea compacta de `SignupProgress` arriba del título cuando la bienvenida
   ocupa la otra columna. El subtítulo nombra los cinco pasos.
3. `/consentimiento` de cuenta nueva explica la repetición: "ya los marcaste al
   crear la cuenta; ahora que confirmaste tu correo quedan registrados con tu
   sesión, que es la constancia que vale".
4. En el paso del lugar el buscador va primero; el GPS pasa debajo como
   alternativa discreta; en la raíz, `LocationPicker` pliega los continentes
   detrás de "Explorar por continente" (un `<details>` que funciona sin
   JavaScript). Con una búsqueda o un nivel abajo, la lista se muestra.
5. `suggestEmailDomain` propone "¿Quisiste decir …?" para gmail, hotmail,
   outlook, yahoo, icloud y live a un error de distancia; nunca corrige solo.
6. La tarjeta "Revisá tu correo" agrega qué hacer si ya se tenía cuenta con ese
   correo (ingresar o recuperar la contraseña). La frase es la misma para todas
   las personas: no revela si el correo existía.
7. "Abrir Gmail/Outlook/…" también en el enlace de acceso, la recuperación y el
   reenvío, como ya hacía el registro.
8. `/recuperar` y `/reenviar-confirmacion` deshabilitan el botón mientras
   Turnstile verifica (D119-9).
9. El primer campo recibe el foco al abrir ingresar, registro, recuperar,
   reenviar y el paso del nombre.
10. El paso del nombre muestra "Así te van a ver" con nombre y `@usuario` en
    vivo y dice que el correo no se muestra en ningún lado.

**Google.** El flujo completo existe (D66, D70, `0066`/`0067`, `SocialAuth`,
`/acceso-google`, callback PKCE con consentimiento previo) y está apagado por
D97 con `PUBLIC_GOOGLE_AUTH_ENABLED=false`. Activarlo no es un cambio de
interfaz sino una decisión del responsable con pasos fuera del repositorio, en
este orden: (a) una `Dn` que revierta D97; (b) en Google Cloud Console, un
cliente OAuth 2.0 de tipo web con la pantalla de consentimiento publicada
(nombre, dominio, enlaces a `/privacidad` y `/terminos`), origen autorizado
`https://agorbis.com` y URI de redirección el callback de Supabase del proyecto
de Producción; (c) en Supabase, Authentication → Providers → Google con ese
Client ID y Secret, y la allowlist de URL con `https://agorbis.com/auth/callback`;
el secreto no se pega en el chat ni en el repositorio; (d) `wrangler.jsonc` con
`PUBLIC_GOOGLE_AUTH_ENABLED="true"` y `PUBLIC_GOOGLE_PROCESSING_LOCATION{,_EN}`
con los destinos reales, más las políticas D72 y de canary que hoy fijan
`false`, todo en una misma PR con el responsable (son archivos de CODEOWNERS);
(e) revisar que Privacidad vigente nombre a Google como proveedor de acceso,
con versión nueva si hace falta; (f) el "Gate específico de Google OAuth" del
runbook, con su matriz E2E real en un entorno aislado antes de abrir; (g)
`pnpm deploy:open`. Hasta entonces el botón no se muestra: mostrarlo sin
proveedor sería un botón que no funciona (D74).

**Pruebas.** Specs nuevos: `AuthShell` (3), `name-step` del onboarding (2),
`email-typos` (3), `LocationPicker` (+2). E2E `smoke` del alta real, `account-
round-three` (onboarding) y `account-access` en verde; recorrido local de la
cuenta nueva a 390 px de punta a punta. tsc, check-i18n y lint completos.

### D122 · Google vuelve como opción de acceso: decisión tomada, activación por pasos y fuera del repositorio

**Fecha:** 9 de noviembre de 2026. **Estado:** decidida por el responsable
("sí, preparala"); el cambio del repositorio (paso 4) está preparado en la rama
`d122-google-activo` como PR borrador, que se fusiona sólo cuando los pasos 1 a
3 y 5 estén hechos. Revierte la postura de D97 ("sólo
correo en el arranque") y mantiene D66, D70, D73, D74 y el aviso de Google de
`0067`. Hasta que los pasos de abajo estén hechos, `PUBLIC_GOOGLE_AUTH_ENABLED`
sigue en `false` y el botón no se muestra: mostrarlo sin proveedor configurado
sería un botón que no funciona (D74).

**Qué pasaba.** La plataforma abrió sólo con correo (D97) para no exponer un
acceso a medias. Con las primeras personas registrándose, el responsable quiere
ofrecer también Google. El flujo completo ya existe desde D66 y D70:
`SocialAuth` con la casilla separada de Google ligada al aviso aprobado
`2026-09-09.1`, `/acceso-google`, inicio OAuth con secreto del servidor,
callback PKCE que registra la decisión con el JWT propio y revoca la sesión si
no puede, y el retiro desde el perfil. Lo que falta no es código: es
configuración en Google y en Supabase, el binding del Worker y las políticas
D72 que hoy lo fijan en `false`.

**Decisión.** Google se activa en este orden, y cada paso deja constancia:

1. **Google Cloud Console** (responsable): cliente OAuth 2.0 de tipo web con
   la pantalla de consentimiento publicada (nombre Agorbis, dominio
   `agorbis.com`, enlaces a `/privacidad` y `/terminos`), origen autorizado
   `https://agorbis.com` y como URI de redirección el callback de Auth del
   proyecto de Producción (`https://<ref>.supabase.co/auth/v1/callback`).
2. **Supabase** (responsable): Authentication → Providers → Google habilitado
   con ese Client ID y Secret; Authentication → URL Configuration con
   `https://agorbis.com/auth/callback` en la allowlist. El Client Secret no se
   pega en el chat, en tickets ni en el repositorio: vive sólo en Supabase.
3. **Privacidad** (responsable legal): confirmar que la versión vigente nombra
   a Google como proveedor de acceso y a sus transferencias; si no, versión
   nueva con migración y hash (D73). `/subencargados` ya muestra a Google
   cuando el binding es `true`.
4. **Repositorio** (agente, con autorización explícita porque son archivos de
   CODEOWNERS, en una sola PR): `wrangler.jsonc` con
   `PUBLIC_GOOGLE_AUTH_ENABLED="true"` y `PUBLIC_GOOGLE_PROCESSING_LOCATION{,_EN}`
   con los destinos reales que surjan de la configuración; las políticas D72 y
   de canary que hoy fijan `false` (`scripts/d72-canary-policy.mjs`,
   `scripts/cloudflare-closed-state.mjs`, `scripts/d72-canary-remote-artifact-policy.mjs`
   y sus tests); `.env.example` y el `.env` real. Nada más cambia: el flujo ya
   está probado con Google encendido en los E2E que D97 dejó vigentes.
5. **Gate específico de Google OAuth** del runbook: la matriz E2E real en un
   entorno aislado con cuentas de prueba, antes de abrir. Ninguna cuenta real
   se usa para ensayar.
6. **`pnpm deploy:open`** con la candidata D72 que incluya ese cambio.

**Gate E2E (paso 5).** El responsable aprobó el 09-11-2026 ("sisi, todo a
producción y a main, lo pruebo desde Producción") la prueba controlada en
Producción que el runbook admite como desviación expresa: fusionar la PR,
publicar, entrar él mismo con su cuenta de Google desde `/ingresar` y
verificar en la base, sólo lectura, que la identidad quedó enlazada y que la
decisión del aviso de Google se registró con versión y hash. Si falla, el
binding vuelve a `false` y se publica.

**Publicación (10-11-2026).** `pnpm deploy:open` publicó la versión `f92834f0`
con `PUBLIC_GOOGLE_AUTH_ENABLED="true"` y el smoke público falló en su último
control: `/subencargados/` pasó a mostrar cuatro proveedores, porque Google
entra al registro con su ubicación acreditada (disclosure versionada de D76),
y el smoke exigía exactamente tres destinos pendientes. El sitio estaba bien;
el control había quedado escrito para el perfil sin Google. El smoke ahora
exige los tres destinos pendientes por nombre (Supabase, Resend, Cloudflare)
y admite Google sólo con el texto exacto de
`scripts/google-processing-disclosure.mjs`, sin etiqueta de pendiente; otro
proveedor, otro texto o una tarjeta repetida lo hacen fallar. Repetido contra
Producción con la misma solicitud excepcional: 22 controles, PASS.

**Reversión.** Volver el binding a `false` y publicar: el botón desaparece, las
identidades ya enlazadas siguen pudiendo ingresar por correo y el retiro del
consentimiento de Google sigue disponible en el perfil (D66).

**Riesgo asumido.** Ofrecer Google suma un tercero con datos personales en el
acceso. La decisión se apoya en que el consentimiento previo, separado y con
versión ya está construido y probado; lo que no está hecho hoy es la
configuración externa, y por eso el botón sigue apagado hasta terminarla.

### D123 · Sistema visual: íconos propios, un color por tipo, tipografía de títulos y un solo chip

**Fecha:** 10 de noviembre de 2026. **Estado:** decidida por el responsable
("Implementa todas esas mejoras. En el orden que recomiendes").

**Qué pasaba.** La base del sistema era sana: paleta violeta con contrastes
medidos (D23), radios, sombras y tamaños en rem (D96). Pero todo pesaba
igual y todo era violeta. Los emojis hacían de íconos en pestañas, tipos de
publicación, métricas y estados vacíos, y cada sistema operativo los dibuja
distinto. Una tarjeta del feed decía "Encuesta" cuatro veces con cuatro
señales. Había tres píldoras distintas para filtros y acciones. Los títulos
usaban la pila del sistema sin carácter, y un h1 pesaba casi lo mismo que el
título de una tarjeta.

**Decisión.** Diez cambios de diseño, aplicados en una ronda:

1. **Íconos propios.** Un set de trazos SVG a 24 px (`src/components/ui/Icon.tsx`)
   reemplaza al emoji en todo lo que es interfaz. El emoji queda sólo donde
   es identidad elegida por la gente: comunidades, perfiles y categorías que
   la persona eligió. Sin terceros ni CDN.
2. **Un color por tipo de contenido.** Reclamo (rosa), encuesta (azul), debate
   (verde azulado), proyecto (naranja) y acuerdo (dorado), como tokens
   `--kind-*` en ambos temas y clases en `src/lib/content-kinds.ts`. El
   violeta vuelve a ser sólo navegación y acción primaria.
3. **Tipografía.** Manrope para títulos, servida desde el propio dominio
   (`public/fonts/manrope-latin.woff2`, 24 KB, OFL 1.1, `font-display: swap`),
   y una escala `text-display-xl…xs` con interlineado y espaciado propios.
   El cuerpo sigue en la pila del sistema. No se suma un tercero (D76): la
   CSP ya permitía `font-src 'self'`.
4. **Tarjetas sin redundancia.** Título dominante, una línea de meta, extracto
   a 16 px y un solo pie con estado y acción.
5. **Un solo chip** (`src/components/ui/Chip.tsx`): variantes filtro, acción y
   badge, un único estado seleccionado.
6. **Acciones rápidas compactas** en Inicio; en el teléfono las cubre la barra
   inferior.
7. **Cabecera de comunidad** con banda teñida por nivel (`--level-n`, que ya
   existía), identidad más grande y datos como texto discreto.
8. **Métricas** con una sola anatomía; el vacío en texto atenuado, no en verde.
9. **Ritmo y anchos**: feed a 72 rem, barra lateral pegajosa, espaciado de 8 px;
   Explorar con tarjetas clicables enteras.
10. **Dos niveles de superficie** (tarjeta plana, elevación sólo al pasar sobre
    lo clicable) e ilustraciones de línea propias para 404 y estados vacíos
    (`src/components/ui/Illustration.tsx`).

**Qué no cambia.** Ninguna regla de permisos, ningún texto legal, la CSP ni
D68: la presentación de encuestas sigue sin conteos durante la ronda. Nada
de lo que se muestra es ficticio (D74).

**Verificación.** El responsable pidió commitear sin correr tests ni
desplegar; la ronda pasó `tsc`, ESLint, Prettier y `check-i18n` en local, y
la CI de `main` es el juez de Vitest, Playwright y build. Documento de la
ronda: `02-DOCS/wiki/ftd/ronda-de-diseno.md`.

**Reversión.** Cada pieza es independiente: quitar la fuente deja los títulos
en la pila del sistema; quitar un token `--kind-*` deja el badge neutro;
`Card` sin `interactive` vuelve a la tarjeta plana.

### D124 · Segunda ronda de diseño: jerarquía en el detalle, un buscador, perfil con identidad y un sistema de movimiento

**Fecha:** 10 de noviembre de 2026. **Estado:** decidida por el responsable
("Implementa esas mejoras. En el orden que recomiendes").

**Qué pasaba.** Con D123 el sistema visual tenía íconos, color por tipo,
tipografía y un chip; faltaba aplicarlo donde la gente pasa más tiempo. El
detalle de una encuesta abría con seis píldoras iguales (favorito, Compartir,
WhatsApp, Telegram, lectura, proyector), terminaba con dos "Zona del autor"
apiladas y votaba con radios chicos. El header tenía dos entradas al mismo
buscador. El perfil repetía "Crear" dieciséis veces. Un debate sin columnas
se mostraba como error naranja. Campos de 44 px con radio 16 parecían
píldoras, y los botones crecían al pasar el mouse.

**Decisión.** Diez cambios más, en una ronda:

1. **Barra de acciones con jerarquía.** Un solo "Compartir" que abre
   WhatsApp, Telegram y copiar enlace (`ShareButton`, desplegable sin
   JavaScript); la acción primaria contextual adelante; las herramientas
   propias como botones fantasma con ícono.
2. **Pie del detalle ordenado.** Un solo panel de autor con sus acciones;
   fuentes, respuestas institucionales y relacionados en una tarjeta con
   contadores y una línea atenuada cuando están vacíos.
3. **La tarjeta de votar como pieza central.** Opciones de 56 px
   seleccionables con el color del tipo, texto del voto secreto legible, y
   "resultados reservados" con la ilustración de candado y la fecha como dato.
   D68 no cambia en nada.
4. **Un solo buscador en el header**, con el atajo adentro; avatar en lugar
   del nombre completo; punto de no leídos en la campana.
5. **Perfil con la banda de identidad** de su comunidad, pestañas con íconos y
   el cupo como una fila por comunidad con barras y un solo "Publicar acá".
6. **Escala de radios y formularios largos.** Controles 12 px, tarjetas 16,
   chips redondos; secciones numeradas y resumen pegajoso en `FormShell`.
7. **Miga de pan colapsada** a los dos últimos niveles con "…" expandible en
   cualquier ancho, separador uniforme.
8. **Debate sin columnas como estado vacío**, no como error; "Cómo participar"
   como nota bajo el título.
9. **Sistema de movimiento.** Tres duraciones (`--duration-fast|base|slow`),
   dos curvas, nada de `hover:scale` en botones; todo apagado con "reducir
   movimiento". El fundido entre páginas con View Transitions se publicó y
   se revirtió el mismo día: en Chromium headless la navegación sin
   JavaScript dejaba la instantánea vieja cubriendo la página y cinco E2E
   "mediante HTML" vencían esperando un clic.
10. **Pie de página compacto**: mismos enlaces, la mitad de alto.

**Qué no cambia.** Permisos, textos legales, CSP, la lógica del voto (D68),
los formularios de creación y la cuenta. Los `id` y nombres accesibles que
usan los E2E se conservan.

**Verificación.** Esta vez sí: Vitest completo, `pnpm lint` y `tsc` en local
antes de commitear; Playwright y build los juzga la CI de `main`. Documento:
`02-DOCS/wiki/ftd/ronda-de-diseno-2.md`.

**Reversión.** Cada pieza es independiente y de presentación; `ShareButton`
conserva la variante `compact`, y los tokens de movimiento pueden volver a
los valores fijos anteriores sin tocar componentes.

### D125 · Tercera ronda de diseño: la portada, la comunidad vista de cerca y el barrido de glifos

**Fecha:** 10 de noviembre de 2026. **Estado:** decidida por el responsable
("quiero implementar 10 mejoras más de diseño").

**Qué pasaba.** Por primera vez el diseño nuevo se vio en pantalla, en local,
en claro y oscuro, escritorio y teléfono. El sistema aguanta: el modo oscuro
con los colores por tipo y la banda por nivel funciona. Lo que quedó afuera
de D123 y D124 se nota: la portada para visitantes seguía con badges neutros
y emojis; en un teléfono de 390 px una pregunta larga ocupaba cuatro líneas
a 44 px; el voto rápido de la portada de comunidad usaba "→" tipográficos;
la fila de acciones se apilaba en cuatro líneas; las fichas de Descubrimiento
se estiraban con vacío, repetían la fecha siete veces y dejaban una huérfana;
"Más herramientas" era un `<details>` suelto; las categorías tenían emoji y
píldoras propias; los listados pedían crear cuenta dos veces en la misma
pantalla; y quedaban decenas de flechas, tildes y banderas tipográficas
haciendo de íconos.

**Decisión.** Diez cambios más:

1. **Portada para visitantes al sistema nuevo**: tarjetas de "Pasando ahora"
   con badge y acento por tipo, diagrama de niveles con íconos propios,
   glifos a íconos.
2. **Tipografía fluida**: los tres tamaños grandes de la escala usan `clamp()`
   y bajan con el ancho de la pantalla.
3. **Voto rápido** con la anatomía de la tarjeta de votar del detalle.
4. **Fila de acciones en teléfono** con scroll horizontal, no apilada.
5. **Fichas de Descubrimiento** con alturas naturales, "Leer más" con ícono,
   una sola fecha al pie y sin huérfana.
6. **Herramientas** como sección con chips, plegada sólo en teléfono.
7. **Barrido de glifos**: flechas, tildes, banderas y clips tipográficos
   pasan a `Icon`; las claves traducidas pierden el glifo.
8. **Encuestas de comunidades contenedoras** como filas interactivas con
   reloj y chevron.
9. **Categorías con íconos propios** (`icon` en `CLAIM_CATEGORIES` y
   `POLL_CATEGORIES`) y el mismo `Chip` en filtros y formularios; el emoji
   queda como identidad heredada.
10. **Un solo llamado a crear cuenta por pantalla**: en los listados el botón
    de crear pasa a secundario cuando la cabecera ya pide la cuenta.

**Qué no cambia.** Permisos, textos legales, CSP, D68, la lógica de los
formularios y los nombres accesibles e `id` que usan los E2E.

**Verificación.** Vitest completo, `pnpm lint` y `tsc` en local antes de
commitear; capturas locales en `02-DOCS/wiki/ftd/ronda-de-diseno-3.md`; la
CI de `main` juzga Playwright y build.

### D126 · Cuarta ronda de diseño: las pantallas que faltaban entran al sistema y ningún botón contiene bloques

**Fecha:** 12 de noviembre de 2026. **Estado:** decidida por el responsable
("Implementa 10 mejoras de diseño y cuando termines no corras test ni nada").

**Qué pasaba.** D123 a D125 llevaron al sistema visual el inicio, la
comunidad, Explorar, las tarjetas, el detalle de encuesta, el header, el
perfil propio y la portada. Quedaban afuera la búsqueda, las herramientas de
comunidad (mapa, rendición, victorias, instituciones), los detalles de
reclamo, proyecto y debate, el perfil público, los controles globales y la
bandeja de avisos: emojis haciendo de íconos, píldoras propias, Title Case,
paleta cruda y métricas en cuatro colores con el cero en verde. Había fallas
visibles: el estado crudo "proposal" en la búsqueda, "1 apoyos" y "1
pendientes", "Vencía el…" mientras todavía faltaban días, un título sin
contenido en el proyecto y un estado vacío que dibujaba un emoji como mancha
negra. Y una de fondo: 29 bloques (`div`, `h*`, `p`) dentro de `<button>` o
`<label>` en siete archivos. En desarrollo, Qwik corta el servidor con
`Q12 SsrError(tag)` al dibujar `/u/[id]`, `/debates/[id]` y la pestaña
Resumen de `/perfil` con sellos. El build de producción no valida eso, por
eso la CI nunca lo vio, pero el parser del navegador puede reacomodar el DOM
y confundir la reanudación.

**Decisión.** Diez cambios, todos de presentación:

1. **Búsqueda** con la anatomía del feed: tarjeta con la franja, el ícono y
   el color de su tipo, estado traducido, filtros de tipo con el chip único
   (`Chip` acepta `name` y `value` para enviar el formulario GET), temas con
   los íconos de categoría, historial en un lugar fijo y una marca de
   coincidencia que no parte palabras; el extracto arranca cerca de la
   primera coincidencia.
2. **Mapa barrial**: chip único y una sola fila de categorías, cabecera sin
   insignia ni emojis, "Revisar mi barrio" junto a su panel, una leyenda que
   explica los colores del esquema y HTML válido en la lista.
3. **Rendición, victorias e instituciones** dentro de la comunidad: cabecera
   de listado en lugar de una página suelta con su propio h1, métricas con
   una sola anatomía (`MetricTile`), categorías con su ícono y sólo las que
   tienen reclamos, plurales correctos y victorias con el chip único.
4. **Etapas con una sola anatomía** (`StageStepper`): reclamos y proyectos
   muestran sus etapas igual, con el color del tipo en la actual, íconos
   propios y, en el teléfono, filas parejas sin huérfanas. El proyecto sigue
   sin marcar etapas como cumplidas, porque puede saltear alguna.
5. **Detalle de reclamo** sin emojis: seguimiento con ilustración y chip
   único, reloj y difusión con íconos, "Vence el…" cuando todavía falta, la
   barra fija del teléfono coherente con la tarjeta y el favorito con
   etiqueta cuando va solo.
6. **Detalle de proyecto**: la aclaración "Compromiso público, no un pago"
   pasa a nota sin cambiar una palabra; aportes no monetarios con su vacío y
   su estado en palabras, ejecución sin emojis e imprimir con ícono y
   enlace al afiche con QR que ya existía.
7. **Detalle de debate**: citas con HTML válido y chip único, cabecera con
   tres insignias y "Comentar desde…" como acción principal, grilla y
   proyector con íconos. El Manual lo dice así.
8. **Perfil público** con la banda de identidad y los tipos de
   `CONTENT_KINDS`; el pasaporte cívico con HTML válido, sellos con ícono,
   sin repetir el nombre, y el nivel y las felicitaciones sólo en el perfil
   propio.
9. **Controles globales**: Accesibilidad con ícono propio, interruptores y
   HTML válido; la paleta de comandos con íconos y el tipo de cada
   resultado; la opción de encuesta y el asistente del presupuesto sin
   bloques adentro; y la sección activa de "Más" como pestaña del carril de
   comunidad, no como un botón violeta suelto.
10. **Bandeja de notificaciones** con el ícono y el color del tipo de cada
    aviso, un punto de no leída que no cambia el nombre accesible y el chip
    único en los filtros.

`Icon` suma 18 trazos propios (`arrow-left`, `chevron-left`, `filter`,
`droplet`, `printer`, `pin`, `quote`, `newspaper`, `image`, `truck`,
`stamp`, `accessibility`, `minus`, `user`, `moon`, `corner-down-left`,
`volume`, `stop`). El trinquete baja 69 usos crudos de la paleta: once
archivos quedan en cero y la rendición pasa de 41 a 39 (el bloque del modo
proyector queda para otra ronda). Los textos reemplazados se van del
catálogo inglés.

**Qué no cambia.** Permisos, D68, D74, textos legales, CSP, `localStorage`,
loaders, acciones, filtros, hrefs y parámetros. Los `id`, `data-*` y
nombres accesibles que usan los E2E se conservan o se ajustaron con la misma
fuerza. D59 sigue igual: una comunidad sin partida no muestra la pestaña de
Presupuesto, ni siquiera mientras se está en `/presupuesto`. Marcarla ahí
fue una propuesta de la ronda que se revirtió; si se quiere, va con su `Dn`.

**Verificación.** El responsable pidió no correr nada al terminar la
implementación: cada mejora la revisaron por lectura dos lentes
(compilación, i18n y tests; diseño, accesibilidad e invariantes) y después
se revisaron las interacciones entre mejoras. Chequeos estáticos de la
integración: ningún bloque dentro de botones o etiquetas (de 29 a 0),
trinquete alineado, catálogo inglés sin claves repetidas. Cuando pidió
deployar, pasaron en local Prettier, `tsc`, `pnpm lint`, Vitest (1544/1544)
y `pnpm test.release`; cinco aserciones nuevas se escribieron con
`toBeNull()` y pasaron a `toBeFalsy()`, la convención del repo, porque el
DOM de prueba devuelve `undefined`. El build lo hace `pnpm deploy:open` y
los E2E, la CI de `main`. Documento: `02-DOCS/wiki/ftd/ronda-de-diseno-4.md`.

**Reversión.** Cada mejora tocó su propia lista de archivos y se revierte
por separado. `MetricTile` y `StageStepper` son primitivos nuevos y los
cambios de `Chip` e `Icon` son aditivos.

### D127 · El nivel 4 es el gobierno local; las localidades sin gobierno propio van al nivel 5

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable,
que pidió aplicarla; migración `0076`, pendiente de `supabase db push`. Completa lo que D112 dejó pendiente
(mejoras 8 y 9) y precisa el comentario de `communities.level` de 0001.

**Qué pasaba.** En Producción sólo Buenos Aires tenía nivel 4: sus 135
partidos y cinco localidades (Mar del Plata, Miramar, Mar del Sud, Mechongué y
Comandante Nicanor Otamendi) cargadas como hermanas de su propio partido. Las
otras 23 jurisdicciones tenían 0, así que fuera de Buenos Aires nadie podía
elegir su ciudad. Y en Buenos Aires, Mar del Plata y General Pueyrredón
partían la participación de una misma ciudad.

**Qué se decide.**

- **Nivel 4 = gobierno local**, según la API Georef: 1.932 municipios en 20
  provincias y las 15 comunas de CABA. En Santa Cruz y Santiago del Estero
  Georef no trae municipios y van sus 7 y 27 departamentos, para que ninguna
  provincia quede sin nivel 4. Buenos Aires conserva sus 135 partidos.
- **Nivel 5 = localidad o barrio.** Las cinco localidades bajan bajo su partido
  (General Pueyrredón y General Alvarado). Se mueven, no se borran: conservan
  su contenido. La membresía sale del prefijo del `path`, así que sus
  residentes suman el partido a su cadena; Mar del Plata pasa de 5 a 6
  comunidades.
- Los homónimos de una provincia llevan su departamento entre paréntesis,
  como `San Bernardo (9 de Julio)`, porque el buscador sólo muestra la
  provincia como contenedora.
- La app rotula el nivel 5 "Localidad o barrio" y sus hijos "Localidades y
  barrios".

**Cómo se aplica.** `scripts/build-argentina-level4-migration.mjs` descarga
Georef y escribe `supabase/migrations/0076_argentina_local_governments.sql`; la
lógica pura está en `scripts/argentina-level4-lib.mjs` con su spec. Se revisó
primero como borrador en `sql-drafts/` y, al regenerarla como migración, sólo
cambió la cabecera. El SQL falla cerrado si falta una provincia, si un slug ya
existe o si las localidades no están como se revisaron, y verifica los totales
al final. `geography_baseline_checks.sql` fija la distribución nueva. El
responsable la aplica con `supabase db push` antes del `pnpm deploy:open`.

**Qué no cambia.** RLS, `is_member`, cupos y plazos de reclamo por nivel (el
nivel 5 ya los tenía). Un reclamo abierto de esas localidades conserva su
vencimiento, que se guardó al crearlo; si escala, ahora sube al partido.

**Qué cambia sin código nuevo.** En un debate de Buenos Aires, quien vive en
Mar del Plata escribe en la columna de General Pueyrredón. El contraste entre
partidos de Buenos Aires cuenta sólo reclamos de la hija directa, así que los
de Mar del Plata aparecen en el contraste de General Pueyrredón y no en el de
la provincia. Las publicaciones nuevas de Mar del Plata usan los cupos de nivel 5. Tres pruebas de `rls_checks.sql` asumían a Mar del Plata como hija de Buenos
Aires y ahora leen el nivel o la hija real, sin aflojar ninguna aserción.

**Reversión.** Borrar las comunidades nuevas que no tengan contenido ni
residentes y devolver las cinco localidades a nivel 4 bajo `buenos-aires`.
Documento: `02-DOCS/wiki/ftd/nivel4-argentina.md`.

### D128 · Agorbis se sostiene con donaciones por enlace externo, sin beneficios ni registro de donantes

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable;
implementada con el enlace apagado hasta que exista la cuenta de Cafecito.

**Qué pasaba.** No había ninguna decisión sobre cómo se financia Agorbis. Se
evaluaron y descartaron la publicidad (terceros sin clic, D76), la venta de
datos, los topes pagos a encuestas, debates o reclamos (quien paga definiría
la agenda de una comunidad) y los planes privados para organizaciones.

**Qué se decide.**

- **Participar es gratis.** Nadie paga por votar, debatir, reclamar o proponer,
  y ningún tope de contenido se levanta pagando. Las cuotas de publicación
  (`content_quotas`) siguen siendo iguales para todas las personas.
- **Donación voluntaria por enlace saliente.** `/apoyar` explica qué sostiene
  el aporte y enlaza al perfil de Cafecito del responsable. No hay cobro
  embebido: el navegador sólo contacta a Cafecito cuando la persona hace
  clic, así que no entra en la CSP ni en `/subencargados` (D76).
- **Donar no compra nada.** Ni visibilidad, ni peso en una votación, ni
  funciones, ni trato distinto en moderación.
- **Agorbis no sabe quién dona.** No hay tabla, insignia ni agradecimiento con
  nombre, y el aporte no se asocia a la cuenta. El enlace sale sin parámetros,
  sin fragmento y con `no-referrer`: Cafecito no recibe ni el origen.
- **Sin cifras inventadas (D74).** No hay metas, barras ni contadores. Un
  detalle de costos o de ingresos se publica sólo con números reales cargados
  por el responsable.

**Cómo se aplica.** `DONATION_URL` en `src/lib/support.ts` nace vacía.
`donationLink` falla cerrado: acepta únicamente
`https://cafecito.app/<usuario>` y con cualquier otra cosa apaga el botón y la
entrada "Apoyar" del pie. Para encenderlo alcanza con cargar esa constante.

**Qué no cambia.** Privacidad, Términos, CSP y el listado de subencargados.
Si algún día el cobro se embebe, se suma otro proveedor o se quiere dejar la
donación escrita en los Términos, hace falta una decisión nueva y el circuito
de D76 o de versión legal que corresponda.

**Pendiente del responsable.** Cómo declarar esos ingresos (consulta
contable), crear la cuenta de Cafecito y revisar sus condiciones y comisiones.

**Reversión.** Vaciar `DONATION_URL`. Documento:
`02-DOCS/wiki/ftd/apoyar-donaciones.md`.

### D129 · Uruguay es el piloto del nivel 4 fuera de Argentina: sus 136 municipios, y el territorio sin municipio queda en el departamento

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable;
borrador SQL sin aplicar en `supabase/sql-drafts/`. Extiende D127 a otro
país.

**Qué pasaba.** Fuera de Argentina ningún país tenía nivel 4: los 19
departamentos de Uruguay, como el resto de las subdivisiones de nivel 3 fuera
de Argentina, no tenían hijos. Cargar el mundo de una vez mezclaba fuentes de calidad dispar,
miles de homónimos y cientos de miles de comunidades vacías, así que el
responsable eligió un país piloto para probar el molde de 0076 con otra fuente.

**Qué se decide.**

- **Nivel 4 = los 136 municipios** que eligieron autoridades en mayo de 2025,
  según el plan circuital de la Corte Electoral (datos abiertos, Licencia de
  AGESIC). Mismo criterio que D127: el gobierno local, no la división ADM2 ni
  las ciudades por población.
- **El territorio sin municipio queda en su departamento.** Ahí gobierna la
  Intendencia, que ya es la comunidad de nivel 3. Es el 27,6 % del padrón
  (752.159 de 2.724.184 habilitados), casi todo en las capitales del interior
  (Salto, Paysandú, Rivera, Melo, Mercedes, Tacuarembó, entre otras). Se
  descartó crear comunidades para esas capitales: no son gobiernos y
  contradirían D127. El onboarding ya permite frenar en cualquier nivel.
- **Montevideo** usa el nombre oficial de sus municipios, "Municipio A" a
  "Municipio G" y "Municipio CH".
- **Sin coordenadas.** La Corte Electoral no las publica y la capa de áreas
  urbanizadas de la IDE no ubica 43 de los 128 municipios del interior. La
  detección por GPS ignora comunidades sin `lat`/`lng` y sugiere el
  departamento; con coordenadas aproximadas podía proponer un municipio rural
  a quien vive en una capital sin municipio.
- Un mismo nombre en dos departamentos (Cerro Chato, La Paz, Quebracho) no se
  desambigua: el buscador muestra el departamento como contenedor.

**Cómo se aplica.** `scripts/build-uruguay-level4-draft.mjs` descarga el plan
circuital y escribe `supabase/sql-drafts/0077_uruguay_local_governments.sql`;
la lógica pura está en `scripts/uruguay-level4-lib.mjs` con su spec. El SQL
falla cerrado si falta un departamento o un slug ya existe, y verifica el
total al final. El número es provisional: va después de 0076, que todavía no
está en Producción.

**Qué no cambia.** RLS, `is_member`, cupos ni plazos de reclamo por nivel.
Ningún país más: el siguiente se decide con lo que enseñe este piloto.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.south-america.uruguay` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-uruguay.md`.

### D130 · Chile entra al nivel 4 con sus 345 comunas, sólo por nombre y sin nada derivado de los polígonos

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable;
borrador SQL sin aplicar en `supabase/sql-drafts/`. Segundo país después del
piloto de Uruguay (D129).

**Qué pasaba.** Las 16 regiones de Chile (nivel 3) no tenían hijos. La fuente
oficial de comunas es la DPA 2023 (SUBDERE, IGM, DIFROL e INE), que se publica
como cartografía: su documentación pide que la DIFROL valide los productos
derivados, y su ficha en `datos.gob.cl` figura como Creative Commons No
Comercial, mientras que la categoría del geoportal desde donde se descarga
figura como CC BY.

**Qué se decide.**

- **Nivel 4 = las 345 comunas** de la capa, cada una con su municipalidad.
  Cubren todo el territorio, así que no queda población fuera. La comuna
  Antártica no está en la capa y tampoco tiene municipalidad propia; queda
  fuera por el criterio de D127.
- **Sólo nombre, código y región.** No se calcula nada de los polígonos.
  Sin coordenadas, el GPS del onboarding sugiere la región, como en Uruguay
  sugiere el departamento. Sumar centroides más adelante es otra migración y
  pide confirmar antes que un punto por comuna no requiere validación.
- **Slug corto, `chile-<comuna>`,** porque en Chile no hay dos comunas con el
  mismo nombre. Si apareciera una, el generador falla en vez de adivinar.
- **Nombres como los escribe la fuente,** con la grafía de la SUBDERE
  ("Aisén", "Coihaique").

**Cómo se aplica.** `scripts/build-chile-level4-draft.mjs` lee la tabla de
atributos de la capa y escribe
`supabase/sql-drafts/0078_chile_local_governments.sql`; la lógica pura está en
`scripts/chile-level4-lib.mjs`. El SQL lo arma `scripts/level4-draft-sql.mjs`,
que comparte con Uruguay: falla cerrado si falta una región o un slug ya
existe, verifica el total y borra su tabla temporal, así ambos borradores
pueden ir en la misma transacción.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel. Tampoco los
datos viejos de 0016: el punto de la región de Valparaíso (longitud −89,7) y
el nombre abreviado de Aysén quedan para una decisión aparte.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.south-america.chile` que no tengan contenido ni residentes. Documento:
`02-DOCS/wiki/ftd/nivel4-chile.md`.

### D131 · Paraguay entra al nivel 4 con sus 262 distritos, con coordenadas, contrastado con las intendencias electas

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable,
que pidió seguir con otro país; borrador SQL sin aplicar en
`supabase/sql-drafts/`. Tercer país después de Uruguay (D129) y Chile (D130).

**Qué pasaba.** Los 17 departamentos de Paraguay y Asunción (nivel 3) no
tenían hijos. Las fuentes no coinciden en cuántos distritos hay (262, 263 o 268) y la lista de la Justicia Electoral trae los nombres abreviados y sin
tildes.

**Qué se decide.**

- **Nivel 4 = los distritos**, cada uno con su municipalidad e intendente.
  Nombres y puntos del COD-AB de HDX (datos del INE, CC BY-IGO); el
  generador se frena si, en algún departamento, la cantidad no coincide con
  las intendencias electas en 2026.
- **Asunción no lleva nivel 4:** es un único distrito y su comunidad de
  nivel 3 ya es su gobierno local. Quedan 262.
- **Con coordenadas.** La licencia es abierta y no trae la condición de
  validación de Chile, y los distritos cubren todo el país, así que el GPS
  puede sugerir el distrito. El SQL común acepta coordenadas por fila y
  Uruguay y Chile siguen sin ellas.
- **Slug con departamento** (`paraguay-central-luque`), porque hay
  homónimos (Bella Vista).
- **Nombres como los publica el INE,** salvo dos mayúsculas mal puestas que
  se corrigen de forma explícita y con test.

**Cómo se aplica.** `scripts/build-paraguay-level4-draft.mjs` baja el COD-AB
y la lista de electos, contrasta y escribe
`supabase/sql-drafts/0079_paraguay_local_governments.sql`; la lógica pura,
con un lector mínimo de XLSX, está en `scripts/paraguay-level4-lib.mjs`. El
lector de zip pasa a `scripts/zip-entry.mjs`, compartido con Chile. De la
lista de electos sólo se leen los códigos: trae nombres y cédulas que no se
guardan.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel. Los nombres
de los departamentos de 0016, en mayúsculas y sin tildes ("ALTO PARANA"),
quedan para una decisión aparte.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.south-america.paraguay` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-paraguay.md`.

### D132 · Bolivia entra al nivel 4 con 339 municipios y coordenadas; el municipio 340 queda pendiente

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable,
que pidió seguir con otro país; borrador SQL sin aplicar en
`supabase/sql-drafts/`, que no se promueve hasta resolver el pendiente.
Cuarto país después de Uruguay, Chile y Paraguay (D129–D131).

**Qué pasaba.** Los 9 departamentos de Bolivia (nivel 3) no tenían hijos.
Entre el departamento y el municipio está la provincia, que no tiene
gobierno propio.

**Qué se decide.**

- **Nivel 4 = el gobierno autónomo municipal,** colgado del departamento y
  sin la provincia intermedia, como los departamentos argentinos en D127.
- **Fuente:** COD-AB de HDX (Ministerio de Desarrollo Rural y Tierras, CC
  BY-IGO), con nombres y un punto por municipio. Con coordenadas, por la
  misma razón que Paraguay: licencia abierta y cobertura completa.
- **Slug con departamento,** porque hay homónimos entre departamentos.
- **Pendiente:** las subnacionales de 2026 se hicieron en 340 municipios y la
  capa trae 339. Falta identificar el municipio, probablemente en Potosí,
  con una fuente oficial. También se anota que la capa usa nombres
  anteriores a algunas autonomías indígenas.

**Cómo se aplica.** `scripts/build-bolivia-level4-draft.mjs` baja el COD-AB y
escribe `supabase/sql-drafts/0080_bolivia_local_governments.sql`; la lógica
pura está en `scripts/bolivia-level4-lib.mjs`, que compara el nombre de cada
departamento con su código para que un código mal asignado falle. El lector
de XLSX pasa a `scripts/xlsx-sheet.mjs`, compartido con Paraguay.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.south-america.bolivia` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-bolivia.md`.

### D133 · Ecuador entra al nivel 4 con sus 221 cantones, sin coordenadas

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable,
que pidió seguir con otro país; borrador SQL sin aplicar en
`supabase/sql-drafts/`. Quinto país después de Uruguay, Chile, Paraguay y
Bolivia (D129–D132).

**Qué pasaba.** Las 24 provincias de Ecuador (nivel 3) no tenían hijos.

**Qué se decide.**

- **Nivel 4 = los cantones,** cada uno con su GAD municipal, del COD-AB de
  HDX (datos del INEC, CC BY-IGO). La isla y la zona en estudio que el INEC
  publica sin cantón quedan afuera; el generador exige 221.
- **Sin coordenadas:** este COD-AB no trae puntos. El GPS sugiere la
  provincia, como en Uruguay y Chile. Calcular centroides de los polígonos
  queda como mejora aparte.
- **Slug con provincia,** porque hay homónimos (Bolívar y Olmedo, cada uno en dos provincias).
- **Nombres como los publica el INEC,** con espacios repetidos colapsados y
  una mayúscula corregida de forma explícita y con test.

**Cómo se aplica.** `scripts/build-ecuador-level4-draft.mjs` baja el COD-AB y
escribe `supabase/sql-drafts/0081_ecuador_local_governments.sql`; la lógica
pura está en `scripts/ecuador-level4-lib.mjs`, que compara el nombre de cada
provincia con su código.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel. Los nombres
sin tilde de dos provincias en 0016 ("Manabi", "Sucumbios") quedan para la
misma decisión aparte que los de Chile y Paraguay.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.south-america.ecuador` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-ecuador.md`.

### D134 · Perú entra al nivel 4 con sus municipalidades provinciales; en Lima y El Callao, con sus distritos

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable;
borrador SQL sin aplicar en `supabase/sql-drafts/`. Sexto país después de
Uruguay, Chile, Paraguay, Bolivia y Ecuador (D129–D133).

**Qué pasaba.** Los 26 de nivel 3 de Perú no tenían hijos. Perú tiene dos
capas de gobierno local, la municipalidad provincial y la distrital, y dos de
sus comunidades de nivel 3 (Lima Metropolitana y El Callao) ya son gobiernos
provinciales.

**Qué se decide.**

- **Nivel 4 = la municipalidad provincial,** elegida por el responsable. Los
  distritos del resto del país quedan para un nivel 5 futuro.
- **En Lima Metropolitana y El Callao, sus distritos** (43 y 7), porque la
  provincia ya es la comunidad de nivel 3.
- **Nombres del IGN** (COD-AB de HDX, CC BY-IGO), **con las tildes de
  Wikidata** (CC0) sólo cuando la única diferencia son tildes o mayúsculas:
  Wikidata aporta grafía, nunca un nombre distinto. Es una fuente de
  terceros editada por voluntarios; la regla limita lo que puede cambiar.
- **Con coordenadas** del COD-AB, como en Paraguay y Bolivia.

**Cómo se aplica.** `scripts/build-peru-level4-draft.mjs` baja el COD-AB,
consulta a Wikidata y escribe
`supabase/sql-drafts/0082_peru_local_governments.sql`; la lógica pura está en
`scripts/peru-level4-lib.mjs`. La consulta a Wikidata la hace sólo quien
regenera el borrador, desde su máquina: ni el navegador ni el Worker
contactan un host nuevo, así que no entra en D76.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.south-america.peru` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-peru.md`.

### D135 · Colombia entra al nivel 4 con sus 1.102 municipios: lista de la DIVIPOLA y nombres del COD-AB

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable;
borrador SQL sin aplicar en `supabase/sql-drafts/`. Séptimo país después de
Uruguay, Chile, Paraguay, Bolivia, Ecuador y Perú (D129–D134).

**Qué pasaba.** Los 32 departamentos de Colombia y Bogotá (nivel 3) no
tenían hijos. La lista vigente es la DIVIPOLA del DANE (septiembre de 2026),
con licencia CC BY-SA 4.0. El COD-AB de HDX (CC BY-IGO) trae los nombres
bien escritos pero es de 2020.

**Qué se decide.**

- **La DIVIPOLA define qué municipios van** (códigos y tipo de unidad);
  **los nombres salen del COD-AB** por código, y sólo un municipio creado
  después de 2020 (Nuevo Belén de Bajirá) toma el suyo de la DIVIPOLA.
- **Afuera:** Bogotá, que ya es nivel 3 (como Asunción en D131), y la isla de
  San Andrés y las 18 áreas no municipalizadas, que no tienen municipio y
  quedan en su departamento (como en Uruguay, D129).
- **Sin coordenadas:** el COD-AB no trae puntos y las de la DIVIPOLA no se
  usan por su licencia. El GPS sugiere el departamento.
- **Slug con departamento,** porque hay homónimos.
- **Para revisar por el responsable:** la cláusula "compartir igual" de CC
  BY-SA 4.0. Se atribuye al DANE en la cabecera del SQL; lo que se toma de la
  DIVIPOLA son códigos, tipos y un nombre.

**Cómo se aplica.** `scripts/build-colombia-level4-draft.mjs` baja las dos
fuentes, exige que salgan todos los municipios menos Bogotá y escribe
`supabase/sql-drafts/0083_colombia_local_governments.sql`; la lógica pura está
en `scripts/colombia-level4-lib.mjs`, que falla ante un tipo de unidad nuevo.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel. El nombre en
inglés de Bogotá en 0016 ("Bogota Capital District") queda para la decisión
aparte sobre los datos viejos de nivel 3.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.south-america.colombia` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-colombia.md`.

### D136 · Venezuela entra al nivel 4 con sus 335 municipios y coordenadas

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable,
que pidió seguir con otro país; borrador SQL sin aplicar en
`supabase/sql-drafts/`, en la rama `nivel4-venezuela`. Octavo país después de
Uruguay, Chile, Paraguay, Bolivia, Ecuador, Perú y Colombia (D129–D135).
**Qué pasaba.** Las 25 entidades de nivel 3 de Venezuela no tenían hijos.

- **Nivel 4 = los municipios,** cada uno con su alcaldía, del COD-AB de HDX
  (datos del INE, CC BY-IGO), con un punto por municipio. El generador exige 335.
- **Las Dependencias Federales** no tienen municipio y quedan en su nivel 3.
- **Distrito Capital y La Guaira** llevan su único municipio (Libertador y
  Vargas), porque la alcaldía es un gobierno distinto del de nivel 3. No es
  el caso de Asunción (D131) ni de Bogotá (D135), donde la comunidad de nivel
  3 ya es el gobierno local.
- **Slug con estado,** porque hay homónimos entre estados.
  **Cómo se aplica.** `scripts/build-venezuela-level4-draft.mjs` baja el COD-AB
  y escribe `supabase/sql-drafts/0084_venezuela_local_governments.sql`; la
  lógica pura está en `scripts/venezuela-level4-lib.mjs`.
  **Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel.
  `earth.south-america.venezuela` que no tengan contenido ni residentes.
  Documento: `02-DOCS/wiki/ftd/nivel4-venezuela.md`.

### D137 · Brasil entra al nivel 4 con sus 5.569 municipios; el slug lleva la sigla del estado

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable,
que pidió seguir con otro país; borrador SQL sin aplicar en
`supabase/sql-drafts/`. Noveno país después de Uruguay a Venezuela
(D129–D136).

**Qué pasaba.** Los 26 estados de Brasil y el Distrito Federal (nivel 3) no
tenían hijos. En 0016 dos estados tienen el slug mal escrito
(`brasil-rio-de-jeneiro`, `brasil-rio-granda-do-norte`) y los nombres no
llevan tildes.

**Qué se decide.**

- **Nivel 4 = los municipios,** cada uno con su prefeitura, de la API de
  localidades del IBGE. El generador exige las 5.571 entradas que hoy trae.
- **Afuera:** Brasília, que es el Distrito Federal y ya es nivel 3 (como
  Bogotá, D135), y Fernando de Noronha, distrito estadual sin prefeitura
  (como el territorio sin municipio de Uruguay, D129).
- **Slug `brasil-<sigla>-<municipio>`,** distinto del patrón de los otros
  países, para que los errores de 0016 no queden en las URLs nuevas. El
  `path` los hereda del padre hasta que se corrija 0016, que es una decisión
  aparte.
- **Sin coordenadas:** la API no las trae.

**Cómo se aplica.** `scripts/build-brasil-level4-draft.mjs` consulta la API y
escribe `supabase/sql-drafts/0085_brasil_local_governments.sql`; la lógica
pura está en `scripts/brasil-level4-lib.mjs`, que compara la sigla y el nombre
de cada UF con su código.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.south-america.brasil` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-brasil.md`.

### D138 · México entra al nivel 4 con sus municipios y las 16 alcaldías de la Ciudad de México

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable,
que pidió seguir con más países y saltear Guyana y Surinam; borrador SQL sin
aplicar en `supabase/sql-drafts/`. Primer país fuera de Sudamérica.

**Qué pasaba.** Las 32 entidades de México (nivel 3) no tenían hijos. Guyana
y Surinam quedaron para después: el COD-AB de Surinam viene de GADM (uso no
comercial) y el gobierno local de Guyana no cubre todo el país.

**Qué se decide.**

- **Nivel 4 = los municipios y las alcaldías** de la Ciudad de México, del
  catálogo geoestadístico del INEGI. Las alcaldías van porque se eligen por
  voto, como las comunas de CABA (D127). El generador exige 2.478.
- **Slug con entidad,** porque hay homónimos entre entidades. Los dos pares
  repetidos dentro de Oaxaca llevan su clave INEGI en el nombre y el slug
  hasta tener el distrito que los distingue.
- **Sin coordenadas:** el servicio no las trae.

**Cómo se aplica.** `scripts/build-mexico-level4-draft.mjs` consulta el
catálogo entidad por entidad y escribe
`supabase/sql-drafts/0086_mexico_local_governments.sql`; la lógica pura está
en `scripts/mexico-level4-lib.mjs`, que compara el nombre oficial de cada
entidad con su clave.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel. El nombre en
inglés de la capital en 0016 ("Mexico City") queda para la decisión aparte
sobre los datos viejos de nivel 3.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.north-america.mexico` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-mexico.md`.

### D139 · Guatemala entra al nivel 4 con sus 340 municipios y coordenadas

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable;
borrador SQL sin aplicar en `supabase/sql-drafts/`. Primer país de
Centroamérica.

**Qué pasaba.** Los 22 departamentos de Guatemala (nivel 3) no tenían hijos.
Tres están mal cargados en 0016 ("Izabal Department", "Santa Rosa
Department", "Suchitepeque").

**Qué se decide.**

- **Nivel 4 = los municipios,** cada uno con su alcaldía, del COD-AB de HDX
  (datos de la CONRED, CC BY-IGO), con un punto por municipio. El generador
  exige 340.
- **Los lagos de Amatitlán y Atitlán,** que la capa trae como unidades, no
  son municipios y quedan afuera.
- **Slug con el nombre correcto del departamento,** aunque el padre se busque
  por el slug de 0016, para que el error no quede en las URLs nuevas, como en
  Brasil (D137).

**Cómo se aplica.** `scripts/build-guatemala-level4-draft.mjs` baja el COD-AB
y escribe `supabase/sql-drafts/0087_guatemala_local_governments.sql`; la
lógica pura está en `scripts/guatemala-level4-lib.mjs`.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.north-america.guatemala` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-guatemala.md`.

### D140 · Honduras entra al nivel 4 con sus 298 municipios, con un molde común para los COD-AB

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable;
borrador SQL sin aplicar en `supabase/sql-drafts/`.

**Qué pasaba.** Los 18 departamentos de Honduras (nivel 3) no tenían hijos,
y en 0016 están en inglés ("Atlántida Department", "Bay Islands"). Venezuela
y Guatemala ya repetían la misma forma de COD-AB con hoja de puntos.

**Qué se decide.**

- **Nivel 4 = los municipios,** del COD-AB de HDX (SINIT/SEPLAN, CC BY-IGO),
  con un punto cada uno. El generador exige 298.
- **Tildes de Wikidata** con la regla de Perú (D134), porque el COD-AB trae
  casi todo sin tildes.
- **Molde común:** `scripts/cod-ab-level4-lib.mjs` con su spec, la
  configuración por país en `scripts/cod-ab-level4-countries.mjs` y un solo
  generador, `scripts/build-cod-ab-level4-draft.mjs <país>`. Los países
  anteriores no se tocan.
- **Slug con el nombre correcto del padre,** aunque el padre se busque por su
  slug de 0016, como en Brasil (D137) y Guatemala (D139).

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.north-america.honduras` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-honduras-costa-rica.md`.

### D141 · Costa Rica entra al nivel 4 con sus 84 cantones; El Salvador, Nicaragua y Panamá esperan una fuente oficial

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable;
borrador SQL sin aplicar en `supabase/sql-drafts/`.

**Qué se decide.**

- **Costa Rica: nivel 4 = los cantones,** cada uno con su municipalidad, del
  COD-AB de HDX (INEC, CC BY-IGO, 2024), con un punto cada uno y el molde de
  D140. El generador exige 84.
- **El Salvador, Nicaragua y Panamá quedan afuera:** su COD-AB viene de GADM,
  de uso no comercial, el mismo motivo por el que se salteó Surinam (D138).
  El de El Salvador, además, es anterior a la reforma de 2024 que bajó sus
  262 municipios a 44. Hace falta una fuente oficial que se pueda reutilizar.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.north-america.costa-rica` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-honduras-costa-rica.md`.

### D142 · El Salvador entra al nivel 4 con los 44 municipios del Decreto 762, desde Wikidata

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable,
que eligió Wikidata con control oficial; borrador SQL sin aplicar en
`supabase/sql-drafts/`.

**Qué se decide.** Nivel 4 = los 44 municipios vigentes desde el 01-05-2024
(Decreto 762). La lista, los nombres y los puntos salen de Wikidata (CC0, de
terceros), y el generador exige 44. San Sebastián Analco, que Wikidata tipa
como municipio pero no está en el decreto, queda excluida por identificador.
El molde es `scripts/list-level4-lib.mjs`, común a D142–D144.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.north-america.el-salvador` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-salvador-nicaragua-panama.md`.

### D143 · Nicaragua entra al nivel 4 con los 153 municipios de la Ley 59, desde Wikidata

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable;
borrador SQL sin aplicar en `supabase/sql-drafts/`.

**Qué se decide.** Nivel 4 = los 153 municipios de la Ley 59 de División
Política Administrativa, bajo los 15 departamentos y las 2 regiones
autónomas. Lista, nombres y puntos de Wikidata (CC0, de terceros); el
generador exige 153 y Wikidata los trae exactos.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.north-america.nicaragua` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-salvador-nicaragua-panama.md`.

### D144 · Panamá entra al nivel 4 con sus 81 distritos de la capa oficial de la ANATI

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable;
borrador SQL sin aplicar en `supabase/sql-drafts/`.

**Qué se decide.** Nivel 4 = los distritos, cada uno con su alcaldía, de la
capa del Instituto Geográfico Nacional Tommy Guardia (ANATI), que es oficial.
Naso Tjër Di y Guna Yala son comarcas con categoría de distrito que ya son
nivel 3 y quedan afuera, como Asunción (D131). Quedan 81. Sólo nombres y
códigos, sin coordenadas: la capa no declara licencia.

**Qué no cambia, en los tres.** RLS, `is_member`, cupos y plazos por nivel.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.north-america.panama` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-salvador-nicaragua-panama.md`.

### D145 · República Dominicana entra al nivel 4 con 154 municipios; La Victoria queda pendiente

**Fecha:** 20 de noviembre de 2026. **Estado:** decidida por el responsable,
que pidió seguir con el Caribe; borrador SQL sin aplicar en
`supabase/sql-drafts/`.

**Qué se decide.**

- **Nivel 4 = los municipios,** del COD-AB de HDX (Oficina Nacional de
  Estadística, CC BY-IGO, 2021), con un punto cada uno, bajo sus 31
  provincias. Santo Domingo de Guzmán es el Distrito Nacional y ya es nivel 3:
  queda afuera, como Asunción (D131). El generador exige 154.
- **Pendiente antes de promover:** La Victoria, creada en 2026, no está en la
  capa de 2021.
- **El generador del molde COD-AB (D140)** acepta otros niveles (aquí adm2 y
  adm3) y un prefijo a quitar de los nombres.
- **Cuba queda afuera por ahora:** su COD-AB viene de GADM y Wikidata mezcla
  provincias actuales con las que desaparecieron en 2011.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.north-america.republica-dominicana` que no tengan contenido ni
residentes. Documento: `02-DOCS/wiki/ftd/nivel4-republica-dominicana.md`.

### D146 · Haití entra al nivel 4 con 140 comunas; las 6 más nuevas quedan pendientes

**Fecha:** 21 de noviembre de 2026. **Estado:** decidida por el responsable,
que pidió seguir con Haití; borrador SQL sin aplicar en
`supabase/sql-drafts/`.

**Qué se decide.**

- **Nivel 4 = las comunas,** cada una con su consejo municipal, del COD-AB de
  HDX (CNIGS, CC BY-IGO, 2018), con un punto cada una, bajo sus 10
  departamentos. El generador exige 140.
- **Tildes de Wikidata en francés** (CC0), con la regla de siempre: sólo si el
  nombre difiere únicamente en tildes o mayúsculas ("Pétion-Ville",
  "Cap-Haïtien", "Jérémie").
- **Pendiente antes de promover:** Wikidata cuenta 146 comunas; las creadas
  después de 2018 no están en la capa.
- **El molde COD-AB (D140)** acepta alias del departamento (la capa dice
  "West" o "Grande'Anse" donde 0016 dice "Ouest" o "Grand'Anse") y el idioma
  de las etiquetas de Wikidata.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.north-america.haiti` que no tengan contenido ni residentes. Documento:
`02-DOCS/wiki/ftd/nivel4-haiti.md`.

### D147 · Agorbis publica su código bajo AGPL-3.0, en un repositorio nuevo sin historial, y el domicilio del responsable sale del código

**Fecha:** 21 de noviembre de 2026. **Estado:** decidida por el responsable; preparada en la
rama `codigo-abierto`, aprobada por el responsable el 21-11-2026. El
repositorio público todavía no existe.

**Qué pasaba.** El pie decía "Proyecto abierto" y el repositorio era privado
y sin licencia. Una plataforma que pide confiar en su voto secreto (D68) y en
que no hay terceros (D76) no podía mostrar cómo lo hace. Al auditar los 423
commits para abrirlo apareció el domicilio particular del responsable en
cinco documentos de `docs/`, en la configuración de build y en el inventario
de recuperación, y su correo personal como autor de todos los commits. No
apareció ningún secreto.

**Qué se decide.**

- **Licencia AGPL-3.0.** Quien modifique Agorbis y lo ofrezca en línea tiene
  que publicar sus cambios. El texto oficial vive en `LICENSE`.
- **Repositorio público nuevo, con historia desde cero.** El primer commit es
  el árbol limpio. El repositorio privado queda archivado con su historial y
  no se reescribe: reescribirlo cambiaría todos los hashes y rompería los
  pins de release de D72.
- **El público pasa a ser el repositorio principal.** El desarrollo sigue
  ahí; no hay espejo que mantener.
- **El domicilio del responsable no se versiona ni se publica.** Las páginas
  legales ya no lo mostraban desde el 20-11-2026 (`40df81f`). Se quita
  `PUBLIC_LEGAL_CONTROLLER_DOMICILE` del build, del preflight, del inventario
  de recuperación y de `.env.example`, y en `docs/` se reemplaza por
  "[domicilio reservado]". El contacto para ejercer derechos es el correo.
- **Los commits públicos llevan el correo `noreply` de GitHub** del
  responsable, no el personal.

**Qué no cambia.** Los textos legales versionados (`check-legal` sigue en
verde), la CSP, RLS y los gates de release, que conservan sus documentos de
`docs/`.

**Pendiente del responsable.** Aprobar esta decisión; hecho: `"license": "AGPL-3.0-only"` en `package.json` (`"private": true` se
queda: sólo evita publicar en npm);
crear el repositorio público y hacer el primer push; configurar el correo
`noreply`; confirmar con quien lo asesore que el registro ante la AAIP no
exige publicar el domicilio en el sitio.

**Reversión.** Antes de publicar: descartar la rama. Después de publicar no
hay reversión real: lo publicado pudo ser copiado.

### D148 · España entra al nivel 4 con sus 8.130 municipios, bajo las comunidades autónomas

**Fecha:** 21 de noviembre de 2026. **Estado:** decidida por el responsable,
que pidió España y Estados Unidos en una tanda y eligió los municipios frente
a las provincias; borrador SQL sin aplicar en `supabase/sql-drafts/`.

**Qué se decide.**

- **Nivel 4 = los municipios,** cada uno con su ayuntamiento, de la Relación
  de municipios del INE a 1 de enero de 2025 (reutilización con atribución),
  colgados directamente de su comunidad autónoma. Las provincias no son un
  nivel: quedan en la descripción ("Municipio de la provincia de Sevilla").
  El generador exige 8.132 filas en la fuente.
- **Ceuta y Melilla** son un municipio cada una y quedan en su nivel 3.
- **Slug con la provincia, siempre** (`espana-sevilla-sevilla`): hay 17
  nombres repetidos entre provincias, "Madrid" y "València" chocarían con su
  comunidad, y un homónimo nuevo no obliga a cambiar URLs existentes.
- **Nombres en el orden en que se leen:** el INE pospone el artículo
  ("Bonillo, El"); el generador lo pasa adelante con una lista cerrada de
  artículos y respeta las formas bilingües oficiales ("Donostia/San
  Sebastián").
- **Sin coordenadas:** la Relación no las trae. El GPS del onboarding sugiere
  la comunidad.
- `scripts/xlsx-sheet.mjs` acepta `skipRows` porque la planilla trae una fila
  de título antes del encabezado.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel. Los nombres en
inglés de las comunidades en 0016 ("Andalusia") quedan para otra decisión.

**Reversión.** Borrar las comunidades de nivel 4 bajo `earth.europe.espana`
que no tengan contenido ni residentes. Documento:
`02-DOCS/wiki/ftd/nivel4-espana.md`.

### D149 · Estados Unidos entra al nivel 4 con sus condados y equivalentes

**Fecha:** 21 de noviembre de 2026. **Estado:** decidida por el responsable,
que eligió los condados frente a las ciudades; borrador SQL sin aplicar en
`supabase/sql-drafts/`.

**Qué se decide.**

- **Nivel 4 = los condados y sus equivalentes** del 2024 Gazetteer del U.S.
  Census Bureau (dominio público), con su punto interior: son la única unidad
  local que cubre todo el territorio. Entran las parroquias de Luisiana, los
  boroughs y áreas censales de Alaska, las ciudades independientes (Virginia,
  Baltimore, St. Louis, Carson City) y las 9 regiones de planificación de
  Connecticut, aunque algunas no tengan gobierno de condado: reemplazarlas
  dejaría gente sin comunidad. 3.142 en total; el generador exige 3.222
  filas en la fuente.
- **Fuera:** el Distrito de Columbia, que queda en su nivel 3; Puerto Rico y
  los territorios, que no son nivel 3 en la base; y Kalawao (Hawái), sin
  gobierno propio, como Fernando de Noronha (D137).
- **Slug con la sigla del estado y el nombre completo**
  (`estados-unidos-va-fairfax-county`), como Brasil, porque Virginia tiene
  "Fairfax County" y "Fairfax city".
- **Las ciudades** quedan para un nivel 5 futuro.

**Qué no cambia.** RLS, `is_member`, cupos y plazos por nivel.

**Reversión.** Borrar las comunidades de nivel 4 bajo
`earth.north-america.estados-unidos` que no tengan contenido ni residentes.
Documento: `02-DOCS/wiki/ftd/nivel4-estados-unidos.md`.
