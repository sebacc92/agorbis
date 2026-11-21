import { expect, test, type Page } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";

/**
 * Acuerdos entre comunidades (D118). La base decide: la página sólo ofrece lo
 * que `agreement_state` dijo que vale, y después de una acción muestra el
 * estado que la base devolvió, nunca uno supuesto.
 *
 * Fixture: un acuerdo propuesto por admin_geo (Mar del Plata) con Tandil,
 * insertado como postgres (sin sesión, el gate legal no aplica a la fixture).
 * Sofía vive en Mar del Plata y no es la proponente: puede adherir.
 */
const TITLE_PREFIX = "Acuerdo E2E";
const BODY =
  "Las dos ciudades se comprometen a coordinar el mantenimiento de la ruta costera y a publicar el avance cada trimestre.";

/** Limpieza: un acuerdo borrado se lleva sus partes y sus rondas (cascade). */
function cleanUp(title: string) {
  try {
    localCommunityFixture(`
      delete from public.agreements where title like '${title}%';
    `);
  } catch (error) {
    // Un acuerdo huérfano de Sofía suma a su cupo de tres propuestas: una
    // limpieza rota tiene que fallar la prueba, no quedar en una anotación.
    expect.soft(error, "limpieza de acuerdos de prueba").toBeUndefined();
  }
}

// Red de seguridad por si una corrida anterior murió a mitad de la siembra:
// los títulos de este archivo llevan el prefijo, los de la gente no.
test.afterAll(() => {
  cleanUp(TITLE_PREFIX);
});

function firstUuid(out: string, what: string): string {
  const id = out
    .trim()
    .split("\n")
    .find((line) => /^[0-9a-f-]{36}$/.test(line.trim()))
    ?.trim();
  if (!id) throw new Error(`No se pudo leer ${what}: ${out}`);
  return id;
}

/**
 * Acuerdo propuesto por admin_geo con Tandil y con Mar del Plata ya adherida
 * por Sofía. Falta sólo la adhesión de Tandil: la siguiente abre la votación.
 */
function seedAwaitingLastAdhesion(title: string): string {
  const id = seedAgreement(title);
  localCommunityFixture(`
    update public.agreement_parties ap
    set adhered_by = p.id, adhered_at = now()
    from public.profiles p, public.communities c
    where p.username = 'sofia_mdq' and c.slug = 'mar-del-plata'
      and ap.agreement_id = '${id}' and ap.community_id = c.id;
  `);
  return id;
}

/**
 * Acuerdo aprobado: se recorre el camino real (proponer y adherir con las
 * RPCs, como cada persona desde su sesión) y después, como dueña de la base,
 * se simula el paso del tiempo y los votos: cierre pasado y tallies con
 * quórum y mayoría por sí en las dos comunidades. La función de estado sólo
 * lee, igual que en el test SQL.
 */
function seedApproved(title: string): string {
  const out = localCommunityFixture(`
    create or replace function pg_temp.as_user(p_username text)
    returns void language plpgsql as $$
    declare v_id uuid;
    begin
      perform set_config('role', 'postgres', true);
      perform set_config('request.jwt.claims', '', true);
      select id into v_id from public.profiles where username = p_username;
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
    end $$;
    grant execute on function pg_temp.as_user(text) to authenticated;
    do $$
    declare
      v_agreement uuid;
      v_tandil uuid := (select id from public.communities where slug = 'tandil');
    begin
      perform pg_temp.as_user('admin_geo');
      v_agreement := public.propose_agreement('${title}', '${BODY}', array[v_tandil], 7);
      perform pg_temp.as_user('sofia_mdq');
      perform public.adhere_agreement(v_agreement);
      perform pg_temp.as_user('flor_tandil');
      perform public.adhere_agreement(v_agreement);
      perform set_config('role', 'postgres', true);
      perform set_config('request.jwt.claims', '', true);
      update public.polls set closes_at = now() - interval '1 hour' where agreement_id = v_agreement;
      update public.agreements set closes_at = now() - interval '1 hour' where id = v_agreement;
      delete from private.poll_option_tallies
      where poll_id in (select poll_id from public.agreement_parties where agreement_id = v_agreement);
      insert into private.poll_option_tallies (poll_id, option_id, votes, participants)
      select o.poll_id, o.id, case when o.sort_order = 0 then 5 else 1 end, 6
      from public.poll_options o
      join public.polls p on p.id = o.poll_id
      where p.agreement_id = v_agreement;
    end $$;
    select id from public.agreements where title = '${title}';
  `);
  return firstUuid(out, "el acuerdo aprobado");
}

