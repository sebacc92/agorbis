import { component$, $, useComputed$, useSignal } from "@qwik.dev/core";
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
import { AuthShell } from "~/components/layout/AuthShell";
import { useFieldErrorFocus } from "~/components/forms/useFieldErrorFocus";
import { postedText } from "~/components/forms/posted-fields";
import { Alert, Card, Field, Input, SubmitButton } from "~/components/ui";
import type { CommunityRef } from "~/lib/community";
import { compareNames, escapeLike, routes } from "~/lib/community";
import {
  APP_NAME,
  LEVEL_NAMES,
  RESIDENCE_COOLDOWN_DAYS,
} from "~/lib/constants";
import { participationBlockMessage } from "~/lib/db-error";
import { formatNumber, pluralize } from "~/lib/format";
import { coarseLookupCoordinate } from "~/lib/geolocation-privacy";
import { withAuthNext } from "~/lib/auth-navigation";
import { safeInternalPath } from "~/lib/http";
import { resolveLocale, useLocale, translate } from "~/lib/i18n";
import { many, single } from "~/lib/query";
import { suggestUsername } from "~/lib/username-suggestion";
import { requireUser, supabase } from "~/lib/session";
import { useLocaleLoader } from "../layout";

const BASE = "/onboarding";
const CONFIRM_BASE = `${BASE}?paso=confirmar&c=`;
const ONBOARDING_LOADER_OPTIONS = {
  search: ["paso", "parent", "q", "c", "gps", "next"],
};
const RESIDENCE_LIMIT_PREFIX =
  "Sólo podés cambiar tu residencia una vez cada 30 días. Vas a poder de nuevo el ";

type Step = "nombre" | "lugar" | "confirmar";

interface OnboardingData {
  step: Step;
  username: string;
  displayName: string;
  next: string;
  /** Paso "lugar". */
  trail: CommunityRef[];
  options: PickerOption[];
  query: string;
  /** Paso "confirmar". */
  chain: CommunityRef[];
  chosen: CommunityRef | null;
  isGps?: boolean;
}

