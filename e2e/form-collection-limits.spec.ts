import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Las tres acciones que aceptan arrays de formulario rechazan miles de
 * valores antes de que corra ningún esquema (D100). Se habla con el endpoint
 * real de cada acción, con la sesión de la persona, y se distingue el 400 del
 * guardia del 400 de Zod: el primero trae su mensaje, el segundo no. El
 * router sólo arma un array con claves `campo[]` (o índices `campo.0`); una
 * clave repetida sin sufijo se pisa, así que la inundación usa el sufijo.
 */
const GUARD_MESSAGE = "más valores de los que admite el formulario";

async function login(page: Page) {
  await page.goto("/ingresar/?next=%2Finicio%2F");
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio\/?$/);
}

/** URL de la acción del formulario que contiene ese campo. */
async function actionUrl(page: Page, field: string) {
  const form = page.locator(`form:has([name="${field}"])`).first();
  const action = await form.getAttribute("action");
  expect(action, `formulario con ${field}`).toMatch(/qaction=/);
  return new URL(action!, page.url()).href;
}

async function post(page: Page, url: string, params: URLSearchParams) {
  return page.request.post(url, {
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
      origin: new URL(url).origin,
    },
    data: params.toString(),
  });
}

function flood(field: string, count: number, extra: Record<string, string>) {
  const params = new URLSearchParams(extra);
  for (let i = 0; i < count; i++) params.append(field, "no-es-un-valor");
  return params;
}

test("votar, crear encuesta y publicar reclamo cortan miles de valores antes de validar", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || !["127.0.0.1", "localhost"].includes(new URL(url).hostname))
    throw new Error("Se requiere Supabase local.");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: poll, error } = await db
    .from("polls")
    .select("id")
    .eq("status", "active")
    .gt("closes_at", new Date().toISOString())
    .limit(1)
    .single();
  expect(error).toBeNull();

  await login(page);

  const cases: {
    name: string;
    path: string;
    form: string;
    field: string;
    extra: Record<string, string>;
  }[] = [
    {
      name: "voto",
      path: `/encuestas/${poll!.id}/`,
      form: "option_id",
      field: "option_id[]",
      extra: { poll_id: poll!.id },
    },
    {
      name: "encuesta nueva",
      path: "/c/mar-del-plata/encuestas/nueva/",
      form: "question",
      field: "options[]",
      extra: { question: "¿Qué priorizamos?", type: "single" },
    },
    {
      name: "reclamo nuevo",
      path: "/c/mar-del-plata/reclamos/nuevo/",
      form: "title",
      field: "image_paths[]",
      extra: { title: "Vereda", description: "Rota", category: "infraestructura" },
    },
  ];
  for (const item of cases) {
    await page.goto(item.path);
    const endpoint = await actionUrl(page, item.form);

    const rejected = await post(page, endpoint, flood(item.field, 5_000, item.extra));
    expect(rejected.status(), `${item.name}: 5.000 valores`).toBe(400);
    expect(await rejected.text(), `${item.name}: mensaje del guardia`).toContain(
      GUARD_MESSAGE,
    );

    // Dentro del tope el guardia no interviene: lo que rechaza es el esquema
    // (o la acción), con su propio mensaje.
    const within = await post(page, endpoint, flood(item.field, 3, item.extra));
    expect(within.status(), `${item.name}: 3 valores`).toBeLessThan(500);
    expect(await within.text(), `${item.name}: sin mensaje del guardia`).not.toContain(
      GUARD_MESSAGE,
    );
  }
});
