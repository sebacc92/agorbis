import { expect, test } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";

test("Todo el territorio encuadra los puntos y la lista distingue el radio de los reclamos sin ubicación", async ({ page }) => {
  const prefix = `Mapa alcance ${crypto.randomUUID()}`;
  try {
    localCommunityFixture(`
      begin;
      insert into public.claims(community_id,title,description,category,lat,lng,created_at)
      select c.id,'${prefix} cerca','Fixture con ubicación cercana.','otro',c.lat,c.lng,timestamptz '2090-01-01 00:00:00+00' from public.communities c where c.slug='mar-del-plata'
      union all
      select c.id,'${prefix} lejos','Fixture con ubicación distante.','otro',-31.4,-64.2,timestamptz '2090-01-01 00:00:00+00' from public.communities c where c.slug='mar-del-plata'
      union all
      select c.id,'${prefix} sin ubicación','Fixture sin ubicación.','otro',null,null,timestamptz '2090-01-01 00:00:00+00' from public.communities c where c.slug='mar-del-plata';
      commit;
    `);
    await page.goto(`/c/mar-del-plata/mapa/?q=${encodeURIComponent(prefix)}`);
    const cards = page.locator("#map-claims > button");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText(`${prefix} cerca`);
    await expect(page.getByText("1 reclamo con ubicación queda fuera de este radio.", { exact: true })).toBeVisible();
    const unlocated = page.locator('section[aria-labelledby="unlocated-claims-title"]');
    await expect(unlocated.getByRole("heading", { name: "Sin ubicación marcada (1)", exact: true })).toBeVisible();
    await expect(unlocated.getByRole("link", { name: `${prefix} sin ubicación`, exact: true })).toBeVisible();
    const diagram = page.getByRole("img", { name: "Esquema de reclamos con ubicación en Mar del Plata", exact: true });
    await expect(diagram.locator("circle[fill-opacity]")).toHaveCount(1);
    await page.getByRole("button", { name: "Todo el territorio", exact: true }).click();
    await expect(cards).toHaveCount(2);
    await expect(diagram.locator("circle[fill-opacity]")).toHaveCount(2);
    expect(await diagram.locator("circle[fill-opacity]").evaluateAll((points) => points.every((point) => {
      const x = Number(point.getAttribute("cx")); const y = Number(point.getAttribute("cy"));
      return x > 0 && x < 100 && y > 0 && y < 100;
    }))).toBe(true);
    await expect(unlocated.getByRole("link", { name: `${prefix} sin ubicación`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "300 m", exact: true }).click();
    await expect(cards).toHaveCount(1);
    await expect(diagram.locator("circle[fill-opacity]")).toHaveCount(1);
  } finally {
    localCommunityFixture(`delete from public.claims where title like '${prefix}%';`);
  }
});

test("el GPS muestra progreso y error y el reset ignora una respuesta tardía", async ({ page }) => {
  await page.addInitScript(() => {
    const requests: { success: PositionCallback; error: PositionErrorCallback | null }[] = [];
    Object.defineProperty(window, "mapGeoRequests", { value: requests });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (success: PositionCallback, error: PositionErrorCallback | null = null) => requests.push({ success, error }),
    } });
  });
  await page.goto("/c/mar-del-plata/mapa/");
  const button = page.getByRole("button", { name: /Mi ubicación$/ });
  const status = page.locator("#map-location-status");
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("aria-busy", "true");
  await expect(status).toHaveText("Buscando tu ubicación aproximada…");
  await page.evaluate(() => {
    const requests = Reflect.get(window, "mapGeoRequests") as { error: PositionErrorCallback }[];
    requests[0].error({ code: 1, message: "Denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });
  await expect(button).toBeEnabled();
  await expect(status).toHaveText("No pudimos obtener tu ubicación.");
  await button.click();
  await expect(status).toHaveText("Buscando tu ubicación aproximada…");
  await page.getByRole("button", { name: "Centrar en la comunidad", exact: true }).click();
  await expect(button).toBeEnabled();
  await expect(status).toBeEmpty();
  await page.evaluate(() => {
    const requests = Reflect.get(window, "mapGeoRequests") as { success: PositionCallback }[];
    requests[1].success({ coords: { latitude: -31.40012345, longitude: -64.20045678, accuracy: 1, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() } as GeolocationPosition);
  });
  await expect(page.getByText("Centrado en Mar del Plata · 1km", { exact: true })).toBeVisible();
  await expect(page.getByText("Centrado en tu ubicación aproximada", { exact: false })).toHaveCount(0);
  await button.click();
  await page.evaluate(() => {
    const requests = Reflect.get(window, "mapGeoRequests") as { success: PositionCallback }[];
    requests[2].success({ coords: { latitude: -31.40012345, longitude: -64.20045678, accuracy: 1, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() } as GeolocationPosition);
  });
  await expect(button).toBeEnabled();
  await expect(page.getByText("Centrado en tu ubicación aproximada · 1km", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Centrar en la comunidad", exact: true }).click();
  await expect(page.getByText("Centrado en Mar del Plata · 1km", { exact: true })).toBeVisible();
});
