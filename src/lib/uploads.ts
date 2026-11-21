import type { DB } from "./supabase";
import { claimDraftMediaUrl } from "./claim-media";
import { limitMessage } from "./db-error";
import { DEFAULT_LOCALE, translate, type Locale } from "./i18n";
import { isUuid } from "./http";
import { normalizeHttpUrl } from "./url";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Cuántos bytes alcanzan para reconocer los contenedores contemplados. */
const SIGNATURE_BYTES = 16;
export const MAX_IMAGE_EDGE = 4096;
export const MAX_IMAGE_PIXELS = 16_000_000;
const CANONICAL_UPLOAD_PATH =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|png|webp)$/i;

export function isCanonicalUploadPath(path: string, ownerId?: string): boolean {
  const match = CANONICAL_UPLOAD_PATH.exec(path);
  if (!match || !isUuid(match[1]) || !isUuid(match[2])) return false;
  return !ownerId || match[1].toLowerCase() === ownerId.toLowerCase();
}

/**
 * La ruta pública no expone Storage. El handler vuelve a comprobar que el
 * objeto siga siendo el avatar vigente antes de descargarlo con service_role.
 */
export function canonicalPublicUploadUrl(
  _db: DB,
  bucket: "avatars",
  path: string,
  ownerId?: string,
): string | null {
  if (!isCanonicalUploadPath(path, ownerId)) return null;
  return `/media/avatares/${path}`;
}

