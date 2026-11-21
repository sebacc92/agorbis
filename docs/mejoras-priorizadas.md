# Mejoras priorizadas de Agorbis

## Quinta ronda de diseño, 15 de noviembre de 2026

Veinte mejoras en cuatro tandas, todas aplicadas, elegidas con 35 capturas del build local
sobre las pantallas que D123-D126 no tocaron. No hay decisión nueva: aplica
D123 y D126. Ver `02-DOCS/wiki/ftd/ronda-de-diseno-5.md`.

### Aplicadas (tanda 1, defectos visibles)

1. **Directorio de sub-comunidades** sin desborde en el teléfono.
2. **Carril de secciones** con degradé a la izquierda cuando hay pestañas
   escondidas.
3. **Puntos separadores** que ya no cuelgan al cortar la línea (`MetaLine`),
   en el detalle del debate y el perfil propio.
4. **Barra inferior** con la sección activa en una sola línea, marcada con
   color y una raya.
5. **Publicar** con el ícono, el color y el nombre de cada tipo.

### Aplicadas (tanda 2, coherencia con el sistema visual)

6. **Tipo de encuesta** con formas del sistema, sin glifos ni emojis.
7. **Comparativa** con la cabecera y las cifras del sistema; sin reclamos
   dice "Todavía sin reclamos" en vez de un "0%" verde.
8. **Contraste** con el ícono del reclamo en su encabezado.
9. **Una sola página "no existe"**, con la dirección pedida y el buscador.
10. **Puntos separadores** también en la cabecera de comunidad y en los
    detalles de proyecto y reclamo.

### Aplicadas (tanda 3, densidad en teléfono)

11. **Aviso a quien visita** con sus dos salidas en un renglón.
12. **Inicio** con sus dos filas de filtros en un renglón cada una.
13. **Mapa** con las distancias en un renglón.
14. **Explorar** con "Buscar" junto al campo y los filtros rápidos en un
    renglón.
15. **Instituciones** con un solo "Solicitar verificación" cuando no hay
    ninguna.

### Aplicadas (tanda 4, formularios y cuenta)

16. **Categoría** con el mismo control en reclamo y encuesta, de 44 px.
17. **Notificaciones** con sus acciones en una sola anatomía y la hora
    debajo del título en el teléfono.
18. **Seguridad** con "Un paso" o "Dos pasos", sin siglas.
19. **Pie de ingreso y registro** con un solo aviso de que los enlaces
    abren otra pestaña.
20. **Manual** con la frase de "Amor cívico" al costado en escritorio.

### Para otra ronda

- **Decisión del responsable:** plegar el aviso de visitante en las
  secciones internas ahorraría más alto, pero esconde un texto que D116
  pide a la vista.
- Los nueve puntos separadores de filas de tarjeta que no envuelven.
- Un degradé que avise que las filas de chips siguen (Inicio, mapa,
  Explorar).

## Cuarta ronda de diseño, 12 de noviembre de 2026

Diez mejoras sobre las pantallas que D123-D125 no alcanzaron, elegidas con
capturas locales y nueve auditorías de sólo lectura. Antes del deploy
pasaron en local Prettier, `tsc`, lint, Vitest y `test.release`. Ver D126 y
`02-DOCS/wiki/ftd/ronda-de-diseno-4.md`.

### Aplicadas

1. **Búsqueda** con resultados por tipo, estados traducidos, filtros con el
   chip único y coincidencias que no parten palabras.
2. **Mapa barrial** con el chip único, una sola fila de categorías y HTML
   válido en la lista.
3. **Rendición, victorias e instituciones** dentro de la comunidad, con
   métricas de una sola anatomía.
4. **Etapas de reclamos y proyectos** con una sola anatomía.
5. **Detalle de reclamo** sin emojis, con "Vence el…" cuando todavía falta.
6. **Detalle de proyecto** con la aclaración del aporte como nota y los
   aportes no monetarios con su vacío.
7. **Detalle de debate** con citas en HTML válido y "Comentar desde…" como
   acción principal.
8. **Perfil público** con banda de identidad y un pasaporte en HTML válido.
9. **Controles globales**: Accesibilidad, paleta de comandos y la pestaña
   activa de "Más".
10. **Bandeja de notificaciones** con ícono por tipo y punto de no leída.

### Para otra ronda

- Comparativa y contraste de comunidad, directorio y perfil institucional
  (diagnóstico listo, sin implementar).
- El Manual con el color y el ícono de cada tipo, y sus preguntas agrupadas
  por tema.
- Ingreso, onboarding, "Revisá tu correo" y `/publicar` con los primitivos
  del sistema.
- La distancia del mapa junto al esquema, el modo proyector de la
  rendición, el interior del flyer del reclamo, las herramientas del
  presupuesto y las columnas del debate (necesitan `global.css`).
- Decisión del responsable: si `/presupuesto` de una comunidad sin partida
  marca su pestaña mientras se está ahí. Hoy no, como dice D59.

## Tercera ronda de diseño, 10 de noviembre de 2026

Diez mejoras tras ver el diseño nuevo en local, en claro y oscuro, escritorio
y teléfono. Ver D125 y `02-DOCS/wiki/ftd/ronda-de-diseno-3.md`.

### Aplicadas

1. **Portada para visitantes al sistema nuevo.**
2. **Tipografía fluida** con `clamp()`.
3. **Voto rápido** con la anatomía de la tarjeta de votar.
4. **Fila de acciones en teléfono** con scroll horizontal.
5. **Fichas de Descubrimiento** con alturas naturales y una sola fecha.
6. **Herramientas** como sección con chips.
7. **Barrido de glifos tipográficos** a íconos.
8. **Encuestas de comunidades contenedoras** como filas interactivas.
9. **Categorías con íconos propios** y el mismo chip en filtros y formularios.
10. **Un solo llamado a crear cuenta por pantalla.**

## Segunda ronda de diseño, 10 de noviembre de 2026

Diez mejoras más sobre el detalle, el header, el perfil, los formularios y el
movimiento. Ver D124 y `02-DOCS/wiki/ftd/ronda-de-diseno-2.md`.

### Aplicadas

1. **Barra de acciones con jerarquía**: un solo "Compartir" con desplegable.
2. **Pie del detalle ordenado**: panel de autor único y extensiones compactas.
3. **La tarjeta de votar como pieza central**, con resultados reservados
   ilustrados.
4. **Un solo buscador en el header**, avatar y punto de no leídos.
5. **Perfil con identidad** y cupo por filas con barras.
6. **Escala de radios** y formularios largos con secciones y resumen pegajoso.
7. **Miga de pan colapsada** con separador uniforme.
8. **Debate sin columnas como estado vacío.**
9. **Sistema de movimiento**: tres duraciones, dos curvas, fundido entre
   páginas, sin botones que crecen.
10. **Pie de página compacto.**

## Ronda de diseño, 10 de noviembre de 2026

Pedido del responsable: diez mejoras de diseño, implementadas todas en el
orden recomendado. Diagnóstico sobre Producción (Inicio, Miramar, Explorar, 404) y los tokens de `src/global.css`. Ver D123 y
`02-DOCS/wiki/ftd/ronda-de-diseno.md`.

### Aplicadas

1. **Íconos propios en vez de emojis** para toda la interfaz
   (`src/components/ui/Icon.tsx`); el emoji queda como identidad de comunidad
   y perfil.
2. **Un color por tipo de contenido**: reclamo, encuesta, debate, proyecto y
   acuerdo con tokens `--kind-*` en ambos temas; el violeta vuelve a ser sólo
   navegación y acción primaria.
3. **Manrope para títulos**, servida desde el propio dominio, y una escala
   `text-display-*` con jerarquía real.
4. **Tarjetas sin redundancia**: título dominante, una línea de meta, extracto
   a 16 px, un solo pie.
5. **Un solo chip** (`Chip`) con tres variantes y un único estado seleccionado.
6. **Acciones rápidas compactas** en Inicio.
7. **Cabecera de comunidad** con banda por nivel geográfico e identidad grande.
8. **Métricas con una sola anatomía**; el vacío en texto atenuado.
9. **Ritmo y anchos**: feed a 72 rem, barra lateral pegajosa, Explorar con
   tarjetas clicables enteras.
10. **Dos niveles de superficie e ilustraciones propias** para 404 y vacíos.

## Acceso y primeros pasos, 9 de noviembre de 2026

Pedido del responsable: un registro, un ingreso y unos primeros pasos simples
de entender, y sumar Google. Recorrido real en preview local a 390 px con una
cuenta nueva (ingreso → acuerdos → nombre → comunidad → inicio) más capturas de
Producción. Ver D121 y `02-DOCS/wiki/ftd/acceso-y-primeros-pasos.md`. Google
no se enciende acá: el flujo existe (D66, D70, D97) y la activación es del
responsable; la lista de pasos está en D121.

### Aplicadas

1. **Los pasos del alta navegan como documento.** Aceptar acuerdos, guardar el
   nombre y confirmar la comunidad usan `reloadDocument`, como Ingresar. En un
   recorrido el router quedó trabado tras la redirección SPA y el botón del
   paso siguiente giró sin hacer nada (D115).
2. **"Paso 1 de 5" desde el registro.** La línea compacta del recorrido va
   arriba del título también con la bienvenida al lado; el subtítulo dice los
   cinco pasos en vez de "Te lleva un minuto".
3. **Los acuerdos repetidos se explican.** `/consentimiento` de cuenta nueva
   dice que ya se marcaron al registrarse y que ahora quedan registrados con la
   sesión. Las casillas no cambian (D73, D108).
4. **"¿Dónde vivís?" empieza por el buscador.** GPS debajo como alternativa
   discreta; en la raíz, los seis continentes quedan plegados detrás de
   "Explorar por continente".
5. **Correo mal escrito.** "¿Quisiste decir …@gmail.com?" en el registro para
   los proveedores masivos a un error de distancia; nunca corrige solo.
6. **Quien ya tenía cuenta sabe qué hacer.** La tarjeta "Revisá tu correo"
   agrega ingresar o recuperar la contraseña, sin revelar si el correo existía.
7. **Abrir el webmail** también al pedir un enlace de acceso, al recuperar la
   contraseña y al reenviar la confirmación.
8. **Recuperar y reenviar esperan el token de Turnstile** como Ingresar
   (D119-9): el botón se deshabilita mientras verifica.
9. **Foco en el primer campo** al abrir ingresar, registro, recuperar,
   reenviar y el paso del nombre.
10. **Vista previa del nombre.** El paso del nombre muestra cómo se va a ver la
    persona y dice que el correo no se muestra en ningún lado.

### Vistos, sin tocar

- Las casillas de Google en Ingresar (edad, privacidad, transferencias y el
  aviso de Google) son cuatro antes de saber si la cuenta existe: es la regla
  de D66/D70, no un descuido de interfaz.
