import type { Session } from "@supabase/supabase-js";
import type { DB } from "./supabase";

export function hasOAuthProviderTokens(
  session: Pick<Session, "provider_token" | "provider_refresh_token">,
): boolean {
  return !!(session.provider_token || session.provider_refresh_token);
}

/**
 * `exchangeCodeForSession` persists the complete OAuth response, including a
 * Google provider token that Agorbis never uses. Re-saving only Supabase's
 * access/refresh pair makes auth-js fetch the user and overwrite cookie storage
 * with a session that has no provider credentials.
 */
export async function stripOAuthProviderTokens(
  db: DB,
  session: Session,
): Promise<boolean> {
  if (!hasOAuthProviderTokens(session)) return true;

  const { data, error } = await db.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  return !error && !!data.session && !hasOAuthProviderTokens(data.session);
}
