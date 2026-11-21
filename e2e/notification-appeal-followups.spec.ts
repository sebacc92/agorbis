import { expect, test, type Page } from "@playwright/test";
import {
  createLegalTestAccount,
  signInTestAccount,
} from "./account-followup-fixtures";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

async function bellCount(page: Page, count: number) {
  const bell = page.getByRole("banner").locator('a[href="/notificaciones"]');
  await expect(bell).toHaveAttribute(
    "aria-label",
    count ? `${count} notificaciones sin leer` : "Notificaciones",
  );
}

test("marcar avisos revalida la bandeja y campana, conservando filtros y página JS/nativa", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const actor = await createLegalTestAccount("avisos-leidos");
  const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
  const prefix = `Avisos D89 ${crypto.randomUUID()}`;
  const now = Date.now();
  try {
    const project = await actor.admin
      .from("projects")
      .select("community_id")
      .eq("id", "f0000000-0000-4000-8000-000000000001")
      .single();
    expect(project.error).toBeNull();
    const community = project.data!.community_id;
    expect(
      (
        await actor.admin.from("notifications").insert(
          ids.map((id, index) => ({
            id,
            recipient_id: actor.id,
            type: "reply",
            title: `${prefix} ${index + 1}`,
            href: "/perfil/",
            entity_type: "project",
            entity_id:
              index === 3
                ? "f0000000-0000-4000-8000-000000000002"
                : "f0000000-0000-4000-8000-000000000001",
            created_at: new Date(now - 10000 * (index + 1)).toISOString(),
          })),
        )
      ).error,
    ).toBeNull();
    const cursor = new Date(now - 15000).toISOString();
    const params = new URLSearchParams({
      tipo: "reply",
      comunidad: community,
      sin_leer: "1",
      antes: cursor,
      id: ids[0],
    });
    const href = `/notificaciones/?${params}`;
    await signInTestAccount(page, actor.email, href);
    await expect(page.getByText(`${prefix} 1`, { exact: true })).toHaveCount(0);
    const row = page
      .locator("li")
      .filter({ has: page.getByText(`${prefix} 2`, { exact: true }) });
    await expect(row).toBeVisible();
    await bellCount(page, 4);
    await page.evaluate(() => {
      document.documentElement.dataset.notificationSpa = "conservado";
    });
    await row
      .getByRole("button", { name: "Marcar como leída", exact: true })
      .click();
    await expect(row).toHaveCount(0);
    await bellCount(page, 3);
    await expect(page).toHaveURL((url) =>
      [...params].every(([key, value]) => url.searchParams.get(key) === value),
    );
    await page
      .getByRole("button", {
        name: "Marcar coincidencias como leídas",
        exact: true,
      })
      .click();
    await expect(page.getByText(`${prefix} 3`, { exact: true })).toHaveCount(0);
    await bellCount(page, 1);
    await expect(
      page.getByRole("heading", { name: "No hay notificaciones más viejas" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.dataset.notificationSpa,
      ),
    ).toBe("conservado");
    await expect(page).toHaveURL((url) =>
      [...params].every(([key, value]) => url.searchParams.get(key) === value),
    );

    expect(
      (
        await actor.admin
          .from("notifications")
          .update({ read_at: null })
          .in("id", ids.slice(0, 3))
      ).error,
    ).toBeNull();
    const context = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
      storageState: await page.context().storageState(),
    });
    try {
      const native = await context.newPage();
      await native.goto("/notificaciones/");
      const filters = native
        .locator("details")
        .filter({ has: native.locator("#notification-filters") });
      await expect(filters).not.toHaveAttribute("open");
      await filters.locator("summary").click();
      await expect(filters).toHaveAttribute("open", "");
      await filters.locator('select[name="tipo"]').selectOption("reply");
      await filters.locator('select[name="comunidad"]').selectOption(community);
      await filters.locator('input[name="sin_leer"]').check();
      await filters.locator("summary").click();
      await expect(filters.locator("form")).toBeHidden();
      await filters.locator("summary").click();
      await expect(filters.locator('select[name="tipo"]')).toHaveValue("reply");
      await expect(filters.locator('select[name="comunidad"]')).toHaveValue(
        community,
      );
      await expect(filters.locator('input[name="sin_leer"]')).toBeChecked();
      await filters
        .getByRole("button", { name: "Aplicar filtros", exact: true })
        .focus();
      await native.keyboard.press("Enter");
      await expect(native).toHaveURL(
        (url) =>
          url.searchParams.get("tipo") === "reply" &&
          url.searchParams.get("comunidad") === community &&
          url.searchParams.get("sin_leer") === "1",
      );
      await native.goto(href);
      const nativeRow = native
        .locator("li")
        .filter({ has: native.getByText(`${prefix} 3`, { exact: true }) });
      await nativeRow
        .getByRole("button", { name: "Marcar como leída", exact: true })
        .focus();
      await native.keyboard.press("Enter");
      await expect(nativeRow).toHaveCount(0);
      await bellCount(native, 3);
      await expect(native).toHaveURL((url) =>
        [...params].every(
          ([key, value]) => url.searchParams.get(key) === value,
        ),
      );
      await native
        .getByRole("button", {
          name: "Marcar coincidencias como leídas",
          exact: true,
        })
        .focus();
      await native.keyboard.press("Enter");
      await expect(
        native.getByRole("heading", {
          name: "No hay notificaciones más viejas",
        }),
      ).toBeVisible();
      await bellCount(native, 1);
      await expect(native).toHaveURL((url) =>
        [...params].every(
          ([key, value]) => url.searchParams.get(key) === value,
        ),
      );
    } finally {
      await context.close();
    }
    const outside = await actor.admin
      .from("notifications")
      .select("read_at")
      .eq("id", ids[3])
      .single();
    expect(outside.error).toBeNull();
    expect(outside.data?.read_at).toBeNull();
  } finally {
    expect(
      (await actor.admin.auth.admin.deleteUser(actor.id)).error,
    ).toBeNull();
  }
});

