import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { DB } from "./supabase";
import {
  hasSafeImageDimensions,
  MAX_IMAGE_EDGE,
  readImageDimensions,
  sanitizeImageMetadata,
  sniffImageType,
  uploadImage,
} from "./uploads";

const asciiBytes = (value: string) =>
  Uint8Array.from([...value].map((char) => char.charCodeAt(0)));

const concat = (...parts: Uint8Array[]) => {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const jpegSegment = (marker: number, data: Uint8Array) => {
  const output = new Uint8Array(data.length + 4);
  output.set([0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff]);
  output.set(data, 4);
  return output;
};

const jpegWithPrivateMetadata = () =>
  concat(
    Uint8Array.of(0xff, 0xd8),
    jpegSegment(0xe0, asciiBytes("JFIF")),
    jpegSegment(0xe1, asciiBytes("Exif\0\0GPSLatitude=-38.0055274")),
    jpegSegment(0xfe, asciiBytes("camera-owner=persona")),
    // Scan mínimo para probar también metadata colocada después del scan.
    jpegSegment(0xda, new Uint8Array()),
    Uint8Array.of(0x11, 0xff, 0x00, 0x22),
    jpegSegment(0xe1, asciiBytes("http://ns.adobe.com/xap/1.0/ precise-gps")),
    Uint8Array.of(0xff, 0xd9),
  );

const pngChunk = (type: string, data: Uint8Array) => {
  const output = new Uint8Array(data.length + 12);
  new DataView(output.buffer).setUint32(0, data.length, false);
  output.set(asciiBytes(type), 4);
  output.set(data, 8);
  // El sanitizer conserva el CRC original sin interpretar la imagen; para
  // esta prueba estructural alcanza un valor de relleno.
  return output;
};

const pngWithPrivateMetadata = () =>
  concat(
    Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    pngChunk("IHDR", new Uint8Array(13)),
    pngChunk("eXIf", asciiBytes("GPSLongitude=-57.5426107")),
    pngChunk("iTXt", asciiBytes("XML:com.adobe.xmp precise-location")),
    pngChunk("IDAT", Uint8Array.of(1, 2, 3)),
    pngChunk("IEND", new Uint8Array()),
    asciiBytes("trailing-private-data"),
  );

const webpChunk = (type: string, data: Uint8Array) => {
  const output = new Uint8Array(8 + data.length + (data.length % 2));
  output.set(asciiBytes(type), 0);
  new DataView(output.buffer).setUint32(4, data.length, true);
  output.set(data, 8);
  return output;
};

const webpWithPrivateMetadata = () => {
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x0c; // flags EXIF + XMP
  const chunks = concat(
    webpChunk("VP8X", vp8x),
    webpChunk("EXIF", asciiBytes("GPSLatitude=-38")),
    webpChunk("XMP ", asciiBytes("precise-location")),
    webpChunk("VP8 ", Uint8Array.of(1, 2, 3, 4)),
  );
  const output = concat(asciiBytes("RIFF"), new Uint8Array(4), asciiBytes("WEBP"), chunks);
  new DataView(output.buffer).setUint32(4, output.length - 8, true);
  return output;
};

const decoded = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("saneamiento de metadata de imágenes", () => {
  it("mantiene imágenes reales decodificables y sin EXIF", async () => {
    const base = () =>
      sharp({
        create: {
          width: 24,
          height: 16,
          channels: 4,
          background: { r: 20, g: 120, b: 200, alpha: 0.8 },
        },
      });
    const exif = {
      IFD0: { Artist: "persona-identificable" },
      IFD3: { GPSLatitudeRef: "S", GPSLatitude: "38/1 0/1 0/1" },
    };
    const cases = [
      {
        type: "image/jpeg",
        source: await base().jpeg().withExif(exif).toBuffer(),
      },
      {
        type: "image/png",
        source: await base().png().withExif(exif).toBuffer(),
      },
      {
        type: "image/webp",
        source: await base().webp().withExif(exif).toBuffer(),
      },
    ];

    for (const { type, source } of cases) {
      expect((await sharp(source).metadata()).exif).toBeDefined();
      const sanitized = sanitizeImageMetadata(source, type);
      expect(sanitized, type).not.toBeNull();

      const metadata = await sharp(sanitized!).metadata();
      expect(metadata.exif, type).toBeUndefined();
      expect(metadata.width, type).toBe(24);
      expect(metadata.height, type).toBe(16);
    }
  });

  it("reconstruye JPEG sin EXIF, XMP ni comentarios, incluso tras un scan", () => {
    const source = jpegWithPrivateMetadata();
    const sanitized = sanitizeImageMetadata(source, "image/jpeg");

    expect(sanitized).not.toBeNull();
    expect(sniffImageType(sanitized!)).toBe("image/jpeg");
    expect(decoded(sanitized!)).toContain("JFIF");
    expect(decoded(sanitized!)).not.toMatch(/Exif|GPS|camera-owner|xap/i);
    expect(sanitized!.length).toBeLessThan(source.length);
  });

  it("elimina EXIF/texto y bytes posteriores a IEND de PNG", () => {
    const source = pngWithPrivateMetadata();
    const sanitized = sanitizeImageMetadata(source, "image/png");

    expect(sanitized).not.toBeNull();
    expect(sniffImageType(sanitized!)).toBe("image/png");
    expect(decoded(sanitized!)).not.toMatch(/eXIf|iTXt|GPS|location|trailing/i);
    expect(sanitized!.length).toBeLessThan(source.length);
  });

  it("elimina chunks EXIF/XMP y limpia sus flags en WebP", () => {
    const source = webpWithPrivateMetadata();
    const sanitized = sanitizeImageMetadata(source, "image/webp");

    expect(sanitized).not.toBeNull();
    expect(sniffImageType(sanitized!)).toBe("image/webp");
    expect(decoded(sanitized!)).not.toMatch(/EXIF|XMP |GPS|location/i);
    // RIFF(12) + header del chunk VP8X(8) = byte de flags.
    expect(sanitized![20] & 0x0c).toBe(0);
    expect(new DataView(sanitized!.buffer).getUint32(4, true) + 8).toBe(
      sanitized!.length,
    );
  });

  it("nunca entrega a Storage el Blob original con GPS", async () => {
    let stored: Blob | null = null;
    const db = {
      rpc: async () => ({ data: true, error: null }),
      storage: {
        from: () => ({
          upload: async (_path: string, body: Blob) => {
            stored = body;
            return { error: null };
          },
          getPublicUrl: (path: string) => ({
            data: {
              publicUrl: `https://storage.example/storage/v1/object/public/claims/${path}`,
            },
          }),
          remove: async () => ({ error: null }),
        }),
      },
    } as unknown as DB;
    const source = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 3,
        background: { r: 20, g: 120, b: 200 },
      },
    })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: "S" } })
      .toBuffer();

    const result = await uploadImage(
      db,
      "claims",
      "123e4567-e89b-42d3-a456-426614174000",
      new Blob([source.buffer as ArrayBuffer], { type: "image/jpeg" }),
      5 * 1024 * 1024,
      "es",
    );

    expect(result.error).toBeNull();
    expect(stored).not.toBeNull();
    expect(await stored!.text()).not.toMatch(/Exif|GPS|camera-owner|xap/i);
  });

  it("lee dimensiones reales de JPG, PNG y WebP sin decodificar píxeles", async () => {
    const variants = [
      ["image/jpeg", await sharp({ create: { width: 31, height: 17, channels: 3, background: "red" } }).jpeg().toBuffer()],
      ["image/png", await sharp({ create: { width: 31, height: 17, channels: 3, background: "red" } }).png().toBuffer()],
      ["image/webp", await sharp({ create: { width: 31, height: 17, channels: 3, background: "red" } }).webp().toBuffer()],
    ] as const;

    for (const [type, source] of variants) {
      const sanitized = sanitizeImageMetadata(source, type);
      expect(sanitized, type).not.toBeNull();
      expect(readImageDimensions(sanitized!, type), type).toEqual({
        width: 31,
        height: 17,
      });
    }
  });

  it("rechaza dimensiones declaradas excesivas antes de tocar Storage", async () => {
    const ihdr = new Uint8Array(13);
    new DataView(ihdr.buffer).setUint32(0, MAX_IMAGE_EDGE + 1, false);
    new DataView(ihdr.buffer).setUint32(4, 2, false);
    const source = concat(
      Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      pngChunk("IHDR", ihdr),
      pngChunk("IDAT", Uint8Array.of(1)),
      pngChunk("IEND", new Uint8Array()),
    );
    const dimensions = readImageDimensions(source, "image/png");
    expect(dimensions).toEqual({ width: MAX_IMAGE_EDGE + 1, height: 2 });
    expect(hasSafeImageDimensions(dimensions!)).toBe(false);

    let uploaded = false;
    const db = {
      rpc: async () => ({ data: true, error: null }),
      storage: {
        from: () => ({
          upload: async () => {
            uploaded = true;
            return { error: null };
          },
        }),
      },
    } as unknown as DB;
    const result = await uploadImage(
      db,
      "claims",
      "123e4567-e89b-42d3-a456-426614174000",
      new Blob([source.buffer as ArrayBuffer], { type: "image/png" }),
      5 * 1024 * 1024,
      "es",
    );
    expect(result.error).not.toBeNull();
    expect(uploaded).toBe(false);
  });

  it("retira el objeto si una baja bloquea el sello final de la reserva", async () => {
    const source = await sharp({
      create: {
        width: 24,
        height: 16,
        channels: 3,
        background: "red",
      },
    })
      .jpeg()
      .toBuffer();
    const calls: string[] = [];
    let removed = false;
    const db = {
      rpc: async (name: string) => {
        calls.push(name);
        return {
          data: name !== "finalize_claim_upload",
          error: null,
        };
      },
      storage: {
        from: () => ({
          upload: async () => ({ error: null }),
          remove: async () => {
            removed = true;
            return { error: null };
          },
        }),
      },
    } as unknown as DB;

    const result = await uploadImage(
      db,
      "claims",
      "123e4567-e89b-42d3-a456-426614174000",
      new Blob([source.buffer as ArrayBuffer], { type: "image/jpeg" }),
      5 * 1024 * 1024,
      "es",
    );

    expect(result.path).toBeNull();
    expect(result.error).not.toBeNull();
    expect(removed).toBe(true);
    expect(calls).toEqual([
      "reserve_claim_upload",
      "finalize_claim_upload",
      "release_claim_upload",
    ]);
  });

  it("rechaza formatos sin un saneamiento garantizado", () => {
    expect(sanitizeImageMetadata(new Uint8Array(32), "image/avif")).toBeNull();
  });
});
