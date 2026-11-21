import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentType } from "./database.types.helpers";
import type { DB } from "./supabase";
import { logFailure } from "./log";
import { loadRelationSelection } from "./relation-selection";
import { selectedRelationFromUrl } from "./relation-picker";
import { useProject } from "~/routes/proyectos/[id]";

vi.mock("./log", () => ({ logFailure: vi.fn() }));
const id = "d0000000-0000-4000-8000-000000000001";
type Row = {
  id: string;
  title?: string;
  question?: string;
  status: string;
  visible?: boolean;
};
function database(row: Row | null = null, error: object | null = null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({
      data:
        error || !row || row.status === "removed" || row.visible === false
          ? null
          : { id: row.id, title: row.question ?? row.title },
      error,
    })),
  };
  const from = vi.fn(() => builder);
  return { db: { from } as unknown as DB, builder, from };
}
beforeEach(() => vi.clearAllMocks());

describe("selección de relación leída desde la base", () => {
  it("el loader de proyecto conserva el destino al filtrar la URL y relee su título bajo RLS", async () => {
    const source = "f0000000-0000-4000-8000-000000000001";
    const original = new URL(
      `https://agorbis.test/proyectos/${source}/?mensaje=${source}&vincular_relacion=proposal_for&vincular_tipo=debate&vincular_id=${id}&vincular_titulo=Falso`,
    );
    // Qwik filtra la URL del loader también en SSR, según esta metadata.
    const allowed = (useProject as typeof useProject & { __search: string[] })
      .__search;
    expect(allowed).toEqual(
      expect.arrayContaining([
        "qa_antes",
        "qa_id",
        "mensaje",
        "vincular_tipo",
        "vincular_id",
      ]),
    );
    const loaderUrl = new URL(original.pathname, original.origin);
    for (const name of allowed) {
      for (const value of original.searchParams.getAll(name))
        loaderUrl.searchParams.append(name, value);
    }
    const candidate = selectedRelationFromUrl(loaderUrl, "project", source);
    expect(candidate).toEqual({ kind: "debate", id, title: "" });
    const { db, from } = database({
      id,
      title: "Título permitido por RLS",
      status: "open",
    });
    expect(await loadRelationSelection(db, candidate)).toEqual({
      selection: { kind: "debate", id, title: "Título permitido por RLS" },
      failed: false,
    });
    expect(from).toHaveBeenCalledExactlyOnceWith("debates");
    expect(loaderUrl.searchParams.get("mensaje")).toBe(source);
    expect(loaderUrl.searchParams.has("vincular_titulo")).toBe(false);
  });
  it.each([
    ["poll", "polls"],
    ["debate", "debates"],
    ["claim", "claims"],
    ["project", "projects"],
  ] as const)(
    "resuelve %s bajo la sesión con título real y una sola lectura",
    async (kind, table) => {
      const { db, from, builder } = database({
        id,
        status: "active",
        title: "Título real",
        question: kind === "poll" ? "Pregunta real" : undefined,
      });
      const candidate = {
        kind,
        id,
        title: "Título falsificado desde la consulta",
        author_id: "Otro actor",
      };
      const result = await loadRelationSelection(db, candidate);
      expect(result).toEqual({
        selection: {
          kind,
          id,
          title: kind === "poll" ? "Pregunta real" : "Título real",
        },
        failed: false,
      });
      expect(JSON.stringify(result)).not.toContain("falsificado");
      expect(from).toHaveBeenCalledExactlyOnceWith(table);
      expect(builder.select).toHaveBeenCalledWith(
        kind === "poll" ? "id, title:question" : "id, title",
      );
      expect(builder.eq).toHaveBeenCalledExactlyOnceWith("id", id);
      expect(builder.neq).toHaveBeenCalledExactlyOnceWith("status", "removed");
      expect(builder.maybeSingle).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    null,
    { id, status: "removed" },
    { id, status: "active", visible: false },
  ])(
    "una ausencia, retiro u ocultamiento bajo RLS no conserva el título enviado (%j)",
    async (row) => {
      const { db } = database(row);
      const candidate = {
        kind: "project" as const,
        id,
        title: "No es un dato confirmado",
      };
      expect(await loadRelationSelection(db, candidate)).toEqual({
        selection: null,
        failed: false,
      });
      expect(logFailure).not.toHaveBeenCalled();
    },
  );
  it("no añade consultas sin selección o con una candidata inválida", async () => {
    const { db, from } = database();
    for (const candidate of [
      null,
      undefined,
      { kind: "poll" as const, id: "inválido" },
      { kind: "other" as ContentType, id },
    ])
      expect(await loadRelationSelection(db, candidate)).toEqual({
        selection: null,
        failed: false,
      });
    expect(from).not.toHaveBeenCalled();
  });
  it("distingue un error de lectura de una ausencia y no expone el título propuesto", async () => {
    const { db, builder } = database(null, {
      code: "42501",
      message: "unavailable",
    });
    expect(await loadRelationSelection(db, { kind: "claim", id })).toEqual({
      selection: null,
      failed: true,
    });
    expect(logFailure).toHaveBeenCalledWith(
      { scope: "relaciones/seleccion" },
      expect.any(Object),
    );
    builder.maybeSingle.mockRejectedValueOnce(
      new Error("Network disconnected"),
    );
    expect(await loadRelationSelection(db, { kind: "claim", id })).toEqual({
      selection: null,
      failed: true,
    });
  });
});
