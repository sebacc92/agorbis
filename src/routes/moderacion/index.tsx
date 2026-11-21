import { component$ } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  zod$,
  z,
  type DocumentHead,
  type RequestHandler,
} from "@qwik.dev/router";
import {
  Icon,
  Alert,
  Badge,
  Card,
  EmptyState,
  SubmitButton,
  buttonClass,
  cx,
} from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { routes } from "~/lib/community";
import { APP_NAME, LOAD_FAILED } from "~/lib/constants";
import type { ReportTargetType } from "~/lib/database.types.helpers";
import {
  OPEN_REPORT_STATUSES,
  REPORT_TARGETS,
  closeReportsForTarget,
  countOpenReports,
  groupReports,
  isOpenReport,
  oldestFirst,
  type QueueReport,
  type ReportFilter,
} from "~/lib/moderation-queue";

import { resolveLocale, useLocale, translate } from "~/lib/i18n";
import { writeFailure } from "~/lib/db-error";
import { formatNumber } from "~/lib/format";
import { logFailure } from "~/lib/log";
import { pageCount, pageHref, readPage } from "~/lib/pagination";
import { many } from "~/lib/query";
import { requestIdOf } from "~/lib/request-id";
import { requireModerator, supabase } from "~/lib/session";
import { useLocaleLoader, useViewer } from "../layout";

/** Cantidad o `null` si no se pudo contar: un contador nunca inventa un cero. */
function countOf(result: { count: number | null; error: unknown }) {
  return result.error ? null : (result.count ?? 0);
}

const REPORTS_PAGE_SIZE = 30;

export const onRequest: RequestHandler = (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
};

