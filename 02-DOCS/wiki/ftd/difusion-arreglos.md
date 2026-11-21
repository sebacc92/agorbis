---
author: Sebastián Cardoso Castillo
branch: difusion
status: done
merged: 2026-11-21
merged_by: Sebastián Cardoso Castillo
---

# Difusión: tres arreglos antes de promocionar

## Intención

Antes de salir a buscar gente hay tres agujeros que hacen perder lo que traiga
la difusión: los buscadores no conocen ninguna ciudad, el enlace de invitación
a una comunidad se comparte sin imagen y la donación tiene una sola puerta.

## Alcance

- Sí: `sitemap.xml` lista todas las comunidades, paginando por el tope de
  1.000 filas de PostgREST.
- Sí: la página de comunidad declara imagen, URL canónica y una descripción
  que dice qué se hace ahí.
- Sí: más entradas a `/apoyar` (portada y menú de cuenta), sólo con enlace
  válido, como el pie (D128).
- No: imagen por comunidad (la ruta `/social` devuelve SVG y las redes no lo
  muestran), nuevos medios de donación, metas o contadores (D128, D74).

## Checklist

- [x] Sitemap pagina comunidades hasta 50.000. Prueba: `paginate.spec.ts` y
      el sitemap servido en local. Commit `649660b`.
- [x] Comunidad con `og:image`, `og:url` y descripción útil. Prueba:
      `social-meta.spec.ts` y el HTML de `/c/mar-del-plata/` en local.
      Commit `49c0b2e`.
- [x] `/apoyar` enlazado desde portada y menú de cuenta, apagado sin enlace.
      Prueba: `support.spec.ts`, `SupportNote.spec.tsx` y la portada en el
      navegador. Commit `5f44e8b`. El manual dice dónde está.
- [x] Lint, tipos y tests. Prueba: salida.
- [ ] Ver el menú de cuenta en el navegador. No se hizo: hace falta iniciar
      sesión. Lo cubre el código compartido con el pie (`supportPageHref`).
- [ ] Comprobar la tarjeta en Producción tras el deploy (WhatsApp o el
      depurador de Facebook) y reenviar el sitemap en Search Console.

## Evidencia

- 21-11-2026: los tres specs fallaban antes de implementar (módulos o
  funciones inexistentes) y pasan después: `paginate.spec.ts` 5,
  `social-meta.spec.ts` 7, `support.spec.ts` + `SupportNote.spec.tsx` 33 con
  los de `SupportContent`.
- 21-11-2026: Producción servía 1.000 comunidades en el sitemap, ninguna de
  nivel 4. En local, con la rama: 5.933 URLs, 5.882 comunidades, 2.116 de
  nivel 4, incluida Mar del Plata.
- 21-11-2026: `/c/mar-del-plata/` en local declara `og:image` (1200×630),
  `og:url`, `og:site_name`, tarjeta `summary_large_image` y la descripción
  "Partido de General Pueyrredón. Conocé Mar del Plata en Agorbis: …".
- 21-11-2026: portada en Chrome a 500 px: el aviso y "Apoyar a Agorbis"
  aparecen bajo "Conocé todas las reglas", sin scroll horizontal
  (`scrollWidth` 485).
- 21-11-2026: `npm run -s lint` en exit 0, `tsc --noEmit` en exit 0 y Vitest
  completo: 231 archivos, 1.751 tests.
- `test.release` no se corrió: según la memoria del proyecto, sólo corre en
  la carpeta principal.

## Siguiente
Fusionado en main el 2026-11-21 (9119284).
