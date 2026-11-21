import {
  component$,
  isBrowser,
  useSignal,
  useTask$,
  useVisibleTask$,
} from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import { CommunityBreadcrumb } from "~/components/community/CommunityBreadcrumb";
import { triggerHapticFeedback } from "~/lib/haptics";
import { BeforeAfterSlider } from "~/components/claims/BeforeAfterSlider";
import { ClaimProgressTracker } from "~/components/claims/ClaimProgressTracker";
import { GpsNavigationModal } from "~/components/claims/GpsNavigationModal";
import { SocialFlyerModal } from "~/components/claims/SocialFlyerModal";
import { ClaimPhotos } from "~/components/claims/ClaimPhotos";
import { ClaimTimeline } from "~/components/claims/ClaimTimeline";
import { claimEventPermissions } from "~/lib/claim-event-permissions";
import {
  claimResolutionEvidence,
  isOfficialClaimEvent,
} from "~/lib/claim-event-presentation";
import {
  addClaimEvent,
  claimEventSchema,
  addContentSource,
  sourceSchema,
  postInstitutionalResponse,
  institutionalResponseSchema,
  addContentRelation,
  relationSchema,
  assignClaimOrganization,
  assignClaimOrganizationSchema,
} from "~/lib/extension-actions";
import { ResponseClockCard } from "~/components/claims/ResponseClockCard";
import { AiSummaryCard } from "~/components/content/AiSummaryCard";
import { ContentExtensionsPanel } from "~/components/content/ContentExtensionsPanel";
import { RemoveContentButton } from "~/components/content/RemoveContentButton";
import { DetailActions } from "~/components/content/DetailActions";
import { ShareButton } from "~/components/content/ShareButton";
import { ReportButton } from "~/components/moderation/ReportButton";
import { RelativeTime } from "~/components/ui/RelativeTime";
import {
  Alert,
  Avatar,
  Badge,
  ButtonLink,
  Card,
  Chip,
  ExternalLinkHint,
  Icon,
  cx,
  SubmitButton,
  type IconName,
  MetaLine,
} from "~/components/ui";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { withAuthNext } from "~/lib/auth-navigation";
import {
  escalationThreshold,
  responseDaysForLevel,
} from "~/lib/claim-escalation";
import { loadAiSummary, isAiSummaryConfigured } from "~/lib/ai-summary";
import type { CommunityRef } from "~/lib/community";
import { routes } from "~/lib/community";
import { omitKeys } from "~/lib/embed";
import { loadContentExtensions } from "~/lib/content-extensions";
import { selectedRelationFromUrl } from "~/lib/relation-picker";
import { useToggleSupport } from "~/lib/claim-actions";
import {
  APP_NAME,
  CLAIMS_DISCLAIMER,
  CLAIM_CATEGORIES,
  CLAIM_STATUS_LABEL,
  LOAD_FAILED,
  ORGANIZATIONS_LIMIT,
} from "~/lib/constants";
import type { Tables } from "~/lib/database.types.helpers";
import { formatDate, formatNumber, pluralize } from "~/lib/format";
import {
  useLocale,
  DEFAULT_LOCALE,
  resolveLocale,
  translate,
} from "~/lib/i18n";
import { loadPublicProfile, publicProfileHref } from "~/lib/public-profile";
import { isUuid, siteOrigin } from "~/lib/http";
import { socialImageMeta } from "~/lib/social-meta";
import { getViewer, supabase } from "~/lib/session";
import { createAdminSupabase } from "~/lib/supabase";
import { safeHttpUrl } from "~/lib/url";
import { PublishedNextSteps } from "~/components/content/PublishedNextSteps";
import { contentPermissions } from "~/lib/content-permissions";
import { PUBLISHED_PARAM } from "~/lib/content-publication";
import { useLocaleLoader } from "~/routes/layout";

