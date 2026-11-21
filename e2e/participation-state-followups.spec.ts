import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

const owner = "33333333-3333-4333-8333-333333333333";
const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;
async function login(page: Page, destination: string) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname.replace(/\/$/, "") ===
      new URL(destination, url).pathname.replace(/\/$/, ""),
  );
}
function debateFixture(id: string) {
  localCommunityFixture(`insert into public.debates(id,community_id,author_id,title,body)
    select '${id}',id,'${owner}','Debate de borradores y destinos','Debate local para comprobar la navegación y el texto confirmado.' from public.communities where slug='argentina';`);
}

test("debate confirma sólo el comentario enviado y conserva las ediciones durante la espera", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const id = crypto.randomUUID();
  const sent = `Comentario enviado ${id}`;
  const later = "Edición posterior que todavía no se publicó";
  let release = () => {};
  try {
    debateFixture(id);
    await login(page, `/debates/${id}`);
    const form = page
      .locator("form")
      .filter({ has: page.locator('textarea[name="body"]') });
    const input = form.locator('textarea[name="body"]');
    await input.fill(sent);
    let arrived = () => {};
    const intercepted = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/*qaction=*", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      arrived();
      await pending;
      await route.continue();
    });
    await form.getByRole("button", { name: "Publicar", exact: true }).click();
    await intercepted;
    await input.fill(later);
    release();
    await expect(
      page.locator('article[id^="comment-"]').filter({ hasText: sent }),
    ).toHaveCount(1);
    await expect(input).toHaveValue(later);
    await expect(form).toContainText(
      "Tu comentario se publicó. Las ediciones posteriores siguen en el borrador.",
    );
    await expect(
      form.getByRole("button", { name: "Publicar", exact: true }),
    ).toBeEnabled();
    const saved = localCommunityFixture(
      `select body from public.debate_comments where debate_id='${id}';`,
    );
    expect(saved).toContain(sent);
    expect(saved).not.toContain(later);
    await input.fill("Otro borrador para continuar");
    await expect(form).not.toContainText(
      "Las ediciones posteriores siguen en el borrador.",
    );
  } finally {
    release();
    await page.unroute("**/*qaction=*");
    localCommunityFixture(`delete from public.debates where id='${id}';`);
  }
});

test("ingresar desde el voto vuelve al comentario fuera del ranking y conserva la consulta también por HTML", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const id = crypto.randomUUID();
  const target = crypto.randomUUID();
  const marker = `Comentario preciso ${id}`;
  const destination = `/debates/${id}?territorio=buenos-aires&comentario=${target}#comment-${target}`;
  try {
    debateFixture(id);
    localCommunityFixture(`insert into public.debate_comments(debate_id,column_community_id,user_id,body,score)
      select '${id}',id,'${owner}','Comentario destacado '||n,1000 from public.communities cross join generate_series(1,20) n where slug='buenos-aires';
      insert into public.debate_comments(id,debate_id,column_community_id,user_id,body,score)
      select '${target}','${id}',id,'${owner}',${literal(marker)},-1000 from public.communities where slug='buenos-aires';`);
    const nativeContext = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
    });
    try {
      const native = await nativeContext.newPage();
      await native.goto(destination);
      const card = native.locator(`#comment-${target}`);
      await expect(card).toContainText(marker);
      const signIn = card.getByRole("link", {
        name: "Votar a favor — Iniciá sesión para votar",
        exact: true,
      });
      await expect(signIn).toHaveAttribute(
        "href",
        `/ingresar?next=${encodeURIComponent(destination)}`,
      );
      await signIn.click();
      await expect(native).toHaveURL(
        (url) =>
          url.pathname.replace(/\/$/, "") === "/ingresar" &&
          url.searchParams.get("next") === destination,
      );
    } finally {
      await nativeContext.close();
    }
    await page.goto(destination);
    await page
      .locator(`#comment-${target}`)
      .getByRole("link", {
        name: "Votar a favor — Iniciá sesión para votar",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("next") === destination,
    );
    await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
    await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
      /\S+/,
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(
      (url) =>
        url.searchParams.get("territorio") === "buenos-aires" &&
        url.searchParams.get("comentario") === target &&
        url.hash === `#comment-${target}`,
    );
    await expect(page.locator(`#comment-${target}`)).toBeInViewport();
    await expect(page.locator(`#comment-${target}`)).toBeFocused();
    await expect(
      page
        .locator(`#comment-${target}`)
        .getByRole("button", { name: "Votar a favor", exact: true }),
    ).toBeEnabled();
  } finally {
    localCommunityFixture(`delete from public.debates where id='${id}';`);
  }
});

