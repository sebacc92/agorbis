import { readStoredJson, writeStoredJson } from "./browser-storage";

export type BookmarkItem = {
  id: string;
  type: "claim" | "poll" | "debate" | "project";
  title: string;
  url: string;
  savedAt: number;
  communityName?: string;
};

const STORAGE_KEY = "agorbis_bookmarks_v1";

function isBookmarkList(value: unknown): value is BookmarkItem[] {
  return Array.isArray(value);
}

export function loadBookmarks(): BookmarkItem[] {
  return readStoredJson(STORAGE_KEY, isBookmarkList) ?? [];
}

function saveAll(items: BookmarkItem[]): boolean {
  if (!writeStoredJson(STORAGE_KEY, items)) return false;
  // Sólo se avisa si quedó guardado: si no, la lista que se mostraría es la
  // misma de antes y no hay nada que refrescar.
  window.dispatchEvent(new Event("agorbis-bookmarks-updated"));
  return true;
}

export function saveBookmark(item: BookmarkItem): boolean {
  const filtered = loadBookmarks().filter((b) => b.id !== item.id);
  return saveAll([item, ...filtered]);
}

export function removeBookmark(id: string): boolean {
  return saveAll(loadBookmarks().filter((b) => b.id !== id));
}

export function isItemBookmarked(id: string): boolean {
  return loadBookmarks().some((b) => b.id === id);
}
