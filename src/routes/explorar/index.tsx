import { component$ } from "@qwik.dev/core";
import { routeLoader$, type DocumentHead } from "@qwik.dev/router";
import {
  LocationPicker,
  type PickerOption,
} from "~/components/community/LocationPicker";
import {
  WorldMap,
  type WorldMapCountry,
} from "~/components/community/WorldMap";
import { Card, Chip } from "~/components/ui";
import type { CommunityRef } from "~/lib/community";
import { compareNames, escapeLike } from "~/lib/community";
import { APP_NAME, LEVEL_CONTINENT, LEVEL_COUNTRY } from "~/lib/constants";
import { parentsWithChildren } from "~/lib/community-children";
import { many, single } from "~/lib/query";
import { supabase } from "~/lib/session";
import { useLocale, resolveLocale, translate } from "~/lib/i18n";
import { useLocaleLoader } from "../layout";

const BASE = "/explorar";
/**
 * Agorbis es una plataforma argentina: empezar en la Tierra obligaba a pasar
 * por continentes y países para llegar a la propia provincia. La Tierra y el
 * mapa siguen a un clic, en la miga de pan y en el selector de modo.
 */
const DEFAULT_PARENT = "argentina";
/** Una búsqueda recorre todos los niveles; se muestran los más específicos. */
const GLOBAL_RESULT_LIMIT = 50;
const RESULT_LIMIT = 300;
/** Muy por encima de los países que existen, y por debajo de `max_rows`. */
const MAP_COUNTRIES_LIMIT = 500;
const EXPLORE_LOADER_OPTIONS = { search: ["parent", "q", "view"] };

function flagToIso2(flag: string | null): string | null {
  const points = [...(flag ?? "")].map((character) => character.codePointAt(0));
  if (
    points.length !== 2 ||
    points.some(
      (point) => point === undefined || point < 0x1f1e6 || point > 0x1f1ff,
    )
  ) {
    return null;
  }

  return points
    .map((point) => String.fromCharCode((point as number) - 0x1f1e6 + 65))
    .join("");
}

export const useExplore = routeLoader$(async (ev) => {
  const db = supabase(ev);
  const locale = resolveLocale(ev.locale());
  const requestedParent = ev.url.searchParams.get("parent");
  const wantsMap = ev.url.searchParams.get("view") === "map";
  const query = (ev.url.searchParams.get("q") ?? "").trim();
  const isGlobal = query.length > 0;
  const findCommunity = (slug: string) =>
    single(
      ev,
      "explorar/parent",
      db
        .from("communities")
        .select("id, slug, name, emoji, level, path")
        .eq("slug", slug)
        .maybeSingle(),
    );

  let parent = await findCommunity(
    requestedParent ?? (wantsMap ? "earth" : DEFAULT_PARENT),
  );
  // Sin la comunidad predeterminada se cae en la Tierra en vez de redirigir:
  // la redirección volvería a pedir la misma predeterminada.
  if (!parent && !requestedParent) parent = await findCommunity("earth");
  if (!parent) throw ev.redirect(302, BASE);

  const parentSlug = parent.slug;
  const view =
    parentSlug === "earth" && wantsMap
      ? ("map" as const)
      : ("hierarchy" as const);

  const segments = parent.path.split(".");
  const trailPromise =
    parentSlug === "earth"
      ? Promise.resolve([parent])
      : many(
          ev,
          "explorar/ruta",
          db
            .from("communities")
            .select("id, slug, name, emoji, level, path")
            .in(
              "path",
              segments.map((_, i) => segments.slice(0, i + 1).join(".")),
            )
            .order("level", { ascending: true }),
        );

  // Buscar sólo entre los hijos del nivel visible hacía que "Rosario" no
  // apareciera desde la Tierra ni desde Argentina. Una búsqueda recorre toda
  // la jerarquía, primero lo más específico.
  const childrenQuery = isGlobal
    ? db
        .from("communities")
        .select("id, slug, name, emoji, level, path, member_count, parent_id")
        .ilike("name", `%${escapeLike(query)}%`)
        .order("level", { ascending: false })
        .order("name", { ascending: true })
        .limit(GLOBAL_RESULT_LIMIT)
    : db
        .from("communities")
        .select("id, slug, name, emoji, level, path, member_count, parent_id")
        .eq("parent_id", parent.id)
        // Hace determinista el recorte de 300: sin orden, qué hijos entran lo
        // decide el plan de Postgres y puede variar entre dos cargas iguales.
        .order("name", { ascending: true })
        .limit(RESULT_LIMIT);

  // La geometría, la ruta y los hijos no dependen entre sí. En el Supabase
  // hosteado, esperarlos en serie agregaba tres latencias completas al TTFB.
  const mapCountriesPromise: Promise<{
    items: WorldMapCountry[];
  }> =
    view === "map"
      ? Promise.all([
          many(
            ev,
            "explorar/mapa/paises",
            db
              .from("communities")
              .select("slug, name, emoji, parent_id, member_count, description")
              .eq("level", LEVEL_COUNTRY)
              // Techo explícito y orden total: hay unos 250 países, pero sin
              // `limit` el recorte lo ponía PostgREST en silencio.
              .order("slug", { ascending: true })
              .limit(MAP_COUNTRIES_LIMIT),
          ),
          many(
            ev,
            "explorar/mapa/continentes",
            db
              .from("communities")
              .select("id, name")
              .eq("level", LEVEL_CONTINENT)
              .limit(MAP_COUNTRIES_LIMIT),
          ),
        ]).then(([countries, continents]) => {
          const continentNames = new Map(
            continents.map((continent) => [continent.id, continent.name]),
          );

          const items = countries
            .flatMap((country) => {
              const iso2 = flagToIso2(country.emoji);
              if (!iso2) return [];
              return [
                {
                  iso2,
                  slug: country.slug,
                  name: country.name,
                  flag: country.emoji ?? "🏳️",
                  continentName:
                    continentNames.get(country.parent_id ?? "") ?? "Tierra",
                  memberCount: country.member_count,
                  description: country.description,
                },
              ];
            })
            .sort((a, b) => compareNames(a.name, b.name, locale));
          return { items };
        })
      : Promise.resolve({ items: [] });

  const [trail, rows, mapData] = await Promise.all([
    trailPromise,
    view === "map"
      ? Promise.resolve([])
      : many(ev, "explorar/hijas", childrenQuery),
    mapCountriesPromise,
  ]);

  // Qué hijas tienen a su vez hijas, sin el recorte silencioso de mil filas
  // que dejaba ciudades sin el enlace para bajar de nivel. En una búsqueda
  // global también hace falta el nombre de la comunidad que las contiene.
  const parentIds = isGlobal
    ? [...new Set(rows.flatMap((r) => (r.parent_id ? [r.parent_id] : [])))]
    : [];
  const [withChildren, parents] = await Promise.all([
    parentsWithChildren(
      ev,
      db,
      "explorar/nietas",
      rows.map((r) => r.id),
    ),
    parentIds.length
      ? many(
          ev,
          "explorar/contexto",
          db.from("communities").select("id, name").in("id", parentIds),
        )
      : Promise.resolve([]),
  ]);
  const parentNames = new Map(parents.map((p) => [p.id, p.name]));

  const options: PickerOption[] = rows
    .map(({ parent_id, ...r }) => ({
      ...r,
      has_children: withChildren.has(r.id),
      context: isGlobal ? (parentNames.get(parent_id ?? "") ?? null) : null,
    }))
    // En una búsqueda global, lo más específico primero: quien escribe su
    // ciudad la busca a ella antes que a la provincia homónima.
    .sort((a, b) =>
      isGlobal && a.level !== b.level
        ? b.level - a.level
        : compareNames(a.name, b.name, locale),
    );

  return {
    trail: trail as CommunityRef[],
    options,
    query,
    parentName: parent.name,
    mapCountries: mapData.items,
    isRoot: parentSlug === "earth",
    /** Sin `parent` en la URL: la vista con la que abre Explorar. */
    isDefault: !requestedParent && !wantsMap,
    isGlobal,
    view,
  };
}, EXPLORE_LOADER_OPTIONS);

