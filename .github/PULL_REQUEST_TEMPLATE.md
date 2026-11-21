<!--
Nada llega a `main` sin pasar por esta PR y por la CI (`verificar` e
`integracion`). Tachá con ~~ lo que no aplica y explicá por qué en una línea:
un casillero vacío sin explicación se lee como "no lo revisé".
-->

## Qué cambia y por qué

<!-- Una o dos oraciones. Si cierra un issue o una decisión, enlazala. -->

## Checklist

- [ ] **Tests.** La lógica nueva tiene spec (`pnpm test`) y, si cambia un flujo
      visible, el e2e correspondiente (`pnpm test.e2e`). No se borraron ni
      debilitaron asserts existentes para que la suite pase; si un test cambió,
      la PR explica qué comportamiento cambió.
- [ ] **i18n.** Todo texto de UI pasa por `translate(locale, …)` y tiene su
      traducción en el catálogo EN (`pnpm lint` corre `check-i18n`).
- [ ] **Migración.** Si toca el esquema: la migración está en
      `supabase/migrations/` (no en `migration-drafts/` ni en `docs/`),
      `src/lib/database.types.ts` está regenerado con `pnpm db.types` y
      `supabase/tests` cubre el cambio de permisos/RLS.
- [ ] **CSP y terceros.** No agrega hosts externos (imágenes, iframes, scripts,
      APIs, fuentes). Si agrega uno: está en la CSP de
      `src/routes/plugin@cabeceras.ts`, declarado en `/subencargados` y en la
      Política de privacidad, y tiene su decisión Dn.
- [ ] **Textos legales.** No modifica `src/lib/legal-content.ts` ni las páginas
      `/privacidad`, `/terminos`, `/subencargados`,
      `/transferencias-internacionales` o `/normas-comunitarias`. Si lo hace:
      nueva versión + hash (`pnpm lint` corre `check-legal`) y revisión del
      responsable legal.
- [ ] **Honestidad del producto.** Ningún botón dice "confirmado",
      "publicado", "registrado", "otorgado" o "verificado" sobre algo que no
      llegó a la base. Nada de datos de muestra presentados como reales.
- [ ] **DECISIONS.** Si cambia una decisión vigente o toma una nueva, hay una
      entrada `Dn` en `DECISIONS.md` y la PR la cita.
- [ ] **Manual.** Si agrega o cambia una función visible, `/manual` y el README
      lo reflejan.
- [ ] **Release.** Si toca `scripts/` de release, hashes D72, `package.json`
      (scripts) o `.github/`: `pnpm test.release` pasa y el cambio de hashes
      está explicado en esta PR (nunca dentro de un commit de features).

## Cómo lo probé

<!-- Comandos corridos y resultado; capturas si cambia la UI. -->