test("enviar y retirar apelaciones actualiza sólo su suspensión y conserva otros borradores y POST nativo", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const actor = await createLegalTestAccount("apelaciones-estado");
  const suspensions = Array.from({ length: 2 }, () => crypto.randomUUID());
  try {
    localCommunityFixture(`insert into public.user_suspensions(id, user_id, starts_at, ends_at, reason)
      values ${suspensions.map((id, index) => `('${id}', '${actor.id}', now() - interval '1 day', now() + interval '7 days', 'Suspensión de fixture D89 ${index + 1}')`).join(",")};`);
    await signInTestAccount(page, actor.email, "/perfil/apelacion/");
    const first = page.locator(`#suspension-${suspensions[0]}`);
    const second = page.locator(`#suspension-${suspensions[1]}`);
    const body = `Contexto enviado para revisión ${crypto.randomUUID()}.`;
    const otherDraft = "Contexto de otra suspensión todavía sin enviar.";
    await first.locator('textarea[name="body"]').fill(body);
    await second.locator('textarea[name="body"]').fill(otherDraft);
    await page.evaluate(() => {
      document.documentElement.dataset.appealSpa = "conservado";
    });
    await first
      .getByRole("button", { name: "Enviar apelación", exact: true })
      .click();
    await expect(first.getByRole("status")).toContainText(
      "Recibimos tu apelación. Moderación la revisará.",
    );
    await expect(first.getByText(body, { exact: true })).toBeVisible();
    await expect(
      first.getByRole("button", { name: "Retirar apelación", exact: true }),
    ).toBeVisible();
    await expect(first.locator('textarea[name="body"]')).toHaveCount(0);
    await expect(second.locator('textarea[name="body"]')).toHaveValue(
      otherDraft,
    );
    await expect(second.getByRole("status")).toHaveCount(0);
    await first
      .getByRole("button", { name: "Retirar apelación", exact: true })
      .click();
    await expect(first.getByRole("status")).toContainText(
      "La apelación fue retirada.",
    );
    await expect(first.getByText("Retirada", { exact: true })).toBeVisible();
    await expect(
      first.getByRole("button", { name: "Retirar apelación", exact: true }),
    ).toHaveCount(0);
    await expect(
      first.getByRole("button", { name: "Enviar apelación", exact: true }),
    ).toBeVisible();
    await expect(second.locator('textarea[name="body"]')).toHaveValue(
      otherDraft,
    );
    expect(
      await page.evaluate(() => document.documentElement.dataset.appealSpa),
    ).toBe("conservado");
    let release = () => {};
    let submitted = () => {};
    const pending = new Promise<void>((resolve) => (release = resolve));
    const intercepted = new Promise<void>((resolve) => (submitted = resolve));
    const confirmed =
      "Segunda apelación con contexto enviado antes de otra edición.";
    const edited =
      "Una edición posterior al envío que debe conservarse como borrador.";
    await first.locator('textarea[name="body"]').fill(confirmed);
    await page.route("**/*qaction=*", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitted();
      await pending;
      await route.continue();
    });
    try {
      await first
        .getByRole("button", { name: "Enviar apelación", exact: true })
        .click();
      await intercepted;
      await first.locator('textarea[name="body"]').fill(edited);
      release();
      await expect(first.getByText(confirmed, { exact: true })).toBeVisible();
      await expect(first.locator('textarea[name="body"]')).toHaveValue(edited);
      await expect(
        first.getByRole("button", { name: "Enviar apelación", exact: true }),
      ).toBeDisabled();
      await expect(
        first
          .getByRole("status")
          .filter({ hasText: "La apelación fue retirada." }),
      ).toHaveCount(0);
      await expect(second.locator('textarea[name="body"]')).toHaveValue(
        otherDraft,
      );
    } finally {
      release();
      await page.unroute("**/*qaction=*");
    }
    const context = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
      storageState: await page.context().storageState(),
    });
    try {
      const native = await context.newPage();
      await native.goto("/perfil/apelacion/");
      const target = native.locator(`#suspension-${suspensions[1]}`);
      const nativeBody = `Contexto de apelación nativa ${crypto.randomUUID()}.`;
      await target.locator('textarea[name="body"]').fill(nativeBody);
      await target
        .getByRole("button", { name: "Enviar apelación", exact: true })
        .focus();
      await native.keyboard.press("Enter");
      await expect(target.getByRole("status")).toContainText(
        "Recibimos tu apelación. Moderación la revisará.",
      );
      await expect(target.getByText(nativeBody, { exact: true })).toBeVisible();
      await target
        .getByRole("button", { name: "Retirar apelación", exact: true })
        .focus();
      await native.keyboard.press("Enter");
      await expect(target.getByRole("status")).toContainText(
        "La apelación fue retirada.",
      );
      await expect(target.getByText("Retirada", { exact: true })).toBeVisible();
      await expect(
        target.getByRole("button", { name: "Retirar apelación", exact: true }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  } finally {
    localCommunityFixture(
      `delete from public.moderation_appeals where suspension_id in (${suspensions.map((id) => `'${id}'`).join(",")}); delete from public.user_suspensions where id in (${suspensions.map((id) => `'${id}'`).join(",")});`,
    );
    expect(
      (await actor.admin.auth.admin.deleteUser(actor.id)).error,
    ).toBeNull();
  }
});
