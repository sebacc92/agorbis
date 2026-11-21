/**
 * Manipulación de texto que no depende del idioma ni del entorno.
 *
 * Sin imports a propósito: lo usan tanto rutas de servidor como componentes, y
 * los scripts de `pnpm lint` lo transpilan en memoria sin resolver alias.
 */

/**
 * Recorta a `maxCodePoints` sin partir un carácter en dos.
 *
 * `slice()` cuenta unidades UTF-16, así que cortar en medio de un emoji o de un
 * ideograma fuera del BMP deja media pareja de sustitución: un `�` en la mitad
 * de un nombre propio. Contar puntos de código cuesta una pasada y evita el
 * caso entero.
 */
export function clipText(value: string, maxCodePoints: number): string {
  const codePoints = Array.from(value);
  return codePoints.length <= maxCodePoints
    ? value
    : codePoints.slice(0, maxCodePoints).join("");
}

/** Colapsa los espacios en uno solo y recorta con puntos suspensivos. */
export function summarizeText(value: string, maxCodePoints: number): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  const clipped = clipText(collapsed, maxCodePoints);
  // El "…" se decide sobre el texto ya colapsado: comparar contra el original
  // anunciaba texto cortado en frases que entraban completas.
  return clipped === collapsed ? clipped : `${clipped}…`;
}

/** Iniciales para el avatar de fallback. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => clipText(part, 1).toUpperCase()).join("") || "?";
}

/**
 * ¿Es una fecha de calendario que existe de verdad? (`AAAA-MM-DD`)
 *
 * El formato lo cubre la expresión regular, pero no alcanza: `2026-02-30` la
 * cumple y no es un día. `new Date()` tampoco sirve sola, porque desborda en
 * silencio —`2026-02-30` pasa a ser el 2 de marzo—, así que se compara cada
 * campo contra lo que quedó después de normalizar.
 *
 * Vive acá, y no junto a las actions que la usan, porque este archivo no tiene
 * imports y por eso se puede probar sola. En `extension-actions.ts` estaría
 * detrás de `globalAction$`, que se ejecuta al importar el módulo.
 */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    date.getUTCFullYear() === Number(match[1]) &&
    date.getUTCMonth() + 1 === Number(match[2]) &&
    date.getUTCDate() === Number(match[3])
  );
}

/**
 * Versión de un texto para comparar sin acentos ni mayúsculas, **carácter a
 * carácter**.
 *
 * La parte importante es que conserva la longitud en unidades UTF-16: cada
 * carácter del original produce acá otro que ocupa lo mismo. Eso permite buscar sobre la versión plegada y
 * después cortar el texto *original* en los mismos índices, así el resaltado
 * devuelve "Córdoba" y no "cordoba". Los signos combinantes sueltos se
 * reemplazan por un carácter que nunca va a coincidir, para no correr el
 * índice: U+0000, escrito como escape y no como byte literal, porque un NUL
 * en el archivo hace que git lo trate como binario y esconda sus diffs.
 */
function foldForSearch(value: string): string {
  return [...value]
    .map((char) => {
      const folded = char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
      if (folded.length === char.length) return folded;
      // El largo se cuenta en unidades UTF-16, que es como indexa `slice`: un
      // emoji ocupa dos, y devolver sólo `folded[0]` corría el resaltado de
      // todo lo que viniera después.
      return char.length === 1 ? (folded[0] ?? "\u0000") : char;
    })
    .join("");
}

export interface TextSegment {
  text: string;
  match: boolean;
}

/**
 * Las palabras de lo buscado que cuentan como coincidencia: las de dos letras
 * o más. Una sola regla para resaltar y para elegir el extracto, así lo que
 * se muestra y lo que se marca no se contradicen.
 */
function searchTerms(query: string): string[] {
  return query
    .trim()
    .split(/\s+/)
    .filter((term) => term.length > 1);
}

/**
 * Parte un texto en tramos que coinciden con la búsqueda y tramos que no.
 *
 * Devuelve datos y no HTML a propósito: la vista arma los `<mark>` con nodos
 * JSX, así que un término de búsqueda con `<script>` es texto y no marcado.
 * Resaltar interpolando HTML sería inyectar en la página exactamente lo que
 * escribió un desconocido en la URL.
 *
 * Compara sin acentos ni mayúsculas —quien busca "cordoba" espera ver marcado
 * "Córdoba"— pero recorta siempre sobre el original.
 */
