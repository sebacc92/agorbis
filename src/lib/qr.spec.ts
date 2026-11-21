import { describe, expect, it } from "vitest";
import { encodeQr, qrSvgFor, qrToSvg, type QrMatrix } from "./qr";

/**
 * Vectores dorados generados con `python-qrcode` 7.4.2 (implementación
 * independiente, ampliamente usada), en modo byte, corrección M, borde 0 y
 * máscara fija. Antes de escribir este spec se compararon además 352 matrices
 * —versiones 1 a 40, niveles L/M/Q/H, las ocho máscaras, UTF-8— y coincidieron
 * módulo por módulo. Cada fila está en hexadecimal: el bit más alto a la
 * izquierda es la columna 0.
 *
 * Se fija la máscara porque la elección automática de `python-qrcode` no sigue
 * al pie de la letra la penalización de la norma; cualquier máscara produce un
 * QR válido, así que la diferencia no afecta la lectura.
 */
const GOLDEN: { text: string; mask: number; version: number; rows: string[] }[] = [
  {
    text: "https://agorbis.com/reclamos/3f2b8c1e-9d4a-4b7e-8f21-6a5c0d9e7b13",
    mask: 3,
    version: 5,
    rows: [
      "1fdc4dd97f",
      "10559b3841",
      "174b91095d",
      "17510b5e5d",
      "17489b965d",
      "1042d28c41",
      "1fd555557f",
      "001b6fb600",
      "16e293204b",
      "053430048a",
      "02ef204d84",
      "1c8ee63fa4",
      "02464c7fd7",
      "1e9db61ffb",
      "127b9e5816",
      "0f117ef6f1",
      "09f09d2aac",
      "130e13826f",
      "08e1b64fd7",
      "1dbcce417a",
      "1c74cd85b1",
      "119186610a",
      "176649f062",
      "0a2845df9e",
      "0fcee5cb56",
      "0a2e9d0a7b",
      "087f77dcee",
      "1701d0d69b",
      "06e721adf6",
      "001ee97915",
      "1fdb799d55",
      "1055834310",
      "1745a655f8",
      "17572d7bd5",
      "17541fe858",
      "1046552cb4",
      "1fd5ff0c17",
    ],
  },
  {
    text: "https://agorbis.com/c/mar-del-plata?ref=afiche&campa%C3%B1a=primavera-2026&origen=impreso-en-papel",
    mask: 5,
    version: 6,
    rows: [
      "1fc55c1847f",
      "105a74d1841",
      "1752521325d",
      "175db419c5d",
      "1744132965d",
      "10451551541",
      "1fd5555557f",
      "0017f155000",
      "105fda3c8ce",
      "08357262e32",
      "1cdaa5c29b2",
      "10327566319",
      "0740b152160",
      "08b52d13bfb",
      "107aa61b59a",
      "129f424439e",
      "1ed8bb2c9a6",
      "19b7ef73ff1",
      "0044a2ffb31",
      "1506af77010",
      "11c9029f824",
      "088e96a3638",
      "1dc3ed4a8b8",
      "078c94771a9",
      "155b07373cb",
      "14a2d7236d9",
      "01f8454ed80",
      "069d827761f",
      "13ee4f5eb2c",
      "150b1422f7c",
      "1b5c222fa9d",
      "13002007162",
      "1759b8099f4",
      "001e56f671c",
      "1fc7d443358",
      "1049738031a",
      "174e0f933fc",
      "174f1b2be25",
      "1748450fbf8",
      "104e131425d",
      "1fd6c83fa34",
    ],
  },
  {
    text: "https://agorbis.com/proyectos/0b7f1c2a-5e3d-4c8b-9a61-2f4e7d9c0a15?utm=no&texto=Plaza+del+barrio+con+%C3%A1rboles+nativos+y+bancos+nuevos",
    mask: 6,
    version: 8,
    rows: [
      "1fd39be24c17f",
      "105862df85741",
      "1750891470b5d",
      "174ef1e933a5d",
      "175946fd6285d",
      "1041f14593441",
      "1fd555555557f",
      "000f1cc7ece00",
      "13f7bf7f45e97",
      "0718b14f677e2",
      "06617eca3712b",
      "1293d0c8f649d",
      "045ff19517290",
      "0010573cfa472",
      "01d7645521d27",
      "1405ed474258d",
      "1ecf6e1a35356",
      "06afb2f3dcbce",
      "1666cd1bd8b1d",
      "149a118ca0188",
      "1de641b1a3662",
      "0a93cb97eefee",
      "1df8e8fc2e9f1",
      "051e9ac6b4d1d",
      "1f5c24d77b759",
      "0713abc6d8d18",
      "07fead7f0b7fd",
      "1f1f0d5ea6f1f",
      "1361dd143d7cf",
      "0b2bfb7e7d92e",
      "09da821f829ed",
      "0b8bd8988cf1b",
      "1147df240b388",
      "1f9567d8befbc",
      "17d799ddf71f9",
      "0f0dc77c9a3bc",
      "18c6120753a62",
      "142efb37d9658",
      "08f9c9723afd7",
      "0e2fbeb44e215",
      "1c5ac07c3fff5",
      "001cc6c5c5b1a",
      "1fd7e1d713951",
      "10567345a0710",
      "1758e07d2b1f1",
      "17567d2b7ce61",
      "1743ef70af072",
      "1044b88fdee4f",
      "1fd7124f55a31",
    ],
  },
];

