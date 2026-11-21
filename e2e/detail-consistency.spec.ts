import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

function localDb() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Se requiere Supabase local para buscar publicaciones de prueba.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// El reclamo comparte desde su barra fija y desde "Difundir" (D95).
const KINDS = [
  { table: "polls", path: "encuestas", share: true },
  { table: "debates", path: "debates", share: true },
  { table: "projects", path: "proyectos", share: true },
  { table: "claims", path: "reclamos", share: false },
] as const;

for (const kind of KINDS) {
  test(`${kind.path}: guardar y compartir bajo el título y reportar al final del artículo`, async ({ page }) => {
    const { data, error } = await localDb()
      .from(kind.table)
      .select("id")
      .neq("status", "removed")
      .limit(1)
      .single();
    expect(error).toBeNull();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${kind.path}/${data!.id}/`);

    const actions = page.locator("[data-detail-actions]");
    await expect(actions).toHaveCount(1);
    await expect(actions.getByRole("button", { name: "Guardar en favoritos", exact: true })).toBeVisible();
    await expect(actions.getByRole("button", { name: "Compartir", exact: true })).toHaveCount(kind.share ? 1 : 0);
    const title = page.locator("article h1").first();
    expect((await actions.boundingBox())!.y).toBeGreaterThan((await title.boundingBox())!.y);

    const report = page
      .locator("article")
      .getByRole("link", { name: "Ingresá para reportar este contenido", exact: true });
    await expect(report).toHaveCount(1);
    expect((await report.boundingBox())!.y).toBeGreaterThan((await actions.boundingBox())!.y);
  });
}

// Las encuestas iniciales de 0015 y buena parte del contenido inicial no tienen
// autor. `null === null` le dibujaba la gestión a quien no ingresó: parecía que
// cualquiera podía cerrar una votación, y al tocar la mandaba a ingresar sin
// explicar nada. Se filtra por un estado abierto para que la prueba no pase
// porque sí: una encuesta cerrada tampoco ofrece cerrarla.
const WITHOUT_AUTHOR = [
  { table: "polls", path: "encuestas", status: "active" },
  { table: "debates", path: "debates", status: "open" },
  { table: "projects", path: "proyectos", status: "proposal" },
  { table: "claims", path: "reclamos", status: "open" },
] as const;

const MANAGEMENT_CONTROLS = [
  "Zona del autor",
  "Cerrar la votación",
  "Agregar una fuente",
  "Vincular contenido existente",
  "Crear hito",
  "Crear tarea",
  "Actualizar proyecto",
];

for (const kind of WITHOUT_AUTHOR) {
  test(`${kind.path} sin autor: a quien no ingresó no se le ofrece la gestión`, async ({ page }) => {
    const { data, error } = await localDb()
      .from(kind.table)
      .select("id")
      .is("author_id", null)
      .eq("status", kind.status)
      .limit(1)
      .single();
    expect(error).toBeNull();
    await page.goto(`/${kind.path}/${data!.id}/`);

    // Lo que sí le corresponde sigue ahí: si la página no cargó, la ausencia
    // de los controles no probaría nada.
    await expect(page.locator("article h1").first()).toBeVisible();
    await expect(
      page.locator("article").getByRole("link", { name: "Ingresá para reportar este contenido", exact: true }),
    ).toHaveCount(1);
    for (const control of MANAGEMENT_CONTROLS) {
      await expect(page.getByText(control, { exact: true }), control).toHaveCount(0);
    }
  });
}

test("la cabecera de la encuesta lleva tres insignias como máximo", async ({ page }) => {
  const { data, error } = await localDb()
    .from("polls")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .single();
  expect(error).toBeNull();
  await page.goto(`/encuestas/${data!.id}/`);
  const badges = page.locator("[data-detail-badges] > span");
  expect(await badges.count()).toBeGreaterThan(0);
  expect(await badges.count()).toBeLessThanOrEqual(3);
});

// El debate apilaba cinco: tipo, "Debate abierto", columnas, comentarios y
// lectura. Los conteos pasaron a la línea de datos (D126).
test("la cabecera del debate lleva tres insignias como máximo", async ({ page }) => {
  const { data, error } = await localDb()
    .from("debates")
    .select("id")
    .eq("status", "open")
    .limit(1)
    .single();
  expect(error).toBeNull();
  await page.goto(`/debates/${data!.id}/`);
  const badges = page.locator("[data-detail-badges] > span");
  expect(await badges.count()).toBeGreaterThan(0);
  expect(await badges.count()).toBeLessThanOrEqual(3);
});
