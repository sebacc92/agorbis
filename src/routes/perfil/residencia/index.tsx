import { component$ } from "@qwik.dev/core";
import {
  Form,
  Link,
  routeAction$,
  routeLoader$,
  zod$,
  z,
  type DocumentHead,
} from "@qwik.dev/router";
import {
  LocationPicker,
  type PickerOption,
} from "~/components/community/LocationPicker";
import { Alert, Card, SubmitButton } from "~/components/ui";
import type { CommunityRef } from "~/lib/community";
import { compareNames, escapeLike, routes } from "~/lib/community";
import {
  APP_NAME,
  LEVEL_NAMES,
  RESIDENCE_COOLDOWN_DAYS,
} from "~/lib/constants";
import { participationBlockMessage } from "~/lib/db-error";
import { formatInstant, formatNumber } from "~/lib/format";
import { resolveLocale, useLocale, translate } from "~/lib/i18n";
import { useTimeZone } from "~/lib/timezone";
import { many, single } from "~/lib/query";
import { requireUser, supabase } from "~/lib/session";
import { useLocaleLoader } from "../../layout";

const BASE = "/perfil/residencia";
const RESIDENCE_LOADER_OPTIONS = { search: ["parent", "q", "c"] };
const RESIDENCE_LIMIT_PREFIX =
  "Sólo podés cambiar tu residencia una vez cada 30 días. Vas a poder de nuevo el ";

export const useResidence = routeLoader$(async (ev) => {
  const viewer = await requireUser(ev);
  const db = supabase(ev);

  const changedAt = viewer.profile?.residence_changed_at;
  const nextChange =
    changedAt && viewer.profile?.home_community_id
      ? new Date(
          new Date(changedAt).getTime() + RESIDENCE_COOLDOWN_DAYS * 86400_000,
        )
      : null;
  const nextChangeAt =
    nextChange && nextChange.getTime() > Date.now()
      ? nextChange.toISOString()
      : null;
  const { data: canCorrectNow } =
    changedAt && viewer.profile?.home_community_id
      ? await db.rpc("can_correct_residence", { p_user: viewer.userId })
      : { data: false };

  const confirmSlug = ev.url.searchParams.get("c");

  // ---- Paso de confirmación ------------------------------------------------
  if (confirmSlug) {
    const chosen = await single(
      ev,
      "residencia/elegida",
      db
        .from("communities")
        .select("id, slug, name, emoji, level, path")
        .eq("slug", confirmSlug)
        .maybeSingle(),
    );

    if (chosen) {
      const segments = chosen.path.split(".");
      const chain = await many(
        ev,
        "residencia/cadena",
        db
          .from("communities")
          .select("id, slug, name, emoji, level, path")
          .in(
            "path",
            segments.map((_, i) => segments.slice(0, i + 1).join(".")),
          )
          .order("level", { ascending: true }),
      );

      return {
        mode: "confirmar" as const,
        chosen,
        chain: chain as CommunityRef[],
        trail: [] as CommunityRef[],
        options: [] as PickerOption[],
        query: "",
        current: viewer.residenceChain.at(-1) ?? null,
        nextChangeAt,
        canCorrectNow: !!canCorrectNow,
      };
    }
  }

  // ---- Selector ------------------------------------------------------------
  const parentSlug = ev.url.searchParams.get("parent") ?? "earth";
  const query = (ev.url.searchParams.get("q") ?? "").trim();

  const parent = await single(
    ev,
    "residencia/padre",
    db
      .from("communities")
      .select("id, slug, name, emoji, level, path")
      .eq("slug", parentSlug)
      .maybeSingle(),
  );

  if (!parent) throw ev.redirect(302, BASE);

  const segments = parent.path.split(".");
  const trail = await many(
    ev,
    "residencia/ruta",
    db
      .from("communities")
      .select("id, slug, name, emoji, level, path")
      .in(
        "path",
        segments.map((_, i) => segments.slice(0, i + 1).join(".")),
      )
      .order("level", { ascending: true }),
  );

  const isGlobal = query.length >= 2;
  let childrenQuery = db
    .from("communities")
    .select("id, slug, name, emoji, level, path, member_count");

  if (isGlobal) {
    childrenQuery = childrenQuery
      .ilike("name", `%${escapeLike(query)}%`)
      .order("level", { ascending: false })
      .limit(50);
  } else {
    childrenQuery = childrenQuery
      .eq("parent_id", parent.id)
      .order("name", { ascending: true })
      .limit(300);

    if (query)
      childrenQuery = childrenQuery.ilike("name", `%${escapeLike(query)}%`);
  }

  const rows = await many(ev, "residencia/hijas", childrenQuery);

  const grandchildren = await many(
    ev,
    "residencia/nietas",
    db
      .from("communities")
      .select("parent_id")
      .in(
        "parent_id",
        rows.map((r) => r.id),
      ),
  );

  const withChildren = new Set(grandchildren.map((g) => g.parent_id));

  return {
    mode: "elegir" as const,
    chosen: null,
    chain: [] as CommunityRef[],
    trail: trail as CommunityRef[],
    options: rows
      .map((r) => ({ ...r, has_children: withChildren.has(r.id) }))
      .sort((a, b) => {
        if (isGlobal && b.level !== a.level) {
          return b.level - a.level;
        }
        return compareNames(a.name, b.name, resolveLocale(ev.locale()));
      }) as PickerOption[],
    query,
    current: viewer.residenceChain.at(-1) ?? null,
    nextChangeAt,
    canCorrectNow: !!canCorrectNow,
  };
}, RESIDENCE_LOADER_OPTIONS);

