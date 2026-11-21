import { describe, expect, it, vi } from "vitest";
import { findRelationTargets, relationReturnHref, relationSearchHref, relationSelectionHref, selectedRelationFromUrl } from "./relation-picker";
import type { DB } from "./supabase";

vi.mock("./log", () => ({ logFailure: vi.fn() }));
const source = "f0000000-0000-4000-8000-000000000001";
const targetId = "f0000000-0000-4000-8000-000000000002";
const context = `/proyectos/${source}/?qa_id=${targetId}&qaction=stale&lang=en`;

describe("selección HTML de relaciones", () => {
  it("regresa a la fuente canónica y conserva contexto sin repetir una acción", () => {
    const back = relationReturnHref("project", source, context);
    expect(back).toBe(`/proyectos/${source}/?qa_id=${targetId}&lang=en#relacionados-titulo`);
    const link = new URL(relationSearchHref("project", source, context), "https://agorbis.test");
    expect(link.pathname).toBe("/vincular/");
    expect(link.searchParams.get("volver")).toBe(back);
    expect(link.searchParams.get("lang")).toBe("en");
  });
  it.each(["//external.test/", "/\\external.test/", "/perfil/", `/encuestas/${source}/`, "/proyectos/another/"])("descarta un retorno ajeno: %s", (input) => {
    expect(relationReturnHref("project", source, input)).toBe(`/proyectos/${source}/#relacionados-titulo`);
  });
  it("conserva el tipo de relación y sólo transporta identidad para volver a leer el título bajo RLS", () => {
    const title = 'Plaza: "más árboles" & sombra';
    const href = relationSelectionHref("project", source, context + "&vincular_titulo=Título+falso", { kind: "debate", id: targetId, title }, "proposal_for");
    const url = new URL(href, "https://agorbis.test");
    expect(url.searchParams.get("qaction")).toBeNull();
    expect(url.searchParams.get("qa_id")).toBe(targetId);
    expect(url.searchParams.get("vincular_relacion")).toBe("proposal_for");
    expect(url.searchParams.has("vincular_titulo")).toBe(false);
    expect(selectedRelationFromUrl(url, "project", source)).toEqual({ kind: "debate", id: targetId, title: "" });
    expect(url.hash).toBe("#relacionados-titulo");
  });
  it("la búsqueda y la cancelación conservan una relación válida y descartan tipos inventados", () => {
    const search = new URL(relationSearchHref("project", source, context + "&vincular_relacion=follow_up"), "https://agorbis.test");
    expect(search.searchParams.get("relation_type")).toBe("follow_up");
    const invalid = new URL(relationSelectionHref("project", source, context, { kind: "debate", id: targetId, title: "Destino" }, "invented"), "https://agorbis.test");
    expect(invalid.searchParams.get("vincular_relacion")).toBe("related");
  });
  it.each([
    ["project", source], ["unknown", targetId], ["debate", "not-an-id"],
  ])("rechaza una selección inválida o de sí misma: %s %s", (kind, id) => {
    const url = new URL(`/proyectos/${source}/?vincular_tipo=${kind}&vincular_id=${id}`, "https://agorbis.test");
    expect(selectedRelationFromUrl(url, "project", source)).toBeNull();
  });
  it("no importa selección desde la URL de otra publicación", () => {
    const url = new URL(relationSelectionHref("project", source, context, { kind: "debate", id: targetId, title: "Destino" }), "https://agorbis.test");
    expect(selectedRelationFromUrl(url, "project", targetId)).toBeNull();
  });
});

describe("búsqueda compartida bajo RLS", () => {
  function db(error = false) {
    const rpc = vi.fn(async (_name: string, args: { p_kind: string }) => ({ data: error ? null : [
      { id: source, kind: "project", title: "Misma fuente", rank: 30, created_at: "2026-01-01" },
      { id: targetId, kind: args.p_kind, title: "Destino", rank: 10, created_at: "2026-01-01", community_name: "Barrio", community_emoji: "🏡", status: "open" },
    ], error: error ? { message: "unavailable" } : null }));
    return { client: { rpc } as unknown as DB, rpc };
  }
  it("usa la RPC existente con un límite pequeño y excluye la fuente", async () => {
    const { client, rpc } = db();
    const result = await findRelationTargets(client, " Plaza ", "debate", "project", source);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("global_search", { p_query: "Plaza", p_kind: "debate", p_limit: 8, p_offset: 0 });
    expect(result).toMatchObject({ failed: false, items: [{ id: targetId, kind: "debate", title: "Destino" }] });
  });
  it("no busca para un término insuficiente y no confunde un fallo con cero coincidencias", async () => {
    const { client, rpc } = db(true);
    expect(await findRelationTargets(client, "a", "", "project", source)).toEqual({ items: [], failed: false });
    expect(await findRelationTargets(client, "ab", "", "project", source)).toEqual({ items: [], failed: false });
    expect(rpc).not.toHaveBeenCalled();
    expect(await findRelationTargets(client, "plaza", "debate", "project", source)).toEqual({ items: [], failed: true });
  });
});
