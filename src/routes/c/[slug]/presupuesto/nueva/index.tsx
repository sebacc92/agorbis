import { component$ } from "@qwik.dev/core";
import {
  Form,
  routeAction$,
  routeLoader$,
  z,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import { CommunityBreadcrumb } from "~/components/community/CommunityBreadcrumb";
import {
  Alert,
  Card,
  Field,
  Input,
  SubmitButton,
  Textarea,
} from "~/components/ui";
import { BudgetCostEstimatorWizard } from "~/components/budget/BudgetCostEstimatorWizard";
import { routes } from "~/lib/community";
import { APP_NAME } from "~/lib/constants";
import { isRlsViolation, participationBlockMessage } from "~/lib/db-error";
import { useLocale, DEFAULT_LOCALE, translate } from "~/lib/i18n";
import { single } from "~/lib/query";
import { requireUser, supabase } from "~/lib/session";
import { useLocaleLoader } from "~/routes/layout";
import { useCommunity } from "../../layout";

/**
 * Alta de una ronda de presupuesto participativo (D59).
 *
 * Sólo moderación: la política `community_budgets_write_mod` de 0028 ya lo
 * exige, pero se comprueba también en el loader para no dibujar un formulario
 * que la base va a rechazar al enviarlo.
 */
export const useCanCreate = routeLoader$(async (ev) => {
  const viewer = await requireUser(ev);
  if (!viewer.isModerator) {
    throw ev.error(
      403,
      translate(
        DEFAULT_LOCALE,
        "Sólo el equipo de moderación puede abrir una ronda de presupuesto.",
      ),
    );
  }
  return { userId: viewer.userId };
});

export const useCreateBudget = routeAction$(
  async (data, ev) => {
    await requireUser(ev);
    const db = supabase(ev);

    const community = await single(
      ev,
      "c-c-presupuesto-nueva/community",
      db
        .from("communities")
        .select("id")
        .eq("slug", ev.params.slug)
        .maybeSingle(),
    );
    if (!community) {
      return ev.fail(404, { message: "No encontramos esa comunidad." });
    }

    // El calendario tiene que ser coherente o la fase derivada no significa
    // nada. El check de la tabla lo garantiza igual; acá se explica mejor.
    const dates = [
      data.proposals_close_at,
      data.voting_opens_at,
      data.voting_closes_at,
      data.report_due_at,
    ].map((d) => new Date(d).getTime());
    if (
      dates.some(Number.isNaN) ||
      dates.some((d, i) => i > 0 && d < dates[i - 1]!)
    ) {
      return ev.fail(400, {
        message:
          "Las fechas tienen que ir en orden: admisión, votación, cierre y rendición.",
      });
    }

    const { error } = await db.from("community_budgets").insert({
      community_id: community.id,
      title: data.title,
      description: data.description || null,
      amount: data.amount,
      currency: data.currency.toUpperCase(),
      tokens_per_voter: data.tokens_per_voter,
      max_tokens_per_proposal: data.max_tokens_per_proposal,
      proposals_close_at: new Date(data.proposals_close_at).toISOString(),
      voting_opens_at: new Date(data.voting_opens_at).toISOString(),
      voting_closes_at: new Date(data.voting_closes_at).toISOString(),
      report_due_at: new Date(data.report_due_at).toISOString(),
    });

    if (error) {
      return ev.fail(400, {
        message:
          participationBlockMessage(error) ??
          (isRlsViolation(error)
            ? "Sólo el equipo de moderación puede abrir una ronda."
            : "No pudimos crear la ronda. Revisá los datos."),
      });
    }

    throw ev.redirect(302, `${routes.community(ev.params.slug)}/presupuesto`);
  },
  zod$({
    title: z.string().trim().min(3).max(150),
    description: z.string().trim().max(2000).optional().or(z.literal("")),
    amount: z.coerce.number().positive().max(1_000_000_000_000),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, "Usá el código de tres letras, por ejemplo ARS."),
    tokens_per_voter: z.coerce.number().int().min(1).max(100),
    max_tokens_per_proposal: z.coerce.number().int().min(1).max(100),
    proposals_close_at: z.string().min(1),
    voting_opens_at: z.string().min(1),
    voting_closes_at: z.string().min(1),
    report_due_at: z.string().min(1),
  }),
);

