import { component$, useContextProvider } from "@qwik.dev/core";
import { QwikRouterMockProvider } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import { renderWithLocale } from "~/testing/render";
import { RemoveContentButton } from "./RemoveContentButton";

const id = "a0000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({ failedId: "", failedType: "project" }));
vi.mock("~/lib/content-actions", () => ({
  useRemoveOwnContent: () => {
    const data = new FormData();
    data.set("id", mocks.failedId);
    data.set("type", mocks.failedType);
    return {
      actionPath: "?qaction=remove",
      isRunning: false,
      formData: mocks.failedId ? data : undefined,
      value: mocks.failedId
        ? { message: "No pudimos dar de baja el contenido." }
        : undefined,
    };
  },
}));

const Example = component$<{ author: boolean; cancelled?: boolean }>(
  ({ author, cancelled }) => {
    useContextProvider(LocaleContext, "es");
    return (
      <QwikRouterMockProvider
        url={`http://localhost/proyectos/${id}/?orden=recientes&qaction=anterior${cancelled ? `&cancelar_baja=project%3A${id}` : ""}`}
      >
        <RemoveContentButton
          type="project"
          id={id}
          isAuthor={author}
          createdAt="2026-10-01T12:00:00Z"
          backHref="/c/mar-del-plata/proyectos"
        />
      </QwikRouterMockProvider>
    );
  },
);

beforeEach(() => {
  mocks.failedId = "";
  mocks.failedType = "project";
});

describe("confirmación HTML para dar de baja", () => {
  it("sólo se ofrece al autor", async () => {
    const { document } = await renderWithLocale(<Example author={false} />);
    expect(document.querySelector("details")).toBeFalsy();
    expect(document.querySelector("form")).toBeFalsy();
  });

  it("incluye el formulario y una cancelación GET aunque no se ejecute JavaScript", async () => {
    const { document } = await renderWithLocale(<Example author />);
    expect(document.querySelector<HTMLDetailsElement>("details")?.open).toBe(
      false,
    );
    expect(
      document.querySelector("summary")?.getAttribute("aria-controls"),
    ).toBe(`baja-confirmacion-${id}`);
    const form = document.querySelector("form")!;
    expect(form.querySelector('input[name="id"]')?.getAttribute("value")).toBe(
      id,
    );
    expect(
      form.querySelector('input[name="type"]')?.getAttribute("value"),
    ).toBe("project");
    expect(
      form.querySelector('input[name="back"]')?.getAttribute("value"),
    ).toBe("/c/mar-del-plata/proyectos");
    const cancel = Array.from(form.querySelectorAll("a")).find(
      (link) => link.textContent === "Cancelar",
    )!;
    const destination = new URL(
      cancel.getAttribute("href")!,
      "http://localhost",
    );
    expect(destination.pathname).toBe(`/proyectos/${id}/`);
    expect(destination.searchParams.get("orden")).toBe("recientes");
    expect(destination.searchParams.has("qaction")).toBe(false);
    expect(destination.searchParams.get("cancelar_baja")).toBe(`project:${id}`);
    expect(destination.hash).toBe(`#baja-${id}`);
  });

  it("cancelar otra vez cambia la consulta para recargar también después de una cancelación HTML previa", async () => {
    const { document } = await renderWithLocale(<Example author cancelled />);
    const cancel = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a"),
    ).find((link) => link.textContent === "Cancelar")!;
    const destination = new URL(
      cancel.getAttribute("href")!,
      "http://localhost",
    );
    expect(destination.pathname).toBe(`/proyectos/${id}/`);
    expect(destination.searchParams.get("orden")).toBe("recientes");
    expect(destination.searchParams.has("cancelar_baja")).toBe(false);
    expect(destination.searchParams.has("qaction")).toBe(false);
    expect(destination.hash).toBe(`#baja-${id}`);
  });

  it.each([
    [id, "project", true],
    ["a0000000-0000-4000-8000-000000000002", "project", false],
    [id, "poll", false],
  ])(
    "un rechazo sólo abre la confirmación del contenido enviado: %s/%s",
    async (failedId, failedType, expected) => {
      mocks.failedId = failedId;
      mocks.failedType = failedType;
      const { document } = await renderWithLocale(<Example author />);
      expect(document.querySelector<HTMLDetailsElement>("details")?.open).toBe(
        expected,
      );
      expect(
        !!document
          .querySelector('[role="alert"]')
          ?.textContent?.includes("No pudimos dar de baja el contenido."),
      ).toBe(expected);
    },
  );
});
