import type { RequestEventBase, RequestEventLoader } from "@qwik.dev/router";
import { globalAction$, zod$, z } from "@qwik.dev/router";
import { collectionLimits } from "./form-collection-limits";
import type { CommunityRef } from "./community";
import { ancestorPaths, routes } from "./community";
import type { ContentType } from "./database.types.helpers";
import { claimDraftMediaUrl, isOwnedClaimDraftUploadPath } from "./claim-media";
import {
  LOAD_FAILED,
  MAX_CLAIM_IMAGES,
  MAX_POLL_OPTIONS,
  MAX_CLAIM_IMAGE_BYTES,
} from "./constants";
import { isRlsViolation, participationBlockMessage } from "./db-error";
import {
  hasAnyLocationCoordinate,
  toPublicLocationPoint,
} from "./geolocation-privacy";
import { resolveLocale, translate } from "./i18n";
import { safeInternalPath } from "./http";
import {
  isQuotaError,
  quotaErrorMessage,
  quotaFor,
  loadQuotaSummary,
} from "./quota";
import {
  getViewer,
  requireResident,
  supabase,
  viewerIsMember,
} from "./session";
import { createAdminSupabase } from "./supabase";
import { uploadImages } from "./uploads";
import { publicationResult } from "./content-publication";
import { timeZoneOf } from "./timezone";
import { publicationInstant, publicationTimeError } from "./publication-time";
import {
  parseProjectBudgetInput,
  projectBudgetExample,
  projectBudgetInputMessage,
} from "./project-budget-input";
import {
  publicationBlockReason,
  publicationChooserHref,
} from "./publication-eligibility";

/**
 * Contexto común de las cuatro pantallas de creación: dónde se publica, la
 * cadena para el breadcrumb, y cuánto cupo queda en cada nivel.
 */
export async function loadCreateContext(
  ev: RequestEventLoader,
  type: ContentType,
) {
  const viewer = await requireResident(ev);
  const db = supabase(ev);

  const { data: community, error: communityError } = await db
    .from("communities")
    .select("id, slug, name, emoji, level, path")
    .eq("slug", ev.params.slug)
    .maybeSingle();

  // Un fallo de la consulta no es una comunidad inexistente. Acá el 404 era
  // además especialmente confuso: la persona venía de tocar "Crear" dentro de
  // esa misma comunidad, así que "no existe" contradecía la página anterior.
  if (communityError) {
    throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
  }

  if (!community) {
    throw ev.error(
      404,
      translate(resolveLocale(ev.locale()), "No encontramos esa comunidad."),
    );
  }

  const [{ data: chain }, { count: childCount }] = await Promise.all([
    db
      .from("communities")
      .select("id, slug, name, emoji, level, path")
      .in("path", ancestorPaths(community.path))
      .order("level", { ascending: true }),
    db
      .from("communities")
      .select("*", { count: "exact", head: true })
      .eq("parent_id", community.id),
  ]);

  const summary = await loadQuotaSummary(ev, viewer.userId);
  const isMember = viewerIsMember(viewer, community.path);
  if (
    ev.request.method === "GET" &&
    publicationBlockReason(isMember, summary, community.slug, type)
  ) {
    // Antes se podían completar todos los pasos de un formulario que la base
    // iba a rechazar. El selector conserva tipo y destino y ofrece alternativas.
    // Después de un POST conservamos el resultado de la action: publicar el
    // último cupo no debe perder su recibo al volver a ejecutar los loaders.
    throw ev.redirect(302, publicationChooserHref(community.slug, type));
  }

  return {
    draftOwnerId: viewer.userId,
    community: community as CommunityRef,
    chain: (chain ?? []) as CommunityRef[],
    childCount: childCount ?? 0,
    summary,
    isMember,
    quota: quotaFor(summary, community.slug, type),
  };
}

/** Qué se sabe del rechazo además del código, cuando el código no alcanza. */
type DenialReason = "not-member" | "no-children";

