import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

const seededProject = "f0000000-0000-4000-8000-000000000001";
const ownerId = "33333333-3333-4333-8333-333333333333";

function localAdmin() {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (
    !url ||
    !key ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
  ) {
    throw new Error(
      "Esta prueba sólo puede escribir fixtures en Supabase local.",
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signIn(page: Page, projectId: string) {
  await page.goto(
    `/ingresar/?next=${encodeURIComponent(`/proyectos/${projectId}`)}`,
  );
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/proyectos/${projectId}/?$`));
}

test("el acceso móvil al aporte usa un ancla accesible sin ocupar la navegación inferior", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/proyectos/${seededProject}`);
  const cta = page.getByRole("link", {
    name: "Ver opciones de aporte",
    exact: true,
  });
  const panel = page.getByRole("complementary", { name: "Apoyo comprometido" });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "#aporte-proyecto");
  await expect(cta).toHaveCSS("position", /^(static|relative)$/);
  await cta.scrollIntoViewIfNeeded();
  const ctaBox = await cta.boundingBox();
  const navBox = await page
    .getByRole("navigation", { name: "Navegación principal inferior" })
    .boundingBox();
  expect(ctaBox!.y + ctaBox!.height).toBeLessThanOrEqual(navBox!.y);
  await cta.click();
  await expect(page).toHaveURL(/#aporte-proyecto$/);
  await expect(panel).toBeFocused();
  await expect(
    panel.getByRole("heading", { name: "Apoyo comprometido", exact: true }),
  ).toBeInViewport();
  const login = new URL(
    (await panel
      .getByRole("link", { name: "Ingresar para comprometerme", exact: true })
      .getAttribute("href"))!,
    page.url(),
  );
  expect(login.searchParams.get("next")).toBe(
    `/proyectos/${seededProject}#aporte-proyecto`,
  );
  await page.goBack();
  await expect(page).toHaveURL((url) => !url.hash);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(cta).toBeHidden();

  const nativeContext = await browser.newContext({
    baseURL,
    ...nativeContextOptions,
    viewport: { width: 320, height: 740 },
  });
  try {
    const native = await nativeContext.newPage();
    await native.goto(`/proyectos/${seededProject}`);
    await native
      .getByRole("link", { name: "Ver opciones de aporte", exact: true })
      .click();
    await expect(native).toHaveURL(/#aporte-proyecto$/);
    await expect(native.locator("#aporte-proyecto")).toBeFocused();
    await expect(
      native.getByRole("heading", { name: "Apoyo comprometido", exact: true }),
    ).toBeInViewport();
  } finally {
    await nativeContext.close();
  }
});

test("Q&A confirma lo guardado y conserva otros borradores, ediciones durante el envío y rechazos nativos", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const db = localAdmin();
  const projectId = crypto.randomUUID();
  const firstId = crypto.randomUUID();
  const secondId = crypto.randomUUID();
  const { data: community, error: communityError } = await db
    .from("communities")
    .select("id")
    .eq("slug", "mar-del-plata")
    .single();
  expect(communityError).toBeNull();
  let nativeContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    // Los fixtures se limitan al PostgreSQL local. Los envíos se prueban con
    // la sesión real de la autora y las mismas policies de participación.
    localCommunityFixture(`
      begin;
      insert into public.projects(id, community_id, author_id, title, summary, plan)
      values ('${projectId}', '${community!.id}', '${ownerId}', 'Q&A con borradores independientes', 'Proyecto local para verificar preguntas y respuestas.', 'Revisar las propuestas con la comunidad.');
      insert into public.project_comments(id, project_id, user_id, body)
      values ('${firstId}', '${projectId}', '${ownerId}', 'Primera pregunta del fixture'),
        ('${secondId}', '${projectId}', '${ownerId}', 'Segunda pregunta del fixture');
      commit;
    `);
    await signIn(page, projectId);
    const formFor = (id: string) =>
      page.locator("form").filter({
        has: page.locator(`input[name="parent_id"][value="${id}"]`),
      });
    const first = formFor(firstId);
    const second = formFor(secondId);
    const question = page.locator("form").filter({
      has: page.locator("#nueva-pregunta"),
    });
    await second.getByRole("textbox").fill("Respuesta todavía en edición.");
    await question.getByRole("textbox").fill("Pregunta todavía en edición.");
    const firstBody = `Respuesta confirmada ${crypto.randomUUID()}`;
    await first.getByRole("textbox").fill(firstBody);
    await first.getByRole("button", { name: "Responder", exact: true }).click();
    await expect(first.getByRole("status")).toContainText(
      "Tu respuesta se publicó.",
    );
    await expect(first.getByRole("textbox")).toHaveValue("");
    await expect(second.getByRole("textbox")).toHaveValue(
      "Respuesta todavía en edición.",
    );
    await expect(question.getByRole("textbox")).toHaveValue(
      "Pregunta todavía en edición.",
    );
    const { data: posted, error: postedError } = await db
      .from("project_comments")
      .select("id, parent_id, body")
      .eq("project_id", projectId)
      .eq("body", firstBody)
      .single();
    expect(postedError).toBeNull();
    expect(posted!.parent_id).toBe(firstId);
    const permalink = first.getByRole("link", {
      name: "Ver mensaje publicado",
      exact: true,
    });
    await expect(permalink).toHaveAttribute(
      "href",
      `/proyectos/${projectId}?mensaje=${posted!.id}#project-comment-${posted!.id}`,
    );
    await permalink.click();
    await expect(question.getByRole("textbox")).toHaveValue(
      "Pregunta todavía en edición.",
    );
    await expect(second.getByRole("textbox")).toHaveValue(
      "Respuesta todavía en edición.",
    );
    await expect(page).toHaveURL(new RegExp(`#project-comment-${posted!.id}$`));
    await expect(page.locator(`#project-comment-${posted!.id}`)).toBeFocused();
    await expect(page.locator(`#project-comment-${posted!.id}`)).toContainText(
      firstBody,
    );

    let releasePost!: () => void;
    let observePost!: () => void;
    const release = new Promise<void>((resolve) => (releasePost = resolve));
    const observed = new Promise<void>((resolve) => (observePost = resolve));
    await page.route(
      (url) => url.pathname.replace(/\/$/, "") === `/proyectos/${projectId}`,
      async (route) => {
        if (route.request().method() === "POST") {
          observePost();
          await release;
        }
        await route.continue();
      },
    );
    await question
      .getByRole("button", { name: "Preguntar", exact: true })
      .click();
    await observed;
    await expect(question.getByRole("status")).toHaveCount(0);
    await question
      .getByRole("textbox")
      .fill("Otra pregunta que sigo preparando.");
    releasePost();
    await expect(question.getByRole("status")).toContainText(
      "Tu pregunta se publicó.",
    );
    await expect(question.getByRole("textbox")).toHaveValue(
      "Otra pregunta que sigo preparando.",
    );
    await expect(second.getByRole("textbox")).toHaveValue(
      "Respuesta todavía en edición.",
    );
    expect(
      (
        await db
          .from("project_comments")
          .select("id")
          .eq("project_id", projectId)
          .eq("body", "Pregunta todavía en edición.")
      ).data,
    ).toHaveLength(1);

    nativeContext = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
      storageState: await page.context().storageState(),
    });
    const native = await nativeContext.newPage();
    await native.goto(`/proyectos/${projectId}`);
    const nativeQuestion = native.locator("form").filter({
      has: native.locator("#nueva-pregunta"),
    });
    await nativeQuestion.getByRole("textbox").fill("   ");
    const submitNative = async () => {
      const response = native.waitForResponse(
        (response) => response.request().method() === "POST",
      );
      await nativeQuestion
        .getByRole("button", { name: "Preguntar", exact: true })
        .click();
      return response;
    };
    expect((await submitNative()).status()).toBe(400);
    await expect(nativeQuestion.getByRole("alert")).toHaveText("Escribí algo.");
    await expect(nativeQuestion.getByRole("textbox")).toHaveValue("   ");
    await expect(nativeQuestion.getByRole("status")).toHaveCount(0);

    const nativeBody = `Pregunta nativa ${crypto.randomUUID()}`;
    await nativeQuestion.getByRole("textbox").fill(nativeBody);
    expect((await submitNative()).status()).toBe(200);
    await expect(nativeQuestion.getByRole("status")).toContainText(
      "Tu pregunta se publicó.",
    );
    await expect(nativeQuestion.getByRole("textbox")).toHaveValue("");
    const { data: nativePosted, error: nativeError } = await db
      .from("project_comments")
      .select("id")
      .eq("project_id", projectId)
      .eq("body", nativeBody)
      .single();
    expect(nativeError).toBeNull();
    await expect(
      native.locator(`#project-comment-${nativePosted!.id}`),
    ).toContainText(nativeBody);
  } finally {
    await nativeContext?.close();
    expect(
      (await db.from("notifications").delete().eq("entity_id", projectId))
        .error,
    ).toBeNull();
    expect(
      (await db.from("projects").delete().eq("id", projectId)).error,
    ).toBeNull();
  }
});
