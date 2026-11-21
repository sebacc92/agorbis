#!/usr/bin/env node
// Prueba real de D103 contra el PostgreSQL de Supabase local: ejecuta el
// `D72_SUPABASE_CATALOG_SQL` fijado y pasa su salida por el mismo parser que
// usa el auditor. Un test con fixtures no alcanza, porque la truncación a 63
// bytes la hace PostgreSQL al resolver el tipo del `union all`.
//
// Crea dos sobrecargas de prueba dentro de una transacción que siempre termina
// en `rollback`, y después comprueba que no quedó nada. Si el contenedor local
// no existe, falla: una prueba de regresión que se saltea en silencio no
// protege nada.
//
// Sólo habla con un contenedor `supabase_db_*` del daemon Docker local: no
// lee URLs de base ni credenciales, así que no puede apuntar a Producción.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  D72_SUPABASE_CATALOG_SQL,
  D72_SUPABASE_DOCKER_HOST,
  parseD72ProductionQueryOutput,
} from "./d72-supabase-readonly-policy.mjs";

// Mismo contenedor y misma variable que `scripts/test-db.sh`.
const CONTAINER = process.env.AGORBIS_DB_CONTAINER ?? "supabase_db_agorbis";
assert.match(
  CONTAINER,
  /^supabase_db_[a-z0-9_-]+$/,
  "AGORBIS_DB_CONTAINER tiene que nombrar un contenedor de Supabase local",
);
const PSQL_TIMEOUT_MS = 120_000;
const PROBE = "d72_identity_probe";
const PROBE_ARGUMENTS = [
  "p_first_long_parameter_name text, p_second_long_parameter_name integer",
  "p_first_long_parameter_name text, p_second_long_parameter_name integer, p_third_flag boolean",
];

// Sin DOCKER_HOST ni DOCKER_CONTEXT heredados y con el socket local fijo: un
// contexto Docker remoto configurado en la máquina no cambia el destino.
const dockerEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([name]) => name !== "DOCKER_HOST" && name !== "DOCKER_CONTEXT",
  ),
);

function psql(input) {
  return execFileSync(
    "docker",
    [
      "--host",
      D72_SUPABASE_DOCKER_HOST,
      "exec",
      "--interactive",
      "--user",
      "postgres",
      CONTAINER,
      "psql",
      "--no-psqlrc",
      "--no-align",
      "--tuples-only",
      "--quiet",
      "--set",
      "ON_ERROR_STOP=1",
      "--dbname",
      "postgres",
    ],
    {
      encoding: "utf8",
      env: dockerEnvironment,
      input,
      maxBuffer: 64 * 1024 * 1024,
      timeout: PSQL_TIMEOUT_MS,
    },
  );
}

const probeDefinitions = PROBE_ARGUMENTS.map(
  (args, index) =>
    `create function public.${PROBE}(${args}) returns integer language sql immutable as 'select ${index + 1}';`,
);

function verifyCatalog() {
  let output;
  try {
    output = psql(
      [
        "begin;",
        ...probeDefinitions,
        `${D72_SUPABASE_CATALOG_SQL};`,
        "rollback;",
        "",
      ].join("\n"),
    );
  } catch (error) {
    throw new Error(
      `No se pudo ejecutar el catálogo D72 en ${CONTAINER}; ¿está corriendo Supabase local (pnpm exec supabase start)?`,
      { cause: error },
    );
  }

  // Mismo parser y mismas reglas que la auditoría: si el SQL volviera a
  // truncar, esto falla con "identidades duplicadas".
  const catalog = parseD72ProductionQueryOutput("catalog", output);

  const probeFunctions = catalog.functions.filter(
    (entry) => entry.schema === "public" && entry.name === PROBE,
  );
  assert.deepEqual(
    probeFunctions.map((entry) => entry.arguments).sort(),
    [...PROBE_ARGUMENTS].sort(),
  );
  const probeIdentities = probeFunctions.map(
    (entry) => `${entry.name}(${entry.arguments})`,
  );
  assert(probeIdentities.every((identity) => Buffer.byteLength(identity) > 63));
  assert.equal(
    probeIdentities[0].slice(0, 63),
    probeIdentities[1].slice(0, 63),
    "las sobrecargas de prueba tienen que colisionar si se truncan a 63 bytes",
  );

  const probeGrantIdentities = new Set(
    catalog.grants
      .filter(
        (grant) =>
          grant.objectKind === "function" &&
          grant.schema === "public" &&
          grant.identity.startsWith(`${PROBE}(`),
      )
      .map((grant) => grant.identity),
  );
  assert.deepEqual(
    [...probeGrantIdentities].sort(),
    [...probeIdentities].sort(),
  );

  // Ningún grant de función, de la app o de Supabase, puede quedar con una
  // identidad que no sea la firma completa de una función del catálogo.
  const functionIdentities = new Set(
    catalog.functions.map(
      (entry) => `${entry.schema}\0${entry.name}(${entry.arguments})`,
    ),
  );
  const truncatedGrants = catalog.grants.filter(
    (grant) =>
      grant.objectKind === "function" &&
      !functionIdentities.has(`${grant.schema}\0${grant.identity}`),
  );
  assert.deepEqual(truncatedGrants, []);

  return { grantCount: catalog.grants.length, probeGrantIdentities };
}

function verifyRollback() {
  assert.equal(
    psql(
      `select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${PROBE}';\n`,
    ),
    "0\n",
    "la transacción de prueba tenía que revertirse",
  );
}

// La limpieza se comprueba siempre, también si la verificación falló. Si
// fallan las dos, se informan las dos: ninguna tapa a la otra.
let result;
let failure;
try {
  result = verifyCatalog();
} catch (error) {
  failure = error;
}
let cleanupFailure;
try {
  verifyRollback();
} catch (error) {
  cleanupFailure = error;
}
if (failure && cleanupFailure) {
  throw new AggregateError(
    [failure, cleanupFailure],
    "Falló la verificación del catálogo D72 y también la comprobación de limpieza.",
  );
}
if (failure) throw failure;
if (cleanupFailure) throw cleanupFailure;

console.log(
  `D103: catálogo local validado; ${result.probeGrantIdentities.size} identidades de sobrecarga distintas y ${result.grantCount} grants sin truncar.`,
);
