import { component$ } from "@qwik.dev/core";
import { routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { CreateButton } from "~/components/quota/CreateButton";
import { Card, Icon, Select, cx } from "~/components/ui";
import { CONTENT_KINDS, CONTENT_KIND_TONES } from "~/lib/content-kinds";
import { APP_NAME } from "~/lib/constants";
import { useLocale, translate } from "~/lib/i18n";
import { publicationCommunity } from "~/lib/publication-eligibility";
import { CONTENT_TYPE_ORDER, loadQuotaSummary } from "~/lib/quota";
import type { ContentType } from "~/lib/database.types.helpers";
import { requireResident } from "~/lib/session";
import { useLocaleLoader } from "../layout";

/* Los nombres de las pestañas de la comunidad (`community-sections`). */
const SECTION_TITLE: Record<ContentType, string> = {
  poll: "Encuestas",
  debate: "Debates",
  claim: "Reclamos",
  project: "Proyectos",
};

export const usePublicationChoices = routeLoader$(
  async (ev) => {
    const viewer = await requireResident(ev);
    const requestedSlug = ev.url.searchParams.get("comunidad");
    const requestedType = ev.url.searchParams.get("tipo");
    const community = publicationCommunity(
      viewer.residenceChain,
      requestedSlug,
    );
    if (!community) throw ev.redirect(302, "/onboarding");
    const type =
      CONTENT_TYPE_ORDER.find((item) => item === requestedType) ?? null;
    return {
      chain: viewer.residenceChain,
      community,
      redirected: !!requestedSlug && community.slug !== requestedSlug,
      type,
      summary: await loadQuotaSummary(ev, viewer.userId),
    };
  },
  { search: ["comunidad", "tipo"] },
);

export default component$(() => {
  const data = usePublicationChoices();
  const locale = useLocale();
  const { community, chain, summary, type } = data.value;
  const types = type ? [type] : CONTENT_TYPE_ORDER;
  return (
    <div class="container-reading py-8">
      <h1 class="text-3xl font-semibold tracking-tight">
        {translate(locale, "Elegí dónde publicar")}
      </h1>
      <p class="mt-2 text-ink-muted">
        {translate(
          locale,
          "Elegí una comunidad de tu residencia y revisá el cupo antes de escribir.",
        )}
      </p>
      {data.value.redirected && (
        <p
          role="status"
          class="mt-5 rounded-2xl border border-subtle bg-muted p-4 text-sm text-ink-muted"
        >
          {translate(
            locale,
            "Tu residencia declarada no pertenece a esa comunidad. Podés publicar en {{name}} o elegir otro nivel de tu residencia.",
            { name: community.name },
          )}
        </p>
      )}
      <form
        method="get"
        action="/publicar"
        class="mt-6 flex flex-wrap items-end gap-3"
      >
        {type && <input type="hidden" name="tipo" value={type} />}
        <div class="min-w-0 flex-1 basis-64">
          <label for="comunidad" class="mb-1.5 block text-sm font-medium">
            {translate(locale, "Comunidad donde publicar")}
          </label>
          <Select name="comunidad">
            {[...chain].reverse().map((item) => (
              <option
                key={item.id}
                value={item.slug}
                selected={item.slug === community.slug}
              >
                {`${item.emoji ?? "📍"} ${item.name}`}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="submit"
          class="min-h-11 rounded-2xl border border-control px-4 text-sm font-semibold text-brand hover:bg-muted"
        >
          {translate(locale, "Ver opciones")}
        </button>
      </form>
      <div class="mt-6 space-y-4">
        {types.map((item) => (
          <Card key={item} class="p-5">
            {/* El ícono y el color del tipo (D123), y el nombre como en las
                pestañas de la comunidad: antes iba un emoji y "encuestas" en
                minúscula. */}
            <h2 class="mb-3 flex items-center gap-2 font-semibold">
              <Icon
                name={CONTENT_KINDS[item].icon}
                class={cx("text-lg", CONTENT_KIND_TONES[item].text)}
              />
              {translate(locale, SECTION_TITLE[item])}
            </h2>
            <CreateButton
              type={item}
              communitySlug={community.slug}
              communityName={community.name}
              summary={summary}
              isMember
              isAuthenticated
              size="md"
            />
          </Card>
        ))}
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Elegí dónde publicar")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
