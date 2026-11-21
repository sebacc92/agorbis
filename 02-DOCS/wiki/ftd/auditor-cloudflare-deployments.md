---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# El auditor CLOSED de Cloudflare acepta el contrato vigente de deployments

## Intención

Después de `deploy:closed` (versión `e55c191a-0182-48ff-80fb-bb52893fce64`,
01-11-2026), `scripts/cloudflare-closed-state.mjs` y el smoke cerrado fallaban
con "GET deployments no coincide con la estructura aprobada". El estado real
estaba bien; el auditor rechazaba dos formas que la API documenta:

1. `result_info` en el sobre de `GET …/deployments` (`count`, `page`,
   `per_page`, `total_count`, `total_pages`).
2. `annotations["workers/message"] = ""` en el deployment de `9e7068af`
   (31-10, `wrangler versions deploy -y`). La API lo define como string
   opcional de hasta 1000 bytes, sin mínimo.

Fuente: referencia de la API de Cloudflare, "List Deployments"
(`developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/`),
que además dice que el primer deployment de la lista es el activo.

## Alcance

- Sí: `validateDeployments` y `validateDeploymentShape` en
  `scripts/cloudflare-closed-state.mjs`, y su test.
- No: los demás endpoints (sus sobres coinciden con lo aprobado), la política
  D72, hashes de release ni `code_update_strategy` (documentado, no observado:
  sigue rechazado).

## Checklist

- [x] `result_info` sólo se acepta como primera página coherente; cualquier
      otra forma falla cerrada. Prueba: test con la forma real y mutaciones.
- [x] `workers/message` acepta "" y sigue rechazando no-strings y más de
      1000 bytes. Prueba: test.
- [x] `node scripts/test-cloudflare-closed-state.mjs` y `pnpm test.release`
      pasan. Prueba: salida.
- [x] `pnpm lint` pasa. Prueba: salida.
- [x] El dueño corre el auditor y el smoke contra Producción y dan PASS.
      Prueba: salida del dueño.

## Evidencia

- 01-11-2026: con un envoltorio local que neutralizaba sólo esos dos desvíos,
  el auditor real pasó y acreditó la versión activa `e55c191a`.
- 01-11-2026: el test nuevo falla contra el código anterior con el mismo
  error de Producción ("GET deployments no coincide con la estructura
  aprobada") y pasa con el arreglo. Quitando cada condición nueva de a una,
  el test falla en todos los casos (12 mutantes); `perPage >= 1` y `>= 0` se
  sacaron porque las demás igualdades ya las implican.
- 01-11-2026: `pnpm lint`, `pnpm test` (1.237 pruebas) y `pnpm test.release`
  pasan con umask 0022.
- 01-11-2026: `node scripts/cloudflare-closed-state.mjs --phase custom-domains
  --secret-stage complete` contra Producción: "Cloudflare cerrado verificado",
  deployment `7cf9ae21-…`, versión `e55c191a-…`.
- 01-11-2026: el smoke cerrado y algunas corridas del auditor fallan por red
  local, no por contrato: `ETIMEDOUT` al conectar a `api.cloudflare.com`. La
  máquina no tiene ruta IPv6, IPv4 a veces tarda 1–3 s en conectar, y Node 22
  da 250 ms por intento (`autoSelectFamilyAttemptTimeout`) a las 9 conexiones
  paralelas del auditor.

## Verificación

- 01-11-2026, sobre `204cd41` + este cambio (árbol sucio antes del commit):
  lint, test y test.release corridos después del último cambio de código.
  Control negativo: el test nuevo falla con el código anterior y los 12
  mutantes mueren. Control positivo: la forma real de Producción pasa en el
  test y el auditor real pasa contra Cloudflare.
- Capas no ejecutadas: **SUSTITUIDA**, el smoke cerrado contra Producción.
  Se corrió y falló por `ETIMEDOUT` de red local, así que no acredita ni
  descarta nada del smoke.
- Veredicto del código: PASS.
- 01-11-2026, dueño, desde una red estable (connect IPv4 0,09 s):
  `Smoke HTTP de Producción cerrada: PASS (6 controles, 0 crons, 1 POST con
  HTTP 503; ausencia de escritura NOT_VERIFIED)`. Esto reemplaza la capa
  SUSTITUIDA de arriba. `NOT_VERIFIED` es fijo por diseño: el smoke prueba el
  503, no la ausencia de escritura en la base.

## Siguiente

Nada. Tarea cerrada.