export default component$(() => {
  const data = useExplore();
  const locale = useLocale();
  const showingMap = data.value.view === "map";
  const isLeaf =
    !data.value.isRoot && !data.value.query && data.value.options.length === 0;

  return (
    <div class="container-content py-6 sm:py-8">
      <header class="mb-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 class="text-display-lg sm:text-display-xl">
            {translate(locale, "Explorar comunidades")}
          </h1>
          <p class="mt-2 max-w-2xl text-ink-muted">
            {data.value.isRoot
              ? translate(
                  locale,
                  "Elegí cómo explorar: recorré la jerarquía geográfica o ubicá un país en el mapa.",
                )
              : translate(
                  locale,
                  isLeaf
                    ? "Abrí su comunidad para ver información, miembros y formas de participar."
                    : "Estás en {{name}}. Abrí una comunidad o seguí bajando al siguiente nivel.",
                  { name: data.value.parentName },
                )}
          </p>
        </div>

        {(data.value.isRoot || data.value.isDefault) && (
          // El conmutador de vista usa el mismo chip que el resto de los
          // filtros, con íconos propios (D123).
          <nav
            aria-label={translate(locale, "Modo de exploración")}
            class="flex shrink-0 flex-wrap gap-2"
          >
            <Chip
              variant="action"
              icon="list"
              href={BASE}
              selected={!showingMap}
            >
              {translate(locale, "Por jerarquía")}
            </Chip>
            <Chip
              variant="action"
              icon="map"
              href={`${BASE}?view=map`}
              selected={showingMap}
            >
              {translate(locale, "En el mapa")}
            </Chip>
          </nav>
        )}
      </header>

      {showingMap ? (
        <WorldMap countries={data.value.mapCountries} />
      ) : (
        <Card class="p-4 sm:p-6">
          <LocationPicker
            trail={data.value.trail}
            options={data.value.options}
            query={data.value.query}
            navBase={`${BASE}?parent=`}
            searchAction={BASE}
            confirmBase="/c/"
            resultLimit={
              data.value.isGlobal ? GLOBAL_RESULT_LIMIT : RESULT_LIMIT
            }
            searchScope="all"
            requestHref="/comunidades/solicitar"
          />
        </Card>
      )}
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const locale = resolveValue(useLocaleLoader);
  return {
    title: `${translate(locale, "Explorar comunidades")} · ${APP_NAME}`,
    meta: [
      {
        name: "description",
        content: translate(
          locale,
          "Recorré las comunidades de Agorbis: de la Tierra a los continentes, países, provincias y ciudades.",
        ),
      },
    ],
  };
};
