---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# Comunidad vacía con algo para hacer (mejora 6 de D112)

## Intención

Producción tiene 3.901 comunidades y casi todas están vacías. Quien llega a una
ve "todavía no tiene publicaciones" y cuatro llamados a publicar, pero nada
que pueda hacer ya mismo. La auditoría del 03-11-2026 anotó tres fallas en esa
pantalla y en la cabecera de comunidad:

1. **Nada para hacer.** Las encuestas abiertas de la cadena (provincia, país,
   Tierra) existen y una residente puede votarlas, pero el estado vacío no las
   muestra.
2. **Felicitar por casillas.** En "Más herramientas", la lista "Tu camino
   cívico" deja marcar tres casillas a mano y, con las tres, dice
   "¡Felicitaciones! Completaste tu camino cívico". Nada de eso llegó a la
   base: es un logro ficticio (D74).
3. **"Residencia declarada" a quien no la eligió.** La cabecera dice "Tu
   residencia declarada no pertenece a {{name}}" a cualquier persona con sesión
   que no sea miembro, incluida la que todavía no eligió dónde vive. El estado
   vacío le pide "revisá tu residencia" por el mismo motivo.

## Alcance

Sí:

- Un loader nuevo en `src/routes/c/[slug]/index.tsx` que, sólo en una comunidad
  confirmada vacía, trae hasta tres encuestas activas de los ancestros de la
  cadena. El estado vacío las lista con pregunta, comunidad y cierre, enlazando
  a la encuesta. Sin conteos ni marcas (D68). Un helper puro en
  `src/lib/chain-polls.ts` decide qué comunidades consultar y cómo etiquetar.
- La lista de pasos con casillas, barra de progreso, felicitación y "Cerrar
  guía" se reemplaza por tres enlaces planos, "Qué podés hacer acá". Las claves
  `agorbis_checklist_` y `agorbis_dismiss_guide_` quedan en `local-data.ts`
  como legado para que la limpieza del dispositivo siga borrándolas.
- La cabecera y el estado vacío distinguen tres situaciones: sin sesión, con
  sesión sin residencia, y con residencia en otra comunidad. Sólo la tercera
  dice "residencia declarada". La segunda ofrece elegir residencia con el
  `onboardingPath` que ya usa D115.
- Manual, catálogo inglés, D116, `docs/mejoras-priorizadas.md`.

No: migraciones, cambios en qué se registra, hosts nuevos, archivos de
`CODEOWNERS`. No se cambia el widget de voto rápido ni la pestaña Encuestas.

## Checklist

- [x] Helper `chain-polls.ts` con spec: ancestros sin la propia, etiqueta con
      nombre de comunidad, orden por cierre. Prueba: `vitest run` del spec.
- [x] Loader `useChainPolls` y bloque en el estado vacío. Prueba: spec de
      `community-navigation-honesty` con encuestas de la cadena y sin ellas.
- [x] Sin casillas ni felicitación en "Más herramientas". Prueba: el spec
      afirma que no hay "Marcar como completado" ni "Felicitaciones", y que
      `fictional-content.spec` prohíbe el texto de la felicitación.
- [x] Tres textos de residencia en cabecera y estado vacío. Prueba: spec con
      sesión sin residencia; no contiene "residencia declarada".
- [x] E2E sobre `/c/ba-25-de-mayo/`: la encuesta de Argentina del seed aparece
      enlazada; una cuenta sin residencia lee "elegí tu residencia".
- [x] `pnpm verify`, `pnpm build.types`, revisiones D113 (code-reviewer,
      typescript-reviewer, silent-failure-hunter) y commit.

## Evidencia

- `vitest run src/lib/chain-polls.spec.ts`: rojo primero (el módulo no existía),
  luego 7 de 7.
- `community-navigation-honesty.spec.tsx`: 11 de 11 en rojo con el loader sin
  existir (timeout del mock), 11 de 11 en verde tras el cambio, con 5 casos
  nuevos.
- `fictional-content.spec`, `local-data.spec`, los dos de arriba: 4 archivos,
  58 pruebas en verde.
- `node scripts/check-i18n.mjs`: 3744 mensajes, sin faltantes. `pnpm build.types`:
  0 errores.
- `pnpm test.e2e e2e/empty-community.spec.ts e2e/publication-entry-recovery.spec.ts`:
  6 de 6 en 1,2 min, build del runner con Supabase local y seed. La encuesta de
  Argentina (`a0000000-…-0002`) aparece enlazada en `/c/ba-25-de-mayo/`; una
  cuenta nueva sin residencia lee "Todavía no elegiste dónde vivís" y "elegí tu
  residencia para publicar", y no "residencia declarada".

- Revisiones D113: tres informes. Aplicado: `orFallback` con log en el loader,
  título neutro para quien no es miembro, `residenceHint` como única fuente de
  texto y botón, caso del perfil ilegible (sin CTA al onboarding), `returnPathFor`
  antes de `onboardingPath`, encuestas sin cierre incluidas con orden estable,
  `isBooleanRecord` eliminado, E2E con destino exacto y caso de Sofía.
- Tras aplicar: `pnpm verify` PASS; Vitest 188 archivos, 1366 pruebas; tsc 0;
  E2E 16 de 16 (empty-community, publication-entry-recovery, ui-ux-regressions).
  Registro: `02-DOCS/wiki/sdd/verifications/comunidad-vacia-con-algo-para-hacer-2026-11-07.md`.

## Next

Commit en `main` (D116). Siguen las mejoras 7 a 9 de D112.
