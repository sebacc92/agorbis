import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Badge, ButtonLink, Icon, cx } from "~/components/ui";
import { routes } from "~/lib/community";
import type { ContentType } from "~/lib/database.types.helpers";
import {
  alternativesWithQuota,
  CONTENT_TYPES,
  nextRenewalLabel,
  quotaFor,
  type QuotaSummary,
} from "~/lib/quota";
import { useLocale, translate } from "~/lib/i18n";

/**
 * Botón de crear con el cupo al lado.
 *
 * Los estados que importan:
 *   · con cupo    → botón primario + "te quedan N de M este mes"
 *   · sin cupo    → botón inhabilitado + cuándo se renueva + **dónde sí podés**
 *   · no residís  → explicación, sin botón muerto
 *   · no se sabe  → botón normal + aviso de que no pudimos consultarlo
 *
 * El del medio es el que evita el callejón sin salida: decirle a alguien "no
 * podés" sin ofrecerle la alternativa que sí tiene disponible es gratis para
 * nosotros y frustrante para él.
 *
 * El último es el que faltaba, y es distinto de "sin cupo" justamente porque
 * ahí no sabemos nada: ver `QuotaSummary.unavailable`.
 */
export const CreateButton = component$<{
  type: ContentType;
  communitySlug: string;
  communityName: string;
  summary: QuotaSummary;
  isMember: boolean;
  isAuthenticated: boolean;
  /** En el estado vacío el botón va más grande. */
  size?: "sm" | "md" | "lg";
}>(
  ({
    type,
    communitySlug,
    communityName,
    summary,
    isMember,
    isAuthenticated,
    size = "sm",
  }) => {
    const locale = useLocale();
    const meta = CONTENT_TYPES[type];
    const href = routes.newContent(communitySlug, meta.newPath);

    // Sin sesión, la cabecera de la comunidad ya pide crear la cuenta con
    // su botón primario: este llamado es el segundo en la misma pantalla y
    // va en secundario para no competir (D125).
    if (!isAuthenticated) {
      return (
        <ButtonLink
          href={`/ingresar?next=${encodeURIComponent(href)}`}
          size={size}
          variant="secondary"
        >
          {translate(locale, "Ingresá para crear {{article}} {{type}}", {
            article: translate(locale, meta.article),
            type: translate(locale, meta.singular),
          })}
          <Icon name="arrow-right" class="text-sm" />
        </ButtonLink>
      );
    }

    if (!isMember) {
      return (
        <p class="text-sm text-ink-muted">
          {translate(
            locale,
            "Sólo pueden publicar en {{name}} quienes viven ahí.",
            { name: communityName },
          )}
        </p>
      );
    }

    // No se pudo consultar el cupo. La base sigue siendo el tope real
    // (`enforce_content_quota`), así que ofrecer el botón no arriesga nada: si
    // de verdad no queda, la action responde con el mensaje correcto. Lo que sí
    // hace daño es lo que pasaba antes — sin entrada, `remaining` y `limit`
    // caían a 0 y el último bloque anunciaba "Agotaste tus 0 encuestas de este
    // mes", que es una prohibición inventada sobre un número imposible.
    if (summary.unavailable) {
      return (
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ButtonLink href={href} size={size}>
            {translate(locale, "Crear {{article}} {{type}}", {
              article: translate(locale, meta.article),
              type: translate(locale, meta.singular),
            })}
          </ButtonLink>
          <span class="text-xs text-ink-faint">
            {translate(locale, "No pudimos consultar tu cupo en este momento.")}
          </span>
        </div>
      );
    }

    const entry = quotaFor(summary, communitySlug, type);
    const unlimited = entry?.remaining === null;
    const remaining = entry?.remaining ?? 0;
    const limit = entry?.monthlyLimit ?? 0;

    if (unlimited) {
      return (
        <div class="flex flex-wrap items-center gap-2">
          <ButtonLink href={href} size={size}>
            {translate(locale, "Crear {{article}} {{type}}", {
              article: translate(locale, meta.article),
              type: translate(locale, meta.singular),
            })}
          </ButtonLink>
          <Badge tone="brand">{translate(locale, "Sin límite")}</Badge>
        </div>
      );
    }

    if (remaining > 0) {
      const low = remaining <= 1;
      return (
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
          <ButtonLink href={href} size={size}>
            {translate(locale, "Crear {{article}} {{type}}", {
              article: translate(locale, meta.article),
              type: translate(locale, meta.singular),
            })}
          </ButtonLink>
          <span class={cx("text-xs", low ? "text-warn" : "text-ink-faint")}>
            {translate(
              locale,
              "Te {{remainingVerb}} {{remaining}} de {{limit}} este mes en {{name}}",
              {
                remainingVerb: translate(
                  locale,
                  remaining === 1 ? "queda" : "quedan",
                ),
                remaining,
                limit,
                name: communityName,
              },
            )}
          </span>
        </div>
      );
    }

    // Sin cupo: en vez de un botón gris y nada más, la salida concreta.
    const alternatives = alternativesWithQuota(summary, type, communitySlug);

    return (
      <div class="rounded-2xl border border-warn-400/40 bg-warn-400/10 px-4 py-3">
        <p class="text-sm font-medium text-warn">
          {translate(
            locale,
            "Agotaste tus {{limit}} {{type}} de este mes en {{name}}.",
            {
              limit,
              type: translate(locale, meta.plural),
              name: communityName,
            },
          )}
        </p>
        <p class="mt-1 text-xs text-ink-muted">
          {translate(locale, "Se renueva el {{date}}.", {
            date: nextRenewalLabel(locale),
          })}
        </p>

        {alternatives.length > 0 && (
          <p class="mt-2 text-xs text-ink-muted">
            {translate(locale, "Todavía podés crear {{article}} {{type}} en", {
              article: translate(locale, meta.article),
              type: translate(locale, meta.singular),
            })}{" "}
            {alternatives.slice(0, 3).map((alt, i) => (
              <span key={alt.communitySlug}>
                {i > 0 && ", "}
                <Link
                  href={routes.newContent(alt.communitySlug, meta.newPath)}
                  class="font-medium text-brand hover:underline"
                >
                  {alt.communityEmoji} {alt.communityName}
                </Link>
                {alt.remaining !== null && (
                  <span class="text-ink-faint"> ({alt.remaining})</span>
                )}
              </span>
            ))}
            .
          </p>
        )}
      </div>
    );
  },
);
