import { expect, test } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";

test("el mapa conserva cada estado en leyenda, lista y detalle sin llamar críticos a rechazados", async ({
  page,
}) => {
  const prefix = `Mapa estados ${crypto.randomUUID()}`;
  const states = [
    ["open", "Abierto", 4],
    ["under_review", "En evaluación", 5],
    ["acknowledged", "Recibido", 6],
    ["in_progress", "En ejecución", 8],
    ["resolved", "Resuelto", 20],
    ["rejected", "Respuesta negativa", 20],
  ] as const;
  try {
    localCommunityFixture(`
      insert into public.claims(community_id,title,description,category,status,support_count,lat,lng,created_at)
      select c.id, '${prefix} ' || s.status, 'Fixture local de estados del mapa.', 'otro', s.status, s.support_count, c.lat, c.lng, timestamptz '2090-01-01 00:00:00+00'
      from public.communities c cross join (values ${[...states.map(([status, , count]) => `('${status}',${count})`), "('removed',99)"].join(",")}) s(status,support_count)
      where c.slug='mar-del-plata';
    `);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/c/mar-del-plata/mapa/?q=${encodeURIComponent(prefix)}`);
    const legend = page.getByRole("region", {
      name: "Estado de los reclamos",
      exact: true,
    });
    const cards = page.locator("#map-claims > button");
    await expect(cards).toHaveCount(6);
    for (const [status, label] of states) {
      const count = legend
        .locator("dl > div")
        .filter({ has: page.getByText(label, { exact: true }) });
      await expect(count.locator("dd")).toHaveText("1");
      const card = cards.filter({ hasText: `${prefix} ${status}` });
      await expect(card).toContainText(label);
      await card.click();
      const detail = page.locator("[data-map-claim-detail]");
      await expect(
        detail.getByRole("heading", {
          name: `${prefix} ${status}`,
          exact: true,
        }),
      ).toHaveCount(1);
      await expect(detail).toContainText(label);
    }
    await expect(legend).toContainText("Focos críticos: 3");
    await expect(legend).toContainText(
      "Reclamos abiertos con al menos 5 apoyos.",
    );
    await expect(legend).toContainText("resultados cargados");
    await expect(legend).not.toContainText("En demanda");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  } finally {
    localCommunityFixture(
      `delete from public.claims where title like '${prefix}%';`,
    );
  }
});

test("un radio de 1km excluye las esquinas y los puntos más lejanos, y Todo los recupera", async ({
  page,
}) => {
  const prefix = `Mapa radio ${crypto.randomUUID()}`;
  try {
    localCommunityFixture(`
      insert into public.claims(community_id,title,description,category,lat,lng,created_at)
      select c.id, '${prefix} ' || p.name, 'Fixture local de distancia circular.', 'otro', round(c.lat::numeric,3) + p.dlat, round(c.lng::numeric,3), timestamptz '2090-01-01 00:00:00+00'
      from public.communities c cross join (values ('dentro',0.008::numeric),('fuera',0.01::numeric)) p(name,dlat) where c.slug='mar-del-plata'
      union all
      select c.id, '${prefix} esquina', 'Fixture fuera del círculo y dentro del recuadro.', 'otro', round(c.lat::numeric,3) + 0.008, round(c.lng::numeric,3) + 0.01, timestamptz '2090-01-01 00:00:00+00'
      from public.communities c where c.slug='mar-del-plata';
    `);
    await page.goto(`/c/mar-del-plata/mapa/?q=${encodeURIComponent(prefix)}`);
    const cards = page.locator("#map-claims > button");
    const diagram = page.getByRole("img", {
      name: "Esquema de reclamos con ubicación en Mar del Plata",
      exact: true,
    });
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(`${prefix} dentro`);
    await expect(diagram.locator("circle[fill-opacity]")).toHaveCount(1);
    await expect(
      page.getByText("2 reclamos con ubicación quedan fuera de este radio.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(/Distancia aproximada:/)).toBeVisible();
    await expect(
      page.getByText(/Distancia en línea recta desde el centro/),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /min 🚶|min 🚲/ }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Todo el territorio", exact: true })
      .click();
    await expect(cards).toHaveCount(3);
    await expect(diagram.locator("circle[fill-opacity]")).toHaveCount(3);
    await page.getByRole("button", { name: "1 km", exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(diagram.locator("circle[fill-opacity]")).toHaveCount(1);
  } finally {
    localCommunityFixture(
      `delete from public.claims where title like '${prefix}%';`,
    );
  }
});
