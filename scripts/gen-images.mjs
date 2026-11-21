/**
 * Genera los rasters que el runtime no puede producir.
 *
 * El Worker no incluye módulos nativos como `sharp`: es una devDependency que
 * sólo se usa en build. Por eso estas dos cosas se resuelven acá y no en una
 * ruta:
 *
 *   · `public/og.png` — los rastreadores de Twitter, Facebook, LinkedIn y
 *     WhatsApp no renderizan SVG, así que el generador de
 *     `/social/[type]/[id]` (que devuelve SVG) produce tarjetas vacías. Este
 *     PNG es la imagen por defecto para compartir.
 *   · `public/icon-192.png`, `icon-512.png`, `icon-maskable.png` — el manifest
 *     declaraba sólo el SVG. Android pide PNG para el diálogo de instalación
 *     y para el icono adaptativo.
 *
 * Se corre a mano (`npm run gen.images`) y los resultados se commitean: no
 * cambian salvo que cambie la identidad, y no vale la pena atarlos al build.
 */
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// Paleta: los mismos valores que `@theme` en src/global.css.
const BRAND = "#7c3aed";
const BRAND_DEEP = "#4c1d95";
const ACCENT = "#fbbf24";
const MIST = "#faf9fc";

/** El globo de meridianos del favicon, a cualquier escala y color. */
const globe = (cx, cy, r, stroke, width) => {
  const chord = (dy) => Math.sqrt(Math.max(0, r * r - dy * dy));
  const parallels = [-0.8, -0.42, 0, 0.42, 0.8]
    .map((f) => {
      const dy = f * r;
      const half = chord(dy);
      return `<line x1="${cx - half}" y1="${cy + dy}" x2="${cx + half}" y2="${cy + dy}"/>`;
    })
    .join("");
  return `<g fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round">
    <circle cx="${cx}" cy="${cy}" r="${r}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${r * 0.7}" ry="${r}"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${r * 0.37}" ry="${r}"/>
    <line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}"/>
    ${parallels}
  </g>`;
};

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${BRAND_DEEP}"/>
      <stop offset="1" stop-color="${BRAND}"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  ${globe(1150, 315, 285, "#ffffff", 1.6)}
  <g opacity="0.14">${globe(1150, 315, 285, "#ffffff", 22)}</g>
  <circle cx="86" cy="82" r="26" fill="${ACCENT}"/>
  <text x="128" y="93" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="30" font-weight="700" fill="#ffffff">Agorbis</text>
  <text x="86" y="300" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="72" font-weight="700" fill="#ffffff">Unir a la humanidad,</text>
  <text x="86" y="386" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="72" font-weight="700" fill="#ffffff">una comunidad a la vez</text>
  <text x="86" y="466" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="30" fill="${MIST}" opacity="0.85">De la Tierra a tu ciudad · comunidades geográficas</text>
  <rect x="86" y="520" width="120" height="6" rx="3" fill="${ACCENT}"/>
</svg>`;

/** Icono cuadrado. `safe` deja el margen que exige un icono maskable. */
const iconSvg = (size, safe = 0) => {
  const r = (size / 2) * (1 - safe);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" ${safe ? "" : `rx="${size * 0.22}"`} fill="${BRAND}"/>
    ${globe(size / 2, size / 2, r * 0.62, "#ffffff", size * 0.028)}
    <circle cx="${size * 0.66}" cy="${size * 0.66}" r="${size * 0.1}" fill="${ACCENT}" stroke="${BRAND}" stroke-width="${size * 0.03}"/>
  </svg>`;
};

const png = (svg, out) =>
  sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(join(PUBLIC, out));

await mkdir(PUBLIC, { recursive: true });
const results = await Promise.all([
  png(ogSvg, "og.png"),
  png(iconSvg(192), "icon-192.png"),
  png(iconSvg(512), "icon-512.png"),
  // Maskable: Android recorta hasta un 20% del borde, así que el dibujo se
  // encoge para que nunca le corte la cabeza al globo.
  png(iconSvg(512, 0.3), "icon-maskable.png"),
]);

for (const r of results) {
  console.log(
    `  ${String(r.width).padStart(4)}×${String(r.height).padEnd(4)} ${String(r.size).padStart(7)} B`,
  );
}
console.log("✓ imágenes generadas en public/");