export const useQueue = routeLoader$(async (ev) => {
  await requireModerator(ev);
  const db = supabase(ev);

  const requested = ev.url.searchParams.get("estado");
  const filter: ReportFilter =
    requested === "todos" ||
    requested === "reviewing" ||
    requested === "resolved" ||
    requested === "dismissed"
      ? requested
      : "pending";
  const page = readPage(ev.url.searchParams);
  const from = (page - 1) * REPORTS_PAGE_SIZE;

  let query = db
    .from("reports")
    .select(
      "id, target_type, target_id, reason, status, created_at, profiles:reporter_id (username)",
      { count: "exact" },
    )
    .order("created_at", { ascending: oldestFirst(filter) })
    .order("id", { ascending: oldestFirst(filter) })
    .range(from, from + REPORTS_PAGE_SIZE - 1);

  if (filter !== "todos") query = query.eq("status", filter);

  const reportsResult = await query;
  if (reportsResult.error) {
    logFailure(
      { scope: "moderacion/reportes", requestId: requestIdOf(ev) },
      reportsResult.error,
    );
    throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
  }
  const reports = reportsResult.data ?? [];
  const total = reportsResult.count ?? 0;
  const pages = pageCount(total, REPORTS_PAGE_SIZE);
  if (page > pages) {
    throw ev.redirect(302, pageHref(ev.url.searchParams, "pagina", pages));
  }

  // Traemos el contenido reportado agrupado por tabla: una consulta por tipo,
  // no una por reporte.
  const byTable = new Map<string, string[]>();
  for (const report of reports) {
    const target = REPORT_TARGETS[report.target_type as ReportTargetType];
    if (!target) continue;
    byTable.set(target.table, [
      ...(byTable.get(target.table) ?? []),
      report.target_id,
    ]);
  }

  const previews = new Map<
    string,
    { preview: string; status: string; href: string | null }
  >();

  await Promise.all(
    [...byTable.entries()].map(async ([table, ids]) => {
      if (table === "debate_comments") {
        const rows = await many(
          ev,
          "moderacion/debate_comments",
          db
            .from("debate_comments")
            .select("id, body, status, debate_id")
            .in("id", ids),
        );
        for (const row of rows) {
          previews.set(row.id, {
            preview: row.body,
            status: row.status,
            href: routes.debate(row.debate_id),
          });
        }
      } else if (table === "claims") {
        const rows = await many(
          ev,
          "moderacion/claims",
          db.from("claims").select("id, title, status").in("id", ids),
        );
        for (const row of rows) {
          previews.set(row.id, {
            preview: row.title,
            status: row.status,
            href: routes.claim(row.id),
          });
        }
      } else if (table === "projects") {
        const rows = await many(
          ev,
          "moderacion/projects",
          db.from("projects").select("id, title, status").in("id", ids),
        );
        for (const row of rows) {
          previews.set(row.id, {
            preview: row.title,
            status: row.status,
            href: routes.project(row.id),
          });
        }
      } else if (table === "polls") {
        const rows = await many(
          ev,
          "moderacion/polls",
          db.from("polls").select("id, question, status").in("id", ids),
        );
        for (const row of rows) {
          previews.set(row.id, {
            preview: row.question,
            status: row.status,
            href: routes.poll(row.id),
          });
        }
      } else if (table === "debates") {
        const rows = await many(
          ev,
          "moderacion/debates",
          db.from("debates").select("id, title, status").in("id", ids),
        );
        for (const row of rows) {
          previews.set(row.id, {
            preview: row.title,
            status: row.status,
            href: routes.debate(row.id),
          });
        }
      } else if (table === "agreements") {
        // La policy de lectura deja ver lo removido a quien modera (D120).
        const rows = await many(
          ev,
          "moderacion/agreements",
          db.from("agreements").select("id, title, status").in("id", ids),
        );
        for (const row of rows) {
          previews.set(row.id, {
            preview: row.title,
            status: row.status,
            href: routes.agreement(row.id),
          });
        }
      }
    }),
  );

  const items: QueueReport[] = (reports ?? []).map((report) => {
    const found = previews.get(report.target_id);
    const reporter = Array.isArray(report.profiles)
      ? report.profiles[0]
      : report.profiles;
    return {
      id: report.id,
      target_type: report.target_type as ReportTargetType,
      target_id: report.target_id,
      reason: report.reason,
      status: report.status as QueueReport["status"],
      created_at: report.created_at,
      reporter: reporter?.username ?? "—",
      preview: found?.preview ?? null,
      contentStatus: found?.status ?? null,
      href: found?.href ?? null,
    };
  });

  // El total abierto de cada contenido de la página, para que "Ocultar y
  // resolver" diga cuántos reportes cierra aunque algunos estén en otra.
  const targetIds = [...new Set(items.map((item) => item.target_id))];
  const openRows = targetIds.length
    ? await many(
        ev,
        "moderacion/reportes-abiertos",
        db
          .from("reports")
          .select("target_type, target_id")
          .in("status", [...OPEN_REPORT_STATUSES])
          .in("target_id", targetIds),
      )
    : [];

  // Contadores de cada estado y de las otras colas. Son orientativos: si uno
  // falla, la pestaña queda sin número en vez de mostrar un cero.
  const head = { count: "exact" as const, head: true };
  const [
    pending,
    reviewing,
    resolved,
    dismissed,
    communities,
    organizations,
    appeals,
  ] = await Promise.all([
    db.from("reports").select("id", head).eq("status", "pending"),
    db.from("reports").select("id", head).eq("status", "reviewing"),
    db.from("reports").select("id", head).eq("status", "resolved"),
    db.from("reports").select("id", head).eq("status", "dismissed"),
    db
      .from("community_requests")
      .select("id", head)
      .in("status", ["pending", "reviewing"]),
    db.from("organization_requests").select("id", head).eq("status", "pending"),
    db.from("moderation_appeals").select("id", head).eq("status", "pending"),
  ]);
  const requestsCount =
    countOf(communities) === null || countOf(organizations) === null
      ? null
      : countOf(communities)! + countOf(organizations)!;

  return {
    groups: groupReports(items, countOpenReports(openRows)),
    statusCounts: {
      pending: countOf(pending),
      reviewing: countOf(reviewing),
      resolved: countOf(resolved),
      dismissed: countOf(dismissed),
    } as Partial<Record<ReportFilter, number | null>>,
    queueCounts: { requests: requestsCount, appeals: countOf(appeals) },
    filter,
    page,
    pages,
    total,
    previous:
      page > 1 ? pageHref(ev.url.searchParams, "pagina", page - 1) : null,
    next:
      page < pages ? pageHref(ev.url.searchParams, "pagina", page + 1) : null,
  };
});

