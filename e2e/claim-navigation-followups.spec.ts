import { expect, test } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";

const literal = (value: string) => `'${value.replace(/'/g, "''")}'`;

test("el mapa acerca y enfoca el detalle móvil sólo tras elegir un reclamo", async ({
  page,
}) => {
  const prefix = `Selección móvil ${crypto.randomUUID()}`;
  try {
    localCommunityFixture(`
      insert into public.claims(community_id,title,description,category,lat,lng,created_at)
      select c.id, ${literal(prefix)} || p.name, 'Fixture local de selección del mapa.', 'otro', c.lat + p.dlat, c.lng, timestamptz '2090-01-01 00:00:00+00'
      from public.communities c cross join (values (' primero',0::numeric),(' segundo',0.001::numeric)) p(name,dlat)
      where c.slug='mar-del-plata';
    `);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      const scroll = HTMLElement.prototype.scrollIntoView;
      Object.defineProperty(window, "mapDetailScrolls", { value: [] });
      HTMLElement.prototype.scrollIntoView = function (options) {
        if (this.hasAttribute("data-map-claim-detail")) {
          (Reflect.get(window, "mapDetailScrolls") as unknown[]).push(options);
        }
        scroll.call(this, options);
      };
    });
    await page.goto(`/c/mar-del-plata/mapa/?q=${encodeURIComponent(prefix)}`);
    const detail = page.locator("[data-map-claim-detail]");
    const row = page
      .locator("#map-claims > button")
      .filter({ hasText: `${prefix} segundo` });
    await expect(row).toBeVisible();
    await expect(detail).not.toBeFocused();
    expect(
      await page.evaluate(() => Reflect.get(window, "mapDetailScrolls")),
    ).toEqual([]);
    await row.scrollIntoViewIfNeeded();
    await row.click();
    await expect(
      detail.getByRole("heading", { name: `${prefix} segundo`, exact: true }),
    ).toBeVisible();
    await expect(detail).toBeFocused();
    await expect(detail).toBeInViewport({ ratio: 1 });
    await expect(row).toHaveAttribute("aria-controls", "map-selected-claim");
    expect(
      await page.evaluate(() => Reflect.get(window, "mapDetailScrolls")),
    ).toEqual([{ block: "start", behavior: "instant" }]);

    // Volver a elegir la misma fila también acerca el detalle, sin cambiar el filtro.
    await row.click();
    await expect(detail).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(
          () => (Reflect.get(window, "mapDetailScrolls") as unknown[]).length,
        ),
      )
      .toBe(2);
    const radius = page.getByRole("button", { name: "500 m", exact: true });
    await radius.click();
    await expect(radius).toBeFocused();
    expect(
      await page.evaluate(
        () => (Reflect.get(window, "mapDetailScrolls") as unknown[]).length,
      ),
    ).toBe(2);

    await page.setViewportSize({ width: 1280, height: 900 });
    await row.click();
    await expect(row).toBeFocused();
    await expect(detail).not.toBeFocused();
    expect(
      await page.evaluate(
        () => (Reflect.get(window, "mapDetailScrolls") as unknown[]).length,
      ),
    ).toBe(2);
  } finally {
    localCommunityFixture(
      `delete from public.claims where title like ${literal(`${prefix}%`)};`,
    );
  }
});

