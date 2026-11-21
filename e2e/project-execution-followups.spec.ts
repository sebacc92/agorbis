import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

const owner = "33333333-3333-4333-8333-333333333333";
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
function fixture(id: string) {
  localCommunityFixture(`insert into public.projects(id,community_id,author_id,title,summary,plan)
    select ${literal(id)}::uuid,id,'${owner}','Ejecución verificable','Proyecto local para verificar cambios confirmados.','Coordinar tareas y documentación pública.' from public.communities where slug='mar-del-plata';`);
}
async function login(page: Page, id: string) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(`/proyectos/${id}/`)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/proyectos/${id}/?$`));
}
const execution = (page: Page) =>
  page.locator('section[aria-labelledby="ejecucion-titulo"]');
const createForm = (page: Page, kind: "milestone" | "task" | "contribution") =>
  execution(page)
    .locator("form")
    .filter({ has: page.locator(`[id^="execution-${kind}-"]`) });
async function openForm(
  page: Page,
  kind: "milestone" | "task" | "contribution",
) {
  const form = createForm(page, kind);
  const details = form.locator("..");
  if (!(await details.getAttribute("open"))) {
    if (
      !(await details.evaluate(
        (element) => (element as HTMLDetailsElement).open,
      ))
    )
      await details.locator("summary").click();
  }
  return form;
}

test("ejecución confirma altas y estados y conserva borradores posteriores e independientes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const id = crypto.randomUUID();
  try {
    fixture(id);
    await login(page, id);
    const milestone = await openForm(page, "milestone");
    await milestone
      .getByRole("textbox", { name: "Hito", exact: true })
      .fill("Hito confirmado");
    await milestone
      .getByRole("button", { name: "Crear hito", exact: true })
      .click();
    await expect(
      execution(page).getByRole("heading", {
        name: "Hito confirmado",
        exact: true,
      }),
    ).toBeVisible();
    await expect(milestone.getByRole("status")).toHaveText("El hito se creó.");
    await expect(milestone.locator('[name="title"]')).toHaveValue("");
    const task = await openForm(page, "task");
    await task
      .getByRole("textbox", { name: "Tarea", exact: true })
      .fill("Borrador independiente");
    await milestone.locator('[name="title"]').fill("Hito enviado con espera");
    await milestone.locator('[name="description"]').fill("Detalle enviado");
    let release = () => {};
    let arrived = () => {};
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const submitted = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    await page.route("**/*qaction=*", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      arrived();
      await pending;
      await route.continue();
    });
    try {
      await milestone
        .getByRole("button", { name: "Crear hito", exact: true })
        .click();
      await submitted;
      await milestone
        .locator('[name="description"]')
        .fill("Detalle editado mientras esperaba");
      release();
      await expect(
        execution(page).getByRole("heading", {
          name: "Hito enviado con espera",
          exact: true,
        }),
      ).toBeVisible();
      await expect(milestone.locator('[name="description"]')).toHaveValue(
        "Detalle editado mientras esperaba",
      );
      await expect(task.locator('[name="title"]')).toHaveValue(
        "Borrador independiente",
      );
    } finally {
      release();
      await page.unroute("**/*qaction=*");
    }
    await task.locator('[name="title"]').fill("Tarea confirmada");
    await task
      .getByRole("button", { name: "Crear tarea", exact: true })
      .click();
    await expect(task.getByRole("status")).toHaveText("La tarea se creó.");
    const taskState = execution(page).getByLabel(
      "Estado de la tarea Tarea confirmada",
      { exact: true },
    );
    await expect(taskState).toBeVisible();
    await taskState.selectOption("in_progress");
    const taskUpdate = taskState.locator("..");
    await taskUpdate
      .getByRole("button", {
        name: "Guardar el estado de Tarea confirmada",
        exact: true,
      })
      .click();
    await expect(taskUpdate.getByRole("status")).toHaveText(
      "El estado se guardó.",
    );
    await expect(taskState).toHaveValue("in_progress");
    expect(
      localCommunityFixture(
        `select status from public.project_tasks where project_id=${literal(id)}::uuid;`,
      ),
    ).toContain("in_progress");
    await taskState.selectOption("completed");
    await taskUpdate
      .getByRole("button", {
        name: "Guardar el estado de Tarea confirmada",
        exact: true,
      })
      .click();
    await expect(taskUpdate.getByRole("status")).toHaveText(
      "El estado se guardó.",
    );
    await expect(taskState.locator("..").locator("..")).toContainText(
      "Tarea confirmada",
    );
    await expect(taskState).toHaveValue("completed");
    await expect(
      execution(page).getByText("Tarea confirmada", { exact: true }),
    ).toHaveClass(/line-through/);
    expect(
      localCommunityFixture(
        `select status from public.project_tasks where project_id=${literal(id)}::uuid;`,
      ),
    ).toContain("completed");
    const milestoneUpdate = execution(page)
      .locator("form")
      .filter({
        has: page.getByRole("button", { name: "Actualizar hito", exact: true }),
      })
      .first();
    await milestoneUpdate
      .locator('select[name="status"]')
      .selectOption("completed");
    await milestoneUpdate
      .getByRole("button", { name: "Actualizar hito", exact: true })
      .click();
    await expect(milestoneUpdate.getByRole("status")).toHaveText(
      "El estado se guardó.",
    );
    await expect(execution(page)).toContainText(
      "1 de 2 hitos completados (50%)",
    );
    const contribution = await openForm(page, "contribution");
    await contribution
      .locator('[name="description"]')
      .fill("Materiales públicos disponibles");
    await contribution
      .getByRole("button", { name: "Ofrecer aporte", exact: true })
      .click();
    await expect(contribution.getByRole("status")).toHaveText(
      "Tu aporte se registró.",
    );
    const contributionRow = execution(page)
      .locator("li")
      .filter({ hasText: "Materiales públicos disponibles" });
    await contributionRow
      .locator('select[name="status"]')
      .selectOption("accepted");
    await contributionRow
      .getByRole("button", { name: "Guardar", exact: true })
      .click();
    await expect(contributionRow.getByRole("status")).toHaveText(
      "El estado se guardó.",
    );
    const projectState = execution(page)
      .locator("form")
      .filter({
        has: page.getByRole("button", {
          name: "Actualizar proyecto",
          exact: true,
        }),
      });
    await projectState
      .locator('select[name="status"]')
      .selectOption("in_progress");
    await projectState
      .getByRole("button", { name: "Actualizar proyecto", exact: true })
      .click();
    await expect(projectState.getByRole("status")).toHaveText(
      "El estado se guardó.",
    );
    await expect(page.locator("article").first()).toContainText("En ejecución");
    expect(
      localCommunityFixture(
        `select status from public.projects where id=${literal(id)}::uuid;`,
      ),
    ).toContain("in_progress");
  } finally {
    localCommunityFixture(
      `delete from public.projects where id=${literal(id)}::uuid;`,
    );
  }
});

test("ejecución por HTML conserva el POST rechazado y permite corregir y confirmar el aporte", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const id = crypto.randomUUID();
  try {
    fixture(id);
    await login(page, id);
    const context = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
      storageState: await page.context().storageState(),
    });
    try {
      const native = await context.newPage();
      await native.goto(`/proyectos/${id}/`);
      const contribution = await openForm(native, "contribution");
      await contribution
        .locator('[name="description"]')
        .fill("Aporte nativo corregible");
      await contribution.locator('[name="quantity"]').fill("0");
      await contribution.locator('[name="unit"]').fill("horas");
      await contribution
        .getByRole("button", { name: "Ofrecer aporte", exact: true })
        .focus();
      await native.keyboard.press("Enter");
      await expect(contribution.locator('[name="description"]')).toHaveValue(
        "Aporte nativo corregible",
      );
      await expect(contribution.locator('[name="quantity"]')).toHaveValue("0");
      await expect(contribution.locator('[name="quantity"]')).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      const fieldId = await contribution
        .locator('[name="quantity"]')
        .getAttribute("id");
      await expect(contribution.locator(`a[href="#${fieldId}"]`)).toHaveText(
        "La cantidad debe ser mayor a cero.",
      );
      await expect(contribution.getByRole("status")).toHaveCount(0);
      await contribution.locator('[name="quantity"]').fill("2");
      await contribution
        .getByRole("button", { name: "Ofrecer aporte", exact: true })
        .focus();
      await native.keyboard.press("Enter");
      await expect(contribution.getByRole("status")).toHaveText(
        "Tu aporte se registró.",
      );
      await expect(contribution.locator('[name="description"]')).toHaveValue(
        "",
      );
      await expect(
        execution(native)
          .locator("li")
          .filter({ hasText: "Aporte nativo corregible" }),
      ).toContainText("2 horas");
      expect(
        localCommunityFixture(
          `select quantity from public.project_contributions where project_id=${literal(id)}::uuid;`,
        ),
      ).toContain("2");
    } finally {
      await context.close();
    }
  } finally {
    localCommunityFixture(
      `delete from public.projects where id=${literal(id)}::uuid;`,
    );
  }
});

test("Q&A recorre más de200 preguntas y respuestas y muestra el mensaje recién guardado en JS y HTML", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const id = crypto.randomUUID();
  const prefix = crypto.randomUUID().slice(0, 24);
  const commentId = (n: number) => prefix + String(n).padStart(12, "0");
  try {
    fixture(id);
    localCommunityFixture(`insert into public.project_comments(id,project_id,user_id,body,created_at,parent_id)
      select (${literal(prefix)} || lpad(n::text,12,'0'))::uuid,${literal(id)}::uuid,'${owner}','Mensaje paginado ' || n,'2026-10-01T12:00:00Z',case when n>225 then ${literal(commentId(1))}::uuid else null end from generate_series(1,278) n;
      insert into public.project_comments(project_id,user_id,body,status) values (${literal(id)}::uuid,'${owner}','Mensaje retirado que no debe aparecer','removed');`);
    await login(page, id);
    const qa = page.locator('section[aria-labelledby="qa-titulo"]');
    await expect(
      qa.getByText("Mensaje paginado 1", { exact: true }),
    ).toBeVisible();
    for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
      const previous = new URL(page.url()).searchParams.get("qa_id");
      await qa
        .getByRole("link", { name: "Mensajes siguientes", exact: true })
        .click();
      await expect(page).toHaveURL(
        (url) =>
          !!url.searchParams.get("qa_id") &&
          url.searchParams.get("qa_id") !== previous,
      );
      const lastMessage = Math.min((pageIndex + 2) * 50, 278);
      await expect(
        qa.getByText(`Mensaje paginado ${lastMessage}`, { exact: true }),
      ).toBeVisible();
      if (lastMessage < 278) {
        await expect(
          qa.getByRole("link", { name: "Mensajes siguientes", exact: true }),
        ).toHaveAttribute(
          "href",
          new RegExp(`qa_id=${commentId(lastMessage)}#qa-titulo$`),
        );
      }
    }
    await expect(
      qa.getByText("Mensaje paginado 278", { exact: true }),
    ).toBeVisible();
    await expect(
      qa.getByText("Mensaje paginado 1", { exact: true }),
    ).toBeVisible();
    await expect(
      qa.getByRole("link", { name: "Mensajes siguientes", exact: true }),
    ).toHaveCount(0);
    await expect(
      qa.getByText("Mensaje retirado que no debe aparecer", { exact: true }),
    ).toHaveCount(0);
    const lastPage = page.url();
    await qa
      .getByRole("link", {
        name: "Volver a los primeros mensajes",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL((url) => !url.searchParams.has("qa_id"));
    await expect(
      qa.getByText("Mensaje paginado 50", { exact: true }),
    ).toBeVisible();
    const unrelatedReply = qa.locator(`#respuesta-${commentId(2)}`);
    const replyDraft = "Respuesta independiente todavía en edición";
    await expect(unrelatedReply).toHaveAccessibleName(
      "Responder a esta pregunta",
    );
    await unrelatedReply.fill(replyDraft);
    const question = qa.locator("form").filter({
      has: page.locator("#nueva-pregunta"),
    });
    await question
      .locator('[name="body"]')
      .fill("Pregunta recién publicada después del recorte");
    await question
      .getByRole("button", { name: "Preguntar", exact: true })
      .click();
    await expect(
      qa.getByText("Pregunta recién publicada después del recorte", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(unrelatedReply).toHaveValue(replyDraft);
    const askAgain = question.locator('button[type="submit"]');
    await expect(askAgain).toBeEnabled();
    await expect(askAgain).toHaveAttribute("aria-busy", "false");
    await expect(askAgain).toHaveAccessibleName("Preguntar");
    const published = question.getByRole("link", {
      name: "Ver mensaje publicado",
      exact: true,
    });
    await expect(published).toHaveAttribute(
      "href",
      /\?mensaje=.*#project-comment-/,
    );
    await published.click();
    await expect(
      page.locator(
        `#project-comment-${new URL(page.url()).searchParams.get("mensaje")}`,
      ),
    ).toBeFocused();
    await expect(unrelatedReply).toHaveValue(replyDraft);
    const context = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
      storageState: await page.context().storageState(),
    });
    try {
      const native = await context.newPage();
      await native.goto(lastPage);
      const nativeQa = native.locator('section[aria-labelledby="qa-titulo"]');
      await expect(
        nativeQa.getByText("Mensaje paginado 278", { exact: true }),
      ).toBeVisible();
      await nativeQa
        .getByRole("link", {
          name: "Volver a los primeros mensajes",
          exact: true,
        })
        .click();
      const nativeQuestion = nativeQa.locator("form").filter({
        has: native.getByRole("button", { name: "Preguntar", exact: true }),
      });
      await nativeQuestion
        .locator('[name="body"]')
        .fill("Pregunta guardada por HTML fuera de la primera página");
      await nativeQuestion
        .getByRole("button", { name: "Preguntar", exact: true })
        .focus();
      await native.keyboard.press("Enter");
      await expect(
        nativeQa.getByText(
          "Pregunta guardada por HTML fuera de la primera página",
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        nativeQuestion.getByRole("link", {
          name: "Ver mensaje publicado",
          exact: true,
        }),
      ).toBeVisible();
      await expect(nativeQuestion.locator('[name="body"]')).toHaveValue("");
    } finally {
      await context.close();
    }
  } finally {
    localCommunityFixture(
      `delete from public.projects where id=${literal(id)}::uuid;`,
    );
  }
});
