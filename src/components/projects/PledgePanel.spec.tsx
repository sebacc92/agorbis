import { component$, useContextProvider } from "@qwik.dev/core";
import { createDOM } from "@qwik.dev/core/testing";
import { describe, expect, it } from "vitest";
import { LocaleContext } from "~/lib/i18n";
import type { usePledge } from "~/routes/proyectos/[id]";
import { renderWithLocale } from "~/testing/render";
import { PledgePanel } from "./PledgePanel";

const Example = component$<{
  failed?: boolean;
  existing?: boolean;
  total?: number;
}>(
  ({ failed = false, existing = false, total = 1000 }) => {
    useContextProvider(LocaleContext, "es");
    return (
      <PledgePanel
        pledge={{ value: undefined, formData: undefined, isRunning: false, actionPath: "?qaction=pledge" } as ReturnType<typeof usePledge>}
        projectId="project"
        currency="ARS"
        budget={10000}
        pledgedTotal={total}
        pledgeCount={1}
        pledges={[]}
        myPledge={existing ? { amount: 1000, message: "Mi mensaje conservado" } : null}
        myPledgeLoadFailed={failed}
        isMember
        isAuthenticated
        returnPath="/proyectos/project#aporte-proyecto"
      />
    );
  },
);

describe("lectura del compromiso personal", () => {
  it("un fallo se distingue de ausencia y bloquea formularios de alta, edición y retiro", async () => {
    const { render, screen } = await createDOM();
    await render(<Example failed />);
    expect(screen.textContent).toContain("No pudimos cargar tu compromiso.");
    expect(screen.querySelectorAll("form")).toHaveLength(0);
    expect(screen.querySelectorAll('input[name="amount"]')).toHaveLength(0);
    expect(screen.querySelector("a")?.getAttribute("href")).toBe("/proyectos/project#aporte-proyecto");
    expect(screen.querySelector("a")?.textContent).toContain("Volver a cargar mi compromiso");
    expect(screen.textContent).not.toContain("Tu compromiso se guardó.");
  });

  it("una lectura correcta sin compromiso permite el formulario nuevo", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    expect(screen.querySelector('input[name="amount"]')).toBeTruthy();
    expect(screen.textContent).toContain("Comprometer aporte");
    expect(screen.textContent).not.toContain("No pudimos cargar tu compromiso.");
  });

  it("un compromiso confirmado conserva su mensaje y sus opciones", async () => {
    const { render, screen } = await createDOM();
    await render(<Example existing />);
    expect(screen.textContent).toContain("Mi mensaje conservado");
    expect(screen.textContent).toContain("Cambiar monto");
    expect(screen.textContent).toContain("Retirar compromiso");
    expect(screen.querySelectorAll('input[name="amount"]')).toHaveLength(0);
  });
});

describe("qué significa comprometerse", () => {
  it("aclara que no es un pago y ofrece los aportes no monetarios", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    expect(screen.textContent).toContain(
      "Compromiso público, no un pago: nadie transfiere dinero a través de Agorbis.",
    );
    expect(screen.textContent).toContain(
      "Quienes se comprometen reciben una notificación cuando el proyecto avanza.",
    );
    expect(screen.textContent).not.toContain("todavía");
    expect(
      screen.querySelector('a[href="#aportes-no-monetarios"]')?.textContent,
    ).toContain("¿Preferís aportar tiempo, materiales o habilidades?");
  });

  it("alcanzar la meta no promete un cobro ni un cambio automático", async () => {
    const { render, screen } = await createDOM();
    await render(<Example total={12000} />);
    expect(screen.textContent).toContain("Meta alcanzada.");
    expect(screen.textContent).toContain(
      "Alcanzarla no cobra nada: quien lo propuso decide cuándo pasarlo a ejecución.",
    );
  });

  // Sin sesión el panel dibuja `ButtonLink`, que necesita el contexto del
  // router: por eso este caso se renderiza con `renderWithLocale`.
  it("sin sesión la aclaración sigue entera, como nota, y no promete aportes que no puede ofrecer", async () => {
    const { document } = await renderWithLocale(
      <PledgePanel
        pledge={
          {
            value: undefined,
            formData: undefined,
            isRunning: false,
            actionPath: "?qaction=pledge",
          } as ReturnType<typeof usePledge>
        }
        projectId="project"
        currency="ARS"
        budget={10000}
        pledgedTotal={1000}
        pledgeCount={1}
        pledges={[]}
        myPledge={null}
        myPledgeLoadFailed={false}
        isMember={false}
        isAuthenticated={false}
        returnPath="/proyectos/project#aporte-proyecto"
      />,
    );
    const disclaimer = Array.from(document.querySelectorAll("p")).find((p) =>
      p.textContent?.includes(
        "Compromiso público, no un pago: nadie transfiere dinero a través de Agorbis.",
      ),
    );
    expect(disclaimer).toBeTruthy();
    // Una nota y no un aviso vivo: los E2E piden el único `status` del panel.
    expect(disclaimer!.closest("[role]")).toBeNull();
    expect(
      document.querySelector('a[href="#aportes-no-monetarios"]'),
    ).toBeFalsy();
    // Lo guía el llamado principal del panel, no el enlace a los aportes.
    expect(
      Array.from(document.querySelectorAll("a")).some((link) =>
        link.textContent?.includes("Ingresar para comprometerme"),
      ),
    ).toBe(true);
  });

  it("el botón de comprometer se describe con la aclaración", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    const submit = screen.querySelector('button[type="submit"]');
    const describedBy = submit?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(screen.querySelector(`#${describedBy}`)?.textContent).toBe(
      "Compromiso público, no un pago: nadie transfiere dinero a través de Agorbis.",
    );
  });
});

// La anatomía de las métricas (D123): el cero va atenuado y no en el color de
// los datos, que lo hacía ver como algo para festejar.
describe("el total comprometido", () => {
  it("en cero va atenuado", async () => {
    const { render, screen } = await createDOM();
    await render(<Example total={0} />);
    const total = screen.querySelector(".text-display-md");
    expect(total).toBeTruthy();
    expect(total!.classList.contains("text-ink-muted")).toBe(true);
    expect(total!.classList.contains("text-data")).toBe(false);
  });

  it("con compromisos lleva el color de los datos", async () => {
    const { render, screen } = await createDOM();
    await render(<Example />);
    const total = screen.querySelector(".text-display-md");
    expect(total).toBeTruthy();
    expect(total!.classList.contains("text-data")).toBe(true);
    expect(total!.classList.contains("text-ink-muted")).toBe(false);
  });
});