export const useOnboarding = routeLoader$<OnboardingData>(async (ev) => {
  const viewer = await requireUser(ev);
  const db = supabase(ev);

  const requested = ev.url.searchParams.get("paso");
  const step: Step =
    requested === "lugar" || requested === "confirmar" ? requested : "nombre";

  const profile = viewer.profile;
  // El trigger de alta genera un `user_xxxx`: no lo mostramos como si el
  // usuario lo hubiera elegido.
  const isPlaceholder = /^user_[0-9a-f]{12}$/.test(profile?.username ?? "");

  const base: Pick<OnboardingData, "username" | "displayName" | "next"> = {
    username: isPlaceholder ? "" : (profile?.username ?? ""),
    displayName: profile?.display_name ?? "",
    next: safeInternalPath(ev.url.searchParams.get("next"), ""),
  };

  // Sin nombre elegido no se puede saltar al lugar escribiendo `?paso=` en la
  // URL: la cuenta quedaría con el `user_xxxx` del trigger (D108).
  if (step !== "nombre" && isPlaceholder) {
    throw ev.redirect(302, withAuthNext(BASE, base.next));
  }

  // ---- Paso 3: confirmación ------------------------------------------------
  if (step === "confirmar") {
    const slug = ev.url.searchParams.get("c") ?? "";
    const isGps = ev.url.searchParams.get("gps") === "1";
    const chosen = await single(
      ev,
      "onboarding/elegida",
      db
        .from("communities")
        .select("id, slug, name, emoji, level, path")
        .eq("slug", slug)
        .maybeSingle(),
    );

    if (!chosen) {
      throw ev.redirect(302, withAuthNext(`${BASE}?paso=lugar`, base.next));
    }

    const segments = chosen.path.split(".");
    const chain = await many(
      ev,
      "onboarding/cadena",
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
      ...base,
      step,
      trail: [],
      options: [],
      query: "",
      chain: chain ?? [],
      chosen,
      isGps,
    };
  }

  // ---- Paso 2: selector en cascada ----------------------------------------
  if (step === "lugar") {
    const parentSlug = ev.url.searchParams.get("parent") ?? "earth";
    const query = (ev.url.searchParams.get("q") ?? "").trim();
    const isGlobal = query.length >= 2;

    const parent = await single(
      ev,
      "onboarding/padre",
      db
        .from("communities")
        .select("id, slug, name, emoji, level, path")
        .eq("slug", parentSlug)
        .maybeSingle(),
    );

    if (!parent)
      throw ev.redirect(302, withAuthNext(`${BASE}?paso=lugar`, base.next));

    const segments = parent.path.split(".");
    const trail = await many(
      ev,
      "onboarding/ruta",
      db
        .from("communities")
        .select("id, slug, name, emoji, level, path")
        .in(
          "path",
          segments.map((_, i) => segments.slice(0, i + 1).join(".")),
        )
        .order("level", { ascending: true }),
    );

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

    const rows = await many(ev, "onboarding/hijas", childrenQuery);

    // Una sola consulta para saber cuáles de los hijos tienen nietos, en vez
    // de N consultas (una por opción).
    const grandchildren = await many(
      ev,
      "onboarding/nietas",
      db
        .from("communities")
        .select("parent_id")
        .in("parent_id", rows.map((r) => r.id).slice(0, 300)),
    );

    const withChildren = new Set(grandchildren.map((g) => g.parent_id));

    const options: PickerOption[] = rows
      .map((r) => ({ ...r, has_children: withChildren.has(r.id) }))
      .sort((a, b) => {
        if (isGlobal && b.level !== a.level) {
          return b.level - a.level;
        }
        return compareNames(a.name, b.name, resolveLocale(ev.locale()));
      });

    return {
      ...base,
      step,
      trail: trail ?? [],
      options,
      query,
      chain: [],
      chosen: null,
    };
  }

  // ---- Paso 1: nombre ------------------------------------------------------
  return {
    ...base,
    step,
    trail: [],
    options: [],
    query: "",
    chain: [],
    chosen: null,
  };
}, ONBOARDING_LOADER_OPTIONS);

export const useSaveName = routeAction$(
  async (data, ev) => {
    const viewer = await requireUser(ev);
    const db = supabase(ev);

    const { error } = await db
      .from("profiles")
      .update({
        username: data.username,
        display_name: data.display_name?.trim() || null,
      })
      .eq("id", viewer.userId);

    if (error) {
      // `guard_profile_system_fields` (0056) exige poder participar para
      // cambiar el nombre: sin esto, quien no aceptó los documentos vigentes
      // veía "Probá de nuevo" y reintentaba algo que siempre iba a fallar.
      const blocked = participationBlockMessage(error);
      if (blocked) return ev.fail(403, { message: blocked });
      if (error.code === "23505") {
        const message = "Ese nombre de usuario ya está tomado. Probá con otro.";
        return ev.fail(400, { message, fieldErrors: { username: message } });
      }
      return ev.fail(400, {
        message: "No pudimos guardar tu nombre. Probá de nuevo.",
      });
    }

    throw ev.redirect(302, withAuthNext(`${BASE}?paso=lugar`, data.next));
  },
  zod$({
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9_]{3,20}$/,
        "Entre 3 y 20 caracteres: sólo minúsculas, números y guión bajo.",
      ),
    display_name: z.string().trim().max(60, "Máximo 60 caracteres.").optional(),
    next: z.string().max(2048).optional(),
  }),
);

