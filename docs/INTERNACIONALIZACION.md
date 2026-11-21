# Internacionalización

## Contrato de producto

Agorbis separa dos cosas que no deben confundirse:

1. **Idioma de interfaz**: navegación, formularios, estados, errores, fechas,
   números, metadata y mensajes automáticos se muestran en el idioma elegido.
2. **Contenido comunitario**: títulos, preguntas, opciones, comentarios,
   respuestas y documentos se conservan exactamente como fueron escritos. Una
   conversación puede mezclar idiomas y no se traduce ni se sobrescribe.

Los campos de escritura usan `dir="auto"`. Al mostrar prosa ciudadana también se
aplica `unicode-bidi: plaintext`, para que cada párrafo en árabe, hebreo u otra
escritura RTL resuelva su propia dirección aunque la interfaz activa sea LTR.
Los fragmentos ciudadanos dentro de una frase del sistema se aíslan con `bdi`.

Los resúmenes de IA son una vista derivada: se generan en el idioma de interfaz
activo, pero nunca modifican el contenido original. Si falta la síntesis del
idioma actual, no se usa otra como fallback.

## Idiomas actuales

- `es` — español de Argentina, idioma predeterminado.
- `en` — inglés.

El servidor resuelve la preferencia en este orden: query explícita `?lang=`,
cookie `agorbis-locale`, encabezado `Accept-Language` y, finalmente, español.
La query válida se guarda en cookie y se elimina con un redirect para mantener
una sola URL canónica. El SSR emite `lang`, `dir` y `Content-Language`
coherentes desde la primera respuesta.

## Agregar un idioma

Conviene incorporar uno por vez y revisar terminología cívica con una persona
hablante antes de publicarlo.

1. Agregar el locale y su etiqueta BCP 47 en `src/lib/i18n-core.ts`.
2. Crear el catálogo bajo `src/i18n/<locale>/`, conservando los msgids
   españoles como claves.
3. Registrar el catálogo en `src/lib/i18n.ts` y su nombre nativo en
   `LanguageSwitcher.tsx`.
4. Revisar plurales, formatos de fecha/número y, para escrituras RTL, dirección
   y propiedades lógicas del layout.
5. Ejecutar `pnpm lint`, `pnpm build.types` y `pnpm build`.

`scripts/check-i18n.mjs` impide publicar claves inglesas faltantes o
contradictorias, texto JSX sin localizar y el antiguo hook no serializable.
`scripts/test-i18n.mjs` cubre negociación, precedencia, variantes regionales,
calidades `q`, wildcard y construcción de URLs. `scripts/test-ugc-bidi.mjs`
protege la dirección automática en los cuatro tipos de contenido y sus
formularios.

## Orden sugerido de expansión

Después del inglés:

1. Portugués de Brasil (`pt-BR`).
2. Francés (`fr`).
3. Árabe (`ar`), después de completar la auditoría RTL y plurales de más de dos
   formas.
4. Hindi (`hi`).
5. Chino simplificado (`zh-Hans`).
6. Indonesio (`id`).
7. Suajili (`sw`).

Portugués y francés reutilizan la estructura LTR actual y cubren comunidades
vecinas y una parte grande de África. Árabe es la siguiente expansión de mayor
impacto, pero requiere una pasada visual y lingüística propia.

## Resúmenes de IA

La caché se identifica por tipo de contenido, ID, locale, hash exacto de las
fuentes y versión de prompt. Cambiar de idioma o editar una fuente produce un
artefacto distinto. El prompt trata todas las cadenas comunitarias como datos
no confiables, exige la lengua objetivo y devuelve JSON validado.

Para encuestas, la primera versión resume exclusivamente pregunta, descripción
y opciones: no consulta votos ni agregados. Por eso no puede revelar resultados
ocultos antes de votar o antes del cierre. Si en el futuro se resumen
resultados, la fila debe declarar `includes_poll_results = true` y conservar la
misma autorización server-side `can_see_poll_results` antes de devolverla. La
cache no tiene acceso directo desde el navegador: el backend reúne primero las
fuentes visibles con la sesión del visitante, calcula el hash actual y recién
entonces lee mediante `service_role` esa fila exacta.
