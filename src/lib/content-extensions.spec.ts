import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "./supabase";
import { loadContentExtensions } from "./content-extensions";
import { logFailure } from "./log";

vi.mock("./log", () => ({ logFailure: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

function database(
  rows: Record<string, unknown[]> = {},
  failures: string[] = [],
) {
  const from = vi.fn((table: string) => {
    const result = {
      data: failures.includes(table) ? null : (rows[table] ?? []),
      error: failures.includes(table)
        ? { message: "unavailable", code: "XX000" }
        : null,
    };
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      or: () => builder,
      in: () => builder,
      neq: () => builder,
      maybeSingle: async () => ({
        data: result.data?.[0] ?? null,
        error: result.error,
      }),
      then: (resolve: (value: typeof result) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return builder;
  });
  return { db: { from } as unknown as DB, from };
}
const response = {
  id: "response",
  organization_id: "organization",
  body: "Respuesta disponible",
  source_url: "https://example.com/official",
};
const organization = {
  id: "organization",
  name: "Municipalidad",
  slug: "municipalidad",
  type: "institution",
};

describe("lecturas parciales de extensiones", () => {
  it.each([null, "viewer"])(
    "no marca representación desconocida sin membresías propias (%s)",
    async (viewer) => {
      const { db } = database({ institutional_responses: [response] }, [
        "organizations",
      ]);
      const result = await loadContentExtensions(db, "claim", "claim", viewer);
      expect(result.loadFailures.responses).toBe(true);
      expect(result.loadFailures.representation).toBe(false);
    },
  );
  it("reserva los listados vacíos sin errores para lecturas correctas", async () => {
    const { db, from } = database();
    const result = await loadContentExtensions(db, "claim", "claim", null);
    expect(result.loadFailures).toEqual({
      sources: false,
      responses: false,
      representation: false,
      related: false,
    });
    expect(result.sources).toEqual([]);
    expect(from).not.toHaveBeenCalledWith("organization_members");
    expect(from).toHaveBeenCalledTimes(3);
    expect(result.selectedRelation).toBeNull();
    expect(logFailure).not.toHaveBeenCalled();
  });
  it("un fallo de fuentes conserva la respuesta institucional disponible", async () => {
    const { db } = database(
      { institutional_responses: [response], organizations: [organization] },
      ["content_sources"],
    );
    const result = await loadContentExtensions(db, "claim", "claim", null);
    expect(result.loadFailures.sources).toBe(true);
    expect(result.loadFailures.responses).toBe(false);
    expect(result.responses[0]).toMatchObject({
      body: response.body,
      organization: { name: organization.name },
    });
    expect(logFailure).toHaveBeenCalledWith(
      { scope: "extensiones/fuentes" },
      expect.any(Object),
    );
  });
  it("una membresía que no se pudo leer queda desconocida", async () => {
    const { db } = database({}, ["organization_members"]);
    const result = await loadContentExtensions(
      db,
      "project",
      "project",
      "viewer",
    );
    expect(result.loadFailures.representation).toBe(true);
    expect(result.loadFailures.responses).toBe(false);
    expect(result.myOrganizations).toEqual([]);
  });
  it("un fallo de nombres conserva los mensajes y bloquea una representación inferida", async () => {
    const { db } = database(
      {
        institutional_responses: [response],
        organization_members: [{ organization_id: organization.id }],
      },
      ["organizations"],
    );
    const result = await loadContentExtensions(db, "poll", "poll", "viewer");
    expect(result.loadFailures).toMatchObject({
      responses: true,
      representation: true,
    });
    expect(result.responses[0].body).toBe(response.body);
    expect(result.responses[0].organization).toBeNull();
  });
  it("un fallo de relaciones no se presenta como ausencia confirmada", async () => {
    const { db } = database({}, ["content_relations"]);
    expect(
      (await loadContentExtensions(db, "project", "project", null)).loadFailures
        .related,
    ).toBe(true);
  });
  it("conserva relaciones disponibles y avisa si falló otro grupo de títulos", async () => {
    const { db, from } = database(
      {
        content_relations: [
          {
            id: "one",
            source_type: "project",
            source_id: "project",
            target_type: "claim",
            target_id: "claim",
            relation_type: "related",
          },
          {
            id: "two",
            source_type: "project",
            source_id: "project",
            target_type: "debate",
            target_id: "debate",
            relation_type: "related",
          },
        ],
        debates: [{ id: "debate", title: "Debate disponible" }],
      },
      ["claims"],
    );
    const result = await loadContentExtensions(db, "project", "project", null);
    expect(result.loadFailures.related).toBe(true);
    expect(result.related.map((item) => item.title)).toEqual([
      "Debate disponible",
    ]);
    expect(
      from.mock.calls.filter(([table]) => table === "claims"),
    ).toHaveLength(1);
  });
  it("lee una selección válida con título propio sin alterar las consultas de la página normal", async () => {
    const id = "d0000000-0000-4000-8000-000000000001";
    const { db, from } = database({
      claims: [{ id, title: "Título actual de la base" }],
    });
    const candidate = {
      kind: "claim" as const,
      id,
      title: "Título arbitrario de la URL",
    };
    const result = await loadContentExtensions(
      db,
      "project",
      "project",
      null,
      candidate,
    );
    expect(result.selectedRelation).toEqual({
      kind: "claim",
      id,
      title: "Título actual de la base",
    });
    expect(result.loadFailures.related).toBe(false);
    expect(from).toHaveBeenCalledTimes(4);
    expect(
      from.mock.calls.filter(([table]) => table === "claims"),
    ).toHaveLength(1);
  });
  it("una selección ilegible no borra fuentes disponibles y deja el error de relaciones recuperable", async () => {
    const id = "d0000000-0000-4000-8000-000000000001";
    const { db } = database(
      {
        content_sources: [
          {
            id: "source",
            title: "Fuente disponible",
            url: "https://example.com/source",
          },
        ],
      },
      ["polls"],
    );
    const result = await loadContentExtensions(db, "project", "project", null, {
      kind: "poll",
      id,
    });
    expect(result.selectedRelation).toBeNull();
    expect(result.loadFailures.related).toBe(true);
    expect(result.sources[0]?.title).toBe("Fuente disponible");
    expect(result.loadFailures.sources).toBe(false);
  });
});
