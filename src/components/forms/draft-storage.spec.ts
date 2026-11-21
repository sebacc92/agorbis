import { createSignal } from "@qwik.dev/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DraftFields } from "./draft-storage";
import { restoreDraft, saveDraft, snapshotDraft } from "./draft-storage";

function storage() {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  return values;
}

afterEach(() => vi.unstubAllGlobals());

describe("borradores completos", () => {
  it("recupera opciones dinámicas, moneda y metadatos aunque tengan valores iniciales", () => {
    const fields: DraftFields = {
      title: createSignal(""), options: createSignal(["", "", ""]),
      type: createSignal("single"), currency: createSignal("ARS"),
      resourcesNeeded: createSignal(""), timeEstimate: createSignal(""),
      binaryPrefilled: createSignal(false),
    };
    restoreDraft(fields, snapshotDraft(fields), {
      title: "Bicicleteros", options: ["Escuela A", "Escuela B"], type: "multiple",
      currency: "USD", resourcesNeeded: "Dos personas", timeEstimate: "9 meses",
      binaryPrefilled: true,
    });
    expect(snapshotDraft(fields)).toEqual({
      title: "Bicicleteros", options: ["Escuela A", "Escuela B"], type: "multiple",
      currency: "USD", resourcesNeeded: "Dos personas", timeEstimate: "9 meses",
      binaryPrefilled: true,
    });
  });

  it("recupera el texto del presupuesto y su notación aunque cambie el idioma", () => {
    const fields: DraftFields = { budget: createSignal(""), budgetLocale: createSignal("en") };
    restoreDraft(fields, snapshotDraft(fields), { budget: "2.500,50", budgetLocale: "es" });
    expect(snapshotDraft(fields)).toEqual({ budget: "2.500,50", budgetLocale: "es" });
  });

  it("preserva cambios hechos durante la reanudación y rechaza tipos corruptos", () => {
    const fields: DraftFields = { title: createSignal(""), options: createSignal(["", ""]), type: createSignal("single") };
    const initial = snapshotDraft(fields);
    fields.title.value = "Texto nuevo";
    restoreDraft(fields, initial, { title: "Texto viejo", options: ["A", 3], type: ["binary"], unknown: "x" });
    expect(snapshotDraft(fields)).toEqual({ title: "Texto nuevo", options: ["", ""], type: "single" });
  });

  it("distingue fallo de almacenamiento y borra solamente el borrador propio vacío", () => {
    const values = storage();
    values.set("otro-usuario", "privado");
    const initial = { title: "", currency: "ARS" };
    expect(saveDraft("propio", { title: "Mi idea", currency: "USD" }, initial)).toBe("saved");
    expect(JSON.parse(values.get("propio")!)).toEqual({ title: "Mi idea", currency: "USD" });
    expect(saveDraft("propio", initial, initial)).toBe("idle");
    expect(values.has("propio")).toBe(false);
    expect(values.get("otro-usuario")).toBe("privado");
    vi.stubGlobal("localStorage", { setItem: () => { throw new Error("cuota llena"); } });
    expect(saveDraft("propio", { title: "Sin guardar", currency: "ARS" }, initial)).toBe("error");
  });
});
