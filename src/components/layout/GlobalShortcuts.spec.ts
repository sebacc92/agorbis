import { describe, expect, it } from "vitest";
import { globalShortcut } from "./GlobalShortcuts";

const event = {
  key: "h",
  keyCode: 72,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  defaultPrevented: false,
  isComposing: false,
};

describe("atajos globales", () => {
  it.each([
    ["h", false, "home"],
    ["H", true, "home"],
    ["e", false, "explore"],
    ["E", true, "explore"],
    ["/", false, "search"],
    ["?", true, "help"],
    ["/", true, "help"],
    ["x", false, null],
  ])("resuelve %s con Shift=%s", (key, shiftKey, expected) => {
    expect(globalShortcut({ ...event, key, shiftKey }, false, false)).toBe(
      expected,
    );
  });

  it.each(["h", "e", "/", "?"])("respeta el contexto al pulsar %s", (key) => {
    const input = { ...event, key };
    expect(globalShortcut(input, true, false)).toBeNull();
    expect(globalShortcut(input, false, true)).toBeNull();
    for (const flag of [
      "ctrlKey",
      "metaKey",
      "altKey",
      "isComposing",
      "defaultPrevented",
    ] as const) {
      expect(
        globalShortcut({ ...input, [flag]: true }, false, false),
      ).toBeNull();
    }
    // Algunos teclados IME informan 229 antes de establecer isComposing.
    expect(globalShortcut({ ...input, keyCode: 229 }, false, false)).toBeNull();
  });
});