export const useClaim = routeLoader$(async (ev) => {
  if (!isUuid(ev.params.id)) {
    throw ev.error(
      404,
      translate(resolveLocale(ev.locale()), "No encontramos ese reclamo."),
    );
  }
  const db = supabase(ev);
  const viewer = await getViewer(ev);
  const locale = resolveLocale(ev.locale());

  /**
   * El reclamo y sus dos comunidades en un solo viaje.
   *
   * Eran tres consultas en serie —reclamo, después su comunidad, y al final la
   * comunidad a la que escaló, ésta última recién *después* del `Promise.all`
   * de siete—. Cada una es un ida y vuelta completo contra Supabase desde el
   * runtime edge, y ninguna necesitaba el resultado de la anterior
   * para saber qué pedir: la clave foránea ya expresa la relación. Es la misma
   * técnica que `getViewer()` usa para el perfil y su comunidad de residencia.
   *
   * Los dos embeds llevan el nombre del constraint y no sólo el de la tabla:
   * `claims` tiene **dos** claves foráneas a `communities` —dónde se publicó y
   * a dónde escaló— y sin desambiguar, PostgREST no sabe cuál es cuál y falla.
   */
  const { data: row, error: claimError } = await db
    .from("claims")
    // El `select` va en un literal de una pieza y no concatenado: supabase-js
    // deriva los tipos del embed parseando esta cadena, y un `+` la convierte
    // en un `string` cualquiera que colapsa la inferencia.
    // `member_count` en el primer embed define el umbral para escalar (D58).
    .select(
      "*, community:communities!claims_community_id_fkey(id, slug, name, emoji, level, path, member_count), escalated_to:communities!claims_escalated_to_community_id_fkey(id, slug, name, emoji, level, path), responsible_organization:organizations!claims_responsible_organization_id_fkey(id, name, verified_at)",
    )
    .eq("id", ev.params.id)
    .maybeSingle();
  // Un fallo de la base no es un reclamo inexistente. Devolver 404 acá le decía
  // a la gente que su publicación se borró y a los buscadores que la saquen del
  // índice, por un error que suele durar segundos.
  if (claimError) throw ev.error(500, translate(locale, LOAD_FAILED));
  if (!row) {
    throw ev.error(404, translate(locale, "No encontramos ese reclamo."));
  }

  // Los embeds se separan de la fila: `claim` tiene que seguir siendo
  // exactamente una fila de `claims`, sin campos de más que ninguna vista
  // espera. Mismo criterio que `getViewer()` con `home_community`.
  const community = row.community;
  const escalatedTo = row.escalated_to;
  const claim = omitKeys(
    row,
    "community",
    "escalated_to",
    "responsible_organization",
  );

  if (!community)
    throw ev.error(
      404,
      translate(locale, "No encontramos la comunidad de ese reclamo."),
    );

  const segments = community.path.split(".");
  const aiSummaryPromise = (() => {
    try {
      return loadAiSummary(
        db,
        createAdminSupabase(ev),
        "claim",
        claim.id,
        locale,
      );
    } catch {
      return Promise.resolve(null);
    }
  })();

  const [
    chainRes,
    authorRes,
    supportRes,
    eventsRes,
    organizationsRes,
    extensions,
    aiSummary,
  ] = await Promise.all([
    db
      .from("communities")
      .select("id, slug, name, emoji, level, path")
      .in(
        "path",
        segments.map((_, i) => segments.slice(0, i + 1).join(".")),
      )
      .order("level", { ascending: true }),
    loadPublicProfile(db, claim.author_id),
    viewer.userId
      ? db
          .from("claim_supports")
          .select("claim_id")
          .eq("claim_id", claim.id)
          .eq("user_id", viewer.userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("claim_events")
      .select(
        "id, claim_id, organization_id, event_type, title, body, status, evidence_url, event_date, created_at, organization:organizations!claim_events_organization_id_fkey(id, name)",
      )
      .eq("claim_id", claim.id)
      .order("event_date", { ascending: true })
      .order("created_at", { ascending: true }),
    db
      .from("organizations")
      .select("id, name, community_id")
      .not("verified_at", "is", null)
      .order("name")
      .limit(ORGANIZATIONS_LIMIT),
    loadContentExtensions(
      db,
      "claim",
      claim.id,
      viewer.userId,
      selectedRelationFromUrl(ev.url, "claim", claim.id),
    ),
    aiSummaryPromise,
  ]);

  const organizations = organizationsRes.data ?? [];
  const responsible = row.responsible_organization;
  const myResponsibleOrganization = extensions.myOrganizations.find(
    (org) => org.id === claim.responsible_organization_id,
  );
  // El rol y una afiliación alcanzan para detectar candidatos, pero las RPC
  // verifican factor aprobado y membresía institucional verificada vigentes.
  const [moderationPermission, organizationPermission] = await Promise.all([
    viewer.userId && viewer.isModerator
      ? db.rpc("is_moderator", { p_user: viewer.userId })
      : Promise.resolve({ data: false }),
    viewer.userId && myResponsibleOrganization
      ? db.rpc("is_verified_org_member", {
          p_user: viewer.userId,
          p_org: myResponsibleOrganization.id,
        })
      : Promise.resolve({ data: false }),
  ]);
  const isModerator = moderationPermission.data === true;
  const { isAuthor, canManage } = contentPermissions(
    { userId: viewer.userId, isModerator },
    claim.author_id,
  );
  const eventPermissions = claimEventPermissions({
    isAuthor,
    isModerator,
    representsResponsibleOrganization: organizationPermission.data === true,
  });
  const siteUrl = siteOrigin(ev);

  return {
    claim: claim as Tables<"claims">,
    community,
    escalatedTo: escalatedTo as CommunityRef | null,
    chain: (chainRes.data ?? []) as CommunityRef[],
    author: authorRes,
    isSupporting: !!supportRes.data,
    isMember:
      !!viewer.homePath &&
      (viewer.homePath === community.path ||
        viewer.homePath.startsWith(`${community.path}.`)),
    isAuthenticated: !!viewer.userId,
    events: (eventsRes.data ?? []).map((event) => ({
      ...event,
      evidence_url: safeHttpUrl(event.evidence_url),
    })),
    resolutionEvidence: claimResolutionEvidence(
      eventsRes.data ?? [],
      ev.url.origin,
      ev.env.get("PUBLIC_SUPABASE_URL"),
    ),
    organizations,
    responsible,
    extensions,
    aiSummary,
    aiSummaryEnabled: isAiSummaryConfigured(ev.env),
    canManage,
    ...eventPermissions,
    isAuthor,
    myOrganizationId:
      organizationPermission.data === true
        ? (myResponsibleOrganization?.id ?? null)
        : null,
    socialImage: `${siteUrl}/social/claim/${claim.id}?locale=${locale}`,
    ogImage: `${siteUrl}/og.png`,
  };
});

/*
 * Acciones de la barra fija del teléfono (D126): los colores de las variantes
 * de `Button` en tamaño compacto, para que a 320 px entren junto a
 * "Compartir". Antes la misma acción era verde acá y violeta en la tarjeta de
 * apoyo, y los botones no llevaban los íconos de la tarjeta. El relleno es el
 * de `Button` sm (`px-3`) y no `px-4`: con el ícono, a 320 px "Apoyado" le
 * dejaba al contador unos 53 px (cuenta hecha sobre la captura de 390 px, no
 * medida) y "12 apoyos" se cortaba.
 */
const BAR_ACTION =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold touch-manipulation transition-colors duration-150 active:scale-[0.98] motion-reduce:transform-none disabled:cursor-not-allowed disabled:opacity-55";
const BAR_ACTION_TONE = {
  primary: "bg-brand-600 text-white shadow-soft hover:bg-brand-700",
  success: "bg-success-700 text-white shadow-soft hover:bg-success-900",
  secondary:
    "border border-control bg-surface text-ink-strong hover:border-brand-500 hover:bg-muted",
} as const;

export const useAddClaimEvent = routeAction$(
  (data, ev) => addClaimEvent(data, ev),
  { validation: [zod$(claimEventSchema)], invalidate: [useClaim] },
);
export const useAddRelation = routeAction$(
  (data, ev) => addContentRelation(data, ev),
  { validation: [zod$(relationSchema)], invalidate: [useClaim] },
);
export const useAddSource = routeAction$(
  (data, ev) => addContentSource(data, ev),
  { validation: [zod$(sourceSchema)], invalidate: [useClaim] },
);
export const useInstitutionalResponse = routeAction$(
  (data, ev) => postInstitutionalResponse(data, ev),
  { validation: [zod$(institutionalResponseSchema)], invalidate: [useClaim] },
);
export const useAssignClaimOrganization = routeAction$(
  (data, ev) => assignClaimOrganization(data, ev),
  {
    validation: [zod$(assignClaimOrganizationSchema)],
    invalidate: [useClaim],
  },
);

export default component$(() => {
  const addEvent = useAddClaimEvent();
  const addSource = useAddSource();
  const addRelation = useAddRelation();
  const institutionalResponse = useInstitutionalResponse();
  const assign = useAssignClaimOrganization();
  const data = useClaim();
  const toggle = useToggleSupport();
  const locale = useLocale();

  const { claim, community, chain, author, isMember, isAuthenticated } =
    data.value;
  const location = useLocation();
  // Primera visita de la autoría después de publicar: el parámetro se puede
  // compartir, así que a otra persona no se le muestra nada.
  const justPublished =
    data.value.isAuthor &&
    location.url.searchParams.get(PUBLISHED_PARAM) === "1";
  const category = CLAIM_CATEGORIES.find((c) => c.key === claim.category);
  const status = CLAIM_STATUS_LABEL[claim.status];
  const authorName =
    author?.display_name ??
    author?.username ??
    translate(locale, "Cuenta eliminada");
  const images =
    claim.image_urls.length > 0
      ? claim.image_urls
      : claim.image_url
        ? [claim.image_url]
        : [];
  // Los imprimibles de "Difundir", con una sola anatomía de fila (D126).
  // Abren una página para imprimir o guardar como PDF en otra pestaña: no
  // descargan nada, así que las etiquetas dejan de prometerlo, y van en
  // minúscula como el resto de la interfaz.
  const printables: { path: string; icon: IconName; label: string }[] = [
    {
      path: "afiche",
      icon: "printer",
      label: translate(locale, "Afiche con código QR para pegar"),
    },
    {
      path: "nota-formal",
      icon: "file-text",
      label: translate(locale, "Nota para presentar en mesa de entradas"),
    },
    {
      path: "dossier",
      icon: "newspaper",
      label: translate(locale, "Dossier para prensa y medios"),
    },
    {
      path: "planilla",
      icon: "list",
      label: translate(locale, "Planilla A4 para juntar firmas en el barrio"),
    },
  ];

  /**
   * La novedad más reciente del seguimiento. Los eventos llegan ordenados por
   * fecha del hecho; para "cuándo se movió esto" lo que importa es cuándo se
   * publicó, así que se busca el máximo `created_at` y no el primero.
   */
  const lastEvent = data.value.events.reduce<
    (typeof data.value.events)[number] | null
  >(
    (latest, event) =>
      !latest || event.created_at > latest.created_at ? event : latest,
    null,
  );

  // El estado de la action pisa al del loader para que el botón responda ya.
  const supporting = toggle.value?.supporting ?? data.value.isSupporting;
  // Vibra cuando la base ya registró el apoyo, no al apoyar el dedo en el
  // botón (D96).
  useTask$(({ track }) => {
    const result = track(() => toggle.value);
    if (isBrowser && result?.supporting === true) {
      triggerHapticFeedback("success");
    }
  });
  const supportCount =
    claim.support_count +
    (supporting === data.value.isSupporting ? 0 : supporting ? 1 : -1);

  const actionBar = useSignal<HTMLElement>();
  const actionBarHeight = useSignal(96);
  // El alto cambia al ajustar el texto o envolver las acciones en un teléfono.
  // eslint-disable-next-line qwik/no-use-visible-task -- requiere medir el DOM
  useVisibleTask$(({ cleanup }) => {
    const element = actionBar.value;
    if (!element) return;
    const measure = () => {
      actionBarHeight.value = element.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        "--claim-actions-height",
        `${actionBarHeight.value}px`,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    cleanup(() => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--claim-actions-height");
    });
  });

  return (
    <div
      class="container-content pt-8 pb-[calc(2rem+var(--claim-actions-height))] lg:pb-8"
      style={{ "--claim-actions-height": `${actionBarHeight.value}px` }}
    >
      <CommunityBreadcrumb chain={chain} currentIsLink class="mb-5" />

      {/* Dos columnas, como en proyectos/[id]: esta página era una tira de
          contenido en un contenedor ancho, con el estado y la acción
          principal enterrados a media altura. */}
      <div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {/* Franja superior con el rojo del tipo (D123); resuelto, pasa al
            verde: la celebración ya la da el recuadro de abajo. */}
        <article
          class={cx(
            "min-w-0 border-t-4 pt-5",
            claim.status === "resolved"
              ? "border-t-success-500"
              : "border-t-kind-claim",
          )}
        >
          {justPublished && (
            <PublishedNextSteps
              kind="claim"
              title={claim.title}
              url={routes.claim(claim.id)}
              communityName={community.name}
              responseDays={responseDaysForLevel(community.level)}
            />
          )}
          {claim.status === "resolved" && (
            <div class="mb-6 rounded-2xl border border-success-500/30 bg-success-50/80 p-5 dark:border-success-500/20 dark:bg-success-950/40">
              <div class="flex items-start gap-3.5">
                <Icon
                  name="trophy"
                  stroke={1.5}
                  class="mt-0.5 size-8 shrink-0 text-success-700 dark:text-success-300"
                />
                <div>
                  <h2 class="text-lg font-bold text-success-900 dark:text-success-100">
                    {translate(
                      locale,
                      "¡Victoria comunitaria! Este reclamo fue resuelto",
                    )}
                  </h2>
                  <p class="mt-1 text-sm text-success-800/90 dark:text-success-300/90">
                    {translate(
                      locale,
                      "Este reclamo figura como resuelto. Lo apoyaron {{count}} personas.",
                      { count: formatNumber(claim.support_count, locale) },
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div class="mb-3 flex flex-wrap items-center gap-2">
            <Chip
              variant="badge"
              icon={CONTENT_KINDS.claim.icon}
              toneClass={CONTENT_KIND_TONES.claim.badge}
            >
              {translate(locale, CONTENT_KINDS.claim.label)}
            </Chip>
            {/* El ícono propio de la categoría (D125), como en la tarjeta del
                listado: era el último badge de la cabecera con emoji. */}
            {category && (
              <Badge tone="neutral">
                <Icon name={category.icon} />{" "}
                {translate(locale, category.label)}
              </Badge>
            )}
            {claim.status === "resolved" ? (
              <Badge tone="success">
                <Icon name="trophy" /> {translate(locale, "Resuelto")}
              </Badge>
            ) : status ? (
              <Badge
                tone={status.tone as "warn" | "brand" | "success" | "danger"}
              >
                {translate(locale, status.label)}
              </Badge>
            ) : null}
          </div>

          <h1 dir="auto" class="text-display-lg sm:text-display-xl">
            {claim.title}
          </h1>

          <MetaLine class="mt-3 text-sm text-ink-faint">
            {/* El avatar y el nombre son un solo dato. */}
            <span class="inline-flex items-center gap-2">
              <Avatar src={author?.avatar_url} name={authorName} size="sm" />
              {/* Sólo es enlace si la cuenta existe: una publicación cuyo autor
                se dio de baja muestra el nombre sin llevar a ninguna parte. */}
              {author ? (
                <Link
                  href={publicProfileHref(author)}
                  dir="auto"
                  class="text-ink-muted hover:text-brand hover:underline"
                >
                  {authorName}
                </Link>
              ) : (
                <span dir="auto" class="text-ink-muted">
                  {authorName}
                </span>
              )}
            </span>
            <span>
              <time dateTime={claim.created_at}>
                {formatDate(claim.created_at, locale)}
              </time>
            </span>
            <span>
              <Link
                href={routes.community(community.slug)}
                class="font-medium text-brand hover:underline"
              >
                {community.emoji} {community.name}
              </Link>
            </span>
            {/* Desde un reclamo compartido por mensaje no había ninguna puerta
                al resto: la miga de pan lleva a la comunidad, pero no a sus
                otros reclamos, que es lo que quiere quien acaba de sumarse. */}
            <span>
              <Link
                href={`${routes.community(community.slug)}/reclamos`}
                class="font-medium text-brand hover:underline"
              >
                {translate(locale, "Ver todos los reclamos")}
              </Link>
            </span>
          </MetaLine>

          {/* Cuándo se movió por última vez. Un reclamo de hace ocho meses con
              una respuesta oficial de anteayer y uno abandonado desde el día
              que se publicó se veían exactamente igual: la única fecha en la
              ficha era la de creación. */}
          {lastEvent && (
            <p class="mt-2 inline-flex flex-wrap items-center gap-1 text-sm text-ink-faint">
              <Icon name="clock" /> {translate(locale, "Última novedad")}{" "}
              <RelativeTime value={lastEvent.created_at} />{" "}
              <a
                href="#seguimiento-reclamo"
                class="font-medium text-brand hover:underline"
              >
                {translate(locale, "Ver el seguimiento")}{" "}
                <Icon name="chevron-down" class="text-sm" />
              </a>
            </p>
          )}

          <DetailActions
            type="claim"
            id={claim.id}
            title={claim.title}
            url={`/reclamos/${claim.id}`}
            communityName={community.name}
            share={false}
          />

          <ClaimProgressTracker
            status={claim.status}
            supportCount={supportCount}
            threshold={escalationThreshold(community.member_count)}
            createdAt={claim.created_at}
            escalatedAt={claim.escalated_at}
            escalatedToName={data.value.escalatedTo?.name}
            firstResponseAt={claim.first_response_at}
            hasOfficialResponse={data.value.events.some(isOfficialClaimEvent)}
          />

          {(claim.location_text || claim.lat !== null) && (
            <div class="mt-3.5 flex flex-wrap items-center gap-2 text-sm">
              <span class="inline-flex items-center gap-1.5 rounded-full border border-control bg-muted/60 px-3 py-1 text-xs font-medium text-ink-strong">
                <Icon name="map-pin" class="text-sm text-ink-muted" />
                <span>
                  {claim.location_text ||
                    translate(locale, "Ubicación marcada en el mapa")}
                </span>
              </span>
              {claim.lat !== null && claim.lng !== null && (
                <GpsNavigationModal
                  lat={claim.lat}
                  lng={claim.lng}
                  locationText={claim.location_text}
                  claimTitle={claim.title}
                />
              )}
            </div>
          )}

          {(() => {
            // Sólo una evidencia de resolución cuenta como "después": la última
            // foto del autor es otra foto del problema, no de la solución.
            const resolutionEvidence = data.value.resolutionEvidence;
            const resolutionPhoto =
              resolutionEvidence?.kind === "image"
                ? resolutionEvidence.url
                : null;
            const originalPhoto = images.length > 0 ? images[0] : null;

            if (
              claim.status === "resolved" &&
              originalPhoto &&
              resolutionPhoto &&
              originalPhoto !== resolutionPhoto
            ) {
              return (
                <div class="mt-4">
                  <h3 class="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-strong">
                    <Icon name="trophy" class="text-success" />
                    {translate(
                      locale,
                      "Comparativa: Antes y Después de la solución",
                    )}
                  </h3>
                  <BeforeAfterSlider
                    beforeUrl={originalPhoto}
                    afterUrl={resolutionPhoto}
                    claimTitle={claim.title}
                  />
                </div>
              );
            }
            if (resolutionEvidence?.kind === "link")
              return (
                <p class="mt-4 text-sm">
                  <a
                    href={resolutionEvidence.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex min-h-11 items-center gap-1 font-medium text-brand underline underline-offset-2"
                  >
                    {translate(locale, "Ver evidencia de resolución")}
                    <ExternalLinkHint />
                  </a>
                </p>
              );
            return null;
          })()}

          <ClaimPhotos urls={images} claimTitle={claim.title} />

          <div
            dir="auto"
            class="ugc-text measure mt-6 whitespace-pre-line leading-relaxed text-ink"
          >
            {claim.description}
          </div>

          <div class="mt-6">
            <AiSummaryCard
              summary={data.value.aiSummary}
              enabled={data.value.aiSummaryEnabled}
              contentType="claim"
              contentId={claim.id}
              isAuthenticated={isAuthenticated}
            />
          </div>

          <ClaimTimeline
            key={claim.id}
            addEvent={addEvent}
            assign={assign}
            claimId={claim.id}
            events={data.value.events}
            organizations={data.value.organizations}
            responsible={data.value.responsible}
            canManage={data.value.canManage}
            canUpdate={data.value.canUpdate}
            canRespondOfficially={data.value.canRespondOfficially}
            canChangeStatus={data.value.canChangeStatus}
            myOrganizationId={data.value.myOrganizationId}
          />

          {data.value.canManage && (
            <Card class="mt-6 p-5">
              <h2 class="font-semibold">
                {translate(locale, "Pasar del reclamo a la acción")}
              </h2>
              <p class="mt-1 text-sm text-ink-muted">
                {translate(
                  locale,
                  "Creá un proyecto con un plan, responsables e hitos, conservando el vínculo con este reclamo.",
                )}
              </p>
              <ButtonLink
                href={`/c/${community.slug}/proyectos/nuevo?desde_reclamo=${claim.id}`}
                class="mt-3"
              >
                {translate(locale, "Convertir en proyecto")}
              </ButtonLink>
            </Card>
          )}

          <ContentExtensionsPanel
            addRelation={addRelation}
            addSource={addSource}
            respond={institutionalResponse}
            key={claim.id}
            type="claim"
            id={claim.id}
            data={data.value.extensions}
            canManage={data.value.canManage}
          />

          <RemoveContentButton
            type="claim"
            id={claim.id}
            isAuthor={data.value.isAuthor}
            createdAt={claim.created_at}
            backHref={`${routes.community(community.slug)}/reclamos`}
          />

          <div class="mt-6">
            <ReportButton
              targetType="claim"
              targetId={claim.id}
              isAuthenticated={isAuthenticated}
            />
          </div>
        </article>

        {/* Estado y acción principal, siempre a la vista mientras se lee. */}
        <aside class="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          {/* ------------------------------------------------ Me afecta también o Victoria */}
          {claim.status === "resolved" ? (
            <Card class="border-success-500/30 bg-success-50/40 p-5 dark:border-success-500/20 dark:bg-success-950/20">
              <div class="flex flex-col gap-3">
                <div class="flex items-center gap-2 text-success-700 dark:text-success-300">
                  <Icon name="trophy" class="size-5" />
                  <span class="font-semibold">
                    {translate(locale, "Problema resuelto")}
                  </span>
                </div>
                <p class="text-3xl font-semibold tabular-nums text-ink-strong">
                  {pluralize(
                    supportCount,
                    "vecino apoyó",
                    "vecinos apoyaron",
                    locale,
                  )}
                </p>
                <p class="text-xs text-ink-muted">
                  {translate(
                    locale,
                    "Este reclamo cumplió su ciclo con éxito gracias a la participación comunitaria.",
                  )}
                </p>
              </div>
            </Card>
          ) : (
            <Card class="p-5">
              <div class="flex flex-col gap-4">
                {/* El cero no se muestra como cifra grande (D123): se dice en
                    texto atenuado, con las mismas palabras que la tarjeta del
                    listado. */}
                {supportCount === 0 ? (
                  <p class="text-base font-medium text-ink-muted">
                    {translate(locale, "Todavía nadie más se sumó")}
                  </p>
                ) : (
                  <div>
                    <p class="text-3xl font-semibold tabular-nums text-ink-strong">
                      {pluralize(supportCount, "persona", "personas", locale)}
                    </p>
                    <p class="text-sm text-ink-muted">
                      {supportCount === 1
                        ? translate(locale, "dice que esto también le afecta")
                        : translate(
                            locale,
                            "dicen que esto también les afecta",
                          )}
                    </p>
                  </div>
                )}

                {isAuthenticated ? (
                  isMember ? (
                    <Form action={toggle} class="w-full">
                      <input type="hidden" name="claim_id" value={claim.id} />
                      <input
                        type="hidden"
                        name="supporting"
                        value={String(supporting)}
                      />
                      <SubmitButton
                        variant={supporting ? "secondary" : "success"}
                        size="lg"
                        class={cx(
                          "w-full active:scale-[0.98] transition-all duration-150 touch-manipulation shadow-soft",
                          supporting
                            ? "border-success-500/40 text-success-800 dark:text-success-200 ring-2 ring-success-500/20 animate-scale-pop"
                            : "hover:shadow-lift hover:-translate-y-0.5",
                        )}
                        pending={toggle.isRunning}
                      >
                        <span class="inline-flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            class={cx(
                              "inline-block transition-transform duration-200",
                              supporting &&
                                "scale-110 font-bold text-success-600 dark:text-success-400",
                            )}
                          >
                            {supporting ? (
                              <Icon name="check" />
                            ) : (
                              <Icon name="handshake" />
                            )}
                          </span>
                          <span>
                            {supporting
                              ? translate(locale, "Me afecta")
                              : translate(locale, "Me afecta también")}
                          </span>
                        </span>
                      </SubmitButton>
                      {/* Apoyar ya suscribe a las novedades —`notify_claim_event`
                          avisa a cada persona que apoyó— pero no lo decía nadie:
                          se sumaba gente al reclamo sin saber que iba a enterarse
                          de la respuesta, que es medio motivo para sumarse. */}
                      <p class="mt-2 text-xs text-ink-muted">
                        {supporting
                          ? translate(
                              locale,
                              "Te vamos a avisar cuando haya novedades en este reclamo.",
                            )
                          : translate(
                              locale,
                              "Sumarte también te avisa cuando haya novedades.",
                            )}
                      </p>
                    </Form>
                  ) : (
                    <div class="space-y-3">
                      <p class="text-sm text-ink-muted">
                        {translate(
                          locale,
                          "Sólo pueden sumarse quienes viven en {{community}}.",
                          {
                            community: community.name,
                          },
                        )}
                      </p>
                      {/* La frase era un callejón sin salida: decía que no se
                          puede y no dónde se arregla. Quien se mudó tiene que
                          poder actualizar su residencia desde acá, como en los
                          debates. */}
                      <ButtonLink
                        href={`/perfil/residencia?parent=${community.slug}`}
                        variant="secondary"
                        size="sm"
                        class="w-full justify-center"
                      >
                        {translate(locale, "Revisar mi residencia")}
                      </ButtonLink>
                    </div>
                  )
                ) : (
                  // La misma palabra que la barra fija del teléfono: eran dos
                  // nombres para una sola acción en la misma página.
                  <ButtonLink
                    href={withAuthNext("/ingresar", `/reclamos/${claim.id}`)}
                    class="w-full"
                  >
                    {translate(locale, "Ingresar para apoyar")}
                  </ButtonLink>
                )}
              </div>

              {toggle.value?.message && (
                <Alert class="mt-4">
                  {translate(locale, toggle.value.message)}
                </Alert>
              )}
            </Card>
          )}

          {/* Qué falta para que suba de nivel se explica en un solo lugar, junto
              a la acción de apoyar. El panel repetía una "meta de firmas" que
              prometía escalar "automáticamente a la Municipalidad", cuando la
              base sólo lo sube a la comunidad superior si vence el plazo, nadie
              acusó recibo y se llegó al umbral (0026, D58). */}
          <ResponseClockCard
            claim={claim}
            community={community}
            memberCount={community.member_count}
            escalatedTo={data.value.escalatedTo}
          />

          <p class="flex items-start gap-2 rounded-2xl bg-muted px-4 py-3 text-xs text-ink-muted">
            <Icon name="info" class="mt-0.5 shrink-0 text-sm" />
            <span>{translate(locale, CLAIMS_DISCLAIMER)}</span>
          </p>

          {/* Una sola entrada para difundir. El detalle tenía nueve: tres
              botones de compartir, dos notas formales, la banda de WhatsApp,
              el volante y tres imprimibles, compitiendo con el apoyo y el
              reloj. Es un <details>: funciona igual sin JavaScript. */}
          <details
            data-claim-spread
            class="group rounded-2xl border border-subtle bg-surface p-4 shadow-soft"
          >
            <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 font-semibold text-ink-strong">
              <span class="inline-flex items-center gap-2">
                <Icon name="megaphone" class="text-kind-claim-text" />
                {translate(locale, "Difundir este reclamo")}
              </span>
              <span
                aria-hidden="true"
                class="inline-flex text-ink-faint transition-transform group-open:rotate-180"
              >
                <Icon name="chevron-down" />
              </span>
            </summary>
            <div class="mt-3 space-y-4">
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {translate(locale, "Compartir")}
                </h3>
                <ShareButton
                  title={claim.title}
                  url={`/reclamos/${claim.id}`}
                  kind="claim"
                  isResolved={claim.status === "resolved"}
                  communityName={community.name}
                  class="mt-2"
                />
              </div>
              <div>
                <h3 class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {translate(locale, "Para imprimir o publicar")}
                </h3>
                <div class="mt-2 flex flex-col gap-2">
                  <SocialFlyerModal
                    claimId={claim.id}
                    claimTitle={claim.title}
                    communityName={community.name}
                    categoryLabel={translate(
                      locale,
                      CLAIM_CATEGORIES.find((c) => c.key === claim.category)
                        ?.label ?? claim.category,
                    )}
                    supportCount={supportCount}
                    imageUrl={claim.image_url}
                  />
                  {printables.map((printable) => (
                    <Link
                      key={printable.path}
                      href={`/reclamos/${claim.id}/${printable.path}`}
                      target="_blank"
                      class="flex min-h-11 items-center gap-2 rounded-xl border border-control bg-surface px-3 py-2 text-left text-sm font-medium text-ink-strong transition-colors hover:border-brand-500 hover:bg-muted"
                    >
                      <Icon
                        name={printable.icon}
                        class="text-base text-ink-muted"
                      />
                      <span>{printable.label}</span>
                      <ExternalLinkHint />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </details>
        </aside>
      </div>

      {/* Barra de acción flotante inferior para dispositivos móviles */}
      <div
        ref={actionBar}
        data-claim-actions
        class="fixed inset-x-0 bottom-[var(--bottom-nav-height)] z-40 border-t border-subtle bg-surface/90 px-4 pt-3 pb-3 shadow-lift backdrop-blur-md md:pb-[max(env(safe-area-inset-bottom),0.75rem)] lg:hidden"
      >
        <div class="mx-auto flex max-w-lg items-center justify-between gap-2">
          {/* En el teléfono el título cortado a siete letras no daba
              contexto: el dato principal es el apoyo, sin el violeta de
              navegación y atenuado en cero (D123). Desde 640 px vuelve el
              título. El hueco de 8 px, y no de 12, también le deja lugar al
              contador a 320 px. */}
          <div class="min-w-0 flex-1">
            <span class="hidden truncate text-xs font-bold text-ink-strong sm:block">
              {claim.title}
            </span>
            <span
              class={cx(
                "block truncate text-xs font-semibold tabular-nums",
                supportCount === 0 ? "text-ink-muted" : "text-ink-strong",
              )}
            >
              {pluralize(supportCount, "apoyo", "apoyos", locale)}
            </span>
          </div>

          <div class="flex items-center gap-2">
            <ShareButton
              title={claim.title}
              url={`/reclamos/${claim.id}`}
              kind="claim"
              isResolved={claim.status === "resolved"}
              communityName={community.name}
              compact
            />

            {/* La barra es lo único a la vista en el teléfono: el panel de
                apoyo queda debajo de todo el artículo. Quien llega por un
                enlace compartido sin sesión, o sin vivir acá, veía sólo
                Compartir y no sabía cómo sumarse. Lleva las mismas variantes
                e íconos que la tarjeta de apoyo (D126): ingresar en el violeta
                de la acción primaria, la residencia como secundaria y apoyar
                en verde con la mano, o ya apoyado con el tilde. */}
            {claim.status !== "resolved" &&
              (!isAuthenticated ? (
                <Link
                  href={withAuthNext("/ingresar", `/reclamos/${claim.id}`)}
                  class={cx(BAR_ACTION, BAR_ACTION_TONE.primary)}
                >
                  {translate(locale, "Ingresar para apoyar")}
                </Link>
              ) : !isMember ? (
                <Link
                  href={`/perfil/residencia?parent=${community.slug}`}
                  class={cx(BAR_ACTION, BAR_ACTION_TONE.secondary)}
                >
                  {translate(locale, "Revisar mi residencia")}
                </Link>
              ) : (
                <Form action={toggle}>
                  <input type="hidden" name="claim_id" value={claim.id} />
                  <input
                    type="hidden"
                    name="supporting"
                    value={String(supporting)}
                  />
                  <button
                    type="submit"
                    disabled={toggle.isRunning}
                    class={cx(
                      BAR_ACTION,
                      supporting
                        ? BAR_ACTION_TONE.secondary
                        : BAR_ACTION_TONE.success,
                    )}
                  >
                    <Icon
                      name={supporting ? "check" : "handshake"}
                      class="text-sm"
                    />
                    <span>
                      {supporting
                        ? translate(locale, "Apoyado")
                        : translate(locale, "Apoyar")}
                    </span>
                  </button>
                </Form>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useClaim);
  const locale = resolveValue(useLocaleLoader) ?? DEFAULT_LOCALE;
  const title = data?.claim.title ?? translate(locale, "Reclamo");
  const description = (data?.claim.description ?? "").slice(0, 180);

  return {
    title: `${title} · ${APP_NAME}`,
    meta: [
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      ...socialImageMeta(data?.ogImage ?? "", title),
    ],
  };
};