export const useConfirmResidence = routeAction$(
  async (data, ev) => {
    const viewer = await requireUser(ev);
    const db = supabase(ev);

    const community = await single(
      ev,
      "onboarding/destino",
      db
        .from("communities")
        .select("id, slug")
        .eq("slug", data.community_slug)
        .maybeSingle(),
    );

    if (!community)
      return ev.fail(400, { message: "Esa comunidad no existe." });

    // El trigger `sync_member_counts` propaga el +1 a toda la cadena ancestral,
    // y `enforce_residence_cooldown` bloquea el cambio si no pasaron 30 días.
    const { error } = await db
      .from("profiles")
      .update({ home_community_id: community.id })
      .eq("id", viewer.userId);

    if (error) {
      // Mismo gate que el nombre: `home_community_id` también lo exige.
      const blocked = participationBlockMessage(error);
      if (blocked) return ev.fail(403, { message: blocked });
      const retryDate = /30 días[^\d]*(\d{2}\/\d{2}\/\d{4})/i.exec(
        error.message,
      )?.[1];
      return ev.fail(400, {
        message: retryDate
          ? `${RESIDENCE_LIMIT_PREFIX}${retryDate}`
          : "No pudimos guardar tu residencia. Probá de nuevo.",
      });
    }

    throw ev.redirect(
      302,
      safeInternalPath(data.next, routes.community(community.slug)),
    );
  },
  zod$({
    community_slug: z.string().min(1),
    next: z.string().max(2048).optional(),
  }),
);

export const useDetectLocation = routeAction$(
  async (data, ev) => {
    const db = supabase(ev);
    // El cliente ya manda la posición redondeada; se repite acá por si llega
    // un pedido armado a mano con más precisión.
    const lat = coarseLookupCoordinate(data.lat);
    const lng = coarseLookupCoordinate(data.lng);

    let candidates = await many(
      ev,
      "onboarding/detect_tight",
      db
        .from("communities")
        .select("id, slug, name, emoji, level, lat, lng")
        .gte("level", 3)
        .gte("lat", lat - 2.0)
        .lte("lat", lat + 2.0)
        .gte("lng", lng - 2.0)
        .lte("lng", lng + 2.0)
        .limit(60),
    );

    if (!candidates || candidates.length === 0) {
      candidates = await many(
        ev,
        "onboarding/detect_broad",
        db
          .from("communities")
          .select("id, slug, name, emoji, level, lat, lng")
          .gte("level", 2)
          .gte("lat", lat - 7.0)
          .lte("lat", lat + 7.0)
          .gte("lng", lng - 7.0)
          .lte("lng", lng + 7.0)
          .limit(60),
      );
    }

    if (!candidates || candidates.length === 0) {
      return ev.fail(404, {
        message:
          "No encontramos comunidades cercanas a tu posición. Podés buscar tu ciudad por nombre abajo.",
      });
    }

    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const scored = candidates
      .filter((c) => c.lat !== null && c.lng !== null)
      .map((c) => {
        const dLat = toRad(c.lat! - lat);
        const dLon = toRad(c.lng! - lng);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat)) *
            Math.cos(toRad(c.lat!)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
        const distKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const effectiveDist = distKm - (c.level - 3) * 15;
        return { slug: c.slug, distKm, effectiveDist };
      })
      .sort((a, b) => a.effectiveDist - b.effectiveDist);

    const closest = scored[0];
    if (!closest) {
      return ev.fail(404, {
        message: "No encontramos comunidades cercanas a tu ubicación.",
      });
    }

    throw ev.redirect(
      302,
      withAuthNext(`${CONFIRM_BASE}${closest.slug}&gps=1`, data.next),
    );
  },
  zod$({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    next: z.string().max(2048).optional(),
  }),
);