- Producción (app anterior a D117) mostraba "No pudimos cargar la verificación
  antiabuso" en `/recuperar` y `/reenviar-confirmacion` bajo Chromium sin
  cabeza; el preview local con las claves de prueba no lo reproduce.
- "Mi cuenta" en la cabecera durante los pasos del alta lleva al perfil antes
  de elegir comunidad.

## Fuera de ronda: acuerdos entre comunidades, 9 de noviembre de 2026

Idea del responsable del 08-11-2026, no sale de una auditoría de UI/UX. Es la
primera función que recorre la cadena SDD entera (brief, spec aprobada, plan,
tareas, avance con evidencia) en `02-DOCS/wiki/sdd/`. Un acuerdo es un
compromiso que cada comunidad vota por separado y que existe sólo si todas lo
aprueban; cada ronda es una encuesta binaria existente, así que hereda D68
entero. Ver D118. Quedan pendientes el E2E completo (T011), la revisión D113
(T012) y el `db push` de `0074` a Producción, que hace el responsable.

## Décima ronda de UI/UX del 9 de noviembre de 2026

Pedido del responsable: recorrer todo el sitio, proponer diez mejoras y
aplicarlas en el orden recomendado sin preguntar. Auditoría sobre Producción,
a 390 px como visitante (Playwright) y con sesión en escritorio (Chrome del
responsable); Producción corría la app anterior a D117, así que lo ya resuelto
en `main` no se contó. Ver D119 y `02-DOCS/wiki/ftd/decima-ronda-ui-ux.md`.

### Aplicadas, en el orden en que se hicieron

1. **Ingresar espera al token de Turnstile** (`a75db08`). Tocar antes del token
   daba 403 y borraba la contraseña; ahora el botón espera con una región viva.
2. **Comunidad con un solo llamado para visitantes** (`3230320`). Tres llamados
   y la primera encuesta a 1.350 px; "Invitar vecinos" sólo para residentes.
3. **Balance honesto** (`ed16137`). "Lo que pasa en {{name}}" y "Todavía
   ninguno" en lugar de "Poder ciudadano medible" sobre ceros.
4. **Encuestas de la cadena en vez del pie duplicado** (`494270a`).
5. **Pestañas que no se parten y avisan el desborde** (`373a5b8`).
6. **Una sola llamada por tarjeta de encuesta** (`ece5d8c`).
7. **Miga colapsada en teléfono** (`3c9eedf`). "… › Buenos Aires › Miramar".
8. **Guía de tres pasos después del primer reclamo, sólo residentes** (`7cb9298`).
9. **Buscar con el primer resultado en la primera pantalla** (`1f06346`). E2E
   nuevo que lo mide.
10. **Perfil con la residencia primero y sin sellos pendientes** (`f8a15c5`).

### Vistos y fuera por el tope de diez

- Compartir, WhatsApp y Telegram juntos en cada publicación.
- El nombre cortado en el encabezado de escritorio ("Sebastian Card…").
- Encontrar la propia ciudad y "¿Dónde vivís?" (D112, 8 y 9): esperan la
  migración de localidades.

## Novena ronda de UI/UX del 3 de noviembre de 2026

Pedido del responsable: implementar diez mejoras de UI/UX donde hagan falta.
Producción abrió el día anterior y está casi vacía, así que se priorizó el primer
uso en el teléfono. Auditoría en navegador real con seis lentes (primer uso,
participación diaria, formularios, navegación y búsqueda, accesibilidad y
extremos, jerarquía visual): 48 candidatos, lista corta de 16 y tres
verificaciones por candidato (reproducción, alcance e invariantes, valor). Ver
D112.

El 4 de noviembre el responsable acotó la ronda: se aplican las cuatro primeras, se
postergan las otras seis y se cierra con los controles de cada mejora.

### Aplicadas

1. **Zona del autor sólo para quien corresponde** (`7b231e2`). `null === null` le
   mostraba a una visitante "Sí, cerrar la votación" en todo contenido sin autor. Un
   proyecto le ofrecía 11 formularios y ahora ninguno.
2. **Encuestas legibles sin poder votar** (`d3f0f53`). Las opciones no se dibujaban
   para visitantes, otras residencias ni quien ya votó; el widget las cortaba a
   390 px. Ahora hay una lista sin conteos ni marcas, y "Crear cuenta" es el llamado
   principal de una visitante.
3. **El formulario empieza en el primer campo** (`76c9ba0`). Quedaba en y≈900 a
   390 px, debajo de la cabecera completa de la comunidad, con dos `h1`. A 390×844
   ahora entra entero en la primera pantalla.
4. **"Revisar" muestra la revisión** (`a10ea1d`, `3928bde`). La pantalla quedaba en
   el pie, el foco en `BODY` y el lector anunciaba "Nuevo reclamo". Con teclado,
   Publicar queda a 2 Tab, contra 18 de la auditoría.

### Postergadas por el responsable

Comprobadas por la auditoría, sin implementar:

5. **Llamados a publicar que llegan.** Tocar "Crear la primera encuesta" podía
   terminar en "Se rompió algo de esta página". **Aplicada el 07-11-2026
   (D115):** los enlaces ya saben a dónde ir según la persona y el límite de
   errores se recupera cuando la navegación terminó en otra URL.
6. **Comunidad vacía con algo para hacer.** Encuestas abiertas de la cadena en el
   estado vacío, sin felicitar por casillas y sin afirmar una "residencia
   declarada" a quien no la eligió. **Aplicada el 07-11-2026 (D116):** hasta
   tres encuestas de los ancestros enlazadas, "Qué podés hacer acá" como
   enlaces planos y tres textos de residencia según la situación.
7. **Inicio con publicaciones a la vista.** La primera tarjeta estaba en y=1151, un
   chip no mostraba su resultado y lo votado seguía diciendo "Participar del voto".
   **Aplicada el 08-11-2026 (D117):** cabecera compacta con las cuatro acciones
   en una fila, línea "Mostrando…" al filtrar, y "Ya votaste" / "Apoyaste" con los
   recibos y apoyos propios; sin lectura, no se afirma nada.
8. **Encontrar la propia ciudad.** Búsqueda sin tildes, homónimos distinguibles,
   Argentina primero, resultado en la primera pantalla y salida cuando la ciudad
   no está.
9. **"¿Dónde vivís?" sin afirmar un lugar.** Desde Mendoza proponía Santiago de
   Chile con "Detectamos"; el primer toque tras recargar no hacía nada; CABA
   desbordaba 45 px y los campos vacíos parecían datos de otra persona.
10. **Un envío nunca queda mudo.** Con la red caída quedaban botón y velo clavados;
    tras una carga completa no había señal y un segundo toque mandaba otro POST.
    **Aplicada el 07-11-2026 (D114):** guardián de acciones en `root.tsx`, aviso
    "No sabemos si se publicó" y bloqueo del botón hasta abrir la ficha.

### Verificación

Cada mejora pasó sus controles sobre su commit: `pnpm lint`, `pnpm build.types`,
`pnpm test` y sus E2E, vistos fallar antes del arreglo. La mejora 3 corrió además
`pnpm test.release`. Sobre `3928bde`: 1.311 pruebas y 53 E2E en serie.

**Sin correr, por decisión del responsable:** la suite E2E completa y una revisión
adversarial. Tampoco `test.release` sobre `3928bde`. **Sin probar:** Safari y
Firefox, lector de pantalla real, teléfono real, Turnstile real y Producción.

### Vistos al implementar, sin tocar

- **Afirma algo que no consta (D74).** Debates, proyectos y reclamos sin `author_id`
  dicen "Cuenta eliminada". La migración 0017 crea el contenido editorial sin autor
  si `@seba` todavía no existe, así que puede no haber ninguna baja de por medio. En
  local pasa con 20 de 21 debates; en Producción no se comprobó.
- **Encuestas.** A una visitante, en una encuesta cerrada, se le sigue diciendo "Para
  votar necesitás una cuenta"; con otra residencia, "cuando se publiquen" aunque ya
  estén publicados. La línea de metadatos dice "Cierra el…" con la encuesta cerrada.
  Una cuenta sin residencia lee "Si te mudaste…". El radio de opción única cambia de
  tamaño según la etiqueta, y la pregunta del widget no lleva `dir="auto"`.
- **Foco.** `useExtensionErrorFocus` tiene la misma carrera que `holdFocus` resolvió
  para los formularios, y `content-extension-errors.spec.ts:79` y `:97` fallan
  intermitentes con la máquina cargada, también antes de la ronda. Sacar
  `isNavigating` del render del layout podría resolver la causa; no se probó.
- **Formularios.** A 320×740 el primer campo sigue debajo de la barra inferior
  (y≈750 contra 653; antes, 1185). `presupuesto/nueva` no tiene E2E propio. La miga
  con enlace no se desplaza a su extremo. La insignia de nivel se monta sobre "Cambiar
  nivel" a 320 y 340 px. `document.title` sigue en "Nuevo reclamo" durante la
  revisión. "Abrir debate" queda en y=3035 a 390 px por la lista de 140 columnas. Tras
  Volver a editar puede decir "Recuperamos el borrador guardado".
- **Proyectos.** "Aportes no monetarios" queda como título solo, y el enlace "Ofrecelos
  acá" lleva ahí sin ningún llamado (D96).
- **Listas.** `/c/mar-del-plata/reclamos/` abre con `scrollY=72` a 390 px y esconde la
  miga.

### Para otra ronda

Comprobados y fuera por el tope de diez, de mayor a menor valor:

- Comunidad en el teléfono: cabecera compacta en secciones, un solo llamado para
  visitantes, listas vacías sin filtros, pestañas a la vista y el chip de
  "140 ciudades" como enlace.
- La página salta sola al cargar listas (hasta 478 px a 375×667) y un título con una
  URL larga ensancha la lista de toda la comunidad.
- Ingresar antes de que llegue el token de Turnstile falla y borra la contraseña.
- "Saltar al contenido" no mueve el foco, barras fijas que tapan el foco y colores
  forzados sin anillo.
- Sin aviso de conexión al navegar; idempotencia de publicar ante una respuesta
  perdida; "Probá de nuevo" al comentar dos veces en 15 s; la marca "Nuevo"
  desaparece al abrir una tarjeta; detector de reclamos similares; cota de la
  fecha de cierre; "Cambiar nivel" con el reclamo ya escrito; cifras precargadas
  en la calculadora de costos; plurales en inglés y vocabulario unificado.

**Del responsable (migración):** cargar las localidades de las otras 23
jurisdicciones. Sólo Buenos Aires tiene nivel 4, y es lo que más cambiaría el primer
uso.

## Octava ronda de UI/UX y seguridad de interfaz del 26 de octubre de 2026