export const useChangeResidence = routeAction$(
  async (data, ev) => {
    const viewer = await requireUser(ev);
    const db = supabase(ev);

    const community = await single(
      ev,
      "residencia/destino",
      db
        .from("communities")
        .select("id, slug")
        .eq("slug", data.community_slug)
        .maybeSingle(),
    );

    if (!community)
      return ev.fail(400, { message: "Esa comunidad no existe." });

    // El trigger `enforce_residence_cooldown` es el que manda: si no pasaron
    // los 30 días, devuelve el mensaje con la fecha exacta.
    const { error } = await db
      .from("profiles")
      .update({ home_community_id: community.id })
      .eq("id", viewer.userId);

    if (error) {
      // `guard_profile_system_fields` (0056) exige poder participar para
      // cambiar la residencia: "Probá de nuevo" invitaba a un reintento inútil.
      const blocked = participationBlockMessage(error);
      if (blocked) return ev.fail(403, { message: blocked });
      const retryDate = /30 días[^\d]*(\d{2}\/\d{2}\/\d{4})/i.exec(
        error.message,
      )?.[1];
      return ev.fail(400, {
        message: retryDate
          ? `${RESIDENCE_LIMIT_PREFIX}${retryDate}`
          : "No pudimos cambiar tu residencia. Probá de nuevo.",
      });
    }

    throw ev.redirect(302, routes.community(community.slug));
  },
  zod$({ community_slug: z.string().min(1) }),
);

