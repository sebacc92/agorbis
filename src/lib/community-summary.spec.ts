import { describe, expect, it } from "vitest";
import { communitySummaryText } from "./community-summary";

const data = {
  communityName: "Barrio del Árbol",
  communityUrl: "https://example.test/c/barrio-del-arbol",
  resolvedClaimsCount: 0,
  openClaimsCount: 1200,
  participationCount: 7,
};

describe("resumen compartido de comunidad", () => {
  it("traduce el mensaje y los números sin traducir la comunidad ni inventar actividad", () => {
    const en = communitySummaryText("en", { ...data, memberCount: 3000 });
    expect(en).toContain("Summary of Barrio del Árbol");
    expect(en).toContain("Members: 3,000");
    expect(en).toContain("Resolved claims: 0");
    expect(en).toContain("Open claims: 1,200");
    expect(en).toContain("Polls, debates and projects: 7");
    expect(en).not.toMatch(/week|active members|esta semana/i);
    expect(en.split(data.communityUrl)).toHaveLength(2);
  });

  it("no agrega un conteo de miembros cuando el resumen no lo recibió", () => {
    const es = communitySummaryText("es", data);
    expect(es).toContain("Resumen de Barrio del Árbol");
    expect(es).toContain("Reclamos abiertos: 1.200");
    expect(es).not.toContain("Personas miembro");
    expect(es.endsWith(data.communityUrl)).toBe(true);
  });
});
