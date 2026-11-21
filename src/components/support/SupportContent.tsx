import { component$ } from "@qwik.dev/core";
import { Card, ExternalLinkHint } from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { translate, useLocale } from "~/lib/i18n";

/** Lo que sostiene un aporte. Sin montos: todavía no hay cifras reales (D74). */
const FUNDED = [
  "El servidor, la base de datos y el dominio.",
  "El correo que confirma cuentas y avisa novedades.",
  "El tiempo de desarrollo, moderación y soporte.",
];

/** Las reglas de D128, dichas a quien está por donar. */
const RULES = [
  "Donar no cambia nada dentro de Agorbis: no da más visibilidad, más peso en una votación ni funciones extra.",
  "Agorbis no registra quién dona ni cuánto. El aporte no queda asociado a tu cuenta.",
  "Participar es gratis y lo va a seguir siendo. Nadie necesita donar para votar, debatir, reclamar o proponer.",
];

/**
 * Contenido de `/apoyar`.
 *
 * Recibe el enlace ya validado por `donationLink` para poder probar los dos
 * estados; con `null` la página existe igual y dice que todavía no hay cómo.
 */
export const SupportContent = component$<{ donationHref: string | null }>(
  ({ donationHref }) => {
    const locale = useLocale();

    return (
      <article class="container-reading py-10 [overflow-wrap:anywhere]">
        <header class="mb-8">
          <p class="text-sm font-semibold text-brand">{APP_NAME}</p>
          <h1 class="mt-1 text-4xl font-semibold tracking-tight">
            {translate(locale, "Apoyar a Agorbis")}
          </h1>
          <p class="mt-3 text-lg text-ink-muted">
            {translate(
              locale,
              "Agorbis no tiene publicidad ni vende datos. Se sostiene con el aporte voluntario de quienes lo usan.",
            )}
          </p>
        </header>

        <div class="space-y-5">
          <Card class="p-6">
            <h2 class="text-xl font-semibold tracking-tight">
              {translate(locale, "Qué sostiene tu aporte")}
            </h2>
            <ul class="mt-3 list-disc space-y-2 pl-5 leading-7 text-ink-muted">
              {FUNDED.map((item) => (
                <li key={item}>{translate(locale, item)}</li>
              ))}
            </ul>
          </Card>

          <Card class="p-6">
            <h2 class="text-xl font-semibold tracking-tight">
              {translate(locale, "Qué no compra una donación")}
            </h2>
            <ul class="mt-3 list-disc space-y-2 pl-5 leading-7 text-ink-muted">
              {RULES.map((item) => (
                <li key={item}>{translate(locale, item)}</li>
              ))}
            </ul>
          </Card>

          <Card class="p-6">
            <h2 class="text-xl font-semibold tracking-tight">
              {translate(locale, "Cómo donar")}
            </h2>
            {donationHref ? (
              <>
                <p class="mt-3 leading-7 text-ink-muted">
                  {translate(
                    locale,
                    "El aporte se hace en Cafecito, un sitio externo. El pago y tus datos de pago quedan ahí, bajo sus propias condiciones; Agorbis no los recibe.",
                  )}
                </p>
                {/* `<a>` y no `ButtonLink`: es un destino externo, no una
                    navegación del router. `no-referrer` para que Cafecito no
                    reciba ni el origen: nadie tiene por qué saber que quien
                    dona usa una plataforma cívica. */}
                <a
                  href={donationHref}
                  target="_blank"
                  rel="noopener noreferrer external"
                  referrerPolicy="no-referrer"
                  class="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white transition hover:bg-brand-700"
                >
                  {translate(locale, "Donar en Cafecito")}
                  <ExternalLinkHint />
                </a>
              </>
            ) : (
              <p class="mt-3 leading-7 text-ink-muted">
                {translate(
                  locale,
                  "Todavía no recibimos aportes. Cuando haya un medio para donar, el enlace va a estar en esta página.",
                )}
              </p>
            )}
          </Card>
        </div>
      </article>
    );
  },
);
