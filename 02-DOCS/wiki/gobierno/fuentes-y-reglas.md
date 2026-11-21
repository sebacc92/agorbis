---
type: article
title: Fuentes y reglas del proyecto
description: Qué documento manda en cada cosa, las invariantes, quién aprueba qué y cómo se commitea.
resource: CLAUDE.md
tags: [gobierno, invariante, mapa]
timestamp: 2026-10-31T12:00:00Z
topic: gobierno
status: stable
sources: []
---

# Fuentes y reglas del proyecto

## Overview

Agorbis es una plataforma cívica argentina: comunidades geográficas
jerárquicas donde se vota, debate, reclama y propone. Esta wiki es un mapa;
las fuentes son otras y, ante una diferencia, mandan ellas.

## Qué manda en cada cosa

| Tema                                       | Fuente                                                    |
| ------------------------------------------ | --------------------------------------------------------- |
| Reglas para agentes e invariantes          | `CLAUDE.md`                                               |
| Por qué algo es como es                    | `DECISIONS.md` (D1–D102)                                  |
| Estado actual, puesta en marcha y ledger   | `README.md`                                               |
| Operación de Producción                    | `docs/PRODUCTION_RUNBOOK.md`                              |
| Qué ve la persona                          | `/manual` y `src/i18n/en/manual.ts`                       |
| Archivos que no se tocan sin el responsable | `.github/CODEOWNERS`                                      |
| Comandos                                   | `package.json`                                            |
| El harness de agentes (rsc)                | D102; queda por debajo de `CLAUDE.md`                     |

## Invariantes (resumen; el texto está en `CLAUDE.md`)

1. La base decide los permisos (RLS, `is_member`, triggers).
2. Voto secreto (D68).
3. Gate legal versionado que falla cerrado (D70, D73).
4. Textos legales con versión y hash.
5. CSP con nonce (D64) y terceros declarados (D76).
6. Nada ficticio (D74).
7. `localStorage` sólo para conveniencias del dispositivo (D67).
8. i18n con el español como fuente (D56).
9. SQL numerado, con tests y tipos generados.
10. Privacidad de ubicación y logs.
11. Ningún secreto con prefijo `PUBLIC_`.

## Cómo se trabaja

- Un cambio por commit o PR, con mensaje `tipo(área): qué cambia` y un cuerpo
  que explique el porqué y cite la `Dn`.
- El push y el pull de `main` los hace el responsable; un agente no.
- Pasar `tsc`, ESLint y Vitest no alcanza (D73–D76): la lógica nueva trae
  spec, y no se debilitan asserts para que pase la suite.
- Una decisión de producto, privacidad o arquitectura abre una `Dn` nueva.

## Related

- [Release y operación](../operacion/release-y-operacion.md)
- [Gate legal](../legal/gate-y-textos-legales.md)
