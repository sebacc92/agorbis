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
import { CommunityPicker } from "~/components/community/CommunityPicker";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  ExternalLinkHint,
  Field,
  Input,
  SubmitButton,
  Textarea,
  buttonClass,
  cx,
  Icon,
} from "~/components/ui";
import { APP_NAME, LOAD_FAILED } from "~/lib/constants";
import { moderationRaiseMessage, writeFailure } from "~/lib/db-error";
import { formatDate, formatNumber } from "~/lib/format";
import { resolveLocale, useLocale, translate } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import { pageCount, pageHref, readPage } from "~/lib/pagination";
import { many, single } from "~/lib/query";
import { requestIdOf } from "~/lib/request-id";
import { requireModerator, supabase } from "~/lib/session";
import { safeInternalPath } from "~/lib/http";
import { safeHttpUrl } from "~/lib/url";
import { useLocaleLoader } from "../../layout";

const COMMUNITY_LEVEL_LABELS = {
  province: "Provincia o equivalente",
  city: "Ciudad o municipio",
  neighborhood: "Barrio",
} as const;

const ORGANIZATION_TYPE_LABELS = {
  government: "Organismo público",
  ngo: "Organización social",
  institution: "Institución",
  company: "Empresa",
  other: "Otra",
} as const;

const REQUESTS_PAGE_SIZE = 20;

export const onRequest: RequestHandler = (ev) => {
  ev.headers.set("Cache-Control", "private, no-store");
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const optionalCoordinate = (min: number, max: number) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().min(min).max(max).optional(),
  );

