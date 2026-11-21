import { describe, expect, it } from "vitest";
import {
  agreementStatusLabel,
  eligibilityIssue,
  eligibilityMessage,
  filterCandidates,
  isAgreementStatus,
  isCandidateFor,
  mergeCandidates,
  normalizeForSearch,
  proposeErrorMessage,
  parseAgreementState,
  partyOutcomeLabel,
} from "./agreements";

const mdq = {
  level: 4,
  path: "earth.south-america.argentina.buenos-aires.mar-del-plata",
};
const tandil = {
  level: 4,
  path: "earth.south-america.argentina.buenos-aires.tandil",
};
const buenosAires = {
  level: 3,
  path: "earth.south-america.argentina.buenos-aires",
};
const argentina = { level: 2, path: "earth.south-america.argentina" };
const badakhshan = {
  level: 3,
  path: "earth.asia.afganistan.afganistan-badakhshan",
};

describe("eligibilityIssue (misma regla que la base, sólo para avisar)", () => {
  it("dos ciudades de la misma provincia son elegibles", () => {
    expect(eligibilityIssue(mdq, [tandil])).toBeNull();
  });

  it("una comunidad sola también lo es: el acuerdo interno", () => {
    expect(eligibilityIssue(mdq, [])).toBeNull();
  });

  it("la propia repetida no cuenta dos veces", () => {
    expect(eligibilityIssue(mdq, [mdq, tandil])).toBeNull();
  });

  it("más de cinco comunidades es demasiado", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      level: 4,
      path: `earth.south-america.argentina.buenos-aires.c${i}`,
    }));
    expect(eligibilityIssue(mdq, many)).toBe("cantidad");
  });

  it("el país, un continente o la Tierra no participan", () => {
    expect(eligibilityIssue(mdq, [argentina])).toBe("nivel");
  });

  it("otro país se rechaza", () => {
    expect(eligibilityIssue(mdq, [badakhshan])).toBe("pais");
  });

  it("una comunidad que contiene a otra se rechaza", () => {
    expect(eligibilityIssue(mdq, [buenosAires])).toBe("contenida");
    expect(eligibilityIssue(buenosAires, [tandil])).toBe("contenida");
  });

  it("cada problema tiene un texto en español que dice qué cambiar", () => {
    expect(eligibilityMessage("es", "contenida")).toContain("contiene");
    expect(eligibilityMessage("es", "pais")).toContain("mismo país");
    expect(eligibilityMessage("es", "nivel")).toContain("provincia");
    expect(eligibilityMessage("es", "cantidad")).toContain("cinco");
  });
});

describe("agreementStatusLabel", () => {
  it("cada estado derivado tiene su frase, sin afirmar de más", () => {
    expect(agreementStatusLabel("es", "proposed", null)).toBe(
      "Propuesto, esperando adhesión",
    );
    expect(agreementStatusLabel("es", "voting", "2026-12-03T12:00:00Z")).toMatch(
      /^En votación hasta el /,
    );
    expect(agreementStatusLabel("es", "approved", null)).toBe("Aprobado");
    expect(agreementStatusLabel("es", "rejected", null)).toBe("Rechazado");
    expect(agreementStatusLabel("es", "no_quorum", null)).toBe("Sin quórum");
    expect(agreementStatusLabel("es", "lapsed", null)).toBe("Sin adhesión");
    expect(agreementStatusLabel("es", "withdrawn", null)).toBe("Retirado");
    expect(agreementStatusLabel("es", "removed", null)).toBe(
      "Dado de baja por moderación",
    );
  });

  it("en votación sin fecha legible no inventa una", () => {
    expect(agreementStatusLabel("es", "voting", null)).toBe("En votación");
  });

  it("isAgreementStatus reconoce sólo los siete estados de la base", () => {
    expect(isAgreementStatus("approved")).toBe(true);
    expect(isAgreementStatus("acordado")).toBe(false);
  });
});

describe("partyOutcomeLabel", () => {
  it("una ronda abierta sólo dice que está en votación", () => {
    expect(partyOutcomeLabel("es", "pending", null)).toBe("En votación");
  });

  it("un resultado cerrado lleva su participación al lado", () => {
    expect(partyOutcomeLabel("es", "approved", 6)).toBe(
      "Aprobó · 6 participantes",
    );
    expect(partyOutcomeLabel("es", "rejected", 7)).toBe(
      "Rechazó · 7 participantes",
    );
  });

  it("sin quórum no muestra ningún conteo (D68)", () => {
    expect(partyOutcomeLabel("es", "no_quorum", null)).toBe(
      "Sin quórum: menos de cinco participantes",
    );
    expect(partyOutcomeLabel("es", "no_quorum", 3)).toBe(
      "Sin quórum: menos de cinco participantes",
    );
  });

  it("si la participación no vino, no la inventa", () => {
    expect(partyOutcomeLabel("es", "approved", null)).toBe("Aprobó");
  });
});

