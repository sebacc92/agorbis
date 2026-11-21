import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createLegalTestAccount,
  signInTestAccount,
} from "./account-followup-fixtures";
import { localCommunityFixture } from "./local-community-fixtures";
import { nativeContextOptions } from "./native-context";

const seededAuthor = "33333333-3333-4333-8333-333333333333";
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
function fixture(id: string, authorId: string) {
  localCommunityFixture(`insert into public.projects(id,community_id,author_id,title,summary,plan)
    select ${literal(id)}::uuid,id,${literal(authorId)}::uuid,'Publicación para moderación accesible','Fixture local para comprobar decisiones de la persona.','Revisar confirmaciones y errores sin alterar permisos.' from public.communities where slug='mar-del-plata';`);
}
const reportPanel = (page: Page, id: string) => page.locator(`#reporte-${id}`);
const removal = (page: Page, id: string) =>
  page.locator(`section[aria-labelledby="baja-${id}"]`);

test("reportar funciona por HTML y conserva el motivo rechazado y las ediciones en espera", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const actor = await createLegalTestAccount("report-html");
  const ids = [crypto.randomUUID(), crypto.randomUUID()];
  try {
    ids.forEach((id) => fixture(id, seededAuthor));
    await signInTestAccount(page, actor.email, `/proyectos/${ids[0]}/`);
    const panel = reportPanel(page, ids[0]);
    await panel.locator("summary").click();
    await expect(panel).toHaveJSProperty("open", true);
    const reason = panel.locator('textarea[name="reason"]');
    await reason.fill("ab");
    let release = () => {};
    let arrived = () => {};
    const waiting = new Promise<void>((resolve) => (release = resolve));
    const observed = new Promise<void>((resolve) => (arrived = resolve));
    await page.route("**/*qaction=*", async (route) => {
      if (route.request().method() === "POST") {
        arrived();
        await waiting;
      }
      await route.continue();
    });
    try {
      await panel
        .getByRole("button", { name: "Enviar reporte", exact: true })
        .click();
      await observed;
      await reason.fill("Motivo ampliado mientras esperaba el rechazo.");
      release();
      await expect(
        panel.getByText("Contá brevemente qué está mal.", { exact: true }),
      ).toBeVisible();
      await expect(reason).toHaveValue(
        "Motivo ampliado mientras esperaba el rechazo.",
      );
      await expect(reason).toHaveAttribute("aria-invalid", "true");
      await expect(panel).toHaveJSProperty("open", true);
      await expect(
        page.getByRole("status").filter({ hasText: "Reporte enviado." }),
      ).toHaveCount(0);
    } finally {
      release();
      await page.unroute("**/*qaction=*");
    }
    await panel
      .getByRole("button", { name: "Enviar reporte", exact: true })
      .click();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Reporte enviado. Gracias por cuidar el espacio." }),
    ).toBeVisible();
    const first = await actor.admin
      .from("reports")
      .select("reason")
      .eq("reporter_id", actor.id)
      .eq("target_id", ids[0])
      .single();
    expect(first.error).toBeNull();
    expect(first.data?.reason).toBe(
      "Motivo ampliado mientras esperaba el rechazo.",
    );

    const context = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
      storageState: await page.context().storageState(),
    });
    try {
      const native = await context.newPage();
      await native.goto(`/proyectos/${ids[1]}/`);
      const nativePanel = reportPanel(native, ids[1]);
      await nativePanel.locator("summary").click();
      await expect(
        nativePanel.locator('textarea[name="reason"]'),
      ).toBeVisible();
      await nativePanel.locator('textarea[name="reason"]').fill("ab");
      const rejection = native.waitForResponse(
        (response) => response.request().method() === "POST",
      );
      await nativePanel
        .getByRole("button", { name: "Enviar reporte", exact: true })
        .click();
      expect((await rejection).status()).toBe(400);
      await expect(nativePanel).toHaveJSProperty("open", true);
      await expect(nativePanel.locator('textarea[name="reason"]')).toHaveValue(
        "ab",
      );
      await expect(
        nativePanel.locator('textarea[name="reason"]'),
      ).toHaveAttribute("aria-invalid", "true");
      await expect(
        nativePanel.getByText("Contá brevemente qué está mal.", {
          exact: true,
        }),
      ).toBeVisible();
      await nativePanel
        .locator('textarea[name="reason"]')
        .fill("Motivo enviado desde el formulario HTML.");
      await nativePanel
        .getByRole("button", { name: "Enviar reporte", exact: true })
        .click();
      await expect(
        native.getByRole("status").filter({
          hasText: "Reporte enviado. Gracias por cuidar el espacio.",
        }),
      ).toBeVisible();
      const saved = await actor.admin
        .from("reports")
        .select("target_id,reason")
        .eq("reporter_id", actor.id)
        .in("target_id", ids);
      expect(saved.error).toBeNull();
      expect(saved.data).toHaveLength(2);
      expect(saved.data?.find((row) => row.target_id === ids[1])?.reason).toBe(
        "Motivo enviado desde el formulario HTML.",
      );
    } finally {
      await context.close();
    }
  } finally {
    localCommunityFixture(
      `delete from public.reports where reporter_id=${literal(actor.id)}::uuid; delete from public.projects where id in (${ids.map((id) => `${literal(id)}::uuid`).join(",")});`,
    );
    expect(
      (await actor.admin.auth.admin.deleteUser(actor.id)).error,
    ).toBeNull();
  }
});