Revisión de sólo lectura en seis áreas (acceso, formularios de creación,
detalles e interacción, navegación y accesibilidad, cuenta y datos
personales, moderación e instituciones), más chequeos transversales
(cabeceras, CSRF del router, sanitizadores, cookies, caché, `localStorage`,
`pnpm audit`, semántica de `invalidate`). Registró 5 hallazgos de severidad
alta, 36 medias y unos 45 bajos. No se confirmó ninguna vulnerabilidad
clásica (XSS, open redirect, IDOR, salto de RLS o del voto secreto). La
aplicación de lo que no toca archivos reservados quedó en D98; acá va el
estado de cada punto.

### Alta

1. **Hecho (D98).** Con `strictLoaders`, 22 acciones sin `invalidate` ni
   redirección dejaban la pantalla vieja: toda la moderación, la revisión de
   postulaciones y la asignación de organismo. Declaran el loader; E2E con
   JavaScript `moderation-queue-refresh`.
2. **Hecho (D98).** El dossier de prensa afirmaba "vencimiento legal", "se
   elevó automáticamente para intervención gubernamental" y "firmas"; la
   guardia de contenido ficticio no atrapaba las variantes.
3. **Hecho (D98).** El cambio de contraseña confiaba en el toggle "Require
   current password" de Supabase; ahora verifica la contraseña actual en la
   app con `verifyPasswordCredential`. **Pendiente del responsable:**
   confirmar el toggle en el proyecto de producción.
4. **Pendiente del responsable (migración o texto legal).** La política de
   moderación promete motivo, aviso y apelación al ocultar contenido;
   ocultar es un `update` de estado sin motivo, ningún trigger notifica al
   autor y la única apelación es por suspensión.
5. **Pendiente del responsable (`package.json`, `pnpm-workspace.yaml`).**
   `pnpm audit --audit-level=high` falla: zod 4.4.3 (<4.6.6, runtime) y tres
   advisories dev sin ignorar (vite/launch-editor, undici); `verificar` queda
   en rojo.

### Media

- **Hecho:** `/auth/confirm` y consentimiento de Google con `same-origin` en
  lugar de `no-referrer` (POST nativo sin JS daba 403 de CSRF); `requireUser`
  arma `next` con `returnPathFor` (los `next` anidados de D93/D96); ingreso con
  mensajes distintos para red, correo sin confirmar y credencial; alta sin
  enumeración por rate limit; "Revisá tu correo" en vez de "Enlace enviado";
  descarga de datos sin `download` y aviso de `reauth=1`.
- **Hecho:** afiche de proyecto sin jornada ni dominio fijo; "Rendición de
  Cuentas Municipal" → reclamos por categoría y estado; Victorias con fecha de
  reporte; copys sin causalidad inventada; tarjeta de IA oculta sin
  configuración; hitos y guía sin logros automáticos; invitación por WhatsApp
  del inicio traducida y sin "resolver reclamos".
- **Hecho:** topes de la base (12 fotos, 20/h, 3 solicitudes, 3/día) y
  `raise` de moderación con su motivo real; `website` saneado en el directorio
  por comunidad; "Volver a editar" conserva las fotos subidas; borrador
  recuperado anunciado y descartable en los cuatro formularios; instantes en
  la zona del visitante; monto solicitado del proyecto elegido; perfil
  público sin totales inventados.
- **Hecho (a11y):** contrastes bajo AA; atajos de una tecla apagables (WCAG
  2.1.4); toasts con pausa y errores persistentes (2.2.1); errores inline
  con `aria-describedby`; reglas de contraseña legibles; `role="group"` en
  Turnstile; un solo `h1` en mapa y comparativa.
- **Pendiente del responsable (SQL):** `actor_id` del moderador legible por
  la API en notificaciones de suspensión y rechazo; la misma persona puede
  suspender y resolver la apelación; "Tomar revisión" exige y expone un
  fundamento; rechazos irreversibles sin motivo (`organization_requests` sin
  `resolution_note`); CUIT y teléfono en texto libre sin retención.
- **Pendiente del responsable (producto/configuración):** sesión de 400 días
  sin opción de dispositivo compartido (Privacidad); códigos de respaldo de
  MFA; instituciones nunca ligadas a una comunidad (`community_id` en la
  solicitud); criterio público de "Verificada"/"Acreditada oficial".

### Baja

- **Hecho:** `noindex` en imprimibles; `?desde_reclamo` y `voteComment`
  validan antes de ir a la base; baja sin limpiar `localStorage` antes de
  tiempo y con "Qué se borra" exacto (D68); `?lang=` por `safeInternalPath`;
  paleta de comandos sin acciones de cuenta sin sesión y "Mi perfil"; rol
  legible en Cuentas; cola sin desborde y sin "Se cerraron 0 reportes";
  emojis decorativos ocultos; enlaces que avisan la pestaña nueva;
  desplazamientos que respetan "Reducir animaciones"; controles de la guía
  de 44 px con etiquetas por paso; `aria-haspopup` y `aria-pressed`
  corregidos; región de toasts renombrada.
- **Pendiente:** `check-i18n` no mira los 19 archivos de `src/lib` que
  importan `./i18n` ni `ev.fail`/`ev.error`/zod/`title` (en inglés, casi todos
  los errores del servidor salen en castellano); plurales y números sin
  `pluralize`/`formatNumber` en varios componentes; nombres distintos para un
  mismo concepto ("Me afecta también"/"Apoyar", "Sumate"/"Crear cuenta",
  "Cómo funciona"/"Cómo usar Agorbis"); fecha de cierre de encuesta sin cota;
  sin idempotencia en la confirmación de publicar; fotos sin texto
  alternativo propio; detector de reclamos similares con una palabra; cifras
  de ejemplo precargadas en la calculadora de costos; `image_url` sin
  `safeClaimMediaUrl` en cuatro sinks; `/internal/health` público; sin `axe`
  ni `jsx-a11y` en el tooling; `/metricas` "0% de registros".

### Verificación de esta ronda

- `pnpm build.types`, `pnpm lint` y `pnpm test`: 1.223 pruebas en 177
  archivos (un spec de solicitudes esperaba el 400 genérico ante el gate; se
  corrigió para afirmar el 403 del gate y el 429 de los topes).
- E2E (preview local + Supabase en Docker), subconjunto de las áreas tocadas:
  `account-access`, `moderation-queue-refresh` (nuevo, con JavaScript),
  `moderation-native-followups`, `native-forms`, `publication-drafts`,
  `detail-consistency`, `navigation-home`, `global-controls`,
  `ui-ux-regressions`: 37 de 39 casos; los dos fallos (etiqueta vieja del
  botón del tema; `next` anidado de la carrera del router) se corrigieron y
  los dos archivos pasaron completos al repetirlos (13 casos).
- Pendiente antes del release: la suite E2E completa en serie, como en CI, y
  el `pnpm audit` del punto 5 de Alta.
- Veinticuatro commits locales, uno por tema, sin tocar archivos reservados;
  el push lo hace el responsable. La guía paso a paso de lo que depende del
  responsable acompaña el informe de la sesión.

## Séptima ronda de UI/UX del 25 de octubre de 2026

Revisión de veinticinco mejoras, ordenadas de la más importante a la menos.
Las rondas D78–D90 resolvieron la robustez de formularios y estados. Esta
revisión mira los recorridos, la honestidad de los textos, el primer uso de
una Producción vacía y la coherencia del sistema visual. La primera tanda (1,
2, 3, 6, 7 y 8) está implementada en D93, la segunda (4, 5 y 10 a 14) en D94,
la tercera (15 a 20) en D95 y la cuarta (21 a 25) en D96. La 9 requiere una
decisión del responsable, y de la 23 quedan propuestos los componentes.

### Bugs visibles y honestidad

1. **Clases que no generan CSS.** _Hecha (D93)._ Cabecera, barra inferior,
   pestañas y menús quedaban transparentes por `@utility` sin opacidad.
2. **Escalado de reclamos sin promesas falsas.** _Hecha (D93)._ Ni "escala
   automáticamente a la Municipalidad" ni "firmas": un solo reloj con las tres
   condiciones de 0026.
3. **Registro que vuelve al contenido.** _Hecha (D93)._ "Crear cuenta" y el
   onboarding exigido conservan la página de origen.
4. **Quien tiene cuenta no vuelve a la portada de marketing.** _Hecha (D94)._ `/`, el logo y
   el ingreso llevan a `/inicio`, o al onboarding sin residencia, sin cachear
   la redirección.
5. **Comunidad nueva sin tablero de ceros.** _Hecha (D94)._ Reemplazar los cuatro contadores
   en 0 y el aviso "en redacción" por un "Empezá vos", con la bienvenida
   arriba para miembros nuevos.
6. **Apoyar desde la barra móvil.** _Hecha (D93)._ "Ingresar para apoyar" o
   "Revisar mi residencia" según el caso.
7. **Reparto definitivo explícito.** _Hecha (D93)._ Botón, confirmación,
   fichas sin usar y regreso tras ingresar.
8. **Alto contraste del panel.** _Hecha (D93)._ La clase aplica los mismos
   tokens que el media query.
9. **Una sola aceptación legal en el alta.** _Decisión del responsable (D73,
   code owners)._ `/registro` pide casillas que no persiste y
   `/consentimiento` vuelve a pedirlas; también la regla de contraseña de
   cuatro tipos.

### Primer uso y descubrimiento

10. **Encontrar el propio lugar.** _Hecha (D94)._ Explorar busca sólo en el nivel actual y
    arranca en Tierra; ofrecer búsqueda global y "¿No está tu lugar? Pedilo".
11. **Próximo paso después de publicar.** _Hecha (D94)._ Una tarjeta para la autoría con
    plazos, difusión y cómo editar o retirar.
12. **"Mi comunidad" en la barra inferior.** _Hecha (D94)._ Para anónimos, Avisos y Perfil
    pasan a un solo "Ingresar".
13. **Portada con actividad real.** _Hecha (D94)._ Un "Pasando ahora" con datos públicos, sin
    enlaces a una Tierra vacía y con ejemplos argentinos.
14. **Lenguaje llano y vocabulario único.** _Hecha (D94)._ "Tu elección no
    queda guardada" antes del detalle técnico; Encuestas, Notificaciones y
    Cómo funciona como único nombre. Sin cuántos votos faltan (D68).

### Acciones principales

15. **Reclamo en una sola pantalla.** _Hecha (D95)._ Ubicación y fotos plegables y una sola
    confirmación del servidor.
16. **Aportes de proyecto claros.** _Hecha (D95)._ Un panel "Sumarme" que diga que nadie
    transfiere dinero por Agorbis.
17. **Un solo "Difundir".** _Hecha (D95)._ Nueve accesos a compartir e imprimibles en el
    detalle del reclamo.
18. **Notificaciones con la lista primero.** _Hecha (D95)._ El resumen y las preferencias
    dejan de ocupar dos pantallas.
19. **Qué pasa después en encuestas y proyectos.** _Hecha (D95)._ "Te avisamos cuando
    cierre" y un solo mapa de estados de proyecto.
