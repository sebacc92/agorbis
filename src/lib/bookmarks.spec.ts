import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadBookmarks,
  removeBookmark,
  saveBookmark,
  type BookmarkItem,
} from "./bookmarks";

const favorite: BookmarkItem = {
  id: "claim-one",
  type: "claim",
  title: "Vereda accesible",
  url: "/reclamos/claim-one",
  savedAt: 1,
};

afterEach(() => vi.unstubAllGlobals());

function storageFixture() {
  const values = new Map<string, string>();
  let blocked = false;
  const target = new EventTarget();
  const changed = vi.fn();
  target.addEventListener("agorbis-bookmarks-updated", changed);
  vi.stubGlobal("window", target);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (blocked) throw new Error("QuotaExceededError");
      values.set(key, value);
    },
  });
  return {
    changed,
    block: () => {
      blocked = true;
    },
  };
}

describe("confirmación de favoritos en el dispositivo", () => {
  it("confirma sólo escrituras reales y avisa a las otras vistas", () => {
    const { changed } = storageFixture();
    expect(saveBookmark(favorite)).toBe(true);
    expect(loadBookmarks()).toEqual([favorite]);
    expect(saveBookmark({ ...favorite, title: "Título actualizado" })).toBe(
      true,
    );
    expect(loadBookmarks()).toHaveLength(1);
    expect(loadBookmarks()[0].title).toBe("Título actualizado");
    expect(removeBookmark(favorite.id)).toBe(true);
    expect(loadBookmarks()).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it("si se llena el almacenamiento no informa guardado ni borra lo anterior", () => {
    const { changed, block } = storageFixture();
    expect(saveBookmark(favorite)).toBe(true);
    block();
    expect(saveBookmark({ ...favorite, id: "claim-two" })).toBe(false);
    expect(removeBookmark(favorite.id)).toBe(false);
    expect(loadBookmarks()).toEqual([favorite]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("sin almacenamiento devuelve un fallo recuperable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(saveBookmark(favorite)).toBe(false);
    expect(removeBookmark(favorite.id)).toBe(false);
  });
});
