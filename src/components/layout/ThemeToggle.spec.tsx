import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { THEME_CHANGED_EVENT } from "~/lib/theme";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  it("escucha en window el cambio de tema hecho desde otro lado", async () => {
    const { container } = await renderWithLocale(<ThemeToggle />);
    // qwikloader duplica cada guion del nombre del evento en el atributo.
    const encoded = THEME_CHANGED_EVENT.replace(/-/g, "--");
    const html = container.element.outerHTML;
    expect(html).toContain(`q-w:${encoded}=`);
    expect(html).not.toContain(`q-d:${encoded}=`);
  });
});