20. **Comentar un debate desde el teléfono.** _Hecha (D95)._ La caja queda al fondo de una
    columna dentro de un carrusel.

### Coherencia sistémica

21. **Vibración, confeti y movimiento reducido.** _Hecha (D96)._ Vibración
    opcional y nunca al apoyar el dedo; voto y apoyo vibran tras la
    confirmación. Confeti sólo para celebrar a mano un hito o un sello. Un
    único `prefersReducedMotion()`.
22. **Un detalle común para los cuatro tipos.** _Hecha (D96)._ Guardar y
    Compartir debajo del título, Reportar al final, hasta tres insignias en la
    encuesta y extensiones vacías sólo para quien puede completarlas.
23. **Sistema de diseño completo.** _Hecha en parte (D96)._ Textos chicos en
    `rem`, esmeraldas pasadas a `success` y un trinquete que rechaza píxeles y
    congela los colores crudos restantes. Quedan propuestos los componentes
    (chips, paginación, estados y encabezados) y la migración archivo por
    archivo.
24. **Menos destinos de navegación.** _Hecha (D96)._ Cabecera desde 1024 px
    sin duplicados; cinco secciones de comunidad y "Más"; Comparar reúne
    contraste y comparativa; mapa barrial y rendición, de ciudad para abajo.
25. **Moderación por antigüedad.** _Hecha (D96)._ Lo que más esperó primero,
    una tarjeta por contenido, "Ocultar y resolver", bloqueo por tarjeta,
    contadores y solicitudes plegadas. Las coordenadas siguen a mano: no hay
    un selector de mapa sin sumar un tercero.

Fuera de las veinticinco: el perfil abre en el pasaporte, los toasts de error
se cierran a los 3,5 s, el catálogo inglés de 347 KB se precarga en cada
página, `world-map.svg` no tiene caché y "Lectura facilitada" usa `*` con
`!important`.

## Sexta ronda de UI/UX del 24 de octubre de 2026

Implementa las veinte propuestas posteriores a D89 por pedido del responsable.
Ver D90. Conserva permisos, privacidad y esquema, sin dependencias nuevas.

1. **Comentarios con ediciones pendientes.** Guardar limpia sólo el texto
   enviado que sigue intacto; conserva las ediciones hechas durante la espera y
   avisa que continúan en el borrador.
2. **Reportes nativos recuperables.** La confirmación HTML permite reportar
   sin JavaScript y recupera el motivo ante un rechazo. El éxito corresponde al
   contenido y a la escritura confirmados.
3. **Territorio elegido también por HTML.** Un selector GET busca comunidades
   y vuelve con su slug comprobado, conservando el término, tipo, estado y orden.
   Un territorio inexistente no amplía silenciosamente la búsqueda.
4. **Preferencias rechazadas recuperadas.** El POST nativo conserva tanto
   opciones marcadas como desmarcadas y abre el formulario que requiere corrección,
   sin anunciar un guardado que falló.
5. **Ingreso al comentario preciso.** Los votos sin sesión son enlaces HTML
   que conservan la consulta y el ancla del comentario, incluso fuera de los
   destacados; ingresar no emite un voto automáticamente.
6. **Perfil sin total parcial engañoso.** La sección Publicaciones y Actividad
   omite la insignia que sumaba sólo filas cargadas y cambiaba al paginar.
7. **Solicitudes reflejadas y sin reenvío accidental.** Instituciones y
   comunidades actualizan el historial propio después de guardar. Se limpian
   sólo los campos enviados intactos, se conservan ediciones posteriores y el
   envío nativo confirmado vuelve por GET para no repetirse al recargar.
8. **Contacto institucional incorporado en servidor.** CUIT y teléfono se
   añaden al mensaje también sin JavaScript; el límite incluye esos datos y un
   rechazo conserva los campos para corregirlos.
9. **Reclamos abiertos reales.** La tarjeta y el resumen cuentan sólo estados
   abiertos, excluyendo resueltos, rechazados y retirados. Un fallo del conteo se
   presenta como desconocido.
10. **Comparativa con etiquetas precisas.** Comunidad consultada describe el
    territorio de la URL y Personas miembro describe su cantidad de membresías,
    sin atribuir residencia ni actividad reciente.
11. **Bienvenida con capacidades reales.** La guía describe los reclamos
    ubicados del mapa, explica qué significan los apoyos y condiciona el
    presupuesto a la disponibilidad y fase de una ronda.
12. **Difusión localizada coherente.** La vista previa y el portapapeles usan
    exactamente la misma plantilla traducida para la invitación y la firma;
    un rechazo de copia ofrece copiar el texto manualmente.
13. **Filtro de avisos anunciado.** Los enlaces rápidos señalan el filtro
    activo a las ayudas técnicas y ofrecen un área táctil de al menos 44 px.
14. **Presupuesto con lecturas desconocidas explícitas.** Los errores de
    propuestas, resultados, constancia, elegibilidad, rendiciones y proyectos
    propios se distinguen de ausencias reales, con recarga y acciones bloqueadas
    cuando falta la lectura necesaria. Se conserva el voto secreto.
15. **Retiro con confirmación HTML.** El acceso y la cancelación funcionan
    sin JavaScript, conservando el contexto, los permisos y la comprobación del
    servidor antes de retirar la publicación.
16. **Selección y recibo ligados a cada encuesta.** Cambiar de encuesta
    reinicia la selección y sólo muestra la confirmación o el error del envío
    que corresponde a su ID.
17. **Etapas del reclamo respaldadas por hechos.** La meta de apoyos, la
    elevación, el acuse, la respuesta oficial y la resolución se distinguen;
    completar una etapa no inventa las anteriores.
18. **Exportaciones con errores de lectura diferenciados.** Afiche, dossier,
    nota y planilla reservan el 404 para una ausencia real y ofrecen recuperación
    ante un fallo de consulta. El dossier tampoco oculta errores de su cronología.
19. **Estados de ejecución permitidos.** Tareas, aportes, hitos y estado
    general ofrecen las transiciones que admite su estado actual y la autoridad
    de la persona; la base conserva la validación final.
20. **Selector nativo de relaciones.** La búsqueda HTML recupera publicaciones
    visibles y vuelve al formulario de origen con una selección comprobada bajo
    RLS. Elegir un resultado todavía no crea la relación: requiere confirmarla.

Verificación D90: tipos, lint, 1.142 pruebas unitarias/componentes en 168 archivos
y builds de cliente, Worker y preview aprobados. Pasaron las 17 suites SQL y
36 casos seleccionados de navegador (22 nuevos y 14 regresiones), con recorridos
JavaScript y HTML. SQL e integración usan Supabase local en Docker: API en
`127.0.0.1:54821` y PostgreSQL en `127.0.0.1:54822`, con Auth y RLS reales.
Los fallos de lectura también se prueban por separado con respuestas simuladas
en las pruebas unitarias. Los bloqueos previos de release y auditoría de D85
permanecen pendientes. Sin push, despliegue ni operaciones remotas.

## Quinta ronda de UI/UX del 23 de octubre de 2026

Implementa las veinte propuestas posteriores a D88 por pedido del responsable.
Ver D89. Conserva permisos, privacidad y esquema, sin dependencias nuevas.

1. **Segundo factor recuperable.** El rechazo de un código nativo permite
   retomar el mismo factor TOTP propio pendiente, sin volver a mostrar el secreto.
2. **Avisos leídos reflejados.** La bandeja y la campana se actualizan después
   de la escritura, conservando filtros y página también en el POST nativo.
3. **Apelaciones confirmadas.** Enviar y retirar actualiza el historial de la
   suspensión correspondiente y conserva otros borradores y ediciones en curso.
4. **Extensiones con errores parciales.** Fuentes, respuestas, representación
   y relaciones conservan datos disponibles, explican fallos y ofrecen recarga.
5. **Ejecución actualizada.** Hitos, tareas, aportes y estado general se
   confirman desde acciones que revalidan su detalle tras una escritura aceptada.
6. **Ejecución corregible.** Sus formularios recuperan el POST nativo,
   asocian errores a campos y preservan ediciones posteriores al envío.
7. **Preguntas completas.** Las páginas estables permiten superar el antiguo
   recorte de 200 mensajes y recuperar el mensaje enlazado o recién publicado.
8. **Relaciones visibles.** Vincular revalida el detalle, confirma el
   resultado y conserva la selección ante rechazo y los borradores de otros formularios.
9. **Regreso después de confirmar la cuenta.** El enlace de reenvío conserva
   el destino interno seguro desde Ingreso y al corregir un rechazo nativo.
10. **Directorios institucionales vigentes.** Los loaders declaran filtros y
    página y recuperan el slug desde la URL, conservando el contexto al navegar.
11. **Resultados con errores claros.** Las encuestas distinguen fallos de
    opciones, estadísticas y resultados de la reserva real de participación.
12. **Filtros nativos de avisos.** Más filtros abre y cierra controles HTML
    sin JavaScript y conserva sus valores al plegar.
13. **Cierre nativo de encuestas.** La confirmación y su cancelación funcionan
    sin JavaScript, conservando las autorizaciones del servidor.
14. **Conteos desconocidos explícitos.** Un fallo no se convierte en cero ni
    oculta herramientas comunitarias o produce resúmenes con números inventados.
15. **Victorias filtradas recuperables.** Un vacío por filtros se explica y
    ofrece volver a todas las victorias.
16. **Contactos con etiquetas asociadas.** CUIT y teléfono tienen controles
    identificados que se enfocan al tocar su etiqueta.
17. **Revisión barrial honesta.** El mapa invita a recorrer el barrio sin
    afirmar una detección de sectores sin reclamos que aún no se calcula.
18. **Fotos nativas.** Las miniaturas enlazan a la imagen completa y mejoran
    la navegación con el diálogo cuando está disponible, respetando modificadores.
19. **Recientes con contexto.** Los términos recientes conservan territorio,
    tipo, estado y orden y reinician la página.
20. **Copia manual exacta.** Un rechazo del portapapeles muestra el enlace
    compartido en un campo seleccionable y conserva la salida hasta recuperarse.

Validado localmente con tipos, lint y compilaciones de cliente, Worker y preview;
1.047 pruebas unitarias y checks de scripts; 17 suites SQL y 45 casos E2E
seleccionados, en tandas y repeticiones. Los bloqueos previos de release y
auditoría de D85 permanecen pendientes. Sin push, despliegue ni operaciones remotas.

### Veinte oportunidades implementadas posteriormente en D90

Revisión de código sobre D89, conservada como antecedente de la sexta ronda.
La navegación entre encuestas se reprodujo en una prueba dirigida antes de
corregirse. Estos puntos no amplían permisos ni exponen elecciones individuales.

1. **Conservar ediciones de comentarios durante el envío.** Debate limpia
   el borrador completo tras guardar, aunque se haya editado durante la espera.
   Limpiar sólo el texto enviado intacto y anunciar las ediciones pendientes.
   Evidencia: `src/components/debates/DebateColumn.tsx`, tarea de `post.value`.
