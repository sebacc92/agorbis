import { describe, expect, it } from "vitest";
import { readZipEntry } from "../../scripts/zip-entry.mjs";
import { buildTestZip } from "./test-zip";

describe("readZipEntry", () => {
  const archive = buildTestZip([
    { name: "a/guardado.txt", text: "sin comprimir", method: 0 },
    { name: "b/comprimido.xml", text: "<x>ñandutí</x>".repeat(20), method: 8 },
  ]);

  it("lee una entrada guardada y una comprimida con deflate", () => {
    expect(readZipEntry(archive, "a/guardado.txt").toString()).toBe(
      "sin comprimir",
    );
    expect(readZipEntry(archive, "b/comprimido.xml").toString()).toBe(
      "<x>ñandutí</x>".repeat(20),
    );
  });

  it("falla si la entrada no existe o el archivo no es un zip", () => {
    expect(() => readZipEntry(archive, "c/otra.txt")).toThrow(/no trae/);
    expect(() => readZipEntry(Buffer.from("hola"), "a")).toThrow(/no es un zip/);
  });
});