/** Ocultar o restaurar el contenido reportado. */
export const useModerateContent = routeAction$(
  async (data, ev) => {
    await requireModerator(ev);
    const db = supabase(ev);

    const target = REPORT_TARGETS[data.target_type as ReportTargetType];
    if (!target)
      return ev.fail(400, { message: "Tipo de contenido desconocido." });

    // Es un fallback para filas ocultas antes de la migración 0012. El trigger
    // `stamp_removal` restaura el estado exacto guardado al ocultarlas.
    const restoreStatus =
      target.table === "debate_comments"
        ? "visible"
        : target.table === "polls"
          ? "active"
          : target.table === "projects"
            ? "proposal"
            : "open";
    const nextStatus = data.action === "ocultar" ? "removed" : restoreStatus;

    // Un acuerdo no se actualiza directo: la RPC oculta o restaura con su
    // estado previo y sus rondas, y deja rastro (D120).
    if (data.target_type === "agreement") {
      const { error } = await db.rpc("moderate_agreement", {
        p_agreement: data.target_id,
        p_action: data.action === "ocultar" ? "hide" : "restore",
      });
      if (error) {
        const failure = writeFailure(
          error,
          "No pudimos actualizar el acuerdo.",
        );
        return ev.fail(failure.status, { message: failure.message });
      }
      return { done: true as const, action: data.action };
    }

    const { data: updated, error } = await db
      .from(target.table)
      .update({ status: nextStatus })
      .eq("id", data.target_id)
      .select("id")
      .maybeSingle();

    if (error || !updated) {
      // Moderar también pasa por el gate de participación (0039).
      const failure = writeFailure(
        error,
        "No pudimos actualizar el contenido.",
      );
      return ev.fail(failure.status, { message: failure.message });
    }

    return { done: true as const, action: data.action };
  },
  {
    validation: [
      zod$({
        target_type: z.enum([
          "debate_comment",
          "claim",
          "project",
          "poll",
          "debate",
          "agreement",
        ]),
        target_id: z.string().uuid(),
        action: z.enum(["ocultar", "restaurar"]),
      }),
    ],
    invalidate: [useQueue],
  },
);

/**
 * Cerrar de una vez todos los reportes abiertos de un contenido: ocultarlo y
 * resolverlos, resolverlos si ya estaba oculto, o descartarlos.
 */
export const useCloseReports = routeAction$(
  async (data, ev) => {
    await requireModerator(ev);
    const hide = data.decision === "ocultar-y-resolver";
    const result = await closeReportsForTarget(supabase(ev), {
      targetType: data.target_type,
      targetId: data.target_id,
      status: data.decision === "descartar" ? "dismissed" : "resolved",
      hide,
    });
    if (result.ok) {
      return { closed: result.closed, decision: data.decision };
    }
    if (result.stage === "hide") {
      const failure = writeFailure(
        result.error,
        "No pudimos ocultar el contenido. No se cerró ningún reporte.",
      );
      return ev.fail(failure.status, { message: failure.message });
    }
    const failure = writeFailure(
      result.error,
      hide
        ? "Ocultamos el contenido, pero no pudimos cerrar sus reportes. Volvé a intentarlo."
        : "No pudimos cerrar los reportes.",
    );
    return ev.fail(failure.status, { message: failure.message });
  },
  {
    validation: [
      zod$({
        target_type: z.enum([
          "debate_comment",
          "claim",
          "project",
          "poll",
          "debate",
          "agreement",
        ]),
        target_id: z.string().uuid(),
        decision: z.enum(["ocultar-y-resolver", "resolver", "descartar"]),
      }),
    ],
    invalidate: [useQueue],
  },
);

const FILTERS = [
  ["pending", "Pendientes"],
  ["reviewing", "En revisión"],
  ["resolved", "Resueltos"],
  ["dismissed", "Descartados"],
  ["todos", "Todos"],
] as const;

