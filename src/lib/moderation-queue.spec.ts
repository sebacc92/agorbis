import { describe, expect, it } from "vitest";
import {
  closeReportsForTarget,
  countOpenReports,
  groupReports,
  oldestFirst,
  type QueueReport,
} from "./moderation-queue";
import type { DB } from "./supabase";

const CLAIM = "c0000000-0000-4000-8000-000000000001";
const POLL = "c0000000-0000-4000-8000-000000000002";

function report(
  id: string,
  target: { type: QueueReport["target_type"]; id: string },
  status: QueueReport["status"] = "pending",
): QueueReport {
  return {
    id,
    target_type: target.type,
    target_id: target.id,
    reason: `motivo ${id}`,
    status,
    created_at: `2026-10-0${id}T00:00:00Z`,
    reporter: `persona${id}`,
    preview: `contenido de ${target.id}`,
    contentStatus: "open",
    href: null,
  };
}

describe("oldestFirst", () => {
  it("ordena lo pendiente desde lo que más esperó y el historial al revés", () => {
    expect(oldestFirst("pending")).toBe(true);
    expect(oldestFirst("reviewing")).toBe(true);
    expect(oldestFirst("resolved")).toBe(false);
    expect(oldestFirst("dismissed")).toBe(false);
    expect(oldestFirst("todos")).toBe(false);
  });
});

describe("groupReports", () => {
  it("junta los reportes de un mismo contenido en el orden de su primer reporte", () => {
    const groups = groupReports([
      report("1", { type: "claim", id: CLAIM }),
      report("2", { type: "poll", id: POLL }),
      report("3", { type: "claim", id: CLAIM }),
    ]);
    expect(groups.map((group) => group.target_id)).toEqual([CLAIM, POLL]);
    expect(groups[0].reports.map((item) => item.id)).toEqual(["1", "3"]);
    expect(groups[0].openCount).toBe(2);
    expect(groups[1].openCount).toBe(1);
  });

  it("cuenta los abiertos de toda la cola, no sólo los de la página", () => {
    const [group] = groupReports(
      [report("1", { type: "claim", id: CLAIM })],
      countOpenReports([
        { target_type: "claim", target_id: CLAIM },
        { target_type: "claim", target_id: CLAIM },
        { target_type: "claim", target_id: CLAIM },
        { target_type: "poll", target_id: POLL },
      ]),
    );
    expect(group.openCount).toBe(3);
  });

  it("un reporte cerrado no suma a los abiertos", () => {
    const [group] = groupReports([
      report("1", { type: "claim", id: CLAIM }, "resolved"),
      report("2", { type: "claim", id: CLAIM }, "dismissed"),
    ]);
    expect(group.reports).toHaveLength(2);
    expect(group.openCount).toBe(0);
  });
});

/** Una base de mentira que registra cada cadena de llamadas. */
function fakeDb(results: {
  hide?: unknown;
  close?: unknown;
  rpc?: unknown;
}) {
  const calls: { table: string; steps: [string, unknown[]][] }[] = [];
  const db = {
    rpc(name: string, args: unknown) {
      calls.push({ table: `rpc:${name}`, steps: [["args", [args]]] });
      return Promise.resolve(results.rpc ?? { data: null, error: null });
    },
    from(table: string) {
      const call = { table, steps: [] as [string, unknown[]][] };
      calls.push(call);
      const chain: Record<string, unknown> = {};
      for (const method of ["update", "eq", "in", "select"]) {
        chain[method] = (...args: unknown[]) => {
          call.steps.push([method, args]);
          // `select` cierra la cadena del cierre de reportes.
          if (method === "select" && table === "reports") {
            return Promise.resolve(results.close);
          }
          return chain;
        };
      }
      chain.maybeSingle = () => Promise.resolve(results.hide);
      return chain;
    },
  };
  return { db: db as unknown as DB, calls };
}

describe("closeReportsForTarget", () => {
  it("oculta el contenido y después cierra todos sus reportes abiertos", async () => {
    const { db, calls } = fakeDb({
      hide: { data: { id: CLAIM }, error: null },
      close: { data: [{ id: "1" }, { id: "2" }], error: null },
    });
    expect(
      await closeReportsForTarget(db, {
        targetType: "claim",
        targetId: CLAIM,
        status: "resolved",
        hide: true,
      }),
    ).toEqual({ ok: true, closed: 2 });
    expect(calls.map((call) => call.table)).toEqual(["claims", "reports"]);
    expect(calls[0].steps[0]).toEqual(["update", [{ status: "removed" }]]);
    expect(calls[1].steps).toEqual([
      ["update", [{ status: "resolved" }]],
      ["eq", ["target_type", "claim"]],
      ["eq", ["target_id", CLAIM]],
      ["in", ["status", ["pending", "reviewing"]]],
      ["select", ["id"]],
    ]);
  });

  it("un acuerdo se oculta por la RPC de moderación, nunca por UPDATE directo", async () => {
    const { db, calls } = fakeDb({
      close: { data: [{ id: "1" }], error: null },
    });
    expect(
      await closeReportsForTarget(db, {
        targetType: "agreement",
        targetId: CLAIM,
        status: "resolved",
        hide: true,
      }),
    ).toEqual({ ok: true, closed: 1 });
    expect(calls.map((call) => call.table)).toEqual([
      "rpc:moderate_agreement",
      "reports",
    ]);
    expect(calls[0].steps[0]).toEqual([
      "args",
      [{ p_agreement: CLAIM, p_action: "hide" }],
    ]);
  });

  it("si la RPC del acuerdo falla, no cierra ningún reporte", async () => {
    const { db, calls } = fakeDb({
      rpc: { data: null, error: { message: "insufficient_privilege" } },
    });
    const result = await closeReportsForTarget(db, {
      targetType: "agreement",
      targetId: CLAIM,
      status: "resolved",
      hide: true,
    });
    expect(result).toMatchObject({ ok: false, stage: "hide" });
    expect(calls.map((call) => call.table)).toEqual(["rpc:moderate_agreement"]);
  });

  it("si no puede ocultar, no cierra ningún reporte", async () => {
    const { db, calls } = fakeDb({ hide: { data: null, error: null } });
    const result = await closeReportsForTarget(db, {
      targetType: "poll",
      targetId: POLL,
      status: "resolved",
      hide: true,
    });
    expect(result).toMatchObject({ ok: false, stage: "hide" });
    expect(calls.map((call) => call.table)).toEqual(["polls"]);
  });

  it("descartar no toca el contenido y avisa si el cierre falla", async () => {
    const error = { code: "42501", message: "denegado" };
    const { db, calls } = fakeDb({ close: { data: null, error } });
    expect(
      await closeReportsForTarget(db, {
        targetType: "claim",
        targetId: CLAIM,
        status: "dismissed",
        hide: false,
      }),
    ).toEqual({ ok: false, stage: "close", error });
    expect(calls.map((call) => call.table)).toEqual(["reports"]);
  });
});
