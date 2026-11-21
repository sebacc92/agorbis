import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

async function localClaimPath() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (
    !url ||
    !key ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
  )
    throw new Error("Se requiere Supabase local.");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("claims")
    .select("id")
    .neq("status", "removed")
    .limit(1)
    .single();
  expect(error).toBeNull();
  return `/reclamos/${data!.id}/`;
}

test("un favorito sólo cambia tras guardarse y permite reintentar sin desbordar en móvil", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(await localClaimPath());
  const button = page.getByRole("button", {
    name: "Guardar en favoritos",
    exact: true,
  });
  await button.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Object.assign(window, { allowBookmarkWrites: false });
    Storage.prototype.setItem = function (key, value) {
      if (
        key === "agorbis_bookmarks_v1" &&
        !(window as typeof window & { allowBookmarkWrites: boolean })
          .allowBookmarkWrites
      )
        throw new DOMException("Storage blocked", "QuotaExceededError");
      setItem.call(this, key, value);
    };
  });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  const error = page.getByText(
    "No pudimos guardar el favorito en este dispositivo. Volvé a intentarlo.",
    { exact: true },
  );
  await expect(error).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("agorbis_bookmarks_v1")),
  ).toBeNull();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);

  await page.evaluate(() =>
    Object.assign(window, { allowBookmarkWrites: true }),
  );
  await button.click();
  const saved = page.getByRole("button", {
    name: "Quitar de favoritos",
    exact: true,
  });
  await expect(saved).toHaveAttribute("aria-pressed", "true");
  await expect(error).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("agorbis_bookmarks_v1") ?? "[]"),
    ),
  ).toHaveLength(1);
  await page.evaluate(() =>
    Object.assign(window, { allowBookmarkWrites: false }),
  );
  await saved.click();
  await expect(saved).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByText("No pudimos quitar el favorito. Volvé a intentarlo.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("agorbis_bookmarks_v1") ?? "[]"),
    ),
  ).toHaveLength(1);
  await page.evaluate(() =>
    Object.assign(window, { allowBookmarkWrites: true }),
  );
  await saved.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("agorbis_bookmarks_v1") ?? "[]"),
    ),
  ).toEqual([]);
});
