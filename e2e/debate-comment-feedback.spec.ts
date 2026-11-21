import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { nativeContextOptions } from "./native-context";

const debateId = "c0000000-0000-4000-8000-000000000001";

test("un comentario fuera del ranking conserva su enlace nativo y uno retirado no se recupera", async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (
    !url ||
    !key ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
  )
    throw new Error(
      "Esta prueba sólo puede escribir fixtures en Supabase local.",
    );
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: column, error: columnError } = await db
    .from("communities")
    .select("id")
    .eq("slug", "caba")
    .single();
  const { data: author, error: authorError } = await db
    .from("profiles")
    .select("id")
    .eq("username", "elena_caba")
    .single();
  expect(columnError).toBeNull();
  expect(authorError).toBeNull();
  const marker = `Comentario enlazado E2E ${crypto.randomUUID()}`;
  const rows = Array.from({ length: 22 }, (_, index) => ({
    id: crypto.randomUUID(),
    debate_id: debateId,
    column_community_id: column!.id,
    user_id: author!.id,
    body: `${marker} ${index}`,
    score: index < 20 ? 1000 : -1000,
    created_at: "2020-01-01T12:00:00Z",
    status: index === 21 ? "removed" : "visible",
  }));
  const target = rows[20];
  const removed = rows[21];
  const href = `/debates/${debateId}?comentario=${target.id}#comment-${target.id}`;
  const nativeContext = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173",
    ...nativeContextOptions,
    viewport: { width: 390, height: 844 },
  });
  try {
    expect((await db.from("debate_comments").insert(rows)).error).toBeNull();
    // La RPC pública se consulta con el mismo rol que usa quien visita el
    // debate; la credencial de fixtures sólo prepara y limpia los datos.
    const reader = createClient(url, process.env.PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data: firstPage, error: rankError } = await reader.rpc(
      "debate_column_comments",
      { p_debate: debateId, p_per_column: 20 },
    );
    expect(rankError).toBeNull();
    expect(
      firstPage?.some((item: { id: string }) => item.id === target.id),
    ).toBe(false);

    const native = await nativeContext.newPage();
    await native.goto(href);
    const card = native.locator(`#comment-${target.id}`);
    await expect(card).toContainText(target.body);
    await expect(card).toBeInViewport();
    await expect(
      card.getByRole("link", { name: "Enlace al comentario", exact: true }),
    ).toHaveAttribute("href", href);
    await expect(native.locator(`#comment-${target.id}`)).toHaveCount(1);

    await page.goto(
      `/debates/${debateId}?comentario=${removed.id}#comment-${removed.id}`,
    );
    await expect(
      page.getByText(
        "El comentario enlazado no está disponible en este debate.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator(`#comment-${removed.id}`)).toHaveCount(0);
    await expect(page.getByText(removed.body, { exact: true })).toHaveCount(0);
    await page.goto(`/debates/${debateId}?comentario=${crypto.randomUUID()}`);
    await expect(
      page.getByText(
        "El comentario enlazado no está disponible en este debate.",
        { exact: true },
      ),
    ).toBeVisible();
  } finally {
    await nativeContext.close();
    expect(
      (
        await db
          .from("debate_comments")
          .delete()
          .in(
            "id",
            rows.map((row) => row.id),
          )
      ).error,
    ).toBeNull();
    expect(
      (
        await db
          .from("notifications")
          .delete()
          .in(
            "dedupe_key",
            rows.map((row) => `debate-comment:${row.id}:author`),
          )
      ).error,
    ).toBeNull();
  }
});

test("un voto interrumpido restaura su selección y permite reintentar sin bloquear la tarjeta", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(
    `/ingresar/?next=${encodeURIComponent(`/debates/${debateId}`)}`,
  );
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/debates/${debateId}/?$`));
  const card = page.locator("article[id^=comment-]").first();
  const up = card.getByRole("button", { name: "Votar a favor", exact: true });
  const previous = await up.getAttribute("aria-pressed");
  let interrupted = 0;
  await page.route(
    (url) => url.pathname.replace(/\/$/, "") === `/debates/${debateId}`,
    async (route) => {
      if (route.request().method() === "POST") {
        interrupted++;
        await route.abort("failed");
      } else await route.continue();
    },
  );
  await up.click();
  const error = card.getByRole("alert");
  await expect(error).toHaveText(
    "No pudimos confirmar tu voto. Volvé a intentarlo o recargá para ver el estado actual.",
  );
  await expect(up).toBeEnabled();
  await expect(up).toHaveAttribute("aria-pressed", previous!);
  await up.click();
  await expect.poll(() => interrupted).toBe(2);
  await expect(error).toBeVisible();
  await expect(up).toBeEnabled();
  await expect(up).toHaveAttribute("aria-pressed", previous!);
});

test("en el teléfono, comentar lleva a la caja de la columna propia y la enfoca", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `/ingresar/?next=${encodeURIComponent(`/debates/${debateId}`)}`,
  );
  await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
  await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/debates/${debateId}/?$`));

  await page
    .getByRole("link", { name: "Comentar desde Buenos Aires", exact: true })
    .click();
  const field = page.getByRole("textbox", {
    name: "Escribir un comentario en la columna Buenos Aires",
  });
  await expect(field).toBeFocused();
  await expect(field).toBeInViewport();
  // La caja va antes de los comentarios de su columna, no al pie.
  const column = page.locator("section.debate-column-mine");
  expect(
    await column.evaluate((section) => {
      const box = section.querySelector("textarea");
      const comments = section.querySelector('[role="region"]');
      return !!box && !!comments && box.compareDocumentPosition(comments) === Node.DOCUMENT_POSITION_FOLLOWING;
    }),
  ).toBe(true);
});