export default component$(() => {
  const data = useResidence();
  const change = useChangeResidence();
  const locale = useLocale();
  const timeZone = useTimeZone();

  return (
    <div class="container-reading py-8 sm:py-12">
      <header class="mb-6">
        <Link
          href="/perfil"
          class="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
        >
          ← {translate(locale, "Volver a mi perfil")}
        </Link>
        <p class="mt-2 text-sm font-semibold text-brand">
          {translate(locale, "Tu pertenencia territorial")}
        </p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">
          {translate(locale, "Residencia principal")}
        </h1>
        <p class="mt-2 text-ink-muted">
          {data.value.current ? (
            <>
              {translate(locale, "Tu residencia principal declarada es")}{" "}
              <strong class="text-ink-strong">
                {data.value.current.emoji} {data.value.current.name}
              </strong>
              .{" "}
              {translate(
                locale,
                "Al cambiarla, dejás esa cadena territorial y pasás a la nueva.",
              )}
            </>
          ) : (
            translate(
              locale,
              "Elegí la comunidad más específica donde vivís habitualmente.",
            )
          )}
        </p>
        <p class="mt-2 text-sm leading-relaxed text-ink-muted">
          {translate(
            locale,
            "Declarás una sola ubicación. Si elegís una ciudad de Buenos Aires, también pasás a formar parte de Buenos Aires, Argentina y los niveles superiores.",
          )}
        </p>
      </header>

      {data.value.nextChangeAt && data.value.canCorrectNow && (
        <Alert tone="brand" class="mb-5">
          {translate(
            locale,
            "Podés corregir una elección reciente durante 24 horas, siempre que todavía no hayas votado, comentado o publicado desde esa residencia. La fecha original del cambio no se reinicia.",
          )}
        </Alert>
      )}

      {data.value.nextChangeAt && !data.value.canCorrectNow && (
        <Alert tone="warn" class="mb-5">
          {translate(
            locale,
            "Cambiaste de residencia hace poco. Vas a poder hacerlo de nuevo el",
          )}{" "}
          <strong>
            {formatInstant(data.value.nextChangeAt, locale, timeZone)}
          </strong>
          .{" "}
          {translate(
            locale,
            "Podés mirar las opciones, pero no confirmar todavía.",
          )}
        </Alert>
      )}

      <Card class="p-6 sm:p-8">
        {data.value.mode === "confirmar" && data.value.chosen ? (
          <>
            <div class="mb-5 text-center">
              <div class="text-5xl" aria-hidden="true">
                {data.value.chosen.emoji ?? "📍"}
              </div>
              <h2 class="mt-2 text-xl font-semibold">
                {data.value.chosen.name}
              </h2>
              <p class="text-sm text-ink-muted">
                {translate(locale, LEVEL_NAMES[data.value.chosen.level])}
              </p>
            </div>

            <div class="rounded-2xl bg-muted p-4">
              <p class="mb-3 text-sm font-medium text-ink-strong">
                {translate(locale, "Vas a formar parte de:")}
              </p>
              <ul class="space-y-1.5">
                {data.value.chain.map((c) => (
                  <li key={c.id} class="flex items-center gap-2 text-sm">
                    <span aria-hidden="true">{c.emoji ?? "📍"}</span>
                    <span class="flex-1 truncate text-ink-strong">
                      {c.name}
                    </span>
                    <span class="text-xs text-ink-muted">
                      {translate(locale, LEVEL_NAMES[c.level])}
                    </span>
                  </li>
                ))}
              </ul>
              <p class="mt-3 text-xs text-ink-muted">
                {translate(
                  locale,
                  "Después de confirmar vas a tener que esperar {{count}} días para volver a cambiarla.",
                  {
                    count: formatNumber(RESIDENCE_COOLDOWN_DAYS, locale),
                  },
                )}
              </p>
            </div>

            <Form action={change} class="mt-5 space-y-3">
              {change.value?.message && (
                <Alert>
                  {change.value.message.startsWith(RESIDENCE_LIMIT_PREFIX)
                    ? translate(
                        locale,
                        "Sólo podés cambiar tu residencia una vez cada 30 días. Vas a poder de nuevo el {{date}}",
                        {
                          date: change.value.message.slice(
                            RESIDENCE_LIMIT_PREFIX.length,
                          ),
                        },
                      )
                    : translate(locale, change.value.message)}
                </Alert>
              )}
              <input
                type="hidden"
                name="community_slug"
                value={data.value.chosen.slug}
              />
              <SubmitButton
                variant="success"
                size="lg"
                class="w-full"
                pending={change.isRunning}
                disabled={
                  !!data.value.nextChangeAt && !data.value.canCorrectNow
                }
              >
                {translate(locale, "Confirmar cambio")}
              </SubmitButton>
            </Form>

            <p class="mt-6 border-t border-subtle pt-4 text-center text-sm">
              <Link
                href={BASE}
                class="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
              >
                ← {translate(locale, "Elegir otra")}
              </Link>
            </p>
          </>
        ) : (
          <LocationPicker
            trail={data.value.trail}
            options={data.value.options}
            query={data.value.query}
            navBase={`${BASE}?parent=`}
            searchAction={BASE}
            confirmBase={`${BASE}?c=`}
            purpose="residence"
            requestHref="/comunidades/solicitar"
          />
        )}
      </Card>

      <p class="mt-5 text-center text-sm">
        <Link
          href="/perfil"
          class="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
        >
          {translate(locale, "Volver a mi perfil")}
        </Link>
      </p>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Cambiar residencia")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
