import { component$ } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  z,
  zod$,
  type DocumentHead,
  type RequestEventAction,
} from "@qwik.dev/router";
import { ReportButton } from "~/components/moderation/ReportButton";
import {
  Alert,
  Badge,
  ButtonLink,
  Card,
  Chip,
  SubmitButton,
} from "~/components/ui";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";

import { RelativeTime } from "~/components/ui/RelativeTime";
import {
  agreementStatusLabel,
  parseAgreementState,
  partyOutcomeLabel,
  type AgreementState,
} from "~/lib/agreements";
import {
  authEntryHref,
  onboardingPath,
  returnPathFor,
} from "~/lib/auth-navigation";
import { routes } from "~/lib/community";
import { APP_NAME, LOAD_FAILED } from "~/lib/constants";
import { PUBLISHED_PARAM } from "~/lib/content-publication";
import {
  agreementRaiseMessage,
  isUniqueViolation,
  participationBlockMessage,
  writeFailure,
} from "~/lib/db-error";
import { isUuid } from "~/lib/http";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import { many } from "~/lib/query";
import { requestIdOf } from "~/lib/request-id";
import { getViewer, supabase } from "~/lib/session";
import { useLocaleLoader } from "../../layout";

/**
 * Página de un acuerdo (D118). Todo lo que decide quién puede qué viene de
 * `agreement_state`: la página muestra el estado en palabras, ofrece sólo las
 * acciones que la base dijo que valen y traduce los rechazos. Nada afirma
 * "adherido", "votado" ni "aprobado" antes de que la base lo devuelva (D74).
 */

interface PollOption {
  id: string;
  label: string;
  sort_order: number;
}

interface AgreementPage {
  state: AgreementState;
  /** Opciones de la ronda propia, sólo si la persona puede votar. */
  options: PollOption[];
  isAuthenticated: boolean;
  /** Con sesión pero sin residencia elegida: se la lleva a elegirla (D115). */
  needsResidence: boolean;
}

export const useAgreement = routeLoader$<AgreementPage>(async (ev) => {
  const locale = resolveLocale(ev.locale());
  if (!isUuid(ev.params.id)) {
    throw ev.error(404, translate(locale, "No encontramos ese acuerdo."));
  }
  const db = supabase(ev);
  const viewer = await getViewer(ev);
  const { data, error } = await db.rpc("agreement_state", {
    p_agreement: ev.params.id,
  });
  if (error) {
    logFailure({ scope: "acuerdos/estado", requestId: requestIdOf(ev) }, error);
    throw ev.error(500, translate(locale, LOAD_FAILED));
  }
  // La RPC devuelve null cuando el acuerdo no existe.
  if (data === null) {
    throw ev.error(404, translate(locale, "No encontramos ese acuerdo."));
  }
  const state = parseAgreementState(data);
  if (!state) {
    // Una forma inesperada es un fallo nuestro, no una página vacía.
    logFailure(
      { scope: "acuerdos/forma", requestId: requestIdOf(ev) },
      { message: "agreement_state con forma inesperada" },
    );
    throw ev.error(500, translate(locale, LOAD_FAILED));
  }

  const ownPoll = state.viewer.can_vote
    ? (state.parties.find(
        (party) => party.community_id === state.viewer.party_community_id,
      )?.poll_id ?? null)
    : null;
  const options = ownPoll
    ? await many(
        ev,
        "acuerdos/opciones",
        db
          .from("poll_options")
          .select("id, label, sort_order")
          .eq("poll_id", ownPoll)
          .order("sort_order"),
      )
    : [];
  // Poder votar sin ronda o con una ronda sin sus dos opciones es un fallo
  // nuestro: la tarjeta de voto no se dibuja a medias y queda rastro.
  if (state.viewer.can_vote && (!ownPoll || options.length < 2)) {
    logFailure(
      { scope: "acuerdos/opciones-incompletas", requestId: requestIdOf(ev) },
      { message: ownPoll ? `opciones ${options.length}` : "sin ronda propia" },
    );
  }

  return {
    state,
    options,
    isAuthenticated: !!viewer.userId,
    needsResidence: !!viewer.userId && !viewer.homePath,
  };
});

