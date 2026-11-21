import { component$ } from "@qwik.dev/core";
import {
  routeLoader$,
  type DocumentHead,
  type RequestHandler,
} from "@qwik.dev/router";
import {
  Alert,
  buttonClass,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
} from "~/components/ui";
import { APP_NAME } from "~/lib/constants";
import { contentHref } from "~/lib/community";
import { isUuid } from "~/lib/http";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { single } from "~/lib/query";
import {
  findRelationTargets,
  isRelationContentType,
  relationKind,
  relationReturnHref,
  relationSelectionHref,
  RELATION_CONTENT_TYPES,
} from "~/lib/relation-picker";
import { requireUser, supabase } from "~/lib/session";
import { useLocaleLoader } from "~/routes/layout";

export const onGet: RequestHandler = ({ headers }) => {
  headers.set("Cache-Control", "private, no-store");
};

const LABELS = {
  poll: "Encuesta",
  debate: "Debate",
  claim: "Reclamo",
  project: "Proyecto",
} as const;

export const useRelationSearch = routeLoader$(
  async (ev) => {
    const viewer = await requireUser(ev);
    const sourceType =
      ev.url.searchParams.get("origen") ??
      ev.url.searchParams.get("source_type");
    const sourceId =
      ev.url.searchParams.get("origen_id") ??
      ev.url.searchParams.get("source_id");
    const locale = resolveLocale(ev.locale());
    if (!isRelationContentType(sourceType) || !isUuid(sourceId))
      throw ev.error(404, translate(locale, "No encontramos esa publicación."));
    const db = supabase(ev);
    const sourceQuery =
      sourceType === "poll"
        ? db
            .from("polls")
            .select("id, title:question, author_id")
            .eq("id", sourceId)
            .neq("status", "removed")
            // Una ronda de acuerdo (D118) no es origen de relaciones.
            .is("agreement_id", null)
            .maybeSingle()
        : sourceType === "debate"
          ? db
              .from("debates")
              .select("id, title, author_id")
              .eq("id", sourceId)
              .neq("status", "removed")
              .maybeSingle()
          : sourceType === "claim"
            ? db
                .from("claims")
                .select("id, title, author_id")
                .eq("id", sourceId)
                .neq("status", "removed")
                .maybeSingle()
            : db
                .from("projects")
                .select("id, title, author_id")
                .eq("id", sourceId)
                .neq("status", "removed")
                .maybeSingle();
    const source = await single(ev, "relaciones/origen", sourceQuery);
    if (!source)
      throw ev.error(404, translate(locale, "No encontramos esa publicación."));
    if (source.author_id !== viewer.userId && !viewer.isModerator)
      throw ev.error(
        403,
        translate(locale, "No tenés permisos para vincular esta publicación."),
      );
    const query = (ev.url.searchParams.get("q") ?? "").trim().slice(0, 100);
    const candidate =
      ev.url.searchParams.get("tipo") ??
      ev.url.searchParams.get("relation_target_filter");
    const kind = isRelationContentType(candidate) ? candidate : "";
    const returnUrl = new URL(
      relationReturnHref(
        sourceType,
        sourceId,
        ev.url.searchParams.get("volver"),
      ),
      "https://agorbis.invalid",
    );
    const relationType = relationKind(
      ev.url.searchParams.get("relation_type") ??
        returnUrl.searchParams.get("vincular_relacion"),
    );
    returnUrl.searchParams.set("vincular_relacion", relationType);
    const returnHref = returnUrl.pathname + returnUrl.search + returnUrl.hash;
    const result = await findRelationTargets(
      db,
      query,
      kind,
      sourceType,
      sourceId,
    );
    return {
      sourceType,
      sourceId,
      sourceTitle: source.title,
      query,
      kind,
      returnHref,
      relationType,
      ...result,
    };
  },
  {
    search: [
      "origen",
      "origen_id",
      "source_type",
      "source_id",
      "q",
      "tipo",
      "relation_target_filter",
      "volver",
      "relation_type",
    ],
  },
);