test("navegar entre encuestas reinicia la selección y no traslada el recibo de otra votación", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const first = crypto.randomUUID();
  const second = crypto.randomUUID();
  const firstQuestion = `Encuesta inicial ${first}`;
  const secondQuestion = `Encuesta siguiente ${second}`;
  try {
    localCommunityFixture(`insert into public.polls(id,community_id,author_id,question,type,max_choices,category,closes_at)
      select v.id,c.id,'${owner}',v.question,'multiple',1,'comunidad',now()+interval '1 day' from public.communities c cross join (values ('${first}'::uuid,${literal(firstQuestion)}),('${second}'::uuid,${literal(secondQuestion)})) v(id,question) where c.slug='mar-del-plata';
      insert into public.poll_options(poll_id,label,sort_order) values ('${first}','Primera alternativa',0),('${first}','Segunda alternativa',1),('${second}','Primera alternativa',0),('${second}','Segunda alternativa',1);
      insert into public.content_relations(source_type,source_id,target_type,target_id,relation_type,created_by) values ('poll','${first}','poll','${second}','related','${owner}');`);
    await login(page, `/encuestas/${first}`);
    await page.getByRole("checkbox", { name: /Primera alternativa/ }).check();
    await expect(
      page.getByText("Llegaste al máximo: 1 de 1 opciones", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Segunda alternativa/ }),
    ).toBeDisabled();
    await page.getByRole("link", { name: new RegExp(secondQuestion) }).click();
    await expect(
      page.getByRole("heading", { name: secondQuestion, exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/encuestas/${second}/?$`));
    await expect(
      page.getByText("Llevás 0 de 1 opciones", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Primera alternativa/ }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: /Segunda alternativa/ }),
    ).toBeEnabled();
    await page.getByRole("checkbox", { name: /Primera alternativa/ }).check();
    await page.getByRole("button", { name: "Votar", exact: true }).click();
    await expect(
      page.getByText("¡Listo! Tu voto quedó registrado.", { exact: true }),
    ).toBeVisible();
    await page.goBack();
    await expect(
      page.getByRole("heading", { name: firstQuestion, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("¡Listo! Tu voto quedó registrado.", { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByText("Ya votaste", { exact: true })).toHaveCount(0);
    await expect(
      page.getByText("Llevás 0 de 1 opciones", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /Primera alternativa/ }),
    ).toBeEnabled();
    await expect(
      page.getByRole("checkbox", { name: /Primera alternativa/ }),
    ).not.toBeChecked();
    expect(
      localCommunityFixture(
        `select count(*) as receipts from public.poll_participation_receipts where poll_id='${first}';`,
      ),
    ).toMatch(/\b0\b/);
    expect(
      localCommunityFixture(
        `select count(*) as receipts from public.poll_participation_receipts where poll_id='${second}';`,
      ),
    ).toMatch(/\b1\b/);
  } finally {
    localCommunityFixture(
      `delete from public.content_relations where source_id in ('${first}','${second}') or target_id in ('${first}','${second}'); delete from public.polls where id in ('${first}','${second}');`,
    );
  }
});

test("el progreso del reclamo distingue resolución, gestión y elevación sin inventar etapas por HTML", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(60_000);
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  const context = await browser.newContext({
    baseURL,
    ...nativeContextOptions,
  });
  try {
    localCommunityFixture(`insert into public.claims(id,community_id,author_id,title,description,category,status)
      select v.id,c.id,'${owner}','Progreso verificado','Hechos independientes para comprobar las etapas.','otro',v.status from public.communities c cross join (values ('${ids[0]}'::uuid,'resolved'),('${ids[1]}'::uuid,'in_progress'),('${ids[2]}'::uuid,'open')) v(id,status) where c.slug='mar-del-plata';
      update public.claims set escalated_at=now(),escalated_to_community_id=(select id from public.communities where slug='buenos-aires') where id='${ids[2]}';`);
    const page = await context.newPage();
    await page.goto(`/reclamos/${ids[0]}`);
    const tracker = page.getByRole("region", {
      name: "Etapas del reclamo",
      exact: true,
    });
    await expect(tracker).toContainText("Resolución registrada");
    await expect(
      tracker.locator("li").filter({ hasText: "Apoyos vecinales" }),
    ).toContainText("Etapa sin registrar");
    await expect(
      tracker.locator("li").filter({ hasText: "Elevación formal" }),
    ).toContainText("Sin elevación registrada");
    await expect(
      tracker.locator("li").filter({ hasText: "En gestión" }),
    ).toContainText("Sin respuesta institucional registrada");
    await page.goto(`/reclamos/${ids[1]}`);
    await expect(tracker).toContainText("Estado de gestión registrado");
    await expect(tracker).not.toContainText("Respuesta oficial registrada");
    await page.goto(`/reclamos/${ids[2]}`);
    await expect(tracker).toContainText("Escalado por falta de respuesta");
    await expect(tracker).toContainText("Visible también en");
    await expect(tracker).toContainText(
      "Sin respuesta institucional registrada",
    );
    await expect(
      tracker.locator("li").filter({ hasText: "Apoyos vecinales" }),
    ).toContainText("Etapa sin registrar");
  } finally {
    await context.close();
    localCommunityFixture(
      `delete from public.claims where id in (${ids.map(literal).join(",")});`,
    );
  }
});

for (const native of [false, true])
  test(`ejecución ofrece transiciones permitidas y guarda sus estados ${native ? "por HTML" : "con JavaScript"}`, async ({
    page,
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const id = crypto.randomUUID();
    try {
      localCommunityFixture(`insert into public.projects(id,community_id,author_id,title,summary,plan,status)
      select '${id}',id,'${owner}','Estados permitidos','Proyecto local para comprobar las transiciones.','Coordinar tareas y aportes.','funding' from public.communities where slug='mar-del-plata';
      insert into public.project_tasks(project_id,title) values ('${id}','Tarea con transición');
      insert into public.project_milestones(project_id,title,status,completed_at) values ('${id}','Hito completado','completed',now());
      insert into public.project_contributions(project_id,user_id,kind,description) values ('${id}','${owner}','time','Aporte pendiente de revisión');`);
      await login(page, `/proyectos/${id}`);
      const context = native
        ? await browser.newContext({
            baseURL,
            ...nativeContextOptions,
            storageState: await page.context().storageState(),
          })
        : undefined;
      try {
        const target = context ? await context.newPage() : page;
        if (context) await target.goto(`/proyectos/${id}`);
        const execution = target.getByRole("region", {
          name: "Ejecución del proyecto",
          exact: true,
        });
        const task = execution.getByRole("combobox", {
          name: "Estado de la tarea Tarea con transición",
          exact: true,
        });
        const values = async (selector: ReturnType<Page["locator"]>) =>
          selector
            .locator("option")
            .evaluateAll((options) =>
              options.map((option) => (option as HTMLOptionElement).value),
            );
        expect(await values(task)).toEqual(["open", "in_progress", "blocked"]);
        expect(
          await values(
            execution.getByRole("combobox", {
              name: "Estado general",
              exact: true,
            }),
          ),
        ).toEqual(["funding", "in_progress"]);
        expect(
          await values(
            execution.getByRole("combobox", {
              name: "Estado del hito Hito completado",
              exact: true,
            }),
          ),
        ).toEqual(["in_progress", "completed"]);
        expect(
          await values(
            execution.getByRole("combobox", {
              name: "Estado del aporte",
              exact: true,
            }),
          ),
        ).toEqual(["offered", "accepted", "declined"]);
        for (const state of ["in_progress", "completed"]) {
          await task.selectOption(state);
          const form = task.locator("..");
          const save = form.getByRole("button", {
            name: "Guardar el estado de Tarea con transición",
            exact: true,
          });
          if (native) {
            await save.focus();
            await target.keyboard.press("Enter");
          } else await save.click();
          await expect(form.getByRole("status")).toHaveText(
            "El estado se guardó.",
          );
          await expect(task).toHaveValue(state);
          await expect
            .poll(() =>
              localCommunityFixture(
                `select status from public.project_tasks where project_id='${id}';`,
              ),
            )
            .toContain(state);
          if (state === "in_progress")
            await expect(task.locator('option[value="completed"]')).toHaveCount(
              1,
            );
        }
        // "El estado se guardó." sale de la respuesta de la acción y las
        // opciones, de los datos de la página, que llegan después: con red
        // lenta (la CI) la lectura única veía las del estado anterior. Se
        // espera el estado final; si nunca llegara, igual falla.
        await expect.poll(() => values(task)).toEqual(["completed"]);
      } finally {
        await context?.close();
      }
    } finally {
      localCommunityFixture(`delete from public.projects where id='${id}';`);
    }
  });
