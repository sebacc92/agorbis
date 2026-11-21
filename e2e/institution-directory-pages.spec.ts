import { expect, test } from "@playwright/test";
import { localCommunityFixture } from "./local-community-fixtures";

for (const javaScriptEnabled of [true, false]) {
test.describe(`directorios e historial ${javaScriptEnabled ? "con JavaScript" : "mediante HTML"}`, () => {
  test.use({ javaScriptEnabled });
  test("los directorios buscan literalmente antes de paginar y conservan el tipo", async ({ page }) => {
    const suffix = crypto.randomUUID();
    const prefix = `Institucion ${suffix}`;
    const query = `${prefix} .*%_ "A&B"`;
    try {
      localCommunityFixture(`
        begin;
        insert into public.organizations(community_id,name,slug,type,verified_at)
        select c.id,'${query} ' || lpad(n::text,2,'0'),'paginas-${suffix}-' || n,'institution',now() from public.communities c cross join generate_series(1,30) n where c.slug='mar-del-plata';
        insert into public.organizations(community_id,name,slug,type,verified_at)
        select c.id,'${query} Tierra','paginas-${suffix}-earth','institution',now() from public.communities c where c.slug='earth';
        insert into public.organizations(community_id,name,slug,type,verified_at)
        select c.id,'${query} Otro tipo','paginas-${suffix}-ngo','ngo',now() from public.communities c where c.slug='mar-del-plata';
        commit;
      `);
      for (const [path, lastPageCount] of [["/instituciones/", 7], ["/c/mar-del-plata/instituciones/", 6]] as const) {
        await page.goto(`${path}?q=${encodeURIComponent(query)}&tipo=institution`);
        const headings = page.getByRole("heading", { level: 2, name: new RegExp(`^${prefix}`) });
        await expect(headings).toHaveCount(24);
        const first = await headings.allTextContents();
        const nav = page.getByRole("navigation", { name: "Paginación de instituciones", exact: true });
        await nav.getByRole("link", { name: "Siguiente", exact: true }).click();
        await expect(page).toHaveURL((url) => url.searchParams.get("pagina") === "2" && url.searchParams.get("q") === query && url.searchParams.get("tipo") === "institution");
        await expect(headings).toHaveCount(lastPageCount);
        const second = await headings.allTextContents();
        expect(new Set([...first, ...second]).size).toBe(24 + lastPageCount);
        await page.reload();
        await expect(headings).toHaveCount(lastPageCount);
        const form = page.getByRole("search", { name: "Buscar institución", exact: true });
        await expect(form.getByRole("searchbox", { name: "Buscar institución", exact: true })).toHaveValue(query);
        await expect(form.getByRole("combobox", { name: "Tipo de institución", exact: true })).toHaveValue("institution");
        await form.getByRole("searchbox", { name: "Buscar institución", exact: true }).fill(`${prefix} imposible`);
        await form.getByRole("button", { name: "Buscar", exact: true }).focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL((url) => !url.searchParams.has("pagina") && url.searchParams.get("tipo") === "institution");
        await expect(headings).toHaveCount(0);
        await expect(page.getByRole("status").filter({ hasText: /^Página 1 · 0 instituciones en esta página\./ })).toBeVisible();
      }
    } finally {
      localCommunityFixture(`delete from public.organizations where slug like 'paginas-${suffix}%';`);
    }
  });

  test("el historial muestra veinte respuestas por página con títulos y sin duplicados", async ({ page }) => {
    const suffix = crypto.randomUUID();
    const orgSlug = `historial-${suffix}`;
    const claimTitle = `Reclamo historial ${suffix}`;
    try {
      localCommunityFixture(`
        begin;
        insert into public.organizations(community_id,name,slug,type,verified_at) select c.id,'Institución historial ${suffix}','${orgSlug}','institution',now() from public.communities c where c.slug='mar-del-plata';
        insert into public.claims(community_id,title,description,category) select c.id,'${claimTitle}','Fixture para el historial institucional paginado.','otro' from public.communities c where c.slug='mar-del-plata';
        insert into public.institutional_responses(organization_id,author_id,content_type,content_id,body,created_at)
        select o.id,'33333333-3333-4333-8333-333333333333'::uuid,'claim',c.id,'Respuesta institucional para la prueba ' || n,timestamptz '2090-01-01 00:00:00+00' from public.organizations o cross join public.claims c cross join generate_series(1,22) n where o.slug='${orgSlug}' and c.title='${claimTitle}';
        commit;
      `);
      await page.goto(`/instituciones/${orgSlug}/`);
      const history = page.locator('section[aria-labelledby="historial-respuestas"]');
      await expect(history.locator("ol > li")).toHaveCount(20);
      await expect(history.getByRole("link", { name: claimTitle, exact: true })).toHaveCount(20);
      const first = await history.locator("ol > li p").allTextContents();
      await history.getByRole("link", { name: "Siguiente", exact: true }).click();
      await expect(page).toHaveURL((url) => url.searchParams.get("respuestas") === "2");
      await expect(history.locator("ol > li")).toHaveCount(2);
      await expect(history.getByRole("link", { name: claimTitle, exact: true })).toHaveCount(2);
      const second = await history.locator("ol > li p").allTextContents();
      expect(new Set([...first, ...second]).size).toBe(22);
      await history.getByRole("link", { name: "← Anterior", exact: true }).click();
      await expect(history.locator("ol > li")).toHaveCount(20);
      await expect(page).toHaveURL((url) => !url.searchParams.has("respuestas"));
    } finally {
      localCommunityFixture(`delete from public.organizations where slug='${orgSlug}'; delete from public.claims where title='${claimTitle}';`);
    }
  });
});

}
