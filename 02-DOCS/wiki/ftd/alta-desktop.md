---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# El alta muestra su recorrido y usa el ancho en desktop (D110)

## Intención

El dueño se registró en Producción el 02-11-2026, mandó capturas de cada
pantalla y pidió mejoras, aprovechando el ancho en desktop.

## Alcance

- Sí: `SignupProgress`, `AuthShell` (`progress`, `wide`), onboarding
  (lugar y confirmar), `LocationPicker` en modo residencia, `/auth/confirm`,
  aviso del layout en `/consentimiento`, sugerencia de usuario y atajo al
  webmail.
- No: qué se pide, qué se registra, la página de comunidad ni los textos
  legales.

## Checklist

- [x] Progreso común en espera, confirmación, acuerdos y onboarding.
      Prueba: e2e del alta.
- [x] Lugar a todo el ancho, grilla sin scroll interno, filtro sólo si
      recorta. Prueba: tipos y e2e de residencia.
- [x] Confirmar en dos columnas en desktop. Prueba: tipos y e2e del alta.
- [x] Usuario sugerido en palabras enteras y atajo al webmail. Prueba: specs.
- [x] `lint`, `test`, `test.release` y e2e del alta, onboarding y residencia.

## Evidencia

- 02-11-2026, después del último cambio y con umask 0022: `pnpm lint`,
  `pnpm build.types`, `pnpm test` (1.245), `pnpm test.release` y 10 e2e
  (registro, alta real con correo, onboarding y residencia) en exit 0.
- `username-suggestion.spec.ts`: "Sebastian Cardoso Castillo" →
  `sebastian_cardoso`; `webmail.spec.ts`: proveedores conocidos y ningún
  atajo para dominios propios ni subdominios engañosos.
- No verificado: capturas de las pantallas nuevas en desktop; las ve el
  dueño después del deploy.

## Siguiente

El dueño hace push, `pnpm deploy:open` y revisa el alta en desktop.
