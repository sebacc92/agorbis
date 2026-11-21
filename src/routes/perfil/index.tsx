import {
  $,
  component$,
  useComputed$,
  useSignal,
  useTask$,
  useVisibleTask$,
} from "@qwik.dev/core";
import { RelativeTime } from "~/components/ui/RelativeTime";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  usePreventNavigate$,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import { CommunityBreadcrumb } from "~/components/community/CommunityBreadcrumb";
import { CivicPassportCard } from "~/components/profile/CivicPassportCard";
import { SavedBookmarksCard } from "~/components/profile/SavedBookmarksCard";
import { CharCounter } from "~/components/forms/FormShell";
import { useFieldErrorFocus } from "~/components/forms/useFieldErrorFocus";
import { QuotaGrid } from "~/components/quota/QuotaGrid";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  Icon,
  Input,
  SubmitButton,
  Textarea,
  buttonClass,
  cx,
  triggerHapticFeedback,
  MetaLine,
} from "~/components/ui";
import { contentHref, routes } from "~/lib/community";
import { APP_NAME, LEVEL_NAMES } from "~/lib/constants";
import {
  formatDate,
  formatInstant,
  formatMoney,
  formatNumber,
  pluralize,
} from "~/lib/format";
import { translate, useLocale } from "~/lib/i18n";
import { useTimeZone } from "~/lib/timezone";
import type { UserRole } from "~/lib/database.types.helpers";
import { CONTENT_TYPES } from "~/lib/quota";
import { reencodeImageForPrivateUpload } from "~/lib/client-image-privacy";
import { roleLabel } from "~/lib/session";
import {
  profileSectionHref,
  profilePageHref,
  profileActivityFilterHref,
  type ActivityKind,
  readProfileSection,
  type ProfileSection,
} from "~/lib/profile-navigation";
import {
  loadProfilePage,
  updateProfile,
  updateProfileSchema,
} from "~/lib/profile-page";
import { useLocaleLoader, useViewer } from "../layout";

// La consulta, el armado de la actividad y la subida del avatar viven en
// `~/lib/profile-page`; Qwik exige que el loader y la action se exporten desde
// acá.
export const useProfile = routeLoader$((ev) => loadProfilePage(ev), {
  search: [
    "actividad_antes",
    "actividad_id",
    "actividad_tipo",
    "actividad_filtro",
    "seguidos_antes",
    "seguidos_id",
    "publicaciones_antes",
    "publicaciones_id",
    "publicaciones_tipo",
  ],
});

export const useUpdateProfile = routeAction$(
  (data, ev) => updateProfile(data, ev),
  {
    validation: [zod$(updateProfileSchema)],
    invalidate: [useProfile, useViewer],
  },
);