export default component$(() => {
  const data = useQueue();
  const viewer = useViewer();
  const moderate = useModerateContent();
  const close = useCloseReports();
  const locale = useLocale();

  /** El envío en curso es de esta tarjeta: las demás siguen disponibles. */
  const closing = (targetId: string) =>
    close.isRunning && close.formData?.get("target_id") === targetId;
  const moderating = (targetId: string) =>
    moderate.isRunning && moderate.formData?.get("target_id") === targetId;
  const queueLink = (
    href: string,
    label: string,
    count: number | null | undefined,
    reload = false,
  ) => (
    <Link
      href={href}
      reload={reload}
      class="inline-flex items-center gap-1.5 rounded-2xl border border-subtle bg-surface px-3 py-2 text-sm font-medium text-ink-strong hover:bg-muted"
    >
      {translate(locale, label)}
      {count !== null && count !== undefined && count > 0 && (
        <span class="rounded-full bg-warn-500/15 px-2 py-0.5 text-2xs font-semibold tabular-nums text-warn">
          {formatNumber(count, locale)}
        </span>
      )}
    </Link>
  );

  return (
    <div class="container-content py-8">
      <header class="mb-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-3xl font-semibold tracking-tight">
            {translate(locale, "Moderación")}
          </h1>
          <div class="flex flex-wrap gap-2">
            {viewer.value.profile?.role === "admin" &&
              queueLink(
                "/moderacion/eliminaciones/",
                "Solicitudes de eliminación",
                null,
              )}
            {queueLink(
              "/moderacion/solicitudes",
              "Solicitudes",
              data.value.queueCounts.requests,
            )}
            {queueLink(
              "/moderacion/apelaciones",
              "Apelaciones",
              data.value.queueCounts.appeals,
            )}
            {queueLink("/moderacion/cuentas", "Cuentas y auditoría", null)}
            {queueLink("/metricas", "Métricas", null)}
          </div>
        </div>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Cola de reportes, agrupada por contenido y desde el que más esperó. Ocultar contenido no lo borra: se puede restaurar.",
          )}
        </p>
      </header>

      <nav
        aria-label={translate(locale, "Filtrar reportes")}
        class="mb-5 flex flex-wrap gap-1 rounded-2xl bg-inset p-1"
      >
        {FILTERS.map(([key, label]) => {
          const count = data.value.statusCounts[key];
          return (
            <Link
              key={key}
              href={key === "pending" ? "?" : `?estado=${key}`}
              aria-current={data.value.filter === key ? "true" : undefined}
              class={cx(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                data.value.filter === key
                  ? "bg-surface text-ink-strong shadow-soft"
                  : "text-ink-muted hover:text-ink-strong",
              )}
            >
              {translate(locale, label)}
              {count !== null && count !== undefined && (
                <span class="tabular-nums text-ink-faint">
                  {formatNumber(count, locale)}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <p class="mb-4 text-sm text-ink-muted" aria-live="polite">
        {translate(locale, "{{count}} reportes en este estado", {
          count: formatNumber(data.value.total, locale),
        })}
        {data.value.pages > 1 && (
          <>
            {" "}
            ·{" "}
            {translate(locale, "Página {{page}} de {{pages}}", {
              page: formatNumber(data.value.page, locale),
              pages: formatNumber(data.value.pages, locale),
            })}
          </>
        )}
      </p>

      {(moderate.value?.message || close.value?.message) && (
        <Alert class="mb-4">
          {translate(
            locale,
            moderate.value?.message ?? close.value?.message ?? "",
          )}
        </Alert>
      )}
      {close.value?.closed !== undefined && (
        <Alert tone="success" class="mb-4">
          {translate(
            locale,
            close.value.closed === 0
              ? "Otra persona ya había cerrado estos reportes."
              : close.value.closed === 1
                ? "Se cerró 1 reporte."
                : "Se cerraron {{count}} reportes.",
            { count: formatNumber(close.value.closed, locale) },
          )}
        </Alert>
      )}

      {data.value.groups.length === 0 ? (
        <EmptyState
          emoji="🧹"
          title={translate(locale, "No hay nada en la cola")}
          description={translate(
            locale,
            "Cuando alguien reporte contenido, va a aparecer acá con su contexto.",
          )}
        />
      ) : (
        <ul class="grid gap-3 xl:grid-cols-2">
          {data.value.groups.map((group) => {
            const target = REPORT_TARGETS[group.target_type];
            const hidden = group.contentStatus === "removed";
            const open = group.openCount > 0;

            return (
              <li key={group.key}>
                <Card class="p-5">
                  <div class="mb-3 flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">
                      <span aria-hidden="true">{target.emoji}</span>{" "}
                      {translate(locale, target.label)}
                    </Badge>
                    {open && (
                      <Badge tone="warn">
                        {translate(
                          locale,
                          group.openCount === 1
                            ? "1 reporte abierto"
                            : "{{count}} reportes abiertos",
                          { count: formatNumber(group.openCount, locale) },
                        )}
                      </Badge>
                    )}
                    {hidden && (
                      <Badge tone="danger">
                        {translate(locale, "Contenido oculto")}
                      </Badge>
                    )}
                  </div>

                  <blockquote class="rounded-2xl bg-muted px-4 py-3">
                    <p
                      dir="auto"
                      class="line-clamp-3 text-sm break-words text-ink"
                    >
                      {group.preview ??
                        translate(locale, "(el contenido ya no existe)")}
                    </p>
                  </blockquote>

                  <ul class="mt-3 space-y-2">
                    {group.reports.map((item) => (
                      <li key={item.id} class="text-sm">
                        <span class="font-medium text-ink-strong">
                          {translate(locale, "Motivo del reporte:")}
                        </span>{" "}
                        <span class="text-ink-muted">{item.reason}</span>
                        <span class="block text-xs text-ink-faint">
                          @{item.reporter} ·{" "}
                          <RelativeTime value={item.created_at} />
                          {!isOpenReport(item.status) && (
                            <>
                              {" "}
                              ·{" "}
                              {translate(
                                locale,
                                item.status === "resolved"
                                  ? "Resuelto"
                                  : "Descartado",
                              )}
                            </>
                          )}
                          {item.status === "reviewing" && (
                            <> · {translate(locale, "En revisión")}</>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div class="mt-4 flex flex-wrap items-center gap-2">
                    {group.href && (
                      <Link
                        href={group.href}
                        class="text-sm font-medium text-brand hover:underline"
                      >
                        {translate(locale, "Ver en contexto")}
                        <Icon name="arrow-right" class="ml-1 text-sm" />
                      </Link>
                    )}

                    <div class="ml-auto flex flex-wrap gap-2">
                      {open && (
                        <Form action={close}>
                          <input
                            type="hidden"
                            name="target_type"
                            value={group.target_type}
                          />
                          <input
                            type="hidden"
                            name="target_id"
                            value={group.target_id}
                          />
                          <div class="flex flex-wrap gap-2">
                            {/* Un mismo formulario con dos decisiones: el
                                botón que se toca manda la suya. */}
                            <SubmitButton
                              name="decision"
                              value={hidden ? "resolver" : "ocultar-y-resolver"}
                              variant={hidden ? "success" : "danger"}
                              size="sm"
                              pending={
                                closing(group.target_id) &&
                                close.formData?.get("decision") !== "descartar"
                              }
                              disabled={closing(group.target_id)}
                            >
                              {translate(
                                locale,
                                hidden
                                  ? "Marcar resueltos ({{count}})"
                                  : "Ocultar y resolver ({{count}})",
                                {
                                  count: formatNumber(group.openCount, locale),
                                },
                              )}
                            </SubmitButton>
                            <SubmitButton
                              name="decision"
                              value="descartar"
                              variant="ghost"
                              size="sm"
                              pending={
                                closing(group.target_id) &&
                                close.formData?.get("decision") === "descartar"
                              }
                              disabled={closing(group.target_id)}
                            >
                              {translate(locale, "Descartar reportes")}
                            </SubmitButton>
                          </div>
                        </Form>
                      )}

                      {(hidden || !open) && (
                        <Form action={moderate}>
                          <input
                            type="hidden"
                            name="target_type"
                            value={group.target_type}
                          />
                          <input
                            type="hidden"
                            name="target_id"
                            value={group.target_id}
                          />
                          <input
                            type="hidden"
                            name="action"
                            value={hidden ? "restaurar" : "ocultar"}
                          />
                          <SubmitButton
                            variant={hidden ? "secondary" : "danger"}
                            size="sm"
                            pending={moderating(group.target_id)}
                            disabled={moderating(group.target_id)}
                          >
                            {translate(
                              locale,
                              hidden ? "Restaurar" : "Ocultar contenido",
                            )}
                          </SubmitButton>
                        </Form>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {(data.value.previous || data.value.next) && (
        <nav
          aria-label={translate(locale, "Páginas de reportes")}
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
            {translate(locale, "Página {{page}} de {{pages}}", {
              page: formatNumber(data.value.page, locale),
              pages: formatNumber(data.value.pages, locale),
            })}
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
  title: `${translate(resolveValue(useLocaleLoader), "Moderación")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