/**
 * Un rechazo que ningún mapeo conoce (función ausente, red, Postgres caído)
 * se muestra como "Probá de nuevo", pero no puede desaparecer del servidor.
 */
function logUnexpected(
  ev: RequestEventAction,
  scope: string,
  error: { message?: string; code?: string },
) {
  logFailure({ scope, requestId: requestIdOf(ev) }, error);
}

function signInRedirect(ev: RequestEventAction): never {
  throw ev.redirect(
    302,
    `/ingresar?next=${encodeURIComponent(ev.url.pathname)}`,
  );
}

export const useAdhere = routeAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) signInRedirect(ev);
    const { error } = await supabase(ev).rpc("adhere_agreement", {
      p_agreement: data.agreement_id,
    });
    if (error) {
      const known =
        participationBlockMessage(error) ?? agreementRaiseMessage(error);
      if (!known) logUnexpected(ev, "acuerdos/adherir", error);
      const message =
        known ?? "No pudimos registrar la adhesión. Probá de nuevo.";
      const failure = writeFailure(error, message);
      return ev.fail(failure.status, { message: failure.message });
    }
    return { adhered: true as const };
  },
  {
    validation: [zod$({ agreement_id: z.string().uuid() })],
    invalidate: [useAgreement],
  },
);

export const useWithdraw = routeAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) signInRedirect(ev);
    const { error } = await supabase(ev).rpc("withdraw_agreement", {
      p_agreement: data.agreement_id,
    });
    if (error) {
      const known =
        participationBlockMessage(error) ?? agreementRaiseMessage(error);
      if (!known) logUnexpected(ev, "acuerdos/retirar", error);
      const message =
        known ?? "No pudimos retirar la propuesta. Probá de nuevo.";
      const failure = writeFailure(error, message);
      return ev.fail(failure.status, { message: failure.message });
    }
    return { withdrawn: true as const };
  },
  {
    validation: [zod$({ agreement_id: z.string().uuid() })],
    invalidate: [useAgreement],
  },
);

export const useVoteAgreement = routeAction$(
  async (data, ev) => {
    const viewer = await getViewer(ev);
    if (!viewer.userId) signInRedirect(ev);
    // Misma RPC que una encuesta: recibo sin elección, tallies privados (D68).
    const { error } = await supabase(ev).rpc("cast_poll_ballot", {
      p_poll: data.poll_id,
      p_option_ids: [data.option_id],
    });
    if (error) {
      // Los textos de la base están en español: "closed" sólo aparecería en
      // un error de transporte, que no es una votación cerrada.
      const known =
        participationBlockMessage(error) ??
        (isUniqueViolation(error) || /AGORBIS_ALREADY_VOTED/.test(error.message)
          ? "Ya votaste en este acuerdo. Tu elección no quedó guardada, así que no podemos mostrarla ni cambiarla."
          : /cerrada|venció/i.test(error.message)
            ? "Esta votación ya cerró."
            : /AGORBIS_COMMUNITY_MEMBERSHIP_REQUIRED/.test(error.message)
              ? "Sólo pueden votar quienes viven en una comunidad participante."
              : null);
      if (!known) logUnexpected(ev, "acuerdos/votar", error);
      const message = known ?? "No pudimos registrar tu voto. Probá de nuevo.";
      const failure = writeFailure(error, message);
      return ev.fail(failure.status, { message: failure.message });
    }
    return { voted: true as const };
  },
  {
    validation: [
      zod$({ poll_id: z.string().uuid(), option_id: z.string().uuid() }),
    ],
    invalidate: [useAgreement],
  },
);

const STATUS_TONE: Record<
  AgreementState["status_derived"],
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

