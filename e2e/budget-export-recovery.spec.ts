import { expect, test } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

const ownerId = "33333333-3333-4333-8333-333333333333";
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

test("los cuatro imprimibles muestran el reclamo real y reservan404 para un ID ausente", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const id = crypto.randomUUID();
  const missing = crypto.randomUUID();
  const title = `Reclamo imprimible ${crypto.randomUUID()}`;
  const description =
    "La luminaria de la esquina no funciona y requiere una revisión documentada.";
  const formats = [
    [
      "afiche",
      "Imprimir afiche (o Guardar como PDF)",
      "Código QR para sumar tu apoyo",
    ],
    ["dossier", "Imprimir / Guardar como PDF", "Código QR del reclamo"],
    [
      "nota-formal",
      "🖨️ Imprimir nota para Mesa de Entradas",
      "Código QR del reclamo",
    ],
    ["planilla", "🖨️ Imprimir Planilla A4", "Código QR del reclamo"],
  ] as const;
  try {
    localCommunityFixture(`insert into public.claims(id,community_id,author_id,title,description,category,location_text)
      select ${literal(id)}::uuid,id,'${ownerId}',${literal(title)},${literal(description)},'infraestructura','Esquina de prueba local' from public.communities where slug='mar-del-plata';`);
    for (const [format, printLabel, qrLabel] of formats) {
      const response = await page.goto(`/reclamos/${id}/${format}/`);
      expect(response?.status()).toBe(200);
      expect(response?.headers()["content-type"]).toContain("text/html");
      await expect(page.locator("main")).toContainText(title);
      await expect(page.locator("main")).toContainText(description);
      await expect(
        page.getByRole("button", { name: printLabel, exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "← Volver al reclamo", exact: true }),
      ).toHaveAttribute("href", `/reclamos/${id}`);
      await expect(
        page.getByRole("img", { name: qrLabel, exact: true }),
      ).toBeVisible();
      const absent = await request.get(`/reclamos/${missing}/${format}/`);
      expect(absent.status()).toBe(404);
      expect(await absent.text()).not.toContain(title);
    }
  } finally {
    localCommunityFixture(
      `delete from public.claims where id=${literal(id)}::uuid;`,
    );
  }
});

