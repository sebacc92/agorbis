import { $, component$, useSignal, useTask$ } from "@qwik.dev/core";
import { Form } from "@qwik.dev/router";
import { CharCounter } from "~/components/forms/FormShell";
import {
  Alert,
  Avatar,
  Button,
  ButtonLink,
  Card,
  Field,
  Icon,
  Input,
  ProgressBar,
  SubmitButton,
  Textarea,
  buttonClass,
  cx,
  triggerHapticFeedback,
} from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { MAX_PROJECT_PLEDGE_AMOUNT, PLEDGE_DISCLAIMER } from "~/lib/constants";
import { formatMoney, formatNumber, pluralize } from "~/lib/format";
import { useLocale, translate } from "~/lib/i18n";
import type { usePledge } from "~/routes/proyectos/[id]";

/**
 * La aclaración de que comprometerse no es un pago. Hay un solo panel por
 * página, así que el `id` fijo no choca.
 */
const PLEDGE_NOTE_ID = "aporte-aclaracion";

export interface PledgeEntry {
  id: string;
  amount: number;
  message: string | null;
  created_at: string;
  author: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export const PledgePanel = component$<{
  pledge: ReturnType<typeof usePledge>;
  projectId: string;
  currency: string;
  budget: number | null;
  pledgedTotal: number;
  pledgeCount: number | null;
  pledges: PledgeEntry[];
  myPledge: { amount: number; message: string | null } | null;
  myPledgeLoadFailed: boolean;
  isMember: boolean;
  isAuthenticated: boolean;
  returnPath: string;
}>(
  ({
    pledge,
    projectId,
    currency,
    budget,
    pledgedTotal,
    pledgeCount,
    pledges,
    myPledge,
    myPledgeLoadFailed,
    isMember,
    isAuthenticated,
    returnPath,
  }) => {
    /**
     * Los dos números que deciden si alguien aporta: qué porcentaje va cubierto
     * y —sobre todo— cuánto falta. La tarjeta mostraba "$1.200.000 de
     * $9.600.000" y una barra: la resta quedaba a cargo de quien mira, justo
     * en el momento en que está por decidir cuánto poner.
     */
    const funded =
      budget && budget > 0 ? Math.round((pledgedTotal / budget) * 100) : 0;
    const missing = budget ? Math.max(0, budget - pledgedTotal) : 0;
    const goalReached = !!budget && budget > 0 && pledgedTotal >= budget;
    const isMine = pledge.formData?.get("project_id") === projectId;
    const failedEdit =
      isMine &&
      !!pledge.value?.failed &&
      pledge.formData?.get("withdraw") !== "true";
    const editing = useSignal(failedEdit);
    const showForm = editing.value || !myPledge;
    const locale = useLocale();
    const amount = useSignal(
      failedEdit
        ? (pledge.formData?.get("amount")?.toString() ?? "")
        : myPledge?.amount
          ? String(myPledge.amount)
          : "",
    );

    const setPreset = $((val: number) => {
      triggerHapticFeedback("selection");
      const current = parseInt(amount.value, 10) || 0;
      amount.value = String(current + val);
    });
    const message = useSignal(
      failedEdit
        ? (pledge.formData?.get("message")?.toString() ?? "")
        : (myPledge?.message ?? ""),
    );
    /**
     * Retirar el compromiso era un click y listo, en un botón `ghost` pegado a
     * "Cambiar monto": errarle por dos milímetros borraba el aporte y no había
     * forma de deshacerlo salvo volver a cargarlo de memoria. El segundo paso
     * cuesta un toque más y sólo aparece cuando efectivamente se quiere.
     */
    const confirmingRemoval = useSignal(
      isMine &&
        !!pledge.value?.failed &&
        pledge.formData?.get("withdraw") === "true",
    );
    useTask$(({ track }) => {
      const result = track(() => pledge.value);
      if (
        !result ||
        !("pledged" in result) ||
        pledge.formData?.get("project_id") !== projectId
      )
        return;
      confirmingRemoval.value = false;
      if (!result.pledged) {
        amount.value = "";
        message.value = "";
        editing.value = false;
        return;
      }
      const unchanged =
        amount.value === pledge.formData?.get("amount") &&
        message.value === (pledge.formData?.get("message") ?? "");
      if (unchanged) {
        amount.value = String(result.amount);
        message.value = result.pledgeMessage ?? "";
      }
      // Lo escrito después del envío conserva su lugar en el formulario.
      editing.value = !unchanged;
    });

    return (
      <Card class="p-5">
        <h2 class="font-display text-display-xs">
          {translate(locale, "Apoyo comprometido")}
        </h2>

        {/* La cifra con la anatomía de las métricas (D123). En cero va
            atenuada y no en el color de los datos: un "$ 0" grande y verdoso
            se lee como algo para festejar. */}
        <p
          class={cx(
            "mt-3 font-display text-display-md tabular-nums",
            pledgedTotal > 0 ? "text-data" : "text-ink-muted",
          )}
        >
          {formatMoney(pledgedTotal, currency, locale)}
        </p>
        {budget ? (
          <>
            <p class="text-sm text-ink-muted">
              {translate(locale, "de {{amount}} necesarios", {
                amount: formatMoney(budget, currency, locale),
              })}{" "}
              <span class="font-medium tabular-nums text-ink-strong">
                ({formatNumber(funded, locale)}%)
              </span>
            </p>
            <div class="mt-3">
              <ProgressBar
                value={pledgedTotal}
                max={budget}
                label={translate(
                  locale,
                  "Comprometido {{current}} de {{total}}",
                  {
                    current: formatMoney(pledgedTotal, currency, locale),
                    total: formatMoney(budget, currency, locale),
                  },
                )}
              />
            </div>
          </>
        ) : (
          <p class="text-sm text-ink-muted">
            {translate(locale, "Este proyecto todavía no definió presupuesto.")}
          </p>
        )}

        {/* Lo que falta, en plata y no en porcentaje: es la cifra contra la
            que alguien compara lo que está por comprometer. */}
        {budget ? (
          goalReached ? (
            <div class="mt-2 text-sm">
              {/* El mismo ícono que la tarjeta del proyecto usa para la meta. */}
              <p class="flex items-start gap-1.5 font-medium text-success">
                <Icon name="sparkles" class="mt-0.5 shrink-0" />
                <span>
                  {translate(
                    locale,
                    "Meta alcanzada. Todo lo que se sume ahora es margen.",
                  )}
                </span>
              </p>
              {/* Ningún trigger mira la meta: sólo se suma el total. */}
              <p class="mt-1 text-xs text-ink-muted">
                {translate(
                  locale,
                  "Alcanzarla no cobra nada: quien lo propuso decide cuándo pasarlo a ejecución.",
                )}
              </p>
            </div>
          ) : (
            <p class="mt-2 text-sm text-ink-strong">
              {translate(locale, "Faltan {{amount}}", {
                amount: formatMoney(missing, currency, locale),
              })}
            </p>
          )
        ) : null}

        <p class="mt-2 text-xs text-ink-faint">
          {pledgeCount === null
            ? translate(
                locale,
                "No pudimos cargar el total de personas comprometidas.",
              )
            : pledgeCount === 0
              ? translate(locale, "Todavía no se comprometió nadie")
              : pluralize(
                  pledgeCount,
                  "persona comprometida",
                  "personas comprometidas",
                  locale,
                )}
        </p>

        {/* La aclaración es una garantía (nadie transfiere dinero por
            Agorbis), no una alarma: va como nota (D124) y no en el naranja,
            que además es el color del tipo proyecto. Sin `role`: el único
            `status` del panel es la confirmación de lo guardado. El botón
            de comprometer la cita en `aria-describedby`. */}
        <div class="mt-5 flex gap-2.5 rounded-xl bg-muted/60 p-3 text-xs text-ink-muted">
          <Icon name="info" class="mt-0.5 shrink-0 text-base text-brand" />
          <div class="min-w-0 flex-1">
            <p id={PLEDGE_NOTE_ID} class="font-medium text-ink-strong">
              {translate(locale, PLEDGE_DISCLAIMER)}
            </p>
            <p class="mt-1">
              {translate(
                locale,
                "Quienes se comprometen reciben una notificación cuando el proyecto avanza.",
              )}
            </p>
          </div>
        </div>

        {/* ------------------------------------------------------- Comprometerse */}
        <div class="mt-5">
          {!isAuthenticated ? (
            <ButtonLink
              href={`/ingresar?next=${encodeURIComponent(returnPath)}`}
              class="w-full"
            >
              {translate(locale, "Ingresar para comprometerme")}
            </ButtonLink>
          ) : !isMember ? (
            /* La frase era un callejón sin salida: decía que no se puede y no
               dónde se arregla, igual que pasaba en reclamos y debates. */
            <div class="space-y-3">
              <p class="text-sm text-ink-muted">
                {translate(
                  locale,
                  "Sólo pueden comprometerse quienes viven en la comunidad del proyecto.",
                )}
              </p>
              <ButtonLink
                href="/perfil/residencia"
                variant="secondary"
                size="sm"
                class="w-full justify-center"
              >
                {translate(locale, "Revisar mi residencia")}
              </ButtonLink>
            </div>
          ) : myPledgeLoadFailed ? (
            <div class="space-y-3">
              <Alert tone="warn">
                {translate(
                  locale,
                  "No pudimos cargar tu compromiso. Volvé a cargarlo antes de hacer cambios.",
                )}
              </Alert>
              <a
                href={`${returnPath.split("#")[0]}#aporte-proyecto`}
                class={buttonClass("secondary", "sm")}
              >
                {translate(locale, "Volver a cargar mi compromiso")}
              </a>
            </div>
          ) : (
            <>
              {isMine && pledge.value?.message && (
                <Alert class="mb-3">
                  {translate(locale, pledge.value.message)}
                </Alert>
              )}
              {editing.value &&
                (amount.value !== String(myPledge?.amount ?? "") ||
                  message.value !== (myPledge?.message ?? "")) && (
                  <p role="status" class="mb-3 text-sm text-warn">
                    {translate(locale, "Tenés cambios sin guardar.")}
                  </p>
                )}

              {pledge.value &&
                isMine &&
                "pledged" in pledge.value &&
                !pledge.isRunning &&
                !editing.value && (
                  <p
                    role="status"
                    class="mb-3 text-sm font-medium text-success"
                  >
                    {translate(
                      locale,
                      pledge.value.pledged
                        ? "Tu compromiso se guardó."
                        : "Tu compromiso se retiró.",
                    )}
                  </p>
                )}

              {myPledge && !editing.value ? (
                <div class="rounded-2xl bg-success-50 p-4 dark:bg-success-950/40">
                  <p class="text-sm font-medium text-success">
                    {translate(locale, "Te comprometiste con {{amount}}", {
                      amount: formatMoney(myPledge.amount, currency, locale),
                    })}
                  </p>
                  {myPledge.message && (
                    <p dir="auto" class="ugc-text mt-1 text-sm text-ink-muted">
                      “{myPledge.message}”
                    </p>
                  )}
                  <div class="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick$={() => {
                        amount.value = String(myPledge.amount);
                        message.value = myPledge.message ?? "";
                        editing.value = true;
                        confirmingRemoval.value = false;
                      }}
                    >
                      {translate(locale, "Cambiar monto")}
                    </Button>
                    {confirmingRemoval.value ? (
                      <Form action={pledge} class="flex flex-wrap gap-2">
                        <input
                          type="hidden"
                          name="project_id"
                          value={projectId}
                        />
                        <input type="hidden" name="withdraw" value="true" />
                        <SubmitButton
                          variant="danger"
                          size="sm"
                          pending={
                            pledge.isRunning &&
                            pledge.formData?.get("withdraw") === "true"
                          }
                          disabled={pledge.isRunning}
                        >
                          {translate(locale, "Sí, retirar")}
                        </SubmitButton>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick$={() => (confirmingRemoval.value = false)}
                          disabled={pledge.isRunning}
                        >
                          {translate(locale, "Cancelar")}
                        </Button>
                      </Form>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick$={() => (confirmingRemoval.value = true)}
                      >
                        {translate(locale, "Retirar compromiso")}
                      </Button>
                    )}
                  </div>
                  {confirmingRemoval.value && (
                    <p role="status" class="mt-2 text-xs text-ink-muted">
                      {translate(
                        locale,
                        "Se borra tu aporte de este proyecto. Podés volver a comprometerte después.",
                      )}
                    </p>
                  )}
                </div>
              ) : null}

              {showForm && (
                <Form action={pledge} class="space-y-3">
                  <input type="hidden" name="project_id" value={projectId} />

                  <Field
                    label={translate(
                      locale,
                      "Monto que te comprometés a aportar ({{currency}})",
                      {
                        currency,
                      },
                    )}
                    name="amount"
                    required
                    error={
                      isMine ? pledge.value?.fieldErrors?.amount : undefined
                    }
                  >
                    <Input
                      name="amount"
                      type="number"
                      min={1}
                      max={MAX_PROJECT_PLEDGE_AMOUNT}
                      step={1}
                      required
                      inputMode="numeric"
                      placeholder="50000"
                      class="tabular-nums"
                      value={amount.value}
                      onInput$={(_, el) => (amount.value = el.value)}
                      invalid={isMine && !!pledge.value?.fieldErrors?.amount}
                    />

                    <div class="mt-2 flex flex-wrap items-center gap-1.5">
                      <span class="text-2xs font-medium text-ink-faint">
                        {translate(locale, "Montos sugeridos")}:
                      </span>
                      {[1000, 5000, 10000, 50000].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick$={() => setPreset(val)}
                          class="tabular-nums touch-target rounded-lg border border-control bg-muted/60 px-2 py-0.5 text-2xs font-medium text-ink-strong shadow-2xs transition-all hover:bg-surface hover:border-brand-400 active:scale-90 touch-manipulation"
                        >
                          {/* `formatNumber` y no un `toLocaleString` con la
                              etiqueta armada a mano: es el mismo ayudante que
                              usa el resto de la app y no hay que acordarse de
                              sumarle cada idioma nuevo. */}
                          +{formatNumber(val, locale)}
                        </button>
                      ))}
                    </div>
                  </Field>

                  <Field
                    label="Mensaje"
                    name="message"
                    hint="Opcional. Se publica junto a tu compromiso."
                    error={
                      isMine ? pledge.value?.fieldErrors?.message : undefined
                    }
                  >
                    <Textarea
                      name="message"
                      rows={2}
                      maxLength={280}
                      class="min-h-16 text-sm"
                      aria-describedby="pledge-message-count"
                      value={message.value}
                      onInput$={(_, el) => (message.value = el.value)}
                    />
                    {/* Los 280 los cortaba el navegador en silencio. */}
                    <p class="flex justify-end">
                      <CharCounter
                        value={message.value}
                        max={280}
                        id="pledge-message-count"
                      />
                    </p>
                  </Field>

                  <p class="rounded-xl border border-subtle bg-inset px-3 py-2 text-xs leading-5 text-ink-muted">
                    {translate(
                      locale,
                      "Tu nombre público, el monto, el mensaje y la fecha aparecerán en este proyecto. No incluyas datos de pago ni contacto privado.",
                    )}
                  </p>

                  <div class="flex gap-2">
                    <SubmitButton
                      variant="success"
                      class="flex-1"
                      aria-describedby={PLEDGE_NOTE_ID}
                      pending={
                        pledge.isRunning &&
                        pledge.formData?.get("withdraw") !== "true"
                      }
                      disabled={pledge.isRunning}
                    >
                      {myPledge
                        ? translate(locale, "Actualizar compromiso")
                        : translate(locale, "Comprometer aporte")}
                    </SubmitButton>
                    {myPledge && (
                      <Button
                        variant="ghost"
                        disabled={pledge.isRunning}
                        onClick$={() => (editing.value = false)}
                      >
                        {translate(locale, "Cancelar")}
                      </Button>
                    )}
                  </div>
                </Form>
              )}
            </>
          )}
        </div>

        {/* El mensaje pedía contar en texto libre lo que ya tiene un registro
            propio con estado: los aportes no monetarios de la ejecución.
            Sólo para quien puede ofrecerlos; al resto lo guía el llamado de
            arriba (ingresar o revisar la residencia). `inline-block` y no
            `inline-flex`: la flecha sigue a la última palabra en vez de
            quedar suelta contra el borde cuando el texto parte en dos. */}
        {isAuthenticated && isMember && (
          <p class="mt-4 text-sm">
            <a
              href="#aportes-no-monetarios"
              class="inline-block min-h-11 py-2.5 font-medium text-brand hover:underline"
            >
              {translate(
                locale,
                "¿Preferís aportar tiempo, materiales o habilidades? Ofrecelos acá",
              )}
              <Icon
                name="arrow-right"
                class="ml-1 rotate-90 align-[-0.125em]"
              />
            </a>
          </p>
        )}

        {/* ------------------------------------------------------ Quiénes se sumaron */}
        {pledges.length > 0 && (
          <div class="mt-6 border-t border-subtle pt-4">
            <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {translate(locale, "Quiénes se sumaron")}
            </h3>
            {pledgeCount !== null && pledgeCount > pledges.length && (
              <p class="mt-2 text-xs text-ink-muted">
                {translate(
                  locale,
                  "Se muestran los {{count}} compromisos más recientes.",
                  { count: formatNumber(pledges.length, locale) },
                )}
              </p>
            )}
            <ul class="mt-3 space-y-3">
              {pledges.map((entry) => {
                const name =
                  entry.author?.display_name ??
                  entry.author?.username ??
                  translate(locale, "Cuenta eliminada");
                // Sin fondo al pasar el mouse: la fila no es clicable y la
                // elevación queda para lo que sí lo es (D123).
                return (
                  <li key={entry.id} class="flex gap-2.5">
                    <Avatar
                      src={entry.author?.avatar_url}
                      name={name}
                      size="sm"
                    />
                    <div class="min-w-0 flex-1">
                      <p class="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <bdi dir="auto" class="font-medium text-ink-strong">
                          {name}
                        </bdi>
                        <span class="text-xs tabular-nums text-data">
                          {formatMoney(entry.amount, currency, locale)}
                        </span>
                        {/* Era `timeAgo` a secas: "hace 3 días" y nada más.
                            `RelativeTime` conserva la fecha exacta para quien
                            la necesita y no envejece mal en una página
                            cacheada. */}
                        <RelativeTime
                          value={entry.created_at}
                          class="text-xs text-ink-faint"
                        />
                      </p>
                      {entry.message && (
                        <p
                          dir="auto"
                          class="ugc-text mt-0.5 text-sm text-ink-muted"
                        >
                          {entry.message}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>
    );
  },
);