export default component$(() => {
  const data = useAgreement();
  const locale = useLocale();
  const loc = useLocation();
  const adhere = useAdhere();
  const withdraw = useWithdraw();
  const vote = useVoteAgreement();
  const { state, options, isAuthenticated, needsResidence } = data.value;
  const { viewer } = state;
  const ownParty = state.parties.find(
    (party) => party.community_id === viewer.party_community_id,
  );
  const pending = state.parties.filter((party) => !party.adhered_at);
  const failure = [adhere.value, withdraw.value, vote.value].find(
    (value) => value?.failed,
  );
  // Primera visita de quien propuso, recién publicada (?publicado=1). El
  // parámetro se puede compartir: sólo quien puede retirarla, es decir la
  // proponente con la propuesta todavía abierta, ve el aviso.
  const justPublished =
    viewer.can_withdraw &&
    state.status_derived === "proposed" &&
    loc.url.searchParams.get(PUBLISHED_PARAM) === "1";
  const closed =
    state.status_derived === "approved" ||
    state.status_derived === "rejected" ||
    state.status_derived === "no_quorum";

  return (
    <article class="container-content py-6 sm:py-8">
      {/* Franja superior dorada del tipo y badge con ícono (D123): el
          "Acuerdo ·" en violeta se confundía con un enlace. */}
      <header class="mb-6 border-t-4 border-t-kind-agreement pt-5">
        <p class="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <Chip
            variant="badge"
            icon={CONTENT_KINDS.agreement.icon}
            toneClass={CONTENT_KIND_TONES.agreement.badge}
          >
            {translate(locale, CONTENT_KINDS.agreement.label)}
          </Chip>
          <Link
            href={routes.community(state.proposer_community.slug)}
            class="font-medium text-brand hover:underline"
          >
            {state.proposer_community.emoji} {state.proposer_community.name}
          </Link>
        </p>
        <h1 dir="auto" class="mt-2 text-display-lg sm:text-display-xl">
          {state.title}
        </h1>
        <p class="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <Badge tone={STATUS_TONE[state.status_derived]}>
            {agreementStatusLabel(
              locale,
              state.status_derived,
              state.closes_at,
            )}
          </Badge>
          <span>
            {translate(locale, "Propuesto")}{" "}
            <RelativeTime value={state.created_at} />
          </span>
        </p>
      </header>

      {/* Sólo moderación llega a ver un acuerdo removido: la base responde
          "no existe" a todo el resto (D120). */}
      {state.status_derived === "removed" && (
        <Alert tone="danger" class="mb-4">
          {translate(
            locale,
            "Este acuerdo está dado de baja por moderación. Sólo moderación lo ve; restaurarlo desde la cola lo devuelve a su estado anterior, con sus rondas.",
          )}
        </Alert>
      )}

      {justPublished && (
        <Alert tone="success" class="mb-4">
          {translate(
            locale,
            "Tu propuesta ya está publicada. Ahora hace falta que una residente de cada comunidad nombrada, y otra de la tuya, adhiera: compartila con quienes puedan hacerlo.",
          )}
        </Alert>
      )}

      {(vote.value?.voted ||
        adhere.value?.adhered ||
        withdraw.value?.withdrawn) && (
        <Alert tone="success" class="mb-4">
          {translate(
            locale,
            vote.value?.voted
              ? "Tu voto quedó registrado."
              : adhere.value?.adhered
                ? "Tu comunidad adhirió. Lo que sigue lo dice el estado de arriba."
                : "La propuesta quedó retirada.",
          )}
        </Alert>
      )}

      {failure?.failed && (
        <Alert tone="danger" class="mb-4">
          {translate(
            locale,
            // Un rechazo de validación trae errores por campo y ningún
            // mensaje: no se muestra un aviso vacío.
            failure.message ??
              "No pudimos registrar la acción. Probá de nuevo.",
          )}
        </Alert>
      )}

      <div class="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div class="space-y-4">
          <Card class="p-5">
            <h2 class="text-sm font-semibold uppercase tracking-wider text-ink-muted">
              {translate(locale, "El compromiso")}
            </h2>
            <p
              dir="auto"
              class="ugc-text mt-3 whitespace-pre-wrap leading-relaxed"
            >
              {state.body}
            </p>
          </Card>

          <Card class="p-5">
            <h2 class="text-sm font-semibold uppercase tracking-wider text-ink-muted">
              {state.parties.length === 1
                ? translate(locale, "Comunidad que decide")
                : translate(locale, "Comunidades que deciden")}
            </h2>
            <p class="mt-2 text-sm text-ink-muted">
              {state.parties.length === 1
                ? translate(
                    locale,
                    "Un acuerdo interno: lo vota la propia comunidad y queda registrado como compromiso.",
                  )
                : translate(
                    locale,
                    "Cada comunidad vota por separado. El acuerdo existe sólo si todas lo aprueban, con cinco participantes o más en cada una.",
                  )}
            </p>
            <ul class="mt-4 divide-y divide-subtle">
              {state.parties.map((party) => (
                <li
                  key={party.community_id}
                  class="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <Link
                    href={routes.community(party.slug)}
                    class="font-medium hover:underline"
                  >
                    {party.emoji} {party.name}
                  </Link>
                  <span class="text-sm text-ink-muted">
                    {party.outcome
                      ? partyOutcomeLabel(
                          locale,
                          party.outcome,
                          party.participants,
                        )
                      : party.adhered_at
                        ? translate(locale, "Adhirió")
                        : state.status_derived === "lapsed" ||
                            state.status_derived === "withdrawn"
                          ? // Ya nadie la espera: la propuesta venció o se retiró.
                            translate(locale, "No adhirió")
                          : translate(locale, "Esperando adhesión")}
                  </span>
                </li>
              ))}
            </ul>
            {closed && state.parties.length > 1 && (
              <p class="mt-3 text-xs text-ink-faint">
                {translate(
                  locale,
                  "Los resultados se muestran por comunidad y no se suman: cada una decidió por sí misma.",
                )}
              </p>
            )}
          </Card>
        </div>

        <aside class="space-y-3 lg:sticky lg:top-24 lg:self-start">
          {/* Acciones: sólo las que la base dijo que valen. */}
          {viewer.can_vote && ownParty?.poll_id && options.length < 2 && (
            <Alert tone="danger">
              {translate(
                locale,
                "No pudimos cargar las opciones de voto. Recargá la página para volver a intentarlo.",
              )}
            </Alert>
          )}
          {viewer.can_vote && ownParty?.poll_id && options.length >= 2 && (
            <Card class="p-4">
              <h2 id="acuerdo-voto-titulo" class="font-semibold">
                {translate(locale, "¿Aprobás este acuerdo por {{community}}?", {
                  community: ownParty.name,
                })}
              </h2>
              <p class="mt-1 text-sm text-ink-muted">
                {translate(
                  locale,
                  "Tu voto es secreto y no se puede cambiar. Los resultados se ven al cierre, con cinco participantes o más.",
                )}
              </p>
              <Form
                action={vote}
                class="mt-3 grid gap-2 sm:grid-cols-2"
                role="group"
                aria-labelledby="acuerdo-voto-titulo"
              >
                <input type="hidden" name="poll_id" value={ownParty.poll_id} />
                {options.map((option) => (
                  <SubmitButton
                    key={option.id}
                    name="option_id"
                    value={option.id}
                    pending={
                      vote.isRunning &&
                      vote.formData?.get("option_id") === option.id
                    }

                    // Con un voto en vuelo no se manda el otro: la base rechazaría el

                    // segundo y ese error taparía al voto válido.

                    disabled={vote.isRunning}
                    variant={option.sort_order === 0 ? "primary" : "secondary"}
                  >
                    {/* "Sí" y "No" los escribe la RPC, no una autora: son
                        texto de sistema y se traducen. */}
                    {translate(locale, option.label)}
                  </SubmitButton>
                ))}
              </Form>
            </Card>
          )}

          {viewer.has_receipt && (
            <Card class="p-4">
              <Badge tone="success">
                {translate(locale, "Ya votaste")}{" "}
                <span aria-hidden="true">✓</span>
              </Badge>
              <p class="mt-2 text-sm text-ink-muted">
                {translate(
                  locale,
                  "Tu elección no quedó guardada, así que no podemos mostrarla ni cambiarla.",
                )}
              </p>
            </Card>
          )}

          {viewer.can_adhere && ownParty && (
            <Card class="p-4">
              <h2 class="font-semibold">
                {translate(locale, "¿Que {{community}} vote este acuerdo?", {
                  community: ownParty.name,
                })}
              </h2>
              <p class="mt-1 text-sm text-ink-muted">
                {translate(
                  locale,
                  "Adherir no aprueba nada: pide que tu comunidad lo vote. La votación se abre cuando todas las comunidades nombradas adhirieron.",
                )}
              </p>
              <Form action={adhere} class="mt-3">
                <input type="hidden" name="agreement_id" value={state.id} />
                <SubmitButton pending={adhere.isRunning} class="w-full">
                  {translate(locale, "Adherir por {{community}}", {
                    community: ownParty.name,
                  })}
                </SubmitButton>
              </Form>
            </Card>
          )}

          {/* La base permite retirar mientras esté "proposed", pero una
              propuesta vencida ya dice "Sin adhesión": retirarla la pasaría a
              "Retirado" sin que cambie nada para nadie. */}
          {viewer.can_withdraw && state.status_derived === "proposed" && (
            <Card class="p-4">
              <h2 class="font-semibold">{translate(locale, "Tu propuesta")}</h2>
              <p class="mt-1 text-sm text-ink-muted">
                {pending.length > 0
                  ? translate(
                      locale,
                      "Esperando que adhiera: {{communities}}. Si pasan 30 días, la propuesta vence sola.",
                      {
                        communities: pending.map((p) => p.name).join(", "),
                      },
                    )
                  : translate(locale, "Podés retirarla mientras no se abra.")}
              </p>
              <Form action={withdraw} class="mt-3">
                <input type="hidden" name="agreement_id" value={state.id} />
                <SubmitButton
                  pending={withdraw.isRunning}
                  variant="secondary"
                  class="w-full"
                >
                  {translate(locale, "Retirar la propuesta")}
                </SubmitButton>
              </Form>
            </Card>
          )}

          {!isAuthenticated && (
            <Card class="p-4">
              <p class="text-sm text-ink-muted">
                {translate(
                  locale,
                  "Para adherir o votar hace falta una cuenta y vivir en una de las comunidades que deciden.",
                )}
              </p>
              <ButtonLink
                href={authEntryHref("/registro", loc.url)}
                class="mt-3 w-full"
              >
                {translate(locale, "Crear cuenta")}
              </ButtonLink>
            </Card>
          )}

          {needsResidence && (
            <Card class="p-4">
              <p class="text-sm text-ink-muted">
                {translate(
                  locale,
                  "Para adherir o votar hace falta elegir dónde vivís.",
                )}
              </p>
              <ButtonLink
                href={onboardingPath(returnPathFor(loc.url))}
                variant="secondary"
                class="mt-3 w-full"
              >
                {translate(locale, "Elegir dónde vivo")}
              </ButtonLink>
            </Card>
          )}

          {isAuthenticated &&
            !needsResidence &&
            !viewer.party_community_id &&
            !closed &&
            state.status_derived !== "withdrawn" &&
            state.status_derived !== "lapsed" &&
            state.status_derived !== "removed" && (
              <Card class="p-4">
                <p class="text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Tu comunidad no participa en este acuerdo. Podés leerlo y seguir lo que decidan.",
                  )}
                </p>
              </Card>
            )}
        </aside>
      </div>

      {state.status_derived !== "removed" && (
        <div class="mt-8">
          <ReportButton
            targetType="agreement"
            targetId={state.id}
            isAuthenticated={isAuthenticated}
          />
        </div>
      )}
    </article>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useAgreement);
  const locale = resolveValue(useLocaleLoader);
  return {
    title: `${data.state.title} · ${translate(locale, "Acuerdo")} · ${APP_NAME}`,
    meta: [
      {
        name: "description",
        content: translate(
          locale,
          "Acuerdo propuesto desde {{community}} en Agorbis.",
          { community: data.state.proposer_community.name },
        ),
      },
    ],
  };
};
