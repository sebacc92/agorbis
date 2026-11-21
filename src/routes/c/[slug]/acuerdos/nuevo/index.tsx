import { $, component$, useSignal, useTask$ } from "@qwik.dev/core";
import {
  Form,
  routeAction$,
  routeLoader$,
  server$,
  z,
  zod$,
  type DocumentHead,
} from "@qwik.dev/router";
import { CharCounter, DraftStatusBar } from "~/components/forms/FormShell";
import { PublicationError } from "~/components/forms/PublicationError";
import { PublishedNotice } from "~/components/forms/PublishedNotice";
import { draftKey, useDraft } from "~/components/forms/useDraft";
import {
  Alert,
  Card,
  Input,
  Select,
  SubmitButton,
  Textarea,
  cx,
} from "~/components/ui";
import { showToast } from "~/components/ui/Toast";
import {
  eligibilityIssue,
  eligibilityMessage,
  filterCandidates,
  isCandidateFor,
  isKnownProposeError,
  mergeCandidates,
  proposeErrorMessage,
  type CandidateCommunity,
} from "~/lib/agreements";
import { escapeLike, routes, type CommunityRef } from "~/lib/community";
import { APP_NAME, LOAD_FAILED } from "~/lib/constants";
import { publicationResult } from "~/lib/content-publication";
import { participationBlockMessage, writeFailure } from "~/lib/db-error";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { logFailure } from "~/lib/log";
import { many, serverMany, single } from "~/lib/query";
import { requestIdOf } from "~/lib/request-id";
import {
  COMMUNITY_SEARCH_MIN_LENGTH,
  GLOBAL_SEARCH_MAX_LENGTH,
} from "~/lib/search";
import { requireResident, supabase } from "~/lib/session";
import { createServerSupabase } from "~/lib/supabase";
import { useLocaleLoader } from "~/routes/layout";

/**
 * Proponer un acuerdo (D118). La comunidad de quien propone participa
 * siempre, así que el formulario vive en su comunidad de residencia. Las
 * reglas de elegibilidad se avisan acá antes de enviar y las decide la base al
 * recibir (`propose_agreement`); si discrepan, manda la base.
 */

const TITLE_MIN = 10;
const TITLE_MAX = 160;
const BODY_MIN = 50;
const BODY_MAX = 5000;
const DURATION_OPTIONS = ["7", "14", "21", "30"] as const;
/** Cuántas candidatas se muestran por vez; la búsqueda acota el resto. */
const VISIBLE_CANDIDATES = 12;
/**
 * Tope del loader, para lo que se muestra antes de escribir. Desde que
 * Argentina tiene nivel 4 (D127) el país pasa las dos mil comunidades: las
 * demás se encuentran escribiendo, con `searchAgreementCandidates`.
 */
const CANDIDATES_LIMIT = 500;
/** Cuántas trae cada búsqueda en el servidor. */
const SEARCH_LIMIT = 40;
const COUNTRY_SEGMENTS = 3;

export const useProposeContext = routeLoader$(async (ev) => {
  const viewer = await requireResident(ev);
  const db = supabase(ev);
  const locale = resolveLocale(ev.locale());
  const community = await single(
    ev,
    "acuerdos/comunidad",
    db
      .from("communities")
      .select("id, slug, name, emoji, level, path")
      .eq("slug", ev.params.slug)
      .maybeSingle(),
  );
  if (!community) {
    throw ev.error(404, translate(locale, "No encontramos esa comunidad."));
  }
  // Se propone desde la residencia: es la comunidad que participa siempre.
  if (viewer.profile?.home_community_id !== community.id) {
    const home = viewer.residenceChain.at(-1);
    if (!home) {
      // La residencia existe (requireResident la exigió) pero la cadena no
      // se pudo leer: un 500 recuperable, no una redirección a esta misma URL.
      logFailure(
        { scope: "acuerdos/residencia", requestId: requestIdOf(ev) },
        { message: "cadena de residencia vacía" },
      );
      throw ev.error(500, translate(locale, LOAD_FAILED));
    }
    throw ev.redirect(302, routes.newContent(home.slug, "acuerdos/nuevo"));
  }

  const countryPrefix = community.path
    .split(".")
    .slice(0, COUNTRY_SEGMENTS)
    .join(".");
  const rows = await many(
    ev,
    "acuerdos/candidatas",
    db
      .from("communities")
      .select("id, slug, name, emoji, level, path")
      .like("path", `${countryPrefix}.%`)
      .gte("level", 3)
      .lte("level", 5)
      .order("level")
      .order("name")
      // Una más que el límite: así se sabe si quedaron comunidades afuera.
      .limit(CANDIDATES_LIMIT + 1),
  );
  const truncated = rows.length > CANDIDATES_LIMIT;
  const candidates: CandidateCommunity[] = rows
    .slice(0, CANDIDATES_LIMIT)
    .filter((row) => isCandidateFor(community, row));

  const communityRef: CommunityRef = community;
  return {
    draftOwnerId: viewer.userId,
    community: communityRef,
    candidates,
    truncated,
  };
});

