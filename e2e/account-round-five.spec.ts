import { expect, test } from "@playwright/test";
import {
  createLegalTestAccount,
  signInTestAccount,
} from "./account-followup-fixtures";
import { nativeContextOptions } from "./native-context";

test("los filtros rápidos anuncian selección y un rechazo HTML conserva preferencias encendidas y apagadas", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const actor = await createLegalTestAccount("notification-draft");
  const initial = {
    replies: true,
    poll_results: true,
    claim_updates: true,
    project_updates: true,
    institutional_responses: true,
  };
  try {
    expect(
      (
        await actor.admin
          .from("notification_preferences")
          .upsert({ user_id: actor.id, ...initial })
      ).error,
    ).toBeNull();
    await page.setViewportSize({ width: 390, height: 740 });
    await signInTestAccount(page, actor.email, "/notificaciones/");
    const chips = page.locator('a.snap-start[href^="/notificaciones"]');
    const selected = page.locator('a.snap-start[aria-current="page"]');
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText("Todas");
    for (const chip of await chips.all()) {
      const bounds = await chip.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
    }
    await chips.filter({ hasText: "Proyectos" }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("tipo") === "project_update",
    );
    await expect(selected).toHaveCount(1);
    await expect(selected).toHaveText(/^\s*Proyectos\s*$/);

    const context = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
      storageState: await page.context().storageState(),
    });
    try {
      const native = await context.newPage();
      await native.goto("/notificaciones/?tipo=reply");
      await expect(
        native.locator('a.snap-start[aria-current="page"]'),
      ).toContainText("Respuestas");
      const details = native
        .locator("details")
        .filter({
          has: native
            .locator("summary")
            .filter({ hasText: "Qué novedades querés recibir" }),
        });
      await details.locator("summary").click();
      const form = details.locator("form");
      await form.locator('input[name="replies"]').uncheck();
      await form.locator('input[name="project_updates"]').uncheck();
      // La respuesta 400 proviene del validador real de la acción. No se
      // reemplaza la respuesta HTTP ni se simula un guardado rechazado.
      await form
        .locator('input[name="poll_results"]')
        .evaluate((input: HTMLInputElement) => {
          input.value = "invalid";
        });
      const rejected = native.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("qaction="),
      );
      await form
        .getByRole("button", { name: "Guardar preferencias", exact: true })
        .click();
      expect((await rejected).status()).toBe(400);
      await expect(details).toHaveJSProperty("open", true);
      await expect(form.locator('input[name="replies"]')).not.toBeChecked();
      await expect(
        form.locator('input[name="project_updates"]'),
      ).not.toBeChecked();
      await expect(form.locator('input[name="poll_results"]')).toBeChecked();
      await expect(form.locator('input[name="claim_updates"]')).toBeChecked();
      await expect(
        form.locator('input[name="institutional_responses"]'),
      ).toBeChecked();
      await expect(
        native
          .getByRole("alert")
          .filter({ hasText: "No pudimos guardar tus preferencias." }),
      ).toBeVisible();
      await expect(
        native.getByText("Guardamos tus preferencias de notificaciones.", {
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(native.getByText("Guardado.", { exact: true })).toHaveCount(
        0,
      );
      const unchanged = await actor.admin
        .from("notification_preferences")
        .select(
          "replies,poll_results,claim_updates,project_updates,institutional_responses",
        )
        .eq("user_id", actor.id)
        .single();
      expect(unchanged.error).toBeNull();
      expect(unchanged.data).toEqual(initial);
      for (const input of await form.locator('input[type="checkbox"]').all())
        await input.uncheck();
      await form
        .getByRole("button", { name: "Guardar preferencias", exact: true })
        .click();
      await expect(
        native.getByText("Guardamos tus preferencias de notificaciones.", {
          exact: true,
        }),
      ).toBeVisible();
      await expect(native).toHaveURL(
        (url) => url.searchParams.get("tipo") === "reply",
      );
      await expect(details).toHaveJSProperty("open", true);
      for (const input of await form.locator('input[type="checkbox"]').all())
        await expect(input).not.toBeChecked();
      const saved = await actor.admin
        .from("notification_preferences")
        .select(
          "replies,poll_results,claim_updates,project_updates,institutional_responses",
        )
        .eq("user_id", actor.id)
        .single();
      expect(saved.error).toBeNull();
      expect(saved.data).toEqual({
        replies: false,
        poll_results: false,
        claim_updates: false,
        project_updates: false,
        institutional_responses: false,
      });
    } finally {
      await context.close();
    }
  } finally {
    expect(
      (await actor.admin.auth.admin.deleteUser(actor.id)).error,
    ).toBeNull();
  }
});