/**
 * Convierte los errores de la base en mensajes accionables en el idioma
 * activo.
 *
 * Recibe el error entero y no sólo `message` porque la decisión se toma sobre
 * `code`; el mensaje queda para el único caso en que la cadena la escribimos
 * nosotros.
 */
function contentErrorMessage(
  error: { message?: string; code?: string },
  type: ContentType,
  communityName: string,
  locale: ReturnType<typeof resolveLocale>,
  /**
   * Por qué rechazó RLS, cuando el llamador pudo averiguarlo. Sin esto se
   * asume "no reside acá", que es el motivo de lejos más frecuente.
   */
  reason: DenialReason = "not-member",
): string {
  // El texto de cupo agotado lo arma `quota.ts`, que es donde vive la fecha de
  // renovación. Estaba copiado acá palabra por palabra y sólo una de las dos
  // copias se usaba: cualquier ajuste de redacción salía a medias.
  //
  // Éste sí se reconoce por el mensaje, y a propósito: `GEOUNITY_QUOTA_EXCEEDED`
  // es un centinela que emite `enforce_content_quota`, no prosa de Postgres, y
  // por lo tanto no depende del locale del servidor. El `errcode` que usa el
  // `raise` es `check_violation`, que comparte con constraints como
  // `polls_after_close_needs_date`: el código no distingue, el centinela sí.
  if (isQuotaError(error.message ?? "")) {
    return quotaErrorMessage(type, communityName, locale);
  }

  const blocked = participationBlockMessage(error);
  if (blocked) return translate(locale, blocked);

  if (isRlsViolation(error)) {
    // Un debate sin sub-comunidades no es un problema de permisos, pero lo
    // rechaza la misma policy —`debates_insert_member` exige a la vez residir
    // ahí y que la comunidad tenga hijas—, así que llega con el mismo 42501.
    if (reason === "no-children") {
      return translate(
        locale,
        "Esta comunidad no tiene sub-comunidades, así que un debate no tendría columnas.",
      );
    }
    return translate(
      locale,
      "Sólo pueden publicar en {{name}} quienes viven ahí.",
      {
        name: communityName,
      },
    );
  }

  return translate(
    locale,
    "No pudimos publicar. Probá de nuevo en un momento.",
  );
}

/**
 * Distingue los dos motivos por los que `debates_insert_member` puede
 * rechazar: no residir en la comunidad, o que la comunidad no tenga
 * sub-comunidades con las que armar las columnas de la grilla.
 *
 * La policy los une en un solo `with check`, así que Postgres devuelve el
 * mismo 42501 para ambos y hay que preguntar. Se consulta **sólo** cuando la
 * publicación ya falló por RLS: en el camino feliz no cuesta nada, y el
 * formulario normalmente evita este caso mostrando el aviso con `childCount`
 * de `loadCreateContext`. Queda para quien llega por la API o para la
 * comunidad que perdió su última hija entre que se abrió el formulario y se
 * envió.
 *
 * Si la consulta falla se cae a "no reside acá", que es el motivo más común.
 */
async function debateDenialReason(
  db: ReturnType<typeof supabase>,
  error: { code?: string },
  communityId: string,
): Promise<DenialReason> {
  if (!isRlsViolation(error)) return "not-member";
  const { count, error: countError } = await db
    .from("communities")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", communityId);
  if (countError) return "not-member";
  return (count ?? 0) === 0 ? "no-children" : "not-member";
}

/** Resuelve la comunidad destino y verifica que el usuario resida ahí. */
async function resolveTarget(ev: RequestEventBase, slug: string) {
  // `supabase(ev)` y no `createServerSupabase(ev)`: las cuatro actions llaman a
  // `getViewer()` justo antes, que ya dejó un cliente en el `sharedMap`. Crear
  // otro montaba un segundo adaptador de cookies sobre la misma petición.
  const db = supabase(ev);
  const { data } = await db
    .from("communities")
    .select("id, name, slug, level")
    .eq("slug", slug)
    .maybeSingle();
  return { db, community: data };
}

