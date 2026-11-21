import { describe, expect, it, vi } from "vitest";
import { addClaimImages } from "./claim-image-selection";

const image = (name: string) => new File([`pixels-${name}`], name, { type: "image/png" });

describe("adiciones seguras a las fotos de un reclamo", () => {
  it("suma lotes sin perder portada ni orden y limita el total a cuatro antes de procesar", async () => {
    const encode = vi.fn(async (file: File) => new File(["safe pixels"], `${file.name}.webp`, { type: "image/webp" }));
    const first = await addClaimImages([], [image("portada"), image("segunda")], encode);
    const result = await addClaimImages(first.images, [image("tercera"), image("cuarta"), image("quinta")], encode);
    expect(result.images.map((entry) => entry.file.name)).toEqual(["portada.webp", "segunda.webp", "tercera.webp", "cuarta.webp"]);
    expect(result.images[0]).toBe(first.images[0]);
    expect(result.images[1]).toBe(first.images[1]);
    expect(result).toMatchObject({ added: 2, ignored: 1, failed: 0 });
    expect(encode).toHaveBeenCalledTimes(4);
    expect(first.images).toHaveLength(2);
  });
  it("conserva las fotos previas y las nuevas válidas cuando otro archivo falla", async () => {
    const previous = [{ file: image("portada"), originalSize: 500 }];
    const encode = vi.fn(async (file: File) => {
      if (file.name === "invalida") throw new Error("cannot decode image");
      return new File(["safe pixels"], `${file.name}.webp`, { type: "image/webp" });
    });
    const result = await addClaimImages(previous, [image("invalida"), image("valida")], encode);
    expect(result).toMatchObject({ added: 1, ignored: 0, failed: 1 });
    expect(result.images[0]).toBe(previous[0]);
    expect(result.images.map((entry) => entry.file.name)).toEqual(["portada", "valida.webp"]);
    expect(result.images[1].originalSize).toBe(image("valida").size);
  });
  it("cancelar el selector o intentar sumar sobre cuatro no modifica la selección", async () => {
    const previous = Array.from({ length: 4 }, (_, index) => ({ file: image(String(index)), originalSize: 500 }));
    const encode = vi.fn();
    expect(await addClaimImages(previous, [], encode)).toEqual({ images: previous, added: 0, ignored: 0, failed: 0 });
    expect(await addClaimImages(previous, [image("quinta")], encode)).toEqual({ images: previous, added: 0, ignored: 1, failed: 0 });
    expect(encode).not.toHaveBeenCalled();
  });
});