/**
 * Busca candidatas por nombre en todo el país. Antes el filtro corría sólo
 * sobre las primeras CANDIDATES_LIMIT del loader y, con el nivel 4 de
 * Argentina, Tandil quedaba en el puesto 1.920: no había forma de elegirla.
 * Recibe el slug y no el path, así el país sale de la base y no del navegador;
 * la elegibilidad la vuelve a decidir `propose_agreement` al enviar.
 */
export const searchAgreementCandidates = server$(async function (
  slug: string,
  query: string,
): Promise<CandidateCommunity[]> {
  const term = query.trim().slice(0, GLOBAL_SEARCH_MAX_LENGTH);
  if (term.length < COMMUNITY_SEARCH_MIN_LENGTH) return [];
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return [];

  const db = createServerSupabase(this);
  const [own] = await serverMany(
    this,
    "acuerdos/candidatas-origen",
    db.from("communities").select("id, path").eq("slug", slug).limit(1),
  );
  if (!own) return [];
  const countryPrefix = own.path
    .split(".")
    .slice(0, COUNTRY_SEGMENTS)
    .join(".");
  const rows = await serverMany(
    this,
    "acuerdos/candidatas-busqueda",
    db
      .from("communities")
      .select("id, slug, name, emoji, level, path")
      .like("path", `${countryPrefix}.%`)
      .gte("level", 3)
      .lte("level", 5)
      .ilike("name", `%${escapeLike(term)}%`)
      .order("level")
      .order("name")
      .limit(SEARCH_LIMIT),
  );
  return rows.filter((row) => isCandidateFor(own, row));
});

export const useProposeAgreement = routeAction$(
  async (data, ev) => {
    const locale = resolveLocale(ev.locale());
    // requireResident ya redirige a quien no tiene sesión o residencia.
    await requireResident(ev);
    const communities = Array.isArray(data.communities)
      ? data.communities
      : data.communities
        ? [data.communities]
        : [];
    const { data: id, error } = await supabase(ev).rpc("propose_agreement", {
      p_title: data.title,
      p_body: data.body,
      p_communities: communities,
      p_duration_days: data.duration_days,
    });
    if (error || !id) {
      const known =
        participationBlockMessage(error) !== null || isKnownProposeError(error);
      if (!known) {
        logFailure(
          { scope: "acuerdos/proponer", requestId: requestIdOf(ev) },
          error ?? { message: "propose_agreement sin id" },
        );
      }
      const message =
        participationBlockMessage(error) ?? proposeErrorMessage(locale, error);
      const failure = writeFailure(error, message);
      return ev.fail(failure.status, { message: failure.message });
    }
    // Como las demás publicaciones: con JavaScript devuelve la confirmación
    // para borrar el borrador antes de navegar; sin JavaScript redirige
    // (POST/redirect/GET) y la ficha muestra "publicado".
    return publicationResult(ev, routes.agreement(id));
  },
  zod$({
    community_slug: z.string().min(1),
    title: z.string().trim().min(TITLE_MIN).max(TITLE_MAX),
    body: z.string().trim().min(BODY_MIN).max(BODY_MAX),
    duration_days: z.coerce.number().int().min(7).max(30),
    // Una casilla marcada llega como string; varias, como array.
    communities: z
      .union([z.string().uuid(), z.array(z.string().uuid()).max(5)])
      .optional(),
  }),
);