2. **Reportar sin JavaScript y corregir sin perder el motivo.** El acceso
   autenticado depende de una señal del cliente y el borrador no recupera el
   POST rechazado. Usar confirmación HTML y restaurar el motivo enviado.
   Evidencia: `src/components/moderation/ReportButton.tsx`.
3. **Elegir territorio de búsqueda sin JavaScript.** El texto visible no
   selecciona ni envía un territorio por sí solo. Ofrecer una elección GET con
   slug validado, conservando término y filtros, para evitar una búsqueda más amplia.
   Evidencia: `src/components/community/CommunityPicker.tsx`, uso en `/buscar`.
4. **Recuperar preferencias de avisos rechazadas por HTML.** El borrador se
   inicializa desde lo guardado y descarta los checks del POST rechazado.
   Recuperar también las opciones desmarcadas y mantener la confirmación real.
   Evidencia: `src/routes/notificaciones/index.tsx`, `preferenceDraft`.
5. **Ingresar para votar y volver al comentario preciso.** El enlace de
   ingreso conserva sólo el pathname. Reutilizar la consulta y el ancla del
   comentario, incluso cuando esté fuera de los destacados.
   Evidencia: `src/components/debates/CommentCard.tsx`, voto sin sesión.
6. **Cantidad del perfil con alcance explícito.** La insignia suma las
   filas de publicaciones y actividad cargadas y cambia al paginar. Indicar
   que describe esa página u omitirla, sin presentar un total incompleto.
   Evidencia: `src/routes/perfil/index.tsx` y `src/lib/profile-page.ts`.
7. **Solicitudes reflejadas al enviarlas.** Las solicitudes de institución
   y comunidad confirman el envío sin actualizar el historial. Revalidar el
   loader propio y evitar reenviar un formulario intacto ya aceptado.
   Evidencia: `src/routes/instituciones/solicitar/index.tsx` y
   `src/routes/comunidades/solicitar/index.tsx`.
8. **Contactos institucionales enviados también sin JavaScript.** CUIT y
   teléfono se incorporan al mensaje sólo desde el cliente; la acción descarta
   sus campos. Definir la incorporación nativa y conservarlos ante rechazo.
   Evidencia: `src/routes/instituciones/solicitar/index.tsx`, campos helper y acción.
9. **Reclamos abiertos que excluyan los rechazados.** La tarjeta resta los
   resueltos de todos los no retirados, pero se anuncia como En curso. Contar
   los estados abiertos reales o utilizar una descripción consistente con el dato.
   Evidencia: `src/routes/c/[slug]/index.tsx`, métricas y enlace de reclamos.
10. **Comparativa sin inferir residencia ni actividad.** La comunidad de la
    URL se llama Tu comunidad y el total de miembros se llama Vecinos Activos.
    Usar Comunidad consultada y Personas miembro, salvo evidencia adicional.
    Evidencia: `src/routes/c/[slug]/comparativa/index.tsx`.
11. **Bienvenida con capacidades comprobables.** El recorrido promete
    proyectos cercanos en el mapa, efecto de cada firma y presupuesto disponible
    en toda comunidad. Ajustar la bienvenida a funciones y disponibilidad reales.
    Evidencia: `src/components/community/NewNeighborWelcomeModal.tsx`.
12. **Vista previa de difusión igual al texto compartido.** El mensaje
    copiado se traduce, pero su vista previa sigue en español. Calcular una
    única plantilla localizada para mostrar y copiar, conservando nombres ciudadanos.
    Evidencia: `src/components/community/CommunityPressKitCard.tsx`.
13. **Filtro activo de notificaciones anunciado.** Los enlaces rápidos
    indican selección sólo por color. Añadir `aria-current` y una superficie
    suficiente para tocarlos sin cambiar los filtros ni su URL.
    Evidencia: `src/routes/notificaciones/index.tsx`, `tab.isActive`.
14. **Presupuesto con lecturas desconocidas recuperables.** Los errores de
    propuestas, resultados, elegibilidad o recibo se convierten en listas
    vacías o respuestas negativas. Mostrar fallos por sección y reintento,
    conservando el voto secreto y la ausencia real como un estado distinto.
    Evidencia: `src/lib/budget-page.ts`.
15. **Retirar una publicación con confirmación HTML.** El formulario sólo
    se monta después de un evento del cliente. Ofrecer acceso y cancelación
    nativos, conservando las restricciones y la confirmación del servidor.
    Evidencia: `src/components/content/RemoveContentButton.tsx`.
16. **Selección y recibo de encuesta ligados a su ID.** La selección y el
    resultado de la acción pueden persistir al pasar a otra encuesta por SPA.
    Reiniciar por publicación y comprobar el ID antes de mostrar Ya votaste.
    Evidencia: `src/routes/encuestas/[id]/index.tsx`, `chosen` y `justVoted`.
17. **Etapas del reclamo sustentadas en hechos.** El tracker deduce firmas,
    elevación y respuesta oficial desde otros estados. Mostrar cada etapa sólo
    con su dato o evento confirmado y distinguir las etapas omitidas.
    Evidencia: `src/components/claims/ClaimProgressTracker.tsx`.
18. **Exportaciones con error recuperable ante fallos de lectura.** Afiche,
    dossier, nota y planilla convierten un error de base en reclamo inexistente.
    Reservar 404 para ausencia real y ofrecer reintento para errores de consulta.
    Evidencia: `src/routes/reclamos/[id]/{afiche,dossier,nota-formal,planilla}/index.tsx`.
19. **Estados de ejecución que se puedan elegir.** Tareas, aportes y estado
    general ofrecen saltos que la base rechaza; por ejemplo, una tarea abierta
    no puede pasar directamente a completada. Mostrar las transiciones
    permitidas desde el estado vigente, conservando la validación del servidor.
    Evidencia: `src/components/projects/ProjectExecution.tsx` y
    `supabase/migrations/0039_production_hardening.sql`, guards de actualización.
20. **Buscar publicaciones para vincular sin JavaScript.** La selección
    depende de la búsqueda del cliente. Ofrecer un selector HTML con búsqueda
    en servidor, retorno al formulario y comprobación del destino bajo RLS.
    Evidencia: `src/components/content/ContentRelationPicker.tsx`.

## Cuarta ronda de UI/UX del 23 de octubre de 2026

Implementa las diez propuestas posteriores a D87 por pedido del responsable.
Ver D88. Conserva permisos, privacidad y esquema; no agrega dependencias.

1. **Seguimiento confirmado y visible.** Las acciones de ruta revalidan el
   detalle del reclamo y confirman el movimiento guardado. Limpian sólo los
   valores enviados que no cambiaron durante la espera.
2. **Fuentes y respuestas confirmadas.** Cada tipo de publicación revalida
   su propio detalle. El éxito confirma qué se guardó y conserva las ediciones
   posteriores al envío y los borradores de otros formularios.
3. **Resoluciones con autoridad precisa.** Una resolución del autor sin
   institución no se cuenta ni se presenta como una respuesta oficial.
4. **Compromiso personal desconocido recuperable.** Un error de lectura
   muestra reintento y bloquea altas, ediciones o retiros hasta volver a cargar
   el compromiso. La ausencia de una fila queda reservada a una lectura correcta.
5. **Comparativa con evidencia visual compatible.** Los documentos y las
   imágenes de orígenes no permitidos se ofrecen como enlaces de evidencia,
   sin intentar cargarlos en el comparador ni añadir terceros.
6. **Reloj del reclamo vigente.** Se recalcula en el próximo cambio de día o
   vencimiento y al retomar la pestaña. No hace polling ni anuncia escalados
   que la base no confirmó.
7. **Actividad enlazada al comentario.** El perfil reutiliza la consulta y
   el ancla del comentario para recuperarlo aunque no figure entre los destacados.
   Al abrirlo espera el render del debate para acercar y enfocar el mensaje,
   sin repetir el salto al votar o guardar en otros formularios.
8. **Seguimiento comunitario confirmado.** Seguir y dejar de seguir
   comprueban el resultado, conservan el estado anterior ante un rechazo y
   permiten reintentar.
9. **Visibilidad pública con estados reales.** Una lectura fallida se
   presenta como desconocida. Un rechazo conserva la preferencia anterior y
   sólo una escritura aceptada muestra éxito.
10. **Victorias con destino propio.** El título y las opciones de compartir
    enlazan al reclamo destacado.

### Verificación de esta ronda

- Tipos, lint y compilaciones de cliente, Worker y preview: correctos.
- `pnpm test`: 985 pruebas en 142 archivos, más los checks de scripts.
- `pnpm db.test`: 17 suites SQL locales con rollback, sin cambios de esquema.
- 32 pruebas E2E seleccionadas pasaron sobre producción local, en tandas de
  regresión y repeticiones de los fallos corregidos. Incluyen guardados y
  rechazos de seguimiento, fuentes y respuestas en los cuatro tipos de
  publicación; ediciones durante el envío; formularios nativos; autoridad de
  resoluciones; evidencia PDF e imagen; plazos; seguimiento y visibilidad;
  destinos de victorias y comentarios fuera de los destacados. Se verificaron
  también RLS, compromisos de proyectos y regresiones de participación,
  paginación y votos de debate. El caso de foco de errores de extensiones
  pasó en dos ejecuciones independientes.

Los bloqueos previos de release y auditoría documentados en D85 permanecen
pendientes. No hubo push, despliegue ni operaciones remotas.

### Veinte oportunidades implementadas posteriormente en D89

Revisión de código posterior a D88, conservada como antecedente de esta ronda.

1. **Retomar la configuración TOTP tras un código rechazado.** El formulario
   de alta depende del resultado de otra acción y desaparece después del POST
   nativo de verificación. Recuperar el factor propio pendiente sin volver a
   exponer el secreto ni crear otro factor. Prioridad alta.
   Evidencia: `src/routes/perfil/seguridad/index.tsx`, `start` y `verify`.
2. **Bandeja y campana actualizadas al marcar avisos leídos.** La acción
   confirma el RPC sin invalidar los datos de la bandeja ni el contador.
   Revalidar ambos conservando filtros y página, y retirar la fila de Sin leer.
   Evidencia: `src/routes/notificaciones/index.tsx`, `useReadNotifications`.
3. **Apelaciones que reflejen el envío y retiro.** Las acciones no revalidan
   el historial; una apelación retirada puede seguir mostrando esa opción.
   Confirmar la operación sobre la suspensión correspondiente y actualizarla.
   Evidencia: `src/routes/perfil/apelacion/index.tsx`, `useSuspensions`.
4. **Errores de carga en fuentes y respuestas.** Los resultados fallidos se
   convierten en listas vacías. Mostrar errores parciales y reintento, sin
   afirmar ausencia de documentos o representación institucional.
   Evidencia: `src/lib/content-extensions.ts`, `loadContentExtensions`.
