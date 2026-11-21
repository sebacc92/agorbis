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
  Input,
  SubmitButton,
  Textarea,
  buttonClass,
  Icon,
} from "~/components/ui";
import { RelativeTime } from "~/components/ui/RelativeTime";
import { APP_NAME, LOAD_FAILED } from "~/lib/constants";
import { formatDate, formatNumber } from "~/lib/format";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import { pageCount, pageHref, readPage } from "~/lib/pagination";
import { requestIdOf } from "~/lib/request-id";
import type { UserRole } from "~/lib/database.types.helpers";
import { moderationRaiseMessage } from "~/lib/db-error";
import { requireModerator, roleLabel, supabase } from "~/lib/session";
import { useLocaleLoader } from "../../layout";

const PAGE_SIZE = 25;
const USERNAME = /^[a-z0-9_]{3,20}$/;

export const onRequest: RequestHandler = (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
};

function one<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

export const useAccountModeration = routeLoader$(async (ev) => {
  const viewer = await requireModerator(ev);
  const db = supabase(ev);
  const query = ev.url.searchParams.get("usuario")?.trim().toLowerCase() ?? "";
  const validQuery = !query || USERNAME.test(query);
  const suspensionPage = readPage(ev.url.searchParams, "pagina-suspensiones");
  const auditPage = readPage(ev.url.searchParams, "pagina-auditoria");
  const suspensionFrom = (suspensionPage - 1) * PAGE_SIZE;
  const auditFrom = (auditPage - 1) * PAGE_SIZE;

  const [profileRes, suspensionsRes, auditRes] = await Promise.all([
    validQuery && query
      ? db
          .from("profiles")
          .select("id, username, display_name, role")
          .eq("username", query)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db
      .from("user_suspensions")
      .select(
        "id, user_id, starts_at, ends_at, reason, created_at, lifted_at, lift_reason, user:profiles!user_suspensions_user_id_fkey(id, username, display_name, role), creator:profiles!user_suspensions_created_by_fkey(username)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(suspensionFrom, suspensionFrom + PAGE_SIZE - 1),
    db
      .from("moderation_audit_log")
      .select(
        "id, moderator_id, action, target_type, target_id, created_at, moderator:profiles!moderation_audit_log_moderator_id_fkey(username)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(auditFrom, auditFrom + PAGE_SIZE - 1),
  ]);

  const error = profileRes.error ?? suspensionsRes.error ?? auditRes.error;
  if (error) {
    logFailure(
      { scope: "moderacion/cuentas", requestId: requestIdOf(ev) },
      error,
    );
    throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
  }

  const suspensionTotal = suspensionsRes.count ?? 0;
  const auditTotal = auditRes.count ?? 0;
  const suspensionPages = pageCount(suspensionTotal, PAGE_SIZE);
  const auditPages = pageCount(auditTotal, PAGE_SIZE);
  if (suspensionPage > suspensionPages) {
    throw ev.redirect(
      302,
      pageHref(ev.url.searchParams, "pagina-suspensiones", suspensionPages),
    );
  }
  if (auditPage > auditPages) {
    throw ev.redirect(
      302,
      pageHref(ev.url.searchParams, "pagina-auditoria", auditPages),
    );
  }

  const profile = profileRes.data;
  const canSuspendProfile =
    !!profile &&
    (profile.role === "user" ||
      (viewer.profile?.role === "admin" && profile.role === "moderator"));
  const now = Date.now();

  return {
    query,
    validQuery,
    profile: profile ? { ...profile, canSuspend: canSuspendProfile } : null,
    suspensions: (suspensionsRes.data ?? []).map((suspension) => ({
      ...suspension,
      user: one(suspension.user),
      creator: one(suspension.creator),
      active:
        !suspension.lifted_at &&
        new Date(suspension.starts_at).getTime() <= now &&
        (!suspension.ends_at || new Date(suspension.ends_at).getTime() > now),
    })),
    audit: (auditRes.data ?? []).map((entry) => ({
      ...entry,
      moderator: one(entry.moderator),
    })),
    suspensionPager: {
      page: suspensionPage,
      pages: suspensionPages,
      total: suspensionTotal,
      previous:
        suspensionPage > 1
          ? pageHref(
              ev.url.searchParams,
              "pagina-suspensiones",
              suspensionPage - 1,
            )
          : null,
      next:
        suspensionPage < suspensionPages
          ? pageHref(
              ev.url.searchParams,
              "pagina-suspensiones",
              suspensionPage + 1,
            )
          : null,
    },
    auditPager: {
      page: auditPage,
      pages: auditPages,
      total: auditTotal,
      previous:
        auditPage > 1
          ? pageHref(ev.url.searchParams, "pagina-auditoria", auditPage - 1)
          : null,
      next:
        auditPage < auditPages
          ? pageHref(ev.url.searchParams, "pagina-auditoria", auditPage + 1)
          : null,
    },
  };
});

export const useSuspendAccount = routeAction$(
  async (data, ev) => {
    await requireModerator(ev);
    const durationDays =
      data.duration === "indefinite" ? null : Number(data.duration);
    const endsAt =
      durationDays === null
        ? null
        : new Date(Date.now() + durationDays * 86_400_000).toISOString();
    const { error } = await supabase(ev).rpc("suspend_user", {
      p_user: data.user_id,
      p_reason: data.reason,
      ...(endsAt ? { p_ends_at: endsAt } : {}),
    });
    if (error) {
      return ev.fail(400, {
        message:
          moderationRaiseMessage(error) ??
          "No pudimos aplicar la suspensión. Revisá la cuenta, el motivo y tus permisos.",
      });
    }
    return { suspended: true as const };
  },
  {
    validation: [
      zod$({
        user_id: z.string().uuid(),
        duration: z.enum(["1", "7", "30", "90", "indefinite"]),
        reason: z
          .string()
          .trim()
          .min(10, "El motivo necesita al menos 10 caracteres.")
          .max(1000, "El motivo puede tener hasta 1.000 caracteres."),
      }),
    ],
    invalidate: [useAccountModeration],
  },
);

export const useLiftSuspension = routeAction$(
  async (data, ev) => {
    await requireModerator(ev);
    const { data: lifted, error } = await supabase(ev).rpc(
      "lift_user_suspension",
      {
        p_suspension: data.suspension_id,
        p_reason: data.reason,
      },
    );
    if (error || !lifted) {
      return ev.fail(400, {
        message:
          moderationRaiseMessage(error) ??
          "No pudimos levantar la medida. Puede que ya haya finalizado o que no tengas permisos.",
      });
    }
    return { lifted: true as const };
  },
  {
    validation: [
      zod$({
        suspension_id: z.string().uuid(),
        reason: z
          .string()
          .trim()
          .min(3, "Dejá un motivo breve para la auditoría.")
          .max(1000),
      }),
    ],
    invalidate: [useAccountModeration],
  },
);

const Pager = component$<{
  label: string;
  page: number;
  pages: number;
  previous: string | null;
  next: string | null;
}>(({ label, page, pages, previous, next }) => {
  const locale = useLocale();
  if (!previous && !next) return null;
  return (
    <nav
      aria-label={translate(locale, label)}
      class="mt-4 flex items-center justify-between gap-2"
    >
      {previous ? (
        <Link href={previous} class={buttonClass("secondary", "sm")}>
          {translate(locale, "← Anterior")}
        </Link>
      ) : (
        <span />
      )}
      <span class="text-xs tabular-nums text-ink-muted">
        {formatNumber(page, locale)} / {formatNumber(pages, locale)}
      </span>
      {next ? (
        <Link href={next} class={buttonClass("secondary", "sm")}>
          {translate(locale, "Siguiente")}{" "}
          <Icon name="arrow-right" class="text-[1.1em]" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
});

export default component$(() => {
  const data = useAccountModeration();
  const suspend = useSuspendAccount();
  const lift = useLiftSuspension();
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
          {translate(locale, "Cuentas y auditoría")}
        </h1>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Las medidas son reversibles, notificables y quedan registradas en una auditoría inmutable.",
          )}
        </p>
      </header>

      <Card class="mt-6 p-5">
        <h2 class="text-lg font-semibold">
          {translate(locale, "Buscar cuenta")}
        </h2>
        <form method="get" class="mt-3 flex flex-wrap items-end gap-2">
          <Field
            name="usuario"
            label="Nombre de usuario"
            class="min-w-56 flex-1"
          >
            <Input
              name="usuario"
              required
              minLength={3}
              maxLength={20}
              pattern="[a-z0-9_]{3,20}"
              value={data.value.query}
              placeholder="usuario"
            />
          </Field>
          <button type="submit" class={buttonClass("secondary", "md")}>
            {translate(locale, "Buscar")}
          </button>
        </form>

        {!data.value.validQuery && (
          <Alert class="mt-4">
            {translate(
              locale,
              "Usá entre 3 y 20 letras minúsculas, números o guiones bajos.",
            )}
          </Alert>
        )}
        {data.value.validQuery && data.value.query && !data.value.profile && (
          <Alert class="mt-4">
            {translate(locale, "No encontramos esa cuenta.")}
          </Alert>
        )}
        {data.value.profile && (
          <div class="mt-4 rounded-2xl border border-subtle p-4">
            <div class="flex flex-wrap items-center gap-2">
              <Link
                href={publicProfileHref(data.value.profile)}
                class="font-semibold text-brand hover:underline"
              >
                @{data.value.profile.username}
              </Link>
              <Badge tone="neutral">
                {translate(
                  locale,
                  roleLabel(data.value.profile.role as UserRole) ??
                    data.value.profile.role,
                )}
              </Badge>
            </div>
            {data.value.profile.canSuspend ? (
              <Form
                action={suspend}
                class="mt-4 space-y-3 border-t border-subtle pt-4"
              >
                <input
                  type="hidden"
                  name="user_id"
                  value={data.value.profile.id}
                />
                <div class="grid gap-3 sm:grid-cols-[12rem_1fr]">
                  <Field name="duration" label="Duración">
                    <select
                      name="duration"
                      required
                      class="min-h-11 w-full rounded-2xl border border-control bg-surface px-3 text-sm text-ink-strong"
                    >
                      <option value="1">{translate(locale, "1 día")}</option>
                      <option value="7">{translate(locale, "7 días")}</option>
                      <option value="30">{translate(locale, "30 días")}</option>
                      <option value="90">{translate(locale, "90 días")}</option>
                      <option value="indefinite">
                        {translate(locale, "Indefinida")}
                      </option>
                    </select>
                  </Field>
                  <Field
                    name="reason"
                    label="Motivo visible para la persona"
                    error={suspend.value?.fieldErrors?.reason}
                  >
                    <Textarea
                      name="reason"
                      required
                      minLength={10}
                      maxLength={1000}
                      rows={3}
                    />
                  </Field>
                </div>
                <SubmitButton variant="danger" pending={suspend.isRunning}>
                  {translate(locale, "Aplicar suspensión")}
                </SubmitButton>
              </Form>
            ) : (
              <Alert tone="warn" class="mt-3">
                {translate(locale, "Tu rol no puede suspender esta cuenta.")}
              </Alert>
            )}
          </div>
        )}
      </Card>

      {(suspend.value?.message || lift.value?.message) && (
        <Alert class="mt-4">
          {translate(
            locale,
            suspend.value?.message ?? lift.value?.message ?? "",
          )}
        </Alert>
      )}
      {(suspend.value?.suspended || lift.value?.lifted) && (
        <Alert tone="success" class="mt-4">
          {translate(locale, "La medida se actualizó y quedó auditada.")}
        </Alert>
      )}

      <section class="mt-8">
        <h2 class="text-xl font-semibold">
          {translate(locale, "Historial de suspensiones")}{" "}
          <Badge tone="neutral">
            {formatNumber(data.value.suspensionPager.total, locale)}
          </Badge>
        </h2>
        {data.value.suspensions.length === 0 ? (
          <div class="mt-4">
            <EmptyState
              emoji="✅"
              title={translate(locale, "No hay suspensiones")}
            />
          </div>
        ) : (
          <ul class="mt-4 grid gap-3 lg:grid-cols-2">
            {data.value.suspensions.map((item) => (
              <li key={item.id}>
                <Card class="p-4">
                  <div class="flex flex-wrap items-center gap-2">
                    <Badge tone={item.active ? "danger" : "neutral"}>
                      {translate(locale, item.active ? "Activa" : "Finalizada")}
                    </Badge>
                    {item.user && (
                      <Link
                        href={publicProfileHref(item.user)}
                        class="font-medium text-brand hover:underline"
                      >
                        @{item.user.username}
                      </Link>
                    )}
                    <span class="ml-auto text-xs text-ink-faint">
                      {formatDate(item.created_at, locale)}
                    </span>
                  </div>
                  <p
                    dir="auto"
                    class="mt-3 whitespace-pre-line text-sm text-ink-muted"
                  >
                    {item.reason}
                  </p>
                  {item.ends_at && item.active && (
                    <p class="mt-2 text-xs text-ink-faint">
                      {translate(locale, "Finaliza")}{" "}
                      <RelativeTime value={item.ends_at} />
                    </p>
                  )}
                  {item.lift_reason && (
                    <p class="mt-2 text-xs text-success">
                      {translate(locale, "Levantada:")} {item.lift_reason}
                    </p>
                  )}
                  {item.active && (
                    <Form
                      action={lift}
                      class="mt-3 flex flex-wrap items-end gap-2 border-t border-subtle pt-3"
                    >
                      <input
                        type="hidden"
                        name="suspension_id"
                        value={item.id}
                      />
                      <Field
                        name={`lift-${item.id}`}
                        label="Motivo para levantar"
                        class="min-w-48 flex-1"
                      >
                        <Input
                          id={`lift-${item.id}`}
                          name="reason"
                          required
                          minLength={3}
                          maxLength={1000}
                        />
                      </Field>
                      <SubmitButton
                        variant="secondary"
                        size="sm"
                        disabled={lift.isRunning}
                        pending={
                          lift.isRunning &&
                          lift.formData?.get("suspension_id") === item.id
                        }
                      >
                        {translate(locale, "Levantar")}
                      </SubmitButton>
                    </Form>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
        <Pager
          label="Páginas de suspensiones"
          {...data.value.suspensionPager}
        />
      </section>

      <section class="mt-10 border-t border-subtle pt-8">
        <h2 class="text-xl font-semibold">
          {translate(locale, "Auditoría inmutable")}{" "}
          <Badge tone="neutral">
            {formatNumber(data.value.auditPager.total, locale)}
          </Badge>
        </h2>
        <p class="mt-1 text-sm text-ink-muted">
          {translate(
            locale,
            "Se muestra quién actuó, qué cambió y cuándo. El contenido sensible no se replica en esta vista.",
          )}
        </p>
        <ul class="mt-4 divide-y divide-[var(--border-subtle)] rounded-2xl border border-subtle bg-surface px-4">
          {data.value.audit.map((entry) => (
            <li
              key={entry.id}
              class="flex flex-wrap items-center gap-2 py-3 text-sm"
            >
              <Badge tone="neutral">{entry.action}</Badge>
              <span class="font-medium text-ink-strong">
                {entry.target_type}
              </span>
              {entry.target_id && (
                <code class="text-xs text-ink-faint">{entry.target_id}</code>
              )}
              <span class="ml-auto text-xs text-ink-faint">
                {entry.moderator ? `@${entry.moderator.username} · ` : ""}
                <RelativeTime value={entry.created_at} />
              </span>
            </li>
          ))}
        </ul>
        <Pager label="Páginas de auditoría" {...data.value.auditPager} />
      </section>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Cuentas y auditoría")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
