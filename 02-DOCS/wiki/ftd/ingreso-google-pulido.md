---
author: Sebastián Cardoso Castillo
branch: ingreso-google-pulido
status: in-progress
---

# Primer ingreso con Google: pasos y nombre que dicen la verdad

## Intent

Quien entra por primera vez con Google ve textos y pasos del alta por correo:
"ahora que confirmaste tu correo", "Ya los marcaste" con las casillas vacías y
un paso "Confirmá tu correo ✓" que nunca ocurrió (roza D74). Además el nombre
para mostrar llega vacío aunque Google ya lo entregó, y el campo de usuario
deja escribir más de 20 caracteres y avisa recién al enviar.

## Scope

Entra:

- Recorrido del alta sin el paso del correo cuando la cuenta nació con Google.
- Subtítulo propio en `/consentimiento` para ese caso.
- Nombre para mostrar sugerido desde Google, editable, con el usuario derivado.
- `maxLength` de 20 en el campo de usuario.

No entra (esperan decisión del responsable):

- Registrar los acuerdos en el callback para no pedirlos dos veces.
- El dominio `supabase.co` en la pantalla de Google.
- Saltear las casillas a quien vuelve con Google.
- `/manual` no nombra el acceso con Google (hueco previo, D122).

## Checklist

- [x] `parseSignupIdentity` distingue Google de correo y limpia el nombre — spec.
- [x] `SignupProgress` sin correo muestra 4 pasos — spec.
- [x] `/consentimiento` usa el subtítulo de Google — spec.
- [x] Paso del nombre: nombre sugerido, usuario derivado, `maxlength=20` — spec.
- [x] Traducciones al inglés — `check-i18n`.
- [x] `tsc`, ESLint y `check-legal` en verde.
- [x] D128 en `DECISIONS.md` (el nombre público sugerido toca privacidad).
- [ ] Probado con una cuenta real de Google — no se pudo: exige Producción o un
      proveedor configurado en local.
- [ ] E2E de Playwright — no se corrió.

## Evidence

- Rojo antes de implementar: 4 specs fallando (4 pasos, subtítulo, usuario
  derivado, `maxlength`) y el módulo `signup-identity` inexistente.
- Verde después: `vitest run --silent` → 212 archivos, 1573 pruebas, todas
  pasan (Node 22.22.0).
- `tsc --incremental false --noEmit` sin salida; ESLint sin avisos sobre los
  archivos tocados; `prettier --check` limpio.
- `check-i18n`: "3906 mensajes · 2415 usos estáticos verificados".
- `check-legal`: "versiones y hashes coinciden con el contenido publicado".

## Next

El responsable revisa el diff en `.worktrees/ingreso-google-pulido`, decide
commit y fusión a `main`, y prueba el alta con una cuenta de Google nueva.
