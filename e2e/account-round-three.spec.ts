import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { nativeContextOptions } from "./native-context";

const owner = "33333333-3333-4333-8333-333333333333";
const password = "AgorbisLocal-2026!";

function localAdmin() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (
    !url ||
    !key ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    new URL(url).port !== "54821"
  )
    throw new Error("Esta prueba sólo puede usar el stack local de Agorbis.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function waitForTurnstile(page: Page) {
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
}

async function signIn(page: Page, next: string) {
  localAdmin();
  await page.goto(`/ingresar/?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill(password);
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL((url) =>
    url.pathname.replace(/\/$/, "") === next.split("?")[0].replace(/\/$/, ""),
  );
}

async function submit(page: Page, label: string, method: "click" | "enter" = "click") {
  const response = page.waitForResponse(
    // Los pasos del alta navegan como documento (D121): el POST es a la propia
    // página, sin `qaction`.
    (res) =>
      res.request().method() === "POST" &&
      (res.url().includes("qaction") || res.request().resourceType() === "document"),
  );
  const button = page.getByRole("button", { name: label, exact: true });
  if (method === "enter") {
    // Conserva el POST HTML y su validación sin esperar la escala de hover.
    await button.focus();
    await page.keyboard.press("Enter");
  } else {
    await button.click();
  }
  return response;
}

async function expectUsernameError(page: Page, message: string) {
  const username = page.getByRole("textbox", {
    name: "Nombre de usuario",
    exact: true,
  });
  await expect(page.locator("#username-error")).toContainText(message);
  await expect(username).toHaveAttribute("aria-invalid", "true");
  await expect(username).toHaveAttribute(
    "aria-describedby",
    "username-error username-hint",
  );
  await expect(page.locator("#username-hint")).toBeVisible();
  await expect(username).toBeFocused();
  await expect(username).toHaveValue("bruno_lp");
}

test("la recuperación identifica el correo ingresado y permite otro intento sin revelar cuentas", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const admin = localAdmin();
  const suffix = crypto.randomUUID();
  const registered = `recuperacion-${suffix}@agorbis.test`;
  const unknown = `desconocida-${suffix}@agorbis.test`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email: registered,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  expect(created.user).toBeTruthy();
  const generic = "Si existe una cuenta con ese correo, vas a recibir un enlace en unos minutos.";
  try {
    await page.goto("/recuperar/");
    for (const email of [registered, unknown]) {
      await page.getByLabel("Correo electrónico").fill(email);
      await waitForTurnstile(page);
      expect((await submit(page, "Enviar enlace")).status()).toBe(200);
      await expect(page.getByRole("heading", { name: "Revisá tu correo", exact: true })).toBeVisible();
      await expect(page.getByText(generic, { exact: true })).toBeVisible();
      await expect(page.locator("main bdi").filter({ hasText: email })).toHaveText(email);
      expect(new URL(page.url()).searchParams.has("email")).toBe(false);
      const retry = page.getByRole("link", { name: "Probar con otro correo", exact: true });
      await expect(retry).toHaveAttribute("href", "/recuperar/");
      await retry.click();
      await expect(page).toHaveURL(/\/recuperar\/?$/);
      await expect(page.getByRole("heading", { name: "Restablecer contraseña", exact: true })).toBeVisible();
      await expect(page.getByLabel("Correo electrónico")).toHaveValue("");
    }
  } finally {
    if (created.user) expect((await admin.auth.admin.deleteUser(created.user.id)).error).toBeNull();
  }
});

test("el perfil asocia y enfoca el usuario ocupado, conserva ediciones y repite el rechazo nativo", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const admin = localAdmin();
  const initial = await admin.from("profiles").select("username,display_name,bio").eq("id", owner).single();
  expect(initial.error).toBeNull();
  await signIn(page, "/perfil/?seccion=cuenta");
  const username = page.getByRole("textbox", { name: "Nombre de usuario", exact: true });
  const displayName = page.getByLabel("Nombre para mostrar", { exact: true });
  const bio = page.getByLabel("Bio", { exact: true });
  await username.fill("bruno_lp");
  await displayName.fill("Nombre todavía pendiente");
  await bio.fill("Bio todavía pendiente");
  for (let attempt = 0; attempt < 2; attempt++) {
    await displayName.focus();
    expect((await submit(page, "Guardar cambios")).status()).toBe(400);
    await expectUsernameError(page, "Ese nombre de usuario ya está tomado.");
    await expect(displayName).toHaveValue("Nombre todavía pendiente");
    await expect(bio).toHaveValue("Bio todavía pendiente");
  }
  expect((await admin.from("profiles").select("username,display_name,bio").eq("id", owner).single()).data).toEqual(initial.data);

  const nativeContext = await browser.newContext({
    baseURL,
    ...nativeContextOptions,
    storageState: await page.context().storageState(),
  });
  try {
    const native = await nativeContext.newPage();
    await native.goto("/perfil/?seccion=cuenta");
    await native.getByRole("textbox", { name: "Nombre de usuario", exact: true }).fill("bruno_lp");
    await native.getByLabel("Nombre para mostrar", { exact: true }).fill("Nombre nativo pendiente");
    expect((await submit(native, "Guardar cambios", "enter")).status()).toBe(400);
    await expectUsernameError(native, "Ese nombre de usuario ya está tomado.");
    await expect(native.getByLabel("Nombre para mostrar", { exact: true })).toHaveValue("Nombre nativo pendiente");
    expect((await admin.from("profiles").select("username,display_name,bio").eq("id", owner).single()).data).toEqual(initial.data);
  } finally {
    await nativeContext.close();
  }
});

test("onboarding señala el conflicto de usuario y conserva el destino y el nombre en POST nativo", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const admin = localAdmin();
  const initial = await admin.from("profiles").select("username,display_name").eq("id", owner).single();
  expect(initial.error).toBeNull();
  const href = "/onboarding/?next=%2Fc%2Fmar-del-plata";
  await signIn(page, href);
  await page.getByRole("textbox", { name: "Nombre de usuario", exact: true }).fill("bruno_lp");
  await page.getByLabel("Nombre para mostrar", { exact: true }).fill("Nombre pendiente de onboarding");
  expect((await submit(page, "Continuar")).status()).toBe(400);
  await expectUsernameError(page, "Ese nombre de usuario ya está tomado. Probá con otro.");
  await expect(page.getByLabel("Nombre para mostrar", { exact: true })).toHaveValue("Nombre pendiente de onboarding");
  await expect(page.locator('input[name="next"]')).toHaveValue("/c/mar-del-plata");
  expect((await admin.from("profiles").select("username,display_name").eq("id", owner).single()).data).toEqual(initial.data);

  const nativeContext = await browser.newContext({
    baseURL,
    ...nativeContextOptions,
    storageState: await page.context().storageState(),
  });
  try {
    const native = await nativeContext.newPage();
    await native.goto(href);
    await native.getByRole("textbox", { name: "Nombre de usuario", exact: true }).fill("bruno_lp");
    await native.getByLabel("Nombre para mostrar", { exact: true }).fill("Nombre nativo de onboarding");
    expect((await submit(native, "Continuar", "enter")).status()).toBe(400);
    await expectUsernameError(native, "Ese nombre de usuario ya está tomado. Probá con otro.");
    await expect(native.getByLabel("Nombre para mostrar", { exact: true })).toHaveValue("Nombre nativo de onboarding");
    await expect(native.locator('input[name="next"]')).toHaveValue("/c/mar-del-plata");
  } finally {
    await nativeContext.close();
  }
});

test("revisar residencia permanece accesible y respeta la ventana real de corrección", async ({ page }) => {
  test.setTimeout(90_000);
  const admin = localAdmin();
  const initial = await admin.from("profiles").select("home_community_id,residence_changed_at").eq("id", owner).single();
  expect(initial.error).toBeNull();
  expect(initial.data?.home_community_id).toBeTruthy();
  try {
    // Sólo ajusta la fecha del fixture local; no altera residencia, membresías,
    // documentos aceptados ni participación. Se restaura al salir.
    expect((await admin.from("profiles").update({ residence_changed_at: new Date().toISOString() }).eq("id", owner)).error).toBeNull();
    await signIn(page, "/perfil/");
    await expect(page.getByText("Próxima mudanza", { exact: false })).toBeVisible();
    await page.getByRole("link", { name: "Revisar residencia", exact: true }).click();
    await expect(page).toHaveURL(/\/perfil\/residencia\/?$/);
    await expect(page.getByRole("status").filter({ hasText: "Podés corregir una elección reciente durante 24 horas" })).toBeVisible();
    await page.goto("/perfil/residencia/?c=la-plata");
    await expect(page.getByRole("button", { name: "Confirmar cambio", exact: true })).toBeEnabled();

    expect((await admin.from("profiles").update({ residence_changed_at: new Date(Date.now() - 48 * 3600_000).toISOString() }).eq("id", owner)).error).toBeNull();
    await page.goto("/perfil/");
    await page.getByRole("link", { name: "Revisar residencia", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Cambiaste de residencia hace poco" })).toBeVisible();
    await page.goto("/perfil/residencia/?c=la-plata");
    await expect(page.getByRole("button", { name: "Confirmar cambio", exact: true })).toBeDisabled();
    expect((await admin.from("profiles").select("home_community_id").eq("id", owner).single()).data?.home_community_id).toBe(initial.data!.home_community_id);
  } finally {
    expect((await admin.from("profiles").update({ residence_changed_at: initial.data!.residence_changed_at }).eq("id", owner)).error).toBeNull();
  }
});

test("onboarding sin usuario elegido no se saltea y sugiere el usuario desde el nombre", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const admin = localAdmin();
  const initial = await admin.from("profiles").select("username,display_name").eq("id", owner).single();
  expect(initial.error).toBeNull();
  // El alta deja un `user_xxxx` hasta que la persona elige el suyo (D108).
  const placeholder = await admin
    .from("profiles")
    .update({ username: "user_0123456789ab", display_name: null })
    .eq("id", owner);
  expect(placeholder.error).toBeNull();
  try {
    await signIn(page, "/onboarding/?paso=lugar");
    await expect(page).toHaveURL((url) => url.pathname.replace(/\/$/, "") === "/onboarding" && !url.searchParams.has("paso"));
    const username = page.getByRole("textbox", { name: "Nombre de usuario", exact: true });
    await expect(username).toHaveValue("");
    await page.getByLabel("Nombre para mostrar", { exact: true }).fill("Sofía Rearte");
    await expect(username).toHaveValue("sofia_rearte");
    // Una vez editado a mano, el nombre para mostrar ya no lo pisa.
    await username.fill("sofi_mdq");
    await page.getByLabel("Nombre para mostrar", { exact: true }).fill("Sofía R.");
    await expect(username).toHaveValue("sofi_mdq");
  } finally {
    const restored = await admin.from("profiles").update(initial.data!).eq("id", owner);
    expect(restored.error).toBeNull();
  }
});
