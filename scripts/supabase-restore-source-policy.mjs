import {
  canonicalizePgDump,
  decodeCopyTextValue,
  parseCopyDefinitions,
  sha256Buffer,
} from "./supabase-backup-lib.mjs";

export const RESTORABLE_PRODUCTION_PROJECT_REF = "ibtvlvpxwourrxwcrfkf";
export const RESTORABLE_PRODUCTION_API_ORIGIN =
  "https://ibtvlvpxwourrxwcrfkf.supabase.co";
export const REGENERABLE_STORAGE_OBJECT_FIELDS = Object.freeze([
  "metadata",
  "updated_at",
  "version",
]);
export const RESTORE_TRIGGER_PROBE_SEQUENCE = "public.activation_events_id_seq";
const POSTGRES_BIGINT_MAX = 9_223_372_036_854_775_807n;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function parseRestoreTriggerSequenceState(output) {
  invariant(
    typeof output === "string",
    "El estado de la secuencia del probe no es texto.",
  );
  const match = output.match(/^([1-9][0-9]*)\|(t|f)(?:\r?\n)?$/);
  invariant(match, "El estado de la secuencia del probe no es canónico.");
  const lastValue = BigInt(match[1]);
  invariant(
    lastValue <= POSTGRES_BIGINT_MAX,
    "El estado de la secuencia del probe excede bigint.",
  );
  return Object.freeze({
    lastValue: match[1],
    isCalled: match[2] === "t",
  });
}

export function buildRestoreTriggerSequenceSetvalSql(state) {
  invariant(
    state && typeof state === "object" && !Array.isArray(state),
    "El estado restaurable de la secuencia del probe es inválido.",
  );
  invariant(
    typeof state.lastValue === "string" &&
      /^(?:[1-9][0-9]*)$/.test(state.lastValue) &&
      BigInt(state.lastValue) <= POSTGRES_BIGINT_MAX,
    "El valor restaurable de la secuencia del probe es inválido.",
  );
  invariant(
    typeof state.isCalled === "boolean",
    "is_called de la secuencia del probe es inválido.",
  );
  return `select pg_catalog.setval('${RESTORE_TRIGGER_PROBE_SEQUENCE}'::regclass, ${state.lastValue}::bigint, ${state.isCalled ? "true" : "false"});`;
}

export function classifyRestoreBackupSource(
  manifest,
  { currentRepository, productionConfirmed = false } = {},
) {
  invariant(
    manifest && typeof manifest === "object" && !Array.isArray(manifest),
    "El manifiesto de restore es inválido.",
  );
  const source = manifest.source;
  invariant(
    source && typeof source === "object" && !Array.isArray(source),
    "El manifiesto no identifica una fuente de backup válida.",
  );

  if (source.mode === "local") {
    invariant(
      productionConfirmed === false,
      "La confirmación de backup productivo no se acepta para una fuente local.",
    );
    invariant(
      source.projectRef === "agorbis",
      "El backup local no pertenece al proyecto local agorbis.",
    );
    invariant(
      manifest.fixture &&
        typeof manifest.fixture === "object" &&
        !Array.isArray(manifest.fixture),
      "El backup local debe conservar su fixture real de restore.",
    );
    return Object.freeze({
      mode: "local",
      projectRef: "agorbis",
      fixtureRequired: true,
      compareSourceValues: true,
    });
  }

  if (source.mode === "production") {
    invariant(
      productionConfirmed === true,
      "Un backup productivo requiere --confirm-production-backup.",
    );
    invariant(
      source.projectRef === RESTORABLE_PRODUCTION_PROJECT_REF,
      "El backup productivo no pertenece al project ref autorizado.",
    );
    invariant(
      source.apiOrigin === RESTORABLE_PRODUCTION_API_ORIGIN,
      "El origen API del backup productivo no coincide con Producción.",
    );
    invariant(
      manifest.fixture === null,
      "Un backup productivo no puede contener ni inventar un fixture local.",
    );
    invariant(
      manifest.repository?.dirty === false &&
        /^[a-f0-9]{40}$/.test(manifest.repository?.commit ?? ""),
      "El backup productivo debe provenir de un release commit limpio.",
    );
    invariant(
      currentRepository?.dirty === false &&
        currentRepository.commit === manifest.repository.commit,
      "El restore productivo exige el mismo release commit y un worktree limpio.",
    );
    return Object.freeze({
      mode: "production",
      projectRef: RESTORABLE_PRODUCTION_PROJECT_REF,
      fixtureRequired: false,
      compareSourceValues: false,
    });
  }

  throw new Error(
    `Fuente de backup no soportada: ${String(source.mode ?? "vacía")}.`,
  );
}

function copyStructure(sql) {
  const kept = [];
  let insideCopy = false;
  for (const line of canonicalizePgDump(sql).split("\n")) {
    if (/^COPY ".+"\.".+" \(.+\) FROM stdin;$/.test(line)) {
      insideCopy = true;
      kept.push(line);
    } else if (insideCopy && line === "\\.") {
      insideCopy = false;
      kept.push(line);
    } else if (!insideCopy) {
      kept.push(line);
    }
  }
  if (insideCopy) throw new Error("Dump con bloque COPY incompleto.");
  return kept.join("\n");
}

