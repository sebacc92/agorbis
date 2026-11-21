import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("Agendar permite abrir, recorrer, cerrar y descargar usando el teclado", async ({
  page,
}) => {
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
    .from("polls")
    .select("id")
    .eq("status", "active")
    .gt("closes_at", new Date().toISOString())
    .limit(1)
    .single();
  expect(error).toBeNull();
  await page.goto(`/encuestas/${data!.id}/`);
  const trigger = page.getByRole("button", { name: "Agendar", exact: true });
  const menu = page.getByRole("menu", { name: "Agendar", exact: true });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(menu).toBeVisible();
  const google = menu.getByRole("menuitem", {
    name: "Google Calendar",
    exact: true,
  });
  const ics = menu.getByRole("menuitem", {
    name: "Descargar .ics (Apple / Outlook)",
    exact: true,
  });
  await expect(google).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(ics).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(google).toBeFocused();
  await page.keyboard.press("End");
  await expect(ics).toBeFocused();
  await page.keyboard.press("Home");
  await expect(google).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(ics).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(google).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY",
  );
  await trigger.click();
  await expect(google).toBeFocused();
  await page.keyboard.press("End");
  const download = page.waitForEvent("download");
  await page.keyboard.press("Enter");
  expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
