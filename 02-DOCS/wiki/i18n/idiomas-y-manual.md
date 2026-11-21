---
type: article
title: Idiomas y manual
description: El español es el texto fuente y la clave; catálogos en inglés por dominio; el contenido ciudadano no se traduce; /manual.
resource: src/lib/i18n.ts
tags: [i18n, mapa]
timestamp: 2026-10-31T12:00:00Z
topic: i18n
status: stable
sources: []
---

# Idiomas y manual

> Página mapa: resume y apunta. Lo que manda es el código, `DECISIONS.md` y el
> README; si esta página los contradice, está desactualizada.

## Overview

`translate(locale, "texto en español", params?)` (`src/lib/i18n.ts`) busca el
texto fuente en el catálogo inglés, reemplaza `{{param}}` y, si falta, muestra
el español. Los catálogos viven por dominio en `src/i18n/en/` (`index.ts` los
une). En el servidor se importan; en el navegador se cargan aparte
(`src/lib/i18n-en-bundle.ts`, `src/lib/i18n-catalogs.ts`).
`src/routes/plugin@i18n.ts` negocia el idioma y limpia `?lang=`. Sólo se
traduce la interfaz: el contenido ciudadano se muestra tal cual, con
`dir="auto"` (D56).

`/manual` (`src/routes/manual/index.tsx`) es la guía pública de producto: arrays
de texto en español que pasan por `translate()`, con su inglés en
`src/i18n/en/manual.ts`.

## Decisiones y docs

D56 (idioma de interfaz frente a contenido), D57 (resumen de IA derivado y sólo
en el servidor). Doc: `docs/INTERNACIONALIZACION.md`.

## Pruebas

`scripts/check-i18n.mjs` (en lint: texto JSX sin `translate()`, traducción
faltante o contradictoria, cada msgid en un solo archivo),
`scripts/test-i18n.mjs`, `scripts/test-ugc-bidi.mjs`,
`src/lib/i18n-catalogs.spec.ts`, `e2e/smoke.spec.ts` (visita `/manual/`).

## Trampas

- Cambiar un texto en español cambia su clave: hay que actualizar el inglés o
  queda en español sin aviso visual.
- Una función visible nueva o cambiada actualiza `/manual` y
  `src/i18n/en/manual.ts`.
- Lo que el manual promete (por ejemplo, la tarjeta de encuestas) sigue a D68.

## Related

- [Encuestas](../participacion/encuestas-voto-secreto.md) — lo que el manual
  dice del voto.
