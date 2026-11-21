import type { RequestHandler } from "@qwik.dev/router";
import { logFailure } from "~/lib/log";
import { parseGoogleConsentAccount } from "~/lib/google-consent-account";
import { isCurrentAal2, moderatorMfaUrl, verifiedTotpFactors } from "~/lib/mfa";
import {
  currentSessionRecentlyAuthenticated,
  requireUser,
  supabase,
} from "~/lib/session";
import { createAdminSupabase } from "~/lib/supabase";

const PAGE_SIZE = 500;
const MAX_COLLECTION_ROWS = 2_000;
const MAX_EXPORT_ROWS = 10_000;
// Un paquete personal demasiado grande eleva memoria, latencia y riesgo de una
// descarga parcial. Mantenemos un límite propio conservador y derivamos los
// paquetes mayores al canal asistido.
const MAX_EXPORT_BYTES = 3 * 1024 * 1024;

type QueryError = { message?: string; code?: string };
type PageResult = { data: unknown[] | null; error: QueryError | null };
type SingleResult = { data: unknown | null; error: QueryError | null };
type ExportTask = () => Promise<unknown>;

class ExportLimitError extends Error {}

/** Pagina hasta el final y falla cerrado ante cualquier consulta parcial. */
function allRows(
  label: string,
  page: (from: number, to: number) => PromiseLike<unknown>,
): ExportTask {
  return async () => {
    const rows: unknown[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const result = (await page(from, from + PAGE_SIZE - 1)) as PageResult;
      if (result.error) {
        throw new Error(`export:${label}:${result.error.code ?? "query"}`);
      }
      const current = result.data ?? [];
      if (rows.length + current.length > MAX_COLLECTION_ROWS) {
        throw new ExportLimitError(`export:${label}:collection-limit`);
      }
      rows.push(...current);
      if (current.length < PAGE_SIZE) return rows;
    }
  };
}

function oneRow(
  label: string,
  resultPromise: PromiseLike<unknown>,
): ExportTask {
  return async () => {
    const result = (await resultPromise) as SingleResult;
    if (result.error) {
      throw new Error(`export:${label}:${result.error.code ?? "query"}`);
    }
    return result.data;
  };
}

/**
 * Ejecuta las lecturas protegidas una por vez. Además de evitar un pico de
 * decenas de consultas concurrentes, corta antes de construir una respuesta
 * que pueda agotar la memoria de una función Edge.
 */
async function runExportTasks(
  tasks: readonly ExportTask[],
  initialPayload: unknown,
): Promise<unknown[]> {
  const values: unknown[] = [];
  let rows = Array.isArray(initialPayload) ? initialPayload.length : 0;
  let bytes = new TextEncoder().encode(JSON.stringify(initialPayload)).length;

  for (const task of tasks) {
    const value = await task();
    rows += Array.isArray(value) ? value.length : value === null ? 0 : 1;
    bytes += new TextEncoder().encode(JSON.stringify(value)).length;
    if (rows > MAX_EXPORT_ROWS || bytes > MAX_EXPORT_BYTES) {
      throw new ExportLimitError("export:package-limit");
    }
    values.push(value);
  }
  return values;
}

