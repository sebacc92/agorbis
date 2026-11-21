import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

type Kind = "project" | "poll" | "debate" | "claim";
const ownerId = "33333333-3333-4333-8333-333333333333";
const paths = { project: "proyectos", poll: "encuestas", debate: "debates", claim: "reclamos" };

function fixture(kind: Kind) {
  const id = crypto.randomUUID();
  const organization = crypto.randomUUID();
  const slug = `fuentes-guardadas-${id}`;
  const common = `select '${id}'::uuid, id, '${ownerId}'::uuid`;
  const community = `from public.communities where slug = 'mar-del-plata'`;
  const statements: Record<Kind, string> = {
    project: `insert into public.projects(id, community_id, author_id, title, summary, plan) ${common}, 'Proyecto para fuentes ${id}', 'Resumen verificable.', 'Plan verificable.' ${community};`,
    poll: `insert into public.polls(id, community_id, author_id, question, description, type, closes_at) ${common}, 'Encuesta para fuentes ${id}', 'Descripción verificable.', 'binary', now() + interval '7 days' ${community};`,
    debate: `insert into public.debates(id, community_id, author_id, title, body) ${common}, 'Debate para fuentes ${id}', 'Contexto verificable.' ${community};`,
    claim: `insert into public.claims(id, community_id, author_id, title, description, category) ${common}, 'Reclamo para fuentes ${id}', 'Descripción verificable.', 'infraestructura' ${community};`,
  };
  const table = { project: "projects", poll: "polls", debate: "debates", claim: "claims" }[kind];
  localCommunityFixture(`
    ${statements[kind]}
    insert into public.organizations(id, community_id, name, slug, type, verified_at)
    select '${organization}'::uuid, id, 'Institución de fuentes ${id}', '${slug}', 'institution', now() ${community};
    insert into public.organization_members(organization_id, user_id) values ('${organization}', '${ownerId}');
  `);
  return {
    id,
    href: `/${paths[kind]}/${id}/`,
    cleanup() {
      localCommunityFixture(`
        delete from public.content_sources where content_type = '${kind}' and content_id = '${id}';
        delete from public.institutional_responses where content_type = '${kind}' and content_id = '${id}';
        delete from public.${table} where id = '${id}';
        delete from public.organizations where id = '${organization}';
      `);
    },
  };
}

async function signIn(page: Page, href: string) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(href)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(href.replace(/\/$/, "") + "/?$"));
}

function sections(page: Page) {
  const sources = page.getByRole("region", { name: "Fuentes y documentos", exact: true });
  const responses = page.getByRole("region", { name: "Respuestas institucionales", exact: true });
  return { sources, responses, source: sources.locator("details"), response: responses.locator("details") };
}

for (const kind of ["project", "poll", "debate", "claim"] as const) {
  test(`${kind}: guardar fuentes y respuestas confirma y actualiza ambas listas en SPA`, async ({ page }) => {
    const content = fixture(kind);
    try {
      await signIn(page, content.href);
      const { sources, responses, source, response } = sections(page);
      const marker = crypto.randomUUID();
      const title = `Documento confirmado ${marker}`;
      const body = `Respuesta institucional confirmada ${marker}.`;
      // Una navegación de documento perdería esta marca, aun si la URL no cambia.
      await page.evaluate(() => { document.documentElement.dataset.extensionSpa = "preservado"; });
      await source.locator("summary").click();
      await source.locator('input[name="title"]').fill(title);
      await source.locator('input[name="url"]').fill(`https://example.com/${marker}`);
      await response.locator("summary").click();
      await response.locator('textarea[name="body"]').fill("Un borrador institucional que no envié todavía.");
      await source.getByRole("button", { name: "Guardar fuente" }).click();
      await expect(source.getByRole("status")).toContainText(`Se guardó la fuente “${title}”.`);
      await expect(sources.locator("li").filter({ hasText: title })).toHaveCount(1);
      await expect(source.locator('input[name="title"]')).toHaveValue("");
      await expect(source.locator('input[name="url"]')).toHaveValue("");
      await expect(response.locator('textarea[name="body"]')).toHaveValue("Un borrador institucional que no envié todavía.");
      await source.locator('input[name="title"]').fill("Otra fuente aún sin enviar");
      await response.locator('textarea[name="body"]').fill(body);
      await response.getByRole("button", { name: "Publicar respuesta verificada" }).click();
      await expect(response.getByRole("status")).toContainText("Se publicó la respuesta institucional.");
      await expect(responses.getByText(body, { exact: true })).toBeVisible();
      await expect(response.locator('textarea[name="body"]')).toHaveValue("");
      await expect(source.locator('input[name="title"]')).toHaveValue("Otra fuente aún sin enviar");
      expect(await page.evaluate(() => document.documentElement.dataset.extensionSpa)).toBe("preservado");
    } finally {
      content.cleanup();
    }
  });
}