export function canonicalUploadPathFromPublicUrl(
  value: unknown,
  bucket: "avatars",
  ownerId?: string,
): string | null {
  if (typeof value === "string") {
    const prefix = `/media/avatares/`;
    if (value.startsWith(prefix)) {
      try {
        const path = decodeURIComponent(value.slice(prefix.length));
        return isCanonicalUploadPath(path, ownerId) ? path : null;
      } catch {
        return null;
      }
    }
  }

  // Compatibilidad de limpieza durante la migración desde el bucket público.
  const safe = normalizeHttpUrl(value);
  if (!safe) return null;
  const parsed = new URL(safe);
  const prefix = `/storage/v1/object/public/${bucket}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;

  try {
    const path = decodeURIComponent(parsed.pathname.slice(prefix.length));
    return isCanonicalUploadPath(path, ownerId) ? path : null;
  } catch {
    return null;
  }
}

const ascii = (bytes: Uint8Array, from: number, text: string): boolean =>
  [...text].every((char, i) => bytes[from + i] === char.charCodeAt(0));

/**
 * Qué formato es el archivo **según sus bytes**, o `null` si no es uno de los
 * contenedores reconocidos. AVIF se reconoce para rechazarlo explícitamente:
 * el runtime Edge no puede sanearlo de forma confiable antes de Storage.
 *
 * `file.type` lo declara el navegador a partir de la extensión y quien llame a
 * la API lo escribe a mano: no es un dato, es una afirmación del cliente.
 * Confiando en él, un `.html` renombrado a `.png` entraba al bucket público
 * guardado con `Content-Type: image/png` —la cabecera se tomaba de la misma
 * afirmación—, y la validación no miraba el contenido en ningún momento.
 *
 * SVG queda fuera a propósito, como ya estaba: es XML, admite `<script>` y se
 * sirve desde un dominio público.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  // JPEG: SOI + marcador.
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: firma de 8 bytes, incluidos los CRLF que detectan transferencias
  // corruptas en modo texto.
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG.every((byte, i) => bytes[i] === byte)) return "image/png";

  // WebP y AVIF son contenedores: la marca no está al principio.
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return "image/webp";

  if (ascii(bytes, 4, "ftyp")) {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    // `avis` es la secuencia animada; `mif1`/`msf1` son las marcas genéricas
    // de HEIF que usan los AVIF que produce libavif.
    if (["avif", "avis", "mif1", "msf1"].includes(brand)) return "image/avif";
  }

  return null;
}

export interface ImageDimensions {
  width: number;
  height: number;
}

const validDimensions = (
  width: number,
  height: number,
): ImageDimensions | null =>
  Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0
    ? { width, height }
    : null;

const jpegDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
    0xcf,
  ]);
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;

    const length = view.getUint16(offset, false);
    if (length < 2 || offset + length > bytes.length) return null;
    if (startOfFrame.has(marker)) {
      if (length < 7) return null;
      return validDimensions(
        view.getUint16(offset + 5, false),
        view.getUint16(offset + 3, false),
      );
    }
    offset += length;
  }
  return null;
};

const pngDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  if (
    bytes.length < 24 ||
    !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) ||
    !ascii(bytes, 12, "IHDR")
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return validDimensions(view.getUint32(16, false), view.getUint32(20, false));
};

const uint24le = (bytes: Uint8Array, offset: number): number =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

const webpDimensions = (bytes: Uint8Array): ImageDimensions | null => {
  if (
    bytes.length < 20 ||
    !ascii(bytes, 0, "RIFF") ||
    !ascii(bytes, 8, "WEBP")
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    );
    const length = view.getUint32(offset + 4, true);
    const data = offset + 8;
    const end = data + length;
    if (end + (length % 2) > bytes.length) return null;

    if (type === "VP8X" && length === 10) {
      return validDimensions(
        uint24le(bytes, data + 4) + 1,
        uint24le(bytes, data + 7) + 1,
      );
    }
    if (
      type === "VP8 " &&
      length >= 10 &&
      bytes[data + 3] === 0x9d &&
      bytes[data + 4] === 0x01 &&
      bytes[data + 5] === 0x2a
    ) {
      return validDimensions(
        view.getUint16(data + 6, true) & 0x3fff,
        view.getUint16(data + 8, true) & 0x3fff,
      );
    }
    if (type === "VP8L" && length >= 5 && bytes[data] === 0x2f) {
      const bits = view.getUint32(data + 1, true);
      return validDimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    offset = end + (length % 2);
  }
  return null;
};

/**
 * Lee dimensiones desde el contenedor ya saneado, sin decodificar sus píxeles.
 * Esto permite rechazar bombas de descompresión antes de entregarlas a Storage.
 */
export function readImageDimensions(
  bytes: Uint8Array,
  type: string,
): ImageDimensions | null {
  if (type === "image/jpeg") return jpegDimensions(bytes);
  if (type === "image/png") return pngDimensions(bytes);
  if (type === "image/webp") return webpDimensions(bytes);
  return null;
}

export function hasSafeImageDimensions(dimensions: ImageDimensions): boolean {
  const { width, height } = dimensions;
  return (
    width <= MAX_IMAGE_EDGE &&
    height <= MAX_IMAGE_EDGE &&
    width <= MAX_IMAGE_PIXELS / height
  );
}

const copyBytes = (
  target: Uint8Array,
  offset: number,
  source: Uint8Array,
  from: number,
  to: number,
): number => {
  target.set(source.subarray(from, to), offset);
  return offset + (to - from);
};

/**
 * Reconstruye un JPEG conservando sólo sus segmentos necesarios para dibujar.
 * APP1 (EXIF/XMP), comentarios y el resto de APPn —donde cámaras y editores
 * guardan GPS, dispositivo y autor— nunca llegan al resultado.
 */
function sanitizeJpeg(bytes: Uint8Array): Uint8Array | null {
  if (
    bytes.length < 4 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[2] !== 0xff
  ) {
    return null;
  }

  const output = new Uint8Array(bytes.length);
  let read = 2;
  let write = copyBytes(output, 0, bytes, 0, 2);
  let sawScan = false;
  let sawEnd = false;

  while (read < bytes.length) {
    if (bytes[read] !== 0xff) return null;
    const markerStart = read;
    while (read < bytes.length && bytes[read] === 0xff) read += 1;
    if (read >= bytes.length) return null;

    const marker = bytes[read++];
    if (marker === 0x00 || marker === 0xd8) return null;

    if (marker === 0xd9) {
      write = copyBytes(output, write, bytes, markerStart, read);
      sawEnd = true;
      break;
    }

    // TEM y los restart markers no llevan longitud.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      write = copyBytes(output, write, bytes, markerStart, read);
      continue;
    }

    if (read + 2 > bytes.length) return null;
    const segmentLength = (bytes[read] << 8) | bytes[read + 1];
    if (segmentLength < 2) return null;
    const segmentEnd = read + segmentLength;
    if (segmentEnd > bytes.length) return null;

    if (marker === 0xda) {
      sawScan = true;
      write = copyBytes(output, write, bytes, markerStart, segmentEnd);
      read = segmentEnd;

      // Dentro del scan, FF 00 es un byte escapado y FF D0..D7 un restart.
      // Cualquier otro FF empieza el próximo marcador, que vuelve al parser y
      // también queda sujeto al filtro (un APP1 posterior al primer scan no se
      // cuela en un JPEG progresivo).
      const entropyStart = read;
      while (read < bytes.length) {
        if (bytes[read] !== 0xff) {
          read += 1;
          continue;
        }
        const next = bytes[read + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) {
          read += 2;
          continue;
        }
        break;
      }
      write = copyBytes(output, write, bytes, entropyStart, read);
      continue;
    }

    // JFIF (APP0) y Adobe (APP14) pueden afectar la interpretación visual. El
    // resto de APPn, más COM, es metadata y se elimina por allowlist.
    const isApplicationMarker = marker >= 0xe0 && marker <= 0xef;
    const keep =
      marker !== 0xfe &&
      (!isApplicationMarker || marker === 0xe0 || marker === 0xee);
    if (keep) {
      write = copyBytes(output, write, bytes, markerStart, segmentEnd);
    }
    read = segmentEnd;
  }

  return sawScan && sawEnd ? output.slice(0, write) : null;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG_VISUAL_ANCILLARY_CHUNKS = new Set([
  "tRNS",
  "cHRM",
  "gAMA",
  "iCCP",
  "sRGB",
  "sBIT",
  "bKGD",
  // APNG: animación y frames, no metadata personal.
  "acTL",
  "fcTL",
  "fdAT",
]);
const PNG_CRITICAL_CHUNKS = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);

/** Reconstruye PNG/APNG descartando EXIF y todo chunk de texto/fecha/metadata. */
function sanitizePng(bytes: Uint8Array): Uint8Array | null {
  if (
    bytes.length < 20 ||
    !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  ) {
    return null;
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const output = new Uint8Array(bytes.length);
  let read = PNG_SIGNATURE.length;
  let write = copyBytes(output, 0, bytes, 0, PNG_SIGNATURE.length);
  let chunkIndex = 0;
  let sawData = false;
  let sawEnd = false;

  while (read + 12 <= bytes.length) {
    const chunkStart = read;
    const length = view.getUint32(read, false);
    const dataStart = read + 8;
    const chunkEnd = dataStart + length + 4;
    if (chunkEnd > bytes.length) return null;

    const type = String.fromCharCode(
      bytes[read + 4],
      bytes[read + 5],
      bytes[read + 6],
      bytes[read + 7],
    );
    if (!/^[A-Za-z]{4}$/.test(type)) return null;
    if (chunkIndex === 0 && (type !== "IHDR" || length !== 13)) return null;

    if (type === "IDAT" || type === "fdAT") sawData = true;
    const keep =
      PNG_CRITICAL_CHUNKS.has(type) || PNG_VISUAL_ANCILLARY_CHUNKS.has(type);
    if (keep) {
      write = copyBytes(output, write, bytes, chunkStart, chunkEnd);
    }

    read = chunkEnd;
    chunkIndex += 1;
    if (type === "IEND") {
      if (length !== 0) return null;
      sawEnd = true;
      break;
    }
  }

  // No se copian bytes posteriores a IEND: además de no ser parte del PNG,
  // son otra vía habitual para adjuntar contenido oculto.
  return sawData && sawEnd ? output.slice(0, write) : null;
}

const WEBP_VISUAL_CHUNKS = new Set([
  "VP8 ",
  "VP8L",
  "VP8X",
  "ALPH",
  "ICCP",
  "ANIM",
  "ANMF",
]);

/** Reconstruye RIFF/WebP por allowlist y limpia los flags EXIF/XMP de VP8X. */
function sanitizeWebp(bytes: Uint8Array): Uint8Array | null {
  if (
    bytes.length < 20 ||
    !ascii(bytes, 0, "RIFF") ||
    !ascii(bytes, 8, "WEBP")
  ) {
    return null;
  }

  const source = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (source.getUint32(4, true) + 8 !== bytes.length) return null;

  const output = new Uint8Array(bytes.length);
  let write = copyBytes(output, 0, bytes, 0, 12);
  let read = 12;
  let sawPixels = false;

  while (read + 8 <= bytes.length) {
    const chunkStart = read;
    const type = String.fromCharCode(
      bytes[read],
      bytes[read + 1],
      bytes[read + 2],
      bytes[read + 3],
    );
    const length = source.getUint32(read + 4, true);
    const dataStart = read + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + (length % 2);
    if (chunkEnd > bytes.length) return null;

    if (type === "VP8 " || type === "VP8L" || type === "ANMF") {
      sawPixels = true;
    }
    if (WEBP_VISUAL_CHUNKS.has(type)) {
      const outputChunkStart = write;
      write = copyBytes(output, write, bytes, chunkStart, chunkEnd);
      if (type === "VP8X") {
        if (length !== 10) return null;
        // EXIF = 0x08, XMP = 0x04 en el byte de features de VP8X.
        output[outputChunkStart + 8] &= ~(0x08 | 0x04);
      }
    }
    read = chunkEnd;
  }

  if (read !== bytes.length || !sawPixels) return null;
  new DataView(output.buffer).setUint32(4, write - 8, true);
  return output.slice(0, write);
}

/**
 * Sanea bytes antes de Storage. Devuelve un contenedor nuevo sin EXIF, XMP,
 * comentarios, texto ni bytes anexados; `null` indica estructura no confiable.
 */
export function sanitizeImageMetadata(
  bytes: Uint8Array,
  type: string,
): Uint8Array | null {
  if (type === "image/jpeg") return sanitizeJpeg(bytes);
  if (type === "image/png") return sanitizePng(bytes);
  if (type === "image/webp") return sanitizeWebp(bytes);
  return null;
}

export interface UploadResult {
  url: string | null;
  path: string | null;
  error: string | null;
}

export interface UploadImagesResult {
  uploads: { url: string; path: string }[];
  error: string | null;
}

/**
 * Sube una imagen al bucket indicado.
 *
 * Avatares conservan `<user_id>/<uuid>.<ext>`. Evidencia usa el namespace opaco
 * `pending/<uuid>.<ext>` y reserva ese path en DB antes de tocar Storage: la
 * policy rechaza cualquier objeto que no esté rastreado y rate-limited.
 *
 * Devuelve `{url: null, path: null, error: null}` cuando no se adjuntó nada: la imagen es
 * opcional en todos los formularios.
 */
export async function uploadImage(
  db: DB,
  bucket: "avatars" | "claims",
  userId: string,
  file: unknown,
  maxBytes: number,
  locale: Locale = DEFAULT_LOCALE,
  maxEdge: number = MAX_IMAGE_EDGE,
): Promise<UploadResult> {
  // Un input de archivo vacío llega igual, con size 0.
  if (!(file instanceof Blob) || file.size === 0) {
    return { url: null, path: null, error: null };
  }

  if (!isUuid(userId)) {
    return {
      url: null,
      path: null,
      error: translate(locale, "No pudimos subir la imagen. Probá con otra."),
    };
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      url: null,
      path: null,
      error: translate(locale, "La imagen tiene que ser JPG, PNG o WebP."),
    };
  }

  if (file.size > maxBytes) {
    return {
      url: null,
      path: null,
      error: translate(
        locale,
        "La imagen no puede pesar más de {{count}} MB.",
        {
          count: Math.round(maxBytes / 1024 / 1024),
        },
      ),
    };
  }

  // El tipo real, leído del archivo. Se comprueba después del tamaño para no
  // bajarle los primeros bytes a algo que ya sabemos que se rechaza.
  const sourceBytes = new Uint8Array(await file.arrayBuffer());
  const detected = sniffImageType(sourceBytes.subarray(0, SIGNATURE_BYTES));

  if (!detected || !ALLOWED_TYPES.includes(detected)) {
    return {
      url: null,
      path: null,
      error: translate(
        locale,
        "Ese archivo no es una imagen JPG, PNG ni WebP.",
      ),
    };
  }

  const sanitizedBytes = sanitizeImageMetadata(sourceBytes, detected);
  const dimensions = sanitizedBytes
    ? readImageDimensions(sanitizedBytes, detected)
    : null;
  if (
    !sanitizedBytes ||
    !dimensions ||
    !hasSafeImageDimensions(dimensions) ||
    dimensions.width > maxEdge ||
    dimensions.height > maxEdge
  ) {
    return {
      url: null,
      path: null,
      error: translate(
        locale,
        "No pudimos procesar esa imagen de forma segura. Probá con un JPG, PNG o WebP.",
      ),
    };
  }

  const sanitizedFile = new Blob([sanitizedBytes.buffer as ArrayBuffer], {
    type: detected,
  });

  // De acá en adelante manda `detected`, no `file.type`: la extensión guardada
  // y el `Content-Type` con el que se sirve el archivo salen de lo que el
  // archivo es, no de lo que el cliente dijo que era.
  const path =
    bucket === "claims"
      ? `pending/${crypto.randomUUID()}.${EXTENSIONS[detected]}`
      : `${userId}/${crypto.randomUUID()}.${EXTENSIONS[detected]}`;

  if (bucket === "claims") {
    const { error: reservationError } = await db.rpc("reserve_claim_upload", {
      p_owner: userId,
      p_path: path,
    });
    if (reservationError) {
      // Un tope (12 pendientes, 20 por hora) no se arregla reintentando.
      return {
        url: null,
        path: null,
        error: translate(
          locale,
          limitMessage(reservationError) ??
            "No pudimos preparar la imagen. Probá de nuevo.",
        ),
      };
    }
  } else {
    const { error: reservationError } = await db.rpc("reserve_avatar_upload", {
      p_owner: userId,
      p_path: path,
    });
    if (reservationError) {
      return {
        url: null,
        path: null,
        error: translate(
          locale,
          "No pudimos preparar la imagen. Probá de nuevo.",
        ),
      };
    }
  }

  const { error } = await db.storage.from(bucket).upload(path, sanitizedFile, {
    contentType: detected,
    cacheControl: bucket === "claims" ? "0" : "31536000",
    upsert: false,
  });

  if (error) {
    // Las RPC sólo liberan si confirman que no quedó un objeto: un timeout que
    // sí alcanzó Storage continúa rastreado y lo recogerá el cron.
    if (bucket === "claims") {
      await db.rpc("release_claim_upload", { p_owner: userId, p_path: path });
    } else {
      await db.rpc("release_avatar_upload", { p_owner: userId, p_path: path });
    }
    return {
      url: null,
      path: null,
      error: translate(locale, "No pudimos subir la imagen. Probá con otra."),
    };
  }

  if (bucket === "claims") {
    const { data: finalized, error: finalizeError } = await db.rpc(
      "finalize_claim_upload",
      { p_owner: userId, p_path: path },
    );
    if (finalizeError || finalized !== true) {
      // Una baja pudo empezar mientras Storage recibía el cuerpo. Sin el sello
      // DB el objeto no se publica: se retira y la reserva sólo desaparece una
      // vez que Storage confirma que ya no existe.
      await db.storage.from(bucket).remove([path]);
      await db.rpc("release_claim_upload", { p_owner: userId, p_path: path });
      return {
        url: null,
        path: null,
        error: translate(locale, "No pudimos subir la imagen. Probá con otra."),
      };
    }
  } else {
    const { data: finalized, error: finalizeError } = await db.rpc(
      "finalize_avatar_upload",
      { p_owner: userId, p_path: path },
    );
    if (finalizeError || finalized !== true) {
      await db.storage.from(bucket).remove([path]);
      await db.rpc("release_avatar_upload", {
        p_owner: userId,
        p_path: path,
      });
      return {
        url: null,
        path: null,
        error: translate(locale, "No pudimos subir la imagen. Probá con otra."),
      };
    }
  }

  const usableUrl =
    bucket === "claims"
      ? claimDraftMediaUrl(path)
      : canonicalPublicUploadUrl(db, bucket, path, userId);
  if (!usableUrl) {
    await db.storage.from(bucket).remove([path]);
    if (bucket === "claims") {
      await db.rpc("release_claim_upload", { p_owner: userId, p_path: path });
    } else {
      await db.rpc("release_avatar_upload", {
        p_owner: userId,
        p_path: path,
      });
    }
    return {
      url: null,
      path: null,
      error: translate(locale, "No pudimos subir la imagen. Probá con otra."),
    };
  }

  return {
    url: usableUrl,
    path,
    error: null,
  };
}

/** Sube un grupo chico de imágenes y limpia las ya subidas si una falla. */
export async function uploadImages(
  db: DB,
  bucket: "claims",
  userId: string,
  files: unknown,
  maxBytes: number,
  maxFiles: number,
  locale: Locale = DEFAULT_LOCALE,
): Promise<UploadImagesResult> {
  const values = Array.isArray(files)
    ? files
    : files instanceof Blob
      ? [files]
      : [];
  const images = values.filter(
    (file): file is Blob => file instanceof Blob && file.size > 0,
  );

  if (images.length > maxFiles) {
    return {
      uploads: [],
      error: translate(locale, "Podés adjuntar hasta {{count}} imágenes.", {
        count: maxFiles,
      }),
    };
  }

  const uploads: { url: string; path: string }[] = [];
  for (const image of images) {
    const result = await uploadImage(
      db,
      bucket,
      userId,
      image,
      maxBytes,
      locale,
    );
    if (result.error || !result.url || !result.path) {
      if (uploads.length > 0) {
        const paths = uploads.map((upload) => upload.path);
        await db.storage.from(bucket).remove(paths);
        await Promise.all(
          paths.map((path) =>
            db.rpc("release_claim_upload", { p_owner: userId, p_path: path }),
          ),
        );
      }
      return {
        uploads: [],
        error:
          result.error ?? translate(locale, "No pudimos subir las imágenes."),
      };
    }
    uploads.push({ url: result.url, path: result.path });
  }

  return { uploads, error: null };
}