async function signIn(page: Page, email: string, next: string) {
  await page.goto(`/ingresar/?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
}

function seedAgreement(title: string): string {
  const out = localCommunityFixture(`
    with proposer as (
      select p.id, p.home_community_id from public.profiles p where p.username = 'admin_geo'
    ), inserted as (
      insert into public.agreements (title, body, proposer_id, proposer_community_id, duration_days)
      select '${title}',
        '${BODY}',
        proposer.id, proposer.home_community_id, 14
      from proposer
      returning id, proposer_community_id
    ), parties as (
      insert into public.agreement_parties (agreement_id, community_id)
      select inserted.id, inserted.proposer_community_id from inserted
      union all
      select inserted.id, c.id from inserted, public.communities c where c.slug = 'tandil'
    )
    select id from inserted;
  `);
  return firstUuid(out, "el acuerdo sembrado");
}

test("una residente adhiere su comunidad y la página muestra el estado que devolvió la base", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const title = `${TITLE_PREFIX} ${crypto.randomUUID()}`;
  const id = seedAgreement(title);
  try {
    await page.setViewportSize({ width: 390, height: 844 });

    // Visitante: lee todo, no actúa.
    await page.goto(`/acuerdos/${id}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByText("Propuesto, esperando adhesión")).toBeVisible();
    await expect(page.locator("main").getByRole("button")).toHaveCount(0);
    await expect(
      page.locator("main").getByRole("link", { name: "Crear cuenta" }),
    ).toBeVisible();
    await expect(page.getByText("Esperando adhesión", { exact: true })).toHaveCount(2);

    // Sofía (Mar del Plata, no proponente) adhiere.
    await signIn(page, "sofia@agorbis.test", `/acuerdos/${id}/`);
    await expect(page).toHaveURL((u) => u.pathname === `/acuerdos/${id}/`);
    const adhere = page.getByRole("button", {
      name: "Adherir por Mar del Plata",
    });
    await expect(adhere).toBeVisible();
    await expect(page.getByText("Adherir no aprueba nada")).toBeVisible();
    await adhere.click();

    // Lo que se muestra sale del loader revalidado: Mar del Plata adhirió,
    // Tandil sigue esperando, y la votación no se abrió.
    await expect(page.getByText("Adhirió", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Esperando adhesión", { exact: true })).toHaveCount(1);
    await expect(page.getByText("Propuesto, esperando adhesión")).toBeVisible();
    await expect(page.locator("main").getByRole("button")).toHaveCount(0);
    await expect(page.getByText(/Aprobado/)).toHaveCount(0);
  } finally {
    cleanUp(title);
  }
});

