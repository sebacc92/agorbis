import { MAX_CLAIM_IMAGES } from "./constants";
import { reencodeImageForPrivateUpload } from "./client-image-privacy";

export interface PreparedClaimImage {
  file: File;
  originalSize: number;
}

/** Cada lote se suma en orden; un archivo inválido no borra los ya preparados. */
export async function addClaimImages(
  previous: readonly PreparedClaimImage[],
  incoming: readonly File[],
  encode: (file: File) => Promise<File> = reencodeImageForPrivateUpload,
) {
  const available = Math.max(0, MAX_CLAIM_IMAGES - previous.length);
  const candidates = incoming.slice(0, available);
  const prepared = await Promise.allSettled(
    candidates.map(async (file) => ({
      file: await encode(file),
      originalSize: file.size,
    })),
  );
  const additions = prepared.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  return {
    images: [...previous, ...additions],
    added: additions.length,
    ignored: incoming.length - candidates.length,
    failed: prepared.length - additions.length,
  };
}
