import { $ } from "@qwik.dev/core";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { DialogFrame, isOutsideRect } from "./Dialog";
import { Modal } from "./index";

const UI_DIR = fileURLToPath(new URL(".", import.meta.url));
const SRC_DIR = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.spec\.tsx?$/.test(entry.name)
      ? [path]
      : [];
  });
}

describe("isOutsideRect", () => {
  const rect = { left: 10, right: 110, top: 20, bottom: 220 };
  it("adentro del panel (incluido su padding) no cierra", () => {
    expect(isOutsideRect({ clientX: 10, clientY: 20 }, rect)).toBe(false);
    expect(isOutsideRect({ clientX: 60, clientY: 100 }, rect)).toBe(false);
    expect(isOutsideRect({ clientX: 110, clientY: 220 }, rect)).toBe(false);
  });
  it("afuera, en el fondo, cierra", () => {
    expect(isOutsideRect({ clientX: 9, clientY: 100 }, rect)).toBe(true);
    expect(isOutsideRect({ clientX: 60, clientY: 221 }, rect)).toBe(true);
  });
});

describe("DialogFrame", () => {
  it("es un <dialog> modal con nombre accesible", async () => {
    const { document } = await renderWithLocale(
      <DialogFrame onClose$={$(() => {})} label="Preferencias">
        <button type="button" />
      </DialogFrame>,
    );
    const dialog = document.querySelector("dialog");
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute("aria-modal")).toBe("true");
    expect(dialog!.getAttribute("aria-label")).toBe("Preferencias");
    // Se abre con showModal() en el cliente: nunca llega abierto del SSR
    // (un `open` del servidor lo mostraría no modal, sin foco atrapado).
    expect(dialog!.hasAttribute("open")).toBe(false);
  });

  it("con labelledBy apunta al título y no duplica la etiqueta", async () => {
    const { document } = await renderWithLocale(
      <DialogFrame onClose$={$(() => {})} labelledBy="t1" label="X">
        <h2 id="t1" />
      </DialogFrame>,
    );
    const dialog = document.querySelector("dialog")!;
    expect(dialog.getAttribute("aria-labelledby")).toBe("t1");
    expect(dialog.hasAttribute("aria-label")).toBe(false);
  });
});

describe("Modal", () => {
  it("se nombra con su título visible", async () => {
    const { document } = await renderWithLocale(
      <Modal open onClose$={$(() => {})} title="Atajos de teclado">
        <p />
      </Modal>,
    );
    const dialog = document.querySelector("dialog")!;
    const id = dialog.getAttribute("aria-labelledby");
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)?.textContent).toBe(
      "Atajos de teclado",
    );
  });
});

describe("diálogos de src", () => {
  /**
   * Un `<div role="dialog">` no atrapa el foco ni deja inerte el resto de la
   * página por sí solo; había ocho armados a mano, cada uno con un subconjunto
   * distinto de garantías. Todo diálogo modal pasa por `DialogFrame` (o
   * `<Modal>`, que lo usa).
   */
  it("no quedan diálogos modales armados con role=dialog", () => {
    const offenders = sourceFiles(SRC_DIR).filter((file) =>
      /role=["{]?["']?(?:alert)?dialog/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});

describe("barrel de primitivas", () => {
  /**
   * `index.tsx` reexporta archivos de esta carpeta; si alguno importa el
   * barrel de vuelta, el ciclo puede dejar `cx` o `Button` en `undefined`
   * según el orden de carga.
   */
  it("ningún archivo reexportado importa el barrel", () => {
    const barrel = readFileSync(join(UI_DIR, "index.tsx"), "utf8");
    const reexported = [
      ...barrel.matchAll(/from "\.\/([A-Za-z]+)"/g),
    ].map((match) => match[1]);
    expect(reexported.length).toBeGreaterThan(2);
    const cyclic = reexported.filter((name) => {
      const path = ["tsx", "ts"]
        .map((ext) => join(UI_DIR, `${name}.${ext}`))
        .find((candidate) => {
          try {
            readFileSync(candidate);
            return true;
          } catch {
            return false;
          }
        });
      if (!path) return false;
      const source = readFileSync(path, "utf8");
      return /from "(?:~\/components\/ui|\.\/index|\.)"/.test(source);
    });
    expect(cyclic).toEqual([]);
  });

  it("no reexporta funciones que no son primitivas", () => {
    const barrel = readFileSync(join(UI_DIR, "index.tsx"), "utf8");
    expect(barrel).not.toMatch(/export \{[^}]*CommandPalette/);
    expect(barrel).not.toMatch(/export \{[^}]*CivicCalendarButton/);
  });
});
