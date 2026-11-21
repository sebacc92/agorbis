---
author: Sebastián Cardoso Castillo
branch: main
status: in-progress
---
# Moderación de acuerdos (D120)

## Intent

D118 dejó pendiente que un acuerdo pudiera moderarse: hoy una propuesta con
un título ofensivo o un cuerpo que incumple las normas no tiene cómo bajarse,
ni se puede reportar. Antes de invitar gente conviene que los acuerdos entren
en el mismo circuito que encuestas, debates, reclamos y proyectos: reporte,
cola de moderación, ocultar con rastro y restaurar.

## Scope

Dentro: estado `removed` en `agreements` con memoria del estado previo; RPC
`moderate_agreement` (ocultar / restaurar) sólo para moderación con MFA, que
también oculta y repone las rondas ligadas; RLS que esconde lo removido a quien
no modera; `reports` acepta `agreement`; cola de moderación y botón Reportar en
la ficha; auditoría en `moderation_audit_log`; tests SQL y specs; D120, README,
manual. Fuera: baja por la proponente fuera del retiro ya existente (un acuerdo
votado no se borra por quien lo propuso), apelaciones específicas (usan el
circuito general), búsqueda global de acuerdos (sigue diferida).

## Checklist

- [x] M1 · Migración 0075: columnas, checks, policy de lectura, `reports`,
      `raw_content_author`, estado derivado, RPC. Prueba: `pnpm db.reset` sin
      error y `agreements_checks.sql` con la sección de moderación en verde.
- [x] M2 · App: tipos de reporte, cola, acción de ocultar/restaurar por RPC,
      botón Reportar en la ficha, estado "Dado de baja por moderación".
      Prueba: specs de `moderation-queue`, `agreements` y la ficha; tsc;
      check-i18n; `pnpm db.contract`.
- [x] M3 · Documentos: D120, fila 0075 en README, manual ES/EN. Prueba:
      `pnpm lint` (check-legal e i18n) en verde.
- [x] M4 · Re-baseline D72 a 0062–0075 y backup `post-0075`, en commit
      `chore(release)` aparte, autorizado por el responsable con "sigue".
      Prueba: `pnpm test.release` con Node 22.

## Evidence

- **M1** (09-11-2026): `pnpm db.reset` aplica `0075_agreement_moderation.sql`
  sin error (apartando `supabase/.temp/storage-version` y `storage-migration`
  durante el reset, como dice la nota del 03-11). Primer intento del test falló
  en `GEOUNITY_REPORT_TARGET_NOT_FOUND`: el guardia de reportes usa
  `raw_content_exists`, que no conocía `agreement`; se agregó. Después:
  `agreements_checks.sql` 84 `ok` y "todas las verificaciones pasaron";
  `pnpm db.test` completo salida 0; `supabase db lint --level warning` sin
  errores.
- **M2**: tsc 0; check-i18n 3841 mensajes; `pnpm db.contract` coherente;
  specs `moderation-queue` (9), `agreements` (22), `AgreementsSection` (5),
  `moderacion/index` (2), `ReportButton` (3), `fictional-content` (32): 73 de
  73. Decisión: ocultar un acuerdo pasa por `moderate_agreement` y nunca por
  `update` (la tabla no lo permite); si la RPC falla no se cierra ningún
  reporte.
- **M3**: D120, fila 0075 en README, manual ES/EN con una oración. `pnpm lint`
  completo y `pnpm test` 198 archivos / 1458 pruebas en verde (un spec de la
  ficha contaba todos los botones y ahora excluye el formulario de reporte).
  Commit `be54361`.
- **M4**: candidata D72 `0062-0075/v1`, hash nuevo de `agreements_checks.sql`,
  backup `post-0075`, tests de release actualizados (72 migraciones, cabeza
  0075). `pnpm test.release` con Node 22.22.0: salida 0, D107 PASS.

## Next

El responsable: `nvm use 22.22.0`, push, `supabase db push` (aplica 0075) y
recién después `pnpm deploy:open`. Sin el push de la base, el preflight bloquea
el release porque la candidata ya espera 0075 en Producción.