// =============================================================================
// Encuesta
// =============================================================================
export const useCreatePoll = globalAction$(
  async (data, ev) => {
    const locale = resolveLocale(ev.locale());
    const viewer = await getViewer(ev);
    const userId = viewer.userId;
    if (!userId) {
      throw ev.redirect(
        302,
        `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
      );
    }

    const options = (
      Array.isArray(data.options) ? data.options : [data.options]
    )
      .map((o) => (o ?? "").trim())
      .filter(Boolean);

    if (options.length < 2) {
      return ev.fail(400, {
        message: "Una encuesta necesita al menos 2 opciones.",
      });
    }
    if (options.length > MAX_POLL_OPTIONS) {
      return ev.fail(400, { message: "Máximo 10 opciones." });
    }
    // El `maxLength` del formulario es una sugerencia del navegador, y el
    // esquema Zod no mira las opciones una por una porque llegan como array.
    // La base sí lo comprueba (`poll_options_label_len_chk`, 1..120), así que
    // una opción larga terminaba en un error de constraint traducido a "No
    // pudimos publicar. Probá de nuevo en un momento.": no decía qué campo era
    // ni que reintentar no iba a servir.
    if (options.some((option) => option.length > 120)) {
      return ev.fail(400, {
        message: "Cada opción puede tener hasta 120 caracteres.",
      });
    }
    if (data.type === "binary" && options.length !== 2) {
      return ev.fail(400, {
        message: "Una encuesta binaria tiene exactamente 2 opciones.",
      });
    }
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      return ev.fail(400, { message: "Hay opciones repetidas." });
    }

    if (!data.closes_at)
      return ev.fail(400, {
        message:
          "La encuesta necesita una fecha de cierre para proteger los resultados.",
      });
    const timeZone = data.time_zone ?? timeZoneOf(ev);
    const closing = publicationInstant(data.closes_at, timeZone);
    if (!closing.valid)
      return ev.fail(400, { message: publicationTimeError(closing.reason) });
    const closesAt = new Date(closing.iso);
    if (closesAt.getTime() <= Date.now())
      return ev.fail(400, {
        message: "La fecha de cierre tiene que ser futura.",
      });

    const maxChoices =
      data.type === "multiple" && data.max_choices
        ? Number(data.max_choices)
        : null;
    // `Number.isInteger` y no `< 1 || > length`: con un valor no numérico esto
    // daba `NaN`, las dos comparaciones daban `false` —ninguna comparación con
    // `NaN` es verdadera— y el `NaN` seguía viaje hasta el insert, donde se
    // serializa como `null` y choca contra `polls_max_choices_chk`. El usuario
    // veía "No pudimos publicar" sin saber qué corregir. Un decimal como "2.5"
    // pasaba igual y llegaba a una columna `smallint`.
    if (
      maxChoices !== null &&
      (!Number.isInteger(maxChoices) ||
        maxChoices < 1 ||
        maxChoices > options.length)
    ) {
      return ev.fail(400, {
        message:
          "El máximo de opciones no puede superar la cantidad de opciones.",
      });
    }

    if (data.edit === "si") return { editing: true as const };

    // Fase 1: se devuelve la vista previa sin tocar la base.
    if (data.confirm !== "si") {
      return {
        preview: {
          ...data,
          options,
          maxChoices,
          time_zone: timeZone,
          closes_at_utc: closing.iso,
        },
      };
    }

    const { db, community } = await resolveTarget(ev, data.community_slug);
    if (!community)
      return ev.fail(404, { message: "Esa comunidad no existe." });

    const { data: pollId, error } = await db.rpc("create_poll_with_options", {
      p_community: community.id,
      p_question: data.question,
      p_description: data.description?.trim() || "",
      p_type: data.type,
      p_category: data.category,
      p_max_choices: maxChoices ?? 0,
      p_results_visibility: "after_close",
      p_closes_at: closesAt.toISOString(),
      p_options: options,
    });

    if (error) {
      return ev.fail(400, {
        message: contentErrorMessage(error, "poll", community.name, locale),
      });
    }

    if (!pollId) {
      return ev.fail(400, {
        message: "No pudimos publicar. Probá de nuevo en un momento.",
      });
    }

    return publicationResult(ev, routes.poll(pollId));
  },
  zod$({
    community_slug: z.string().min(1),
    confirm: z.string().optional(),
    edit: z.literal("si").optional(),
    question: z
      .string()
      .trim()
      .min(3, "Mínimo 3 caracteres.")
      .max(300, "Máximo 300 caracteres."),
    description: z
      .string()
      .trim()
      .max(1000, "Máximo 1000 caracteres.")
      .optional(),
    type: z.enum(["single", "multiple", "binary"]),
    category: z.enum([
      "comunidad",
      "ambiente",
      "salud",
      "educacion",
      "transporte",
      "cultura",
      "deportes",
      "economia",
      "tecnologia",
      "seguridad",
    ]),
    results_visibility: z.literal("after_close"),
    closes_at: z.string().optional(),
    time_zone: z.string().min(1).max(100).optional(),
    max_choices: z.string().optional(),
    options: z.union([z.string(), z.array(z.string())]),
  }),
  // Va después de zod$ para correr antes (D100).
  collectionLimits({ options: MAX_POLL_OPTIONS }),
);

// =============================================================================
// Debate
// =============================================================================
export const useCreateDebate = globalAction$(
  async (data, ev) => {
    const locale = resolveLocale(ev.locale());
    const viewer = await getViewer(ev);
    if (!viewer.userId) {
      throw ev.redirect(
        302,
        `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
      );
    }

    if (data.edit === "si") return { editing: true as const };
    if (data.confirm !== "si") {
      return { preview: { ...data } };
    }

    const { db, community } = await resolveTarget(ev, data.community_slug);
    if (!community)
      return ev.fail(404, { message: "Esa comunidad no existe." });

    const { data: debate, error } = await db
      .from("debates")
      .insert({
        community_id: community.id,
        author_id: viewer.userId,
        title: data.title,
        body: data.body,
      })
      .select("id")
      .single();

    if (error) {
      return ev.fail(400, {
        message: contentErrorMessage(
          error,
          "debate",
          community.name,
          locale,
          await debateDenialReason(db, error, community.id),
        ),
      });
    }

    return publicationResult(ev, routes.debate(debate.id));
  },
  zod$({
    community_slug: z.string().min(1),
    confirm: z.string().optional(),
    edit: z.literal("si").optional(),
    title: z
      .string()
      .trim()
      .min(3, "Mínimo 3 caracteres.")
      .max(200, "Máximo 200 caracteres."),
    body: z
      .string()
      .trim()
      .min(1, "Contá de qué se trata.")
      .max(4000, "Máximo 4000 caracteres."),
  }),
);

