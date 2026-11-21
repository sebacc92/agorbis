# Auditoría UI/UX · 13 de agosto de 2026

Esta tanda parte de las rutas públicas y no cuenta las correcciones previas de
axe, contraste, semántica, CLS y peso del mapamundi. Son 30 mejoras adicionales,
ya aplicadas:

|   # | Fricción encontrada                                                                 | Mejora aplicada                                                                                                                                            |
| --: | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Varios campos medían menos de 44 px.                                                | Los controles compartidos y selectores de comunidad tienen un objetivo táctil mínimo de 44 px.                                                             |
|   2 | Los botones secundarios se confundían con la superficie.                            | Usan un borde de control de 3:1 y refuerzo de marca al pasar el puntero.                                                                                   |
|   3 | Un botón deshabilitado sólo perdía opacidad.                                        | Conserva escala, muestra cursor de bloqueo y un estado visual más legible.                                                                                 |
|   4 | El menú móvil podía quedar cortado en un teléfono apaisado.                         | Tiene alto máximo, scroll propio y no arrastra el documento.                                                                                               |
|   5 | La búsqueda del header era más baja que el resto de las acciones.                   | Se igualó a 44 px para tacto y consistencia.                                                                                                               |
|   6 | Los desplegables largos podían desplazar la página al llegar al borde.              | Los resultados y listas jerárquicas aíslan el overscroll.                                                                                                  |
|   7 | El nombre de una comunidad ocupaba demasiado en móvil.                              | El título baja un escalón tipográfico sólo en pantallas angostas.                                                                                          |
|   8 | “Seguir” comprimía nombre y descripción.                                            | La acción pasa a una fila completa en móvil.                                                                                                               |
|   9 | El aviso para no residentes apretaba texto y CTA.                                   | Se apila en móvil y da a la salida una zona táctil completa.                                                                                               |
|  10 | Las pestañas comunitarias eran difíciles de recorrer con el pulgar.                 | Incorporan snap, contención horizontal y objetivos de 44 px.                                                                                               |
|  11 | “Crear” podía quedar como un botón corto y aislado en listados móviles.             | La acción ocupa el ancho disponible en móvil.                                                                                                              |
|  12 | Las categorías de encuestas consumían varias filas.                                 | Pasaron a una tira horizontal con snap y chips de 44 px.                                                                                                   |
|  13 | La paginación por cursor tenía enlaces pequeños.                                    | Las cuatro familias de listados usan acciones táctiles de 44 px.                                                                                           |
|  14 | El estado técnico `available` se mostraba en inglés.                                | Se presenta como “Disponible” y también aparece en el filtro.                                                                                              |
|  15 | Para quitar un filtro había que borrar todos.                                       | Cada chip activo se puede remover por separado sin perder los demás.                                                                                       |
|  16 | Buscar y limpiar filtros tenían áreas dispares en móvil.                            | Buscar ocupa el ancho y limpiar tiene un objetivo táctil explícito.                                                                                        |
|  17 | “2 resultados” no recordaba qué consulta se estaba viendo.                          | El encabezado dice `Resultados para “…”`.                                                                                                                  |
|  18 | “Página 1 de 1” no indicaba qué parte del total estaba visible.                     | Se muestra el rango real, por ejemplo `1–20 de 37`.                                                                                                        |
|  19 | Anterior/siguiente eran enlaces pequeños y lejanos.                                 | Ahora son botones secundarios consistentes y táctiles.                                                                                                     |
|  20 | El buscador jerárquico se comprimía en 320 px.                                      | Campo y botón se apilan en móvil y vuelven a fila desde `sm`.                                                                                              |
|  21 | “Limpiar” en el explorador era un enlace angosto.                                   | Es una acción delimitada de 44 px en móvil.                                                                                                                |
|  22 | El selector del mapa no se veía igual que otros selects.                            | Suma alto táctil, chevrón y espaciado reservados.                                                                                                          |
|  23 | Al hacer zoom no se explicaba cómo ver lo que quedaba fuera.                        | Aparece una instrucción contextual para desplazar el mapa.                                                                                                 |
|  24 | Los CTA superiores e inferiores del manual competían en 320 px.                     | Ocupan una columna completa en móvil.                                                                                                                      |
|  25 | El índice del manual formaba una pared de chips.                                    | Es una tira horizontal, pegada bajo el header y con snap en móvil.                                                                                         |
|  26 | Las respuestas frecuentes obligaban a recorrer todo el texto.                       | Se convirtieron en acordeones nativos operables sin JavaScript.                                                                                            |
|  27 | Ingreso y registro gastaban demasiado alto antes del formulario.                    | Se redujo el espaciado sólo en móvil.                                                                                                                      |
|  28 | “Enlace por mail” no expresaba el beneficio y cambiar de pestaña borraba el correo. | La opción dice “Sin contraseña” y ambas modalidades comparten el correo escrito.                                                                           |
|  29 | El teclado móvil no recibía pistas suficientes en autenticación.                    | Se desactivan autocorrección/capitalización del correo y se usan teclas `Siguiente`, `Enviar` o `Ir`; registro muestra progreso de longitud de contraseña. |
|  30 | Varias salidas secundarias seguían siendo chicas o apretadas.                       | CTA de inicio, 404 y pie se adaptan al ancho móvil; las rutas largas del 404 ya no desbordan.                                                              |

## Verificación

- Build de preview, TypeScript, ESLint, Prettier y pruebas internas: aprobados.
- Recorrido visual: 320 px, 412 px y escritorio, en claro y oscuro.
- Interacciones: acordeones, conservación de correo entre métodos de ingreso,
  progreso de contraseña y eliminación independiente de filtros.
- Las pruebas se ejecutaron contra preview de producción y sólo con rutas
  públicas; no se modificaron datos del Supabase hosteado.
