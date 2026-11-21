import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_CLAIM_IMAGE_BYTES } from "./constants";
import { reencodeImageForPrivateUpload } from "./client-image-privacy";

afterEach(() => vi.unstubAllGlobals());

describe("client image privacy", () => {
  it("reconstruye WebP dentro del límite, reduce dimensiones y cierra el bitmap", async () => {
    const close = vi.fn();
    const drawImage = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 4_000, height: 2_000, close })),
    );
    vi.stubGlobal("document", {
      createElement: () => {
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage }),
          toBlob: (
            callback: (blob: Blob | null) => void,
            type: string,
            quality: number,
          ) => {
            const bytes = Math.ceil(
              canvas.width * canvas.height * quality * 0.5,
            );
            callback(new Blob([new Uint8Array(bytes)], { type }));
          },
        };
        return canvas;
      },
    });

    const original = new File([new Uint8Array(32)], "calle-con-gps.jpg", {
      type: "image/jpeg",
    });
    const safe = await reencodeImageForPrivateUpload(original);

    expect(safe.name).toBe("calle-con-gps.webp");
    expect(safe.type).toBe("image/webp");
    expect(safe.size).toBeLessThanOrEqual(MAX_CLAIM_IMAGE_BYTES);
    expect(drawImage).toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  it("rechaza tipo y tamaño fuente antes de decodificar", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);

    await expect(
      reencodeImageForPrivateUpload(
        new File([new Uint8Array(16)], "evidencia.gif", {
          type: "image/gif",
        }),
      ),
    ).rejects.toThrow("unsupported image type");
    await expect(
      reencodeImageForPrivateUpload(
        new File([], "evidencia.webp", { type: "image/webp" }),
      ),
    ).rejects.toThrow("unsafe source image size");
    expect(decode).not.toHaveBeenCalled();
  });
});