test("dar de baja permite cancelar sin enviar y confirma la escritura con JS y HTML sólo para el autor", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const actor = await createLegalTestAccount("remove-html");
  const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  try {
    fixture(ids[0], actor.id);
    fixture(ids[1], actor.id);
    fixture(ids[2], seededAuthor);
    await signInTestAccount(page, actor.email, `/proyectos/${ids[0]}/`);
    let posts = 0;
    page.on("request", (request) => {
      if (request.method() === "POST") posts++;
    });
    const section = removal(page, ids[0]);
    await section.locator("summary").click();
    await expect(
      section.getByRole("button", { name: "Sí, dar de baja", exact: true }),
    ).toBeVisible();
    await section.getByRole("link", { name: "Cancelar", exact: true }).click();
    await expect(section.locator("details")).toHaveJSProperty("open", false);
    expect(posts).toBe(0);
    const untouched = await actor.admin
      .from("projects")
      .select("status,removed_at")
      .eq("id", ids[0])
      .single();
    expect(untouched.error).toBeNull();
    expect(untouched.data?.status).not.toBe("removed");
    expect(untouched.data?.removed_at).toBeNull();
    const storageState = await page.context().storageState();
    await section.locator("summary").click();
    await section
      .getByRole("button", { name: "Sí, dar de baja", exact: true })
      .click();
    await expect(page).toHaveURL(/\/c\/mar-del-plata\/proyectos\/?$/);
    const removed = await actor.admin
      .from("projects")
      .select("status,removed_at,removed_by")
      .eq("id", ids[0])
      .single();
    expect(removed.error).toBeNull();
    expect(removed.data?.status).toBe("removed");
    expect(removed.data?.removed_at).toBeTruthy();
    expect(removed.data?.removed_by).toBe(actor.id);

    const context = await browser.newContext({
      baseURL,
      ...nativeContextOptions,
      storageState,
    });
    try {
      const native = await context.newPage();
      await native.goto(`/proyectos/${ids[1]}/`);
      let nativePosts = 0;
      native.on("request", (request) => {
        if (request.method() === "POST") nativePosts++;
      });
      const nativeSection = removal(native, ids[1]);
      // La ruta HTML también se recorre con teclado. La activación nativa
      // no depende de la estabilidad geométrica de los efectos del puntero.
      const activate = async (control: Locator) => {
        await control.focus();
        await expect(control).toBeFocused();
        await native.keyboard.press("Enter");
      };
      await activate(nativeSection.locator("summary"));
      await expect(
        nativeSection.getByText("¿Dar de baja un proyecto?", { exact: true }),
      ).toBeVisible();
      await activate(
        nativeSection.getByRole("link", { name: "Cancelar", exact: true }),
      );
      await expect(nativeSection.locator("details")).toHaveJSProperty(
        "open",
        false,
      );
      expect(nativePosts).toBe(0);
      // Repetir la cancelación no puede quedar en una navegación al mismo
      // fragmento: también debe cerrar sin enviar la baja.
      await activate(nativeSection.locator("summary"));
      await activate(
        nativeSection.getByRole("link", { name: "Cancelar", exact: true }),
      );
      await expect(nativeSection.locator("details")).toHaveJSProperty(
        "open",
        false,
      );
      expect(nativePosts).toBe(0);
      const kept = await actor.admin
        .from("projects")
        .select("removed_at")
        .eq("id", ids[1])
        .single();
      expect(kept.error).toBeNull();
      expect(kept.data?.removed_at).toBeNull();
      await activate(nativeSection.locator("summary"));
      await activate(
        nativeSection.getByRole("button", {
          name: "Sí, dar de baja",
          exact: true,
        }),
      );
      await expect(native).toHaveURL(/\/c\/mar-del-plata\/proyectos\/?$/);
      const nativeRemoved = await actor.admin
        .from("projects")
        .select("status,removed_by")
        .eq("id", ids[1])
        .single();
      expect(nativeRemoved.error).toBeNull();
      expect(nativeRemoved.data?.status).toBe("removed");
      expect(nativeRemoved.data?.removed_by).toBe(actor.id);
      await native.goto(`/proyectos/${ids[2]}/`);
      await expect(removal(native, ids[2])).toHaveCount(0);
    } finally {
      await context.close();
    }
  } finally {
    localCommunityFixture(
      `delete from public.projects where id in (${ids.map((id) => `${literal(id)}::uuid`).join(",")});`,
    );
    expect(
      (await actor.admin.auth.admin.deleteUser(actor.id)).error,
    ).toBeNull();
  }
});
