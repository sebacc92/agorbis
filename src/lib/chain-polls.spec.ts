import { describe, expect, it } from "vitest";
import {
  ancestorIds,
  isConfirmedEmpty,
  labelChainPolls,
} from "./chain-polls";

const chain = [
  { id: "earth", slug: "earth", name: "Tierra", emoji: "🌍", level: 0, path: "earth" },
  { id: "ar", slug: "argentina", name: "Argentina", emoji: "🇦🇷", level: 2, path: "earth.ar" },
  { id: "self", slug: "barrio", name: "Barrio", emoji: null, level: 4, path: "earth.ar.self" },
];

describe("ancestorIds", () => {
  it("deja afuera la comunidad propia y conserva el orden de la cadena", () => {
    expect(ancestorIds(chain, "self")).toEqual(["earth", "ar"]);
  });
  it("sin ancestros devuelve una lista vacía", () => {
    expect(ancestorIds([chain[2]], "self")).toEqual([]);
  });
});

describe("labelChainPolls", () => {
  it("etiqueta cada encuesta con el nombre y el emoji de su comunidad", () => {
    const polls = [
      { id: "p1", question: "¿Prioridad?", closes_at: "2026-12-01", community_id: "ar" },
      { id: "p2", question: "¿Fondo?", closes_at: null, community_id: "earth" },
    ];
    expect(labelChainPolls(polls, chain)).toEqual([
      { ...polls[0], communityName: "Argentina", communityEmoji: "🇦🇷" },
      { ...polls[1], communityName: "Tierra", communityEmoji: "🌍" },
    ]);
  });
  it("descarta una encuesta de una comunidad que no está en la cadena, sin inventarle nombre", () => {
    const polls = [
      { id: "p1", question: "¿Prioridad?", closes_at: null, community_id: "otra" },
    ];
    expect(labelChainPolls(polls, chain)).toEqual([]);
  });
});

describe("isConfirmedEmpty", () => {
  const zero = { polls: 0, debates: 0, claims: 0, projects: 0 };
  it("sólo con los cuatro conteos confirmados en cero", () => {
    expect(isConfirmedEmpty(zero)).toBe(true);
  });
  it("un conteo desconocido no es una comunidad vacía", () => {
    expect(isConfirmedEmpty({ ...zero, claims: null })).toBe(false);
  });
  it("una publicación alcanza para no estar vacía", () => {
    expect(isConfirmedEmpty({ ...zero, debates: 1 })).toBe(false);
  });
});
