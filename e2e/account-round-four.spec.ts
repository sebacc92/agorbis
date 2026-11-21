import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createLegalTestAccount, localAccountAdmin, signInTestAccount, testAccountPassword } from "./account-followup-fixtures";
import { nativeContextOptions } from "./native-context";

function totpCode(secret: string, now = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replaceAll("=", "").toUpperCase()].map((letter) => {
    const index = alphabet.indexOf(letter);
    if (index < 0) throw new Error("El secreto local no es base32.");
    return index.toString(2).padStart(5, "0");
  }).join("");
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) => parseInt(bits.slice(index * 8, index * 8 + 8), 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
}

test("el TOTP rechazado por POST nativo retoma el mismo factor sin volver a mostrar su secreto", async ({ page, browser, baseURL }) => {
  test.setTimeout(90_000);
  const actor = await createLegalTestAccount("totp-reintento");
  try {
    const next = "/perfil/?seccion=cuenta#seguridad";
    await signInTestAccount(page, actor.email, `/perfil/seguridad/?next=${encodeURIComponent(next)}`);
    const context = await browser.newContext({ baseURL, ...nativeContextOptions, storageState: await page.context().storageState() });
    try {
      const native = await context.newPage();
      await native.goto(`/perfil/seguridad/?next=${encodeURIComponent(next)}`);
      await native.locator('input[name="current_password"]').fill(testAccountPassword);
      await native.getByRole("button", { name: "Empezar configuración", exact: true }).focus();
      await native.keyboard.press("Enter");
      await expect(native.getByRole("heading", { name: "Configurá el autenticador" })).toBeVisible();
      const factorId = await native.locator('input[name="factor_id"]').inputValue();
      const secret = (await native.locator("code").textContent())?.trim();
      expect(Boolean(secret)).toBe(true);
      if (!secret) throw new Error("No llegó el secreto inicial del fixture.");
      const valid = new Set([-30000, 0, 30000].map((offset) => totpCode(secret, Date.now() + offset)));
      const rejectedCode = ["000000", "111111", "222222", "333333"].find((code) => !valid.has(code))!;
      for (let attempt = 0; attempt < 2; attempt++) {
        await native.getByLabel("Código temporal").fill(rejectedCode);
        const response = native.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("qaction="));
        await native.getByRole("button", { name: "Activar segundo factor", exact: true }).focus();
        await native.keyboard.press("Enter");
        expect((await response).status()).toBe(400);
        await expect(native.getByRole("heading", { name: "Terminá de activar tu autenticador" })).toBeVisible();
        await expect(native.locator('input[name="factor_id"]')).toHaveValue(factorId);
        await expect(native.locator('input[name="next"]')).toHaveValue(next);
        await expect(native.locator("code, img[alt='Código QR del autenticador']")).toHaveCount(0);
        expect((await native.locator("body").textContent())?.includes(secret)).toBe(false);
        const factors = await actor.admin.auth.admin.mfa.listFactors({ userId: actor.id });
        expect(factors.error).toBeNull();
        expect(factors.data?.factors.map((factor) => factor.id)).toEqual([factorId]);
      }
      await native.getByLabel("Código temporal").fill(totpCode(secret));
      await native.getByRole("button", { name: "Activar segundo factor", exact: true }).focus();
      await native.keyboard.press("Enter");
      await expect(native).toHaveURL((url) => url.pathname === "/perfil/" && url.searchParams.get("seccion") === "cuenta" && url.hash === "#seguridad");
      const factors = await actor.admin.auth.admin.mfa.listFactors({ userId: actor.id });
      expect(factors.data?.factors).toEqual([expect.objectContaining({ id: factorId, status: "verified" })]);
    } finally { await context.close(); }
  } finally { expect((await actor.admin.auth.admin.deleteUser(actor.id)).error).toBeNull(); }
});

test("reenviar confirmación conserva el destino seguro desde ingreso y tras un rechazo nativo", async ({ page, browser, baseURL }) => {
  localAccountAdmin();
  const next = "/proyectos/f0000000-0000-4000-8000-000000000001?origen=alta#aporte-proyecto";
  await page.goto(`/ingresar/?next=${encodeURIComponent(next)}`);
  await page.getByText("¿No recibiste la confirmación?", { exact: true }).click();
  const link = page.getByRole("link", { name: "Reenviar confirmación de cuenta", exact: true });
  await expect(link).toHaveAttribute("href", `/reenviar-confirmacion?next=${encodeURIComponent(next)}`);
  await link.click();
  await expect(page.locator('input[name="next"]')).toHaveValue(next);
  const nativeContext = await browser.newContext({ baseURL, ...nativeContextOptions });
  try {
    const native = await nativeContext.newPage();
    await native.goto(`/reenviar-confirmacion/?next=${encodeURIComponent(next)}`);
    await native.getByLabel("Correo electrónico").fill(`sin-confirmar-${crypto.randomUUID()}@agorbis.test`);
    const rejected = native.waitForResponse((res) => res.request().method() === "POST" && res.url().includes("qaction="));
    // Sin SDK de Turnstile no se autoriza el reenvío; el rechazo conserva next.
    await native.getByRole("button", { name: "Reenviar confirmación", exact: true }).focus();
    await native.keyboard.press("Enter");
    expect((await rejected).status()).toBe(403);
    await expect(native.getByRole("alert")).toContainText("No pudimos completar la verificación antiabuso.");
    await expect(native.locator('input[name="next"]')).toHaveValue(next);
    const back = new URL((await native.getByRole("link", { name: "Volver a ingresar" }).getAttribute("href"))!, baseURL);
    expect(back.searchParams.get("next")).toBe(next);
    await native.goto("/ingresar/?next=https%3A%2F%2Fevil.example%2Frobo");
    await native.getByText("¿No recibiste la confirmación?", { exact: true }).click();
    const safe = new URL((await native.getByRole("link", { name: "Reenviar confirmación de cuenta", exact: true }).getAttribute("href"))!, baseURL);
    expect(safe.searchParams.get("next")).not.toContain("evil.example");
  } finally { await nativeContext.close(); }
});