test("el presupuesto real permite recorrer rondas y protege resultados sin votantes también por HTML", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const projectId = crypto.randomUUID();
  const active = crypto.randomUUID();
  const closed = crypto.randomUUID();
  const empty = crypto.randomUUID();
  const proposalIds = [crypto.randomUUID(), crypto.randomUUID()];
  const titles = {
    active: `Ronda abierta local ${active.slice(0, 8)}`,
    closed: `Ronda protegida local ${closed.slice(0, 8)}`,
    empty: `Ronda vacía local ${empty.slice(0, 8)}`,
  };
  try {
    // Sólo partidas, proyectos y postulaciones de IDs nuevos. No se escriben
    // votos, constancias ni aceptaciones legales para preparar el resultado.
    localCommunityFixture(`begin;
      insert into public.projects(id,community_id,author_id,title,summary,plan)
        select ${literal(projectId)}::uuid,id,'${ownerId}','Plaza propuesta en ronda local','Fixture para verificar lecturas públicas de presupuesto.','Mejorar los bancos y juegos.' from public.communities where slug='mar-del-plata';
      insert into public.community_budgets(id,community_id,title,amount,tokens_per_voter,max_tokens_per_proposal,proposals_close_at,voting_opens_at,voting_closes_at,report_due_at)
        select ${literal(active)}::uuid,id,${literal(titles.active)},100000,10,5,now()-interval '4 days',now()-interval '3 days',now()+interval '2 days',now()+interval '10 days' from public.communities where slug='mar-del-plata';
      insert into public.community_budgets(id,community_id,title,amount,tokens_per_voter,max_tokens_per_proposal,proposals_close_at,voting_opens_at,voting_closes_at,report_due_at)
        select ${literal(closed)}::uuid,id,${literal(titles.closed)},100000,10,5,now()-interval '8 days',now()-interval '7 days',now()-interval '6 days',now()+interval '5 days' from public.communities where slug='mar-del-plata';
      insert into public.community_budgets(id,community_id,title,amount,tokens_per_voter,max_tokens_per_proposal,proposals_close_at,voting_opens_at,voting_closes_at,report_due_at)
        select ${literal(empty)}::uuid,id,${literal(titles.empty)},100000,10,5,now()-interval '5 days',now()-interval '4 days',now()-interval '3 days',now()+interval '5 days' from public.communities where slug='mar-del-plata';
      insert into public.budget_proposals(id,budget_id,project_id,requested_amount,admitted_at)
        values (${literal(proposalIds[0])}::uuid,${literal(active)}::uuid,${literal(projectId)}::uuid,50000,now()-interval '3 days'),
          (${literal(proposalIds[1])}::uuid,${literal(closed)}::uuid,${literal(projectId)}::uuid,50000,now()-interval '7 days');
      commit;`);
    const roundHref = (id: string) =>
      `/c/mar-del-plata/presupuesto/?ronda=${id}`;
    const response = await page.goto(roundHref(active));
    expect(response?.status()).toBe(200);
    const content = page.locator(
      'section[aria-labelledby="presupuesto-titulo"]',
    );
    await expect(
      content.getByRole("heading", { name: titles.active, exact: true }),
    ).toBeVisible();
    await expect(
      content.getByText("Votación abierta", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      content.getByText("Ingresá para participar del reparto.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      content.getByRole("button", {
        name: "Enviar reparto (definitivo)",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      content.getByText(/No pudimos (cargar|consultar|comprobar)/),
    ).toHaveCount(0);
    await content
      .getByRole("navigation", { name: "Rondas de presupuesto", exact: true })
      .locator(`a[href$="?ronda=${closed}"]`)
      .click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("ronda") === closed,
    );
    await expect(
      content.getByRole("heading", { name: titles.closed, exact: true }),
    ).toBeVisible();
    await expect(
      content.getByRole("heading", {
        name: "Sin resultados por baja participación",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      content.getByText(
        "Los resultados requieren al menos 5 participantes. Si hubo menos, no mostramos el número exacto ni el reparto.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      content.getByText("Esta ronda cerró sin proyectos admitidos", {
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      content.getByText("Plaza propuesta en ronda local", { exact: true }),
    ).toHaveCount(0);
    await expect(content.getByText(/\d+ fichas · \d+ personas/)).toHaveCount(0);

    const context = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
    });
    try {
      const native = await context.newPage();
      const nativeResponse = await native.goto(roundHref(closed));
      expect(nativeResponse?.status()).toBe(200);
      const nativeContent = native.locator(
        'section[aria-labelledby="presupuesto-titulo"]',
      );
      await expect(
        nativeContent.getByRole("heading", {
          name: "Sin resultados por baja participación",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        nativeContent.getByText(/\d+ fichas · \d+ personas/),
      ).toHaveCount(0);
      await nativeContent
        .getByRole("navigation", { name: "Rondas de presupuesto", exact: true })
        .locator(`a[href$="?ronda=${empty}"]`)
        .click();
      await expect(
        nativeContent.getByRole("heading", { name: titles.empty, exact: true }),
      ).toBeVisible();
      await expect(
        nativeContent.getByRole("heading", {
          name: "Esta ronda cerró sin proyectos admitidos",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        nativeContent.getByText(
          "Sin resultados por baja participación",
          { exact: true },
        ),
      ).toHaveCount(0);
      await expect(
        nativeContent.getByText(/No pudimos (cargar|consultar|comprobar)/),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  } finally {
    localCommunityFixture(
      `delete from public.community_budgets where id in (${[active, closed, empty].map((id) => `${literal(id)}::uuid`).join(",")}); delete from public.projects where id=${literal(projectId)}::uuid;`,
    );
  }
});