function normalizeSequenceCurrentValues(structure) {
  return structure
    .split("\n")
    .map((line) => {
      if (!line.startsWith("SELECT pg_catalog.setval(")) return line;
      const match = line.match(
        /^SELECT pg_catalog\.setval\('(\"[a-z_][a-z0-9_]*\"\.\"[a-z_][a-z0-9_]*\")', ([0-9]+), (true|false)\);$/,
      );
      invariant(match, "El dump contiene un setval no canónico.");
      return `SELECT pg_catalog.setval('${match[1]}', <current-value>, ${match[3]});`;
    })
    .join("\n");
}

function definitionsByTable(sql, label) {
  const definitions = parseCopyDefinitions(sql);
  const byTable = new Map();
  for (const definition of definitions) {
    invariant(
      !byTable.has(definition.qualified),
      `${label} contiene COPY duplicado para ${definition.qualified}.`,
    );
    byTable.set(definition.qualified, definition);
  }
  return { definitions, byTable };
}

export function compareBackupDataStructure(
  sourceSql,
  backupSql,
  { sequenceValues = "exact" } = {},
) {
  invariant(
    ["exact", "ignore-current-value"].includes(sequenceValues),
    "La política de comparación de secuencias es inválida.",
  );
  const source = definitionsByTable(sourceSql, "source data.sql");
  const backup = definitionsByTable(backupSql, "backup data.sql");
  const signature = (definitions) =>
    definitions.map((definition) => ({
      qualified: definition.qualified,
      columns: definition.columns,
    }));
  invariant(
    JSON.stringify(signature(source.definitions)) ===
      JSON.stringify(signature(backup.definitions)),
    "La estructura COPY source-backup difiere.",
  );
  let sourceStructure = copyStructure(sourceSql);
  let backupStructure = copyStructure(backupSql);
  if (sequenceValues === "ignore-current-value") {
    sourceStructure = normalizeSequenceCurrentValues(sourceStructure);
    backupStructure = normalizeSequenceCurrentValues(backupStructure);
  } else if (
    sourceStructure !== backupStructure &&
    normalizeSequenceCurrentValues(sourceStructure) ===
      normalizeSequenceCurrentValues(backupStructure)
  ) {
    throw new Error(
      "Las sentencias no-COPY source-backup difieren únicamente en valores corrientes de secuencias.",
    );
  }
  invariant(
    sourceStructure === backupStructure,
    "Las sentencias no-COPY o headers source-backup difieren.",
  );
  return {
    tables: source.definitions.length,
    structureSha256: sha256Buffer(Buffer.from(sourceStructure)),
  };
}

function normalizedRows(definition, ignoredFields) {
  const ignored = new Set(ignoredFields);
  return definition.rows
    .map((line) => {
      if (ignored.size === 0) return line;
      const values = line.split("\t").map(decodeCopyTextValue);
      invariant(
        values.length === definition.columns.length,
        `Fila COPY inválida en ${definition.qualified}.`,
      );
      return JSON.stringify(
        definition.columns.flatMap((column, index) =>
          ignored.has(column) ? [] : [[column, values[index]]],
        ),
      );
    })
    .sort();
}

export function compareRestoredDataAfterManagedServices(
  backupSql,
  restoredSql,
) {
  const structure = compareBackupDataStructure(restoredSql, backupSql);
  const backup = definitionsByTable(backupSql, "backup data.sql");
  const restored = definitionsByTable(restoredSql, "restored data.sql");
  let rows = 0;
  for (const expected of backup.definitions) {
    const actual = restored.byTable.get(expected.qualified);
    invariant(actual, `El restore final no contiene ${expected.qualified}.`);
    const ignored =
      expected.qualified === "storage.objects"
        ? REGENERABLE_STORAGE_OBJECT_FIELDS
        : [];
    const expectedRows = normalizedRows(expected, ignored);
    const actualRows = normalizedRows(actual, ignored);
    invariant(
      JSON.stringify(actualRows) === JSON.stringify(expectedRows),
      `Los datos restaurados difieren en ${expected.qualified}.`,
    );
    rows += expected.rows.length;
  }
  return {
    tables: structure.tables,
    rows,
    structureSha256: structure.structureSha256,
    comparedExactlyExcept: {
      "storage.objects": [...REGENERABLE_STORAGE_OBJECT_FIELDS],
    },
    protectedStorageObjectFieldsPreserved: true,
  };
}

export function assertStorageMetadataDifferencesAreRegenerable(differences) {
  invariant(
    Array.isArray(differences),
    "Las diferencias Storage son inválidas.",
  );
  const allowed = new Set(REGENERABLE_STORAGE_OBJECT_FIELDS);
  for (const difference of differences) {
    invariant(
      difference &&
        typeof difference === "object" &&
        Array.isArray(difference.changedFields) &&
        difference.changedFields.length > 0,
      "Una diferencia Storage tiene formato inválido.",
    );
    invariant(
      difference.changedFields.every((field) => allowed.has(field)),
      `Storage alteró metadata no regenerable en ${String(difference.object ?? "objeto desconocido")}.`,
    );
  }
  return {
    differences: differences.length,
    allowedFields: [...REGENERABLE_STORAGE_OBJECT_FIELDS],
  };
}
