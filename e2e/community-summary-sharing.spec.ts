import { expect, test } from "@playwright/test";

test("los resúmenes comparten exactamente la vista previa en inglés", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, { summaryTest: { copied: "", opened: "" } });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (
            window as typeof window & { summaryTest: { copied: string } }
          ).summaryTest.copied = text;
        },
      },
    });
    window.open = (url) => {
      (
        window as typeof window & { summaryTest: { opened: string } }
      ).summaryTest.opened = String(url);
      return null;
    };
  });
  await page.goto("/c/mar-del-plata/?lang=en");
  await page.getByText("More tools", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Neighborhood Digest for WhatsApp",
      exact: true,
    })
    .click();
  const digest = page.getByRole("dialog");
  const preview = digest.locator(".whitespace-pre-line");
  await expect(preview).toContainText("Summary of Mar del Plata");
  const text = await preview.innerText();
  await digest.getByRole("button", { name: "Copy text", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { summaryTest: { copied: string } })
            .summaryTest.copied,
      ),
    )
    .toBe(text);
  await digest
    .getByRole("button", { name: "Send via WhatsApp", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        new URL(
          (window as typeof window & { summaryTest: { opened: string } })
            .summaryTest.opened || "https://example.test",
        ).searchParams.get("text"),
      ),
    )
    .toBe(text);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: "Generate civic card for social media",
      exact: true,
    })
    .click();
  const card = page.getByRole("dialog");
  await card.getByText("Message preview", { exact: true }).click();
  const cardText = await card.locator("details p").innerText();
  expect(cardText).toContain("Members:");
  await card
    .getByRole("button", { name: "Copy balance text", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { summaryTest: { copied: string } })
            .summaryTest.copied,
      ),
    )
    .toBe(cardText);
  await card
    .getByRole("button", { name: "Share on WhatsApp", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        new URL(
          (window as typeof window & { summaryTest: { opened: string } })
            .summaryTest.opened,
        ).searchParams.get("text"),
      ),
    )
    .toBe(cardText);
});
