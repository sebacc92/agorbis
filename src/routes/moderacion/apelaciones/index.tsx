import { publicProfileHref } from "~/lib/public-profile";
import { component$ } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  z,
  zod$,
  type DocumentHead,
  type RequestHandler,
} from "@qwik.dev/router";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  Field,
  SubmitButton,
  Textarea,
  buttonClass,
  cx,
  Icon,
} from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { APP_NAME, LOAD_FAILED } from "~/lib/constants";
import { formatDate, formatNumber } from "~/lib/format";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import { pageCount, pageHref, readPage } from "~/lib/pagination";
import { requestIdOf } from "~/lib/request-id";
import { requireModerator, supabase } from "~/lib/session";
import { useLocaleLoader } from "../../layout";

const APPEALS_PAGE_SIZE = 30;
const FILTERS = [
  ["pending", "Pendientes"],
  ["reviewing", "En revisión"],
  ["accepted", "Aceptadas"],
  ["rejected", "Rechazadas"],
  ["todos", "Todas"],
] as const;

type AppealFilter = (typeof FILTERS)[number][0];

export const onRequest: RequestHandler = (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
};

function one<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

export const useAppealsQueue = routeLoader$(async (ev) => {
  await requireModerator(ev);
  const db = supabase(ev);
  const requested = ev.url.searchParams.get("estado");
  const filter: AppealFilter = FILTERS.some(([key]) => key === requested)
    ? (requested as AppealFilter)
    : "pending";
  const page = readPage(ev.url.searchParams);
  const from = (page - 1) * APPEALS_PAGE_SIZE;

  let query = db
    .from("moderation_appeals")
    .select(
      "id, suspension_id, appellant_id, body, status, resolution_note, created_at, updated_at, appellant:profiles!moderation_appeals_appellant_id_fkey(id, username, display_name), suspension:user_suspensions!moderation_appeals_suspension_id_fkey(reason, starts_at, ends_at, lifted_at)",
      { count: "exact" },
    )
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + APPEALS_PAGE_SIZE - 1);
  if (filter !== "todos") query = query.eq("status", filter);

  const result = await query;
  if (result.error) {
    logFailure(
      { scope: "moderacion/apelaciones", requestId: requestIdOf(ev) },
      result.error,
    );
    throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
  }

  const total = result.count ?? 0;
  const pages = pageCount(total, APPEALS_PAGE_SIZE);
  if (page > pages) {
    throw ev.redirect(302, pageHref(ev.url.searchParams, "pagina", pages));
  }

  return {
    filter,
    page,
    pages,
    total,
    previous:
      page > 1 ? pageHref(ev.url.searchParams, "pagina", page - 1) : null,
    next:
      page < pages ? pageHref(ev.url.searchParams, "pagina", page + 1) : null,
    items: (result.data ?? []).map((appeal) => ({
      ...appeal,
      appellant: one(appeal.appellant),
      suspension: one(appeal.suspension),
    })),
  };
});

export const useReviewAppeal = routeAction$(
  async (data, ev) => {
    await requireModerator(ev);
    const { data: reviewed, error } = await supabase(ev).rpc(
      "review_moderation_appeal",
      {
        p_appeal: data.appeal_id,
        p_status: data.status,
        p_resolution_note: data.resolution_note,
      },
    );
    if (error || !reviewed) {
      return ev.fail(400, {
        message:
          "No pudimos actualizar la apelación. Puede que otra persona ya la haya resuelto.",
      });
    }
    return { reviewed: true as const, status: data.status };
  },
  {
    validation: [
      zod$({
        appeal_id: z.string().uuid(),
        status: z.enum(["reviewing", "accepted", "rejected"]),
        resolution_note: z
          .string()
          .trim()
          .min(3, "Dejá un fundamento breve para la auditoría.")
          .max(1000, "El fundamento puede tener hasta 1.000 caracteres."),
      }),
    ],
    invalidate: [useAppealsQueue],
  },
);

const STATUS: Record<
  string,
  { label: string; tone: "warn" | "brand" | "success" | "danger" | "neutral" }
> = {
  pending: { label: "Pendiente", tone: "warn" },
  reviewing: { label: "En revisión", tone: "brand" },
  accepted: { label: "Aceptada", tone: "success" },
  rejected: { label: "Rechazada", tone: "danger" },
  withdrawn: { label: "Retirada", tone: "neutral" },
};

