---
author: Sebastián Cardoso Castillo
branch: codigo-abierto
status: done
merged: 2026-11-21
merged_by: Sebastián Cardoso Castillo
---

# Código abierto: árbol limpio para un repositorio público (D147)

## Intención

Abrir el código de Agorbis bajo AGPL-3.0 para que el pie "Proyecto abierto"
sea cierto, para poder mostrar cómo funciona el voto secreto y para habilitar
GitHub Sponsors. El repositorio privado no se puede publicar tal cual: su
historial tiene el domicilio particular del responsable.

## Alcance

- Sí: quitar el domicilio del árbol (build, preflight, inventario de
  recuperación, `.env.example`, README y cinco documentos de `docs/`).
- Sí: `LICENSE` con el texto oficial de AGPL-3.0 y D147 en borrador.
- Sí: escaneo de secretos del árbol que se va a publicar.
- No: crear el repositorio público ni hacer push. Lo hace el responsable.
- No: reescribir el historial del repositorio privado.
- No: `package.json` (`license`, `private`): es del responsable.
- No: GitHub Sponsors como segunda vía de donación. Va en otra decisión,
  porque D128 sólo admite Cafecito.

## Checklist

- [x] Ningún rastro del domicilio en el árbol. Prueba: `grep` recursivo sin
      resultados.
- [x] Inventario de recuperación regenerado con su script, no a mano.
      Prueba: `recovery-inventory.mjs --check` en `ok: true`, 56 variables.
- [x] Tests de release afectados en verde con Node 22.22.0. Prueba: salida.
- [x] `check-legal`, tipos y lint completo en verde. Prueba: salida.
- [x] `LICENSE` es el texto oficial. Prueba: 661 líneas, descargado de
      gnu.org.
- [x] Escaneo con gitleaks del árbol sin `node_modules`. Prueba: 24
      hallazgos, todos falsos positivos clasificados uno por uno.
- [ ] `test-exceptional-open-release-runner-policy` no corre en un worktree
      con `node_modules` enlazado. Correrlo en la carpeta principal tras
      fusionar.
- [ ] El responsable aprueba D147 y los cambios en scripts de release.
- [ ] El responsable edita `package.json`, crea el repositorio y publica.

## Evidencia

- 21-11-2026: auditoría de 423 commits en 23 ramas. Domicilio en 5 commits
  (24-08 a 09-09-2026) y en 5 documentos actuales; ningún secreto real.
- 21-11-2026: con Node 22.22.0, `main` pasa los seis tests de release
  afectados. En la rama fallaban dos: uno por conteos fijos de variables
  (26 → 25, 21 → 20, 57 → 56), ya corregidos, y otro por el enlace de
  `node_modules`, ajeno al cambio.
- 21-11-2026: gitleaks sobre 1.279 archivos: 12 claves `sb_publishable`
  (públicas por diseño), 6 valores de prueba, 3 nombres de variable, 2
  hashes SHA-256 y 1 constante de un test SQL.

## Siguiente
Fusionado en main el 2026-11-21 (6d41773).
