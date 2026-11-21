---
author: Sebastián Cardoso Castillo
branch: main
status: done
---

# Adopción de ECC como caja de herramientas del agente (D113)

## Intención

El 07-11-2026 el responsable pidió "empezar a aplicar ECC en Agorbis". ECC es
Everything Claude Code: un plugin con reglas, agentes, skills y hooks para Claude
Code. Ya estaba instalado ese mismo día como `ecc@ecc` 2.2.3 con alcance de
usuario, desde el repo canónico `affaan-m/ECC`. El enlace que pasó el responsable
(`WorldFlowAI/everything-claude-code`) es una copia detenida en enero de 2026.

## Alcance

Sí: decidir cómo se usa ECC en este repo, verificar su estado real, correr su
auditoría de repositorio y dejar escrito qué manda cuando choca con las reglas del
proyecto. Documentación nada más.

No: instalar ECC con su instalador, copiar sus archivos a `.claude/` del repo,
tocar `.github/` ni otros archivos de `CODEOWNERS`, crear carpetas o archivos sólo
para mejorar el puntaje de la auditoría, ni cambiar el harness rsc (D102).

## Checklist

- [x] Verificar la fuente. Prueba: `gh repo view` muestra WorldFlowAI sin commits
      desde el 23-01-2026 y `affaan-m/ECC` con push del 06-11-2026;
      `~/.claude/plugins/installed_plugins.json` registra `ecc@ecc` 2.2.3.
- [x] Descartar el instalador. Prueba: `install-apply.js --dry-run` planifica 805
      operaciones para `--target claude` y 936 para `claude-project`, todas copias
      de lo que el plugin ya provee.
- [x] Auditoría ECC del repo. Prueba: `harness-audit.js repo` da 40/49, 20 controles,
      4 en falta (abajo).
- [x] Decisión D113 en `DECISIONS.md` con jerarquía, uso concreto y veredicto de
      cada control en falta.
- [x] Fila en `02-DOCS/wiki/index.md`.
- [ ] Plantillas de issues en `.github/ISSUE_TEMPLATE/`: propuesta para el
      responsable, no aplicada (CODEOWNERS).

## Evidencia

Auditoría del 07-11-2026 sobre `eef0352`, rúbrica `2026-05-19`, ocho categorías
aplicables (Cloudflare detectada por `wrangler.jsonc`):

| Categoría               | Puntaje | Control en falta                                   |
| ----------------------- | ------- | -------------------------------------------------- |
| Tool Coverage           | 10/10   |                                                    |
| Context Efficiency      | 10/10   |                                                    |
| Quality Gates           | 10/10   |                                                    |
| Memory Persistence      | 0/10    | busca `.claude/memory.md` o `docs/adr/`            |
| Eval Coverage           | 0/10    | busca `evals/`                                     |
| Security Guardrails     | 10/10   |                                                    |
| GitHub Integration      | 8/10    | sin `.github/ISSUE_TEMPLATE/`                      |
| Cloudflare Integration  | 7/10    | ningún workflow usa la acción o CLI de Cloudflare  |

Los cuatro se aceptan como deliberados en D113: la memoria del proyecto es
`DECISIONS.md` (112 decisiones) y este wiki; los flujos críticos ya tienen Vitest,
Playwright, `supabase/tests` y `scripts/test-*`; el deploy es manual por D107.

Para repetir la auditoría hace falta la dependencia `@iarna/toml`, que el caché del
plugin no trae. Se instaló en el scratchpad de la sesión y se corrió con
`NODE_PATH`; no se agregó nada a `node_modules` del repo.

## Siguiente paso

Usar ECC en la próxima ronda de trabajo tal como fija D113: revisores tras cada
cambio, `ecc:security-reviewer` antes de los commits sensibles y `/ecc:harness-audit`
al cerrar, anotando el puntaje en el FTD de esa ronda. El responsable decide si
quiere las plantillas de issues.