export default component$(() => {
  const data = useAppealsQueue();
  const review = useReviewAppeal();
  const locale = useLocale();

  return (
    <div class="container-content py-8">
      <header>
        <Link
          href="/moderacion"
          class="text-sm font-medium text-brand hover:underline"
        >
          ← {translate(locale, "Moderación")}
        </Link>
        <h1 class="mt-3 text-3xl font-semibold tracking-tight">
          {translate(locale, "Apelaciones")}
        </h1>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Revisá cada medida con su contexto y dejá un fundamento visible para la persona afectada.",
          )}
        </p>
      </header>

      <nav
        aria-label={translate(locale, "Filtrar apelaciones")}
        class="mt-6 flex flex-wrap gap-1 rounded-2xl bg-inset p-1"
      >
        {FILTERS.map(([key, label]) => (
          <Link
            key={key}
            href={key === "pending" ? "?" : `?estado=${key}`}
            aria-current={data.value.filter === key ? "true" : undefined}
            class={cx(
              "rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
              data.value.filter === key
                ? "bg-surface text-ink-strong shadow-soft"
                : "text-ink-muted hover:text-ink-strong",
            )}
          >
            {translate(locale, label)}
          </Link>
        ))}
      </nav>

      <p class="mt-4 text-sm text-ink-muted">
        {translate(
          locale,
          "{{count}} apelaciones · Página {{page}} de {{pages}}",
          {
            count: formatNumber(data.value.total, locale),
            page: formatNumber(data.value.page, locale),
            pages: formatNumber(data.value.pages, locale),
          },
        )}
      </p>

      {review.value?.message && (
        <Alert class="mt-4">{translate(locale, review.value.message)}</Alert>
      )}
      {review.value?.reviewed && (
        <Alert tone="success" class="mt-4">
          {translate(locale, "Apelación actualizada.")}
        </Alert>
      )}

      {data.value.items.length === 0 ? (
        <div class="mt-7">
          <EmptyState
            emoji="✅"
            title={translate(locale, "No hay apelaciones en este estado")}
          />
        </div>
      ) : (
        <ul class="mt-6 grid gap-4 xl:grid-cols-2">
          {data.value.items.map((appeal) => {
            const status = STATUS[appeal.status] ?? STATUS.pending!;
            const open = ["pending", "reviewing"].includes(appeal.status);
            return (
              <li key={appeal.id}>
                <Card class="p-5">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge tone={status.tone}>
                      {translate(locale, status.label)}
                    </Badge>
                    {appeal.appellant ? (
                      <Link
                        href={publicProfileHref(appeal.appellant)}
                        class="text-sm font-medium text-brand hover:underline"
                      >
                        @{appeal.appellant.username}
                      </Link>
                    ) : (
                      <span class="text-sm text-ink-faint">
                        {translate(locale, "Cuenta no disponible")}
                      </span>
                    )}
                    <RelativeTime
                      value={appeal.created_at}
                      class="ml-auto text-xs text-ink-faint"
                    />
                  </div>

                  {appeal.suspension && (
                    <div class="mt-3 rounded-2xl bg-muted p-4">
                      <p class="text-xs text-ink-faint">
                        {translate(locale, "Suspensión del {{date}}", {
                          date: formatDate(appeal.suspension.starts_at, locale),
                        })}
                      </p>
                      <p
                        dir="auto"
                        class="mt-1 whitespace-pre-line text-sm text-ink"
                      >
                        {appeal.suspension.reason}
                      </p>
                    </div>
                  )}

                  <div class="mt-3 border-l-2 border-brand-400 pl-3">
                    <p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                      {translate(locale, "Apelación")}
                    </p>
                    <p
                      dir="auto"
                      class="mt-1 whitespace-pre-line text-sm text-ink-muted"
                    >
                      {appeal.body}
                    </p>
                  </div>

                  {appeal.resolution_note && (
                    <p class="mt-3 border-t border-subtle pt-3 text-sm text-ink">
                      <strong>{translate(locale, "Resolución:")}</strong>{" "}
                      {appeal.resolution_note}
                    </p>
                  )}

                  {open && (
                    <Form
                      action={review}
                      class="mt-4 space-y-3 border-t border-subtle pt-4"
                    >
                      <input type="hidden" name="appeal_id" value={appeal.id} />
                      <Field
                        name={`resolution-${appeal.id}`}
                        label="Fundamento de la revisión"
                        error={
                          review.formData?.get("appeal_id") === appeal.id
                            ? review.value?.fieldErrors?.resolution_note
                            : undefined
                        }
                      >
                        <Textarea
                          id={`resolution-${appeal.id}`}
                          name="resolution_note"
                          required
                          minLength={3}
                          maxLength={1000}
                          rows={3}
                        />
                      </Field>
                      <div class="flex flex-wrap gap-2">
                        {appeal.status === "pending" && (
                          <SubmitButton
                            name="status"
                            value="reviewing"
                            variant="secondary"
                            size="sm"
                            disabled={review.isRunning}
                            pending={
                              review.isRunning &&
                              review.formData?.get("appeal_id") === appeal.id &&
                              review.formData?.get("status") === "reviewing"
                            }
                          >
                            {translate(locale, "Tomar revisión")}
                          </SubmitButton>
                        )}
                        <SubmitButton
                          name="status"
                          value="accepted"
                          variant="success"
                          size="sm"
                          disabled={review.isRunning}
                          pending={
                            review.isRunning &&
                            review.formData?.get("appeal_id") === appeal.id &&
                            review.formData?.get("status") === "accepted"
                          }
                        >
                          {translate(locale, "Aceptar y levantar")}
                        </SubmitButton>
                        <SubmitButton
                          name="status"
                          value="rejected"
                          variant="danger"
                          size="sm"
                          disabled={review.isRunning}
                          pending={
                            review.isRunning &&
                            review.formData?.get("appeal_id") === appeal.id &&
                            review.formData?.get("status") === "rejected"
                          }
                        >
                          {translate(locale, "Rechazar")}
                        </SubmitButton>
                      </div>
                    </Form>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {(data.value.previous || data.value.next) && (
        <nav
          aria-label={translate(locale, "Páginas de apelaciones")}
          class="mt-7 flex items-center justify-between gap-3 border-t border-subtle pt-5"
        >
          {data.value.previous ? (
            <Link
              href={data.value.previous}
              class={buttonClass("secondary", "sm")}
            >
              {translate(locale, "← Anterior")}
            </Link>
          ) : (
            <span />
          )}
          <span class="text-sm tabular-nums text-ink-muted">
            {formatNumber(data.value.page, locale)} /{" "}
            {formatNumber(data.value.pages, locale)}
          </span>
          {data.value.next ? (
            <Link href={data.value.next} class={buttonClass("secondary", "sm")}>
              {translate(locale, "Siguiente")}{" "}
              <Icon name="arrow-right" class="text-[1.1em]" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Apelaciones")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
