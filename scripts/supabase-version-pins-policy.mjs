import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

export const SUPABASE_VERSION_PIN_FILES = Object.freeze([
  "postgres-version",
  "storage-version",
  "storage-migration",
  "rest-version",
  "gotrue-version",
]);

export const SUPABASE_VERSION_PINS = Object.freeze({
  "postgres-version": "17.6.1.155",
  "storage-version": "v1.70.7",
  "storage-migration": "fix-search-by-timestamp-sqli",
  "rest-version": "v14.15",
  "gotrue-version": "v2.195.0",
});

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) ===
      JSON.stringify([...expected].sort())
  );
}

export function validateSupabaseVersionPins(pins) {
  const errors = [];
  if (!exactKeys(pins, SUPABASE_VERSION_PIN_FILES)) {
    return [
      `El inventario debe contener únicamente estos cinco pins: ${SUPABASE_VERSION_PIN_FILES.join(", ")}.`,
    ];
  }
  for (const name of SUPABASE_VERSION_PIN_FILES) {
    const value = pins[name];
    if (
      typeof value !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
    ) {
      errors.push(`El pin ${name} tiene un valor inseguro.`);
    } else if (value !== SUPABASE_VERSION_PINS[name]) {
      errors.push(
        `El pin ${name} cambió: se esperaba ${SUPABASE_VERSION_PINS[name]}.`,
      );
    }
  }
  return errors;
}

function assertSafeDirectory(directory, label) {
  if (!path.isAbsolute(directory)) {
    throw new Error(`${label} debe ser una ruta absoluta.`);
  }
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`${label} debe ser un directorio real, no un symlink.`);
  }
  if (realpathSync(directory) !== path.resolve(directory)) {
    throw new Error(`${label} atraviesa un symlink y no es una ruta segura.`);
  }
}

function targetPaths(projectRoot) {
  assertSafeDirectory(projectRoot, "La raíz del proyecto");
  const supabaseRoot = path.join(projectRoot, "supabase");
  assertSafeDirectory(supabaseRoot, "El directorio supabase");
  const tempRoot = path.join(supabaseRoot, ".temp");
  if (
    path.dirname(tempRoot) !== supabaseRoot ||
    path.relative(projectRoot, tempRoot) !== "supabase/.temp"
  ) {
    throw new Error("La ruta destino de pins escapó de supabase/.temp.");
  }
  return { supabaseRoot, tempRoot };
}

function lstatIfPresent(filePath) {
  try {
    return lstatSync(filePath);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function readExactPin(filePath, name, requireRestrictiveModes) {
  const stat = lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`El pin materializado ${name} no es un archivo regular.`);
  }
  if (requireRestrictiveModes && (stat.mode & 0o777) !== 0o600) {
    throw new Error(`El pin materializado ${name} debe tener permisos 600.`);
  }
  const raw = readFileSync(filePath);
  const expected = Buffer.from(SUPABASE_VERSION_PINS[name], "utf8");
  if (!raw.equals(expected)) {
    throw new Error(`El pin materializado ${name} no coincide byte a byte.`);
  }
  return {
    value: SUPABASE_VERSION_PINS[name],
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

export function verifyMaterializedSupabaseVersionPins(
  projectRoot,
  { allowProviderState = false, requireRestrictiveModes = true } = {},
) {
  const { tempRoot } = targetPaths(projectRoot);
  assertSafeDirectory(tempRoot, "El directorio supabase/.temp");
  if (requireRestrictiveModes && (lstatSync(tempRoot).mode & 0o777) !== 0o700) {
    throw new Error("El directorio supabase/.temp debe tener permisos 700.");
  }
  const entries = readdirSync(tempRoot).sort();
  const expected = [...SUPABASE_VERSION_PIN_FILES].sort();
  if (
    !allowProviderState &&
    JSON.stringify(entries) !== JSON.stringify(expected)
  ) {
    throw new Error(
      `supabase/.temp debe contener únicamente los cinco pins; contiene: ${entries.join(", ") || "(vacío)"}.`,
    );
  }
  for (const name of SUPABASE_VERSION_PIN_FILES) {
    if (!entries.includes(name)) {
      throw new Error(`Falta el pin materializado ${name}.`);
    }
  }
  return Object.fromEntries(
    SUPABASE_VERSION_PIN_FILES.map((name) => [
      name,
      readExactPin(path.join(tempRoot, name), name, requireRestrictiveModes),
    ]),
  );
}

export function materializeSupabaseVersionPins(
  projectRoot,
  pins = SUPABASE_VERSION_PINS,
) {
  const errors = validateSupabaseVersionPins(pins);
  if (errors.length > 0) throw new Error(errors.join(" "));
  const { tempRoot } = targetPaths(projectRoot);
  const existing = lstatIfPresent(tempRoot);
  if (existing) {
    const kind = existing.isSymbolicLink() ? "symlink" : "estado preexistente";
    throw new Error(
      `supabase/.temp ya existe como ${kind}; la preparación CI no lo modifica.`,
    );
  }
  let created = false;
  try {
    mkdirSync(tempRoot, { mode: 0o700 });
    created = true;
    for (const name of SUPABASE_VERSION_PIN_FILES) {
      writeFileSync(path.join(tempRoot, name), pins[name], {
        mode: 0o600,
        flag: "wx",
      });
    }
    return verifyMaterializedSupabaseVersionPins(projectRoot);
  } catch (error) {
    if (created) rmSync(tempRoot, { recursive: true });
    throw error;
  }
}