5. **Ejecución del proyecto actualizada tras guardar.** Hitos, tareas,
   aportes y estado general usan acciones globales sin invalidación explícita.
   Confirmar la escritura y actualizar las filas y el progreso correspondientes.
   Evidencia: `src/components/projects/ProjectExecution.tsx` y
   `src/lib/extension-actions.ts`.
6. **Errores corregibles en los formularios de ejecución.** Hitos, tareas y
   aportes muestran sólo errores generales y no recuperan valores del POST.
   Asociar los errores a sus campos y conservar el borrador también sin JavaScript.
   Evidencia: `src/components/projects/ProjectExecution.tsx`, formularios de alta.
7. **Preguntas de proyecto después de las primeras 200.** El loader carga
   sólo las primeras filas por fecha. Paginar preguntas y respuestas y recuperar
   el mensaje recién publicado, aunque quede fuera de esa primera tanda.
   Evidencia: `src/routes/proyectos/[id]/index.tsx`, consulta `project_comments`.
8. **Vínculos de contenido confirmados y visibles.** La acción devuelve
   `linked`, pero el panel sólo muestra rechazos y no actualiza las relaciones.
   Revalidar el detalle y conservar la selección ante errores.
   Evidencia: `ContentExtensionsPanel.tsx` y `useAddRelation`.
9. **Destino conservado al reenviar la confirmación.** Ingreso ofrece un
   enlace fijo aunque la pantalla de reenvío ya admite `next`. Trasladar el
   destino interno seguro para volver a la publicación que inició el alta.
   Evidencia: `src/routes/ingresar/index.tsx` y `reenviar-confirmacion/index.tsx`.
10. **Filtros institucionales declarados en los loaders.** Los directorios
    y el historial leen filtros y página sin dependencias `search` explícitas.
    Declararlas, preservar el slug y verificar búsqueda y paginación JS/nativas.
    Evidencia: `src/routes/instituciones/index.tsx`, `instituciones/[slug]/index.tsx`
    y `c/[slug]/instituciones/index.tsx`.
11. **Errores de resultados separados de la reserva de votos.** La encuesta
    ignora fallos de opciones y estadísticas y puede afirmar participación
    insuficiente sin haberla leído. Mostrar fallo y reintento, manteniendo la
    reserva real de resultados y sin exponer votos individuales. Prioridad alta.
    Evidencia: `src/routes/encuestas/[id]/index.tsx`, `poll_stats` y `poll_results`.
12. **Más filtros de notificaciones accesibles sin JavaScript.** El botón
    sólo abre el panel mediante un evento del cliente. Ofrecer expansión HTML
    nativa, conservando los controles y los cambios al plegar.
    Evidencia: `src/routes/notificaciones/index.tsx`, panel de filtros.
13. **Cerrar una encuesta también sin JavaScript.** La entrada a la
    confirmación es sólo un botón que cambia una señal. Ofrecer un acceso HTML
    nativo al formulario, conservando confirmación y permisos del servidor.
    Evidencia: `src/components/polls/ClosePollButton.tsx`.
14. **Herramientas comunitarias disponibles ante un fallo de conteo.** Los
    errores se convierten en ceros y pueden ocultar presupuesto o contraste.
    Distinguir cantidad desconocida y conservar una salida para consultar la herramienta.
    Evidencia: `src/routes/c/[slug]/layout.tsx`, conteos y `hasBudget`.
15. **Victorias sin coincidencias con salida clara.** Si hay victorias pero
    ninguna cumple los filtros, desaparecen ambas secciones sin explicación.
    Mostrar vacío filtrado y una acción para limpiar los filtros.
    Evidencia: `src/routes/c/[slug]/victorias/index.tsx`.
16. **CUIT y teléfono con nombre accesible.** Sus etiquetas no se asocian
    al control. Reutilizar `Field` o `id` y `for` para identificarlo y enfocarlo
    al tocar la etiqueta, también en envío nativo.
    Evidencia: `src/routes/instituciones/solicitar/index.tsx`, campos de contacto.
17. **Zonas silenciosas con evidencia de cobertura.** Activar el supuesto
    detector muestra afirmaciones sobre sectores sin reclamos sin un cálculo
    territorial. Presentarlo como una invitación a revisar el barrio hasta
    disponer de evidencia suficiente para detectar zonas. Prioridad alta.
    Evidencia: `src/routes/c/[slug]/mapa/index.tsx`, `showSilentZones`.
18. **Fotos completas disponibles sin JavaScript.** Las miniaturas sólo
    abren el modal mediante un evento del cliente. Ofrecer enlaces seguros a
    las imágenes completas y mejorar esa navegación con el modal cuando hay JS.
    Evidencia: `src/components/claims/ClaimPhotos.tsx`.
19. **Búsquedas recientes que conserven el contexto.** Sus enlaces recrean
    sólo el término y pierden territorio, tipo y orden. Reutilizar el constructor
    de filtros y volver a la primera página al elegir otro término.
    Evidencia: `src/routes/buscar/index.tsx`, búsquedas recientes y `buildHref`.
20. **Copia manual del enlace que se está compartiendo.** Si falla el
    portapapeles se indica copiar la barra de direcciones, que puede incluir
    parámetros o fragmentos distintos del enlace canónico. Mostrar ese destino en un
    campo seleccionable, reutilizando la alternativa de copia del GPS.
    Evidencia: `src/components/content/ShareButton.tsx`, rechazo de `copyLink`.

## Tercera ronda de UI/UX del 23 de octubre de 2026

Implementa las diez propuestas posteriores a D86 por pedido del responsable.
Ver D87. Conserva permisos, privacidad y esquema; no agrega dependencias.

1. **Subcomunidades completas.** Búsqueda en la base antes de paginar,
   orden estable por nombre e ID y una fila adicional para detectar continuación.
   La URL conserva la búsqueda y se distingue una página agotada.
2. **Herramienta activa correcta.** Mapa, Victorias, Rendición, Instituciones
   y Comparativa tienen una navegación común que indica el destino real y
   deja de marcar Info por defecto.
3. **Final de encuestas recuperable.** Una página agotada ofrece volver al
   principio conservando los filtros; no se presenta como una comunidad vacía.
4. **Detalle del mapa visible en móvil.** Una selección explícita acerca el
   detalle y enfoca su contenido después del render. No mueve el foco al cargar
   ni al filtrar, y respeta movimiento reducido.
5. **Correo de recuperación corregible.** Muestra sólo la dirección que
   ingresó la persona y permite usar otra. La respuesta sigue sin revelar si
   existe una cuenta, también con envío nativo.
6. **Nombre ocupado asociado al campo.** El conflicto real de usuario en
   perfil y onboarding señala y enfoca el control correspondiente y conserva
   los otros valores del formulario.
7. **Cantidad real de personas comprometidas.** La RPC agregada calcula el
   total, independientemente de las 50 filas públicas. La lista explica su
   recorte y un error de conteo no se presenta como cero. Guardar y retirar
   revalidan también la cantidad.
8. **Copia GPS recuperable.** El rechazo del portapapeles se comunica y
   permite seleccionar las coordenadas para copia manual; siempre usa la
   precisión pública aproximada.
9. **Institución por evento histórico.** La cronología resuelve el organismo
   asociado a cada movimiento, sin sustituirlo por el responsable actual.
10. **Residencia revisable durante la espera.** El perfil conserva el acceso
    a revisión y muestra cuándo corresponde la próxima mudanza. Las condiciones
    de la corrección reciente y del cambio siguen comprobándose en la base.

### Verificación de esta ronda

- Compilaciones de cliente, Worker y preview, tipos y lint completos: correctos.
- `pnpm test`: 925 pruebas en 128 archivos, más los checks de los scripts.
- `pnpm db.test`: 17 suites SQL locales con rollback, sin cambios de esquema.
- 34 pruebas E2E seleccionadas pasaron sobre compilación de producción local,
  en tandas de regresión y repeticiones de los fallos detectados. Incluyen
  búsqueda después de 300 subcomunidades, páginas agotadas con filtros, errores
  repetidos de cuenta, envíos sin JavaScript, selección móvil, rechazo del
  portapapeles e instituciones históricas bajo RLS. Un proyecto con 52 personas
  verifica el total independiente de la lista de 50 y su actualización al aportar,
  editar y retirar. El caso de errores de fuentes pasó también en otra ejecución
  independiente para comprobar el foco tras el montaje del resumen.

El rechazo nativo de onboarding conserva el destino interno seguro desde los
datos enviados. Los bloqueos previos de release y auditoría de dependencias
documentados en D85 permanecen pendientes. No hubo push, despliegue ni
migraciones remotas.

### Diez oportunidades implementadas posteriormente en D88

1. **Seguimiento recién enviado visible.** En navegación reanudable, agregar
   un movimiento todavía no invalida el detalle del reclamo. Revalidar después
   de la escritura, confirmar el resultado y limpiar sólo el texto enviado.
   Evidencia: `src/lib/extension-actions.ts` y `ClaimTimeline.tsx`.
2. **Fuentes y respuestas confirmadas.** Los rechazos ya se recuperan, pero
   los éxitos no actualizan la lista en navegación reanudable ni confirman qué
   se guardó. Revalidar las extensiones y conservar cualquier edición posterior
   al envío.
   Evidencia: `ContentExtensionsPanel.tsx` y `src/lib/extension-actions.ts`.
3. **Respuestas oficiales identificadas con precisión.** La cronología
   clasifica cualquier resolución como oficial, aunque el autor puede registrar
   una sin institución. Distinguir resolución ciudadana de respuesta oficial o
   usar un rótulo que no atribuya una autoridad inexistente.
   Evidencia: `ClaimTimeline.tsx` y la RPC `add_claim_event_with_status`.
4. **Mi compromiso con estado desconocido recuperable.** El loader ignora un
   error al leer el compromiso personal y lo interpreta como ausencia. Evitar
   ofrecer un formulario nuevo vacío cuando puede existir un aporte; mostrar
   error y reintento sin sobrescribir silenciosamente el mensaje anterior.
   Evidencia: `src/routes/proyectos/[id]/index.tsx` y `PledgePanel.tsx`.
5. **Comparativa sólo con evidencia visual.** Una resolución puede enlazar
   un PDF o una página; hoy ese enlace termina en una imagen de la comparativa.
   Distinguir imágenes compatibles de documentos y mantener el enlace al resto.
   Evidencia: `src/routes/reclamos/[id]/index.tsx` y `BeforeAfterSlider.tsx`.
6. **Reloj del reclamo actualizado en la pestaña abierta.** La tarjeta calcula
   el plazo al renderizar y puede quedar atrasada al cruzar el vencimiento.
   Recalcular al límite y al volver, sin polling ni afirmar un escalado no confirmado.
   Evidencia: `ResponseClockCard.tsx` y `src/lib/claim-escalation.ts`.
