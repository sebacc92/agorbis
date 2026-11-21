import { expect, test, type Page } from "@playwright/test";
import {
  createLegalTestAccount,
  signInTestAccount,
} from "./account-followup-fixtures";

const bottomNav = (page: Page) =>
  page.getByRole("navigation", { name: "Navegación principal inferior" });

async function signInResident(page: Page, path: string) {
  const url = process.env.PUBLIC_SUPABASE_URL;
  if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Estas pruebas sólo pueden usar Supabase local.");
  }
  await page.goto(`/ingresar/?next=${encodeURIComponent(path)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === path, {
    timeout: 20_000,
  });
}

test("con residencia, la portada y el logo llevan al inicio y la barra ofrece su comunidad", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signInResident(page, "/explorar/");

  await page.goto("/");
  await expect(page).toHaveURL(
    (url) => url.pathname.replace(/\/$/, "") === "/inicio",
  );
  await expect(
    page.getByRole("link", { name: "Agorbis · Inicio", exact: true }),
  ).toHaveAttribute("href", "/inicio");

  const nav = bottomNav(page);
  const home = nav.getByRole("link", { name: "Mi comunidad", exact: true });
  await expect(home).toHaveAttribute("href", "/c/mar-del-plata");
  await expect(nav.getByRole("link", { name: "Explorar" })).toHaveCount(0);
  await expect(
    nav.getByRole("link", { name: "Notificaciones", exact: true }),
  ).toBeVisible();
  await home.click();
  await expect(page).toHaveURL(
    (url) => url.pathname.replace(/\/$/, "") === "/c/mar-del-plata",
  );
  await expect(home).toHaveAttribute("aria-current", "page");
});

test("sin residencia, la portada lleva a elegirla", async ({ page }) => {
  test.setTimeout(90_000);
  const actor = await createLegalTestAccount("portada-sin-residencia");
  try {
    await signInTestAccount(page, actor.email, "/explorar/");
    await page.goto("/");
    await expect(page).toHaveURL(
      (url) => url.pathname.replace(/\/$/, "") === "/onboarding",
    );
  } finally {
    expect(
      (await actor.admin.auth.admin.deleteUser(actor.id)).error,
    ).toBeNull();
  }
});

test("sin sesión, la barra inferior ofrece un solo acceso para ingresar y volver", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/c/mar-del-plata/");
  const nav = bottomNav(page);
  await expect(
    nav.getByRole("link", { name: "Notificaciones" }),
  ).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Perfil" })).toHaveCount(0);
  await expect(
    nav.getByRole("link", { name: "Explorar", exact: true }),
  ).toBeVisible();
  const signIn = nav.getByRole("link", { name: "Ingresar", exact: true });
  const destination = new URL(
    (await signIn.getAttribute("href"))!,
    "http://localhost",
  );
  expect(destination.pathname).toBe("/ingresar");
  expect(destination.searchParams.get("next")).toBe("/c/mar-del-plata/");
});

test("con sesión, la cabecera muestra la navegación desde 1024 px sin duplicar destinos", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 800 });
  await signInResident(page, "/explorar/");
  const header = page.locator("header").first();
  const nav = header.getByRole("navigation", { name: "Principal", exact: true });
  await expect(nav).toBeVisible();
  await expect(
    nav.getByRole("link", { name: "Mi comunidad" }),
  ).toHaveAttribute("href", "/c/mar-del-plata");
  // El buscador ya busca en todo: no hay un "Buscar" aparte.
  await expect(header.getByRole("link", { name: "Buscar", exact: true })).toHaveCount(0);
  await expect(
    header.getByRole("button", { name: "Abrir menú" }),
  ).toBeHidden();
  expect(
    await header.evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);

  await header.getByRole("button", { name: /^Menú de / }).click();
  // El pie tiene otra navegación "Cuenta": se busca la del menú.
  const account = header.getByRole("navigation", {
    name: "Cuenta",
    exact: true,
  });
  await expect(account.getByRole("link", { name: "Mi perfil", exact: true })).toBeVisible();
  await expect(account.getByText("Preferencias", { exact: true })).toBeVisible();
  // Etiqueta fija + `aria-pressed` (D98): el botón se llama igual en los dos
  // modos y el estado lo dice `aria-pressed`.
  await expect(
    account.getByRole("button", { name: "Modo oscuro", exact: true }),
  ).toBeVisible();
  await account.locator("summary").click();
  await expect(account.getByRole("link", { name: "English" })).toBeInViewport();
  for (const duplicate of ["Mi inicio", "Explorar comunidades", "Buscar"]) {
    await expect(account.getByRole("link", { name: duplicate, exact: true })).toHaveCount(0);
  }
});
