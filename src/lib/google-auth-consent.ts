import type { RequestEventBase } from "@qwik.dev/router";
import type { LegalDocumentContent } from "./legal-content";
import { googleAuthEnabled } from "./auth-security";
import { createServerSupabase, type DB } from "./supabase";

export const GOOGLE_AUTH_NOTICE_ROUTE = "/acceso-google";

export interface GoogleAuthNotice {
  provider: "google";
  version: string;
  content_hash: string;
  content_hash_algorithm: "sha256-postgres-jsonb-v1";
  content_snapshot: Record<"es" | "en", LegalDocumentContent>;
  effective_at: string;
  issued_at: string;
}

function documentContent(value: unknown): value is LegalDocumentContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.title === "string" &&
    row.title.length > 0 &&
    typeof row.summary === "string" &&
    row.summary.length > 0 &&
    Array.isArray(row.sections) &&
    row.sections.length > 0 &&
    row.sections.every((section) => {
      if (!section || typeof section !== "object" || Array.isArray(section))
        return false;
      const part = section as Record<string, unknown>;
      return (
        typeof part.title === "string" &&
        part.title.length > 0 &&
        [part.paragraphs, part.bullets].some(
          (items) => Array.isArray(items) && items.length > 0,
        ) &&
        [part.paragraphs, part.bullets].every(
          (items) =>
            items === undefined ||
            (Array.isArray(items) &&
              items.every((item) => typeof item === "string")),
        )
      );
    })
  );
}

/** Only the approved, current SQL snapshot can be offered for acceptance. */
export function parseGoogleAuthNotice(value: unknown): GoogleAuthNotice | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const snapshot = row.content_snapshot as Record<string, unknown> | undefined;
  if (
    row.provider !== "google" ||
    typeof row.version !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(row.version) ||
    typeof row.content_hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(row.content_hash) ||
    row.content_hash_algorithm !== "sha256-postgres-jsonb-v1" ||
    !snapshot ||
    !documentContent(snapshot.es) ||
    !documentContent(snapshot.en) ||
    typeof row.effective_at !== "string" ||
    !Number.isFinite(Date.parse(row.effective_at)) ||
    typeof row.issued_at !== "string" ||
    !Number.isFinite(Date.parse(row.issued_at)) ||
    Date.parse(row.effective_at) > Date.parse(row.issued_at)
  )
    return null;
  return row as unknown as GoogleAuthNotice;
}

export async function readGoogleAuthNotice(
  db: DB,
): Promise<GoogleAuthNotice | null> {
  try {
    const { data, error } = await db.rpc("current_google_auth_notice");
    return error ? null : parseGoogleAuthNotice(data);
  } catch {
    return null;
  }
}

export interface GoogleAuthStatus {
  enabled: boolean;
  notice: GoogleAuthNotice | null;
}

export async function loadGoogleAuthNotice(
  ev: RequestEventBase,
): Promise<GoogleAuthStatus> {
  ev.headers.set("Cache-Control", "private, no-store");
  const enabled = googleAuthEnabled(ev.env.get("PUBLIC_GOOGLE_AUTH_ENABLED"));
  if (!enabled) return { enabled: false, notice: null };
  const notice = await readGoogleAuthNotice(createServerSupabase(ev));
  return { enabled: true, notice };
}

export interface GoogleAuthDecision {
  version: string;
  contentHash: string;
  startedAt: string;
  locale: "es" | "en";
}

/** The account is known only after the sanitized OAuth exchange. */
export async function persistGoogleAuthConsent(
  db: DB,
  decision: GoogleAuthDecision,
): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("grant_google_auth_consent", {
      p_version: decision.version,
      p_content_hash: decision.contentHash,
      p_started_at: decision.startedAt,
      p_locale: decision.locale,
      p_expressly_accepted: true,
    });
    if (error || !data || typeof data !== "object" || Array.isArray(data))
      return false;
    const status = data as Record<string, unknown>;
    return (
      status.status === "accepted" &&
      status.current_version === decision.version &&
      status.current_content_hash === decision.contentHash
    );
  } catch {
    return false;
  }
}