export default component$(() => {
  const data = useProfile();
  const update = useUpdateProfile();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const location = useLocation();

  const {
    profile,
    residenceChain,
    following,
    activity,
    counts,
    published,
    badges,
  } = data.value;
  const homeSlug = residenceChain.at(-1)?.slug ?? null;
  if (!profile) return null;

  // La bio se corta en 300 caracteres sin decir nada: escribiendo, el texto
  // simplemente deja de aparecer. El contador es el mismo de los formularios
  // de creación, con el mismo comportamiento cerca del límite.
  const bio = useSignal(
    update.formData?.get("bio")?.toString() ?? data.value.profile?.bio ?? "",
  );
  const username = useSignal(
    update.formData?.get("username")?.toString() ?? profile.username,
  );
  const displayName = useSignal(
    update.formData?.get("display_name")?.toString() ??
      profile.display_name ??
      "",
  );
  const savedFields = useSignal({
    username: profile.username,
    displayName: profile.display_name ?? "",
    bio: profile.bio ?? "",
  });
  const removeAvatar = useSignal(
    update.formData?.get("remove_avatar") === "si" && !update.value?.saved,
  );
  const avatarProcessing = useSignal(false);
  const avatarProcessingFailed = useSignal(false);
  const avatarPreview = useSignal("");
  const avatarInput = useSignal<HTMLInputElement>();
  const avatarSelection = useSignal(0);

  const name = profile.display_name ?? profile.username;
  const home = residenceChain.at(-1);
  const badge = roleLabel(profile.role as UserRole);
  const totalActivity =
    counts.votes + counts.comments + counts.supports + counts.pledges;
  const activityFilter = data.value.activityFilter;
  const filteredActivityTotal =
    activityFilter === "all"
      ? totalActivity
      : {
          voto: counts.votes,
          comentario: counts.comments,
          apoyo: counts.supports,
          compromiso: counts.pledges,
        }[activityFilter];
  const activeTab = useComputed$(() =>
    readProfileSection(location.url.searchParams, !!update.formData),
  );
  const usernameError = useComputed$(() => update.value?.fieldErrors?.username);
  const usernameInvalid = useComputed$(() => !!usernameError.value);
  const profileError = useComputed$(() =>
    usernameError.value ? undefined : update.value?.message,
  );
  const usernameDescription = useComputed$(() =>
    usernameError.value ? "username-error username-hint" : "username-hint",
  );
  const usernameInput = useFieldErrorFocus(usernameError, update);
  const nextResidenceChange = useComputed$(() =>
    data.value.canChangeResidence ? null : data.value.nextChangeAt,
  );
  const dirty = useComputed$(
    () =>
      username.value !== savedFields.value.username ||
      displayName.value !== savedFields.value.displayName ||
      bio.value !== savedFields.value.bio ||
      removeAvatar.value ||
      !!avatarPreview.value ||
      avatarProcessing.value,
  );

  usePreventNavigate$((target) => {
    if (target === undefined || !dirty.value) return false;
    if (
      !window.confirm(
        translate(
          locale,
          "Tenés cambios de perfil sin guardar. ¿Querés salir y descartarlos?",
        ),
      )
    )
      return true;
    username.value = savedFields.value.username;
    displayName.value = savedFields.value.displayName;
    bio.value = savedFields.value.bio;
    removeAvatar.value = false;
    avatarPreview.value = "";
    avatarProcessing.value = false;
    avatarSelection.value += 1;
    if (avatarInput.value) avatarInput.value.value = "";
    return false;
  });

  // eslint-disable-next-line qwik/no-use-visible-task -- cerrar/recargar requiere un listener síncrono del navegador
  useVisibleTask$(
    ({ cleanup }) => {
      const warn = (event: BeforeUnloadEvent) => {
        if (!dirty.value) return;
        event.preventDefault();
        event.returnValue = "";
      };
      window.addEventListener("beforeunload", warn);
      cleanup(() => window.removeEventListener("beforeunload", warn));
    },
    { strategy: "document-ready" },
  );

  const clearSelectedAvatar = $(() => {
    avatarSelection.value += 1;
    avatarPreview.value = "";
    avatarProcessing.value = false;
    avatarProcessingFailed.value = false;
    if (avatarInput.value) avatarInput.value.value = "";
  });

  useTask$(({ track, cleanup }) => {
    const preview = track(() => avatarPreview.value);
    if (preview) cleanup(() => URL.revokeObjectURL(preview));
  });

  useTask$(({ track }) => {
    if (track(() => activeTab.value) !== "cuenta") {
      avatarPreview.value = "";
      avatarSelection.value += 1;
      avatarProcessing.value = false;
    }
  });

  return (
    <div class="container-content py-8 sm:py-12">
      {/* ------------------------------------------------------------ Cabecera */}
      {/* La misma banda teñida por nivel que una comunidad (D124): el perfil
          era texto plano con iniciales y no decía de dónde es la persona. El
          matiz sale de la comunidad propia; sin residencia, el de ciudad. */}
      <header
        class="level-band -mx-4 flex flex-wrap items-start gap-4 rounded-2xl px-4 pb-5 pt-6 sm:-mx-6 sm:px-6"
        style={{
          "--level-tint": `var(--level-${Math.min(5, Math.max(0, home?.level ?? 3))})`,
        }}
      >
        <Avatar src={profile.avatar_url} name={name} size="lg" />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h1 class="text-display-lg sm:text-display-xl">{name}</h1>
            {badge && <Badge tone="brand">{translate(locale, badge)}</Badge>}
          </div>
          <MetaLine class="mt-1 text-sm text-ink-muted">
            <span>@{profile.username}</span>
            <span>
              {translate(locale, "En Agorbis desde")}{" "}
              {formatDate(profile.created_at, locale)}
            </span>
            {home && (
              <span class="inline-flex items-center gap-1">
                <Icon name="map-pin" class="text-[1.1em]" />
                {home.name}
              </span>
            )}
          </MetaLine>
          {profile.bio && (
            <p class="mt-2 max-w-xl text-sm text-ink">{profile.bio}</p>
          )}
        </div>
      </header>

      {/* ------------------------------------------------ Selector de Pestañas */}
      <nav
        aria-label={translate(locale, "Secciones del perfil")}
        class="mt-6 scrollbar-slim -mx-4 flex snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 sm:mx-0 sm:px-0 border-b border-subtle"
      >
        {/* Íconos propios en vez de emoji (D123, D124). */}
        {(
          [
            { id: "resumen", label: "Resumen y Pasaporte", icon: "file-text" },
            {
              id: "publicaciones",
              label: "Publicaciones y Actividad",
              icon: "megaphone",
            },
            {
              id: "guardados",
              label: "Guardados y Comunidades",
              icon: "star",
              count: data.value.followsPage.total,
            },
            { id: "cuenta", label: "Configuración y Cuenta", icon: "settings" },
          ] as const
        ).map((tab) => {
          const isSelected = activeTab.value === tab.id;
          return (
            <Link
              key={tab.id}
              href={profileSectionHref(location.url, tab.id as ProfileSection)}
              aria-current={isSelected ? "page" : undefined}
              onClick$={() => {
                triggerHapticFeedback("selection");
              }}
              class={cx(
                "inline-flex min-h-11 shrink-0 snap-start cursor-pointer items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-all",
                isSelected
                  ? "border-brand-600 text-brand-600 dark:border-brand-500 dark:text-brand-400"
                  : "border-transparent text-ink-muted hover:border-strong hover:text-ink-strong",
              )}
            >
              <Icon name={tab.icon} class="text-[1.2em]" />
              <span>{translate(locale, tab.label)}</span>
              {"count" in tab && tab.count > 0 && (
                <span
                  class={cx(
                    "rounded-full px-2 py-0.5 text-3xs font-bold tabular-nums",
                    isSelected
                      ? "bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300"
                      : "bg-muted text-ink-muted",
                  )}
                >
                  {tab.count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* --------------------------------------------------- Pestaña: Resumen */}
      {activeTab.value === "resumen" && (
        <div class="space-y-6 mt-6 animate-fade-in">
          {/* Cadena de residencia */}
          <Card class="p-6 sm:p-8">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <h2 class="text-display-xs">
                  {translate(locale, "Tu residencia y comunidades")}
                </h2>
                <p class="mt-1 text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Declaraste una residencia principal y formás parte de",
                  )}{" "}
                  {pluralize(
                    residenceChain.length,
                    "comunidad territorial",
                    "comunidades territoriales",
                    locale,
                  )}
                  .{" "}
                  {translate(locale, "En todas ellas podés votar y comentar.")}
                </p>
              </div>

              <div class="flex max-w-64 flex-col items-end gap-2">
                <ButtonLink
                  href="/perfil/residencia"
                  variant="secondary"
                  size="sm"
                >
                  {translate(locale, "Revisar residencia")}
                </ButtonLink>
                {nextResidenceChange.value && (
                  <p class="text-right text-xs text-ink-faint">
                    {translate(locale, "Próxima mudanza")}:{" "}
                    <strong class="text-ink-muted">
                      {formatInstant(
                        nextResidenceChange.value,
                        locale,
                        timeZone,
                      )}
                    </strong>
                  </p>
                )}
              </div>
            </div>

            {home ? (
              <>
                <div class="mt-4">
                  <CommunityBreadcrumb chain={residenceChain} currentIsLink />
                </div>
                <ul class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {residenceChain.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={routes.community(c.slug)}
                        class="flex items-center gap-2.5 rounded-2xl border border-subtle bg-muted/50 px-3.5 py-2.5 transition-colors hover:border-brand-500"
                      >
                        <span aria-hidden="true" class="text-lg">
                          {c.emoji ?? "📍"}
                        </span>
                        <span class="min-w-0 flex-1 truncate text-sm font-medium text-ink-strong">
                          {c.name}
                        </span>
                        <span class="shrink-0 text-xs text-ink-faint">
                          {translate(locale, LEVEL_NAMES[c.level])}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div class="mt-4">
                <Alert tone="warn">
                  {translate(
                    locale,
                    "Todavía no elegiste dónde vivís, así que no podés participar en ningún lado.",
                  )}{" "}
                  <Link href="/onboarding" class="font-medium underline">
                    {translate(locale, "Elegí tu comunidad")}
                  </Link>
                  .
                </Alert>
              </div>
            )}
          </Card>

          {/* Cupo mensual */}
          <div>
            <QuotaGrid summary={data.value.quotaSummary} />
          </div>

          {/* El pasaporte va después de la residencia: lo útil primero. La
              tarjeta "Insignias de Impacto Vecinal" que seguía repetía los
              mismos sellos del pasaporte (décima ronda, mejora 10). Nombre,
              comunidad y fecha de alta ya los dice la banda (D126). */}
          <CivicPassportCard badges={badges} totalActions={totalActivity} />
        </div>
      )}

      {/* ---------------------------------- Pestaña: Publicaciones y Actividad */}
      {activeTab.value === "publicaciones" && (
        <div class="space-y-6 mt-6 animate-fade-in">
          {/* Lo que publicaste */}
          <Card class="p-6 sm:p-8">
            <h2 class="text-display-xs">
              {translate(locale, "Lo que publicaste")}
            </h2>
            <p class="mt-1 text-sm text-ink-muted">
              {translate(
                locale,
                "Las encuestas, debates, reclamos y proyectos que abriste vos.",
              )}
            </p>

            {published.length === 0 && data.value.publicationsPage.hasCursor ? (
              <p class="mt-4 text-sm text-ink-muted">
                {translate(locale, "No hay más publicaciones para mostrar.")}
              </p>
            ) : published.length === 0 ? (
              <p class="mt-4 rounded-2xl border border-dashed border-strong px-4 py-6 text-center text-sm text-ink-faint">
                {translate(locale, "Todavía no publicaste nada.")}{" "}
                {homeSlug && (
                  <Link
                    href={routes.community(homeSlug)}
                    class="font-medium text-brand hover:underline"
                  >
                    {translate(locale, "Empezá por tu comunidad")}
                  </Link>
                )}
              </p>
            ) : (
              <ul class="mt-4 space-y-2" data-profile-publications>
                {published.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <Link
                      href={contentHref(item.kind, item.id)}
                      class="flex items-center gap-3 rounded-2xl border border-subtle px-3 py-2.5 transition-colors hover:border-brand-500"
                    >
                      <span aria-hidden="true" class="text-lg">
                        {CONTENT_TYPES[item.kind].emoji}
                      </span>
                      <span
                        dir="auto"
                        class="min-w-0 flex-1 truncate text-sm font-medium text-ink-strong"
                      >
                        {item.title}
                      </span>
                      <RelativeTime
                        value={item.created_at}
                        class="shrink-0 text-xs text-ink-faint"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {(data.value.publicationsPage.hasCursor ||
              data.value.publicationsPage.nextCursor) && (
              <nav
                class="mt-4 flex flex-wrap gap-3 text-sm"
                aria-label={translate(locale, "Historial de tus publicaciones")}
              >
                {data.value.publicationsPage.hasCursor && (
                  <Link
                    href={profilePageHref(
                      location.url,
                      "publicaciones",
                      "publicaciones",
                    )}
                    class="inline-flex min-h-11 items-center text-brand hover:underline"
                  >
                    {translate(locale, "Volver a mis publicaciones recientes")}
                  </Link>
                )}
                {data.value.publicationsPage.nextCursor && (
                  <Link
                    href={profilePageHref(
                      location.url,
                      "publicaciones",
                      "publicaciones",
                      data.value.publicationsPage.nextCursor,
                    )}
                    class="inline-flex min-h-11 items-center text-brand hover:underline"
                  >
                    {translate(locale, "Ver publicaciones anteriores")}{" "}
                    <Icon name="arrow-right" class="text-[1.1em]" />
                  </Link>
                )}
              </nav>
            )}
          </Card>

          {/* Tu actividad */}
          <Card class="p-6 sm:p-8">
            <h2 class="text-display-xs">{translate(locale, "Tu actividad")}</h2>
            {filteredActivityTotal > activity.length && (
              <p class="mt-1 text-xs text-ink-faint">
                {translate(
                  locale,
                  "En esta página: {{shown}} de {{total}} actividades en total.",
                  {
                    shown: formatNumber(activity.length, locale),
                    total: formatNumber(filteredActivityTotal, locale),
                  },
                )}
              </p>
            )}
            <div class="mt-3 flex flex-wrap gap-x-8 gap-y-3">
              {(
                [
                  ["ballot", counts.votes, "votos"],
                  ["chat", counts.comments, "comentarios"],
                  ["users", counts.supports, "reclamos apoyados"],
                  ["handshake", counts.pledges, "compromisos"],
                ] as const
              ).map(([icon, count, label]) => (
                <div key={label}>
                  <p class="flex items-center gap-1.5 font-display text-display-sm tabular-nums text-ink-strong">
                    <Icon name={icon} class="text-base text-ink-muted" />
                    {formatNumber(count, locale)}
                  </p>
                  <p class="text-xs text-ink-faint">
                    {translate(locale, label)}
                  </p>
                </div>
              ))}
            </div>

            <div class="mt-5 flex flex-wrap gap-2">
              {[
                { id: "all", label: "Todas" },
                { id: "voto", label: "Votos" },
                { id: "comentario", label: "Comentarios" },
                { id: "apoyo", label: "Reclamos apoyados" },
                { id: "compromiso", label: "Compromisos" },
              ].map((tab) => (
                <Link
                  key={tab.id}
                  href={profileActivityFilterHref(
                    location.url,
                    tab.id as ActivityKind | "all",
                  )}
                  aria-current={activityFilter === tab.id ? "true" : undefined}
                  class={cx(
                    "inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    activityFilter === tab.id
                      ? "bg-brand-600 text-white"
                      : "bg-muted text-ink-muted hover:bg-muted/80 hover:text-ink-strong",
                  )}
                >
                  {translate(locale, tab.label)}
                </Link>
              ))}
            </div>

            {activity.length === 0 ? (
              <div class="mt-5">
                <EmptyState
                  illustration="sprout"
                  title={
                    activityFilter !== "all"
                      ? "No hay actividades en esta categoría."
                      : data.value.activityPage.hasCursor
                        ? "No hay más actividades para mostrar"
                        : "Todavía no participaste"
                  }
                  description={
                    activityFilter !== "all"
                      ? "Elegí otra categoría para consultar tu actividad."
                      : data.value.activityPage.hasCursor
                        ? "Volvé al principio para ver tu actividad reciente."
                        : "Votá una encuesta o comentá en un debate de tu comunidad y va a aparecer acá."
                  }
                >
                  {home && (
                    <ButtonLink href={routes.community(home.slug)}>
                      {translate(locale, "Ir a mi comunidad")}
                    </ButtonLink>
                  )}
                </EmptyState>
              </div>
            ) : (
              <>
                {activity.filter(
                  (item) =>
                    activityFilter === "all" || item.kind === activityFilter,
                ).length === 0 ? (
                  <p class="mt-6 rounded-2xl border border-dashed border-subtle px-4 py-8 text-center text-xs text-ink-faint">
                    {translate(locale, "No hay actividades en esta categoría.")}
                  </p>
                ) : (
                  <ul class="mt-5 divide-y divide-[var(--border-subtle)]">
                    {activity
                      .filter(
                        (item) =>
                          activityFilter === "all" ||
                          item.kind === activityFilter,
                      )
                      .map((item, i) => (
                        <li
                          key={`${item.kind}-${item.id}-${i}`}
                          data-activity-id={`${item.kind}:${item.id}`}
                        >
                          <Link
                            href={item.href}
                            class="flex items-start gap-3 py-3 transition-colors hover:bg-muted/60"
                          >
                            <span aria-hidden="true" class="mt-0.5 shrink-0">
                              {item.emoji}
                            </span>
                            <span class="min-w-0 flex-1 text-sm text-ink">
                              {item.kind === "voto" ? (
                                item.title ? (
                                  <>
                                    {translate(locale, "Votaste en")} “
                                    <bdi dir="auto">{item.title}</bdi>”
                                  </>
                                ) : (
                                  translate(locale, "Votaste en una encuesta")
                                )
                              ) : item.kind === "comentario" ? (
                                item.title ? (
                                  <>
                                    {translate(locale, "Comentaste en")} “
                                    <bdi dir="auto">{item.title}</bdi>”
                                  </>
                                ) : (
                                  translate(locale, "Comentaste en un debate")
                                )
                              ) : item.kind === "apoyo" ? (
                                <>
                                  {translate(locale, "Te sumaste al reclamo")} “
                                  <bdi dir="auto">{item.title ?? ""}</bdi>”
                                </>
                              ) : (
                                <>
                                  {translate(
                                    locale,
                                    "Comprometiste {{amount}} a",
                                    {
                                      amount: formatMoney(
                                        item.amount,
                                        item.currency ?? "ARS",
                                        locale,
                                      ),
                                    },
                                  )}{" "}
                                  “<bdi dir="auto">{item.title ?? ""}</bdi>”
                                </>
                              )}
                            </span>
                            <RelativeTime
                              value={item.created_at}
                              class="shrink-0 text-xs whitespace-nowrap text-ink-faint"
                            />
                          </Link>
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}
            {(data.value.activityPage.hasCursor ||
              data.value.activityPage.nextCursor) && (
              <nav
                aria-label={translate(locale, "Paginación de tu actividad")}
                class="mt-5 flex flex-wrap gap-3 text-sm font-medium text-brand"
              >
                {data.value.activityPage.hasCursor && (
                  <Link
                    class="inline-flex min-h-11 items-center"
                    href={profilePageHref(
                      location.url,
                      "publicaciones",
                      "actividad",
                    )}
                  >
                    {translate(locale, "Volver a la actividad reciente")}
                  </Link>
                )}
                {data.value.activityPage.nextCursor && (
                  <Link
                    class="inline-flex min-h-11 items-center"
                    href={profilePageHref(
                      location.url,
                      "publicaciones",
                      "actividad",
                      data.value.activityPage.nextCursor,
                    )}
                  >
                    {translate(locale, "Ver actividad anterior")}{" "}
                    <Icon name="arrow-right" class="text-[1.1em]" />
                  </Link>
                )}
              </nav>
            )}
          </Card>
        </div>
      )}

      {/* ---------------------------------- Pestaña: Guardados y Comunidades */}
      {activeTab.value === "guardados" && (
        <div class="space-y-6 mt-6 animate-fade-in">
          {/* Causas y temas guardados */}
          <SavedBookmarksCard />

          {/* Comunidades que seguís */}
          <Card class="p-6 sm:p-8">
            <h2 class="text-display-xs">
              {translate(locale, "Comunidades que seguís")}
            </h2>
            <p class="mt-1 text-sm text-ink-muted">
              {translate(
                locale,
                "Las leés, pero no podés votar ni comentar en ellas.",
              )}
            </p>
            <p class="mt-2 text-xs text-ink-faint">
              {translate(
                locale,
                "En esta página: {{shown}} de {{total}} comunidades seguidas.",
                {
                  shown: following.length,
                  total: data.value.followsPage.total,
                },
              )}
            </p>

            {following.length === 0 ? (
              <p class="mt-4 rounded-2xl border border-dashed border-strong px-4 py-6 text-center text-sm text-ink-faint">
                {translate(
                  locale,
                  data.value.followsPage.hasCursor
                    ? "No hay más comunidades seguidas para mostrar."
                    : "No seguís ninguna todavía.",
                )}{" "}
                <Link
                  href="/explorar"
                  class="font-medium text-brand hover:underline"
                >
                  {translate(locale, "Explorá el mapa")}
                </Link>
                .
              </p>
            ) : (
              <ul class="mt-4 flex flex-wrap gap-2">
                {following.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={routes.community(c.slug)}
                      class="flex min-h-11 items-center gap-1.5 rounded-2xl border border-subtle bg-muted/50 px-3.5 text-sm transition-colors hover:border-brand-500"
                    >
                      <span aria-hidden="true">{c.emoji ?? "📍"}</span>
                      <span class="font-medium text-ink-strong">{c.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {(data.value.followsPage.hasCursor ||
              data.value.followsPage.nextCursor) && (
              <nav
                aria-label={translate(
                  locale,
                  "Paginación de comunidades seguidas",
                )}
                class="mt-5 flex flex-wrap gap-3 text-sm font-medium text-brand"
              >
                {data.value.followsPage.hasCursor && (
                  <Link
                    class="inline-flex min-h-11 items-center"
                    href={profilePageHref(
                      location.url,
                      "guardados",
                      "seguidos",
                    )}
                  >
                    {translate(
                      locale,
                      "Volver a las comunidades más recientes",
                    )}
                  </Link>
                )}
                {data.value.followsPage.nextCursor && (
                  <Link
                    class="inline-flex min-h-11 items-center"
                    href={profilePageHref(
                      location.url,
                      "guardados",
                      "seguidos",
                      data.value.followsPage.nextCursor,
                    )}
                  >
                    {translate(locale, "Ver más comunidades seguidas")}{" "}
                    <Icon name="arrow-right" class="text-[1.1em]" />
                  </Link>
                )}
              </nav>
            )}
          </Card>
        </div>
      )}

      {/* ---------------------------------- Pestaña: Configuración y Cuenta */}
      {activeTab.value === "cuenta" && (
        <div class="space-y-6 mt-6 animate-fade-in">
          {/* Editar tus datos */}
          <Card class="p-6 sm:p-8">
            <h2 class="text-display-xs">
              {translate(locale, "Editar tus datos")}
            </h2>

            <Form
              action={update}
              enctype="multipart/form-data"
              class="mt-4 space-y-4"
              onSubmitCompleted$={$(
                (event: CustomEvent<{ status: number }>) => {
                  if (
                    event.detail.status >= 200 &&
                    event.detail.status < 300 &&
                    update.value?.saved
                  ) {
                    const submitted = update.formData;
                    const confirmed = {
                      username:
                        submitted
                          ?.get("username")
                          ?.toString()
                          .trim()
                          .toLowerCase() ?? profile.username,
                      displayName:
                        submitted?.get("display_name")?.toString().trim() ??
                        profile.display_name ??
                        "",
                      bio:
                        submitted?.get("bio")?.toString().trim() ??
                        profile.bio ??
                        "",
                    };
                    if (username.value === submitted?.get("username"))
                      username.value = confirmed.username;
                    if (displayName.value === submitted?.get("display_name"))
                      displayName.value = confirmed.displayName;
                    if (bio.value === submitted?.get("bio"))
                      bio.value = confirmed.bio;
                    savedFields.value = confirmed;
                    removeAvatar.value = false;
                    clearSelectedAvatar();
                  }
                },
              )}
              onReset$={$(() => {
                removeAvatar.value = false;
                username.value = savedFields.value.username;
                displayName.value = savedFields.value.displayName;
                bio.value = savedFields.value.bio;
                clearSelectedAvatar();
              })}
            >
              {profileError.value && (
                <Alert>{translate(locale, profileError.value)}</Alert>
              )}
              {update.value?.saved && !dirty.value && (
                <Alert tone="success">{translate(locale, "Guardado.")}</Alert>
              )}
              {dirty.value && (
                <p role="status" class="text-sm font-medium text-warn">
                  {translate(locale, "Tenés cambios sin guardar.")}
                </p>
              )}

              <div class="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Nombre de usuario"
                  name="username"
                  required
                  hint="Entre 3 y 20 caracteres: minúsculas, números y guión bajo."
                  error={usernameError.value}
                >
                  <Input
                    ref={usernameInput}
                    name="username"
                    required
                    minLength={3}
                    maxLength={20}
                    pattern="[a-z0-9_]{3,20}"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellcheck={false}
                    value={username.value}
                    onInput$={(_, el) => (username.value = el.value)}
                    invalid={usernameInvalid.value}
                    aria-invalid={usernameInvalid.value ? "true" : undefined}
                    aria-describedby={usernameDescription.value}
                    autoFocus={usernameInvalid.value}
                  />
                </Field>

                <Field
                  label="Nombre para mostrar"
                  name="display_name"
                  error={update.value?.fieldErrors?.display_name}
                >
                  <Input
                    name="display_name"
                    maxLength={60}
                    value={displayName.value}
                    onInput$={(_, el) => (displayName.value = el.value)}
                  />
                </Field>
              </div>

              <Field
                label="Bio"
                name="bio"
                hint="Hasta 300 caracteres."
                error={update.value?.fieldErrors?.bio}
              >
                <Textarea
                  name="bio"
                  rows={3}
                  maxLength={300}
                  value={bio.value}
                  onInput$={(_, el) => (bio.value = el.value)}
                />
                <p class="flex justify-end">
                  <CharCounter value={bio.value} max={300} id="bio-count" />
                </p>
              </Field>

              <Field
                label="Foto de perfil"
                name="avatar"
                hint="Opcional, hasta 2 MB."
              >
                <Input
                  name="avatar"
                  ref={avatarInput}
                  type="file"
                  disabled={removeAvatar.value || update.isRunning}
                  accept="image/jpeg,image/png,image/webp"
                  class="file:mr-3 file:rounded-xl file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink-strong"
                  onChange$={async (_, el) => {
                    const selection = ++avatarSelection.value;
                    avatarPreview.value = "";
                    const file = el.files?.[0];
                    avatarProcessing.value = !!file;
                    avatarProcessingFailed.value = false;
                    if (!file) return;
                    try {
                      const safe = await reencodeImageForPrivateUpload(
                        file,
                        512,
                      );
                      if (selection !== avatarSelection.value) return;
                      const accepted = new DataTransfer();
                      accepted.items.add(safe);
                      el.files = accepted.files;
                      avatarPreview.value = URL.createObjectURL(safe);
                    } catch {
                      if (selection !== avatarSelection.value) return;
                      el.value = "";
                      avatarProcessingFailed.value = true;
                    } finally {
                      if (selection === avatarSelection.value)
                        avatarProcessing.value = false;
                    }
                  }}
                />
                {avatarProcessing.value && (
                  <p role="status" class="mt-2 text-xs font-medium text-brand">
                    {translate(
                      locale,
                      "Preparando imagen y quitando metadatos…",
                    )}
                  </p>
                )}
                {avatarProcessingFailed.value && (
                  <p role="alert" class="mt-2 text-xs font-medium text-danger">
                    {translate(
                      locale,
                      "No pudimos preparar esa imagen de forma segura. Probá con JPG, PNG o WebP.",
                    )}
                  </p>
                )}
              </Field>

              {avatarPreview.value && (
                <figure class="flex flex-wrap items-center gap-3 rounded-2xl border border-subtle bg-muted/40 p-3">
                  <img
                    src={avatarPreview.value}
                    alt={translate(
                      locale,
                      "Vista previa de tu nueva foto de perfil",
                    )}
                    width={96}
                    height={96}
                    class="size-24 rounded-full object-cover"
                  />
                  <figcaption class="min-w-0 flex-1">
                    <p class="text-sm text-ink-muted">
                      {translate(
                        locale,
                        "Vista previa. Todavía no guardaste esta foto.",
                      )}
                    </p>
                    <button
                      type="button"
                      disabled={update.isRunning}
                      class="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
                      onClick$={() => clearSelectedAvatar()}
                    >
                      {translate(locale, "Descartar foto seleccionada")}
                    </button>
                  </figcaption>
                </figure>
              )}

              {profile.avatar_url && (
                <div class="space-y-1.5">
                  <label class="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-ink-strong">
                    <input
                      name="remove_avatar"
                      type="checkbox"
                      disabled={update.isRunning}
                      value="si"
                      checked={removeAvatar.value}
                      aria-describedby="remove-avatar-hint"
                      class="h-4 w-4 accent-brand-600"
                      onChange$={(_, el) => {
                        removeAvatar.value = el.checked;
                        avatarProcessingFailed.value = false;
                        if (el.checked) clearSelectedAvatar();
                      }}
                    />
                    {translate(locale, "Quitar foto actual al guardar")}
                  </label>
                  <p id="remove-avatar-hint" class="text-xs text-ink-faint">
                    {translate(
                      locale,
                      "Tu foto se quitará cuando guardes los cambios. Podés elegir otra después.",
                    )}
                  </p>
                </div>
              )}

              <SubmitButton
                pending={update.isRunning || avatarProcessing.value}
              >
                {translate(locale, "Guardar cambios")}
              </SubmitButton>
            </Form>
          </Card>

          {/* Cómo entrás a tu cuenta */}
          <Card class="flex flex-wrap items-center justify-between gap-3 p-6 sm:p-8">
            <div class="min-w-0">
              <h2 class="text-display-xs">
                {translate(locale, "Cómo entrás a tu cuenta")}
              </h2>
              <p class="mt-1 text-sm text-ink-muted">
                {translate(
                  locale,
                  "Agregá una contraseña como otra forma de ingresar, o cambiá la que ya usás.",
                )}
              </p>
            </div>
            <div class="flex min-w-0 max-w-full flex-wrap gap-2">
              <ButtonLink
                href="/perfil/contrasena"
                variant="secondary"
                size="sm"
              >
                {translate(locale, "Definir o cambiar contraseña")}
              </ButtonLink>
              <ButtonLink
                href="/perfil/seguridad"
                variant="secondary"
                size="sm"
              >
                {translate(locale, "Seguridad en dos pasos")}
              </ButtonLink>
              <ButtonLink
                href="/perfil/acceso-google"
                variant="secondary"
                size="sm"
              >
                {translate(locale, "Tu acceso con Google")}
              </ButtonLink>
            </div>
          </Card>

          {/* Tus datos y la baja */}
          <Card class="flex flex-wrap items-center justify-between gap-4 p-6 sm:p-8">
            <div class="min-w-0">
              <h2 class="text-display-xs">{translate(locale, "Tus datos")}</h2>
              <p class="mt-1 text-sm text-ink-muted">
                {translate(
                  locale,
                  "Llevate una copia de todo lo tuyo, o cerrá la cuenta. La descarga incluye qué se borra y qué queda publicado sin tu nombre.",
                )}
              </p>
            </div>
            <div class="flex min-w-0 max-w-full flex-wrap gap-2">
              <ButtonLink href="/consentimiento" variant="secondary" size="sm">
                {translate(locale, "Acuerdos y transferencias")}
              </ButtonLink>
              <ButtonLink
                href="/perfil/apelacion"
                variant="secondary"
                size="sm"
              >
                {translate(locale, "Suspensiones y apelaciones")}
              </ButtonLink>
              {/* Sin `download`: el servidor ya manda `Content-Disposition` y, si
              pide volver a identificarse o responde un límite, la persona tiene
              que ver esa página, no guardarla como archivo. */}
              <a href="/perfil/datos" class={buttonClass("secondary", "sm")}>
                {translate(locale, "Descargar mis datos")}
              </a>
              <ButtonLink href="/perfil/eliminar" variant="ghost" size="sm">
                {translate(locale, "Borrar mi cuenta")}
              </ButtonLink>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Mi perfil")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
