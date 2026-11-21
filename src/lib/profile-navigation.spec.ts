import { describe, expect, it } from "vitest";
import { activityCursorFilter, compareActivity, profileActivityFilterHref, readActivityFilter, profilePageHref, profileSectionHref, readProfileActivityCursor, readProfileCursor, readProfileSection } from "./profile-navigation";
import { PUBLICATION_KINDS, comparePublications, publicationCursorFilter, readProfilePublicationCursor } from "./profile-navigation";

describe("secciones del perfil en la URL", () => {
  it.each(["resumen", "publicaciones", "guardados", "cuenta"])(
    "recupera %s después de recargar o recorrer el historial",
    (section) => {
      expect(readProfileSection(new URLSearchParams({ seccion: section }))).toBe(section);
    },
  );

  it("usa Resumen como inicio y conserva Cuenta como vuelta de un formulario", () => {
    expect(readProfileSection(new URLSearchParams())).toBe("resumen");
    expect(readProfileSection(new URLSearchParams({ seccion: "desconocida" }))).toBe("resumen");
    expect(readProfileSection(new URLSearchParams(), true)).toBe("cuenta");
    expect(readProfileSection(new URLSearchParams({ seccion: "guardados" }), true)).toBe("guardados");
  });

  it("cambia sólo la sección conservando los otros parámetros y el fragmento", () => {
    const url = new URL("https://agorbis.test/perfil/?lang=en&seccion=resumen&origen=inicio#perfil");
    expect(profileSectionHref(url, "cuenta")).toBe("/perfil/?lang=en&seccion=cuenta&origen=inicio#perfil");
    expect(url.searchParams.get("seccion")).toBe("resumen");
  });
});

describe("historial de publicaciones propias", () => {
  const stamp = "2026-10-22T12:00:00.123456+00:00";
  const cursor = { created_at: stamp, id: "33333333-3333-4333-8333-333333333333", kind: "claim" as const };
  it("valida el cursor y sólo cambia el historial de publicaciones en la URL", () => {
    const original = new URL("https://test/perfil?seccion=cuenta&actividad_antes=keep&actividad_id=keep&actividad_filtro=apoyo&lang=en#perfil");
    const next = new URL(profilePageHref(original, "publicaciones", "publicaciones", cursor), original);
    expect(readProfilePublicationCursor(next.searchParams)).toEqual(cursor);
    expect(next.searchParams.get("actividad_antes")).toBe("keep");
    expect(next.searchParams.get("actividad_filtro")).toBe("apoyo");
    expect(next.hash).toBe("#perfil");
    const recent = new URL(profilePageHref(next, "publicaciones", "publicaciones"), next);
    expect(recent.searchParams.has("publicaciones_id")).toBe(false);
    expect(recent.searchParams.get("actividad_id")).toBe("keep");
    next.searchParams.set("publicaciones_tipo", "inexistente");
    expect(readProfilePublicationCursor(next.searchParams)).toBeNull();
    next.searchParams.set("publicaciones_tipo", "claim");
    next.searchParams.set("publicaciones_id", "0),author_id.neq.0");
    expect(readProfilePublicationCursor(next.searchParams)).toBeNull();
  });

  it("incluye el empate de otras fuentes sin repetir la fila del cursor", () => {
    expect(publicationCursorFilter(cursor, "claim")).toContain(`id.lt.${cursor.id}`);
    expect(publicationCursorFilter(cursor, "debate")).toBe(`created_at.lte.${stamp}`);
    expect(publicationCursorFilter(cursor, "project")).toBe(`created_at.lt.${stamp}`);
    expect(publicationCursorFilter(null, "claim")).toBeNull();
    const rows = PUBLICATION_KINDS.flatMap((kind) => Array.from({length: 35}, (_, index) => ({ kind, created_at: stamp, id: `33333333-3333-4333-8333-${index.toString().padStart(12,"0")}` })));
    const expected = [...rows].sort(comparePublications);
    const seen: typeof rows = [];
    let after: typeof rows[number] | undefined;
    while (true) {
      // Cada tabla devuelve sólo las21primeras coincidencias del cursor.
      const page = PUBLICATION_KINDS.flatMap((kind) => rows.filter((row) => row.kind === kind && (!after || comparePublications(row, after) > 0)).sort(comparePublications).slice(0,21)).sort(comparePublications).slice(0,20);
      if (!page.length) break;
      seen.push(...page);
      after = page.at(-1);
    }
    expect(seen).toEqual(expected);
    expect(new Set(seen.map((row) => `${row.kind}:${row.id}`)).size).toBe(140);
  });
});

