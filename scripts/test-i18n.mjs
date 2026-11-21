import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { collectCatalog } from "./check-i18n.mjs";

// El núcleo no importa Qwik ni catálogos. Lo transpilamos en memoria para que
// esta prueba funcione también en las versiones de Node que no cargan TS.
const source = readFileSync(
  new URL("../src/lib/i18n-core.ts", import.meta.url),
  "utf8",
);
const javascript = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const core = await import(
  `data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`
);

assert.equal(core.matchSupportedLocale("en-US"), "en");
assert.equal(core.matchSupportedLocale("es_AR"), "es");
assert.equal(core.matchSupportedLocale("fr"), null);
assert.equal(core.matchSupportedLocale("en,es"), null);

assert.equal(core.resolveLocale(null), "es");
assert.equal(core.resolveLocale("en-US,en;q=0.8"), "en");
assert.equal(core.resolveLocale("en;q=.4, es;Q=.9"), "es");
assert.equal(core.resolveLocale("es;q=0, *;q=1"), "en");
assert.equal(core.resolveLocale("en;q=0, *;q=1"), "es");
assert.equal(core.resolveLocale("en;q=2, es;q=.5"), "es");
assert.equal(core.resolveLocale("en;q=.8, es;q=.8"), "en");

assert.equal(
  core.negotiateLocale({
    requested: "es",
    stored: "en",
    acceptLanguage: "en-US",
  }),
  "es",
);
assert.equal(
  core.negotiateLocale({
    requested: "fr",
    stored: "en-US",
    acceptLanguage: "es",
  }),
  "en",
);
assert.equal(
  core.negotiateLocale({
    stored: "cookie-corrupta",
    acceptLanguage: "en-US,en;q=.9",
  }),
  "en",
);

assert.equal(core.localeTag("es"), "es-AR");
assert.equal(core.localeDirection("AR_eg"), "rtl");
assert.equal(core.localeDirection("en-US"), "ltr");

const page = new URL(
  "https://agorbis.example/c/earth?orden=apoyo&lang=es#debate",
);
assert.equal(
  core.localeSwitchHref(page, "en"),
  "/c/earth?orden=apoyo&lang=en#debate",
);
assert.equal(core.canonicalHref(page), "https://agorbis.example/c/earth");

// El verificador del catálogo tiene que ver las claves que un objeto literal o
// el spread de `index.ts` pisarían en silencio.
const catalog = (file, body) => ({
  file,
  text: `export const x = {\n${body}\n};\n`,
});

const clean = collectCatalog([
  catalog("a.ts", `Inicio: "Home",\n"Buscar": "Search",`),
  catalog("b.ts", `"Cerrar menú": "Close menu",`),
]);
assert.equal(clean.messages.size, 3);
assert.deepEqual(clean.duplicates, []);
assert.deepEqual(clean.conflicts, []);

const withinFile = collectCatalog([
  catalog("a.ts", `Inicio: "Home",\nBuscar: "Search",\n"Inicio": "Home",`),
]);
assert.deepEqual(
  withinFile.duplicates.map(({ key, occurrences }) => [
    key,
    occurrences.map(({ file, line }) => `${file}:${line}`),
  ]),
  [["Inicio", ["a.ts:2", "a.ts:4"]]],
);
assert.deepEqual(withinFile.conflicts, []);

const acrossFiles = collectCatalog([
  catalog("a.ts", `"Buscando…": "Searching…",`),
  catalog("b.ts", `"Buscando…": "Searching…",`),
  catalog("c.ts", `"Buscando…": "Looking…",`),
]);
assert.equal(acrossFiles.duplicates.length, 1);
assert.deepEqual(
  acrossFiles.duplicates[0].occurrences.map(({ file }) => file),
  ["a.ts", "b.ts", "c.ts"],
);
assert.equal(acrossFiles.conflicts.length, 1);
assert.equal(acrossFiles.conflicts[0].current.value, "Looking…");
// La primera aparición es la que se reporta como referencia.
assert.equal(acrossFiles.messages.get("Buscando…").file, "a.ts");

console.log("✓ i18n runtime · negociación, precedencia y URLs verificadas");
console.log("✓ i18n catálogo · claves repetidas y contradictorias detectadas");