// =============================================================================
// Reclamo
// =============================================================================
export const useCreateClaim = globalAction$(
  async (data, ev) => {
    const locale = resolveLocale(ev.locale());
    const viewer = await getViewer(ev);
    const userId = viewer.userId;
    if (!userId) {
      throw ev.redirect(
        302,
        `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
      );
    }

    /**
     * La coordenada exacta no debe sobrevivir ni siquiera hasta la vista
     * previa. Se valida y cuantiza antes de subir archivos; la migración 0040
     * repite la operación como garantía autoritativa para cualquier cliente.
     */
    const hasCoordinates = hasAnyLocationCoordinate(data.lat, data.lng);
    const point = toPublicLocationPoint(data.lat, data.lng);
    if (hasCoordinates && !point) {
      return ev.fail(400, {
        message: translate(
          locale,
          "No pudimos validar esa ubicación. Volvé a marcarla o publicá el reclamo sin coordenadas.",
        ),
      });
    }

    // Los archivos no sobreviven al round-trip de confirmación. Se suben en la
    // primera fase, se registran como provisionales y el trigger los vincula al
    // reclamo al publicar; el cron elimina los abandonados después de 24 h.
    const { db, community } = await resolveTarget(ev, data.community_slug);
    if (!community)
      return ev.fail(404, { message: "Esa comunidad no existe." });

    const asArray = (value: string | string[] | undefined) =>
      (Array.isArray(value) ? value : value ? [value] : [])
        .map((item) => item.trim())
        .filter(Boolean);

    let imagePaths = asArray(data.image_paths);

    if (
      new Set(imagePaths).size !== imagePaths.length ||
      imagePaths.some((path) => !isOwnedClaimDraftUploadPath(path, userId))
    ) {
      return ev.fail(400, {
        message:
          "No pudimos verificar las imágenes adjuntas. Volvé a subirlas.",
      });
    }
    if (imagePaths.length > MAX_CLAIM_IMAGES) {
      return ev.fail(400, {
        message: translate(locale, "Podés adjuntar hasta {{count}} imágenes.", {
          count: MAX_CLAIM_IMAGES,
        }),
      });
    }

    if (imagePaths.length > 0) {
      // Los inputs ocultos son datos del cliente. Se verifica que cada path
      // siga pendiente y pertenezca a la sesión, y las URLs se vuelven a
      // derivar en servidor: `image_urls` jamás decide qué queda publicado.
      const { data: tracked, error: trackingError } = await db
        .from("claim_uploads")
        .select("path")
        .eq("owner_id", userId)
        .is("claim_id", null)
        .is("cleanup_started_at", null)
        .not("upload_completed_at", "is", null)
        .in("path", imagePaths);
      if (trackingError || tracked?.length !== imagePaths.length) {
        return ev.fail(400, {
          message:
            "No pudimos verificar las imágenes adjuntas. Volvé a subirlas.",
        });
      }
    } else {
      const uploaded = await uploadImages(
        // Evidencia pasa por el servidor: sólo este cliente confiable puede
        // reservar y escribir en el bucket privado después del saneamiento de
        // bytes. El JWT de usuario no tiene INSERT en Storage de claims.
        createAdminSupabase(ev),
        "claims",
        userId,
        data.images,
        MAX_CLAIM_IMAGE_BYTES,
        MAX_CLAIM_IMAGES,
        locale,
      );
      if (uploaded.error) return ev.fail(400, { message: uploaded.error });

      imagePaths = uploaded.uploads.map((upload) => upload.path);
    }

    // El bucket es privado. La preview pasa por una ruta autenticada y las
    // URLs públicas definitivas las deriva el trigger recién al publicar.
    const imageUrls = imagePaths.map(claimDraftMediaUrl);
    if (imageUrls.some((url) => !url)) {
      return ev.fail(400, {
        message:
          "No pudimos verificar las imágenes adjuntas. Volvé a subirlas.",
      });
    }
    const previewUrls = imageUrls as string[];

    if (data.edit === "si") return { editing: true as const };
    if (data.confirm !== "si") {
      return {
        preview: {
          community_slug: data.community_slug,
          title: data.title,
          description: data.description,
          category: data.category,
          // La ubicación tiene que sobrevivir al round-trip de confirmación
          // como el resto: el paso de revisión reenvía todo por campos ocultos
          // y lo que no viaje acá se pierde entre "Revisar" y "Publicar".
          location_text: data.location_text ?? "",
          lat: point ? String(point.lat) : "",
          lng: point ? String(point.lng) : "",
          image_urls: previewUrls,
          image_paths: imagePaths,
        },
      };
    }

    const { data: claim, error } = await db
      .from("claims")
      .insert({
        community_id: community.id,
        author_id: userId,
        title: data.title,
        description: data.description,
        category: data.category,
        location_text: data.location_text?.trim() || null,
        // Los dos o ninguno: la base lo exige con `claims_coords_pair_chk`, y
        // media coordenada no ubicaría nada igual.
        lat: point ? point.lat : null,
        lng: point ? point.lng : null,
        // Placeholders privados con la cardinalidad correcta. El trigger DB
        // los reemplaza por `/media/reclamos/<claim>/<archivo>` en la misma
        // transacción y jamás publica el path físico de Storage.
        image_url: previewUrls[0] ?? null,
        image_urls: previewUrls,
        image_paths: imagePaths,
      })
      .select("id")
      .single();

    if (error) {
      return ev.fail(400, {
        message: contentErrorMessage(error, "claim", community.name, locale),
      });
    }

    return publicationResult(ev, routes.claim(claim.id));
  },
  zod$({
    community_slug: z.string().min(1),
    confirm: z.string().optional(),
    edit: z.literal("si").optional(),
    title: z
      .string()
      .trim()
      .min(3, "Mínimo 3 caracteres.")
      .max(150, "Máximo 150 caracteres."),
    description: z
      .string()
      .trim()
      .min(1, "Contá qué está pasando.")
      .max(2000, "Máximo 2000 caracteres."),
    category: z.enum([
      "infraestructura",
      "servicios",
      "seguridad",
      "salud",
      "educacion",
      "ambiente",
      "transporte",
      "otro",
    ]),
    location_text: z
      .string()
      .trim()
      .max(200, "Máximo 200 caracteres.")
      .optional(),
    // Llegan como texto desde inputs ocultos que llena el navegador. Se
    // validan igual que cualquier otra entrada: el rango real lo vuelve a
    // comprobar la base, pero un `NaN` acá se convertiría en `null` sin que
    // nadie se entere de que la ubicación se perdió.
    lat: z.string().max(32).optional(),
    lng: z.string().max(32).optional(),
    images: z.any().optional(),
    image_paths: z.union([z.string(), z.array(z.string())]).optional(),
  }),
  // Va después de zod$ para correr antes (D100).
  collectionLimits({ image_paths: MAX_CLAIM_IMAGES }),
);

// =============================================================================
// Proyecto
// =============================================================================
export const useCreateProject = globalAction$(
  async (data, ev) => {
    const locale = resolveLocale(ev.locale());
    const viewer = await getViewer(ev);
    if (!viewer.userId) {
      throw ev.redirect(
        302,
        `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
      );
    }

    const budget = parseProjectBudgetInput(
      String(data.budget_amount ?? ""),
      typeof data.budget_amount === "number" ? "en" : data.budget_locale,
    );
    if (!budget.valid) {
      const fieldErrors: Record<string, string> = {
        budget_amount: translate(
          locale,
          projectBudgetInputMessage(budget.reason),
          { example: projectBudgetExample(data.budget_locale) },
        ),
      };
      return ev.fail(400, { fieldErrors });
    }

    if (data.edit === "si") return { editing: true as const };
    if (data.confirm !== "si") {
      return {
        preview: {
          ...data,
          budget_input: String(data.budget_amount ?? ""),
          budget_amount: budget.amount ?? undefined,
        },
      };
    }

    const { db, community } = await resolveTarget(ev, data.community_slug);
    if (!community)
      return ev.fail(404, { message: "Esa comunidad no existe." });

    const { data: projectId, error } = await db.rpc(
      "create_project_with_relation",
      {
        p_community: community.id,
        p_title: data.title,
        p_summary: data.summary,
        p_plan: data.plan,
        p_budget_amount: budget.amount ?? 0,
        p_currency: data.currency,
        p_resources_needed: data.resources_needed?.trim() || "",
        p_time_estimate: data.time_estimate?.trim() || "",
        p_source_claim: data.source_claim_id || "",
      },
    );

    if (error) {
      return ev.fail(400, {
        message: contentErrorMessage(error, "project", community.name, locale),
      });
    }

    if (!projectId) {
      return ev.fail(400, {
        message: "No pudimos publicar. Probá de nuevo en un momento.",
      });
    }

    return publicationResult(ev, routes.project(projectId));
  },
  zod$({
    community_slug: z.string().min(1),
    confirm: z.string().optional(),
    edit: z.literal("si").optional(),
    title: z
      .string()
      .trim()
      .min(3, "Mínimo 3 caracteres.")
      .max(150, "Máximo 150 caracteres."),
    summary: z
      .string()
      .trim()
      .min(1, "Resumí el proyecto en una o dos frases.")
      .max(300, "Máximo 300 caracteres."),
    plan: z
      .string()
      .trim()
      .min(1, "Explicá cómo se llevaría a cabo.")
      .max(5000, "Máximo 5000 caracteres."),
    budget_amount: z
      .union([
        z
          .string()
          .max(
            64,
            "El presupuesto admite hasta 12 cifras enteras y 2 decimales.",
          ),
        z.number(),
      ])
      .optional(),
    budget_locale: z.enum(["es", "en"]).default("en"),
    edit_budget_amount: z.string().max(64).optional(),
    edit_budget_locale: z.enum(["es", "en"]).optional(),
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Usá el código de 3 letras, como ARS o USD.")
      .default("ARS"),
    resources_needed: z
      .string()
      .trim()
      .max(1000, "Máximo 1000 caracteres.")
      .optional(),
    time_estimate: z
      .string()
      .trim()
      .max(120, "Máximo 120 caracteres.")
      .optional(),
    source_claim_id: z.string().uuid().optional().or(z.literal("")),
  }),
);