export default component$(() => {
  const data = useOnboarding();
  const saveName = useSaveName();
  const confirm = useConfirmResidence();
  const detectLocation = useDetectLocation();
  const isLocating = useSignal(false);
  const geoError = useSignal<string | null>(null);
  const locale = useLocale();
  const usernameError = useComputed$(
    () => saveName.value?.fieldErrors?.username,
  );
  const usernameInvalid = useComputed$(() => !!usernameError.value);
  const nameError = useComputed$(() =>
    usernameError.value ? undefined : saveName.value?.message,
  );
  const usernameDescription = useComputed$(() =>
    usernameError.value ? "username-error username-hint" : "username-hint",
  );
  const usernameInput = useFieldErrorFocus(usernameError, saveName);
  const usernameValue = useSignal(
    saveName.formData?.get("username")?.toString() ?? data.value.username,
  );
  // Mientras la persona no escriba su propio usuario, se completa desde el
  // nombre para mostrar.
  const usernameEdited = useSignal(usernameValue.value !== "");
  // Para la vista previa de cómo se va a ver (D121).
  const displayNameValue = useSignal(
    saveName.formData?.get("display_name")?.toString() ??
      data.value.displayName,
  );
  const nameNext = useComputed$(() =>
    safeInternalPath(
      postedText(saveName.formData, "next", data.value.next),
      "",
    ),
  );

  const handleDetectGps = $(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      geoError.value = translate(
        locale,
        "Tu navegador no soporta geolocalización. Podés buscar por nombre abajo.",
      );
      return;
    }
    isLocating.value = true;
    geoError.value = null;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        isLocating.value = false;
        // Se redondea antes de que salga del navegador: ver GPS_LOOKUP_DECIMALS
        // en ~/lib/geolocation-privacy.
        detectLocation.submit({
          lat: coarseLookupCoordinate(pos.coords.latitude),
          lng: coarseLookupCoordinate(pos.coords.longitude),
          next: data.value.next,
        });
      },
      (err) => {
        isLocating.value = false;
        if (err.code === 1) {
          geoError.value = translate(
            locale,
            "Permiso de ubicación denegado. Podés buscar tu ciudad por nombre abajo.",
          );
        } else {
          geoError.value = translate(
            locale,
            "No pudimos detectar tu ubicación. Podés buscar tu ciudad por nombre abajo.",
          );
        }
      },
      // Sin alta precisión: no hace falta el GPS fino para ubicar una
      // comunidad, y la posición por red es más rápida y gasta menos batería.
      { timeout: 10000, enableHighAccuracy: false, maximumAge: 600000 },
    );
  });

  const { step } = data.value;

  return (
    <AuthShell
      progress={step === "nombre" ? 3 : 4}
      wide={step !== "nombre"}
      title={
        step === "nombre"
          ? "¿Cómo te llamamos?"
          : step === "lugar"
            ? "¿Dónde vivís?"
            : "Confirmá tu comunidad"
      }
      subtitle={
        step === "nombre"
          ? "Tu nombre de usuario es cómo te van a ver en debates y encuestas."
          : step === "lugar"
            ? "Elegí la comunidad más específica donde vivís. Podés frenar en cualquier nivel."
            : "Al confirmar pasás a ser miembro de toda esta cadena."
      }
    >
      {step === "nombre" && (
        <Card class="p-6 sm:p-8">
          {/* Documento, no SPA: ver /consentimiento (D121). */}
          <Form action={saveName} reloadDocument class="space-y-5">
            <input type="hidden" name="next" value={nameNext.value} />
            {nameError.value && (
              <Alert>{translate(locale, nameError.value)}</Alert>
            )}

            <Field
              label="Nombre para mostrar"
              name="display_name"
              hint="Opcional. Es el que aparece arriba de tus comentarios."
              error={saveName.value?.fieldErrors?.display_name}
            >
              <Input
                name="display_name"
                autocomplete="name"
                enterKeyHint="next"
                placeholder="Sofía Rearte"
                maxLength={60}
                value={displayNameValue.value}
                autoFocus={!usernameInvalid.value}
                onInput$={(_, element) => {
                  displayNameValue.value = element.value;
                  if (!usernameEdited.value) {
                    usernameValue.value = suggestUsername(element.value);
                  }
                }}
              />
            </Field>

            <Field
              label="Nombre de usuario"
              name="username"
              required
              hint="Se completa con tu nombre y podés cambiarlo. Minúsculas, números y guión bajo, entre 3 y 20 caracteres."
              error={usernameError.value}
            >
              <Input
                ref={usernameInput}
                name="username"
                required
                autocomplete="username"
                autocapitalize="none"
                spellcheck={false}
                enterKeyHint="done"
                placeholder="sofia_mdq"
                pattern="[a-z0-9_]{3,20}"
                invalid={usernameInvalid.value}
                aria-invalid={usernameInvalid.value ? "true" : undefined}
                aria-describedby={usernameDescription.value}
                autoFocus={usernameInvalid.value}
                value={usernameValue.value}
                onInput$={(_, element) => {
                  usernameValue.value = element.value;
                  usernameEdited.value = element.value !== "";
                }}
              />
            </Field>

            {/* Lo que la gente teme es que se vea el correo: se muestra lo
                que sí se ve y se dice lo que no (D121). */}
            <div
              class="rounded-2xl bg-muted p-4 text-sm"
              data-name-preview
              aria-live="polite"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                {translate(locale, "Así te van a ver")}
              </p>
              <p class="mt-1 font-medium text-ink-strong" dir="auto">
                {displayNameValue.value.trim() || usernameValue.value || "…"}{" "}
                <span class="font-normal text-ink-muted">
                  @{usernameValue.value || translate(locale, "usuario")}
                </span>
              </p>
              <p class="mt-1 text-xs text-ink-muted">
                {translate(locale, "Tu correo no se muestra en ningún lado.")}
              </p>
            </div>

            <SubmitButton size="lg" class="w-full" pending={saveName.isRunning}>
              {translate(locale, "Continuar")}
            </SubmitButton>
          </Form>
        </Card>
      )}

      {step === "lugar" && (
        <Card class="p-6 sm:p-8">
          <LocationPicker
            trail={data.value.trail}
            options={data.value.options}
            query={data.value.query}
            navBase={`${withAuthNext(`${BASE}?paso=lugar`, data.value.next)}&parent=`}
            searchAction={BASE}
            searchHidden={[
              ["paso", "lugar"],
              ["next", data.value.next],
            ]}
            confirmBase={`${withAuthNext(`${BASE}?paso=confirmar`, data.value.next)}&c=`}
            purpose="residence"
            requestHref="/comunidades/solicitar"
          />
          {/* El buscador va primero: casi todo el mundo sabe cómo se llama su
              ciudad. El GPS queda como alternativa, debajo, sin gritar (D121). */}
          <div class="mt-6 rounded-2xl border border-subtle bg-muted/60 p-4">
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p class="text-sm font-semibold text-ink-strong">
                  📍 {translate(locale, "¿Preferís que la detectemos?")}
                </p>
                <p class="text-xs text-ink-muted">
                  {translate(
                    locale,
                    "Usamos el GPS de tu dispositivo para sugerir la comunidad más cercana. Después la confirmás.",
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick$={handleDetectGps}
                disabled={detectLocation.isRunning || isLocating.value}
                class="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-control bg-surface px-4 py-2 text-sm font-semibold text-brand shadow-sm transition hover:bg-brand-50 active:scale-95 disabled:opacity-50"
              >
                {isLocating.value || detectLocation.isRunning ? (
                  <>
                    <span
                      class="inline-block size-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                      aria-hidden="true"
                    />
                    <span>{translate(locale, "Detectando...")}</span>
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">📍</span>
                    <span>{translate(locale, "Usar mi ubicación actual")}</span>
                  </>
                )}
              </button>
            </div>
            {geoError.value && (
              <p class="mt-2 text-xs font-medium text-warn-600 dark:text-warn-400">
                {geoError.value}
              </p>
            )}
            {detectLocation.value?.message && (
              <p class="mt-2 text-xs font-medium text-warn-600 dark:text-warn-400">
                {detectLocation.value.message}
              </p>
            )}
          </div>

          <p class="mt-6 border-t border-subtle pt-4 text-center text-sm">
            <Link
              href={withAuthNext(`${BASE}?paso=nombre`, data.value.next)}
              class="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
            >
              ← {translate(locale, "Volver a mi nombre")}
            </Link>
          </p>
        </Card>
      )}

      {step === "confirmar" && data.value.chosen && (
        <Card class="p-6 sm:p-8">
          {/* En desktop, la cadena a la izquierda y la decisión a la derecha:
              se lee qué implica antes de llegar al botón (D110). */}
          <div class="grid gap-6 lg:grid-cols-2 lg:gap-10">
            <div>
              {data.value.isGps && (
                <div class="mb-5 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-950 dark:border-brand-800 dark:bg-brand-950/40 dark:text-brand-100">
                  <span class="text-2xl" aria-hidden="true">
                    📍
                  </span>
                  <div>
                    <p class="font-semibold">
                      {translate(locale, "Detectamos tu ubicación cercana")}
                    </p>
                    <p class="text-xs opacity-90">
                      {translate(
                        locale,
                        "Encontramos {{name}}. Confirmá si vivís acá para sumarte a tu cadena comunitaria.",
                        { name: data.value.chosen.name },
                      )}
                    </p>
                  </div>
                </div>
              )}

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
                  {translate(locale, "Vas a ser miembro de")}{" "}
                  {pluralize(
                    data.value.chain.length,
                    "comunidad",
                    "comunidades",
                    locale,
                  )}
                  :
                </p>
                <ul class="space-y-2">
                  {data.value.chain.map((c, i) => (
                    <li key={c.id} class="flex items-center gap-2.5 text-sm">
                      <span
                        aria-hidden="true"
                        class="grid size-8 shrink-0 place-items-center rounded-xl bg-surface text-base"
                        style={{ marginLeft: `${i * 10}px` }}
                      >
                        {c.emoji ?? "📍"}
                      </span>
                      <span class="min-w-0 flex-1 truncate font-medium text-ink-strong">
                        {c.name}
                      </span>
                      <span class="shrink-0 text-xs text-ink-muted">
                        {translate(locale, LEVEL_NAMES[c.level])}
                      </span>
                    </li>
                  ))}
                </ul>
                <p class="mt-3 text-sm leading-relaxed text-ink-muted">
                  {translate(
                    locale,
                    "Podés votar y comentar en todas ellas. En las demás comunidades vas a poder leer y seguirlas, pero no participar.",
                  )}
                </p>
              </div>
            </div>
            <div class="flex flex-col">
              {/* La restricción más cara de todo el registro estaba en 12 px
              grises, debajo del botón que la activa: se leía después de
              haberla aceptado, si es que se leía. Acá se ve antes de decidir
              y con el peso que tiene. */}
              <p class="mt-3 flex items-start gap-2 rounded-2xl border border-warn-400/40 lg:mt-0 bg-warn-400/10 px-4 py-3 text-sm text-ink-muted">
                <span aria-hidden="true">⏳</span>
                <span>
                  {translate(
                    locale,
                    "Después vas a poder cambiar tu residencia una vez cada {{count}} días.",
                    { count: formatNumber(RESIDENCE_COOLDOWN_DAYS, locale) },
                  )}
                </span>
              </p>

              <Form action={confirm} reloadDocument class="mt-5 space-y-3">
                <input type="hidden" name="next" value={data.value.next} />
                {confirm.value?.message && (
                  <Alert>
                    {confirm.value.message.startsWith(RESIDENCE_LIMIT_PREFIX)
                      ? translate(
                          locale,
                          "Sólo podés cambiar tu residencia una vez cada 30 días. Vas a poder de nuevo el {{date}}",
                          {
                            date: confirm.value.message.slice(
                              RESIDENCE_LIMIT_PREFIX.length,
                            ),
                          },
                        )
                      : translate(locale, confirm.value.message)}
                  </Alert>
                )}
                <input
                  type="hidden"
                  name="community_slug"
                  value={data.value.chosen.slug}
                />
                <SubmitButton
                  size="lg"
                  class="w-full"
                  pending={confirm.isRunning}
                >
                  {translate(locale, "Confirmar y entrar")}
                </SubmitButton>
              </Form>

              <p class="mt-6 border-t border-subtle pt-4 text-center text-sm">
                <Link
                  href={withAuthNext(
                    `${BASE}?paso=lugar&parent=${data.value.chain.at(-2)?.slug ?? "earth"}`,
                    data.value.next,
                  )}
                  class="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
                >
                  ← {translate(locale, "Elegir otra ubicación")}
                </Link>
              </p>
            </div>
          </div>
        </Card>
      )}
    </AuthShell>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Elegí tu comunidad")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
