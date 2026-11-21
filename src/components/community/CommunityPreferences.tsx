import { component$, useComputed$ } from "@qwik.dev/core";
import { Form } from "@qwik.dev/router";
import { Icon, SubmitButton } from "~/components/ui";
import { translate, useLocale } from "~/lib/i18n";
import { nativeActionHref } from "~/lib/native-action-href";
import type { useToggleFollow } from "~/routes/c/[slug]/layout";
import type { useSetVisibility } from "~/routes/c/[slug]/miembros";

type Community = { id: string; name: string };
export const CommunityFollowForm = component$<{
  community: Community;
  initialFollowing: boolean;
  action: ReturnType<typeof useToggleFollow>;
}>(({ community, initialFollowing, action }) => {
  const locale = useLocale();
  const result = useComputed$(() =>
    action.value?.communityId === community.id ? action.value : undefined,
  );
  const following = useComputed$(
    () => result.value?.following ?? initialFollowing,
  );
  return (
    <Form action={action} class="w-full sm:w-auto sm:shrink-0">
      <input type="hidden" name="community_id" value={community.id} />
      <input type="hidden" name="following" value={String(following.value)} />
      <SubmitButton
        variant={following.value ? "secondary" : "primary"}
        pending={action.isRunning}
        class="w-full sm:w-auto"
      >
        {translate(
          locale,
          result.value?.failed
            ? following.value
              ? "Reintentar dejar de seguir"
              : "Reintentar seguir"
            : following.value
              ? "Siguiendo"
              : "Seguir",
        )}
        {following.value && !result.value?.failed && (
          <Icon name="check" class="text-[1.1em]" />
        )}
      </SubmitButton>
      {result.value?.failed && result.value.message && (
        <p role="alert" class="mt-2 text-sm text-danger">
          {translate(locale, result.value.message)}{" "}
          {translate(
            locale,
            following.value
              ? "Seguís esta comunidad."
              : "Todavía no seguís esta comunidad.",
          )}
        </p>
      )}
      <span role="status" aria-live="polite" class="sr-only">
        {result.value && !result.value.failed
          ? translate(
              locale,
              following.value
                ? "Ahora seguís {{name}}"
                : "Dejaste de seguir {{name}}",
              { name: community.name },
            )
          : ""}
      </span>
    </Form>
  );
});

export const CommunityVisibilityForm = component$<{
  community: Community;
  initialAnonymous: boolean | null;
  retryHref: string;
  action: ReturnType<typeof useSetVisibility>;
}>(({ community, initialAnonymous, retryHref, action }) => {
  const locale = useLocale();
  const result = useComputed$(() =>
    action.value?.communityId === community.id ? action.value : undefined,
  );
  const isAnonymous = useComputed$(
    () => result.value?.isAnonymous ?? initialAnonymous,
  );
  return (
    <div class="shrink-0">
      {isAnonymous.value === null ? (
        <div class="max-w-sm space-y-2">
          <p role="alert" class="text-sm text-danger">
            {translate(
              locale,
              "No pudimos consultar tu visibilidad pública. Reintentá antes de cambiarla.",
            )}
          </p>
          <a
            href={retryHref}
            class="inline-flex min-h-11 items-center rounded-xl border border-subtle px-3 text-sm font-medium text-brand hover:bg-muted"
          >
            {translate(locale, "Reintentar")}
          </a>
        </div>
      ) : (
        <Form action={action}>
          <input type="hidden" name="community_id" value={community.id} />
          <input
            type="hidden"
            name="is_anonymous"
            value={String(!isAnonymous.value)}
          />
          <SubmitButton
            formAction={nativeActionHref(retryHref, action.actionPath)}
            variant="secondary"
            size="sm"
            pending={action.isRunning}
          >
            {translate(
              locale,
              isAnonymous.value
                ? "👻 Aparecés anónimo — mostrarme"
                : "👤 Aparecés en la lista — ocultarme",
            )}
          </SubmitButton>
          <span role="status" aria-live="polite" class="sr-only">
            {result.value && !result.value.failed
              ? translate(
                  locale,
                  isAnonymous.value
                    ? "Ahora aparecés como anónimo en {{name}}"
                    : "Ahora aparecés en la lista de {{name}}",
                  { name: community.name },
                )
              : ""}
          </span>
        </Form>
      )}
      {result.value?.failed && result.value.message && (
        <p role="alert" class="mt-2 text-sm text-danger">
          {translate(locale, result.value.message)}
        </p>
      )}
    </div>
  );
});
