import { describe, expect, it } from "vitest";
import { enMessages } from "~/i18n/en";
import {
  MANUAL_FIRST_STEPS,
  MANUAL_GOOD_POSTS,
  MANUAL_OUTREACH,
  MANUAL_RULES,
  MANUAL_SECTIONS,
  MANUAL_TOOLS,
  MANUAL_TRACKING,
} from "./manual-content";
import {
  MANUAL_DETAIL_FAQ,
  MANUAL_ESSENTIAL_FAQ,
  MANUAL_FAQ_CATEGORIES,
  categoryAnchor,
  filterManualFaq,
  matchesManualQuery,
} from "./manual-faq";

const ALL_FAQ = [...MANUAL_ESSENTIAL_FAQ, ...MANUAL_DETAIL_FAQ];

/**
 * `check-i18n` sólo ve los textos escritos dentro de `translate(locale, "…")`.
 * Los del manual viven en datos y se traducen en tiempo de ejecución, así que
 * una traducción faltante pasaba el lint y se mostraba en español a quien lee
 * en inglés. Esta lista es todo lo que el manual le pasa a `translate()`.
 */
function manualTexts(): string[] {
  return [
    ...MANUAL_SECTIONS.map((section) => section.label),
    ...MANUAL_FAQ_CATEGORIES.map((category) => category.label),
    ...MANUAL_FIRST_STEPS.flatMap((step) => [step.title, step.body]),
    ...MANUAL_TOOLS.flatMap((tool) => [tool.title, tool.purpose, tool.detail]),
    ...MANUAL_TRACKING.flatMap((card) => [
      card.title,
      card.body,
      ...(card.link ? [card.link.label] : []),
    ]),
    ...MANUAL_OUTREACH.flatMap((tool) => [tool.title, tool.body]),
    ...MANUAL_GOOD_POSTS.flatMap((item) => [item.title, item.body]),
    ...MANUAL_RULES.flatMap((rule) => [
      rule.title,
      rule.body,
      ...rule.links.map((link) => link.label),
    ]),
    ...ALL_FAQ.flatMap((item) => [
      item.question,
      ...item.answer,
      ...(item.link ? [item.link.label] : []),
    ]),
  ];
}

describe("contenido del manual", () => {
  it("tiene traducción inglesa para cada texto que muestra", () => {
    const missing = manualTexts().filter((text) => !(text in enMessages));

    expect(missing).toEqual([]);
  });

  it("no repite un ancla entre secciones, temas y preguntas", () => {
    const anchors = [
      ...MANUAL_SECTIONS.map((section) => section.id),
      ...MANUAL_FAQ_CATEGORIES.map((category) => categoryAnchor(category.id)),
      ...ALL_FAQ.map((item) => item.id),
    ];

    const repeated = anchors.filter(
      (anchor, index) => anchors.indexOf(anchor) !== index,
    );

    expect(repeated).toEqual([]);
  });

  it("usa anclas que se pueden escribir en una URL sin codificar", () => {
    const invalid = ALL_FAQ.map((item) => item.id).filter(
      (id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id),
    );

    expect(invalid).toEqual([]);
  });

  it("no repite una pregunta", () => {
    const questions = ALL_FAQ.map((item) => item.question);

    expect(new Set(questions).size).toBe(questions.length);
  });

  it("ubica cada pregunta de detalle en un tema que existe y no deja temas vacíos", () => {
    const known = new Set<string>(
      MANUAL_FAQ_CATEGORIES.map((category) => category.id),
    );
    const used = new Set<string>(MANUAL_DETAIL_FAQ.map((item) => item.category));

    expect(
      MANUAL_DETAIL_FAQ.filter((item) => !known.has(item.category)),
    ).toEqual([]);
    expect([...known].filter((id) => !used.has(id))).toEqual([]);
  });

  it("deja pocas preguntas esenciales, para que se puedan leer de corrido", () => {
    expect(MANUAL_ESSENTIAL_FAQ.length).toBeGreaterThanOrEqual(10);
    expect(MANUAL_ESSENTIAL_FAQ.length).toBeLessThanOrEqual(16);
  });

  it("no promete más de lo que el voto secreto sostiene (D68)", () => {
    const risky = manualTexts().filter((text) =>
      /an[oó]nim[oa] y verificable|secreto inviolable|criptogr/i.test(text),
    );

    expect(risky).toEqual([]);
  });
});

describe("buscador del manual", () => {
  it("encuentra sin distinguir mayúsculas ni acentos", () => {
    expect(
      matchesManualQuery("¿Puedo cambiar mi residencia?", "RESIDENCIA"),
    ).toBe(true);
    expect(matchesManualQuery("Votación binaria", "votacion")).toBe(true);
  });

  it("exige todas las palabras, en cualquier orden", () => {
    expect(matchesManualQuery("Quitar mi foto de perfil", "perfil foto")).toBe(
      true,
    );
    expect(matchesManualQuery("Quitar mi foto de perfil", "foto reclamo")).toBe(
      false,
    );
  });

  it("no filtra nada con una búsqueda vacía o sólo de espacios", () => {
    expect(matchesManualQuery("cualquier texto", "")).toBe(true);
    expect(matchesManualQuery("cualquier texto", "   ")).toBe(true);
  });

  it("busca en la pregunta y en cada párrafo de la respuesta", () => {
    const items = [
      { id: "a", question: "Uno", answer: ["habla de borradores"] },
      { id: "b", question: "Dos", answer: ["habla de otra cosa", "y del mapa"] },
    ];

    const found = filterManualFaq(items, "mapa", (text) => text);

    expect(found.map((item) => item.id)).toEqual(["b"]);
  });

  it("busca sobre el texto traducido, que es el que la persona lee", () => {
    const items = [{ id: "a", question: "Residencia", answer: ["Texto"] }];
    const toEnglish = (text: string) =>
      text === "Residencia" ? "Residence" : text;

    expect(filterManualFaq(items, "residence", toEnglish)).toHaveLength(1);
    expect(filterManualFaq(items, "residencia", toEnglish)).toHaveLength(0);
  });
});