7. **Mi comentario directo desde Actividad.** El historial conoce el ID del
   comentario, pero enlaza sólo al debate. Reutilizar el enlace profundo que ya
   permite encontrar comentarios fuera de los destacados.
   Evidencia: `src/lib/profile-page.ts` y `src/lib/debate-comment-link.ts`.
8. **Dejar de seguir con resultado real.** El DELETE no comprueba el error y
   la acción devuelve que se dejó de seguir incluso si falló. Conservar el
   estado confirmado y ofrecer reintento ante un rechazo.
   Evidencia: `src/routes/c/[slug]/layout.tsx`.
9. **Visibilidad pública sin confirmaciones falsas.** Un error al consultar
   la visibilidad se interpreta como visible y el formulario anuncia éxito
   incluso tras un rechazo. Distinguir dato desconocido, error y éxito confirmado.
   Evidencia: `src/routes/c/[slug]/miembros/index.tsx`.
10. **Compartir una victoria concreta.** El cuadro destacado no enlaza el
    título y comparte la página general en lugar del reclamo elegido. Ofrecer
    el enlace directo en ambos lugares.
    Evidencia: `src/components/community/VictoriesHonorRoll.tsx`.

## Segunda ronda de UI/UX del 23 de octubre de 2026

Implementación de las diez mejoras del listado posterior a D85. Ver D86.
El alcance es local; el estado de despliegue y los bloqueos de release de la
revisión anterior no cambian.

1. **Seguimiento según permisos reales.** La interfaz ofrece actualizaciones
   al autor, moderación y representantes verificados de la organización
   responsable. Las respuestas oficiales y los cambios de estado se restringen
   a los roles que ya autoriza la RPC. La migración `0072` repara el conflicto
   de triggers que revertía el primer acuse; conserva ACL y RLS, y sólo está
   aplicada en Supabase local.
2. **Errores visibles en fuentes y respuestas institucionales.** Resumen
   enfocable, enlaces a campos, errores asociados y texto conservado en
   rechazos, también por POST nativo. Los formularios no comparten IDs de campo
   ni trasladan sus borradores al navegar a otra publicación.
3. **Compromisos confirmados y actualizados.** Guardar, modificar y retirar
   un compromiso invalida explícitamente los datos del proyecto. La pantalla
   confirma el resultado, actualiza los totales y conserva ediciones posteriores
   al envío o un borrador rechazado.
4. **Historial completo de publicaciones propias.** Paginación por fecha,
   tipo e ID, con regreso a las más recientes y cursores independientes del
   historial de actividad y de comunidades seguidas.
5. **Estados reales en el mapa.** Lista, detalle, marcadores y leyenda usan
   el estado vigente del reclamo. Sólo los estados abiertos pueden contribuir
   a focos críticos; los indicadores describen los resultados cargados.
6. **Selección acumulativa de fotos.** Nuevas selecciones añaden archivos
   hasta el límite y conservan orden y portada. La preparación segura de una
   imagen fallida no borra las anteriores.
7. **Foco y anuncio de pasos.** Reclamos y proyectos enfocan el encabezado
   del nuevo paso o el campo inválido al corregir, y respetan movimiento reducido.
8. **Filtros de notificaciones conservados.** Plegar mantiene los controles
   montados y sus valores pendientes, con expansión y destino accesibles.
9. **Cierre de encuestas en la pestaña abierta.** Un temporizador local y
   eventos de retorno recalculan el estado, sin polling. Una consulta explícita
   obtiene los resultados autorizados por el servidor.
10. **Distancia circular y aproximada.** El mapa filtra en metros desde el
    centro sobre las coordenadas públicas. Retira los tiempos sin recorridos y
    explica que mide distancia en línea recta.

### Verificación de esta ronda

En Supabase local, con la migración `0072` aplicada:

- Compilaciones de cliente, Worker y preview, tipos y lint completos: correctos.
- `pnpm test`: 896 pruebas en 123 archivos, más los checks de los scripts.
- `pnpm db.test`: 17 suites SQL con rollback, incluida la primera respuesta
  institucional y los rechazos de permisos de la nueva migración.
- 46 escenarios E2E seleccionados pasaron sobre compilación de producción
  local, en tandas de regresión y repeticiones focales de los fallos detectados.
  Cubren permisos, errores y borradores con y sin JavaScript, compromisos,
  publicaciones propias, notificaciones, mapa, fotos, pasos y vencimiento.

Los errores detectados durante esas tandas se corrigieron y se volvieron a
probar. Los errores de fuentes y respuestas usan señales calculadas estables
para reanudar sus atributos accesibles en Qwik; el foco espera al montaje del
resumen. Los bloqueos previos de `test.release` y de auditoría de dependencias
descritos en D85 siguen pendientes. No hubo despliegue, push ni migraciones
remotas.

### Diez oportunidades implementadas posteriormente en D87

1. **Todas las subcomunidades encontrables.** Buscar y paginar antes del
   recorte de 300; antes de D87, el directorio presentaba ese subconjunto como total.
   Evidencia: `src/routes/c/[slug]/sub/index.tsx`.
2. **Orientación en herramientas comunitarias.** Mapa, Victorias, Rendición
   e Instituciones necesitaban un destino activo propio: antes de D87 señalaban Info.
   Evidencia: `src/routes/c/[slug]/layout.tsx`.
3. **Final de encuestas con salida.** Distinguir una página agotada de una
   comunidad sin encuestas y conservar el regreso al principio cuando hay
   cursor. Evidencia: `src/routes/c/[slug]/encuestas/index.tsx`.
4. **Detalle visible al seleccionar en el mapa móvil.** La selección de una
   fila actualiza un panel que queda fuera de vista por encima del listado.
   Acercar el detalle tras esa selección explícita o mostrarlo junto a la fila.
   Evidencia: `src/routes/c/[slug]/mapa/index.tsx`.
5. **Corregir el correo de recuperación.** Mostrar la dirección ingresada y
   permitir probar otra sin volver al ingreso, manteniendo la respuesta genérica
   sobre existencia de cuentas. Evidencia: `src/routes/recuperar/index.tsx`.
6. **Usuario ocupado asociado al campo.** El conflicto de nombre vuelve como
   error general; asociarlo al campo y enfocarlo en perfil y onboarding.
   Evidencia: `src/lib/profile-page.ts` y `src/routes/onboarding/index.tsx`.
7. **Total real de personas comprometidas.** La lista pública de aportes
   llega a 50, pero su longitud se presenta como total de personas. Reutilizar
   `project_pledge_counts`. Evidencia: `PledgePanel.tsx` y el loader del proyecto.
8. **Copia de coordenadas recuperable.** El rechazo del portapapeles queda
   silencioso. Explicar el fallo y ofrecer copia manual de las coordenadas
   públicas. Evidencia: `src/components/claims/GpsNavigationModal.tsx`.
9. **Institución identificable en cada movimiento.** La cronología conserva
   `organization_id`, pero no presenta el nombre en cada respuesta histórica.
   Evidencia: `src/components/claims/ClaimTimeline.tsx`.
10. **Corrección de residencia visible durante la espera.** El perfil
    oculta el enlace al no permitir otra mudanza, aunque la página de residencia
    admite una corrección reciente bajo las condiciones de la base. Ofrecer
    siempre revisar la residencia. Evidencia: `src/routes/perfil/index.tsx` y
    `src/routes/perfil/residencia/index.tsx`.

## Revisión de UI/UX del 23 de octubre de 2026

Implementadas las diez mejoras solicitadas, integrando también la auditoría
pendiente en `main` por autorización expresa del responsable. Ver D85. El
código no está desplegado.

1. Publicar orienta a una comunidad de residencia; las rutas de creación
   comprueban membresía y cupo conocido antes de mostrar el formulario. El
   selector `/publicar` ofrece niveles y cupos sin consultas extra por página.
2. Las categorías de búsqueda envían el texto y los filtros editados, con
   navegación reanudable y GET nativo sin JavaScript.
3. Cada columna de debate permite cargar el resto de sus comentarios con
   cursor estable de fecha e ID, sin duplicados ni pérdida del foco, posición
   o votos locales. Un comentario propio confirmado aparece aunque no entre
   entre los destacados.
4. Los proyectos ofrecen en móvil un acceso al aporte cerca del título, con
   ancla y foco, sin otra barra fija.
5. El Q&A comparte una acción con invalidación explícita de su loader, confirma
   la escritura y limpia sólo el formulario enviado. Conserva otros borradores,
   las ediciones hechas durante el envío y el texto de los rechazos.
6. Inicio tiene un único conjunto de filtros por comunidad y tipo aplicados
   antes de paginar. Se retiran los filtros duplicados y conteos parciales.
7. Las pestañas de comunidad acompañan al contenido; los saltos reservan el
   espacio de ambas barras para no tapar el destino.
8. Ingreso, registro y demás pantallas de cuenta ofrecen el control de
   accesibilidad existente.
9. Las fichas comunican expansión y destino; sus controles mantienen al menos
   44 px de área táctil aun cambiando el tamaño de texto.
10. La revisión del reclamo distingue ubicación escrita, coordenadas públicas
    aproximadas y ausencia de ubicación, también después de quitar el punto.

Validación local aprobada: lint, tipos, build cliente/Worker y preview, 866
pruebas unitarias en 118 archivos, las 16 suites SQL y 48 escenarios E2E.
Tres pruebas de acceso social se omitieron por proveedores deshabilitados
en este entorno. Se probaron también formularios sin JavaScript, rechazos
y escrituras reales con la sesión y RLS de la persona.

Los gates de release siguen pendientes de un entorno D72 reproducible:
`pnpm test.release` rechaza los permisos de la instalación local existente de
Wrangler; además, el lockfile actual difiere del hash fijado por la política.
No se normalizaron permisos ni se rebaselinaron hashes. La auditoría de
paquetes también sigue rechazando advisories de Qwik y launch-editor. Ninguno
se presenta como resuelto por estos cambios de interfaz. No se hizo push ni
despliegue.

## Revisión del 20 de octubre de 2026

Entre el 18 y el 19 de octubre entraron a `main` unos 30 commits "feat(ui):
batch N" (+35.000 líneas, casi todo en `src/components` y `src/routes`) y el
commit `d54c32b` ("Fase 1"), sin PR ni CI. Todos pasaban `tsc`, ESLint y
Vitest. Una auditoría con nueve revisores (legal, seguridad y privacidad,
runtime, arquitectura, rendimiento, base de datos, testing y CI,
dependencias, documentación) priorizó diez mejoras, de la más urgente a la
menos. Se implementan en la rama `fix/auditoria-top10`.

El estado de abajo es el que se verificó en el árbol de trabajo de esa rama
al cerrar esta revisión, todavía sin commit, CI ni despliegue. "Hecho" quiere
decir que está en el código y pasó los chequeos locales, no que esté en
Producción.

