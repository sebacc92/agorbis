import { CommunityVisibilityForm } from "~/components/community/CommunityPreferences";
import { publicProfileHref } from "~/lib/public-profile";
import { component$ } from "@qwik.dev/core";
import {
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  zod$,
  z,
  type DocumentHead,
} from "@qwik.dev/router";
import {
  Avatar,
  Button,
  ButtonLink,
  EmptyState,
  Input,
  cx,
} from "~/components/ui";
import { APP_NAME, MEMBERS_PAGE_SIZE } from "~/lib/constants";
import { communitySlugFromRoute } from "~/lib/community";
import {
  readMyCommunityVisibility,
  setCommunityVisibility,
} from "~/lib/community-preferences";
import { formatNumber, pluralize } from "~/lib/format";
import { many, single } from "~/lib/query";
import { getViewer, supabase } from "~/lib/session";
import { useCommunity } from "../layout";
import { useLocale, translate } from "~/lib/i18n";
import { useLocaleLoader } from "../../../layout";
import {
  MEMBER_SEARCH_MAX_LENGTH,
  memberListHref,
  readMemberFilters,
} from "~/lib/member-search";

interface MemberRow {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export const useMembers = routeLoader$(
  async (ev) => {
    const db = supabase(ev);
    const viewer = await getViewer(ev);
    const filters = readMemberFilters(ev.url.searchParams);

    const community = await single(
      ev,
      "miembros/comunidad",
      db
        .from("communities")
        .select("id, path")
        .eq("slug", communitySlugFromRoute(ev.params, ev.url))
        .maybeSingle(),
    );

    if (!community) {
      return {
        members: [] as MemberRow[],
        publicCount: 0,
        anonymousCount: 0,
        nextCursor: null as string | null,
        canToggle: false,
        myAnonymous: null as boolean | null,
        filters,
      };
    }

    // "Miembro de esta comunidad" acá es el mismo criterio que en todo el resto
    // de la app (is_member): residir acá o en cualquier descendiente.
    const canToggle =
      !!viewer.homePath &&
      (viewer.homePath === community.path ||
        viewer.homePath.startsWith(`${community.path}.`));

    const after = ev.url.searchParams.get("despues");

    const [members, countRows, myAnonymous] = await Promise.all([
      many(
        ev,
        "miembros/listado",
        db.rpc("community_public_members", {
          p_community: community.id,
          p_after_username: after as string,
          p_limit: MEMBERS_PAGE_SIZE,
          p_query: filters.query,
          p_with_photo: filters.withPhoto,
        }),
      ),
      many(
        ev,
        "miembros/conteos",
        db.rpc("community_member_visibility_counts", {
          p_community: community.id,
        }),
      ),
      readMyCommunityVisibility(db, viewer.userId, community.id, canToggle),
    ]);

    const rows = members as MemberRow[];
    const counts = countRows?.[0];

    return {
      members: rows,
      publicCount: counts?.public_count ?? 0,
      anonymousCount: counts?.anonymous_count ?? 0,
      // Sin fila la próxima página empieza vacía: es la señal de "no hay más".
      nextCursor:
        rows.length === MEMBERS_PAGE_SIZE
          ? rows[rows.length - 1]!.username
          : null,
      canToggle,
      myAnonymous,
      filters,
    };
  },
  { search: ["q", "foto", "despues"] },
);

export const useSetVisibility = routeAction$(
  (data, ev) => setCommunityVisibility(data, ev),
  {
    validation: [
      zod$({
        community_id: z.string().uuid(),
        is_anonymous: z.enum(["true", "false"]),
      }),
    ],
    invalidate: [useMembers],
  },
);

export default component$(() => {
  const data = useMembers();
  const toggle = useSetVisibility();
  const ctx = useCommunity();
  const locale = useLocale();
  const loc = useLocation();
  const { community } = ctx.value;

  const filters = data.value.filters;
  const hasFilters = !!filters.query || filters.withPhoto;
  const hasCursor = loc.url.searchParams.has("despues");

  return (
    <section aria-labelledby="miembros-titulo">
      <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="miembros-titulo" class="text-xl font-semibold tracking-tight">
            {translate(locale, "Miembros de {{name}}", {
              name: community.name,
            })}
          </h2>
          <p class="mt-1 text-sm text-ink-muted">
            {pluralize(
              data.value.publicCount,
              "persona visible",
              "personas visibles",
              locale,
            )}
            {data.value.anonymousCount !== 0 && (
              <>
                {" "}
                ·{" "}
                {data.value.anonymousCount === -1
                  ? translate(locale, "hay miembros anónimos")
                  : translate(locale, "{{count}} o más miembros anónimos", {
                      count: formatNumber(data.value.anonymousCount, locale),
                    })}
              </>
            )}
          </p>
          <p class="mt-1 max-w-xl text-xs text-ink-faint">
            {translate(
              locale,
              "La membresía es anónima por defecto. Si elegís aparecer, podés volver a ocultarte cuando quieras.",
            )}
          </p>
        </div>

        {/* Sólo se ofrece a quien realmente es miembro de esta comunidad. */}
        {data.value.canToggle && (
          <CommunityVisibilityForm
            community={community}
            initialAnonymous={data.value.myAnonymous}
            retryHref={`${loc.url.pathname}${loc.url.search}`}
            action={toggle}
          />
        )}
      </div>

      {/* Barra de Filtros y Búsqueda */}
      {(data.value.publicCount > 0 || hasFilters || hasCursor) && (
        <div class="mb-6 flex flex-wrap items-center justify-between gap-3 border-y border-subtle py-3">
          <div class="flex flex-wrap items-center gap-2">
            <Link
              href={memberListHref({ ...filters, withPhoto: false })}
              aria-current={!filters.withPhoto ? "page" : undefined}
              class={cx(
                "inline-flex min-h-11 items-center rounded-full px-3 py-1 text-xs font-semibold transition-all",
                !filters.withPhoto
                  ? "bg-brand-600 text-white shadow-soft"
                  : "border border-subtle bg-surface text-ink-muted hover:border-strong",
              )}
            >
              {translate(locale, "Todos los miembros")}
            </Link>
            <Link
              href={memberListHref({ ...filters, withPhoto: true })}
              aria-current={filters.withPhoto ? "page" : undefined}
              class={cx(
                "inline-flex min-h-11 items-center rounded-full px-3 py-1 text-xs font-semibold transition-all",
                filters.withPhoto
                  ? "bg-brand-600 text-white shadow-soft"
                  : "border border-subtle bg-surface text-ink-muted hover:border-strong",
              )}
            >
              📸 {translate(locale, "Con foto de perfil")}
            </Link>
          </div>

          <form
            method="get"
            key={JSON.stringify(filters)}
            role="search"
            aria-label={translate(locale, "Buscar miembros públicos")}
            class="w-full sm:w-auto"
          >
            {filters.withPhoto && <input type="hidden" name="foto" value="1" />}
            <label
              for="buscar-miembro"
              class="mb-1 block text-xs font-medium text-ink-muted"
            >
              {translate(locale, "Buscar vecino por nombre o usuario")}
            </label>
            <div class="flex gap-2">
              <Input
                id="buscar-miembro"
                name="q"
                type="search"
                value={filters.query}
                maxLength={MEMBER_SEARCH_MAX_LENGTH}
                placeholder={translate(locale, "Buscar vecino por nombre…")}
                class="min-w-0 flex-1 text-sm sm:w-64"
                aria-label={translate(
                  locale,
                  "Buscar vecino por nombre o usuario",
                )}
              />
              <Button type="submit" size="sm">
                {translate(locale, "Buscar")}
              </Button>
            </div>
          </form>
        </div>
      )}

      {data.value.members.length === 0 && hasFilters ? (
        <EmptyState
          emoji="🔍"
          title="No se encontraron miembros"
          description="No hay miembros públicos con estos filtros."
        >
          <ButtonLink href="?" variant="secondary">
            {translate(locale, "Limpiar filtros")}
          </ButtonLink>
        </EmptyState>
      ) : data.value.members.length === 0 && hasCursor ? (
        <EmptyState
          emoji="👥"
          title="No hay más miembros públicos para mostrar."
        />
      ) : data.value.members.length === 0 && data.value.anonymousCount === 0 ? (
        <EmptyState
          emoji="🧑‍🤝‍🧑"
          title={translate(locale, "Todavía no vemos a nadie en {{name}}", {
            name: community.name,
          })}
          description="Las personas sólo aparecen si eligen mostrarse públicamente."
        />
      ) : (
        <>
          <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {data.value.members.map((member) => {
              const name = member.display_name ?? member.username;
              return (
                <li key={member.user_id}>
                  {/* Quien está en esta lista ya eligió mostrarse en esta
                      comunidad: `community_public_members` sólo devuelve a los
                      visibles. Enlazar su perfil no revela nada que no haya
                      decidido revelar. */}
                  <Link
                    href={publicProfileHref({
                      id: member.user_id,
                      username: member.username,
                    })}
                    class="flex flex-col items-center gap-2 rounded-2xl border border-subtle bg-surface p-3.5 text-center shadow-xs transition hover:border-brand-500 hover:shadow-soft active:scale-98"
                  >
                    <Avatar src={member.avatar_url} name={name} size="lg" />
                    <div class="w-full min-w-0">
                      <span
                        class="block truncate text-xs font-bold text-ink-strong"
                        title={name}
                      >
                        {name}
                      </span>
                      <span class="block truncate text-2xs text-ink-faint">
                        @{member.username}
                      </span>
                    </div>
                    <span class="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-0.5 text-3xs font-medium text-ink-muted">
                      🌱 {translate(locale, "Vecino")}
                    </span>
                  </Link>
                </li>
              );
            })}

            {/* El resto no tiene identidad que mostrar. El RPC oculta 1–4 y
                redondea hacia abajo en bloques de cinco desde ese umbral. */}
            {!hasFilters && data.value.anonymousCount !== 0 && (
              <li class="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-subtle bg-muted/20 p-3.5 text-center">
                <span
                  aria-hidden="true"
                  class="flex size-14 items-center justify-center rounded-full bg-inset text-base font-bold text-ink-faint"
                >
                  {data.value.anonymousCount === -1
                    ? "•••"
                    : `≥${formatNumber(data.value.anonymousCount, locale)}`}
                </span>
                <span class="text-xs font-medium text-ink-muted">
                  {translate(
                    locale,
                    data.value.anonymousCount === -1
                      ? "Miembros anónimos"
                      : "{{count}} anónimos",
                    { count: formatNumber(data.value.anonymousCount, locale) },
                  )}
                </span>
              </li>
            )}
          </ul>
        </>
      )}
      {(data.value.nextCursor || hasCursor) && (
        <nav
          aria-label={translate(locale, "Paginación")}
          class="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium"
        >
          {hasCursor && (
            <Link
              href={memberListHref(filters)}
              class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand hover:bg-muted hover:underline"
            >
              {translate(locale, "← Volver al principio")}
            </Link>
          )}
          {data.value.nextCursor && (
            <Link
              href={memberListHref(filters, data.value.nextCursor)}
              class="inline-flex min-h-11 items-center rounded-xl px-3 text-brand hover:bg-muted hover:underline"
            >
              {translate(locale, "Ver más miembros →")}
            </Link>
          )}
        </nav>
      )}
    </section>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const ctx = resolveValue(useCommunity);
  const locale = resolveValue(useLocaleLoader);
  const name = ctx?.community.name ?? "";
  return {
    title: `${translate(locale, "Miembros de {{name}}", { name })} · ${APP_NAME}`,
    meta: [
      {
        name: "description",
        content: translate(
          locale,
          "Quiénes eligieron mostrarse en {{name}}. La membresía en Agorbis es anónima por defecto y el permiso se puede revocar.",
          { name },
        ),
      },
    ],
  };
};
