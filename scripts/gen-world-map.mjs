#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import world from "@svg-maps/world";
import { optimize } from "svgo";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUTPUT = fileURLToPath(
  new URL("../src/data/world-map.ts", import.meta.url),
);
const SVG_OUTPUT = fileURLToPath(
  new URL("../public/world-map.svg", import.meta.url),
);

// En el mapa, estos países son demasiado pequeños para ofrecer un blanco de
// clic razonable. Conservan su frontera y además reciben un marcador ampliado.
const MARKER_COUNTRIES = new Set([
  "ad",
  "ag",
  "bb",
  "bh",
  "cv",
  "dm",
  "fm",
  "gd",
  "ki",
  "km",
  "kn",
  "lc",
  "li",
  "mc",
  "mh",
  "mt",
  "mu",
  "mv",
  "nr",
  "pw",
  "sc",
  "sg",
  "sm",
  "st",
  "to",
  "tv",
  "va",
  "vc",
]);

const seed = await import("node:fs/promises").then(({ readFile }) =>
  readFile(`${ROOT}supabase/seed.sql`, "utf8"),
);
const flags = [...seed.matchAll(/'(\p{Regional_Indicator}{2})'/gu)].map(
  (match) => match[1],
);
const wantedIds = new Set(
  flags.map((flag) =>
    [...flag]
      .map((character) =>
        String.fromCharCode((character.codePointAt(0) ?? 0) - 0x1f1e6 + 97),
      )
      .join(""),
  ),
);

const sourceLocations = world.locations.filter((location) =>
  wantedIds.has(location.id),
);
if (sourceLocations.length !== 195) {
  throw new Error(
    `Se esperaban 195 países y se encontraron ${sourceLocations.length}.`,
  );
}

const sourceSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${world.viewBox}">${sourceLocations
  .map(
    (location) =>
      `<path id="${location.id}" vector-effect="non-scaling-stroke" d="${location.path}"/>`,
  )
  .join("")}</svg>`;
const optimizedSvg = optimize(sourceSvg, {
  multipass: true,
  js2svg: { pretty: false },
  // Una cifra decimal equivale a menos de una décima de píxel en el tamaño
  // normal del mapa. Reduce mucho el peso sin cambiar su lectura visual.
  plugins: [{ name: "convertPathData", params: { floatPrecision: 1 } }],
}).data;

const optimizedIds = [...optimizedSvg.matchAll(/<path id="([a-z]{2})"/g)].map(
  (match) => match[1],
);
if (optimizedIds.length !== 195) {
  throw new Error(
    `La optimización preservó ${optimizedIds.length} de 195 países.`,
  );
}

const markers = sourceLocations.flatMap((location) => {
  if (!MARKER_COUNTRIES.has(location.id)) return [];
  const start = location.path.match(/[mM]\s*([\d.-]+)[ ,]([\d.-]+)/);
  if (!start)
    throw new Error(`No se pudo ubicar el marcador de ${location.id}.`);
  return [[location.id, Number(start[1]), Number(start[2])]];
});

const generated = `// Generado por scripts/gen-world-map.mjs. No editar a mano.\n`;
const contents = `${generated}
export const WORLD_MAP_VIEW_BOX = ${JSON.stringify(world.viewBox)};

export const WORLD_MAP_COUNTRY_IDS = ${JSON.stringify(optimizedIds)} as const;

export const WORLD_MAP_MARKERS = ${JSON.stringify(markers)} as const;
`;

await Promise.all([
  writeFile(OUTPUT, contents),
  writeFile(SVG_OUTPUT, `${optimizedSvg}\n`),
]);
console.log(
  `Mapa generado: ${optimizedIds.length} países, ${markers.length} marcadores, ${Buffer.byteLength(contents).toLocaleString("es-AR")} bytes de TypeScript y ${Buffer.byteLength(optimizedSvg).toLocaleString("es-AR")} bytes de SVG.`,
);
