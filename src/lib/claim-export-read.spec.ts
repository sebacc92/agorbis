import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEventLoader } from "@qwik.dev/router";
import type { QRL } from "@qwik.dev/core";
import { supabase } from "./session";
import { useClaimPoster } from "~/routes/reclamos/[id]/afiche/index";
import { useClaimDossier } from "~/routes/reclamos/[id]/dossier/index";
import { useFormalLetter } from "~/routes/reclamos/[id]/nota-formal/index";
import { useClaimPetitionSheet } from "~/routes/reclamos/[id]/planilla/index";

vi.mock("./session", () => ({ supabase: vi.fn() }));
vi.mock("./log", () => ({ logFailure: vi.fn() }));
vi.mock("~/routes/layout", () => ({ useLocaleLoader: vi.fn() }));

const id = "f0000000-0000-4000-8000-000000000001";
const claim = { id, title: "Luminaria apagada", description: "Descripción vecinal", status: "open", support_count: 2, created_at: "2026-01-01", category: "alumbrado", community: { id, slug: "barrio", name: "Barrio", emoji: "🏡", level: 4, member_count: 20 } };
const loaders = [
  ["afiche", useClaimPoster], ["dossier", useClaimDossier],
  ["nota-formal", useFormalLetter], ["planilla", useClaimPetitionSheet],
] as const;
function fixture(missing = false, failedTable = "") {
  const db = {
    from: vi.fn((table: string) => {
      const result = { data: table === failedTable ? null : table === "claims" ? missing ? null : claim : [], error: table === failedTable ? { message: "unavailable", code: "XX000" } : null };
      const query = { select: () => query, eq: () => query, maybeSingle: () => query, order: () => query, then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
      return query;
    }),
  };
  vi.mocked(supabase).mockReturnValue(db as unknown as ReturnType<typeof supabase>);
  const ev = { params: { id }, sharedMap: new Map(), locale: () => "es", url: new URL(`https://agorbis.test/reclamos/${id}/afiche/`), env: { get: () => undefined }, error: (status: number, message: string) => Object.assign(new Error(message), { status }) } as unknown as RequestEventLoader;
  return ev;
}
async function run(loader: unknown, ev: RequestEventLoader) {
  const handler = await (loader as { __qrl: QRL<(ev: RequestEventLoader) => Promise<unknown>> }).__qrl.resolve();
  return handler(ev);
}
beforeEach(() => vi.clearAllMocks());

describe("exportaciones de reclamos con errores recuperables", () => {
  it.each(loaders)("%s reserva404 para ausencia real bajo RLS", async (_, loader) => {
    await expect(run(loader, fixture(true))).rejects.toMatchObject({ status: 404 });
  });
  it.each(loaders)("%s mantiene500 recuperable ante un fallo de lectura", async (_, loader) => {
    await expect(run(loader, fixture(false, "claims"))).rejects.toMatchObject({ status: 500 });
  });
  it.each(loaders)("%s conserva la exportación disponible y su enlace de origen", async (_, loader) => {
    await expect(run(loader, fixture())).resolves.toMatchObject({ claim, fullUrl: `https://agorbis.test/reclamos/${id}` });
  });
  it("un historial que no se pudo leer no se imprime como un historial vacío", async () => {
    await expect(run(useClaimDossier, fixture(false, "claim_events"))).rejects.toMatchObject({ status: 500 });
  });
});