test("fuentes y respuestas preservan ediciones en vuelo y confirman el POST nativo", async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000);
  const content = fixture("project");
  try {
    await signIn(page, content.href);
    const { sources, responses, source, response } = sections(page);
    await source.locator("summary").click();
    await response.locator("summary").click();
    for (const form of ["source", "source", "response", "response"] as const) {
      const marker = crypto.randomUUID();
      const body = `Respuesta institucional enviada ${marker}.`;
      const title = `Fuente enviada ${marker}`;
      const target = form === "source" ? source : response;
      if (form === "source") {
        await source.locator('input[name="title"]').fill(title);
        await source.locator('input[name="url"]').fill(`https://example.com/${marker}`);
      } else {
        await response.locator('textarea[name="body"]').fill(body);
        await response.locator('input[name="source_url"]').fill(`https://example.com/${marker}`);
      }
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
        await target.getByRole("button", { name: form === "source" ? "Guardar fuente" : "Publicar respuesta verificada" }).click();
        await intercepted;
        const edited = form === "source" ? target.locator('input[name="title"]') : target.locator('textarea[name="body"]');
        await edited.fill("Nuevo borrador editado durante el envío, todavía sin publicar.");
        release();
        await expect(target.getByRole("status")).toContainText("Los cambios sin enviar siguen en el formulario.");
        await expect(edited).toHaveValue("Nuevo borrador editado durante el envío, todavía sin publicar.");
        if (form === "source") await expect(sources.locator("li").filter({ hasText: title })).toHaveCount(1);
        else await expect(responses.getByText(body, { exact: true })).toBeVisible();
      } finally {
        release();
        await page.unroute("**/*qaction=*");
      }
    }

    const nativeContext = await browser.newContext({ baseURL, storageState: await page.context().storageState(), ...nativeContextOptions });
    try {
      const native = await nativeContext.newPage();
      await native.goto(content.href);
      const forms = sections(native);
      await forms.source.locator("summary").click();
      const nativeTitle = `Fuente nativa ${crypto.randomUUID()}`;
      await forms.source.locator('input[name="title"]').fill(nativeTitle);
      await forms.source.locator('input[name="url"]').fill("https://example.com/nativa-confirmada");
      await forms.source.getByRole("button", { name: "Guardar fuente" }).focus();
      await native.keyboard.press("Enter");
      await expect(forms.source.getByRole("status")).toContainText(`Se guardó la fuente “${nativeTitle}”.`);
      await expect(forms.sources.locator("li").filter({ hasText: nativeTitle })).toHaveCount(1);
      await expect(forms.source.locator('input[name="title"]')).toHaveValue("");
      await forms.response.locator("summary").click();
      const nativeBody = `Respuesta nativa confirmada ${crypto.randomUUID()}.`;
      await forms.response.locator('textarea[name="body"]').fill(nativeBody);
      await forms.response.getByRole("button", { name: "Publicar respuesta verificada" }).focus();
      await native.keyboard.press("Enter");
      await expect(forms.response.getByRole("status")).toContainText("Se publicó la respuesta institucional.");
      await expect(forms.responses.getByText(nativeBody, { exact: true })).toBeVisible();
      await expect(forms.response.locator('textarea[name="body"]')).toHaveValue("");
    } finally {
      await nativeContext.close();
    }
  } finally {
    content.cleanup();
  }
});