const QueuePagination = component$<{
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
      class="mt-4 flex items-center justify-between gap-2 border-t border-subtle pt-4"
    >
      {previous ? (
        <Link
          href={previous}
          class={cx(
            buttonClass("secondary", "sm"),
            "touch-target min-h-11 min-w-11 tabular-nums active:scale-90",
          )}
        >
          {translate(locale, "← Anterior")}
        </Link>
      ) : (
        <span />
      )}
      <span class="text-xs tabular-nums text-ink-muted">
        {translate(locale, "Página {{page}} de {{pages}}", {
          page: formatNumber(page, locale),
          pages: formatNumber(pages, locale),
        })}
      </span>
      {next ? (
        <Link
          href={next}
          class={cx(
            buttonClass("secondary", "sm"),
            "touch-target min-h-11 min-w-11 tabular-nums active:scale-90",
          )}
        >
          {translate(locale, "Siguiente")}{" "}
          <Icon name="arrow-right" class="text-[1.1em]" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
});

export const useRequestsQueue = routeLoader$(async (ev) => {
  await requireModerator(ev);
  const db = supabase(ev);
  const communityPage = readPage(ev.url.searchParams, "pagina-comunidades");
  const organizationPage = readPage(
    ev.url.searchParams,
    "pagina-organizaciones",
  );
  const communityFrom = (communityPage - 1) * REQUESTS_PAGE_SIZE;
  const organizationFrom = (organizationPage - 1) * REQUESTS_PAGE_SIZE;
  const [communityRes, organizationRes] = await Promise.all([
    db
      .from("community_requests")
      .select("*", { count: "exact" })
      .in("status", ["pending", "reviewing"])
      .order("created_at")
      .order("id")
      .range(communityFrom, communityFrom + REQUESTS_PAGE_SIZE - 1),
    db
      .from("organization_requests")
      .select("*", { count: "exact" })
      .eq("status", "pending")
      .order("created_at")
      .order("id")
      .range(organizationFrom, organizationFrom + REQUESTS_PAGE_SIZE - 1),
  ]);

  if (communityRes.error || organizationRes.error) {
    logFailure(
      { scope: "moderacion/solicitudes", requestId: requestIdOf(ev) },
      communityRes.error ?? organizationRes.error,
    );
    throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
  }

  const communityTotal = communityRes.count ?? 0;
  const organizationTotal = organizationRes.count ?? 0;
  const communityPages = pageCount(communityTotal, REQUESTS_PAGE_SIZE);
  const organizationPages = pageCount(organizationTotal, REQUESTS_PAGE_SIZE);
  if (communityPage > communityPages) {
    throw ev.redirect(
      302,
      pageHref(ev.url.searchParams, "pagina-comunidades", communityPages),
    );
  }
  if (organizationPage > organizationPages) {
    throw ev.redirect(
      302,
      pageHref(ev.url.searchParams, "pagina-organizaciones", organizationPages),
    );
  }

  const requests = communityRes.data ?? [];
  const parentIds = requests
    .map((request) => request.parent_community_id)
    .filter((id): id is string => !!id);
  const parents = parentIds.length
    ? await many(
        ev,
        "solicitudes/padres",
        db
          .from("communities")
          .select("id, slug, name, emoji, level, member_count")
          .in("id", parentIds),
      )
    : [];
  const parentById = new Map(
    (parents ?? []).map((parent) => [parent.id, parent]),
  );

  const candidates = await Promise.all(
    requests.map(async (request) => {
      const { data } = await db.rpc("global_search", {
        p_query: request.requested_name,
        p_kind: "community",
        p_community: request.parent_community_id ?? undefined,
        p_limit: 5,
        p_offset: 0,
      });
      return data ?? [];
    }),
  );

  return {
    communities: requests.map((request, index) => ({
      ...request,
      evidence_url: safeHttpUrl(request.evidence_url),
      parent: request.parent_community_id
        ? (parentById.get(request.parent_community_id) ?? null)
        : null,
      candidates: candidates[index].map((candidate) => ({
        ...candidate,
        href: safeInternalPath(candidate.href, "/buscar"),
      })),
    })),
    organizations: (organizationRes.data ?? []).map((request) => ({
      ...request,
      website: safeHttpUrl(request.website),
      evidence_url: safeHttpUrl(request.evidence_url),
    })),
    communityPager: {
      page: communityPage,
      pages: communityPages,
      total: communityTotal,
      previous:
        communityPage > 1
          ? pageHref(
              ev.url.searchParams,
              "pagina-comunidades",
              communityPage - 1,
            )
          : null,
      next:
        communityPage < communityPages
          ? pageHref(
              ev.url.searchParams,
              "pagina-comunidades",
              communityPage + 1,
            )
          : null,
    },
    organizationPager: {
      page: organizationPage,
      pages: organizationPages,
      total: organizationTotal,
      previous:
        organizationPage > 1
          ? pageHref(
              ev.url.searchParams,
              "pagina-organizaciones",
              organizationPage - 1,
            )
          : null,
      next:
        organizationPage < organizationPages
          ? pageHref(
              ev.url.searchParams,
              "pagina-organizaciones",
              organizationPage + 1,
            )
          : null,
    },
  };
});

export const useReviewCommunity = routeAction$(
  async (data, ev) => {
    await requireModerator(ev);
    const db = supabase(ev);

    if (data.decision === "approved") {
      if (!data.parent_slug) {
        return ev.fail(400, {
          message: "Elegí la comunidad superior antes de aprobar.",
        });
      }
      const parent = await single(
        ev,
        "solicitudes/padre",
        db
          .from("communities")
          .select("id")
          .eq("slug", data.parent_slug)
          .maybeSingle(),
      );
      if (!parent)
        return ev.fail(400, { message: "La comunidad superior no existe." });

      const { data: created, error } = await db.rpc(
        "approve_community_request",
        {
          p_request: data.request_id,
          p_parent: parent.id,
          p_slug: data.slug || undefined,
          p_emoji: data.emoji || undefined,
          p_description: data.description || undefined,
          p_lat: data.lat ?? undefined,
          p_lng: data.lng ?? undefined,
          p_resolution_note: data.resolution_note || undefined,
        },
      );
      if (error)
        return ev.fail(400, {
          message:
            moderationRaiseMessage(error) ??
            "No pudimos aprobar la solicitud. Revisá los datos.",
        });
      return { reviewed: true as const, created: created?.[0] ?? null };
    }

    const { data: request, error } = await db
      .from("community_requests")
      .update({
        status: data.decision,
        resolution_note: data.resolution_note || null,
      })
      .eq("id", data.request_id)
      .select("id")
      .maybeSingle();
    if (error || !request) {
      // `community_requests` pasa por el gate de participación (0039).
      const failure = writeFailure(
        error,
        "No pudimos actualizar la solicitud.",
      );
      return ev.fail(failure.status, { message: failure.message });
    }
    return { reviewed: true as const, created: null };
  },
  {
    validation: [
      zod$({
        request_id: z.string().uuid(),
        decision: z.enum(["reviewing", "approved", "rejected", "duplicate"]),
        parent_slug: z.string().trim().max(180).optional(),
        slug: z
          .string()
          .trim()
          .max(180)
          .regex(
            /^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/,
            "Usá minúsculas, números y guiones.",
          ),
        emoji: z.string().trim().max(12).optional(),
        description: z.string().trim().max(500).optional(),
        lat: optionalCoordinate(-90, 90),
        lng: optionalCoordinate(-180, 180),
        resolution_note: z.string().trim().max(1000).optional(),
      }),
    ],
    invalidate: [useRequestsQueue],
  },
);

export const useReviewOrganization = routeAction$(
  async (data, ev) => {
    await requireModerator(ev);
    const db = supabase(ev);
    if (data.action === "approve") {
      const { error } = await db.rpc("approve_organization_request", {
        p_request: data.request_id,
        p_slug: data.slug,
      });
      if (error)
        return ev.fail(400, {
          message:
            "No pudimos crear la organización. Revisá que el slug sea único.",
        });
    } else {
      const { data: request, error } = await db
        .from("organization_requests")
        .update({ status: "rejected" })
        .eq("id", data.request_id)
        .select("id")
        .maybeSingle();
      if (error || !request) {
        const failure = writeFailure(
          error,
          "No pudimos rechazar la solicitud.",
        );
        return ev.fail(failure.status, { message: failure.message });
      }
    }
    return { reviewed: true as const };
  },
  {
    validation: [
      zod$({
        request_id: z.string().uuid(),
        action: z.enum(["approve", "reject"]),
        slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
      }),
    ],
    invalidate: [useRequestsQueue],
  },
);

export default component$(() => {
  const queue = useRequestsQueue();
  const reviewCommunity = useReviewCommunity();
  const reviewOrganization = useReviewOrganization();
  // Una sola action para toda la cola: sin mirar a qué solicitud pertenece
  // el envío, aprobar una mostraba "pendiente" en todas y las bloqueaba.
  const reviewingCommunity = (id: string) =>
    reviewCommunity.isRunning &&
    reviewCommunity.formData?.get("request_id") === id;
  const reviewingOrganization = (id: string) =>
    reviewOrganization.isRunning &&
    reviewOrganization.formData?.get("request_id") === id;
  const locale = useLocale();
  const empty =
    queue.value.communities.length === 0 &&
    queue.value.organizations.length === 0;

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
          {translate(locale, "Solicitudes")}
        </h1>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Comunidades faltantes y representación institucional.",
          )}
        </p>
      </header>

      {reviewCommunity.value?.created && (
        <Alert tone="success" class="mt-4">
          {translate(locale, "Comunidad creada:")}{" "}
          <Link
            href={`/c/${reviewCommunity.value.created.slug}`}
            class="font-semibold underline"
          >
            {reviewCommunity.value.created.name}
          </Link>
          .
        </Alert>
      )}
      {(reviewCommunity.value?.message ||
        reviewOrganization.value?.message) && (
        <Alert class="mt-4">
          {translate(
            locale,
            reviewCommunity.value?.message ??
              reviewOrganization.value?.message ??
              "",
          )}
        </Alert>
      )}

      {empty ? (
        <div class="mt-7">
          <EmptyState
            emoji="✅"
            title={translate(locale, "No hay solicitudes pendientes")}
          />
        </div>
      ) : (
        <div class="mt-7 grid gap-7 lg:grid-cols-2">
          <section>
            <h2 class="text-lg font-semibold">
              {translate(locale, "Comunidades")}{" "}
              <Badge tone="neutral">
                {formatNumber(queue.value.communityPager.total, locale)}
              </Badge>
            </h2>
            <p class="mt-1 text-xs text-ink-faint">
              {translate(locale, "Pendientes y en revisión")}
            </p>
            <ul class="mt-3 space-y-3">
              {queue.value.communities.map((request) => (
                <li key={request.id}>
                  <Card class="p-5">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="font-semibold">{request.requested_name}</h3>
                      <Badge tone="neutral">
                        {translate(
                          locale,
                          COMMUNITY_LEVEL_LABELS[
                            request.requested_level as keyof typeof COMMUNITY_LEVEL_LABELS
                          ] ?? request.requested_level,
                        )}
                      </Badge>
                      <Badge
                        tone={request.status === "reviewing" ? "brand" : "warn"}
                      >
                        {translate(
                          locale,
                          request.status === "reviewing"
                            ? "En revisión"
                            : "Pendiente",
                        )}
                      </Badge>
                      <span class="ml-auto text-xs text-ink-faint">
                        {formatDate(request.created_at, locale)}
                      </span>
                    </div>
                    <p class="mt-1 text-sm text-ink-muted">{request.country}</p>
                    <p class="mt-3 text-sm text-ink">{request.reason}</p>
                    {request.evidence_url && (
                      <a
                        href={request.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="mt-2 inline-block text-sm text-brand hover:underline"
                      >
                        {translate(locale, "Ver fuente")}
                        <ExternalLinkHint />
                      </a>
                    )}

                    {request.candidates.length > 0 && (
                      <div class="mt-4 rounded-2xl border border-warn-400/40 bg-warn-400/10 p-3">
                        <p class="text-xs font-semibold text-warn">
                          {translate(locale, "Posibles duplicados")}
                        </p>
                        <ul class="mt-2 space-y-1">
                          {request.candidates.map((candidate) => (
                            <li key={candidate.id}>
                              <Link
                                href={candidate.href}
                                class="text-sm text-brand hover:underline"
                              >
                                {candidate.community_emoji} {candidate.title} ·{" "}
                                {translate(locale, "Comunidad existente")}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <Form
                      action={reviewCommunity}
                      class="mt-4 space-y-3 border-t border-subtle pt-4"
                    >
                      <input
                        type="hidden"
                        name="request_id"
                        value={request.id}
                      />
                      <CommunityPicker
                        name="parent_slug"
                        label="Comunidad superior"
                        hint="La aprobación calculará automáticamente nivel, path y un slug único."
                        initial={
                          request.parent
                            ? {
                                slug: request.parent.slug,
                                name: request.parent.name,
                                emoji: request.parent.emoji,
                                level: request.parent.level,
                                memberCount: request.parent.member_count,
                              }
                            : null
                        }
                      />
                      {/* Slug, emoji, descripción y coordenadas son ajustes
                          opcionales: abiertos, cada solicitud ocupaba siete
                          campos y la cola se volvía una pared de formularios
                          (D96). Plegados se siguen enviando con la decisión.

                          La cola dibuja este formulario una vez por solicitud
                          pendiente, así que los `id` derivados del `name` se
                          repetían: todos los `<label for="slug">` apuntaban al
                          campo de la primera tarjeta. Tocar "Slug preferido"
                          en la cuarta solicitud enfocaba la de arriba de todo,
                          y un lector de pantalla leía los campos sin etiqueta.
                          El `id` se sufija con la solicitud. */}
                      <details class="rounded-2xl border border-subtle px-3 py-2">
                        <summary class="flex min-h-11 cursor-pointer items-center text-sm font-medium text-brand">
                          {translate(
                            locale,
                            "Ajustar datos de la comunidad (opcional)",
                          )}
                        </summary>
                        <div class="mt-2 space-y-3 pb-2">
                          <div class="grid gap-3 sm:grid-cols-[1fr_5rem]">
                            <Field
                              name={`slug-${request.id}`}
                              label="Slug preferido"
                              hint="Opcional: si está ocupado se genera uno único."
                            >
                              <Input
                                name="slug"
                                id={`slug-${request.id}`}
                                value={slugify(request.requested_name)}
                              />
                            </Field>
                            <Field name={`emoji-${request.id}`} label="Emoji">
                              <Input
                                name="emoji"
                                id={`emoji-${request.id}`}
                                maxLength={12}
                                placeholder="📍"
                              />
                            </Field>
                          </div>
                          <Field
                            name={`description-${request.id}`}
                            label="Descripción pública"
                          >
                            <Textarea
                              name="description"
                              id={`description-${request.id}`}
                              rows={2}
                              value={`${request.requested_name}, ${request.country}.`}
                            />
                          </Field>
                          <div class="grid gap-3 sm:grid-cols-2">
                            <Field name={`lat-${request.id}`} label="Latitud">
                              <Input
                                name="lat"
                                id={`lat-${request.id}`}
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="-90"
                                max="90"
                              />
                            </Field>
                            <Field name={`lng-${request.id}`} label="Longitud">
                              <Input
                                name="lng"
                                id={`lng-${request.id}`}
                                type="number"
                                inputMode="decimal"
                                step="any"
                                min="-180"
                                max="180"
                              />
                            </Field>
                          </div>
                        </div>
                      </details>
                      <Field
                        name={`resolution_note-${request.id}`}
                        label="Nota para quien solicitó"
                      >
                        <Textarea
                          name="resolution_note"
                          id={`resolution_note-${request.id}`}
                          rows={2}
                        />
                      </Field>
                      <div class="flex flex-wrap gap-2">
                        <SubmitButton
                          name="decision"
                          value="approved"
                          size="sm"
                          disabled={reviewingCommunity(request.id)}
                          pending={
                            reviewingCommunity(request.id) &&
                            reviewCommunity.formData?.get("decision") ===
                              "approved"
                          }
                        >
                          {translate(locale, "Crear y aprobar")}
                        </SubmitButton>
                        <SubmitButton
                          name="decision"
                          value="reviewing"
                          variant="secondary"
                          size="sm"
                          disabled={reviewingCommunity(request.id)}
                          pending={
                            reviewingCommunity(request.id) &&
                            reviewCommunity.formData?.get("decision") ===
                              "reviewing"
                          }
                        >
                          {translate(locale, "Dejar en revisión")}
                        </SubmitButton>
                        <SubmitButton
                          name="decision"
                          value="duplicate"
                          variant="secondary"
                          size="sm"
                          disabled={reviewingCommunity(request.id)}
                          pending={
                            reviewingCommunity(request.id) &&
                            reviewCommunity.formData?.get("decision") ===
                              "duplicate"
                          }
                        >
                          {translate(locale, "Marcar duplicada")}
                        </SubmitButton>
                        <SubmitButton
                          name="decision"
                          value="rejected"
                          variant="danger"
                          size="sm"
                          disabled={reviewingCommunity(request.id)}
                          pending={
                            reviewingCommunity(request.id) &&
                            reviewCommunity.formData?.get("decision") ===
                              "rejected"
                          }
                        >
                          {translate(locale, "Rechazar")}
                        </SubmitButton>
                      </div>
                    </Form>
                  </Card>
                </li>
              ))}
            </ul>
            <QueuePagination
              label="Páginas de solicitudes de comunidades"
              {...queue.value.communityPager}
            />
          </section>

          <section>
            <h2 class="text-lg font-semibold">
              {translate(locale, "Instituciones")}{" "}
              <Badge tone="neutral">
                {formatNumber(queue.value.organizationPager.total, locale)}
              </Badge>
            </h2>
            <p class="mt-1 text-xs text-ink-faint">
              {translate(locale, "Pendientes de verificación")}
            </p>
            <ul class="mt-3 space-y-3">
              {queue.value.organizations.map((request) => (
                <li key={request.id}>
                  <Card class="p-5">
                    <div class="flex items-center gap-2">
                      <h3 class="font-semibold">{request.name}</h3>
                      <Badge tone="brand">
                        {translate(
                          locale,
                          ORGANIZATION_TYPE_LABELS[
                            request.type as keyof typeof ORGANIZATION_TYPE_LABELS
                          ] ?? request.type,
                        )}
                      </Badge>
                      <Badge tone="warn">
                        {translate(locale, "Pendiente")}
                      </Badge>
                    </div>
                    <p class="mt-3 text-sm text-ink">{request.message}</p>
                    <div class="mt-2 flex gap-3 text-sm">
                      {request.website && (
                        <a
                          href={request.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-brand hover:underline"
                        >
                          {translate(locale, "Sitio")}
                          <ExternalLinkHint />
                        </a>
                      )}
                      {request.evidence_url && (
                        <a
                          href={request.evidence_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-brand hover:underline"
                        >
                          {translate(locale, "Evidencia")}
                          <ExternalLinkHint />
                        </a>
                      )}
                    </div>
                    <Form
                      action={reviewOrganization}
                      class="mt-4 flex flex-wrap items-end gap-2 border-t border-subtle pt-4"
                    >
                      <input
                        type="hidden"
                        name="request_id"
                        value={request.id}
                      />
                      <Field
                        name={`org-slug-${request.id}`}
                        label="Slug"
                        class="min-w-48 flex-1"
                      >
                        <Input
                          name="slug"
                          id={`org-slug-${request.id}`}
                          required
                          value={slugify(request.name)}
                        />
                      </Field>
                      <SubmitButton
                        name="action"
                        value="approve"
                        size="sm"
                        disabled={reviewingOrganization(request.id)}
                        pending={
                          reviewingOrganization(request.id) &&
                          reviewOrganization.formData?.get("action") ===
                            "approve"
                        }
                      >
                        {translate(locale, "Verificar")}
                      </SubmitButton>
                      <SubmitButton
                        name="action"
                        value="reject"
                        variant="danger"
                        size="sm"
                        disabled={reviewingOrganization(request.id)}
                        pending={
                          reviewingOrganization(request.id) &&
                          reviewOrganization.formData?.get("action") ===
                            "reject"
                        }
                      >
                        {translate(locale, "Rechazar")}
                      </SubmitButton>
                    </Form>
                  </Card>
                </li>
              ))}
            </ul>
            <QueuePagination
              label="Páginas de solicitudes de instituciones"
              {...queue.value.organizationPager}
            />
          </section>
        </div>
      )}
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Solicitudes")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
