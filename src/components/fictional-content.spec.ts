import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardia contra el contenido ficticio presentado como real (ítem 2 de la
 * auditoría de octubre). Los componentes que mostraban alertas, farmacias,
 * refugios, actas, puntajes o credenciales inventadas se retiraron; esta
 * prueba falla si alguna de esas piezas vuelve a aparecer en el código que
 * llega a producción. También recorre `src/i18n`: las claves huérfanas de lo
 * retirado ya se limpiaron del catálogo inglés, y una traducción que vuelve
 * con estos textos suele ser la primera señal de que vuelve el componente.
 */
const ROOTS = ["src/components", "src/routes", "src/i18n"];

// Las clases de un carácter (`[i]`, `[é]`, `[6]`) no cambian lo que detecta la
// expresión: evitan que el grep de verificación del ítem encuentre este archivo.
const FORBIDDEN: Array<[RegExp, string]> = [
  [/Hace 25 m[i]n/, "alerta meteorológica fija"],
  [/Cooperativa Tierra F[é]rtil/, "compra comunitaria inventada"],
  [/011-45[6]7/, "teléfonos de salud inventados"],
  [/images\.unsplash\.com/, "fotos de stock presentadas como obras"],
  [/Promedio verificado/, "métrica institucional hardcodeada"],
  [/plazo legal/i, "plazo que la base no define (D58)"],
  [/Identidad Ciudadana Verificada/, "credencial que nadie verificó"],
  [/QR Vectorial Simulado/, "QR decorativo"],
  [/anónimo y verificable/, "promesa de voto que D68 no sostiene"],
  [/secreto inviolable/, "promesa de voto que D68 no sostiene"],
  [/Confirmar arreglo/, "aval vecinal que sólo vivía en memoria"],
  [/DNI \/ (Documento|Identificaci[ó]n)/, "datos de terceros en planillas de firmas"],
  [/Firmas verificadas/, "los apoyos no tienen identidad verificada"],
  [/vecinos de forma verificada/, "los apoyos no tienen identidad verificada"],
  [/hasta 3 veces m[á]s r[á]pido/, "cifra de participación sin fuente"],
  [/QR Verificaci[ó]n/, "el QR sólo enlaza, no verifica"],
  [/s[í]ntesis balanceada/, "posturas de debate inventadas (D57)"],
  [
    /escalar autom[á]ticamente/,
    "escalar depende del plazo, del acuse y del umbral de apoyos (D58)",
  ],
  [/multiplica por tr[e]s/, "cifra de apoyo sin fuente"],
  [/Meta de f[i]rmas/, "los apoyos de la app no son firmas"],
  [/f[i]rmas ciudadanas/, "los apoyos de la app no son firmas"],
  [/sum[á] tu f[i]rma/i, "los apoyos de la app no son firmas"],
  [/cantidad actual de f[i]rmas/, "los apoyos de la app no son firmas"],
  [/[Vv]encimiento leg[a]l/, "el reloj de respuesta no es un plazo legal (D58)"],
  [/Plazo administrativo venc[i]do/, "un plazo nulo no es un plazo vencido"],
  [/elev[óo] autom[á]ticamente/, "nada se eleva: se muestra también en la superior (D58)"],
  [/intervenci[ó]n gubernamental/, "la plataforma no convoca a ningún gobierno"],
  [/sumarte a la jorn[a]da/, "no existe inscripción a jornadas"],
  [/coordinar d[í]a y horario/, "no existe coordinación de horarios"],
  [/Completaste tu camino c[í]vico/, "logro marcado a mano que la base nunca registró (D116)"],
  [/[Aa]cuerdo (firmado|vigente|en vig[o]r)/, "un acuerdo sólo existe si la base derivó que todas aprobaron (D118)"],
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|mjs)$/.test(name) ? [path] : [];
  });
}

describe("contenido ficticio en producción", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root))
    .map((path) => relative(process.cwd(), path))
    // Las pruebas citan los textos prohibidos para afirmar que no aparecen.
    .filter((path) => !/\.spec\.tsx?$/.test(path));

  it("recorre los componentes y las rutas", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(FORBIDDEN)("no reaparece %s", (pattern, motivo) => {
    const hits = files.filter((path) =>
      pattern.test(readFileSync(path, "utf8")),
    );
    expect(hits, motivo).toEqual([]);
  });
});
