import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  organizationRequestMessage,
  organizationRequestSchema,
  requestOrganization,
  requestCommunity,
} from "./civic-request-actions";

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  requireUser: vi.fn(),
  written: {
    data: { id: "saved-request" } as { id: string } | null,
    error: null as { code: string; message: string } | null,
  },
  parent: {
    data: { id: "parent" } as { id: string } | null,
    error: null as { message: string } | null,
  },
}));
vi.mock("./session", () => ({
  requireUser: mocks.requireUser,
  supabase: () => ({
    from: () => ({
      insert: (data: object) => {
        mocks.insert(data);
        return { select: () => ({ single: async () => mocks.written }) };
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => mocks.parent }) }),
    }),
  }),
}));
const event = {
  fail: (status: number, value: object) => ({ failed: true, status, ...value }),
} as unknown as Parameters<typeof requestOrganization>[1];
const organization = {
  name: "Club del Árbol",
  type: "institution" as const,
  website: "",
  evidence_url: "",
  message: "Represento al club del barrio y quiero solicitar su verificación.",
  cuit_helper: "30123456789",
  phone_helper: "+54 9 11 1234-5678",
};
const community = {
  requested_name: "Barrio del Árbol",
  country: "Argentina",
  requested_level: "neighborhood" as const,
  reason: "El barrio cuenta con registros públicos y una comunidad organizada.",
  evidence_url: "",
  parent_slug: "mar-del-plata",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireUser.mockResolvedValue({ userId: "viewer" });
  mocks.written = { data: { id: "saved-request" }, error: null };
  mocks.parent = { data: { id: "parent" }, error: null };
});

describe("solicitudes confirmadas desde la sesión", () => {
  it("incorpora contacto en servidor y comprueba la fila aceptada bajo el usuario real", async () => {
    expect(await requestOrganization(organization, event)).toEqual({
      sent: true,
      requestId: "saved-request",
      requestName: organization.name,
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "viewer",
        message: organizationRequestMessage(organization),
      }),
    );
    expect(organizationRequestMessage(organization)).toContain(
      "CUIT: 30-12345678-9",
    );
    expect(organizationRequestMessage(organization)).toContain("Tel: +54");
    expect(
      organizationRequestMessage(organization).split("Contacto institucional"),
    ).toHaveLength(2);
  });
  it("el límite incluye los datos de contacto y señala la explicación antes de escribir", () => {
    const parsed = organizationRequestSchema.safeParse({
      ...organization,
      message: "a".repeat(1995),
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues).toContainEqual(
        expect.objectContaining({ path: ["message"] }),
      );
    expect(
      organizationRequestMessage({
        message: "  Una explicación sin contacto.  ",
      }),
    ).toBe("Una explicación sin contacto.");
  });
  it("ni un rechazo del gate ni una respuesta sin fila anuncian éxito", async () => {
    mocks.written = {
      data: null,
      error: { code: "42501", message: "GEOUNITY_ACCOUNT_SUSPENDED" },
    };
    // El gate responde 403 con su motivo, como el resto de las escrituras
    // (`writeFailure`): reintentar no sirve, hay que apelar o aceptar.
    expect(await requestOrganization(organization, event)).toMatchObject({
      failed: true,
      status: 403,
      message: expect.stringMatching(/suspendida/),
    });
    mocks.written = {
      data: null,
      error: { code: "54000", message: "GEOUNITY_TOO_MANY_PENDING_REQUESTS" },
    };
    expect(await requestOrganization(organization, event)).toMatchObject({
      failed: true,
      status: 429,
      message: expect.stringMatching(/3 solicitudes esperando/),
    });
    mocks.written = { data: null, error: null };
    expect(await requestOrganization(organization, event)).toMatchObject({
      failed: true,
      status: 400,
    });
  });
  it("una comunidad sólo se solicita después de comprobar el padre y la fila propia guardada", async () => {
    expect(await requestCommunity(community, event)).toEqual({
      sent: true,
      requestId: "saved-request",
      requestName: community.requested_name,
    });
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "viewer",
        parent_community_id: "parent",
      }),
    );
  });
  it("un padre inexistente o una lectura fallida no producen una solicitud ni una confirmación falsa", async () => {
    mocks.parent = { data: null, error: null };
    expect(await requestCommunity(community, event)).toMatchObject({
      failed: true,
      fieldErrors: {
        parent_slug: ["No encontramos la comunidad superior indicada."],
      },
    });
    mocks.parent = { data: null, error: { message: "offline" } };
    expect(await requestCommunity(community, event)).toMatchObject({
      failed: true,
      message: "No pudimos consultar la comunidad superior. Probá de nuevo.",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
