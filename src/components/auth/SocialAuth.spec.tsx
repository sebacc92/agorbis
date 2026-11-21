import { describe, expect, it } from "vitest";
import { renderWithLocale } from "~/testing/render";
import { SocialAuth } from "./SocialAuth";
import type { GoogleAuthNotice } from "~/lib/google-auth-consent";
import type { LegalDocumentContent } from "~/lib/legal-content";

const content: LegalDocumentContent = {
  title: "Aviso de prueba",
  summary: "Resumen para pruebas unitarias.",
  sections: [
    {
      title: "Sección 1",
      paragraphs: ["Párrafo de prueba para el aviso."],
    },
  ],
};

const mockNotice: GoogleAuthNotice = {
  provider: "google",
  version: "2026-09-09.1",
  content_hash: "a".repeat(64),
  content_hash_algorithm: "sha256-postgres-jsonb-v1",
  content_snapshot: { es: content, en: content },
  effective_at: "2026-09-01T00:00:00Z",
  issued_at: "2026-09-08T00:00:00Z",
};

describe("SocialAuth Component", () => {
  it("Google runtime ON + notice disponible → botón visible y separador presente", async () => {
    const { document } = await renderWithLocale(
      <SocialAuth
        intent="register"
        next="/onboarding"
        googleEnabled={true}
        googleNotice={mockNotice}
      />,
      "es",
    );

    const button = document.querySelector("#register-provider-google");
    expect(button).not.toBeNull();
    expect(button?.textContent).toContain("Continuar con Google");

    const text = document.body.textContent ?? "";
    expect(text).toContain("o con tu correo");
    expect(text).not.toContain(
      "El acceso con Google todavía no está disponible. Podés continuar por correo.",
    );
  });

  it("Google runtime OFF → botón oculto, sin fallback ni separador huérfano", async () => {
    const { document } = await renderWithLocale(
      <SocialAuth
        intent="register"
        next="/onboarding"
        googleEnabled={false}
        googleNotice={null}
      />,
      "es",
    );

    const button = document.querySelector("#register-provider-google");
    expect(button).toBeFalsy();

    const section = document.querySelector("#register-social-auth");
    expect(section).toBeFalsy();

    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Continuar con Google");
    expect(text).not.toContain("o con tu correo");
    expect(text).not.toContain(
      "El acceso con Google todavía no está disponible. Podés continuar por correo.",
    );
  });

  it("Google ON pero notice ausente → fallback seguro sin botón ni separador huérfano", async () => {
    const { document } = await renderWithLocale(
      <SocialAuth
        intent="register"
        next="/onboarding"
        googleEnabled={true}
        googleNotice={null}
      />,
      "es",
    );

    const button = document.querySelector("#register-provider-google");
    expect(button).toBeFalsy();

    const text = document.body.textContent ?? "";
    expect(text).toContain(
      "El acceso con Google todavía no está disponible. Podés continuar por correo.",
    );
    expect(text).not.toContain("Continuar con Google");
    expect(text).not.toContain("o con tu correo");
  });
});