test("una residente propone un acuerdo desde Encuestas y llega a su página en estado propuesto", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const title = `${TITLE_PREFIX} propuesta ${crypto.randomUUID().slice(0, 8)}`;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "sofia@agorbis.test", "/c/mar-del-plata/encuestas/");
    await expect(page).toHaveURL((u) => u.pathname === "/c/mar-del-plata/encuestas/");

    // La sección vive dentro de Encuestas y sólo una residente ve el botón.
    const section = page.getByRole("region", { name: "Acuerdos" });
    await expect(section).toBeVisible();
    await section.getByRole("link", { name: "Proponer un acuerdo" }).click();
    await expect(page).toHaveURL((u) => u.pathname === "/c/mar-del-plata/acuerdos/nuevo/");

    await page.getByLabel("Título del acuerdo").fill(title);
    await page
      .getByLabel("El compromiso")
      .fill(BODY);
    await page.getByLabel("Buscar comunidad", { exact: true }).fill("tand");
    await page.getByRole("checkbox", { name: /Tandil/ }).check();
    await expect(page.getByText("Una comunidad no puede participar junto con otra que la contiene")).toHaveCount(0);
    await page.getByRole("button", { name: "Proponer el acuerdo" }).click();

    // La página del acuerdo muestra lo que la base devolvió: propuesto, con
    // las dos comunidades esperando adhesión y sin votación.
    // Llega con ?publicado=1, como las demás publicaciones: la proponente ve
    // qué sigue, y nadie más (el parámetro se puede compartir).
    await expect(page).toHaveURL(/\/acuerdos\/[0-9a-f-]{36}\/?\?publicado=1$/, {
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByText("Tu propuesta ya está publicada")).toBeVisible();
    await expect(page.getByText("Propuesto, esperando adhesión")).toBeVisible();
    await expect(page.getByText("Esperando adhesión", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Retirar la propuesta" })).toBeVisible();
    await expect(page.getByText(/Aprobado/)).toHaveCount(0);

    // Vuelve a Encuestas: el acuerdo aparece en la sección con su estado.
    await page.goto("/c/mar-del-plata/encuestas/");
    await expect(section.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  } finally {
    cleanUp(title);
  }
});

test("la última adhesión abre la votación, el voto deja 'Ya votaste' y la ronda redirige al acuerdo", async ({
  page,
}) => {
  test.setTimeout(150_000);
  const title = `${TITLE_PREFIX} votación ${crypto.randomUUID().slice(0, 8)}`;
  const id = seedAwaitingLastAdhesion(title);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "flor@agorbis.test", `/acuerdos/${id}/`);
    await expect(page).toHaveURL((u) => u.pathname === `/acuerdos/${id}/`);
    await expect(page.getByText("Adhirió", { exact: true })).toHaveCount(1);

    // Flor (Tandil) completa la adhesión: la base abre las dos rondas a la
    // vez y la página pasa a "En votación hasta el …" sin recargar a mano.
    await page.getByRole("button", { name: "Adherir por Tandil" }).click();
    await expect(page.getByText(/En votación hasta el /)).toBeVisible();
    await expect(page.getByText("Propuesto, esperando adhesión")).toHaveCount(0);
    const voteTitle = page.getByText("¿Aprobás este acuerdo por Tandil?");
    await expect(voteTitle).toBeVisible();
    // Durante la ronda ningún conteo (D68): un número seguido de votos,
    // votantes o participantes. Los textos fijos ("Tu voto es secreto…",
    // "cinco participantes o más") no llevan dígitos.
    await expect(
      page.locator("main").getByText(/\d+\s+(votos?|votantes?|participantes?)/),
    ).toHaveCount(0);

    // Vota "Sí": el recibo no guarda la elección (D68); la página sólo dice
    // que votó y deja de ofrecer las opciones.
    await page.getByRole("button", { name: "Sí", exact: true }).click();
    await expect(page.getByText("Ya votaste")).toBeVisible();
    await expect(voteTitle).toHaveCount(0);
    await expect(page.getByText(/Aprobado/)).toHaveCount(0);

    // La ronda de Tandil existe como encuesta, pero su enlace lleva al acuerdo.
    const pollId = firstUuid(
      localCommunityFixture(`
        select ap.poll_id from public.agreement_parties ap
        join public.communities c on c.id = ap.community_id
        where ap.agreement_id = '${id}' and c.slug = 'tandil';
      `),
      "la ronda de Tandil",
    );
    await page.goto(`/encuestas/${pollId}/`);
    await expect(page).toHaveURL((u) => u.pathname === `/acuerdos/${id}/`);

    // En el inicio de Flor el acuerdo es una tarjeta propia: estado derivado,
    // comunidades adheridas y ningún llamado a votar como encuesta.
    await page.goto("/inicio?tipo=agreement");
    const card = page
      .locator("ol li")
      .filter({ has: page.getByRole("heading", { name: title }) });
    await expect(card).toBeVisible();
    await expect(card.getByRole("link")).toHaveAttribute("href", `/acuerdos/${id}`);
    await expect(card.getByText("En votación", { exact: true })).toBeVisible();
    await expect(card.getByText("2 comunidades adhirieron")).toBeVisible();
    await expect(card.getByText("Participar del voto")).toHaveCount(0);
  } finally {
    cleanUp(title);
  }
});

test("un acuerdo cerrado con quórum y mayoría en las dos comunidades se muestra aprobado, con la participación por comunidad", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const title = `${TITLE_PREFIX} aprobado ${crypto.randomUUID().slice(0, 8)}`;
  const id = seedApproved(title);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/acuerdos/${id}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByText("Aprobado", { exact: true })).toBeVisible();
    // Cada comunidad decidió por sí misma: dos resultados, nunca una suma.
    await expect(page.getByText(/Aprobó · 6 participantes/)).toHaveCount(2);
    await expect(page.getByText(/12 participantes/)).toHaveCount(0);
    await expect(page.locator("main").getByRole("button")).toHaveCount(0);

    // En Encuestas de Mar del Plata figura con su estado final.
    await page.goto("/c/mar-del-plata/encuestas/");
    const section = page.getByRole("region", { name: "Acuerdos" });
    const row = section.getByRole("link", { name: new RegExp(title) });
    await expect(row).toBeVisible();
    await expect(row.getByText("Aprobado", { exact: true })).toBeVisible();
  } finally {
    cleanUp(title);
  }
});
