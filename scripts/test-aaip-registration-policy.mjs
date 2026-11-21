#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  AAIP_DATABASE_REGISTRATION_STATUS,
  AAIP_PENDING_COPY,
  evaluateAaipDatabaseRegistration,
  validateAaipDatabaseRegistration,
} from "./aaip-registration-policy.mjs";

const controllerId = "RL-2026-81658385-APN-DNPDP#AAIP";

assert.equal(AAIP_DATABASE_REGISTRATION_STATUS, "pending");
assert.equal(
  AAIP_PENDING_COPY.es,
  "Inscripción de la base ante la AAIP: en trámite. Aún no se cuenta con una constancia aprobada ni con un número de registro de la base. El código del responsable y las referencias del trámite no sustituyen ese número.",
);
assert.equal(
  AAIP_PENDING_COPY.en,
  "AAIP database registration: pending. No approved registration certificate or database registration number is currently available. Controller and filing references do not replace that number.",
);
assert.doesNotMatch(AAIP_PENDING_COPY.es, /base (?:está )?registrada/i);
assert.doesNotMatch(AAIP_PENDING_COPY.en, /database is registered/i);

assert.deepEqual(
  validateAaipDatabaseRegistration({
    status: "pending",
    registrationId: "",
    controllerId,
  }),
  [],
);
assert.deepEqual(
  evaluateAaipDatabaseRegistration({
    status: "pending",
    registrationId: "",
    controllerId,
  }),
  {
    evidenceStatus: "BLOCKED_EXTERNAL",
    rawResult: "FAIL",
    errors: [],
  },
);

assert.match(
  validateAaipDatabaseRegistration({
    status: "pending",
    registrationId: "un-valor-no-vacío",
    controllerId,
  }).join("\n"),
  /pending.*vacío/i,
);
assert.match(
  validateAaipDatabaseRegistration({
    status: "approved",
    registrationId: "",
    controllerId,
  }).join("\n"),
  /approved.*exige/i,
);

for (const invalid of [
  controllerId,
  "EX-2026-fixture",
  "RE-2026-fixture",
  "PV-2026-fixture",
  "IF-2026-fixture",
  "RL202681658385",
  "EX202682087278",
  "RE20260001",
  "PV20260001",
  "IF20260001",
  "AAIP-RL202681658385",
  "AAIP-EX202682087278",
  "referencia-RE20260001",
  "referencia-PV20260001",
  "referencia-IF20260001",
  "AAIP-DB-TEST-2026-12345678",
  "AAIP-FIXTURE-123",
  "AAIP-EXAMPLE-123",
  "<registration-id>",
  "sample",
  "dummy",
  "TODO",
  "N/A",
  "unknown",
  "change-me",
  "pendiente",
  "valor de prueba",
  "valor de ejemplo",
  "fake-value",
  "valor falso",
]) {
  assert.match(
    validateAaipDatabaseRegistration({
      status: "approved",
      registrationId: invalid,
      controllerId,
    }).join("\n"),
    /no puede/i,
    invalid,
  );
}

for (const invalidStatus of ["APPROVED", " approved", "approved "]) {
  assert.match(
    validateAaipDatabaseRegistration({
      status: invalidStatus,
      registrationId: "",
      controllerId,
    }).join("\n"),
    /exactamente pending o approved/i,
  );
}

// No existe una prueba positiva con un ID fabricado: sólo una constancia real
// permitirá ejercer honestamente la rama approved.

console.log("AAIP registration policy tests: PASS");