test("el GPS explica el fallo del portapapeles y permite seleccionar las coordenadas públicas y reintentar", async ({
  page,
}) => {
  const claimId = crypto.randomUUID();
  try {
    localCommunityFixture(`
      insert into public.claims(id,community_id,title,description,category,lat,lng)
      select ${literal(claimId)}::uuid,c.id,'Reclamo de prueba para GPS','Fixture local de copia recuperable.','otro',-34.603722,-58.381592
      from public.communities c where c.slug='mar-del-plata';
    `);
    await page.addInitScript(() => {
      Object.assign(window, { gpsCopyTest: { fail: true, value: "" } });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            const state = Reflect.get(window, "gpsCopyTest") as {
              fail: boolean;
              value: string;
            };
            if (state.fail) throw new DOMException("Denied", "NotAllowedError");
            state.value = value;
          },
        },
      });
    });
    await page.goto(`/reclamos/${claimId}/`);
    await page
      .getByRole("button", { name: "Abrir en GPS / Mapas", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Navegación GPS y Mapas",
      exact: true,
    });
    const coordinates = dialog.getByRole("textbox", {
      name: "Coordenadas aproximadas",
      exact: true,
    });
    await expect(coordinates).toHaveValue("-34.604, -58.382");
    await expect(coordinates).toHaveJSProperty("readOnly", true);
    await dialog.getByRole("button", { name: "Copiar", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "No pudimos copiar las coordenadas. Podés seleccionarlas y copiarlas manualmente.",
    );
    await expect(
      dialog.getByRole("button", { name: "Copiado", exact: true }),
    ).toHaveCount(0);
    await dialog
      .getByRole("button", { name: "Seleccionar coordenadas", exact: true })
      .click();
    await expect(coordinates).toBeFocused();
    expect(
      await coordinates.evaluate((input: HTMLInputElement) => [
        input.selectionStart,
        input.selectionEnd,
      ]),
    ).toEqual([0, "-34.604, -58.382".length]);
    for (const link of await dialog.getByRole("link").all())
      expect(await link.getAttribute("href")).not.toMatch(/\d\.\d{4}/);

    await page.evaluate(() => {
      (Reflect.get(window, "gpsCopyTest") as { fail: boolean }).fail = false;
    });
    await dialog.getByRole("button", { name: "Copiar", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Copiado", exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => (Reflect.get(window, "gpsCopyTest") as { value: string }).value,
      ),
    ).toBe("-34.604, -58.382");
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page
      .getByRole("button", { name: "Abrir en GPS / Mapas", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Copiar", exact: true }),
    ).toBeVisible();
    await expect(dialog.getByRole("alert")).toHaveCount(0);
  } finally {
    localCommunityFixture(
      `delete from public.claims where id=${literal(claimId)}::uuid;`,
    );
  }
});

test("la cronología atribuye cada movimiento a su institución histórica y respeta su visibilidad pública", async ({
  page,
}) => {
  const claimId = crypto.randomUUID();
  const orgIds = Array.from({ length: 4 }, () => crypto.randomUUID());
  const names = orgIds.map(
    (id, index) => `Institución de prueba ${index} ${id}`,
  );
  try {
    localCommunityFixture(`
      insert into public.organizations(id,community_id,name,slug,type,verified_at)
      select o.id::uuid,c.id,o.name,o.slug,'government',case when o.visible then now() else null end
      from public.communities c cross join (values ${orgIds.map((id, index) => `(${literal(id)},${literal(names[index])},${literal(`historial-${id}`)},${index !== 3})`).join(",")}) o(id,name,slug,visible)
      where c.slug='mar-del-plata';
      insert into public.claims(id,community_id,title,description,category,responsible_organization_id)
      select ${literal(claimId)}::uuid,c.id,'Reclamo de prueba con instituciones históricas','Fixture local de trazabilidad institucional.','otro',${literal(orgIds[2])}::uuid
      from public.communities c where c.slug='mar-del-plata';
      insert into public.claim_events(claim_id,organization_id,event_type,title,event_date)
      values (${literal(claimId)}::uuid,${literal(orgIds[0])}::uuid,'official_response','Primera respuesta histórica','2026-10-01'),
        (${literal(claimId)}::uuid,${literal(orgIds[1])}::uuid,'update','Segunda respuesta histórica','2026-10-02'),
        (${literal(claimId)}::uuid,${literal(orgIds[3])}::uuid,'update','Institución sin visibilidad pública','2026-10-03'),
        (${literal(claimId)}::uuid,null,'update','Actualización vecinal','2026-10-04');
    `);
    const response = await page.goto(`/reclamos/${claimId}/`);
    const timeline = page.locator(
      'section[aria-labelledby="seguimiento-reclamo"]',
    );
    await expect(
      timeline.getByText(`Responsable: ${names[2]}`, { exact: true }),
    ).toBeVisible();
    const first = timeline.locator("ol li").filter({
      has: page.getByRole("heading", {
        name: "Primera respuesta histórica",
        exact: true,
      }),
    });
    const second = timeline.locator("ol li").filter({
      has: page.getByRole("heading", {
        name: "Segunda respuesta histórica",
        exact: true,
      }),
    });
    await expect(first).toContainText(`Institución: ${names[0]}`);
    await expect(second).toContainText(`Institución: ${names[1]}`);
    await expect(timeline.locator("ol")).not.toContainText(names[2]);
    await expect(
      timeline
        .locator("ol li")
        .filter({ hasText: "Institución sin visibilidad pública" }),
    ).toContainText("Institución no disponible");
    await expect(
      timeline.locator("ol li").filter({ hasText: "Actualización vecinal" }),
    ).not.toContainText("Institución:");
    expect(await response!.text()).not.toContain(names[3]);
  } finally {
    localCommunityFixture(
      `delete from public.claims where id=${literal(claimId)}::uuid; delete from public.organizations where id in (${orgIds.map(literal).join(",")});`,
    );
  }
});
