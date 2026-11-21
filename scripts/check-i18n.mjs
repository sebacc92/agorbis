import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

/**
 * Listado recursivo de archivos por extensión.
 *
 * Antes esto llamaba a `rg --files`, lo que hacía que `npm run lint` fallara
 * con `spawnSync rg ENOENT` en cualquier máquina sin ripgrep instalado —
 * incluida una CI limpia. ripgrep no está en `devDependencies` ni se
 * documenta como requisito, así que la comprobación de i18n dependía de una
 * herramienta que el proyecto nunca declaró. Con `readdirSync` alcanza y no
 * hace falta instalar nada.
 */
const files = (dir, extensions) => {
  const out = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith("."))
          continue;
        walk(full);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out.sort();
};

const propertyName = (node) =>
  ts.isStringLiteral(node) || ts.isIdentifier(node) ? node.text : null;

/**
 * Lee los archivos del catálogo y junta cada msgid con todas sus apariciones.
 *
 * `index.ts` arma el catálogo con un spread de todos los archivos, y un objeto
 * literal también pisa en silencio una clave repetida: en los dos casos gana
 * la última aparición sin que nadie se entere. Por eso no alcanza con marcar
 * las traducciones contradictorias: una clave repetida, aunque hoy diga lo
 * mismo, es la que mañana alguien corrige en un solo lugar. Cada msgid vive en
 * un único archivo y una única vez.
 *
 * Exportada para `scripts/test-i18n.mjs`.
 */
export function collectCatalog(entries) {
  const messages = new Map();
  const occurrences = new Map();

  for (const { file, text } of entries) {
    const source = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node) => {
      if (
        ts.isPropertyAssignment(node) &&
        ts.isStringLiteral(node.initializer)
      ) {
        const key = propertyName(node.name);
        if (key) {
          const line =
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1;
          const current = { value: node.initializer.text, file, line };
          if (!messages.has(key)) messages.set(key, current);
          occurrences.set(key, [...(occurrences.get(key) ?? []), current]);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  const conflicts = [];
  const duplicates = [];
  for (const [key, list] of occurrences) {
    if (list.length < 2) continue;
    duplicates.push({ key, occurrences: list });
    const [first] = list;
    const different = list.find((item) => item.value !== first.value);
    if (different) conflicts.push({ key, previous: first, current: different });
  }

  return { messages, duplicates, conflicts };
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();

function main() {
  const catalogFiles = files("src/i18n/en", [".ts"]).filter(
    (file) => !file.endsWith("index.ts"),
  );
  const sourceFiles = files("src", [".ts", ".tsx"]).filter(
    (file) => !file.startsWith(join("src", "i18n")),
  );

  const { messages, duplicates, conflicts } = collectCatalog(
    catalogFiles.map((file) => ({ file, text: readFileSync(file, "utf8") })),
  );

  const required = new Map();
  const rawText = [];
  const legacyHooks = [];
  const translatedProps = new Map([
    ["Field", new Set(["label", "hint"])],
    ["EmptyState", new Set(["title", "description"])],
    ["ProgressBar", new Set(["label"])],
    ["ListingHeader", new Set(["title", "description"])],
    ["EmptyListing", new Set(["title", "why"])],
    ["FormShell", new Set(["title", "subtitle"])],
  ]);

  const location = (source, node, file) => {
    const start = source.getLineAndCharacterOfPosition(node.getStart(source));
    return `${file}:${start.line + 1}`;
  };

  const remember = (message, at) => {
    if (/[A-Za-zÀ-ÿ]/.test(message)) required.set(message, at);
  };

  for (const file of sourceFiles) {
    const fileText = readFileSync(file, "utf8");
    const source = ts.createSourceFile(
      file,
      fileText,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const usesI18nTranslate =
      /import\s*\{[^}]*\btranslate\b[^}]*\}\s*from\s*["']~\/lib\/i18n["']/.test(
        fileText,
      );

    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        usesI18nTranslate &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "translate"
      ) {
        const message = node.arguments[1];
        if (
          message &&
          (ts.isStringLiteral(message) ||
            ts.isNoSubstitutionTemplateLiteral(message))
        ) {
          remember(message.text, location(source, message, file));
        }
      }

      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "useI18n"
      ) {
        legacyHooks.push(location(source, node, file));
      }

      if (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) {
        const tag = node.tagName.getText(source);
        const props = translatedProps.get(tag);
        if (props) {
          for (const attribute of node.attributes.properties) {
            if (
              ts.isJsxAttribute(attribute) &&
              props.has(attribute.name.text) &&
              attribute.initializer &&
              ts.isStringLiteral(attribute.initializer)
            ) {
              remember(
                attribute.initializer.text,
                location(source, attribute, file),
              );
            }
          }
        }
      }

      if (ts.isJsxText(node)) {
        const text = node.text.replace(/\s+/g, " ").trim();
        if (/[A-Za-zÀ-ÿ]/.test(text)) {
          rawText.push({ text, at: location(source, node, file) });
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  const missing = [...required].filter(([message]) => !messages.has(message));

  if (conflicts.length) {
    console.error("Traducciones inglesas contradictorias para el mismo msgid:");
    for (const { key, previous, current } of conflicts) {
      console.error(
        `- ${JSON.stringify(key)}\n  ${previous.file}: ${JSON.stringify(previous.value)}\n  ${current.file}: ${JSON.stringify(current.value)}`,
      );
    }
  }

  const contradictory = new Set(conflicts.map(({ key }) => key));
  const repeated = duplicates.filter(({ key }) => !contradictory.has(key));
  if (repeated.length) {
    console.error(
      "Claves repetidas en el catálogo inglés (cada msgid va en un solo archivo, una sola vez):",
    );
    for (const { key, occurrences } of repeated) {
      console.error(
        `- ${JSON.stringify(key)}\n${occurrences.map(({ file, line }) => `  ${file}:${line}`).join("\n")}`,
      );
    }
  }

  if (missing.length) {
    console.error("Faltan traducciones inglesas:");
    for (const [message, at] of missing) {
      console.error(`- ${at} ${JSON.stringify(message)}`);
    }
  }

  if (rawText.length) {
    console.error("Texto JSX sin pasar por translate():");
    for (const item of rawText)
      console.error(`- ${item.at} ${JSON.stringify(item.text)}`);
  }

  if (legacyHooks.length) {
    console.error(
      `useI18n() no es serializable en Qwik: ${legacyHooks.join(", ")}`,
    );
  }

  if (
    conflicts.length ||
    duplicates.length ||
    missing.length ||
    rawText.length ||
    legacyHooks.length
  ) {
    process.exit(1);
  }

  console.log(
    `✓ i18n EN · ${messages.size} mensajes · ${required.size} usos estáticos verificados`,
  );
}