function toHexRows(matrix: QrMatrix): string[] {
  const width = Math.ceil(matrix.size / 4);
  return matrix.modules.map((row) =>
    BigInt("0b" + row.map((dark) => (dark ? "1" : "0")).join(""))
      .toString(16)
      .padStart(width, "0"),
  );
}

// ---- Lector mínimo, independiente del codificador ----
//
// No reutiliza nada de `qr.ts`: reconstruye por su cuenta la zona de función,
// lee el zigzag, quita la máscara, verifica Reed-Solomon con síndromes (otra
// cuenta que la división que usa el codificador) y parsea el segmento byte.
// Alcanza para las versiones 1-6 con corrección M, que es lo que imprime
// Agorbis para URLs de reclamos y proyectos.

const GF_EXP: number[] = [];
const GF_LOG: number[] = new Array<number>(256).fill(0);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
}
const gfMul = (a: number, b: number) =>
  a === 0 || b === 0 ? 0 : GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];

/** Bloques (cantidad, codewords de datos, de corrección) para M, v1-6. */
const M_BLOCKS: Record<number, [number, number, number]> = {
  1: [1, 16, 10],
  2: [1, 28, 16],
  3: [1, 44, 26],
  4: [2, 32, 18],
  5: [2, 43, 24],
  6: [4, 27, 16],
};

/** Tabla de información de formato de la norma para el nivel M. */
const FORMAT_M = [
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
];

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function decodeSmallM(matrix: QrMatrix): string {
  const { size, modules } = matrix;
  const version = (size - 17) / 4;
  const blocksInfo = M_BLOCKS[version];
  if (!blocksInfo) throw new Error(`versión ${version} fuera del lector`);

  // Formato: segunda copia (abajo a la izquierda + arriba a la derecha).
  let format = 0;
  for (let i = 0; i < 8; i++) if (modules[8][size - 1 - i]) format |= 1 << i;
  for (let i = 8; i < 15; i++) if (modules[size - 15 + i][8]) format |= 1 << i;
  const mask = FORMAT_M.indexOf(format);
  if (mask < 0) throw new Error("información de formato ilegible");

  const isFunction = (x: number, y: number) =>
    x === 6 ||
    y === 6 ||
    (x < 9 && y < 9) ||
    (x >= size - 8 && y < 9) ||
    (x < 9 && y >= size - 8) ||
    (version >= 2 &&
      Math.abs(x - (size - 7)) <= 2 &&
      Math.abs(y - (size - 7)) <= 2);

  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let v = 0; v < size; v++) {
      const y = upward ? size - 1 - v : v;
      for (const x of [right, right - 1]) {
        if (isFunction(x, y)) continue;
        bits.push(Number(modules[y][x] !== MASKS[mask](x, y)));
      }
    }
  }
  const codewords: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));
  }

  const [numBlocks, dataLen, eccLen] = blocksInfo;
  const blocks = Array.from({ length: numBlocks }, (_, j) => {
    const block: number[] = [];
    for (let i = 0; i < dataLen + eccLen; i++) block.push(codewords[i * numBlocks + j]);
    return block;
  });

  for (const block of blocks) {
    for (let r = 0; r < eccLen; r++) {
      // Horner en α^r: un bloque sano es múltiplo del generador.
      const root = GF_EXP[r];
      const syndrome = block.reduce((acc, c) => gfMul(acc, root) ^ c, 0);
      if (syndrome !== 0) throw new Error("Reed-Solomon no cierra");
    }
  }

  const data = blocks.flatMap((block) => block.slice(0, dataLen));
  const dataBits = data.flatMap((byte) =>
    Array.from({ length: 8 }, (_, i) => (byte >>> (7 - i)) & 1),
  );
  const read = (from: number, len: number) =>
    dataBits.slice(from, from + len).reduce((acc, b) => (acc << 1) | b, 0);
  if (read(0, 4) !== 0b0100) throw new Error("no es modo byte");
  const length = read(4, 8);
  const bytes = Uint8Array.from({ length }, (_, i) => read(12 + i * 8, 8));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

