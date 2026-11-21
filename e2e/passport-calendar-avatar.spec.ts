import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { localCommunityFixture } from "./local-community-fixtures";

function localDb(admin = false) {
  const url = process.env.PUBLIC_SUPABASE_URL;
  const key = admin
    ? process.env.SUPABASE_SECRET_KEY
    : process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (
    !url ||
    !key ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
  )
    throw new Error("Esta prueba sólo puede usar Supabase local.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

test("la agenda descarga la próxima fecha objetivo y explica los proyectos sin fecha", async ({
  page,
}) => {
  const db = localDb(true);
  const { data: community, error } = await db
    .from("communities")
    .select("id")
    .eq("slug", "mar-del-plata")
    .single();
  expect(error).toBeNull();
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  const titles = ids.map((id) => `Agenda comprobable ${id}`);
  try {
    // Fixtures locales: las funciones de indexación no se conceden al rol API
    // de servicio. Las lecturas del producto se ejercen como visitante.
    localCommunityFixture(`
      begin;
      insert into public.projects(id, community_id, title, summary, plan, created_at)
      values ${ids.map((id, index) => `('${id}', '${community!.id}', '${titles[index]}', 'Proyecto local de prueba de agenda.', 'Revisar las fechas previstas de sus hitos.', '2090-01-01T12:00:00Z')`).join(",")};
      insert into public.project_milestones(project_id, title, target_date, sort_order)
      values ('${ids[0]}', 'Reunión de planificación', '2098-12-31', 1),
        ('${ids[0]}', 'Hito posterior', '2099-01-02', 2),
        ('${ids[0]}', 'Hito vencido', '2020-01-01', 3);
      commit;
    `);
    await page.goto("/c/mar-del-plata/proyectos/?vista=agenda");
    const dated = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: titles[0], exact: true }),
    });
    const undated = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: titles[1], exact: true }),
    });
    await expect(dated).toContainText("Reunión de planificación");
    await expect(undated).toContainText(
      "Sin próximas fechas objetivo. Consultá el plan del proyecto.",
    );
    await expect(
      undated.getByRole("button", { name: "Agendar", exact: true }),
    ).toHaveCount(0);
    await dated.getByRole("button", { name: "Agendar", exact: true }).click();
    const download = page.waitForEvent("download");
    await dated
      .getByRole("menuitem", {
        name: "Descargar .ics (Apple / Outlook)",
        exact: true,
      })
      .click();
    const file = await download;
    const content = await readFile((await file.path())!, "utf8");
    expect(content).toContain("DTSTART;VALUE=DATE:20981231");
    expect(content).toContain("DTEND;VALUE=DATE:20990101");
    expect(content).toContain("STATUS:TENTATIVE");
    expect(content).toContain("Reunión de planificación");
    expect(content).not.toContain("20900101");
  } finally {
    expect((await db.from("projects").delete().in("id", ids)).error).toBeNull();
  }
});

test("un avatar roto recupera las iniciales y el pasaporte tiene controles accesibles", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const db = localDb();
  const owner = "33333333-3333-4333-8333-333333333333";
  const missingAvatarPath = `${owner}/${crypto.randomUUID()}.webp`;
  expect(
    (
      await db.auth.signInWithPassword({
        email: "sofia@agorbis.test",
        password: "AgorbisLocal-2026!",
        options: { captchaToken: "XXXX.DUMMY.TOKEN.XXXX" },
      })
    ).error,
  ).toBeNull();
  const { data: initial, error } = await db
    .from("profiles")
    .select("avatar_url, display_name")
    .eq("id", owner)
    .single();
  expect(error).toBeNull();
  try {
    // Metadatos locales aprobados sin archivo: reproduce un recurso perdido
    // sin alterar las validaciones del perfil ni los permisos de la persona.
    localCommunityFixture(`
      begin;
      insert into storage.objects(bucket_id,name,owner_id) values ('avatars','${missingAvatarPath}','${owner}');
      insert into private.avatar_uploads(path,owner_id,upload_completed_at) values ('${missingAvatarPath}','${owner}',now());
      commit;
    `);
    expect(
      (
        await db
          .from("profiles")
          .update({
            avatar_url: `/media/avatares/${missingAvatarPath}`,
          })
          .eq("id", owner)
      ).error,
    ).toBeNull();
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/ingresar/?next=%2Fperfil%2F");
    await page.getByLabel("Correo electrónico").fill("sofia@agorbis.test");
    await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
      /\S+/,
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(/\/perfil\/?$/, { timeout: 20_000 });
    const profileHeader = page.locator("main header").first();
    await expect(profileHeader.locator("img")).toHaveCount(0);
    const initials = profileHeader.locator(":scope > span").first();
    await expect(initials).toBeVisible();
    const avatarBox = await initials.boundingBox();
    expect(avatarBox!.width).toBe(64);
    expect(avatarBox!.height).toBe(64);
    const progress = page.getByRole("progressbar", {
      name: "Progreso del pasaporte cívico",
    });
    const now = Number(await progress.getAttribute("aria-valuenow"));
    const maximum = Number(await progress.getAttribute("aria-valuemax"));
    expect(now).toBeGreaterThanOrEqual(0);
    expect(now).toBeLessThanOrEqual(maximum);
    // D126: el sello ya no lleva un encabezado adentro del botón (era HTML
    // inválido). `data-badge` va sólo en los obtenidos —el siguiente usa
    // `data-next-badge`—, así que sigue siendo un sello ganado.
    const badge = page.locator('button[data-badge="voter"]');
    await expect(badge).toContainText("Votante Activo");
    await badge.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const close = dialog.getByRole("button", { name: "Cerrar", exact: true });
    // El diálogo entra con una animación de escala; medir su tamaño final.
    await expect
      .poll(async () => {
        const box = await close.boundingBox();
        return Math.min(box?.width ?? 0, box?.height ?? 0);
      })
      .toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(badge).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(320);
  } finally {
    expect(
      (
        await db
          .from("profiles")
          .update({ avatar_url: initial!.avatar_url })
          .eq("id", owner)
      ).error,
    ).toBeNull();
    const cleanup = await localDb(true)
      .storage.from("avatars")
      .remove([missingAvatarPath]);
    expect(cleanup.error).toBeNull();
    expect(cleanup.data).toHaveLength(1);
    localCommunityFixture(
      `delete from private.avatar_uploads where path='${missingAvatarPath}';`,
    );
    await db.auth.signOut();
  }
});
