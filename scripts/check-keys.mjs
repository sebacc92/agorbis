/**
 * Busca `key={…}` que puedan evaluar a un valor falsy.
 *
 * Qwik trata una clave falsy (`""`, `0`) como "sin clave": en vez de reutilizar
 * el nodo existente al re-renderizar, agrega uno nuevo. El síntoma es una lista
 * que se duplica sola —pestañas, chips, campos— y no salta ni en el typecheck
 * ni en ESLint, porque el tipo es correcto.
 *
 * Ya pasó tres veces en este proyecto (los tabs de comunidad, las opciones de
 * encuesta y los presets de fecha de cierre), así que va como chequeo y no como
 * disciplina.
 *
 *   node scripts/check-keys.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(full)) files.push(full);
  }
})("src");

/** Índices de array de base cero: `key={i}` vale 0 en el primer elemento. */
const BARE_INDEX = /\bkey=\{\s*(i|idx|index|n)\s*\}/g;
/** `key={algo.prop}` → nos interesa `prop`. */
const KEY_PROP = /\bkey=\{\s*[A-Za-z_$][\w$]*\.([\w$]+)\s*\}/g;
/** `key={variable}` suelto. */
const KEY_IDENT = /\bkey=\{\s*([A-Za-z_$][\w$]*)\s*\}/g;

let problems = 0;
const report = (file, index, source, message) => {
  const line = source.slice(0, index).split("\n").length;
  console.log(`  ${file}:${line}\n    ${message}`);
  problems++;
};

for (const file of files) {
  const src = readFileSync(file, "utf8");

  for (const m of src.matchAll(BARE_INDEX)) {
    report(
      file,
      m.index,
      src,
      `key={${m[1]}} es un índice de base cero: el primer elemento tiene clave 0 (falsy). ` +
        "Usá una plantilla, p. ej. key={`item-${" +
        m[1] +
        "}`}.",
    );
  }

  // Una propiedad usada como clave no puede valer "" ni 0 en ningún objeto
  // literal del archivo.
  const keyProps = new Set([...src.matchAll(KEY_PROP)].map((m) => m[1]));
  for (const prop of keyProps) {
    const bad = new RegExp(`\\b${prop}\\s*:\\s*(""|''|0)(?=\\s*[,}])`, "g");
    for (const m of src.matchAll(bad)) {
      report(
        file,
        m.index,
        src,
        `la propiedad "${prop}" se usa como key y acá vale ${m[1]}, que es falsy. ` +
          "Separá la clave de render del valor (p. ej. un campo `id` aparte).",
      );
    }
  }

  // `key={x}` donde x se declara como cadena vacía en el mismo archivo.
  const idents = new Set(
    [...src.matchAll(KEY_IDENT)]
      .map((m) => m[1])
      .filter((x) => !/^(i|idx|index|n)$/.test(x)),
  );
  for (const ident of idents) {
    const bad = new RegExp(
      `\\b(?:const|let)\\s+${ident}\\s*=\\s*(""|'')(?=\\s*[;,])`,
      "g",
    );
    for (const m of src.matchAll(bad)) {
      report(
        file,
        m.index,
        src,
        `key={${ident}} y "${ident}" se inicializa vacío.`,
      );
    }
  }
}

if (problems > 0) {
  console.log(
    `\n✗ ${problems} clave(s) potencialmente falsy en ${files.length} archivos`,
  );
  process.exit(1);
}
console.log(`✓ ninguna key falsy · ${files.length} archivos revisados`);