export default component$(() => {
  const data = useRelationSearch();
  const locale = useLocale();
  const result = data.value;
  return (
    <div class="container-reading py-8">
      <a
        href={result.returnHref}
        class="inline-flex min-h-11 items-center text-sm font-medium text-brand underline"
      >
        {translate(locale, "Volver al formulario de relación")}
      </a>
      <h1 class="mt-4 text-3xl font-semibold tracking-tight">
        {translate(locale, "Buscar una publicación para vincular")}
      </h1>
      <p class="mt-2 text-sm text-ink-muted">
        {translate(
          locale,
          "La relación se guardará cuando la confirmes en el formulario de origen.",
        )}
      </p>
      <p class="mt-3 text-sm">
        <span class="font-medium">
          {translate(locale, "Publicación de origen")}:{" "}
        </span>
        <a
          href={contentHref(result.sourceType, result.sourceId)}
          class="text-brand underline"
        >
          <bdi>{result.sourceTitle}</bdi>
        </a>
      </p>
      <Card class="mt-5 p-4">
        <form
          method="get"
          action="/vincular/"
          class="space-y-3"
          aria-label={translate(locale, "Buscar publicaciones para vincular")}
        >
          <input type="hidden" name="origen" value={result.sourceType} />
          <input type="hidden" name="origen_id" value={result.sourceId} />
          <input type="hidden" name="volver" value={result.returnHref} />
          <input
            type="hidden"
            name="relation_type"
            value={result.relationType}
          />
          {locale === "en" && <input type="hidden" name="lang" value="en" />}
          <Field
            name="relation-native-query"
            label="Buscar por título"
            hint="Escribí tres letras o más…"
          >
            <Input
              id="relation-native-query"
              name="q"
              type="search"
              minLength={3}
              maxLength={100}
              required
              value={result.query}
            />
          </Field>
          <Field name="relation-native-type" label="Tipo de contenido">
            <Select id="relation-native-type" name="tipo" value={result.kind}>
              <option value="" selected={!result.kind}>
                {translate(locale, "Todos")}
              </option>
              {RELATION_CONTENT_TYPES.map((kind) => (
                <option key={kind} value={kind} selected={result.kind === kind}>
                  {translate(locale, LABELS[kind])}
                </option>
              ))}
            </Select>
          </Field>
          <button type="submit" class={buttonClass("primary", "md")}>
            {translate(locale, "Buscar")}
          </button>
        </form>
      </Card>
      {result.failed && (
        <Alert class="mt-4">
          {translate(
            locale,
            "No pudimos buscar publicaciones. Volvé a intentarlo.",
          )}
        </Alert>
      )}
      {!result.failed &&
        result.query.length >= 3 &&
        result.items.length === 0 && (
          <div class="mt-5">
            <EmptyState
              emoji="🔎"
              title="No encontramos publicaciones con ese título"
              description="Probá otro término o elegí otro tipo de contenido."
            />
          </div>
        )}
      {result.items.length > 0 && (
        <section
          class="mt-5"
          aria-label={translate(locale, "Publicaciones encontradas")}
        >
          <p class="text-sm text-ink-muted">
            {translate(
              locale,
              "Mostramos hasta 8 resultados. Afiná la búsqueda si falta la publicación que buscás.",
            )}
          </p>
          <ul class="mt-3 space-y-3">
            {result.items.map((target) => (
              <li key={`${target.kind}-${target.id}`}>
                <a
                  href={relationSelectionHref(
                    result.sourceType,
                    result.sourceId,
                    result.returnHref,
                    target,
                    result.relationType,
                  )}
                  class="block rounded-2xl border border-subtle bg-surface p-4 hover:border-brand-500 focus-visible:outline-brand-500"
                >
                  <h2 class="font-semibold">
                    <bdi>{target.title}</bdi>
                  </h2>
                  <p class="mt-1 text-sm text-ink-muted">
                    {translate(
                      locale,
                      LABELS[target.kind as keyof typeof LABELS],
                    )}{" "}
                    · {target.community_emoji}{" "}
                    <bdi>{target.community_name}</bdi>
                  </p>
                  <span class="mt-2 inline-flex min-h-11 items-center font-medium text-brand underline">
                    {translate(locale, "Elegir esta publicación")}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Vincular publicaciones")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex, nofollow" }],
});
