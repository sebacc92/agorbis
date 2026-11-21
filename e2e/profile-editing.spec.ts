import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { nativeContextOptions } from "./native-context";

const owner = "33333333-3333-4333-8333-333333333333";
const avatarPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEklEQVQImWOImlYRNa2CAUIBACb2BaH/3IQ8AAAAAElFTkSuQmCC",
  "base64",
);

test("el perfil explica el usuario y sólo quita la foto tras guardar de verdad", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (
    !url ||
    !key ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
  ) {
    throw new Error("Esta prueba sólo puede escribir en Supabase local.");
  }
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await db.auth.signInWithPassword({
    email: "sofia@agorbis.test",
    password: "AgorbisLocal-2026!",
    options: { captchaToken: "XXXX.DUMMY.TOKEN.XXXX" },
  });
  expect(signInError).toBeNull();
  const readProfile = async () => {
    const { data, error } = await db
      .from("profiles")
      .select("username, display_name, bio, avatar_url")
      .eq("id", owner)
      .single();
    expect(error).toBeNull();
    return data!;
  };
  const initial = await readProfile();
  expect(
    initial.avatar_url,
    "el fixture local debe empezar sin foto",
  ).toBeNull();

  try {
    await page.addInitScript(() => {
      const revoke = URL.revokeObjectURL;
      Object.assign(window, { revokedAvatarPreviews: [] });
      URL.revokeObjectURL = function (url) {
        (
          window as typeof window & { revokedAvatarPreviews: string[] }
        ).revokedAvatarPreviews.push(url);
        revoke.call(URL, url);
      };
    });
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/ingresar/?next=%2Fperfil%2F");
    await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
    await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
      /\S+/,
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(/\/perfil\/?$/, { timeout: 20_000 });
    await page.getByRole("link", { name: "Configuración y Cuenta" }).click();
    await expect(page).toHaveURL(/seccion=cuenta/);

    const username = page.getByRole("textbox", {
      name: "Nombre de usuario",
      exact: true,
    });
    await expect(username).toHaveAttribute("minlength", "3");
    await expect(username).toHaveAttribute("maxlength", "20");
    await expect(username).toHaveAttribute("pattern", "[a-z0-9_]{3,20}");
    await expect(username).toHaveAttribute("autocapitalize", "none");
    await expect(username).toHaveAttribute("aria-describedby", "username-hint");
    await expect(page.locator("#username-hint")).toHaveText(
      "Entre 3 y 20 caracteres: minúsculas, números y guión bajo.",
    );

    const avatar = page.getByLabel("Foto de perfil", { exact: true });
    const selectAvatar = async () =>
      avatar.setInputFiles({
        name: "perfil.png",
        mimeType: "image/png",
        buffer: avatarPng,
      });
    const preview = page.getByRole("img", {
      name: "Vista previa de tu nueva foto de perfil",
    });
    const expectRevoked = async (url: string) =>
      expect
        .poll(() =>
          page.evaluate(
            (url) =>
              (
                window as typeof window & { revokedAvatarPreviews: string[] }
              ).revokedAvatarPreviews.includes(url),
            url,
          ),
        )
        .toBe(true);
    await selectAvatar();
    await expect(preview).toBeVisible();
    expect((await readProfile()).avatar_url).toBeNull();
    const firstPreview = (await preview.getAttribute("src"))!;
    await selectAvatar();
    await expect(preview).not.toHaveAttribute("src", firstPreview);
    await expectRevoked(firstPreview);
    const secondPreview = (await preview.getAttribute("src"))!;
    await page
      .getByRole("button", { name: "Descartar foto seleccionada" })
      .click();
    await expect(preview).toHaveCount(0);
    await expectRevoked(secondPreview);
    expect(
      await avatar.evaluate((input: HTMLInputElement) => input.files?.length),
    ).toBe(0);
    await selectAvatar();
    await expect(preview).toBeVisible();
    const resetPreview = (await preview.getAttribute("src"))!;
    await avatar.evaluate((input: HTMLInputElement) => input.form!.reset());
    await expect(preview).toHaveCount(0);
    await expectRevoked(resetPreview);
    await selectAvatar();
    await expect(preview).toBeVisible();
    const savedPreview = (await preview.getAttribute("src"))!;
    await expect(
      page.getByRole("button", { name: "Guardar cambios", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    await expect
      .poll(async () => (await readProfile()).avatar_url)
      .toMatch(/^\/media\/avatares\//);
    const uploadedUrl = (await readProfile()).avatar_url!;
    await expect(preview).toHaveCount(0);
    await expectRevoked(savedPreview);
    const remove = page.getByRole("checkbox", {
      name: "Quitar foto actual al guardar",
    });
    await expect(remove).toBeVisible();
    await expect(page.locator("#remove-avatar-hint")).toHaveText(
      "Tu foto se quitará cuando guardes los cambios. Podés elegir otra después.",
    );

    // Un rechazo real por nombre ocupado conserva la foto y lo que se editó.
    await username.fill("bruno_lp");
    await page
      .getByLabel("Nombre para mostrar", { exact: true })
      .fill("Nombre pendiente de guardar");
    await page
      .getByLabel("Bio", { exact: true })
      .fill("Bio pendiente de guardar");
    await selectAvatar();
    await expect(preview).toBeVisible();
    const removedPreview = (await preview.getAttribute("src"))!;
    await remove.check();
    await expect(avatar).toBeDisabled();
    await expect(preview).toHaveCount(0);
    await expectRevoked(removedPreview);
    await page
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Ese nombre de usuario ya está tomado." }),
    ).toBeVisible();
    await expect(username).toHaveValue("bruno_lp");
    await expect(remove).toBeChecked();
    await expect(
      page.getByLabel("Nombre para mostrar", { exact: true }),
    ).toHaveValue("Nombre pendiente de guardar");
    await expect(page.getByLabel("Bio", { exact: true })).toHaveValue(
      "Bio pendiente de guardar",
    );
    expect((await readProfile()).avatar_url).toBe(uploadedUrl);
    expect((await page.request.get(uploadedUrl)).ok()).toBe(true);

    await username.fill(initial.username);
    await page
      .getByLabel("Nombre para mostrar", { exact: true })
      .fill(initial.display_name ?? "");
    await page.getByLabel("Bio", { exact: true }).fill(initial.bio ?? "");
    await page
      .getByRole("button", { name: "Guardar cambios", exact: true })
      .click();
    await expect.poll(async () => (await readProfile()).avatar_url).toBeNull();
    await expect(remove).toHaveCount(0);
    await expect(avatar).toBeEnabled();
    expect((await page.request.get(uploadedUrl)).status()).toBe(404);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  } finally {
    // La restauración usa la sesión de la persona, sin saltear RLS.
    const { error } = await db.from("profiles").update(initial).eq("id", owner);
    expect(error, "restauración del perfil local").toBeNull();
    await db.auth.signOut();
  }
});

test("las secciones del perfil conservan la URL y el historial, y los favoritos se distinguen al quitarlos", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const localUrl = process.env.PUBLIC_SUPABASE_URL;
  if (
    !localUrl ||
    !["127.0.0.1", "localhost"].includes(new URL(localUrl).hostname)
  ) {
    throw new Error("Esta prueba sólo puede usar Supabase local.");
  }
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(
    "/ingresar/?next=%2Fperfil%2F%3Fseccion%3Dcuenta%26origen%3De2e",
  );
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/perfil\/\?seccion=cuenta&origen=e2e/);
  const sections = page.getByRole("navigation", {
    name: "Secciones del perfil",
  });
  const account = sections.getByRole("link", {
    name: "Configuración y Cuenta",
  });
  await expect(account).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Editar tus datos" }),
  ).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem(
      "agorbis_bookmarks_v1",
      JSON.stringify([
        {
          id: "profile-test-one",
          type: "claim",
          title: "Veredas del barrio",
          url: "/explorar",
          savedAt: Date.now(),
        },
        {
          id: "profile-test-two",
          type: "debate",
          title: "Movilidad de la ciudad",
          url: "/explorar",
          savedAt: Date.now(),
        },
      ]),
    ),
  );
  const saved = sections.getByRole("link", { name: /Guardados y Comunidades/ });
  await saved.click();
  await expect(page).toHaveURL(/seccion=guardados&origen=e2e/);
  await expect(saved).toHaveAttribute("aria-current", "page");
  await expect(account).not.toHaveAttribute("aria-current");
  const removeFirst = page.getByRole("button", {
    name: "Quitar de favoritos: Veredas del barrio",
    exact: true,
  });
  const removeSecond = page.getByRole("button", {
    name: "Quitar de favoritos: Movilidad de la ciudad",
    exact: true,
  });
  await expect(removeFirst).toBeVisible();
  const box = await removeFirst.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await removeFirst.click();
  await expect(removeFirst).toHaveCount(0);
  await expect(removeSecond).toBeVisible();
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("agorbis_bookmarks_v1") ?? "[]").map(
        (item: { id: string }) => item.id,
      ),
    ),
  ).toEqual(["profile-test-two"]);
  await page.reload();
  await expect(saved).toHaveAttribute("aria-current", "page");
  await expect(removeSecond).toBeVisible();
  await sections
    .getByRole("link", { name: /Publicaciones y Actividad/ })
    .click();
  await expect(page).toHaveURL(/seccion=publicaciones&origen=e2e/);
  await page.goBack();
  await expect(saved).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(
    sections.getByRole("link", { name: /Publicaciones y Actividad/ }),
  ).toHaveAttribute("aria-current", "page");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);

  const native = await browser.newContext({
    baseURL,
    ...nativeContextOptions,
    storageState: await page.context().storageState(),
    viewport: { width: 320, height: 740 },
  });
  try {
    const nativePage = await native.newPage();
    await nativePage.goto("/perfil/?seccion=cuenta&origen=e2e");
    await expect(
      nativePage.getByRole("heading", { name: "Editar tus datos" }),
    ).toBeVisible();
    await nativePage
      .getByRole("navigation", { name: "Secciones del perfil" })
      .getByRole("link", { name: /Publicaciones y Actividad/ })
      .click();
    await expect(nativePage).toHaveURL(/seccion=publicaciones&origen=e2e/);
    await expect(
      nativePage.getByRole("heading", { name: "Tu actividad" }),
    ).toBeVisible();
  } finally {
    await native.close();
    await page.evaluate(() => localStorage.removeItem("agorbis_bookmarks_v1"));
  }
});
