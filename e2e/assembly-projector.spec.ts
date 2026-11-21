import { expect, test } from "@playwright/test";

test("el turno se reinicia al cerrar, puede repetirse al terminar y cabe en móvil", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.clock.install();
  await page.goto("/debates/c0000000-0000-4000-8000-000000000001/");
  const opener = page.getByRole("button", {
    name: "Modo Asamblea / Proyector",
    exact: true,
  });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  const timer = dialog.getByRole("timer", {
    name: "Tiempo restante del turno",
  });
  const start = dialog.getByRole("button", { name: "Turno 2m", exact: true });
  await expect(timer).toHaveText("2:00");
  await expect
    .poll(async () => (await start.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(44);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "/tmp/agorbis-round7-assembly.png" });
  await start.click();
  await expect(
    dialog.getByRole("button", { name: "Reiniciar", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(5_000);
  await expect(timer).toHaveText(/1:5[0-5]/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.clock.fastForward(130_000);
  await page.keyboard.press("Enter");
  await expect(timer).toHaveText("2:00");
  await page.clock.fastForward(3_000);
  await expect(timer).toHaveText("2:00");

  await start.click();
  await page.clock.fastForward(121_000);
  await expect(timer).toHaveText("0:00");
  await expect(dialog.getByRole("status")).toHaveText(
    "El turno terminó. Podés iniciar otro de dos minutos.",
  );
  await start.click();
  await expect(timer).toHaveText("2:00");
  await expect(dialog.getByRole("status")).toBeEmpty();
  const exit = dialog.getByRole("button", {
    name: "Salir (Esc)",
    exact: true,
  });
  await exit.click();
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(timer).toHaveText("2:00");
  await expect(start).toBeVisible();
});