export default component$(() => {
  useCanCreate();
  const ctx = useCommunity();
  const create = useCreateBudget();
  const locale = useLocale();
  const { community, chain } = ctx.value;

  return (
    <div class="container-reading py-8">
      <CommunityBreadcrumb chain={chain} currentIsLink class="mb-5" />

      <header class="mb-6">
        <p class="text-sm font-semibold text-brand">
          {translate(locale, "Presupuesto participativo")}
        </p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">
          {translate(locale, "Abrir una ronda en {{community}}", {
            community: community.name,
          })}
        </h1>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Las cuatro fechas definen las fases: no hay estados que mover a mano. Agorbis registra la decisión y la rendición, no administra los fondos.",
          )}
        </p>
      </header>

      <Card class="p-5 sm:p-6">
        <Form action={create} class="space-y-4">
          {create.value?.message && (
            <Alert>{translate(locale, create.value.message)}</Alert>
          )}

          <Field name="title" label="Título de la ronda" required>
            <Input
              name="title"
              required
              placeholder={translate(locale, "Ej: Partida 2026")}
              value={create.formData?.get("title")?.toString()}
              invalid={!!create.value?.fieldErrors?.title}
            />
          </Field>

          <Field
            name="description"
            label="Qué se está repartiendo"
            hint="De dónde sale la partida y qué tipo de proyectos se esperan."
          >
            <Textarea
              name="description"
              rows={3}
              value={create.formData?.get("description")?.toString()}
            />
          </Field>

          <BudgetCostEstimatorWizard />

          <div class="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field name="amount" label="Monto de la partida" required>
              <Input
                name="amount"
                type="number"
                inputMode="decimal"
                min="1"
                step="any"
                required
                value={create.formData?.get("amount")?.toString()}
                invalid={!!create.value?.fieldErrors?.amount}
              />
            </Field>
            <Field name="currency" label="Moneda" required>
              <Input
                name="currency"
                required
                maxLength={3}
                placeholder="ARS"
                value={create.formData?.get("currency")?.toString() ?? "ARS"}
                invalid={!!create.value?.fieldErrors?.currency}
              />
            </Field>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <Field
              name="tokens_per_voter"
              label="Fichas por votante"
              hint="Cuántas reparte cada persona entre los proyectos."
              required
            >
              <Input
                name="tokens_per_voter"
                type="number"
                inputMode="numeric"
                min="1"
                max="100"
                required
                value={
                  create.formData?.get("tokens_per_voter")?.toString() ?? 10
                }
              />
            </Field>
            <Field
              name="max_tokens_per_proposal"
              label="Tope por proyecto"
              hint="Evita que el reparto se vuelva una elección única."
              required
            >
              <Input
                name="max_tokens_per_proposal"
                type="number"
                inputMode="numeric"
                min="1"
                max="100"
                required
                value={
                  create.formData?.get("max_tokens_per_proposal")?.toString() ??
                  4
                }
              />
            </Field>
          </div>

          <fieldset class="grid gap-4 sm:grid-cols-2">
            <legend class="mb-1 text-sm font-medium text-ink-strong">
              {translate(locale, "Calendario de la ronda")}
            </legend>
            <Field
              name="proposals_close_at"
              label="Cierra la admisión"
              required
            >
              <Input
                name="proposals_close_at"
                type="datetime-local"
                required
                value={create.formData?.get("proposals_close_at")?.toString()}
              />
            </Field>
            <Field name="voting_opens_at" label="Abre la votación" required>
              <Input
                name="voting_opens_at"
                type="datetime-local"
                required
                value={create.formData?.get("voting_opens_at")?.toString()}
              />
            </Field>
            <Field name="voting_closes_at" label="Cierra la votación" required>
              <Input
                name="voting_closes_at"
                type="datetime-local"
                required
                value={create.formData?.get("voting_closes_at")?.toString()}
              />
            </Field>
            <Field
              name="report_due_at"
              label="Vence la rendición"
              hint="Después de esta fecha, un proyecto financiado sin rendición queda marcado."
              required
            >
              <Input
                name="report_due_at"
                type="datetime-local"
                required
                value={create.formData?.get("report_due_at")?.toString()}
              />
            </Field>
          </fieldset>

          <SubmitButton size="lg" pending={create.isRunning}>
            {translate(locale, "Abrir la ronda")}
          </SubmitButton>
        </Form>
      </Card>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const locale = resolveValue(useLocaleLoader) ?? DEFAULT_LOCALE;
  return {
    title: `${translate(locale, "Abrir una ronda de presupuesto")} · ${APP_NAME}`,
    meta: [{ name: "robots", content: "noindex" }],
  };
};
