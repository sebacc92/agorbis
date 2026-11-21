import { describe, expect, it, vi } from "vitest";
import {
  loadGoogleAuthNotice,
  parseGoogleAuthNotice,
  persistGoogleAuthConsent,
  readGoogleAuthNotice,
} from "./google-auth-consent";
import type { DB } from "./supabase";

const content = { title: "Fixture", summary: "Only for tests", sections: [{ title: "Fixture", paragraphs: ["Synthetic notice, not a production approval."] }] };
const notice = { provider: "google", version: "test-v1", content_hash: "a".repeat(64), content_hash_algorithm: "sha256-postgres-jsonb-v1", content_snapshot: { es: content, en: content }, effective_at: "2026-09-01T00:00:00Z", issued_at: "2026-09-08T00:00:00Z" };
const decision = { version: notice.version, contentHash: notice.content_hash, startedAt: notice.issued_at, locale: "es" as const };

describe("aviso y aceptación opcional Google", () => {
  it("acepta únicamente un snapshot bilingüe completo", () => {
    expect(parseGoogleAuthNotice(notice)).toEqual(notice);
    for (const value of [null, {}, { ...notice, provider: "facebook" }, { ...notice, content_hash: "bad" }, { ...notice, content_snapshot: { es: content } }, { ...notice, effective_at: "2030-01-01" }]) expect(parseGoogleAuthNotice(value)).toBeNull();
  });

  it("falla cerrado si la base no ofrece aviso", async () => {
    for (const result of [{ data: null, error: null }, { data: notice, error: { code: "error" } }]) {
      const rpc = vi.fn().mockResolvedValue(result);
      expect(await readGoogleAuthNotice({ rpc } as unknown as DB)).toBeNull();
    }
  });

  it("persiste versión/hash/idioma e inicio sin recibir user_id ni tokens", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { status: "accepted", current_version: notice.version, current_content_hash: notice.content_hash }, error: null });
    expect(await persistGoogleAuthConsent({ rpc } as unknown as DB, decision)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("grant_google_auth_consent", { p_version: notice.version, p_content_hash: notice.content_hash, p_locale: "es", p_started_at: notice.issued_at, p_expressly_accepted: true });
  });

  it.each([null, { status: "withdrawn" }, { status: "accepted", current_version: "old", current_content_hash: notice.content_hash }])("no toma respuesta incompleta como aceptación", async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    expect(await persistGoogleAuthConsent({ rpc } as unknown as DB, decision)).toBe(false);
  });

  it("un error de transporte tampoco habilita el acceso", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("transport failure"));
    const db = { rpc } as unknown as DB;
    expect(await readGoogleAuthNotice(db)).toBeNull();
    expect(await persistGoogleAuthConsent(db, decision)).toBe(false);
  });

  describe("loadGoogleAuthNotice", () => {
    it("devuelve enabled false y notice null si Google está desactivado en runtime", async () => {
      const ev = {
        headers: new Headers(),
        env: { get: vi.fn().mockReturnValue("false") },
      } as unknown as Parameters<typeof loadGoogleAuthNotice>[0];

      const result = await loadGoogleAuthNotice(ev);
      expect(result).toEqual({ enabled: false, notice: null });
      expect(ev.headers.get("Cache-Control")).toBe("private, no-store");
    });
  });
});