export function highlightSegments(text: string, query: string): TextSegment[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [{ text, match: false }];

  const folded = foldForSearch(text);
  // `match[i]` dice si el carácter i del original forma parte de algún término.
  const marked = new Array<boolean>(text.length).fill(false);

  for (const term of terms) {
    const needle = foldForSearch(term);
    if (!needle) continue;
    let from = folded.indexOf(needle);
    while (from !== -1) {
      for (let i = from; i < from + needle.length; i++) marked[i] = true;
      from = folded.indexOf(needle, from + 1);
    }
  }

  const segments: TextSegment[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marked[i] !== marked[start]) {
      segments.push({ text: text.slice(start, i), match: marked[start]! });
      start = i;
    }
  }
  return segments;
}

/**
 * Un extracto que deja a la vista la coincidencia.
 *
 * Los resultados de búsqueda muestran dos líneas de extracto y la base busca
 * en el texto entero: si lo buscado aparece más adelante, la marca queda
 * fuera de lo visible y el resultado no dice por qué apareció. Se ubica la
 * primera coincidencia con la misma regla que `highlightSegments` (sin
 * acentos ni mayúsculas, término por término) y, si empieza después de
 * `lead` caracteres, el extracto arranca en la primera palabra entera de los
 * `lead` anteriores, con "…" adelante para que se note el corte.
 *
 * Sin coincidencia, con ella al principio o sin un espacio donde cortar, el
 * texto vuelve igual: cortar sólo después de un espacio es lo que garantiza
 * no partir una palabra ni una pareja de sustitución.
 */
export function excerptAround(text: string, query: string, lead = 40): string {
  const folded = foldForSearch(text);
  let first = -1;
  for (const term of searchTerms(query)) {
    const at = folded.indexOf(foldForSearch(term));
    if (at !== -1 && (first === -1 || at < first)) first = at;
  }
  if (first <= lead) return text;

  // El primer espacio desde `lead + 1` caracteres antes de la coincidencia:
  // lo que le sigue es la primera palabra entera de la ventana.
  const gap = /\s+/g;
  gap.lastIndex = first - lead - 1;
  const found = gap.exec(text);
  if (!found || found.index >= first) return text;
  return `…${text.slice(found.index + found[0].length)}`;
}

/**
 * Un campo listo para meter en un CSV.
 *
 * Hace dos cosas distintas y las dos hacen falta:
 *
 * 1. **Escapado.** Comas, comillas y saltos de línea rompen la fila si van
 *    crudos; se encierra entre comillas y se duplican las internas. Las
 *    opciones de una encuesta las escribe la gente, así que llegan con todo.
 *
 * 2. **Neutralizar fórmulas.** Excel, LibreOffice y Sheets ejecutan cualquier
 *    celda que empiece con `=`, `+`, `-` o `@`. Una opción llamada
 *    `=HYPERLINK(...)` se convierte en código que corre en la máquina de quien
 *    abre el archivo, sin que haya pasado por ningún parser nuestro. Se le
 *    antepone un apóstrofo, que esas planillas interpretan como "esto es
 *    texto" y no muestran.
 */
export function csvField(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Una fila de CSV, con salto de línea CRLF como pide el RFC 4180. */
export function csvRow(fields: (string | number | null | undefined)[]): string {
  return `${fields.map(csvField).join(",")}\r\n`;
}

/**
 * Escapa texto para insertarlo en un nodo XML.
 *
 * Lo usan el sitemap y el generador de imágenes para compartir. Los dos emiten
 * XML a mano —no hay DOM en el edge— así que el escapado tiene que ser uno solo
 * y no una copia por ruta.
 */
export function escapeXml(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (char) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[char] ?? char,
  );
}

/**
 * Quita los caracteres que XML 1.0 no admite ni siquiera escapados: controles
 * C0 salvo tabulación y saltos de línea, sustitutos sueltos y U+FFFE/U+FFFF.
 *
 * `escapeXml` no alcanza para texto que escribió un vecino: un `&#0;` no es
 * una entidad válida, y un solo carácter así deja inválido el documento
 * entero —el lector RSS descarta el feed completo, no el ítem—. Va aparte y no
 * dentro de `escapeXml` para que el escapado siga siendo una transformación
 * reversible y el descarte, una decisión explícita de quien arma el XML.
 */
export function stripInvalidXmlChars(value: string): string {
  return value.replace(
    // eslint-disable-next-line no-control-regex -- justamente se buscan los controles que XML prohíbe.
    /[^\u0009\u000A\u000D\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu,
    "",
  );
}

/** Texto de usuario listo para un nodo o atributo XML: saneado y escapado. */
export function xmlText(value: string): string {
  return escapeXml(stripInvalidXmlChars(value));
}