1. **Restaurar el gate legal y no aplicar `0068`.** _Hecho en código._ Se
   revirtió la parte legal de `d54c32b`: el alta vuelve a pedir y registrar la
   aceptación versionada y el aviso de transferencias, el gate falla cerrado y
   las acciones distinguen el rechazo del gate del de RLS
   (`participationBlockMessage`). `0068` quedó como
   `supabase/sql-drafts/0068_….REJECTED.sql`. Ver D73. _Pendiente:_ la
   decisión del responsable sobre un consentimiento más liviano, y correr un
   e2e "cuenta nueva → onboarding → votar" contra el ledger real.
2. **Retirar el contenido ficticio y las confirmaciones falsas.** _Hecho._ Se
   borraron 34 componentes y la ruta `/c/[slug]/actas`; los mixtos conservan
   sólo lo real. La planilla en papel ya no pide DNI, domicilio ni teléfono de
   terceros. `src/components/fictional-content.spec.ts` falla si vuelve lo
   retirado. Ver D74.
3. **CI en verde y nada a `main` sin pasar por ella.** _Parcial._ `lint`,
   `test` y `test.release` están separados y `verify` corre los tres; la CI
   tiene los jobs `verificar`, `integracion`, `release-gates` y
   `auditoria-semanal`; `pnpm audit --audit-level=high` bloquea y cada
   excepción tiene paquete, motivo y fecha de revisión. Los e2e de alta y
   smoke describen el flujo actual y hay un smoke de rutas nuevas que falla
   ante errores de consola o violaciones de CSP. Hay plantilla de PR y
   CODEOWNERS. _Pendiente:_ que la CI corra sobre la rama, activar la
   protección de rama en GitHub, resolver los dos advisories que todavía hacen
   fallar el audit `high` (uno es un rango mal publicado de `@qwik.dev/core`,
   D75) y re-verificar la closure de Wrangler de D72 con el protocolo del
   runbook, porque el valor re-baselineado en `d54c32b` no se pudo reproducir.
4. **Funciones nuevas que no funcionaban por la CSP y bugs.** _Hecho, sin
   tocar la CSP._ QR generado en el servidor (`src/lib/qr.ts`), mapa con un
   esquema propio, OpenStreetMap y los demás mapas como enlaces salientes,
   toasts que vuelven a mostrarse, dictado por voz y reproductor de debates
   retirados, URLs desde `siteOrigin` y atajos de la paleta según la
   comunidad de la persona. Ver D76. _Pendiente:_ un test que falle ante un
   host externo fuera de la allowlist, y correr el smoke de CSP (necesita
   Docker).
5. **Alinear el esquema de Producción con el código.** _Parcial._
   `scripts/check-db-contract.mjs` corre en `lint` (cada `.rpc()`/`.from()`
   existe en los tipos) y `pnpm db.contract.remote` compara el ledger del
   proyecto que nombra `AGORBIS_SUPABASE_PROJECT_REF` (nunca `--linked`) con
   lo que usa el código. El README lista qué agrega cada
   migración `0062`–`0067`. _Pendiente, fuera del repo:_ verificar el ledger
   real de Producción y aplicar `0062`–`0067` con el runbook antes de
   desplegar este código. `0069` sigue como borrador con sus correcciones
   anotadas.
6. **Rendimiento y agregados correctos.** _Parcial._ El catálogo inglés ya no
   viaja a quien navega en español (se carga aparte sólo si el documento está
   en inglés); rendición, comparativa y victorias cuentan con `count: "exact"`
   en vez de agregar las primeras mil filas; `getViewer` se resuelve una vez
   por request; menos tareas `useVisibleTask$`. _Pendiente:_ dos versiones de
   zod en el cliente, el índice `claims(community_id, status, created_at)` y
   el `Vary: Cookie` que impide cachear el HTML anónimo.
7. **Privacidad en las funciones nuevas.** _Parcial._ El almacenamiento local
   se clasifica en `src/lib/local-data.ts` y se limpia al cerrar sesión y al
   borrar la cuenta; "Mi ubicación" y los enlaces a mapas usan la cuadrícula
   pública de ~110 m; `/social` usa el cliente anónimo y filtra lo retirado;
   `datos.json` y `feed.xml` publican extractos y una atribución sin licencia;
   `src/lib/text.ts` ya no tiene el byte NUL que lo hacía binario para git.
   _Pendiente:_ acotar las columnas de `claims` que puede leer `anon`
   (migración) y decidir una licencia para los feeds.
8. **Destrabar las dependencias.** _En curso._ `minimumReleaseAge` de 7 días,
   Dependabot con `cooldown` y grupos por familia (Qwik, Cloudflare,
   Vite/Vitest, TypeScript, Supabase) y política de Qwik en beta en D75.
   El 19-11-2026 se quitó `typescript-plugin-css-modules`, se corrigieron los
   overrides y se hicieron los bumps de rutina (notas de esa fecha en el
   runbook), y wrangler subió a 4.160.1 con su re-baseline de identidad.
   _Pendiente:_ las familias de Qwik, TypeScript y vitest, que piden parche
   propio o salto mayor.
9. **Deuda estructural del código nuevo.** _En curso._ Hay helpers únicos
   (`share.ts`, `browser-storage.ts`, `cx.ts`), un `Dialog` común y lógica
   extraída a `src/lib` desde presupuesto, perfil y la comunidad; las rutas
   más grandes bajaron de tamaño y `check-i18n` falla con claves repetidas.
   _Pendiente:_ seguir partiendo las rutas de más de mil líneas.
10. **Documentar la realidad y fijar reglas de trabajo.** _Hecho._ README con
    el estado al 20-10-2026, ledger y borradores, partición de scripts,
    arquitectura y Node 22.22.0; D73–D76; `CLAUDE.md` con los invariantes;
    `CONTRIBUTING.md`; aviso en `.env.example`; sección "Imprimir y
    compartir" en `/manual`. _Pendiente:_ separar `.env.example` en desarrollo
    y Producción exige cambiar antes los dos scripts que lo leen como
    inventario completo, y un hook de pre-commit.

## Revisión del 8 de septiembre de 2026

El operador pidió resolver los cinco
trabajos de aplicación y sumar una sola mejora adicional de UI/UX. Después
autorizó commit y despliegue, conservando los checks obligatorios.

### Aplicación: cinco mejoras implementadas

1. **Borradores hasta el éxito confirmado.** Reclamos, debates, proyectos y
   encuestas guardan sus campos de texto antes de enviar y sólo limpian el
   borrador después de confirmar la escritura. Se conserva la copia ante
   errores y durante la vista previa. El navegador navega después de limpiar;
   el envío nativo mantiene POST/redirect/GET. Las claves incluyen el usuario:
   no se restauran borradores de otra cuenta ni se importan los antiguos sin
   dueño verificable. No se afirma guardar archivos.
   Al probar este recorrido se corrigió también el 404 de las secciones de
   comunidades: Qwik 2 vacía los params del loader del layout al acotar su URL;
   ahora el layout recupera el slug de esa ruta.
2. **Orden global de búsqueda.** `global_search` ordena por relevancia o fecha
   antes de paginar, con desempate estable. Conserva la firma anterior y los
   límites de consulta. La UI permite hasta 26 páginas, coherentes con el
   offset máximo 500, y avisa cuándo refinar. Se verifican páginas con fechas
   y relevancia cruzadas, permisos y ausencia de duplicados. Migración `0062`.
3. **Seguimiento privado de bajas recibidas por correo.** Administradores con
   MFA aprobado registran la solicitud, verificación, estado y cierre en
   `/moderacion/eliminaciones/`. El recibo público en
   `/eliminar-datos/seguimiento/` exige referencia y código privado, por POST,
   con límite de consultas y respuesta genérica ante códigos inválidos.
   No revela cuentas, no manda correos automáticamente ni ejecuta borrados.
   Al cerrar se retiran contacto y notas; quedan estado, método y fechas.
   Migración `0063`.
4. **Notificaciones filtradas y preferencias efectivas.** Filtros de no leídas,
   tipo y comunidad; listado, conteos y cursor comparten lectura SQL. El
   marcado respeta el filtro. Cinco preferencias controlan la generación de
   novedades opcionales; los avisos esenciales se entregan siempre. Las
   preferencias se exportan con los datos personales y se eliminan con la
   cuenta. Migración `0064`.
5. **Perfiles con URL legible.** Los enlaces usan `/u/usuario/`; UUID y alias
   anteriores redirigen al nombre actual con `302` y `no-store`. La consulta
   devuelve sólo los cuatro campos ya públicos. Las reservas privadas evitan
   que un nombre antiguo pase a otra cuenta, incluso tras una baja. El hash
   de la reserva puede contrastarse con nombres conocidos: no se presenta
   como anonimización irreversible. Migración `0065`.

### Una mejora adicional de UI/UX

**Errores de publicación que permiten recuperarse.** Los cuatro formularios
muestran un resumen con foco y desplazamiento al error, enlaces a los campos
inválidos y una explicación de que todavía no se publicó. El texto ingresado
y su borrador permanecen disponibles para corregir y volver a enviar. Hay
traducción inglesa y se mantienen los mensajes de cada campo.

### Historial: cinco mejoras de UI/UX de la revisión anterior

1. **Búsqueda accesible en móvil.** El campo tiene etiqueta visible y el botón
   tiene nombre accesible incluso cuando se oculta su texto. Buscar y borrar
   ofrecen superficies táctiles de al menos 44 px.
2. **Consulta coherente con la navegación.** El texto se sincroniza con la URL
   al usar sugerencias, categorías e historial. Borrar funciona desde el primer
   click y devuelve el foco al campo, sin perder ediciones locales al reanudar.
3. **Filtros que se conservan al ocultarlos.** Estado y orden mantienen sus
   valores editados al plegar el panel y se envían con la próxima búsqueda.
   `aria-expanded` indica el estado del panel y `aria-controls` lo relaciona
   con su control.
4. **Categorías sin conteos engañosos.** Se retiraron los números calculados
   sólo sobre la página actual. La categoría seleccionada usa `aria-current`;
   un cero parcial ya no se presenta como ausencia global de resultados.
5. **Salida clara al llegar al final de una rama.** La exploración muestra el
   contexto de la comunidad actual y permite abrirla o volver al nivel anterior
   dentro del estado vacío, sin duplicar la acción al pie. Se oculta la búsqueda
   de subcomunidades cuando no hay ninguna y se corrige la instrucción de seguir
   bajando. El selector de residencia conserva su comportamiento.

La corrección del CSS al navegar es adicional a estas cinco mejoras: aislar la
actualización del canonical evita que la reconciliación del documento borre las
hojas de estilo insertadas por SSR. No se relaja la CSP.
Las URLs largas de los documentos legales también se ajustan al ancho de la
pantalla para evitar el desborde horizontal detectado a 320 px.

Los resultados de comprobación local se registran junto con la preparación de
Google en [google-production-readiness.md](google-production-readiness.md).
