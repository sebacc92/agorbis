import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import type { LegalDocumentContent } from "~/lib/legal-content";
import { LegalDocument } from "./LegalDocument";

const content: LegalDocumentContent = {
  title: "Documento legal de prueba",
  summary: "Contenido mínimo para verificar el estado AAIP.",
  sections: [],
};

describe("LegalDocument AAIP pending", () => {
  it("renders the exact Spanish pending copy without the approved label", async () => {
    const { document } = await renderWithLocale(
      <LegalDocument content={content} version="2026-08-29" />,
      "es",
    );
    const text = document.body.textContent ?? "";

    expect(text).toContain(
      "Inscripción de la base ante la AAIP: en trámite. Aún no se cuenta con una constancia aprobada ni con un número de registro de la base. El código del responsable y las referencias del trámite no sustituyen ese número.",
    );
    expect(text).not.toContain("Número de registro de la base ante la AAIP:");
  });

  it("renders the exact English pending copy without the approved label", async () => {
    const { document } = await renderWithLocale(
      <LegalDocument content={content} version="2026-08-29" />,
      "en",
    );
    const text = document.body.textContent ?? "";

    expect(text).toContain(
      "AAIP database registration: pending. No approved registration certificate or database registration number is currently available. Controller and filing references do not replace that number.",
    );
    expect(text).not.toContain("AAIP database registration number:");
  });
});
