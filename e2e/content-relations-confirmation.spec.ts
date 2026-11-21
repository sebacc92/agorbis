import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";

const owner = "33333333-3333-4333-8333-333333333333";
const paths = { project: "proyectos", claim: "reclamos", poll: "encuestas", debate: "debates" };
type Kind = keyof typeof paths;
function fixture(kind: Kind) {
  const id = crypto.randomUUID();
  const targetId = crypto.randomUUID();
  const targetTitle = `Destino relacionado ${targetId}`;
  const common = `select '${id}'::uuid, id, '${owner}'::uuid`;
  const community = "from public.communities where slug='mar-del-plata'";
  const statements = {
    project: `insert into public.projects(id, community_id, author_id, title, summary, plan) ${common}, 'Proyecto relacionado ${id}', 'Resumen verificable.', 'Plan verificable.' ${community};`,
    claim: `insert into public.claims(id, community_id, author_id, title, description, category) ${common}, 'Reclamo relacionado ${id}', 'Problema verificable.', 'infraestructura' ${community};`,
    poll: `insert into public.polls(id, community_id, author_id, question, description, type, closes_at) ${common}, 'Encuesta relacionada ${id}', 'Consulta verificable.', 'binary', now()+interval '7 days' ${community};`,
    debate: `insert into public.debates(id, community_id, author_id, title, body) ${common}, 'Debate relacionado ${id}', 'Contexto verificable.' ${community};`,
  };
  const table = { project: "projects", claim: "claims", poll: "polls", debate: "debates" }[kind];
  localCommunityFixture(`${statements[kind]}
    insert into public.debates(id, community_id, author_id, title, body)
    select '${targetId}', id, '${owner}', '${targetTitle}', 'Destino verificable para relaciones.' ${community};
  `);
  return { id, targetId, targetTitle, href: `/${paths[kind]}/${id}/`, cleanup() {
    localCommunityFixture(`delete from public.content_relations where source_id='${id}' or target_id='${targetId}'; delete from public.${table} where id='${id}'; delete from public.debates where id='${targetId}';`);
  } };
}
async function signIn(page: Page, href: string) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(href)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(href.replace(/\/$/, "") + "/?$"));
}
async function choose(page: Page, content: ReturnType<typeof fixture>) {
  const region = page.getByRole("region", { name: "Contenido relacionado", exact: true });
  await region.locator("summary").click();
  await region.getByRole("combobox", { name: "Buscar por título", exact: true }).fill(content.targetTitle);
  await region.getByRole("option").filter({ hasText: content.targetTitle }).click();
  await expect(region.locator('input[name="target_id"]')).toHaveValue(content.targetId);
  await region.getByLabel("Relación", { exact: false }).selectOption("follow_up");
  return region;
}
for (const kind of ["project", "claim", "poll", "debate"] as const) {
  test(`${kind}: vincular confirma y actualiza la lista sin borrar otro borrador`, async ({ page }) => {
    const content = fixture(kind);
    try {
      await signIn(page, content.href);
      const sources = page.getByRole("region", { name: "Fuentes y documentos", exact: true });
      await sources.locator("summary").click();
      await sources.locator('input[name="title"]').fill("Fuente todavía sin enviar");
      const region = await choose(page, content);
      await page.evaluate(() => { document.documentElement.dataset.relationSpa = "preservado"; });
      await region.getByRole("button", { name: "Vincular", exact: true }).click();
      await expect(region.getByRole("status")).toContainText("Se vinculó la publicación.");
      await expect(region.getByRole("link", { name: new RegExp(content.targetTitle) })).toHaveAttribute("href", `/debates/${content.targetId}`);
      await expect(sources.locator('input[name="title"]')).toHaveValue("Fuente todavía sin enviar");
      expect(await page.evaluate(() => document.documentElement.dataset.relationSpa)).toBe("preservado");
    } finally { content.cleanup(); }
  });
}
test("un rechazo nativo conserva la publicación y la relación elegidas y permite reintentar", async ({ page, context }) => {
  test.setTimeout(90_000);
  const content = fixture("project");
  try {
    await signIn(page, content.href);
    await choose(page, content);
    localCommunityFixture(`update public.debates set status='removed' where id='${content.targetId}';`);
    // Conserva una selección real hecha en UI y prueba pérdida de JavaScript
    // durante la corrección: el POST y su documento de respuesta son nativos.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setScriptExecutionDisabled", { value: true });
    const region = page.getByRole("region", { name: "Contenido relacionado", exact: true });
    const rejected = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("qaction"));
    await region.getByRole("button", { name: "Vincular", exact: true }).focus();
    await page.keyboard.press("Enter");
    expect((await rejected).status()).toBe(400);
    await expect(region.getByText("No se vinculó la publicación", { exact: true })).toBeVisible();
    await expect(region.locator('input[name="target_id"]')).toHaveValue(content.targetId);
    await expect(region.getByLabel("Relación", { exact: false })).toHaveValue("follow_up");
    await expect(region.getByRole("group", { name: "Buscar por título", exact: true })).toContainText(content.targetTitle);
    localCommunityFixture(`update public.debates set status='open' where id='${content.targetId}';`);
    const accepted = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("qaction"));
    await region.getByRole("button", { name: "Vincular", exact: true }).focus();
    await page.keyboard.press("Enter");
    expect((await accepted).status()).toBe(200);
    await expect(region.getByRole("status")).toContainText("Se vinculó la publicación.");
    await expect(region.getByRole("link", { name: new RegExp(content.targetTitle) })).toBeVisible();
  } finally { content.cleanup(); }
});
