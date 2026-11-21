import { createDOM } from "@qwik.dev/core/testing";
import { describe, expect, it } from "vitest";
import { Avatar } from "./index";

describe("avatar que no carga", () => {
  it("recupera las iniciales sin conservar una imagen rota", async () => {
    const { render, screen, userEvent } = await createDOM();
    await render(
      <Avatar
        src="https://example.test/avatar.png"
        name="Sofía Rearte"
        size="lg"
      />,
    );
    const image = screen.querySelector("img")!;
    await userEvent(image, "error");
    expect(screen.querySelector("img")).toBeFalsy();
    expect(screen.textContent).toContain("SR");
    expect(screen.querySelector("span")?.className).toContain("size-16");
  });
});
