import { readFileSync } from "node:fs";
import path from "node:path";
import {
  EXPECTED_CLOUDFLARE_ACCOUNT_ID,
  EXPECTED_WORKER_CRONS,
  parseJsonc,
} from "./cloudflare-worker-policy.mjs";

const SCHEMA = "node_modules/wrangler/config-schema.json";
const WORKER_NAME = "agorbis";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function same(left, right) {
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

const expectedCronConfiguration = (crons) => ({
  $schema: SCHEMA,
  name: WORKER_NAME,
  account_id: EXPECTED_CLOUDFLARE_ACCOUNT_ID,
  workers_dev: false,
  preview_urls: false,
  triggers: { crons },
});

const EXPECTED = Object.freeze({
  open: Object.freeze(expectedCronConfiguration([...EXPECTED_WORKER_CRONS])),
  closed: Object.freeze(expectedCronConfiguration([])),
  traffic: Object.freeze({
    $schema: SCHEMA,
    name: WORKER_NAME,
    account_id: EXPECTED_CLOUDFLARE_ACCOUNT_ID,
  }),
});

export function validateExceptionalCutoverConfigurations({
  open,
  closed,
  traffic,
} = {}) {
  const errors = [];
  for (const [label, actual] of Object.entries({ open, closed, traffic })) {
    if (!same(actual, EXPECTED[label])) {
      errors.push(
        `wrangler.${label === "traffic" ? "traffic" : `crons-${label}`}.jsonc no coincide exactamente con el contrato excepcional.`,
      );
    }
  }
  return Object.freeze(errors);
}

export function validateExceptionalClosedRecoveryConfigurations({
  closed,
  traffic,
} = {}) {
  const errors = [];
  for (const [label, actual] of Object.entries({ closed, traffic })) {
    if (!same(actual, EXPECTED[label])) {
      errors.push(
        `wrangler.${label === "traffic" ? "traffic" : "crons-closed"}.jsonc no coincide exactamente con el contrato de recovery CLOSED.`,
      );
    }
  }
  return Object.freeze(errors);
}

export function readExceptionalCutoverConfigurations(root) {
  const read = (name) =>
    parseJsonc(readFileSync(path.join(root, name), "utf8"), name);
  return Object.freeze({
    open: read("wrangler.crons-open.jsonc"),
    closed: read("wrangler.crons-closed.jsonc"),
    traffic: read("wrangler.traffic.jsonc"),
  });
}

export function assertExceptionalCutoverConfigurations(root) {
  const errors = validateExceptionalCutoverConfigurations(
    readExceptionalCutoverConfigurations(root),
  );
  if (errors.length > 0) {
    throw new Error(
      `Configuración excepcional inválida:\n${errors.join("\n")}`,
    );
  }
}