describe("cursores propios del perfil", () => {
  it("cambiar categoría reinicia sólo el cursor de actividad y conserva la URL", () => {
    const url = new URL("https://test/perfil?actividad_antes=old&actividad_id=old&actividad_tipo=voto&seguidos_id=stay&lang=en");
    const target = new URL(profileActivityFilterHref(url, "comentario"), url);
    expect(readActivityFilter(target.searchParams)).toBe("comentario");
    expect(target.searchParams.has("actividad_id")).toBe(false);
    expect(target.searchParams.get("seguidos_id")).toBe("stay");
    expect(target.searchParams.get("lang")).toBe("en");
    expect(readActivityFilter(new URLSearchParams("actividad_filtro=other"))).toBe("all");
    expect(new URL(profileActivityFilterHref(target, "all"), target).searchParams.has("actividad_filtro")).toBe(false);
  });
  const cursor = { created_at: "2026-10-22T12:00:00.123456+00:00", id: "33333333-3333-4333-8333-333333333333", kind: "comentario" as const };
  it("valida el cursor entero y rechaza tipos o filtros maliciosos", () => {
    const url = new URL(profilePageHref(new URL("https://test/perfil?lang=en&seguidos_id=otro"), "publicaciones", "actividad", cursor), "https://test");
    expect(readProfileActivityCursor(url.searchParams)).toEqual(cursor);
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.get("seguidos_id")).toBe("otro");
    url.searchParams.set("actividad_tipo", "evil");
    expect(readProfileActivityCursor(url.searchParams)).toBeNull();
    url.searchParams.set("actividad_tipo", "comentario");
    url.searchParams.set("actividad_id", "0),user_id.neq.0");
    expect(readProfileActivityCursor(url.searchParams)).toBeNull();
    expect(readProfileCursor(new URLSearchParams("seguidos_antes=bad&seguidos_id=bad"), "seguidos")).toBeNull();
  });
  it("desempata tipos e identificadores sin perder filas del mismo instante", () => {
    expect(activityCursorFilter(cursor, "comentario", "created_at", "id")).toContain(`and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
    expect(activityCursorFilter(cursor, "voto", "participated_at", "poll_id")).toBe(`participated_at.lte.${cursor.created_at}`);
    expect(activityCursorFilter(cursor, "apoyo", "created_at", "claim_id")).toBe(`created_at.lt.${cursor.created_at}`);
    const rows = ["voto", "comentario", "apoyo", "compromiso"].flatMap((kind) => Array.from({ length: 27 }, (_, i) => ({ kind: kind as typeof cursor.kind, created_at: cursor.created_at, id: `33333333-3333-4333-8333-${i.toString().padStart(12, "0")}` })));
    const expected = [...rows].sort(compareActivity);
    const seen: typeof rows = [];
    let after: typeof rows[number] | undefined;
    while (true) {
      const page = expected.filter((row) => !after || compareActivity(row, after) > 0).slice(0, 25);
      if (!page.length) break;
      seen.push(...page);
      after = page.at(-1);
    }
    expect(seen).toEqual(expected);
    expect(new Set(seen.map((row) => `${row.kind}:${row.id}`)).size).toBe(108);
  });
  it("volver al principio limpia sólo el cursor de la lista elegida", () => {
    const url = new URL("https://test/perfil?lang=en&actividad_antes=x&actividad_id=y&actividad_tipo=voto&seguidos_antes=z&seguidos_id=w");
    const target = new URL(profilePageHref(url, "publicaciones", "actividad"), url);
    expect(target.searchParams.get("actividad_id")).toBeNull();
    expect(target.searchParams.get("seguidos_id")).toBe("w");
    expect(target.searchParams.get("seccion")).toBe("publicaciones");
  });
});
