---
author: Sebastián Cardoso Castillo
branch: ingreso-google-pulido
status: in-progress
---

# La ceremonia OAuth queda atada al navegador que la inició

## Intent

D129 dejó un riesgo residual: las cookies de la ceremonia social se pueden
sembrar desde un subdominio de `agorbis.com`, y desde D129 de ellas depende el
registro de los acuerdos obligatorios. Una cookie `__Host-` sólo la puede
escribir el dominio exacto. Se suma una, con el nonce de la ceremonia, y el
callback la exige (D130).

## Scope

Entra:

- El inicio OAuth escribe `__Host-agorbis-oauth-bind` con el nonce, sólo en
  HTTPS.
- El callback, en HTTPS, exige que coincida con el nonce de la URL; si no,
  trata la ceremonia como inválida (revoca la sesión, igual que hoy).
- El callback la borra siempre.

No entra:

- Renombrar `agorbis-oauth-consent` y `agorbis-oauth-context`: el script de
  certificación `scripts/d72-google-auth-capture.mjs` (protegido) busca la
  segunda por su nombre literal.
- Las cookies PKCE y de sesión de Supabase.
- HTTP local: sin `Secure` el navegador rechaza el prefijo, y ahí no hay
  subdominios ajenos.

## Checklist

- [x] En HTTPS el inicio escribe la cookie con el nonce, `Path=/`, `Secure`,
      `HttpOnly` y sin dominio — spec.
- [x] En HTTP no la escribe — spec.
- [x] El callback en HTTPS sin cookie o con otro valor revoca y no registra
      nada — spec.
- [x] El callback en HTTP sigue sin exigirla — spec.
- [x] El callback la borra con `Secure` y `Path=/` — spec.
- [x] Vitest completo, `tsc`, ESLint, Prettier, `check-i18n`, `check-legal`.
- [x] Políticas de release del acceso social
      (`test-social-auth-consent-policy`, `test-d72-google-auth-capture`).
- [x] Revisión de seguridad independiente — sin críticos, altos ni medios.
- [ ] Recorrido real con Google en Producción y captura D72 — del
      responsable; no se corrió.
- [ ] E2E de Playwright, `test.release` completo y build — no se corrieron.

## Evidence

- Rojo antes de implementar: 5 casos fallando en `auth-actions.spec.ts` y
  `auth/callback/index.spec.ts`.
- Verde después: `vitest run --silent` → 212 archivos, 1605 pruebas, todas
  pasan (Node 22.22.0). Los cinco eventos simulados del callback pasaron a
  traer la cookie de atadura; ningún assert existente se borró ni se debilitó.
- ESLint (`src`, `e2e`), Prettier sobre todo el repo, los ocho chequeos de
  `lint`, las siete pruebas de scripts de `test` y `tsc`: en verde.
- `test-social-auth-consent-policy` y `test-d72-google-auth-capture`: PASS,
  con fixtures.
- Revisión de seguridad: la cookie `__Host-` cierra la siembra desde
  subdominios; Qwik emite `Max-Age=0` al borrarla; `http://agorbis.com`
  redirige a HTTPS antes del router, así que la exigencia no se desactiva en
  Producción; los enlaces de correo y la recuperación no se ven afectados.
  Menores anotados en D130: dos pestañas a la vez, y que la regla depende de
  que el redirect a HTTPS siga antes del router.

## Next

El responsable decide el commit, fusiona, y recorre un ingreso real con Google
y la captura D72 antes de abrir Producción.
