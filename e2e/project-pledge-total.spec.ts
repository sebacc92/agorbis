import { expect, test } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

test("el total de personas supera la lista pública y se actualiza al aportar y retirar", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const projectId = crypto.randomUUID();
  const people = Array.from({ length: 52 }, () => crypto.randomUUID());
  const owner = "33333333-3333-4333-8333-333333333333";
  const users = people.map((id) => `'${id}'::uuid`).join(",");
  try {
    localCommunityFixture(`
      begin;
      insert into auth.users(instance_id, id, aud, role, email, encrypted_password,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
        id::text || '@agorbis.test', '', '{"provider":"email","providers":["email"]}',
        jsonb_build_object('username', 'cnt_' || left(replace(id::text, '-', ''), 12)), now(), now()
      from unnest(array[${users}]) id;
      insert into public.projects(id, community_id, author_id, title, summary, plan, budget_amount, currency, status)
      select '${projectId}', id, '${owner}', 'Conteo completo de compromisos',
        'Fixture local con más compromisos que filas visibles.',
        'Comprobar el total agregado sin exponer cuentas internas.', 100000, 'ARS', 'funding'
      from public.communities where slug = 'mar-del-plata';
      insert into public.project_pledges(project_id, user_id, amount, message)
      select '${projectId}', id, 100, 'Compromiso de prueba local.'
      from unnest(array[${users}]) id;
      commit;
    `);
    await page.goto(`/proyectos/${projectId}/`);
    const panel = page.locator("#aporte-proyecto");
    await expect(panel.getByText("52 personas comprometidas", { exact: true })).toBeVisible();
    await expect(panel.getByText("Se muestran los 50 compromisos más recientes.", { exact: true })).toBeVisible();
    await expect(panel.locator("ul > li")).toHaveCount(50);

    const nativeContext = await browser.newContext({ baseURL, ...nativeContextOptions });
    try {
      const native = await nativeContext.newPage();
      await native.goto(`/proyectos/${projectId}/`);
      await expect(native.locator("#aporte-proyecto").getByText("52 personas comprometidas", { exact: true })).toBeVisible();
      await expect(native.locator("#aporte-proyecto ul > li")).toHaveCount(50);
    } finally {
      await nativeContext.close();
    }

    await page.goto(`/ingresar/?next=${encodeURIComponent(`/proyectos/${projectId}`)}`);
    await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
    await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}/?$`));
    await panel.locator('input[name="amount"]').fill("250");
    await panel.getByRole("button", { name: "Comprometer aporte", exact: true }).click();
    await expect(panel.getByText("53 personas comprometidas", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Cambiar monto", exact: true }).click();
    await panel.locator('input[name="amount"]').fill("400");
    await panel.getByRole("button", { name: "Actualizar compromiso", exact: true }).click();
    await expect(panel.getByText("Te comprometiste con $ 400", { exact: true })).toBeVisible();
    await expect(panel.getByText("53 personas comprometidas", { exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Retirar compromiso", exact: true }).click();
    await panel.getByRole("button", { name: "Sí, retirar", exact: true }).click();
    await expect(panel.getByText("52 personas comprometidas", { exact: true })).toBeVisible();
    await expect(panel.locator("ul > li")).toHaveCount(50);
  } finally {
    localCommunityFixture(`
      begin;
      delete from public.notifications where entity_id = '${projectId}';
      delete from public.projects where id = '${projectId}';
      delete from auth.users where id in (${users});
      commit;
    `);
  }
});
