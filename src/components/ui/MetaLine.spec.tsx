import { ssrRenderToDom } from "@qwik.dev/core/testing";
import { describe, expect, it } from "vitest";
import { MetaLine } from "./MetaLine";

const DATA = ["Sofía", "hace 4 meses", "3 columnas"];

describe("MetaLine", () => {
  it("deja cada dato como hijo directo y no escribe ningún punto en el marcado", async () => {
    // Arrange y Act
    const { document } = await ssrRenderToDom(
      <MetaLine class="text-sm">
        {DATA.map((text) => (
          <span key={text}>{text}</span>
        ))}
      </MetaLine>,
    );

    // Assert
    const line = document.querySelector(".meta-line");
    const items = line?.querySelector(".meta-line-items");
    expect(line?.getAttribute("class")).toContain("text-sm");
    expect(
      Array.from(items?.children ?? [])
        .filter((child) => child.tagName === "SPAN")
        .map((child) => child.textContent),
    ).toEqual(DATA);
    expect(line?.textContent).not.toContain("·");
  });
});
