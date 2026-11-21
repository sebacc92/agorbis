import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insert: vi.fn(), from: vi.fn(), viewer: vi.fn() }));
vi.mock("./session", () => ({ requireUser: mocks.viewer }));
vi.mock("./supabase", () => ({ createServerSupabase: () => ({ from: mocks.from }) }));

import { addContentRelation, addContentSource, postInstitutionalResponse, relationSchema, sourceSchema } from "./extension-actions";

const source = {
  content_type: "project" as const,
  content_id: "f0000000-0000-4000-8000-000000000001",
  title: "Documento confirmado",
  url: "https://example.com/documento",
  publisher: "",
  published_at: "",
};
const response = {
  content_type: "project" as const,
  content_id: source.content_id,
  organization_id: "11111111-1111-4111-8111-111111111111",
  response_type: "information" as const,
  body: "Respuesta institucional con información verificable.",
  source_url: "",
};
const event = () => ({ fail: (status: number, data: object) => ({ status, failed: true, ...data }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer.mockResolvedValue({ userId: "persona-en-sesion" });
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.insert.mockResolvedValue({ error: null });
});

describe("confirmación de fuentes y respuestas", () => {
  it("confirma una relación sólo después de insertar con la identidad de sesión", async () => {
    const relation = { source_type: "project" as const, source_id: source.content_id, target_type: "claim" as const, target_id: response.organization_id, relation_type: "related" as const };
    expect(await addContentRelation(relation, event() as never)).toEqual({ linked: true });
    expect(mocks.from).toHaveBeenCalledWith("content_relations");
    expect(mocks.insert).toHaveBeenCalledWith({ ...relation, created_by: "persona-en-sesion" });
    mocks.insert.mockResolvedValue({ error: { code: "42501" } });
    expect(await addContentRelation(relation, event() as never)).toMatchObject({ failed: true });
    expect(relationSchema.safeParse({ ...relation, target_id: "" }).success).toBe(false);
  });
  it("confirma la fuente sólo tras guardar y atribuye a la sesión", async () => {
    const result = await addContentSource(source, event() as never);
    expect(result).toEqual({ saved: true, sourceTitle: source.title });
    expect(mocks.from).toHaveBeenCalledWith("content_sources");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      added_by: "persona-en-sesion", publisher: null, published_at: null,
    }));
  });

  it.each([
    [addContentSource, source],
    [postInstitutionalResponse, response],
  ] as const)("conserva el rechazo del gate sin anunciar éxito", async (submit, values) => {
    mocks.insert.mockResolvedValue({ error: { code: "42501", message: "GEOUNITY_LEGAL_ACCEPTANCE_REQUIRED" } });
    const result = await submit(values as never, event() as never);
    expect(result).toMatchObject({ failed: true, status: 403, message: expect.stringContaining("/consentimiento") });
    expect(result).not.toHaveProperty("saved");
    expect(result).not.toHaveProperty("posted");
  });

  it("confirma la respuesta bajo la identidad actual y conserva RLS", async () => {
    expect(await postInstitutionalResponse(response, event() as never)).toEqual({ posted: true });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      author_id: "persona-en-sesion", organization_id: response.organization_id, source_url: null,
    }));
    mocks.insert.mockResolvedValue({ error: { code: "42501" } });
    expect(await postInstitutionalResponse(response, event() as never)).toMatchObject({ failed: true, status: 400 });
  });

  it("valida las mismas restricciones antes de guardar", () => {
    expect(sourceSchema.safeParse({ ...source, title: "ab" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...source, published_at: "2026-02-30" }).success).toBe(false);
  });
});
