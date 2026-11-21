import { component$ } from "@qwik.dev/core";
import { Link } from "@qwik.dev/router";
import { Alert, Badge, ButtonLink, Card, Icon } from "~/components/ui";
import { CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { agreementStatusLabel, type AgreementStatus } from "~/lib/agreements";
import { routes } from "~/lib/community";
import { translate, useLocale } from "~/lib/i18n";

export interface AgreementListItem {
  id: string;
  title: string;
  status: AgreementStatus;
  closes_at: string | null;
  party_count: number;
  adhered_count: number;
}

const TONE: Record<
  AgreementStatus,
  "neutral" | "brand" | "success" | "warn" | "danger"
> = {
  proposed: "neutral",
  voting: "brand",
  approved: "success",
  rejected: "danger",
  no_quorum: "warn",
  lapsed: "neutral",
  withdrawn: "neutral",
  removed: "danger",
};

/**
 * Sección "Acuerdos" dentro de la pestaña Encuestas (D118). Lista lo que la
 * base devolvió con su estado en palabras. Sin acuerdos y sin permiso para
 * proponer no dibuja nada: una comunidad vacía no necesita otra lista vacía.
 */
export const AgreementsSection = component$<{
  items: AgreementListItem[];
  /** Enlace para proponer; `null` si la persona no vive acá. */
  proposeHref: string | null;
  communityName: string;
  /** La base no respondió: se dice, en lugar de mostrar una lista vacía. */
  failed?: boolean;
}>(({ items, proposeHref, communityName, failed = false }) => {
  const locale = useLocale();
  if (items.length === 0 && !proposeHref && !failed) return null;
  return (
    <section
      aria-labelledby="acuerdos-titulo"
      class="mb-6 rounded-2xl border border-subtle bg-muted/40 p-4 sm:p-5"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="acuerdos-titulo"
            class="inline-flex items-center gap-2 text-display-sm"
          >
            <Icon name="handshake" class={CONTENT_KIND_TONES.agreement.text} />
            {translate(locale, "Acuerdos")}
          </h2>
          <p class="mt-1 text-sm text-ink-muted">
            {translate(
              locale,
              "Compromisos que {{community}} vota por separado, sola o junto con otras comunidades. Existen sólo si todas las comunidades los aprueban.",
              { community: communityName },
            )}
          </p>
        </div>
        {proposeHref && (
          <ButtonLink href={proposeHref} variant="secondary" size="sm">
            {translate(locale, "Proponer un acuerdo")}
          </ButtonLink>
        )}
      </div>
      {failed ? (
        <Alert tone="danger" class="mt-4">
          {translate(
            locale,
            "No pudimos cargar los acuerdos de esta comunidad. Recargá la página para volver a intentarlo.",
          )}
        </Alert>
      ) : items.length > 0 ? (
        <ul class="mt-4 grid gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={routes.agreement(item.id)} class="block rounded-2xl">
                {/* Tarjeta plana con la franja dorada del tipo (D123). */}
                <Card
                  interactive
                  accent={CONTENT_KIND_TONES.agreement.accent}
                  class="flex flex-wrap items-center justify-between gap-2 p-4"
                >
                  <span dir="auto" class="font-display text-display-xs">
                    {item.title}
                  </span>
                  <span class="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    <Badge tone={TONE[item.status]}>
                      {agreementStatusLabel(
                        locale,
                        item.status,
                        item.closes_at,
                      )}
                    </Badge>
                    {item.party_count > 1 && (
                      <span>
                        {translate(
                          locale,
                          "{{adhered}} de {{total}} comunidades adhirieron",
                          {
                            adhered: String(item.adhered_count),
                            total: String(item.party_count),
                          },
                        )}
                      </span>
                    )}
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p class="mt-3 text-sm text-ink-muted">
          {translate(
            locale,
            "Todavía no hay acuerdos acá. El primero puede ser tuyo.",
          )}
        </p>
      )}
    </section>
  );
});
