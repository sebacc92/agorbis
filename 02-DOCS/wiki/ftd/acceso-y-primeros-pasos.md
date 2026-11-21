---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
---
# Acceso y primeros pasos: diez mejoras (D121)

## Intent

El responsable quiere un registro, un ingreso y unos primeros pasos simples
de entender, y sumar Google como opción. El recorrido real hoy (09-11-2026,
preview local con Supabase local, 390 px) es: crear cuenta → confirmar el
correo → acuerdos → nombre → comunidad → inicio. Funciona de punta a punta
(acuerdos 294 ms, nombre 385 ms, elegir 296 ms, confirmar 1,4 s), pero: el
registro no dice que son cinco pasos; los acuerdos se marcan dos veces sin
explicación; en un recorrido el router quedó trabado tras una redirección
SPA y el botón del paso siguiente giró sin hacer nada; el paso "¿Dónde vivís?"
arranca con GPS y seis continentes antes del buscador; un correo mal escrito
no tiene aviso; quien ya tenía cuenta espera un correo que no llega;
recuperar y reenviar no esperan el token de Turnstile como sí hace ingresar.

Google: el flujo completo existe (D66, D70, 0066/0067, `SocialAuth`,
`/acceso-google`, callback PKCE) y está apagado por D97 con
`PUBLIC_GOOGLE_AUTH_ENABLED=false`. Activarlo es una decisión del
responsable con pasos fuera del repositorio; acá no se enciende nada.

## Scope

Dentro: las diez mejoras de abajo, con spec o E2E donde hay lógica, i18n EN y
manual si cambia algo visible. Fuera: encender Google (checklist para el
responsable en el cierre), cambiar textos legales o el número de casillas
(D73, D108), tocar `supabase/` o `wrangler*`.

## Checklist

- [x] 1 · Navegación de documento (`reloadDocument`) al aceptar acuerdos y en
      los pasos nombre y confirmar del onboarding, como ya hace Ingresar.
      Prueba: E2E `smoke` del alta completa y `account-round-three` en verde;
      recorrido local sin botón trabado.
- [x] 2 · `/registro` muestra "Paso 1 de 5" desde el principio y el subtítulo
      dice qué viene. Prueba: spec de `AuthShell`/`SignupProgress`.
- [x] 3 · `/consentimiento` de cuenta nueva explica por qué se vuelven a marcar
      los acuerdos. Prueba: texto en ES y EN; E2E `smoke` sigue en verde.
- [x] 4 · Paso "¿Dónde vivís?": buscador primero, GPS debajo como alternativa,
      continentes plegados detrás de "Explorar por continente" en la raíz.
      Prueba: spec de `LocationPicker`; E2E `smoke` busca y elige igual.
- [x] 5 · Correo con dominio mal escrito: "¿Quisiste decir …@gmail.com?" en
      registro. Prueba: spec de `suggestEmailDomain`.
- [x] 6 · Tarjeta "Revisá tu correo" tras registrarse: qué hacer si ya tenías
      cuenta con ese correo. Prueba: texto en ES y EN.
- [x] 7 · "Abrir Gmail/Outlook/…" también al pedir un enlace de acceso, al
      recuperar y al reenviar. Prueba: specs de las tarjetas o E2E.
- [x] 8 · `/recuperar` y `/reenviar-confirmacion` deshabilitan el botón
      mientras Turnstile verifica (como D119-9). Prueba: tsc + lectura.
- [x] 9 · El primer campo recibe el foco al abrir ingresar, registro,
      recuperar, reenviar y el paso nombre. Prueba: E2E de acceso en verde.
- [x] 10 · Paso nombre: vista previa de cómo te van a ver y "tu correo no se
      muestra". Prueba: spec de la página de onboarding (nombre).

## Evidence

- **Recorrido base** (09-11-2026, preview local, Supabase local, 390 px,
  cuenta confirmada sin acuerdos): ingresar → `/consentimiento` → aceptar
  (294 ms) → nombre (385 ms) → buscar "Miramar" → elegir (296 ms) → confirmar
  (1,4 s) → `/inicio`. Capturas en el scratchpad de la sesión. En el primer
  intento el botón "Continuar" del paso nombre apareció girando sin haberlo
  tocado y la URL no cambió tras el clic: router trabado tras la redirección
  SPA de los acuerdos (clase D115). Producción (app anterior a D117):
  `/ingresar`, `/registro`, `/recuperar`, `/reenviar-confirmacion` a 390 px.
- **1–4 y 8**: tsc 0; check-i18n 3842; specs `LocationPicker` (10),
  `TurnstileGate` (3), `SocialAuth` (3). E2E `smoke -g "alta real"`,
  `account-round-three -g onboarding`, `account-access`: 6 pasados, 2
  omitidos (proveedores sociales apagados). El helper `submit` de
  `account-round-three` acepta el POST de documento.
- **5, 6, 7, 9, 10**: tsc 0; check-i18n 3849; specs nuevos `email-typos` (3),
  `AuthShell` (3), `name-step` (2) y `LocationPicker` +2 (plegado en la raíz,
  lista visible con búsqueda): 15 de 15 en la corrida conjunta.

- **Carrera en CI** (09-11-2026, tras publicar): con la navegación de
  documento, el paso "¿Dónde vivís?" carga fresco y el refresco de datos de
  Qwik Router (D99) redibujaba el buscador medio segundo después, borrando lo
  tipeado; la CI lo vio en `smoke` ("el alta real… sin destino", `q=` vacío).
  Lo tipeado pasa a una señal en `LocationPicker`; la URL manda sólo al
  cambiar la consulta.
- **Smoke de Producción con Google** (10-11-2026): el `deploy:open` con el
  binding en `true` (versión `f92834f0`) publicó bien y el smoke falló en el
  control de `/subencargados/`, que exigía tres destinos pendientes y encontró
  cuatro tarjetas. Ajuste en `scripts/production-smoke-policy.mjs`: los tres
  pendientes por nombre más Google sólo con su disclosure exacta. Prueba:
  `test-production-smoke` con cinco mutantes nuevos (otro texto, pendiente,
  Meta, tarjeta repetida, falta Resend), `pnpm lint` y `pnpm test.release` en
  verde, y el smoke repetido contra Producción: 22 controles, PASS.

## Next

El responsable entra con su cuenta de Google desde `/ingresar` en Producción;
después, verificación de sólo lectura en la base de que la identidad y la
decisión del aviso quedaron registradas (D122, paso 5).
