import { describe, expect, it, vi } from "vitest";
import { logFailure } from "./log";
import {
  feedIdsByKind,
  ownIds,
  isSupported,
  pollCall,
  type OwnMarks,
} from "./feed-marks";

vi.mock("./log", () => ({ logFailure: vi.fn() }));

const marks: OwnMarks = {
  votedPollIds: ["poll-votada"],
  supportedClaimIds: ["reclamo-apoyado"],
};

describe("feedIdsByKind", () => {
  it("separa las encuestas y los reclamos de la página, y nada más", () => {
    const ids = feedIdsByKind([
      { id: "p1", kind: "poll" },
      { id: "c1", kind: "claim" },
      { id: "d1", kind: "debate" },
      { id: "p2", kind: "poll" },
      { id: "x1", kind: "project" },
    ]);
    expect(ids).toEqual({ pollIds: ["p1", "p2"], claimIds: ["c1"] });
  });
});

describe("pollCall", () => {
  it("una encuesta cerrada sólo se puede ver, haya voto o no", () => {
    expect(pollCall("closed", "poll-votada", marks)).toBe("closed");
    expect(pollCall("closed", "poll-sin-voto", marks)).toBe("closed");
  });

  it("una encuesta abierta con recibo propio ya fue votada", () => {
    expect(pollCall("active", "poll-votada", marks)).toBe("voted");
  });

  it("una encuesta abierta sin recibo propio invita a participar", () => {
    expect(pollCall("active", "poll-sin-voto", marks)).toBe("open");
  });

  it("si los recibos no se pudieron leer, no afirma ni voto ni falta de voto", () => {
    expect(
      pollCall("active", "poll-votada", {
        votedPollIds: null,
        supportedClaimIds: [],
      }),
    ).toBe("unknown");
  });

  it("cerrada le gana a desconocido", () => {
    expect(
      pollCall("closed", "poll-votada", {
        votedPollIds: null,
        supportedClaimIds: null,
      }),
    ).toBe("closed");
  });
});

describe("isSupported", () => {
  it("marca sólo los reclamos con apoyo propio", () => {
    expect(isSupported("reclamo-apoyado", marks)).toBe(true);
    expect(isSupported("otro", marks)).toBe(false);
  });

  it("sin lectura de apoyos no marca ninguno", () => {
    expect(
      isSupported("reclamo-apoyado", {
        votedPollIds: [],
        supportedClaimIds: null,
      }),
    ).toBe(false);
  });
});

describe("ownIds", () => {
  it("devuelve los ids de la columna pedida cuando la consulta salió bien", async () => {
    await expect(
      ownIds({ scope: "inicio/recibos" }, "poll_id", Promise.resolve({ data: [{ poll_id: "a" }, { poll_id: "b" }], error: null })),
    ).resolves.toEqual(["a", "b"]);
  });

  it("devuelve null y deja rastro cuando la consulta falló", async () => {
    vi.mocked(logFailure).mockClear();
    await expect(
      ownIds(
        { scope: "inicio/apoyos", requestId: "req-1" },
        "claim_id",
        Promise.resolve({
          data: null,
          error: { message: "boom", code: "42501" },
        }),
      ),
    ).resolves.toBeNull();
    expect(logFailure).toHaveBeenCalledWith(
      { scope: "inicio/apoyos", requestId: "req-1" },
      { message: "boom", code: "42501" },
    );
  });

  it("una promesa rechazada tampoco tumba la página: null y rastro", async () => {
    vi.mocked(logFailure).mockClear();
    await expect(
      ownIds(
        { scope: "inicio/recibos" },
        "poll_id",
        Promise.reject(new Error("red cortada")),
      ),
    ).resolves.toBeNull();
    expect(logFailure).toHaveBeenCalledTimes(1);
    const [context] = vi.mocked(logFailure).mock.calls[0]!;
    // Ni ids ni datos de la persona en el contexto del log.
    expect(Object.keys(context)).toEqual(["scope"]);
  });
});
