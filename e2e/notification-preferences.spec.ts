import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("los filtros limitan el marcado y las preferencias cambian la entrega real", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const url = process.env.PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (
    !url ||
    !secret ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
  ) {
    throw new Error("Esta prueba sólo puede escribir en Supabase local.");
  }
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const user = "44444444-4444-4444-8444-444444444444";
  const prefix = `Notificaciones E2E ${crypto.randomUUID()}`;
  const { data: previous, error: previousError } = await admin
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user)
    .maybeSingle();
  expect(previousError).toBeNull();
  const { data: polls, error: pollError } = await admin
    .from("polls")
    .select("id,community_id")
    .in("id", [
      "a0000000-0000-4000-8000-000000000001",
      "a0000000-0000-4000-8000-000000000002",
    ])
    .order("id");
  expect(pollError).toBeNull();
  expect(polls).toHaveLength(2);
  const { data: previouslyUnread, error: unreadError } = await admin
    .from("notifications")
    .select("id")
    .eq("recipient_id", user)
    .eq("type", "reply")
    .eq("community_id", polls![0].community_id)
    .is("read_at", null);
  expect(unreadError).toBeNull();
  const notifications = [
    {
      recipient_id: user,
      type: "reply",
      title: `${prefix} respuesta`,
      href: "/perfil",
      entity_type: "poll",
      entity_id: polls![0].id,
    },
    {
      recipient_id: user,
      type: "project_update",
      title: `${prefix} proyecto`,
      href: "/perfil",
      entity_type: "poll",
      entity_id: polls![1].id,
    },
  ];
  try {
    expect(
      (
        await admin.from("notification_preferences").upsert({
          user_id: user,
          replies: true,
          poll_results: true,
          claim_updates: true,
          project_updates: true,
          institutional_responses: true,
        })
      ).error,
    ).toBeNull();
    expect(
      (await admin.from("notifications").insert(notifications)).error,
    ).toBeNull();
    await page.goto("/ingresar/?next=%2Fnotificaciones%2F");
    await page.getByLabel("Correo electrónico").fill("bruno@agorbis.test");
    await page.locator('input[name="password"]').fill("AgorbisLocal-2026!");
    await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
      /\S+/,
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: "Ingresar", exact: true }).click();
    await expect(page).toHaveURL(/\/notificaciones\/?$/);
    // Desde las mejoras de UI los filtros combinables viven en un panel
    // plegable detrás de los chips rápidos.
    const filterToggle = page.locator('summary[aria-controls="notification-filters"]');
    await expect(filterToggle).toHaveText("Más filtros");
    await filterToggle.click();
    const filterForm = page.getByRole("form", {
      name: "Filtrar notificaciones",
    });
    await filterForm.getByLabel("Tipo de notificación").selectOption("reply");
    await filterForm
      .getByRole("combobox", { name: "Comunidad", exact: true })
      .selectOption(polls![0].community_id);
    await filterForm.getByLabel("Sólo sin leer").check();
    await filterForm.getByRole("button", { name: "Aplicar filtros" }).click();
    await expect(
      page.getByRole("button", { name: `${prefix} respuesta`, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`${prefix} proyecto`, { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Marcar coincidencias como leídas" })
      .click();
    await expect(
      page.getByRole("button", { name: `${prefix} respuesta`, exact: true }),
    ).toHaveCount(0);
    const { data: marked, error: markedError } = await admin
      .from("notifications")
      .select("type,read_at")
      .eq("recipient_id", user)
      .like("title", `${prefix}%`);
    expect(markedError).toBeNull();
    expect(marked?.find((item) => item.type === "reply")?.read_at).toBeTruthy();
    expect(
      marked?.find((item) => item.type === "project_update")?.read_at,
    ).toBeNull();

    await page
      .getByText("Qué novedades querés recibir", { exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: "Respuestas y comentarios", exact: true })
      .uncheck();
    await expect(page.getByText("Cambios sin guardar", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Guardar preferencias" }).click();
    await expect(
      page.getByText("Guardamos tus preferencias de notificaciones.", {
        exact: true,
      }),
    ).toBeVisible();
    const repliesPreference = page.getByRole("checkbox", { name: "Respuestas y comentarios", exact: true });
    await repliesPreference.check();
    await expect(page.getByText("Cambios sin guardar", { exact: true })).toBeVisible();
    await expect(page.getByText("Guardado.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Guardamos tus preferencias de notificaciones.", { exact: true })).toHaveCount(0);
    await repliesPreference.uncheck();
    await expect(page.getByText("Cambios sin guardar", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Guardado.", { exact: true })).toBeVisible();
    expect(
      (
        await admin.from("notifications").insert([
          { ...notifications[0], title: `${prefix} silenciada` },
          {
            recipient_id: user,
            type: "account_suspended",
            title: `${prefix} seguridad`,
            href: "/perfil",
          },
        ])
      ).error,
    ).toBeNull();
    const { data: delivery, error: deliveryError } = await admin
      .from("notifications")
      .select("title")
      .eq("recipient_id", user)
      .like("title", `${prefix}%`);
    expect(deliveryError).toBeNull();
    expect(
      delivery?.some((item) => item.title === `${prefix} silenciada`),
    ).toBe(false);
    expect(delivery?.some((item) => item.title === `${prefix} seguridad`)).toBe(
      true,
    );
    await page.goto("/notificaciones/");
    await page
      .getByText("Qué novedades querés recibir", { exact: true })
      .click();
    await expect(
      page.getByRole("checkbox", {
        name: "Respuestas y comentarios",
        exact: true,
      }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: `${prefix} seguridad`, exact: true }),
    ).toBeVisible();
  } finally {
    expect(
      (
        await admin
          .from("notifications")
          .delete()
          .eq("recipient_id", user)
          .like("title", `${prefix}%`)
      ).error,
    ).toBeNull();
    if (previouslyUnread?.length) {
      expect(
        (
          await admin
            .from("notifications")
            .update({ read_at: null })
            .eq("recipient_id", user)
            .in(
              "id",
              previouslyUnread.map((item) => item.id),
            )
        ).error,
      ).toBeNull();
    }
    const restored = previous
      ? await admin.from("notification_preferences").upsert(previous)
      : await admin
          .from("notification_preferences")
          .delete()
          .eq("user_id", user);
    expect(restored.error).toBeNull();
  }
});
