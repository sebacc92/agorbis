import { describe, expect, it } from "vitest";
import {
  COLLECTION_LIMITS_BRAND,
  collectionLimits,
  exceedsCollectionLimits,
} from "./form-collection-limits";

const fakeEvent = { locale: () => "es" } as unknown as Parameters<
  NonNullable<ReturnType<typeof collectionLimits>>["validate"]
>[0];

describe("exceedsCollectionLimits", () => {
  it("deja pasar un valor suelto, un array dentro del tope y datos sin forma", () => {
    expect(exceedsCollectionLimits({ option_id: "a" }, { option_id: 10 })).toBe(
      null,
    );
    expect(
      exceedsCollectionLimits(
        { option_id: Array.from({ length: 10 }, () => "a") },
        { option_id: 10 },
      ),
    ).toBe(null);
    expect(exceedsCollectionLimits(null, { option_id: 10 })).toBe(null);
    expect(exceedsCollectionLimits("texto", { option_id: 10 })).toBe(null);
  });

  it("nombra el primer campo que supera su tope sin recorrer los elementos", () => {
    // Un proxy que explota si alguien lee un elemento: el tope se decide
    // sólo por `length`, que es lo que lo hace barato ante 100.000 valores.
    const huge = new Proxy(Array.from({ length: 100_000 }, () => "x"), {
      get(target, prop, receiver) {
        if (prop === "length") return Reflect.get(target, prop, receiver);
        if (typeof prop === "string" && /^\d+$/.test(prop))
          throw new Error("se leyó un elemento");
        return Reflect.get(target, prop, receiver);
      },
    });
    expect(
      exceedsCollectionLimits({ options: huge, other: [] }, { options: 10 }),
    ).toBe("options");
  });
});

describe("collectionLimits", () => {
  it("rechaza con 400 y un mensaje antes de que corra ningún esquema", async () => {
    const validator = collectionLimits({ image_paths: 4 })!;
    expect(validator.brand).toBe(COLLECTION_LIMITS_BRAND);
    const data = { image_paths: Array.from({ length: 50_000 }, () => "p") };
    const result = await validator.validate(fakeEvent, data);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.status).toBe(400);
    expect(result.error.message).toContain("más valores de los que admite");
  });

  it("devuelve los datos intactos cuando el tope se respeta", async () => {
    const validator = collectionLimits({ image_paths: 4 })!;
    const data = { image_paths: ["a", "b"], title: "t" };
    const result = await validator.validate(fakeEvent, data);
    expect(result).toEqual({ success: true, data });
  });
});

// Estos casos importan el módulo entero de una acción y, para useVote, la ruta
// de la encuesta con todo su árbol de componentes. En frío, Vite tarda unos
// 5 s en transformarlo, y en el build de `pnpm deploy:open`, con la máquina
// cargada, el límite por defecto de 5 s cortaba el caso sin que fallara nada.
// La aserción no cambia: sólo el tiempo para importar.
const MODULE_IMPORT_TIMEOUT_MS = 30_000;

describe("orden de los validadores en las acciones con arrays", () => {
  // El router invierte el orden declarado y corta en el primer fallo: el tope
  // tiene que ser el primero en correr, antes de zod$. Si alguien lo mueve, el
  // esquema volvería a ver arrays sin límite (D100).
  it("useCreatePoll y useCreateClaim cuentan antes de validar", async () => {
    const { useCreatePoll, useCreateClaim } = await import("./content-actions");
    for (const action of [useCreatePoll, useCreateClaim]) {
      const validators = (action as unknown as { __validators: unknown[] })
        .__validators;
      expect((validators[0] as { brand?: string }).brand).toBe(
        COLLECTION_LIMITS_BRAND,
      );
    }
  }, MODULE_IMPORT_TIMEOUT_MS);

  it("useVote cuenta antes de validar", async () => {
    const { useVote } = await import("~/routes/encuestas/[id]/index");
    const validators = (useVote as unknown as { __validators: unknown[] })
      .__validators;
    expect((validators[0] as { brand?: string }).brand).toBe(
      COLLECTION_LIMITS_BRAND,
    );
  }, MODULE_IMPORT_TIMEOUT_MS);
});
