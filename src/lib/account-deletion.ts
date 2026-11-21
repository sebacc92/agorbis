import type { DB } from "./supabase";

/**
 * Texto que la persona debe copiar antes de una baja irreversible.
 *
 * El perfil normalmente siempre existe, pero Auth es la fuente de verdad de
 * la cuenta. Usar el correo (o una frase neutra como último recurso) conserva
 * el camino de baja si una reparación operativa dejó una cuenta sin perfil.
 */
export function accountDeletionConfirmation(
  username: string | null | undefined,
  email: string | null | undefined,
): string {
  return username?.trim() || email?.trim() || "ELIMINAR";
}

export interface AccountDeletionProcessingResult {
  claimed: number;
  completed: number;
  failed: number;
  error: unknown | null;
}

export interface AccountDeletionJobStats {
  pending: number;
  deadLetter: number;
  leased: number;
  staleActiveAccounts: number;
  staleLeases: number;
  oldestPendingAt: string | null;
}

export interface OrphanMediaSweepResult {
  claimsRemoved: number;
  avatarsRemoved: number;
  error: unknown | null;
}

/**
 * Procesa la outbox que queda después de eliminar Auth. Es idempotente: cada
 * intento vuelve a consultar qué objetos siguen existiendo y la base sólo
 * completa el trabajo cuando Storage confirma que no queda ninguno.
 */
export async function processAccountDeletionJobs(
  admin: DB,
  options: { userId?: string; limit?: number } = {},
): Promise<AccountDeletionProcessingResult> {
  const { data: jobs, error: claimError } = await admin.rpc(
    "claim_account_deletion_jobs",
    {
      p_user: options.userId ?? undefined,
      p_limit: options.limit ?? 10,
    },
  );
  if (claimError) {
    return { claimed: 0, completed: 0, failed: 0, error: claimError };
  }

  let completed = 0;
  let failed = 0;
  for (const job of jobs ?? []) {
    const [avatars, drafts] = await Promise.all([
      job.avatar_paths.length
        ? admin.storage.from("avatars").remove(job.avatar_paths)
        : Promise.resolve({ error: null }),
      job.pending_claim_paths.length
        ? admin.storage.from("claims").remove(job.pending_claim_paths)
        : Promise.resolve({ error: null }),
    ]);
    const avatarTracking =
      !avatars.error && job.avatar_paths.length
        ? await admin.rpc("finish_avatar_upload_cleanup", {
            p_paths: job.avatar_paths,
          })
        : { error: null };
    const storageError =
      avatars.error ?? drafts.error ?? avatarTracking.error ?? null;
    const { data: finished, error: finishError } = await admin.rpc(
      "finish_account_deletion_job",
      {
        p_user: job.user_id,
        p_error: storageError ? "storage_remove_failed" : undefined,
      },
    );
    if (storageError || finishError || finished !== true) {
      failed += 1;
      continue;
    }
    completed += 1;
  }

  return {
    claimed: jobs?.length ?? 0,
    completed,
    failed,
    error: null,
  };
}

export async function getAccountDeletionJobStats(
  admin: DB,
): Promise<{ stats: AccountDeletionJobStats | null; error: unknown | null }> {
  const { data, error } = await admin.rpc("account_deletion_job_stats");
  if (error) return { stats: null, error };
  const row = data?.[0];
  if (!row) {
    return { stats: null, error: new Error("account_deletion_stats_missing") };
  }
  return {
    stats: {
      pending: Number(row.pending_count),
      deadLetter: Number(row.dead_letter_count),
      leased: Number(row.leased_count),
      staleActiveAccounts: Number(row.stale_active_account_count),
      staleLeases: Number(row.stale_lease_count),
      oldestPendingAt: row.oldest_pending_at,
    },
    error: null,
  };
}

/**
 * Retira objetos que llegaron extremadamente tarde, después de que su outbox
 * ya terminó. El margen de 24 h evita competir con una carga normal.
 */
export async function sweepOrphanAccountMedia(
  admin: DB,
  options: { olderThanMs?: number; limit?: number } = {},
): Promise<OrphanMediaSweepResult> {
  const cutoff = new Date(
    Date.now() - (options.olderThanMs ?? 24 * 60 * 60 * 1000),
  ).toISOString();
  const limit = options.limit ?? 100;
  const [claimObjects, avatarObjects] = await Promise.all([
    admin.rpc("list_orphan_claim_objects", {
      p_cutoff: cutoff,
      p_limit: limit,
    }),
    admin.rpc("list_orphan_avatar_objects", {
      p_cutoff: cutoff,
      p_limit: limit,
    }),
  ]);
  const listError = claimObjects.error ?? avatarObjects.error;
  if (listError) {
    return { claimsRemoved: 0, avatarsRemoved: 0, error: listError };
  }

  const claimPaths = (claimObjects.data ?? []).map(({ path }) => path);
  const avatarPaths = (avatarObjects.data ?? []).map(({ path }) => path);
  const [claims, avatars] = await Promise.all([
    claimPaths.length
      ? admin.storage.from("claims").remove(claimPaths)
      : Promise.resolve({ error: null }),
    avatarPaths.length
      ? admin.storage.from("avatars").remove(avatarPaths)
      : Promise.resolve({ error: null }),
  ]);
  const removalError = claims.error ?? avatars.error;
  if (removalError) {
    return { claimsRemoved: 0, avatarsRemoved: 0, error: removalError };
  }
  const { error: trackingError } = avatarPaths.length
    ? await admin.rpc("finish_avatar_upload_cleanup", {
        p_paths: avatarPaths,
      })
    : { error: null };
  if (trackingError) {
    return {
      claimsRemoved: claimPaths.length,
      avatarsRemoved: 0,
      error: trackingError,
    };
  }
  return {
    claimsRemoved: claimPaths.length,
    avatarsRemoved: avatarPaths.length,
    error: null,
  };
}