describe("parseAgreementState (el borde con la RPC jsonb)", () => {
  const valid = {
    id: "a1",
    title: "Ruta costera compartida",
    body: "Texto del compromiso, bien largo como exige la base.",
    status: "voting",
    status_derived: "voting",
    proposer_id: "u1",
    proposer_community: { id: "c1", slug: "mar-del-plata", name: "Mar del Plata", emoji: "🌊" },
    duration_days: 14,
    created_at: "2026-11-09T00:00:00Z",
    opened_at: "2026-11-10T00:00:00Z",
    closes_at: "2026-11-24T00:00:00Z",
    withdrawn_at: null,
    parties: [
      {
        community_id: "c1",
        slug: "mar-del-plata",
        name: "Mar del Plata",
        emoji: "🌊",
        level: 4,
        adhered_at: "2026-11-10T00:00:00Z",
        poll_id: "p1",
        outcome: "pending",
        participants: null,
      },
    ],
    viewer: {
      party_community_id: "c1",
      can_adhere: false,
      can_withdraw: false,
      has_receipt: false,
      can_vote: true,
    },
  };

  it("acepta la forma que devuelve la base y descarta campos de más", () => {
    const parsed = parseAgreementState(valid);
    expect(parsed?.status_derived).toBe("voting");
    expect(parsed?.parties[0]?.poll_id).toBe("p1");
    expect(parsed && "withdrawn_at" in parsed).toBe(false);
  });

  it("rechaza un estado desconocido en vez de inventar una pantalla", () => {
    expect(parseAgreementState({ ...valid, status_derived: "acordado" })).toBeNull();
    expect(
      parseAgreementState({
        ...valid,
        parties: [{ ...valid.parties[0], outcome: "ganó" }],
      }),
    ).toBeNull();
    expect(parseAgreementState(null)).toBeNull();
    expect(parseAgreementState({ ...valid, viewer: {} })).toBeNull();
  });
});

describe("filterCandidates", () => {
  const list = [
    { id: "1", name: "Córdoba" },
    { id: "2", name: "Tandil" },
    { id: "3", name: "Necochea" },
    { id: "4", name: "Mar del Plata" },
  ];

  it("busca sin tildes ni mayúsculas", () => {
    expect(normalizeForSearch("  CÓRDOBA ")).toBe("cordoba");
    expect(filterCandidates(list, "cordoba", [], 10).map((c) => c.id)).toEqual(["1"]);
  });

  it("las elegidas se muestran siempre, aunque no coincidan con la búsqueda", () => {
    expect(filterCandidates(list, "tand", ["4"], 10).map((c) => c.id)).toEqual(["4", "2"]);
  });

  it("sin búsqueda respeta el tope pero nunca recorta una elegida", () => {
    expect(filterCandidates(list, "", ["4"], 2).map((c) => c.id)).toEqual(["4", "1"]);
    expect(filterCandidates(list, "", ["3", "4"], 1).map((c) => c.id)).toEqual(["3", "4"]);
  });
});

describe("isCandidateFor (la misma regla en el loader y en la búsqueda)", () => {
  const own = { id: "mdp", path: "earth.sa.ar.ba.ba-general-pueyrredon.mar-del-plata" };

  it("deja afuera a la propia comunidad, a las que la contienen y a las que contiene", () => {
    expect(isCandidateFor(own, own)).toBe(false);
    expect(isCandidateFor(own, { id: "ba", path: "earth.sa.ar.ba" })).toBe(false);
    expect(
      isCandidateFor(own, { id: "gp", path: "earth.sa.ar.ba.ba-general-pueyrredon" }),
    ).toBe(false);
    expect(isCandidateFor({ id: "ba", path: "earth.sa.ar.ba" }, own)).toBe(false);
  });

  it("acepta una comunidad hermana o de otra provincia, aunque compartan prefijo de texto", () => {
    expect(isCandidateFor(own, { id: "tan", path: "earth.sa.ar.ba.ba-tandil" })).toBe(true);
    expect(
      isCandidateFor(
        { id: "ba", path: "earth.sa.ar.ba" },
        { id: "bah", path: "earth.sa.ar.ba-hermana" },
      ),
    ).toBe(true);
  });
});

describe("mergeCandidates", () => {
  it("suma lo que trajo la búsqueda sin duplicar y sin perder lo que ya estaba", () => {
    const known = [
      { id: "1", name: "Córdoba" },
      { id: "2", name: "Tandil" },
    ];
    const incoming = [
      { id: "2", name: "Tandil" },
      { id: "9", name: "Tandileufú" },
    ];

    expect(mergeCandidates(known, incoming).map((c) => c.id)).toEqual(["1", "2", "9"]);
    expect(mergeCandidates(known, [])).toBe(known);
  });
});

describe("proposeErrorMessage", () => {
  it("repite el motivo exacto de elegibilidad o duración", () => {
    expect(proposeErrorMessage("es", { message: "AGORBIS_AGREEMENT_NESTED_COMMUNITIES" })).toContain("contiene");
    expect(proposeErrorMessage("es", { message: "AGORBIS_AGREEMENT_DURATION" })).toContain("7 y 30");
  });

  it("usa los textos conocidos de acuerdos y un genérico para lo demás", () => {
    expect(proposeErrorMessage("es", { message: "AGORBIS_AGREEMENT_TOO_MANY_PENDING" })).toContain("tres propuestas");
    expect(proposeErrorMessage("es", { message: "boom" })).toBe("No pudimos registrar la propuesta. Probá de nuevo.");
  });
});
