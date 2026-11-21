---
type: article
title: Gate legal y textos legales
description: Aceptación versionada con hash que la base exige con can_participate, atada a migraciones por check-legal.
resource: src/lib/legal-content.ts
tags: [legal, invariante, mapa]
timestamp: 2026-10-31T12:00:00Z
topic: legal
status: stable
sources: []
---

# Gate legal y textos legales

> Página mapa: resume y apunta. Los textos legales y su proceso los decide el
> responsable; un agente no los cambia por iniciativa propia (`CLAUDE.md`).

## Overview

`src/lib/legal-content.ts` tiene los textos y `src/lib/legal.ts` fija las
versiones (`TERMS_VERSION`, `PRIVACY_VERSION`, `COMMUNITY_RULES_VERSION`,
`INTERNATIONAL_TRANSFER_NOTICE_VERSION`). Las aceptaciones se guardan en
`legal_document_versions` y `user_legal_acceptances` (`0039`, verificación en
`0049`). La base exige el gate con `can_participate()` y
`assert_can_participate` (`0044`). La UI muestra el aviso en el layout, enlaza
a `/consentimiento` y pide la aceptación en `/registro`.
`scripts/check-legal.mjs` (en lint) calcula el SHA-256 de cada documento y
falla si ninguna migración inserta la misma versión, hash y snapshot.

El consentimiento de participación sensible es sólo borrador (`0059`), no está
en Producción y el gate D72 lo registra como omitido. La retención la aplica
`/internal/purge-retained-data` con `0050` y `0057`.

## Dónde vive

- `src/lib/legal-content.ts`, `legal.ts`, `legal-evidence-policy.js`.
- `src/routes/consentimiento/`, `src/routes/layout.tsx`, las páginas
  `privacidad`, `terminos`, `normas-comunitarias`, `subencargados` y
  `transferencias-internacionales`.
- `src/components/legal/LegalDocument.tsx`,
  `src/components/auth/LegalConsentFields.tsx`.
- Borrador: `supabase/migration-drafts/0059_versioned_sensitive_participation_consent.sql`.

## Decisiones y docs

D70, D72, D73, D74. Docs: `docs/RETENTION_POLICY.md`, `docs/legal-drafts/`,
`docs/legal-activations/`, `docs/TRANSFER_SAFEGUARDS_REQUESTS.md`,
`docs/AAIP_REGISTRATION.md`, `docs/0059-sensitive-participation-consent-review.md`.

## Pruebas

`src/lib/legal.spec.ts`, `src/components/legal/LegalDocument.spec.tsx`,
`scripts/check-pending-external-evidence-legal-draft.mjs`. La suite
`supabase/tests/sensitive_participation_consent_review.sql` no entra en
`pnpm db.test`; corre con `pnpm db.test.draft-0059:ephemeral`.

## Trampas

- Una coma en un texto legal exige versión nueva, migración con el hash y
  revisión del responsable.
- El gate falla cerrado; nunca se fabrica una aceptación, ni en SQL ni en
  código (D73).
- `0059` no se aplica.

## Related

- [Cuentas y acceso](../cuentas/cuentas-y-acceso.md) — el alta.
- [Seguridad y terceros](../seguridad/cabeceras-y-terceros.md) — D76 exige
  Privacidad y `/subencargados` para cada tercero.
