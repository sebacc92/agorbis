import type { RequestEventLoader } from "@qwik.dev/router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: [] as { table: string; head: boolean; limit?: number; resolved: boolean }[], failure: false, victory: false, comment: false }));
vi.mock("./session", () => ({
  requireUser: async () => ({ userId: "33333333-3333-4333-8333-333333333333", profile: { username: "sofia_mdq" }, residenceChain: [] }),
  supabase: () => ({ from: (table: string) => {
    const call = { table, head: false, limit: undefined as number | undefined, resolved: false };
    state.calls.push(call);
    const builder = {
      select: (_columns: string, options?: { head?: boolean }) => { call.head = !!options?.head; return builder; },
      eq: (field: string, value: string) => { if ((field === "status" || field === "claims.status") && value === "resolved") call.resolved = true; return builder; }, neq: () => builder, is: () => builder, order: () => builder, or: () => builder,
      limit: (limit: number) => { call.limit = limit; return builder; },
      then: (resolve: (result: unknown) => void) => resolve({ data: call.head ? null : state.victory && call.resolved ? [{ id: "resolved-claim" }] : state.comment && table === "debate_comments" ? [{ id: "44444444-4444-4444-8444-444444444444", debate_id: "55555555-5555-4555-8555-555555555555", body: "Mi comentario", created_at: "2026-10-22T10:00:00Z", debates: { title: "Debate con muchas respuestas" } }] : [], count: table === "follows" ? 150 : 40, error: state.failure && table === "follows" ? { code: "XX000", message: "unavailable" } : null }),
    };
    return builder;
  } }),
}));
vi.mock("./quota", () => ({ EMPTY_QUOTA: { entries: [], unlimited: false, unavailable: false }, loadQuotaSummary: async () => ({ entries: [], unlimited: false, unavailable: false }) }));
vi.mock("./log", () => ({ logFailure: vi.fn() }));

import { loadProfilePage } from "./profile-page";

const event = (query = "") => ({
  url: new URL(`https://test/perfil?${query}`),
  locale: () => "es",
  sharedMap: new Map(),
  error: (status: number, message: string) => new Error(`${status}: ${message}`),
}) as unknown as RequestEventLoader;

beforeEach(() => { state.calls = []; state.failure = false; state.victory = false; state.comment = false; });

describe("consultas paginadas del perfil", () => {
  it("enlaza el comentario exacto con consulta y ancla para recuperarlo fuera de destacados", async () => {
    state.comment = true;
    const result = await loadProfilePage(event());
    expect(result.activity.find((item) => item.kind === "comentario")?.href).toBe("/debates/55555555-5555-4555-8555-555555555555?comentario=44444444-4444-4444-8444-444444444444#comment-44444444-4444-4444-8444-444444444444");
  });
  it("acota cada fuente a26 filas y reutiliza los conteos de la primera página", async () => {
    const result = await loadProfilePage(event());
    expect(result.counts).toEqual({ votes: 40, comments: 40, supports: 40, pledges: 40 });
    expect(result.followsPage.total).toBe(150);
    expect(state.calls.filter((call) => call.head)).toHaveLength(0);
    expect(state.calls.filter((call) => !call.resolved && ["follows", "poll_participation_receipts", "debate_comments", "claim_supports", "project_pledges"].includes(call.table)).every((call) => call.limit === 26)).toBe(true);
  });
  it("mantiene totales globales aunque el cursor ya no tenga filas", async () => {
    const params = new URLSearchParams({ actividad_antes: "2026-10-22T12:00:00Z", actividad_id: "33333333-3333-4333-8333-333333333333", actividad_tipo: "voto", seguidos_antes: "2026-10-22T12:00:00Z", seguidos_id: "33333333-3333-4333-8333-333333333333" });
    const result = await loadProfilePage(event(params.toString()));
    expect(result.activity).toEqual([]);
    expect(result.activityPage.hasCursor).toBe(true);
    expect(result.counts.votes).toBe(40);
    expect(result.followsPage).toMatchObject({ hasCursor: true, total: 150, nextCursor: null });
    expect(state.calls.filter((call) => call.head)).toHaveLength(5);
  });
  it("un error de base no se transforma en listas ni conteos vacíos", async () => {
    state.failure = true;
    await expect(loadProfilePage(event())).rejects.toThrow("500");
  });
  it("conserva Victoria Vecinal al paginar y sólo consulta existencia de reclamos resueltos", async () => {
    state.victory = true;
    const first = await loadProfilePage(event());
    const later = await loadProfilePage(event("actividad_antes=2026-10-22T12%3A00%3A00Z&actividad_id=33333333-3333-4333-8333-333333333333&actividad_tipo=voto"));
    expect(first.badges.find((badge) => badge.id === "victory")?.unlocked).toBe(true);
    expect(later.badges).toEqual(first.badges);
    expect(state.calls.filter((call) => call.resolved)).toHaveLength(4);
    expect(state.calls.filter((call) => call.resolved).every((call) => call.limit === 1)).toBe(true);
  });
});
