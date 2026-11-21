import type { Signal } from "@qwik.dev/core";
import { removeStoredItem, writeStoredJson } from "~/lib/browser-storage";

export type DraftValue = string | string[] | number | boolean;
export type DraftSnapshot = Record<string, DraftValue>;
export type DraftFields = Record<string, Signal<DraftValue>>;
export type DraftStatus = "idle" | "saving" | "saved" | "error";

export function snapshotDraft(fields: DraftFields): DraftSnapshot {
  return Object.fromEntries(
    Object.entries(fields).map(([name, signal]) => [
      name,
      Array.isArray(signal.value) ? [...signal.value] : signal.value,
    ]),
  );
}

/** Sólo recupera campos conocidos cuyo tipo coincide con el formulario. */
export function restoreDraft(
  fields: DraftFields,
  initial: DraftSnapshot,
  stored: Record<string, unknown>,
) {
  for (const [name, signal] of Object.entries(fields)) {
    const value = stored[name];
    const valid = Array.isArray(initial[name])
      ? Array.isArray(value) && value.every((item) => typeof item === "string")
      : typeof value === typeof initial[name];
    // No pisa lo que alguien escribió mientras se reanudaba el formulario.
    if (
      valid &&
      JSON.stringify(signal.value) === JSON.stringify(initial[name])
    ) {
      signal.value = value as DraftValue;
    }
  }
}

export function saveDraft(
  key: string,
  snapshot: DraftSnapshot,
  initial: DraftSnapshot,
): DraftStatus {
  const empty = JSON.stringify(snapshot) === JSON.stringify(initial);
  const saved = empty ? removeStoredItem(key) : writeStoredJson(key, snapshot);
  return saved ? (empty ? "idle" : "saved") : "error";
}