describe("encodeQr", () => {
  it.each(GOLDEN)(
    "coincide con python-qrcode módulo por módulo (v$version, máscara $mask)",
    ({ text, mask, version, rows }) => {
      const matrix = encodeQr(text, { ecc: "M", mask });
      expect(matrix.version).toBe(version);
      expect(matrix.size).toBe(version * 4 + 17);
      expect(toHexRows(matrix)).toEqual(rows);
    },
  );

  const SAMPLES = [
    "https://agorbis.com/reclamos/3f2b8c1e-9d4a-4b7e-8f21-6a5c0d9e7b13",
    "http://localhost:5173/proyectos/00000000-0000-4000-8000-000000000000",
    "https://preview.agorbis.workers.dev/c/mar-del-plata",
    "Ñandú, café y peñas — ü ☕",
    "a",
  ];

  it.each(SAMPLES)("un lector independiente recupera %s", (text) => {
    for (let mask = 0; mask < 8; mask++) {
      expect(decodeSmallM(encodeQr(text, { mask }))).toBe(text);
    }
    // Y con la máscara elegida por penalización.
    expect(decodeSmallM(encodeQr(text))).toBe(text);
  });

  it("usa la versión más chica que contiene el texto", () => {
    // Capacidad en modo byte con corrección M: v1 = 14 bytes, v2 = 26.
    expect(encodeQr("x".repeat(14)).version).toBe(1);
    expect(encodeQr("x".repeat(15)).version).toBe(2);
    expect(encodeQr("x".repeat(26)).version).toBe(2);
    expect(encodeQr("x".repeat(27)).version).toBe(3);
  });

  it("cuenta bytes UTF-8, no caracteres", () => {
    // 7 "ñ" son 14 bytes (entra en v1); 8 son 16 (no entra).
    expect(encodeQr("ñ".repeat(7)).version).toBe(1);
    expect(encodeQr("ñ".repeat(8)).version).toBe(2);
  });

  it("rechaza máscaras inválidas y textos que no entran en v40", () => {
    expect(() => encodeQr("hola", { mask: 8 })).toThrow(RangeError);
    expect(() => encodeQr("hola", { mask: 1.5 })).toThrow(RangeError);
    expect(() => encodeQr("x".repeat(2332))).toThrow(RangeError);
    // 2331 bytes es el máximo en modo byte con M.
    expect(encodeQr("x".repeat(2331)).version).toBe(40);
  });

  it("es determinista", () => {
    const url = SAMPLES[0];
    expect(toHexRows(encodeQr(url))).toEqual(toHexRows(encodeQr(url)));
  });
});

describe("qrToSvg", () => {
  it("agrega la zona silenciosa de 4 módulos al viewBox", () => {
    const matrix = encodeQr("a");
    expect(qrToSvg(matrix).viewBox).toBe(21 + 8);
    expect(qrToSvg(matrix, 0).viewBox).toBe(21);
  });

  it("dibuja exactamente los módulos oscuros", () => {
    const matrix = encodeQr(SAMPLE_URL);
    const { path } = qrToSvg(matrix, 4);
    const painted = new Set<string>();
    for (const [, x, y, w] of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\3z/g)) {
      for (let i = 0; i < Number(w); i++) {
        painted.add(`${Number(x) - 4 + i},${Number(y) - 4}`);
      }
    }
    const dark = new Set<string>();
    matrix.modules.forEach((row, y) =>
      row.forEach((cell, x) => {
        if (cell) dark.add(`${x},${y}`);
      }),
    );
    expect(painted).toEqual(dark);
    // Sólo comandos de path: nada que pueda inyectar marcado.
    expect(path).toMatch(/^[Mhvz0-9 -]+$/);
  });

  it("rechaza bordes inválidos", () => {
    expect(() => qrToSvg(encodeQr("a"), -1)).toThrow(RangeError);
  });

  it("qrSvgFor es el atajo de las dos cosas", () => {
    expect(qrSvgFor(SAMPLE_URL)).toEqual(qrToSvg(encodeQr(SAMPLE_URL)));
  });
});

const SAMPLE_URL =
  "https://agorbis.com/reclamos/3f2b8c1e-9d4a-4b7e-8f21-6a5c0d9e7b13";