export default component$(() => {
  const locale = useLocale();
  const { draftOwnerId, community, candidates, truncated } =
    useProposeContext().value;
  const propose = useProposeAgreement();

  const title = useSignal("");
  const body = useSignal("");
  const duration = useSignal<string>("14");
  const selected = useSignal<string[]>([]);
  const query = useSignal("");
  // Las del loader más las que fue trayendo la búsqueda: así una elegida no
  // se pierde aunque la búsqueda siguiente no la traiga.
  const pool = useSignal<readonly CandidateCommunity[]>(candidates);
  const searching = useSignal(false);
  const searchFailed = useSignal(false);

  const draftStorage = useDraft(
    draftKey("agreement", community.slug, draftOwnerId),
    { title, body, duration, selected },
    propose,
  );
  const discardDraft$ = $(async () => {
    await draftStorage.reset();
    showToast(translate(locale, "Borrador descartado"), "info");
  });

  // Desde dos letras se busca en todo el país; con menos, sólo entre las que
  // trajo el loader. Se espera un momento entre teclas y se descarta una
  // respuesta vieja si llegó otra búsqueda.
  useTask$(({ track, cleanup }) => {
    const term = track(() => query.value).trim();
    searchFailed.value = false;
    if (term.length < COMMUNITY_SEARCH_MIN_LENGTH) {
      searching.value = false;
      return;
    }
    searching.value = true;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const found = await searchAgreementCandidates(community.slug, term);
        if (!stale) pool.value = mergeCandidates(pool.value, found);
      } catch {
        if (!stale) searchFailed.value = true;
      } finally {
        if (!stale) searching.value = false;
      }
    }, 150);
    cleanup(() => {
      stale = true;
      clearTimeout(timer);
    });
  });

  const chosen = pool.value.filter((c) => selected.value.includes(c.id));
  const issue = eligibilityIssue(community, chosen);
  const visible = filterCandidates(
    pool.value,
    query.value,
    selected.value,
    VISIBLE_CANDIDATES,
  );

  return (
    <div class="container-reading py-6 sm:py-8">
      <header class="mb-6">
        <p class="text-sm font-semibold text-brand">
          {community.emoji} {community.name}
        </p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {translate(locale, "Proponer un acuerdo")}
        </h1>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Un compromiso que tu comunidad vota en secreto, sola o junto con otras. Se abre a votación cuando cada comunidad nombrada tiene una residente que la adhiere.",
          )}
        </p>
      </header>

      <Card class="p-5 sm:p-6">
        <Form
          data-native-form
          action={propose}
          onSubmit$={draftStorage.persist}
          class="space-y-6"
        >
          <input type="hidden" name="community_slug" value={community.slug} />

          <PublicationError value={propose.value} />
          <PublishedNotice href={draftStorage.publishedTo.value} />
          <DraftStatusBar
            status={draftStorage.status.value}
            hasContent={!!(title.value || body.value)}
            onDiscard$={discardDraft$}
            restored={draftStorage.restored.value}
          />

          <div>
            <div class="flex items-baseline justify-between gap-2">
              <label
                for="title"
                class="block text-sm font-medium text-ink-strong"
              >
                {translate(locale, "Título del acuerdo")}
              </label>
              <CharCounter
                value={title.value}
                max={TITLE_MAX}
                id="title-count"
              />
            </div>
            <Input
              id="title"
              name="title"
              required
              minLength={TITLE_MIN}
              maxLength={TITLE_MAX}
              class="mt-1.5"
              placeholder={translate(
                locale,
                "Mantenimiento compartido de la ruta costera",
              )}
              invalid={!!propose.value?.fieldErrors?.title}
              aria-describedby="title-count"
              value={title.value}
              onInput$={(_, el) => (title.value = el.value)}
            />
          </div>

          <div>
            <div class="flex items-baseline justify-between gap-2">
              <label
                for="body"
                class="block text-sm font-medium text-ink-strong"
              >
                {translate(locale, "El compromiso")}
              </label>
              <CharCounter value={body.value} max={BODY_MAX} id="body-count" />
            </div>
            <Textarea
              id="body"
              name="body"
              required
              rows={8}
              minLength={BODY_MIN}
              maxLength={BODY_MAX}
              class="mt-1.5"
              placeholder={translate(
                locale,
                "Qué se compromete a hacer cada comunidad, en qué plazo y cómo se va a saber si se cumplió.",
              )}
              invalid={!!propose.value?.fieldErrors?.body}
              aria-describedby="body-count body-hint"
              value={body.value}
              onInput$={(_, el) => (body.value = el.value)}
            />
            <p id="body-hint" class="mt-1 text-xs text-ink-faint">
              {translate(
                locale,
                "Mínimo 50 caracteres. Una vez abierta la votación, el texto no se puede cambiar.",
              )}
            </p>
          </div>

          <fieldset>
            <legend class="mb-2 text-sm font-medium text-ink-strong">
              {translate(locale, "Otras comunidades que lo votan")}
            </legend>
            <p class="mb-3 text-sm text-ink-muted">
              {translate(
                locale,
                "{{community}} participa siempre. Podés sumar hasta cuatro comunidades del mismo país, de provincia para abajo, que no se contengan entre sí. Si no sumás ninguna, es un acuerdo interno.",
                { community: community.name },
              )}
            </p>
            <Input
              type="search"
              name="buscar_comunidad"
              aria-label={translate(locale, "Buscar comunidad")}
              placeholder={translate(locale, "Buscar por nombre")}
              value={query.value}
              onInput$={(_, el) => (query.value = el.value)}
            />
            <ul class="mt-3 grid gap-2 sm:grid-cols-2">
              {visible.map((candidate) => {
                const checked = selected.value.includes(candidate.id);
                return (
                  <li key={candidate.id}>
                    <label
                      class={cx(
                        "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                        checked
                          ? "border-brand-600 bg-brand-50 dark:bg-brand-950/40"
                          : "border-subtle",
                      )}
                    >
                      <input
                        type="checkbox"
                        name="communities"
                        value={candidate.id}
                        checked={checked}
                        onChange$={(_, el) => {
                          selected.value = el.checked
                            ? [...selected.value, candidate.id]
                            : selected.value.filter(
                                (id) => id !== candidate.id,
                              );
                        }}
                      />
                      <span>
                        {candidate.emoji} {candidate.name}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {searching.value && (
              <p class="mt-2 text-sm text-ink-muted" role="status">
                {translate(locale, "Buscando…")}
              </p>
            )}
            {!searching.value && visible.length === 0 && (
              <p class="mt-2 text-sm text-ink-muted">
                {translate(
                  locale,
                  "Ninguna comunidad coincide con esa búsqueda.",
                )}
              </p>
            )}
            {searchFailed.value && (
              <Alert tone="warn" class="mt-3">
                {translate(
                  locale,
                  "No se pudo buscar entre todas las comunidades del país. Probá de nuevo.",
                )}
              </Alert>
            )}
            {truncated &&
              query.value.trim().length < COMMUNITY_SEARCH_MIN_LENGTH && (
                <p class="mt-2 text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Hay más comunidades en el país de las que se muestran. Escribí al menos {{min}} letras para buscar entre todas.",
                    { min: String(COMMUNITY_SEARCH_MIN_LENGTH) },
                  )}
                </p>
              )}
            {issue && (
              <Alert tone="warn" class="mt-3">
                {eligibilityMessage(locale, issue)}
              </Alert>
            )}
          </fieldset>

          <div>
            <label
              for="duration_days"
              class="block text-sm font-medium text-ink-strong"
            >
              {translate(locale, "Duración de la votación")}
            </label>
            <Select
              id="duration_days"
              name="duration_days"
              class="mt-1.5"
              value={duration.value}
              onChange$={(_, el) => (duration.value = el.value)}
            >
              {DURATION_OPTIONS.map((days) => (
                <option
                  key={days}
                  value={days}
                  selected={duration.value === days}
                >
                  {translate(locale, "{{count}} días", { count: days })}
                </option>
              ))}
            </Select>
            <p class="mt-1 text-xs text-ink-faint">
              {translate(
                locale,
                "Empieza a contar cuando la última comunidad adhiere. Si pasan 30 días sin esa adhesión, la propuesta vence sola.",
              )}
            </p>
          </div>

          <Alert tone="brand">
            {translate(
              locale,
              "Para que una ronda tenga resultado hacen falta cinco participantes o más en cada comunidad. Con menos, el acuerdo queda sin quórum.",
            )}
          </Alert>

          <SubmitButton pending={propose.isRunning} class="w-full sm:w-auto">
            {translate(locale, "Proponer el acuerdo")}
          </SubmitButton>
        </Form>
      </Card>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const locale = resolveValue(useLocaleLoader);
  const { community } = resolveValue(useProposeContext);
  return {
    title: `${translate(locale, "Proponer un acuerdo")} · ${community.name} · ${APP_NAME}`,
    meta: [{ name: "robots", content: "noindex" }],
  };
};
