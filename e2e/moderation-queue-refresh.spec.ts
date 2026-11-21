import { expect, test, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import {
  acceptCurrentLegalAs,
  createLegalTestAccount,
  withTestAccountSession,
} from "./account-followup-fixtures";
import { localCommunityFixture } from "./local-community-fixtures";

/**
 * Con JavaScript, una acción sin `invalidate` no vuelve a leer ningún loader
 * (`strictLoaders` es el valor por defecto del router): la tarjeta seguía con
 * el reporte abierto y los botones activos después de "Ocultar y resolver".
 * Los otros E2E de moderación corren sin JavaScript, donde el POST nativo
 * recarga la página entera y el problema no se ve.
 */
const moderatorEmail = "moderador@agorbis.test";
const moderatorPassword =
  process.env.E2E_USER_PASSWORD ?? "AgorbisLocal-2026!";
const moderatorTotpSecret = "KRUGS4ZANFZSAYJA";
const seededAuthor = "33333333-3333-4333-8333-333333333333";
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

function totpCode(secret: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret.replaceAll("=", "").toUpperCase()) {
    const value = alphabet.indexOf(character);
    if (value < 0) throw new Error("Secreto TOTP base32 inválido.");
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(
    Array.from({ length: Math.floor(bits.length / 8) }, (_, index) =>
      Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2),
    ),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) >>>
    0;
  return String(binary % 1_000_000).padStart(6, "0");
}

async function signInAsModerator(page: Page, next: string) {
  await acceptCurrentLegalAs(moderatorEmail, moderatorPassword);
  await page.goto(`/ingresar/?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Correo electrónico").first().fill(moderatorEmail);
  await page.locator('input[name="password"]').fill(moderatorPassword);
  await expect(page.locator('input[name="turnstile_token"]')).toHaveValue(
    /\S+/,
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Ingresar", exact: true }).click();
  await expect(page).toHaveURL(/\/perfil\/seguridad\/?\?next=/);
  await page.getByLabel("Código temporal").fill(totpCode(moderatorTotpSecret));
  await page.getByRole("button", { name: "Verificar y continuar" }).click();
  await expect(page).toHaveURL(/\/moderacion\/?$/);
}

test("ocultar y resolver actualiza la tarjeta sin recargar la página", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const reporter = await createLegalTestAccount("cola-en-vivo");
  const projectId = crypto.randomUUID();
  const title = `Cola en vivo ${projectId.slice(0, 8)}`;
  try {
    localCommunityFixture(
      `insert into public.projects(id,community_id,author_id,title,summary,plan)
      select ${literal(projectId)}::uuid,id,${literal(seededAuthor)}::uuid,${literal(title)},'Fixture local para comprobar que la cola se refresca.','Con JavaScript el loader se tiene que volver a leer.' from public.communities where slug='mar-del-plata';`,
    );
    await withTestAccountSession(reporter.email, async (client) => {
      const { error } = await client.from("reports").insert({
        reporter_id: reporter.id,
        target_type: "project",
        target_id: projectId,
        reason: "Fixture: comprobar el refresco de la cola de moderación.",
      });
      if (error) throw error;
    });

    await signInAsModerator(page, "/moderacion");
    const card = page.locator("li").filter({ hasText: title });
    await expect(card).toHaveCount(1);
    await expect(
      card.getByText("1 reporte abierto", { exact: true }),
    ).toBeVisible();

    // Una marca en `window` sobrevive sólo si no hubo recarga completa.
    await page.evaluate(() => {
      (window as unknown as { __agorbisQueue?: boolean }).__agorbisQueue =
        true;
    });
    await card
      .getByRole("button", { name: "Ocultar y resolver (1)", exact: true })
      .click();

    await expect(
      card.getByRole("button", { name: "Ocultar y resolver (1)", exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await card.count()) === 0 ||
          (await card.getByText("Contenido oculto", { exact: true }).count()) >
            0,
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __agorbisQueue?: boolean }).__agorbisQueue,
      ),
    ).toBe(true);
  } finally {
    localCommunityFixture(
      `delete from public.reports where target_id=${literal(projectId)}::uuid; delete from public.projects where id=${literal(projectId)}::uuid;`,
    );
    await reporter.admin.auth.admin.deleteUser(reporter.id);
  }
});
