import type { RequestEventBase } from "@qwik.dev/router";
import type { ContentType } from "./database.types.helpers";
import { supabase } from "./session";
import { DEFAULT_LOCALE, localeTag, translate, type Locale } from "./i18n";
import { logFailure } from "./log";

/** Metadatos de presentación de cada tipo de contenido que consume cuota. */
export const CONTENT_TYPES: Record<
  ContentType,
  {
    singular: string;
    plural: string;
    emoji: string;
    tab: string;
    newPath: string;
    article: "un" | "una";
  }
> = {
  poll: {
    singular: "encuesta",
    plural: "encuestas",
    emoji: "🗳️",
    tab: "encuestas",
    newPath: "encuestas/nueva",
    article: "una",
  },
  debate: {
    singular: "debate",
    plural: "debates",
    emoji: "💬",
    tab: "debates",
    newPath: "debates/nuevo",
    article: "un",
  },
  claim: {
    singular: "reclamo",
    plural: "reclamos",
    emoji: "📣",
    tab: "reclamos",
    newPath: "reclamos/nuevo",
    article: "un",
  },
  project: {
    singular: "proyecto",
    plural: "proyectos",
    emoji: "🛠️",
    tab: "proyectos",
    newPath: "proyectos/nuevo",
    article: "un",
  },
};

export const CONTENT_TYPE_ORDER: ContentType[] = [
  "poll",
  "debate",
  "claim",
  "project",
];

export interface QuotaEntry {
  level: number;
  communityId: string;
  communitySlug: string;
  communityName: string;
  communityEmoji: string | null;
  contentType: ContentType;
  /** `null` = sin tope (moderación o nivel sin configurar). */
  monthlyLimit: number | null;
  remaining: number | null;
}

export interface QuotaSummary {
  entries: QuotaEntry[];
  /** El usuario no tiene tope en ningún nivel (moderación). */
  unlimited: boolean;
  /**
   * No se pudo averiguar el cupo. **No** es lo mismo que no tener cupo.
   *
   * Sin esta distinción, un fallo de un segundo en `quota_summary` producía
   * `entries: []`, y de ahí `CreateButton` deducía `remaining = 0, limit = 0`
   * y anunciaba en un cartel naranja "Agotaste tus 0 encuestas de este mes en
   * Mar del Plata. Se renueva el 1 de septiembre." Una prohibición inventada,
   * con un número imposible, sobre la acción central de la app.
   *
   * Con el tercer estado la interfaz puede decir que no sabe y dejar intentar:
   * el tope real lo impone `enforce_content_quota` en la base, así que ofrecer
   * el botón no arriesga nada —si de verdad no queda cupo, la action devuelve
   * el mensaje correcto, con su fecha de renovación y su alternativa.
   */
  unavailable: boolean;
}

/** No hay cupo que mostrar porque no hay sesión, o no eligió residencia. */
export const EMPTY_QUOTA: QuotaSummary = {
  entries: [],
  unlimited: false,
  unavailable: false,
};

/** La consulta falló: no sabemos cuánto cupo queda. Ver `unavailable`. */
export const UNAVAILABLE_QUOTA: QuotaSummary = {
  entries: [],
  unlimited: false,
  unavailable: true,
};

/**
 * Toda la grilla de cuotas del usuario en una sola llamada.
 *
 * La calcula `quota_summary()` en la base, que es la misma función que alimenta
 * al trigger: la UI y la restricción no pueden desincronizarse.
 */
export async function loadQuotaSummary(
  ev: RequestEventBase,
  userId: string | null,
): Promise<QuotaSummary> {
  if (!userId) return EMPTY_QUOTA;

  const { data, error } = await supabase(ev).rpc("quota_summary", {
    p_user: userId,
  });
  // Sin cupo, la interfaz deshabilita los cuatro botones de crear y explica
  // que no se puede publicar en ningún lado. Descartar el error convertía un
  // fallo de un segundo en esa afirmación, que es de las pocas que hacen
  // abandonar la página. Por eso no alcanza con dejar rastro en los logs: el
  // llamador tiene que poder distinguir "no te queda cupo" de "no sé".
  if (error) {
    logFailure({ scope: "cuota/resumen", userId }, error);
    return UNAVAILABLE_QUOTA;
  }
  const rows = data ?? [];

  const entries: QuotaEntry[] = rows.map((r) => ({
    level: r.level,
    communityId: r.community_id,
    communitySlug: r.community_slug,
    communityName: r.community_name,
    communityEmoji: r.community_emoji,
    contentType: r.content_type as ContentType,
    monthlyLimit: r.monthly_limit,
    remaining: r.remaining,
  }));

  return {
    entries,
    unlimited: entries.length > 0 && entries.every((e) => e.remaining === null),
    unavailable: false,
  };
}

/** La cuota de un tipo en una comunidad concreta, o `null` si no aplica. */
export function quotaFor(
  summary: QuotaSummary,
  communitySlug: string,
  type: ContentType,
): QuotaEntry | null {
  return (
    summary.entries.find(
      (e) => e.communitySlug === communitySlug && e.contentType === type,
    ) ?? null
  );
}

/*
 * Acá vivía `canCreate(summary, slug, type): boolean`. No lo llamaba nadie:
 * `CreateButton` —el único lugar que decide si se puede publicar— necesita
 * distinguir tres casos (sin tope, con cupo, agotado) para elegir qué badge y
 * qué texto mostrar, así que trabaja con `quotaFor` directamente. Un booleano
 * exportado que aparenta ser *la* comprobación de permiso, sin ningún llamador
 * que lo mantenga honesto, es una trampa para el próximo que lo encuentre. La
 * autorización real está en RLS.
 */

/**
 * Otros niveles de la cadena donde al usuario sí le queda cupo de ese tipo.
 * Es lo que permite decirle "todavía podés crear una en Buenos Aires" en vez de
 * dejarlo con un botón gris y sin salida.
 */
export function alternativesWithQuota(
  summary: QuotaSummary,
  type: ContentType,
  excludeSlug: string,
): QuotaEntry[] {
  return summary.entries
    .filter(
      (e) =>
        e.contentType === type &&
        e.communitySlug !== excludeSlug &&
        (e.remaining === null || e.remaining > 0),
    )
    .sort((a, b) => b.level - a.level); // el nivel más específico primero
}

/** Primer día del mes que viene: cuándo se renueva la cuota. */
export function nextRenewal(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

export function nextRenewalLabel(
  locale: Locale = DEFAULT_LOCALE,
  now: Date = new Date(),
): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(nextRenewal(now));
}

/**
 * Traduce el error del trigger a algo que una persona pueda accionar.
 * El prefijo lo emite `enforce_content_quota`.
 */
export function isQuotaError(message: string): boolean {
  return message.includes("GEOUNITY_QUOTA_EXCEEDED");
}

export function quotaErrorMessage(
  type: ContentType,
  communityName: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const meta = CONTENT_TYPES[type];
  return `${translate(
    locale,
    "Agotaste tu cupo mensual de {{type}} en {{name}}.",
    {
      type: translate(locale, meta.plural),
      name: communityName,
    },
  )} ${translate(locale, "Se renueva el {{date}}.", {
    date: nextRenewalLabel(locale),
  })}`;
}
