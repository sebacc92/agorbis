import { globalAction$, z, zod$ } from "@qwik.dev/router";
import {
  AI_SUMMARY_PROMPT_VERSION,
  aiSummaryView,
  collectAiSummarySource,
  hashAiSummarySource,
  loadAiSummaryByHash,
} from "./ai-summary";
import {
  AiSummaryGenerationError,
  hashSafetyIdentifier,
  requestOpenAiSummary,
} from "./ai-summary-generation";
import { resolveLocale } from "./i18n";
import { readParticipationStatus } from "./legal";
import { requireUser, supabase } from "./session";
import { createAdminSupabase } from "./supabase";

const contentTypeSchema = z.enum(["poll", "debate", "claim", "project"]);

export const useGenerateAiSummary = globalAction$(
  async (data, ev) => {
    const viewer = await requireUser(ev);
    const locale = resolveLocale(ev.locale());

    // Los dos secretos/configuraciones se leen únicamente en este closure de
    // servidor. No existe fallback de modelo ni acceso mediante import.meta.env.
    const apiKey = ev.env.get("OPENAI_API_KEY")?.trim();
    const model = ev.env.get("OPENAI_SUMMARY_MODEL")?.trim();
    if (!apiKey || !model) {
      return ev.fail(503, {
        state: "error" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        message: "La generación automática no está configurada.",
      });
    }

    const userDb = supabase(ev);
    const participation = await readParticipationStatus(userDb);
    if (!participation?.canParticipate) {
      return ev.fail(participation ? 403 : 503, {
        state: "error" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        message: participation?.isSuspended
          ? "Tu cuenta está suspendida. Podés seguir leyendo, pero no generar resúmenes."
          : participation
            ? "Aceptá los documentos vigentes antes de generar resúmenes."
            : "No pudimos verificar si tu cuenta puede participar. Probá de nuevo.",
      });
    }
    let source;
    try {
      source = await collectAiSummarySource(
        userDb,
        data.content_type,
        data.content_id,
      );
    } catch {
      return ev.fail(500, {
        state: "error" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        message: "No pudimos preparar el contenido para resumir.",
      });
    }
    if (!source) {
      return ev.fail(404, {
        state: "error" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        message: "No encontramos el contenido que querés resumir.",
      });
    }

    const sourceHash = await hashAiSummarySource(source);
    // Único uso de service_role: RPCs server-only que protegen la cache, el
    // rate-limit y el lease contra escrituras fabricadas desde el navegador.
    let admin: ReturnType<typeof createAdminSupabase>;
    try {
      admin = createAdminSupabase(ev);
    } catch {
      return ev.fail(503, {
        state: "error" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        message: "La generación automática no está configurada.",
      });
    }
    const { data: decisions, error: beginError } = await admin.rpc(
      "begin_ai_summary_generation",
      {
        p_requester_id: viewer.userId,
        p_content_type: data.content_type,
        p_content_id: data.content_id,
        p_locale: locale,
        p_source_hash: sourceHash,
        p_prompt_version: AI_SUMMARY_PROMPT_VERSION,
        p_includes_poll_results: false,
      },
    );
    const decision = decisions?.[0];
    if (beginError || !decision) {
      return ev.fail(503, {
        state: "error" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        message: "No pudimos iniciar el resumen. Probá de nuevo.",
      });
    }

    if (decision.decision === "cached") {
      const cached = await loadAiSummaryByHash(
        admin,
        data.content_type,
        data.content_id,
        locale,
        sourceHash,
      );
      if (cached) {
        return {
          state: "ready" as const,
          contentType: data.content_type,
          contentId: data.content_id,
          locale,
          summary: aiSummaryView(cached),
        };
      }
      return ev.fail(409, {
        state: "error" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        message: "El resumen cambió mientras lo cargábamos. Probá de nuevo.",
      });
    }

    if (decision.decision === "pending") {
      return ev.fail(409, {
        state: "pending" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        retryAfter: decision.retry_after_seconds,
        message:
          "Este resumen ya se está generando. Volvé a intentar en un momento.",
      });
    }

    if (decision.decision === "rate_limited") {
      return ev.fail(429, {
        state: "rate_limited" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        retryAfter: decision.retry_after_seconds,
        message:
          "Alcanzaste el límite temporal de resúmenes. Probá de nuevo más tarde.",
      });
    }

    const leaseToken = decision.lease_token;
    if (!leaseToken) {
      return ev.fail(503, {
        state: "error" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        message: "No pudimos iniciar el resumen. Probá de nuevo.",
      });
    }

    try {
      const generated = await requestOpenAiSummary(source, locale, {
        apiKey,
        model,
        safetyIdentifier: await hashSafetyIdentifier(viewer.userId),
      });

      // El contenido puede editarse mientras esperamos al proveedor. Nunca se
      // completa el lease H con una salida producida desde una fuente ya vieja.
      const latestSource = await collectAiSummarySource(
        userDb,
        data.content_type,
        data.content_id,
      );
      const latestHash = latestSource
        ? await hashAiSummarySource(latestSource)
        : null;
      if (latestHash !== sourceHash) {
        await admin.rpc("fail_ai_summary_generation", {
          p_lease_token: leaseToken,
          p_error_code: "source_changed",
        });
        return ev.fail(409, {
          state: "error" as const,
          contentType: data.content_type,
          contentId: data.content_id,
          locale,
          message:
            "El contenido cambió durante la generación. Volvé a intentarlo.",
        });
      }

      const { data: completed, error: completeError } = await admin.rpc(
        "complete_ai_summary_generation",
        {
          p_content_type: data.content_type,
          p_content_id: data.content_id,
          p_locale: locale,
          p_source_hash: sourceHash,
          p_lease_token: leaseToken,
          p_summary: generated.summary,
          p_key_points: generated.keyPoints,
          p_prompt_version: AI_SUMMARY_PROMPT_VERSION,
          p_model: model,
          p_includes_poll_results: false,
        },
      );
      if (completeError || !completed) {
        throw new AiSummaryGenerationError("provider");
      }

      const stored = await loadAiSummaryByHash(
        admin,
        data.content_type,
        data.content_id,
        locale,
        sourceHash,
      );
      if (!stored) throw new AiSummaryGenerationError("provider");
      return {
        state: "ready" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        summary: aiSummaryView(stored),
      };
    } catch (error) {
      await admin.rpc("fail_ai_summary_generation", {
        p_lease_token: leaseToken,
        p_error_code:
          error instanceof AiSummaryGenerationError
            ? error.kind
            : "generation_failed",
      });
      return ev.fail(502, {
        state: "error" as const,
        contentType: data.content_type,
        contentId: data.content_id,
        locale,
        message:
          error instanceof AiSummaryGenerationError &&
          error.kind === "invalid_output"
            ? "La IA devolvió un resumen inválido. Probá de nuevo."
            : "No pudimos generar el resumen. Probá de nuevo.",
      });
    }
  },
  zod$({
    content_type: contentTypeSchema,
    content_id: z.string().uuid(),
  }),
);
