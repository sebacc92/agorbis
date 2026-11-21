import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

const owner = "33333333-3333-4333-8333-333333333333";
const paths = { project: "proyectos", claim: "reclamos", poll: "encuestas", debate: "debates" };
type Kind = keyof typeof paths;
function fixture(kind: Kind) {
  const id = crypto.randomUUID();
  const targetId = crypto.randomUUID();
  const targetTitle = `Destino nativo ${targetId}`;
  const common = `select '${id}'::uuid, id, '${owner}'::uuid`;
  const community = "from public.communities where slug='mar-del-plata'";
  const statements = {
    project: `insert into public.projects(id, community_id, author_id, title, summary, plan) ${common}, 'Proyecto ${id}', 'Resumen verificable.', 'Plan verificable.' ${community};`,
    claim: `insert into public.claims(id, community_id, author_id, title, description, category) ${common}, 'Reclamo ${id}', 'Problema verificable.', 'infraestructura' ${community};`,
    poll: `insert into public.polls(id, community_id, author_id, question, description, type, closes_at) ${common}, 'Encuesta ${id}', 'Consulta verificable.', 'binary', now()+interval '7 days' ${community};`,
    debate: `insert into public.debates(id, community_id, author_id, title, body) ${common}, 'Debate ${id}', 'Contexto verificable.' ${community};`,
  };
  const table = { project: "projects", claim: "claims", poll: "polls", debate: "debates" }[kind];
  localCommunityFixture(`${statements[kind]}
    insert into public.debates(id, community_id, author_id, title, body)
    select '${targetId}', id, '${owner}', '${targetTitle}', 'Destino verificable para relaciones.' ${community};`);
  return { id, targetId, targetTitle, href: `/${paths[kind]}/${id}/`, count() {
    return Number(localCommunityFixture(`select count(*) from public.content_relations where source_id='${id}';`).match(/\n\s*(\d+)\s*\n/)?.[1]);
  }, cleanup() {
    localCommunityFixture(`delete from public.content_relations where source_id='${id}' or target_id='${targetId}'; delete from public.${table} where id='${id}'; delete from public.debates where id='${targetId}';`);
  } };
}
async function signIn(page: Page, href: string) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(href)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(/\S+/, { timeout: 20_000 });
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(href + "$"));
}
async function openSearch(page: Page) {
  const region = page.getByRole("region", { name: "Contenido relacionado", exact: true });
  await region.locator("summary").click();
  await region.getByLabel("Relación", { exact: false }).selectOption("proposal_for");
  await region.getByRole("combobox", { name: "Buscar por título", exact: true }).fill("Destino");
  await region.getByLabel("Tipo de contenido", { exact: true }).selectOption("debate");
  await region.getByRole("button", { name: "Buscar publicaciones en otra página", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Buscar una publicación para vincular", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("relation_type")).toBe("proposal_for");
  await expect(page.getByLabel("Buscar por título", { exact: true })).toHaveValue("Destino");
  await expect(page.getByLabel("Tipo de contenido", { exact: true })).toHaveValue("debate");
}
async function searchTarget(page: Page, content: ReturnType<typeof fixture>) {
  await page.getByLabel("Buscar por título", { exact: true }).fill(content.targetTitle);
  await page.getByLabel("Tipo de contenido", { exact: true }).selectOption("debate");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  return page.getByRole("link").filter({ has: page.getByRole("heading", { name: content.targetTitle, exact: true }) });
}

test.setTimeout(90_000);
for (const kind of ["project", "claim", "poll", "debate"] as const) {
  test(`${kind}: HTML permite buscar, revisar y confirmar la relación sin perder su tipo`, async ({ page, browser, baseURL }) => {
    const content = fixture(kind);
    const native = await browser.newContext({ baseURL, ...nativeContextOptions });
    try {
      await signIn(page, content.href);
      await native.addCookies(await page.context().cookies());
      const html = await native.newPage();
      await html.goto(content.href);
      await openSearch(html);
      const selected = await searchTarget(html, content);
      expect(content.count()).toBe(0);
      await selected.click();
      const region = html.getByRole("region", { name: "Contenido relacionado", exact: true });
      await expect(region.locator('input[name="target_id"]')).toHaveValue(content.targetId);
      await expect(region.getByRole("group", { name: "Buscar por título", exact: true })).toContainText(content.targetTitle);
      await expect(region.getByLabel("Relación", { exact: false })).toHaveValue("proposal_for");
      expect(content.count()).toBe(0);
      const accepted = html.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("qaction"));
      await region.getByRole("button", { name: "Vincular", exact: true }).click();
      expect((await accepted).status()).toBe(200);
      await expect(region.getByRole("status")).toContainText("Se vinculó la publicación.");
      await expect(region.getByRole("link", { name: new RegExp(content.targetTitle) })).toBeVisible();
      expect(content.count()).toBe(1);
    } finally { await native.close(); content.cleanup(); }
  });
}

test("la búsqueda mejorada conserva la relación y el título se verifica en servidor", async ({ page }) => {
  const content = fixture("project");
  try {
    await signIn(page, content.href);
    await openSearch(page);
    const selected = await searchTarget(page, content);
    const href = await selected.getAttribute("href");
    expect(href).toBeTruthy();
    const tampered = new URL(href!, page.url());
    tampered.searchParams.set("vincular_titulo", "Título falsificado desde la URL");
    await page.goto(tampered.href);
    const region = page.getByRole("region", { name: "Contenido relacionado", exact: true });
    await expect(region.getByRole("group", { name: "Buscar por título", exact: true })).toContainText(content.targetTitle);
    await expect(region.getByLabel("Relación", { exact: false })).toHaveValue("proposal_for");
    await expect(region).not.toContainText("Título falsificado desde la URL");
    expect(content.count()).toBe(0);
    localCommunityFixture(`update public.debates set status='removed' where id='${content.targetId}';`);
    await page.reload();
    await expect(region).toContainText("La publicación seleccionada no está disponible. Volvé a buscarla.");
    await expect(region.locator('input[name="target_id"]')).toHaveValue("");
    expect(content.count()).toBe(0);
  } finally { content.cleanup(); }
});
