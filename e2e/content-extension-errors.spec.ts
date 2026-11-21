import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

const projectId = "f0000000-0000-4000-8000-000000000001";
const ownerId = "33333333-3333-4333-8333-333333333333";

async function signIn(page: Page) {
  await page.goto(`/ingresar/?next=%2Fproyectos%2F${projectId}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}/?$`));
}

test("fuentes y respuestas explican los rechazos y conservan el texto, también sin JavaScript", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const slug = `errores-fuentes-${crypto.randomUUID()}`;
  const organizations = [crypto.randomUUID(), crypto.randomUUID()];
  try {
    localCommunityFixture(`
      insert into public.organizations(id, community_id, name, slug, type, verified_at)
      select '${organizations[0]}'::uuid, id, 'Primera organización de prueba de errores', '${slug}-a', 'institution', now()
      from public.communities where slug = 'mar-del-plata'
      union all
      select '${organizations[1]}'::uuid, id, 'Segunda organización de prueba de errores', '${slug}-b', 'institution', now()
      from public.communities where slug = 'mar-del-plata';
      insert into public.organization_members(organization_id, user_id)
      select id, '${ownerId}'::uuid from public.organizations where slug in ('${slug}-a', '${slug}-b');
    `);
    await signIn(page);
    const source = page.locator("details").filter({
      has: page.getByText("Agregar una fuente", { exact: true }),
    });
    await source.locator("summary").click();
    await source.getByRole("textbox", { name: "Título", exact: false }).fill("ab");
    await source.getByRole("textbox", { name: "Organización o medio" }).fill("Mi medio");
    await source.getByRole("textbox", { name: "Enlace", exact: false }).fill("https://example.com/fuente");
    await source.getByRole("button", { name: "Guardar fuente" }).click();
    const sourceError = source.getByRole("alert").filter({
      has: page.getByText("No se guardó la fuente", { exact: true }),
    });
    await expect(sourceError).toBeFocused();
    await expect(sourceError).toContainText("Escribí un título de al menos 3 caracteres.");
    const title = source.locator('input[name="title"]');
    await expect(title).toHaveAttribute("aria-invalid", "true");
    await expect(title).toHaveAttribute("aria-describedby", `source-${projectId}-title-error`);
    await expect(title).toHaveValue("ab");
    await sourceError.getByRole("link").click();
    await expect(title).toBeFocused();
    await expect(source.locator('input[name="publisher"]')).toHaveValue("Mi medio");

    let release = () => {};
    let submitted = () => {};
    const pending = new Promise<void>((resolve) => (release = resolve));
    const intercepted = new Promise<void>((resolve) => (submitted = resolve));
    await page.route("**/*qaction=*", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      submitted();
      await pending;
      await route.continue();
    });
    try {
      await source.getByRole("button", { name: "Guardar fuente" }).click();
      await intercepted;
      await expect(source.locator("form")).toBeVisible();
      await title.fill("Edición posterior al envío");
      await source.locator('input[name="publisher"]').fill("Medio editado durante el envío");
      release();
      await expect(sourceError).toBeVisible();
      await expect(sourceError).toBeFocused();
      await expect(title).toHaveValue("Edición posterior al envío");
      await expect(source.locator('input[name="publisher"]')).toHaveValue("Medio editado durante el envío");
    } finally {
      release();
      await page.unroute("**/*qaction=*");
    }

    const response = page.locator("details").filter({
      has: page.getByText("Responder como institución", { exact: true }),
    });
    await response.locator("summary").click();
    await response.locator('textarea[name="body"]').fill("Muy breve");
    await response.locator('input[name="source_url"]').fill("https://example.com/respaldo");
    await response.getByRole("button", { name: "Publicar respuesta verificada" }).click();
    const responseError = response.getByRole("alert").filter({
      has: page.getByText("No se publicó la respuesta institucional", { exact: true }),
    });
    await expect(responseError).toBeFocused();
    await expect(response.locator('textarea[name="body"]')).toHaveAttribute("aria-invalid", "true");
    await expect(response.locator('textarea[name="body"]')).toHaveAttribute(
      "aria-describedby",
      `response-${projectId}-body-error response-${projectId}-body-hint`,
    );
    await expect(response.locator('textarea[name="body"]')).toHaveValue("Muy breve");
    await expect(title).toHaveValue("Edición posterior al envío");

    const nativeContext = await browser.newContext({
      baseURL,
      storageState: await page.context().storageState(),
      ...nativeContextOptions,
    });
    try {
      const native = await nativeContext.newPage();
      await native.goto(`/proyectos/${projectId}/`);
      let nativeSource = native.locator("details").filter({
        has: native.getByText("Agregar una fuente", { exact: true }),
      });
      await nativeSource.locator("summary").click();
      await nativeSource.locator('input[name="title"]').fill("xy");
      await nativeSource.locator('input[name="publisher"]').fill("Otro medio");
      await nativeSource.locator('input[name="url"]').fill("https://example.com/nativa");
      const rejectedSource = native.waitForResponse((res) =>
        res.request().method() === "POST" && res.url().includes("qaction"),
      );
      await nativeSource.getByRole("button", { name: "Guardar fuente" }).click();
      expect((await rejectedSource).status()).toBe(400);
      nativeSource = native.locator("details").filter({
        has: native.getByText("Agregar una fuente", { exact: true }),
      });
      await expect(nativeSource.getByText("No se guardó la fuente", { exact: true })).toBeVisible();
      await expect(nativeSource.locator('input[name="title"]')).toHaveValue("xy");
      await expect(nativeSource.locator('input[name="publisher"]')).toHaveValue("Otro medio");
      await expect(nativeSource.locator('input[name="url"]')).toHaveValue("https://example.com/nativa");
      await expect(nativeSource.locator('input[name="title"]')).toHaveAttribute("aria-invalid", "true");

      await native.goto(`/proyectos/${projectId}/`);
      const nativeResponse = native.locator("details").filter({
        has: native.getByText("Responder como institución", { exact: true }),
      });
      await nativeResponse.locator("summary").click();
      await nativeResponse.locator('select[name="organization_id"]').selectOption(organizations[1]);
      await nativeResponse.locator('select[name="response_type"]').selectOption("commitment");
      await nativeResponse.locator('textarea[name="body"]').fill("Otra breve");
      await nativeResponse.locator('input[name="source_url"]').fill("https://example.com/oficial");
      const rejectedResponse = native.waitForResponse((res) =>
        res.request().method() === "POST" && res.url().includes("qaction"),
      );
      await nativeResponse.getByRole("button", { name: "Publicar respuesta verificada" }).click();
      expect((await rejectedResponse).status()).toBe(400);
      await expect(native.getByText("No se publicó la respuesta institucional", { exact: true })).toBeVisible();
      await expect(nativeResponse.locator('textarea[name="body"]')).toHaveValue("Otra breve");
      await expect(nativeResponse.locator('input[name="source_url"]')).toHaveValue("https://example.com/oficial");
      await expect(nativeResponse.locator('textarea[name="body"]')).toHaveAttribute("aria-invalid", "true");
      await expect(nativeResponse.locator('select[name="organization_id"]')).toHaveValue(organizations[1]);
      await expect(nativeResponse.locator('select[name="response_type"]')).toHaveValue("commitment");
    } finally {
      await nativeContext.close();
    }
  } finally {
    localCommunityFixture(`delete from public.organizations where slug in ('${slug}-a', '${slug}-b');`);
  }
});