/** Exportación íntegra de los datos vinculados directamente a la cuenta. */
export const onGet: RequestHandler = async (ev) => {
  const viewer = await requireUser(ev);
  ev.headers.set("Cache-Control", "private, no-store");
  const db = supabase(ev);
  const { data: authData, error: authError } = await db.auth.getUser();
  if (authError || !authData.user || authData.user.id !== viewer.userId) {
    throw ev.error(401, "Tu sesión ya no es válida. Volvé a ingresar.");
  }

  const destination = `${ev.url.pathname}${ev.url.search}`;
  if (!(await currentSessionRecentlyAuthenticated(db))) {
    throw ev.redirect(
      303,
      `/ingresar?next=${encodeURIComponent(destination)}&reauth=1`,
    );
  }

  // Quien eligió MFA tiene que presentarlo también para descargar el dossier
  // completo de su cuenta. No imponemos MFA a quien nunca lo configuró.
  const [factorsResult, assuranceResult] = await Promise.all([
    db.auth.mfa.listFactors(),
    db.auth.mfa.getAuthenticatorAssuranceLevel(),
  ]);
  if (factorsResult.error || assuranceResult.error) {
    logFailure(
      { scope: "perfil/exportacion-mfa", userId: viewer.userId },
      factorsResult.error ?? assuranceResult.error,
    );
    throw ev.error(
      503,
      "No pudimos verificar la seguridad de tu sesión. Probá de nuevo.",
    );
  }
  if (verifiedTotpFactors(factorsResult.data.all).length > 0) {
    if (!isCurrentAal2(assuranceResult.data.currentLevel)) {
      throw ev.redirect(303, moderatorMfaUrl(destination));
    }
    const { data: approved, error: approvalError } = await db.rpc(
      "current_session_uses_approved_factor",
    );
    if (approvalError) {
      logFailure(
        { scope: "perfil/exportacion-factor", userId: viewer.userId },
        approvalError,
      );
      throw ev.error(
        503,
        "No pudimos verificar la seguridad de tu segundo factor. Probá de nuevo.",
      );
    }
    if (approved !== true) {
      throw ev.redirect(
        303,
        `${moderatorMfaUrl(destination)}&approval=required`,
      );
    }
  }

  // El propio RPC de exportación vinculada reserva el cupo antes de cualquier
  // lectura con service_role. Así no existe una vía directa que omita el límite.
  // Deliberadamente no aplica el gate de participación: aun suspendida o con
  // documentos pendientes, la persona conserva el derecho a exportar sus datos.
  const { data: linkedActivity, error: exportGateError } = await db.rpc(
    "export_my_linked_activity",
  );
  if (exportGateError?.code === "54000") {
    ev.headers.set("Retry-After", "300");
    throw ev.error(
      429,
      "Podés descargar tus datos una vez cada 5 minutos. Probá de nuevo más tarde.",
    );
  }
  if (exportGateError) {
    logFailure(
      { scope: "perfil/exportacion-inicio", userId: viewer.userId },
      exportGateError,
    );
    throw ev.error(
      500,
      "No pudimos iniciar la exportación. Probá de nuevo en un momento.",
    );
  }

  const admin = createAdminSupabase(ev);
  const userId = viewer.userId;

  try {
    const [
      profile,
      home,
      follows,
      visibility,
      legalAcceptances,
      internationalTransferConsents,
      googleAuthConsents,
      googleAuthConsentState,
      suspensions,
      appeals,
      polls,
      debates,
      claims,
      projects,
      pollParticipations,
      debateComments,
      commentVotes,
      claimSupports,
      projectPledges,
      projectComments,
      projectContributions,
      budgetParticipations,
      notifications,
      notificationPreferences,
      reports,
      communityRequests,
      organizationRequests,
      organizationMemberships,
      claimUploads,
      claimEvents,
      contentSources,
      contentRelations,
      institutionalResponses,
      budgetReports,
      communityBudgets,
      communityInfo,
      assignedTasks,
      activationEvents,
      aiGenerationEvents,
      aiGenerationJobs,
    ] = await runExportTasks(
      [
        oneRow(
          "profile",
          admin
            .from("profiles")
            .select(
              "id, username, display_name, avatar_url, bio, home_community_id, residence_changed_at, verification_level, role, created_at",
            )
            .eq("id", userId)
            .maybeSingle(),
        ),
        viewer.homePath
          ? oneRow(
              "home",
              admin
                .from("communities")
                .select("id, slug, name, path")
                .eq("path", viewer.homePath)
                .maybeSingle(),
            )
          : async () => null,
        allRows("follows", (from, to) =>
          admin
            .from("follows")
            .select("community_id, created_at")
            .eq("user_id", userId)
            .order("community_id", { ascending: true })
            .range(from, to),
        ),
        allRows("community_visibility", (from, to) =>
          admin
            .from("community_visibility")
            .select("community_id, is_anonymous, updated_at")
            .eq("user_id", userId)
            .order("community_id", { ascending: true })
            .range(from, to),
        ),
        allRows("user_legal_acceptances", (from, to) =>
          admin
            .from("user_legal_acceptances")
            .select("document_type, version, minimum_age_attested, accepted_at")
            .eq("user_id", userId)
            .order("document_type", { ascending: true })
            .order("version", { ascending: true })
            .range(from, to),
        ),
        allRows("user_international_transfer_consents", (from, to) =>
          admin
            .from("user_international_transfer_consents")
            .select("notice_version, notice_hash, locale, source, accepted_at")
            .eq("user_id", userId)
            .order("accepted_at", { ascending: true })
            .range(from, to),
        ),
        allRows("user_google_auth_consent_events", (from, to) =>
          db
            .from("user_google_auth_consent_events")
            .select(
              "event_id, user_id, notice_version, notice_hash, decision, locale, recorded_at",
            )
            .eq("user_id", userId)
            .order("event_id", { ascending: true })
            .range(from, to),
        ),
        async () => {
          const { data, error } = await db.rpc("my_google_auth_consent");
          if (error) {
            throw new Error(
              `export:google-consent-state:${error.code ?? "query"}`,
            );
          }
          const consent = parseGoogleConsentAccount(data);
          if (!consent) {
            throw new Error("export:google-consent-state:invalid-response");
          }
          return consent;
        },
        allRows("user_suspensions", (from, to) =>
          admin
            .from("user_suspensions")
            .select(
              "id, starts_at, ends_at, reason, lifted_at, lift_reason, created_at",
            )
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("moderation_appeals", (from, to) =>
          admin
            .from("moderation_appeals")
            .select(
              "id, suspension_id, body, status, reviewed_at, resolution_note, created_at, updated_at",
            )
            .eq("appellant_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("polls", (from, to) =>
          admin
            .from("polls")
            .select(
              "id, community_id, question, description, type, category, max_choices, closes_at, results_visibility, status, status_before_removal, removed_at, created_at, poll_options(id, label, sort_order)",
            )
            .eq("author_id", userId)
            .order("id", { ascending: true })
            .order("id", {
              ascending: true,
              referencedTable: "poll_options",
            })
            .range(from, to),
        ),
        allRows("debates", (from, to) =>
          admin
            .from("debates")
            .select(
              "id, community_id, title, body, status, status_before_removal, removed_at, created_at",
            )
            .eq("author_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("claims", (from, to) =>
          admin
            .from("claims")
            .select(
              "id, community_id, title, description, category, image_url, image_urls, image_paths, lat, lng, location_text, status, status_before_removal, removed_at, support_count, escalated_at, escalated_to_community_id, first_response_at, response_due_at, responsible_organization_id, created_at",
            )
            .eq("author_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("projects", (from, to) =>
          admin
            .from("projects")
            .select(
              "id, community_id, title, summary, plan, budget_amount, currency, resources_needed, time_estimate, status, status_before_removal, removed_at, pledged_total, created_at, project_milestones(id, title, description, target_date, status, sort_order, completed_at, created_at), project_tasks(id, milestone_id, assigned_organization_id, title, description, skills_needed, due_date, status, created_at)",
            )
            .eq("author_id", userId)
            .order("id", { ascending: true })
            .order("id", {
              ascending: true,
              referencedTable: "project_milestones",
            })
            .order("id", {
              ascending: true,
              referencedTable: "project_tasks",
            })
            .range(from, to),
        ),
        allRows("poll_participation_receipts", (from, to) =>
          admin
            .from("poll_participation_receipts")
            .select("poll_id, participated_at")
            .eq("user_id", userId)
            .order("poll_id", { ascending: true })
            .range(from, to),
        ),
        allRows("debate_comments", (from, to) =>
          admin
            .from("debate_comments")
            .select(
              "id, debate_id, column_community_id, body, score, status, created_at",
            )
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("comment_votes", (from, to) =>
          admin
            .from("comment_votes")
            .select("comment_id, value, created_at")
            .eq("user_id", userId)
            .order("comment_id", { ascending: true })
            .range(from, to),
        ),
        allRows("claim_supports", (from, to) =>
          admin
            .from("claim_supports")
            .select("claim_id, created_at")
            .eq("user_id", userId)
            .order("claim_id", { ascending: true })
            .range(from, to),
        ),
        allRows("project_pledges", (from, to) =>
          admin
            .from("project_pledges")
            .select("id, project_id, amount, message, created_at")
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("project_comments", (from, to) =>
          admin
            .from("project_comments")
            .select("id, project_id, body, parent_id, status, created_at")
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("project_contributions", (from, to) =>
          admin
            .from("project_contributions")
            .select(
              "id, project_id, kind, description, quantity, unit, status, created_at, updated_at",
            )
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("budget_participation_receipts", (from, to) =>
          admin
            .from("budget_participation_receipts")
            .select("budget_id, participated_at")
            .eq("user_id", userId)
            .order("budget_id", { ascending: true })
            .range(from, to),
        ),
        allRows("notifications", (from, to) =>
          admin
            .from("notifications")
            .select(
              "id, type, title, body, href, entity_type, entity_id, community_id, read_at, created_at",
            )
            .eq("recipient_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        oneRow(
          "notification_preferences",
          admin
            .from("notification_preferences")
            .select(
              "replies, poll_results, claim_updates, project_updates, institutional_responses",
            )
            .eq("user_id", userId)
            .maybeSingle(),
        ),
        allRows("reports", (from, to) =>
          admin
            .from("reports")
            .select(
              "id, target_type, target_id, reason, status, resolved_at, created_at",
            )
            .eq("reporter_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("community_requests", (from, to) =>
          admin
            .from("community_requests")
            .select(
              "id, requested_name, country, requested_level, parent_community_id, reason, evidence_url, status, resolution_note, created_community_id, reviewed_at, created_at",
            )
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("organization_requests", (from, to) =>
          admin
            .from("organization_requests")
            .select(
              "id, name, type, community_id, website, message, evidence_url, status, reviewed_at, created_at",
            )
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("organization_members", (from, to) =>
          admin
            .from("organization_members")
            .select("organization_id, role, verified_at")
            .eq("user_id", userId)
            .order("organization_id", { ascending: true })
            .range(from, to),
        ),
        allRows("claim_uploads", (from, to) =>
          admin
            .from("claim_uploads")
            .select("id, path, claim_id, attached_at, created_at")
            .eq("owner_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("claim_events", (from, to) =>
          admin
            .from("claim_events")
            .select(
              "id, claim_id, organization_id, event_type, title, body, status, evidence_url, event_date, created_at",
            )
            .eq("actor_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("content_sources", (from, to) =>
          admin
            .from("content_sources")
            .select(
              "id, content_type, content_id, url, title, publisher, published_at, verified_at, created_at",
            )
            .eq("added_by", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("content_relations", (from, to) =>
          admin
            .from("content_relations")
            .select(
              "id, source_type, source_id, target_type, target_id, relation_type, created_at",
            )
            .eq("created_by", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("institutional_responses", (from, to) =>
          admin
            .from("institutional_responses")
            .select(
              "id, organization_id, content_type, content_id, response_type, body, source_url, created_at",
            )
            .eq("author_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("budget_reports", (from, to) =>
          admin
            .from("budget_reports")
            .select(
              "id, budget_id, project_id, amount_spent, summary, evidence_url, created_at",
            )
            .eq("author_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("community_budgets", (from, to) =>
          admin
            .from("community_budgets")
            .select(
              "id, community_id, title, description, amount, currency, tokens_per_voter, max_tokens_per_proposal, proposals_close_at, voting_opens_at, voting_closes_at, report_due_at, created_at",
            )
            .eq("created_by", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("community_info", (from, to) =>
          admin
            .from("community_info")
            .select(
              "id, community_id, category, title, content, image_url, updated_at",
            )
            .eq("updated_by", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("project_tasks", (from, to) =>
          admin
            .from("project_tasks")
            .select(
              "id, project_id, milestone_id, assigned_organization_id, title, description, skills_needed, due_date, status, created_at",
            )
            .eq("assigned_user_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("activation_events", (from, to) =>
          admin
            .from("activation_events")
            .select("id, event, event_date, metadata, created_at")
            .eq("user_id", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("ai_generation_events", (from, to) =>
          admin
            .from("ai_summary_generation_events")
            .select(
              "id, content_type, content_id, locale, source_hash, prompt_version, requested_at",
            )
            .eq("requested_by", userId)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        allRows("ai_generation_jobs", (from, to) =>
          admin
            .from("ai_summary_generation_jobs")
            .select(
              "content_id, content_type, locale, prompt_version, source_hash, status, attempt_count, includes_poll_results, created_at, updated_at, completed_at",
            )
            .eq("requested_by", userId)
            .order("content_type", { ascending: true })
            .order("content_id", { ascending: true })
            .order("locale", { ascending: true })
            .order("source_hash", { ascending: true })
            .order("prompt_version", { ascending: true })
            .range(from, to),
        ),
      ],
      linkedActivity,
    );

    const user = authData.user;
    const paquete = {
      formato: 6,
      generado: new Date().toISOString(),
      cuenta: {
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
        created_at: user.created_at,
        updated_at: user.updated_at,
        confirmed_at: user.confirmed_at ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        providers: user.app_metadata?.providers ?? [],
        user_metadata: user.user_metadata ?? {},
        identities: (user.identities ?? []).map((identity) => ({
          id: identity.id,
          provider: identity.provider,
          created_at: identity.created_at,
          last_sign_in_at: identity.last_sign_in_at,
          identity_data: identity.identity_data,
        })),
      },
      perfil: profile,
      residencia: home,
      preferencias: {
        comunidadesSeguidas: follows,
        visibilidadPorComunidad: visibility,
      },
      publicaciones: {
        encuestas: polls,
        debates,
        reclamos: claims,
        proyectos: projects,
      },
      participacion: {
        participacionesEnEncuestas: pollParticipations,
        comentariosEnDebates: debateComments,
        votosEnComentarios: commentVotes,
        apoyosAReclamos: claimSupports,
        aportesComprometidos: projectPledges,
        comentariosEnProyectos: projectComments,
        contribucionesAProyectos: projectContributions,
        participacionesEnPresupuestos: budgetParticipations,
        tareasAsignadas: assignedTasks,
      },
      extensionesYSeguimiento: {
        eventosDeReclamos: claimEvents,
        fuentesAgregadas: contentSources,
        relacionesCreadas: contentRelations,
        respuestasInstitucionales: institutionalResponses,
        rendiciones: budgetReports,
        presupuestosCreados: communityBudgets,
        informacionComunitariaEditada: communityInfo,
      },
      cuentaYModeracion: {
        aceptacionesLegales: legalAcceptances,
        consentimientosDeTransferenciasInternacionales:
          internationalTransferConsents,
        consentimientosDeAccesoConGoogle: googleAuthConsents,
        estadoDeConsentimientoDeAccesoConGoogle: googleAuthConsentState,
        suspensiones: suspensions,
        apelaciones: appeals,
        actividadVinculadaMinimizada: linkedActivity,
        notificaciones: notifications,
        preferencias_notificaciones: notificationPreferences,
        reportesEnviados: reports,
        solicitudesDeComunidad: communityRequests,
        solicitudesDeOrganizacion: organizationRequests,
        membresiasInstitucionales: organizationMemberships,
        archivosDeReclamos: claimUploads,
      },
      actividadTecnica: {
        activaciones: activationEvents,
        solicitudesDeResumenIa: aiGenerationEvents,
        trabajosDeResumenIa: aiGenerationJobs,
      },
    };

    const username =
      profile &&
      typeof profile === "object" &&
      "username" in profile &&
      typeof profile.username === "string"
        ? profile.username.replace(/[^a-z0-9_]/gi, "_")
        : "datos";
    ev.headers.set("Content-Type", "application/json; charset=utf-8");
    ev.headers.set(
      "Content-Disposition",
      `attachment; filename="agorbis-${username}.json"`,
    );
    ev.headers.set("Cache-Control", "private, no-store");
    ev.headers.set("X-Content-Type-Options", "nosniff");
    const body = JSON.stringify(paquete, null, 2);
    if (new TextEncoder().encode(body).length > MAX_EXPORT_BYTES) {
      throw new ExportLimitError("export:serialized-limit");
    }
    ev.send(200, body);
  } catch (error) {
    logFailure({ scope: "perfil/exportacion", userId }, error);
    if (error instanceof ExportLimitError) {
      throw ev.error(
        413,
        "Tu exportación supera el límite seguro de descarga automática. Escribinos desde el correo de tu cuenta para recibirla por un canal asistido; no se generó un archivo parcial.",
      );
    }
    throw ev.error(
      500,
      "No pudimos preparar una exportación completa. No se descargó un archivo parcial; probá de nuevo.",
    );
  }
};