// =============================================================================
// Baja del propio contenido (devuelve cupo si es dentro de 24 horas)
// =============================================================================
export const useRemoveOwnContent = globalAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) {
      throw ev.redirect(302, "/ingresar");
    }

    const db = supabase(ev);
    // La fila removida deja de ser visible por RLS en la misma transición. La
    // RPC verifica autor e ID antes de actualizarla y devuelve si tocó una fila
    // exacta; el trigger `stamp_removal` sigue sellando quién y cuándo.
    const { data: removed, error } = await db.rpc("remove_own_content", {
      p_type: data.type,
      p_id: data.id,
    });

    if (error || !removed) {
      return ev.fail(400, { message: "No pudimos dar de baja el contenido." });
    }

    // Quedarse en la página de algo que se acaba de bajar no es una opción: la
    // fila deja de ser visible y el primer refresco daría 404. Se vuelve al
    // listado de la comunidad, que es de donde se llegó. Sólo rutas internas:
    // `back` viaja en el formulario y no se confía en él.
    const back = safeInternalPath(data.back);
    throw ev.redirect(302, back);
  },
  zod$({
    type: z.enum(["poll", "debate", "claim", "project"]),
    id: z.string().uuid(),
    back: z.string().optional(),
  }),
);

/**
 * Cerrar una encuesta antes de su fecha.
 *
 * La base ya lo soportaba desde siempre —`status` acepta `'closed'` y la
 * policy `polls_update_own_or_mod` deja al autor y a moderación tocar la
 * fila—, pero no había interfaz. La acción permite terminar antes de la fecha
 * obligatoria cuando la ronda ya cumplió su objetivo.
 *
 * Es de una sola dirección: no hay reabrir. En una encuesta con
 * `results_visibility = 'after_close'`, cerrar puede revelar el recuento si se
 * alcanzó el mínimo de cinco. Reabrirla permitiría comparar dos agregados y
 * aislar una participación nueva; 0047 también lo prohíbe en la base.
 */
export const useClosePoll = globalAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) {
      throw ev.redirect(
        302,
        `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
      );
    }

    const db = supabase(ev);
    // `eq("status", "active")` además de la policy: si dos pestañas mandan el
    // cierre a la vez, la segunda no toca ninguna fila en vez de reescribir
    // una encuesta ya cerrada. Quién puede hacerlo lo decide RLS.
    const { data: closed, error } = await db
      .from("polls")
      .update({ status: "closed" })
      .eq("id", data.id)
      .eq("status", "active")
      .select("id")
      .maybeSingle();

    if (error || !closed) {
      return ev.fail(400, {
        message: "No pudimos cerrar la encuesta. Puede que ya esté cerrada.",
      });
    }

    return { closed: true as const };
  },
  zod$({ id: z.string().uuid() }),
);
