import { MAX_CLAIM_IMAGE_BYTES } from "./constants";

const CLIENT_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_CLIENT_IMAGE_EDGE = 2560;
const MIN_CLIENT_IMAGE_EDGE = 640;
const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
const WEBP_QUALITIES = [0.86, 0.76, 0.66, 0.56, 0.46] as const;

function canvasBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encodeWithinLimit(
  source: ImageBitmap,
  initialWidth: number,
  initialHeight: number,
  maxBytes: number,
): Promise<Blob | null> {
  let width = initialWidth;
  let height = initialHeight;

  while (true) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return null;
    context.drawImage(source, 0, 0, width, height);

    for (const quality of WEBP_QUALITIES) {
      const blob = await canvasBlob(canvas, "image/webp", quality);
      if (blob?.type === "image/webp" && blob.size <= maxBytes) return blob;
    }

    const longest = Math.max(width, height);
    if (longest <= MIN_CLIENT_IMAGE_EDGE) return null;
    const scale = Math.max(MIN_CLIENT_IMAGE_EDGE / longest, 0.8);
    width = Math.max(1, Math.floor(width * scale));
    height = Math.max(1, Math.floor(height * scale));
  }
}

/**
 * Re-encodea los píxeles en el navegador antes del multipart.
 *
 * `createImageBitmap` aplica la orientación de cámara y Canvas produce un
 * archivo nuevo sin EXIF/XMP/GPS. El servidor reconstruye otra vez el
 * contenedor por allowlist: este paso mejora privacidad, orientación y tamaño,
 * pero la garantía no depende de confiar en JavaScript del cliente.
 */
export async function reencodeImageForPrivateUpload(
  file: File,
  maxEdge = MAX_CLIENT_IMAGE_EDGE,
  maxBytes = MAX_CLAIM_IMAGE_BYTES,
): Promise<File> {
  if (!CLIENT_IMAGE_TYPES.has(file.type)) {
    throw new Error("unsupported image type");
  }
  if (file.size < 1 || file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("unsafe source image size");
  }

  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    if (bitmap.width < 1 || bitmap.height < 1) {
      throw new Error("invalid image dimensions");
    }

    const scale = Math.min(
      1,
      Math.max(1, Math.min(MAX_CLIENT_IMAGE_EDGE, maxEdge)) /
        Math.max(bitmap.width, bitmap.height),
    );
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const blob = await encodeWithinLimit(
      bitmap,
      width,
      height,
      Math.max(1, Math.min(maxBytes, MAX_CLAIM_IMAGE_BYTES)),
    );
    if (!blob || blob.type !== "image/webp") {
      throw new Error("image encoding failed");
    }
    const stem = file.name.replace(/\.[^.]+$/, "") || "imagen";
    return new File([blob], `${stem}.webp`, {
      type: blob.type,
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}
