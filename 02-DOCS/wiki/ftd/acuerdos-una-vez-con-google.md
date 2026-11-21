---
author: Sebastián Cardoso Castillo
branch: ingreso-google-pulido
status: in-progress
---

# Con Google los acuerdos se marcan una sola vez

## Intent

El primer ingreso con Google pide los acuerdos dos veces: 4 casillas antes de
Google y 2 después, en `/consentimiento`, con tres repetidas. La decisión del
responsable (D129, "Opción A") es que el callback registre los acuerdos con la
sesión recién creada, y que `/consentimiento` quede como camino de respaldo.

## Scope

Entra:

- `/ingresar` muestra las mismas dos casillas que `/registro` en el panel de
  acceso social.
- El inicio OAuth anota `legalAccepted` sólo con todo marcado.
- `/auth/callback` registra los acuerdos con el JWT de la persona y falla
  cerrado hacia `/consentimiento`.

No entra:

- Saltear las casillas a quien vuelve con una cuenta existente.
- El dominio `supabase.co` en la pantalla de Google.
- Cambios en RPC, migraciones, textos legales o `/consentimiento`.

## Checklist

- [x] El inicio OAuth anota `legalAccepted` sólo con los cinco campos — spec.
- [x] El contexto rechaza un `legalAccepted` que no sea `true` — spec.
- [x] El callback registra con el cliente de la persona y sigue al onboarding — spec.
- [x] Sin autorización o con la RPC caída termina en `/consentimiento` — spec.
- [x] `/ingresar` muestra las dos casillas de `LegalConsentFields` — spec.
- [x] `tsc`, ESLint, `check-i18n`, `check-legal` y Vitest completo.
- [x] Revisión de seguridad independiente — sin críticos ni altos. Un medio
      (cookies de la ceremonia sembrables desde un subdominio propio), anotado
      en D129 como riesgo residual a decidir. CSRF cubierto por `checkOrigin`.
- [ ] Recorrido real con Google y e2e — del responsable; no se corrió.

Decisión de diseño: el ingreso sin Términos ni Normas marcados sigue
iniciando OAuth, como antes. Sólo no autoriza el registro. Así no se debilita
el caso existente "el ingreso exige consentimiento previo sin repetir términos
de registro".

## Evidence

- Rojo antes de implementar: 16 casos fallando en `oauth-context.spec.ts`,
  `auth-actions.spec.ts`, `auth/callback/index.spec.ts` y
  `SocialAuth.spec.tsx`.
- Verde después: `vitest run --silent` → 212 archivos, 1597 pruebas, todas
  pasan (Node 22.22.0). Ningún caso existente se borró ni se debilitó; al de
  "documentos pendientes" se le sumó que no se llama al registro.
- `tsc --incremental false --noEmit` sin salida; ESLint sobre `src` sin
  avisos; `prettier --check` limpio.
- `check-i18n`: "3906 mensajes · 2411 usos estáticos verificados".
- `check-legal`: "versiones y hashes coinciden con el contenido publicado".

## Next

El responsable decide sobre el prefijo `__Host-` (riesgo residual de D129),
revisa el diff y recorre el alta con una cuenta de Google nueva antes de
abrir Producción.
