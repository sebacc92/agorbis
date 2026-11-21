import {
  OAUTH_CONSENT_MAX_AGE_SECONDS,
  type SocialAuthProvider,
} from "./auth-security";
import type { GoogleAuthDecision } from "./google-auth-consent";

export const OAUTH_CONTEXT_COOKIE = "agorbis-oauth-context";

export interface OAuthContext {
  format: 1;
  nonce: string;
  provider: SocialAuthProvider;
  intent: "login" | "register";
  nextHash: string;
  startedAt: string;
  googleDecision?: GoogleAuthDecision;
}

async function destinationHash(next: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(next),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function createOAuthContext(
  input: Omit<OAuthContext, "format" | "nextHash"> & { next: string },
): Promise<OAuthContext> {
  const { next, ...context } = input;
  return { ...context, format: 1, nextHash: await destinationHash(next) };
}

/** Qwik decodes cookies on read; the writer uses encodeURIComponent. */
export async function readOAuthContext(
  marker: string | undefined,
  nonce: string | null,
  intent: string,
  next: string,
): Promise<OAuthContext | null> {
  if (!marker || marker.length > 2048 || !nonce) return null;
  try {
    const context = JSON.parse(marker) as OAuthContext;
    if (
      !context ||
      context.format !== 1 ||
      context.nonce !== nonce ||
      !["google", "facebook"].includes(context.provider) ||
      !["login", "register"].includes(context.intent) ||
      context.intent !== intent ||
      context.nextHash !== (await destinationHash(next)) ||
      typeof context.startedAt !== "string"
    )
      return null;
    const age = Date.now() - Date.parse(context.startedAt);
    if (
      !Number.isFinite(age) ||
      age < -30_000 ||
      age > OAUTH_CONSENT_MAX_AGE_SECONDS * 1000
    )
      return null;
    const decision = context.googleDecision;
    if (
      context.provider === "google" &&
      (!decision ||
        typeof decision.version !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(decision.version) ||
        typeof decision.contentHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(decision.contentHash) ||
        decision.startedAt !== context.startedAt ||
        !["es", "en"].includes(decision.locale))
    )
      return null;
    if (context.provider === "facebook" && decision !== undefined) return null;
    return context;
  } catch {
    return null;
  }
}
