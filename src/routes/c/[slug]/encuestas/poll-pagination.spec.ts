import { describe, expect, it } from "vitest";
import { readCursor } from "~/lib/cursor";
import { PAGE_SIZE } from "~/lib/constants";
import { pollListHref, pollPage } from "./poll-pagination";

describe("fin de encuestas por cursor", () => {
  const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(100 - i).padStart(12, "0")}`,
    created_at: "2026-10-23T10:00:00+00:00",
  }));

  it.each([0, PAGE_SIZE - 1, PAGE_SIZE])(
    "no inventa otra página cuando quedan %s encuestas",
    (count) => {
      const page = pollPage(rows.slice(0, count));
      expect(page.polls).toHaveLength(count);
      expect(page.nextCursor).toBeNull();
    },
  );

  it("muestra veinte y continúa desde la última mostrada, conservando el desempate por ID", () => {
    const page = pollPage(rows);
    expect(page.polls).toEqual(rows.slice(0, PAGE_SIZE));
    expect(page.nextCursor).toEqual(rows[PAGE_SIZE - 1]);
    expect(page.polls).not.toContain(rows[PAGE_SIZE]);
  });

  it("conserva categoría y cursor al avanzar y sólo retira el cursor al volver", () => {
    const url = new URL(
      pollListHref("ambiente", rows[PAGE_SIZE - 1]),
      "https://agorbis.test",
    );
    expect(url.searchParams.get("categoria")).toBe("ambiente");
    expect(readCursor(url.searchParams)).toEqual(rows[PAGE_SIZE - 1]);
    expect(pollListHref("ambiente")).toBe("?categoria=ambiente");
    expect(pollListHref(null)).toBe("?");
  });
});
