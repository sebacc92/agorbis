// Lee una entrada de un zip sin dependencias: los generadores de nivel 4 sólo
// necesitan un archivo de adentro (el .dbf de Chile, las hojas de un XLSX).
import zlib from "node:zlib";

/** Lee una entrada de un zip (sin cifrar, guardada o deflate). */
export function readZipEntry(
  /** @type {Buffer} */ zip,
  /** @type {string} */ name,
) {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd === -1) throw new Error("El archivo no es un zip");
  const entries = zip.readUInt16LE(eocd + 10);
  let at = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i += 1) {
    if (zip.readUInt32LE(at) !== 0x02014b50) {
      throw new Error("Directorio central del zip dañado");
    }
    const method = zip.readUInt16LE(at + 10);
    const compressed = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const entryName = zip.toString("utf8", at + 46, at + 46 + nameLength);
    if (entryName === name) {
      const start =
        local +
        30 +
        zip.readUInt16LE(local + 26) +
        zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error(`Compresión ${method} no soportada en ${name}`);
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`El zip no trae ${name}`);
}
