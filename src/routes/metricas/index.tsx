import { component$ } from "@qwik.dev/core";
import { routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { Alert, Card, ProgressBar } from "~/components/ui";
import { APP_NAME, LOAD_FAILED } from "~/lib/constants";
import { formatDate, formatNumber } from "~/lib/format";
import { requireModerator, supabase } from "~/lib/session";
import { resolveLocale, useLocale, translate } from "~/lib/i18n";
import { exactCount } from "~/lib/claim-stats";
import { logFailure } from "~/lib/log";
import { useLocaleLoader } from "../layout";

/**
 * Cuántas filas pide cada tanda. Coincide con el `max_rows = 1000` de
 * PostgREST (`supabase/config.toml`): pedir más no trae más.
 */
const EVENTS_BATCH = 1000;

/**
 * Techo de tandas. 30.000 eventos en 30 días es muchísimo para esta página; el
 * límite existe para que un pico no cuelgue el edge, y cuando se toca se avisa
 * en pantalla en vez de mostrar un número corto como si fuera el bueno.
 */
const MAX_EVENT_BATCHES = 30;

/** Los eventos que dibuja la tabla de actividad diaria. */
const DAILY_EVENTS = ["signup", "first_participation", "return_week"] as const;

type FunnelEvent =
  "signup" | "residence_selected" | "first_participation" | "return_week";

export const useActivationMetrics = routeLoader$(async (ev) => {
  await requireModerator(ev);
  const db = supabase(ev);
  const since = new Date(Date.now() - 30 * 86400_000)
    .toISOString()
    .slice(0, 10);

  /**
   * Los eventos se traen por tandas.
   *
   * Antes era un `select` suelto sin `limit`, lo que parecía "todos" pero no lo
   * era: PostgREST corta en `max_rows` y devuelve las primeras 1000 sin ningún
   * aviso. Con la app en marcha, esta página empezaba a mostrar activaciones y
   * porcentajes calculados sobre un recorte arbitrario, presentados como el
   * total. Un número de métricas equivocado y silencioso es peor que no
   * tenerlo: se toman decisiones con él.
   */
  const fetchEvents = async () => {
    const rows: { event: string; event_date: string }[] = [];
    for (let batch = 0; batch < MAX_EVENT_BATCHES; batch++) {
      const from = batch * EVENTS_BATCH;
      const { data, error } = await db
        .from("activation_events")
        .select("event, event_date")
        .gte("event_date", since)
        // Sólo los eventos de la tabla diaria. Las visitas son una fila por
        // persona y por día y eran casi todo el volumen: con ellas adentro,
        // el techo de tandas se tocaba mucho antes, por filas que nadie usaba.
        .in("event", [...DAILY_EVENTS])
        // Los días más nuevos primero: si se toca el techo, lo que queda corto
        // es la cola vieja y no los 14 días que muestra la tabla. `id` es la
        // identidad de la tabla y desempata: sin un orden total, dos tandas
        // pueden repetir y saltear filas.
        .order("event_date", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + EVENTS_BATCH - 1);

      if (error) {
        logFailure({ scope: "metricas/eventos", batch }, error);
        throw ev.error(500, translate(resolveLocale(ev.locale()), LOAD_FAILED));
      }

      const page = data ?? [];
      rows.push(...page);
      if (page.length < EVENTS_BATCH) return { rows, partial: false };
    }
    return { rows, partial: true };
  };

  /**
   * El embudo cuenta en la base. `signup`, `residence_selected`,
   * `first_participation` y `return_week` tienen un índice único por
   * `(user_id, event)` (`activation_once_per_user_idx`, migración 0018): cada
   * fila es una persona distinta, así que un conteo exacto de filas es el
   * número de usuarios únicos, sin traer ninguna y sin techo.
   */
  const funnelCount = (event: FunnelEvent) =>
    exactCount(
      ev,
      `metricas/embudo/${event}`,
      db
        .from("activation_events")
        .select("id", { count: "exact", head: true })
        .eq("event", event)
        .gte("event_date", since),
    );

  const [
    { rows: events, partial },
    totalProfiles,
    signup,
    residence,
    first,
    returning,
  ] = await Promise.all([
    fetchEvents(),
    exactCount(
      ev,
      "metricas/perfiles",
      db.from("profiles").select("id", { count: "exact", head: true }),
    ),
    funnelCount("signup"),
    funnelCount("residence_selected"),
    funnelCount("first_participation"),
    funnelCount("return_week"),
  ]);
  const daily = new Map<
    string,
    { signup: number; first: number; return: number }
  >();
  for (const event of events) {
    const row = daily.get(event.event_date) ?? {
      signup: 0,
      first: 0,
      return: 0,
    };
    if (event.event === "signup") row.signup += 1;
    if (event.event === "first_participation") row.first += 1;
    if (event.event === "return_week") row.return += 1;
    daily.set(event.event_date, row);
  }
  return {
    totalProfiles,
    signup,
    residence,
    first,
    returning,
    daily: [...daily.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 14),
    partial,
  };
});

export default component$(() => {
  const data = useActivationMetrics();
  const locale = useLocale();
  const max = Math.max(data.value.signup, 1);
  const rate = (value: number, base: number) =>
    base > 0 ? Math.round((value / base) * 100) : 0;
  return (
    <div class="container-content py-8">
      <header>
        <p class="text-sm font-semibold text-brand">
          {translate(locale, "Últimos 30 días")}
        </p>
        <h1 class="mt-1 text-3xl font-semibold tracking-tight">
          {translate(locale, "Métricas de activación")}
        </h1>
        <p class="mt-2 text-ink-muted">
          {translate(
            locale,
            "Sólo eventos esenciales del producto; sin perfiles publicitarios ni seguimiento externo.",
          )}
        </p>
      </header>

      <div class="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card class="p-5">
          <p class="text-sm text-ink-muted">
            {translate(locale, "Cuentas nuevas")}
          </p>
          <p class="mt-1 text-3xl font-semibold tabular-nums">
            {formatNumber(data.value.signup, locale)}
          </p>
        </Card>
        <Card class="p-5">
          <p class="text-sm text-ink-muted">
            {translate(locale, "Eligieron residencia")}
          </p>
          <p class="mt-1 text-3xl font-semibold tabular-nums">
            {formatNumber(data.value.residence, locale)}
          </p>
          <p class="text-xs text-brand">
            {translate(locale, "{{rate}}% de registros", {
              rate: rate(data.value.residence, data.value.signup),
            })}
          </p>
        </Card>
        <Card class="p-5">
          <p class="text-sm text-ink-muted">
            {translate(locale, "Primera participación")}
          </p>
          <p class="mt-1 text-3xl font-semibold tabular-nums">
            {formatNumber(data.value.first, locale)}
          </p>
          <p class="text-xs text-brand">
            {translate(locale, "{{rate}}% con residencia", {
              rate: rate(data.value.first, data.value.residence),
            })}
          </p>
        </Card>
        <Card class="p-5">
          <p class="text-sm text-ink-muted">
            {translate(locale, "Regresaron en 7 días")}
          </p>
          <p class="mt-1 text-3xl font-semibold tabular-nums">
            {formatNumber(data.value.returning, locale)}
          </p>
          <p class="text-xs text-brand">
            {translate(locale, "{{rate}}% de registros", {
              rate: rate(data.value.returning, data.value.signup),
            })}
          </p>
        </Card>
      </div>
      <Card class="mt-6 p-6">
        <h2 class="text-lg font-semibold">
          {translate(locale, "Embudo de activación")}
        </h2>
        {/* Eran cuatro barras sin una sola palabra alrededor: el nombre de
            cada paso y su número vivían dentro del `aria-label`, o sea que el
            embudo sólo se podía leer con lector de pantalla. Quien lo miraba
            veía cuatro rectángulos violetas de distinto largo. */}
        <ol class="mt-5 space-y-4">
          {(
            [
              ["Registro", data.value.signup],
              ["Residencia elegida", data.value.residence],
              ["Primera participación", data.value.first],
              ["Regreso durante la semana", data.value.returning],
            ] as const
          ).map(([label, value]) => (
            <li key={label}>
              <div class="mb-1.5 flex items-baseline justify-between gap-3">
                <span class="text-sm font-medium text-ink-strong">
                  {translate(locale, label)}
                </span>
                <span class="text-sm tabular-nums text-ink-muted">
                  <strong class="font-semibold text-ink-strong">
                    {formatNumber(value, locale)}
                  </strong>{" "}
                  <span class="text-xs text-ink-faint">
                    {translate(locale, "({{rate}}% del registro)", {
                      rate: rate(value, data.value.signup),
                    })}
                  </span>
                </span>
              </div>
              <ProgressBar
                value={value}
                max={max}
                label={translate(locale, "{{step}} · {{count}}", {
                  step: translate(locale, label),
                  count: formatNumber(value, locale),
                })}
              />
            </li>
          ))}
        </ol>
      </Card>
      {/* El embudo de arriba es un conteo exacto en la base; lo único que
          puede quedar corto es la tabla diaria, que sí lee filas por tandas.
          Si se tocó el techo, se dice antes de mostrarla. */}
      {data.value.partial && (
        <Alert tone="warn" class="mt-6">
          {translate(
            locale,
            "Hay más eventos de los que esta página puede leer de una vez: los números de abajo son un piso, no el total.",
          )}
        </Alert>
      )}
      <Card class="mt-6 overflow-hidden">
        <div class="border-b border-subtle p-4">
          <h2 class="font-semibold">{translate(locale, "Actividad diaria")}</h2>
        </div>
        {/* Igual que en `QuotaGrid`: sin `tabIndex` el scroll horizontal no
            existe para quien navega con teclado. */}
        <div
          role="region"
          aria-label={translate(
            locale,
            "Tabla de actividad diaria, desplazable",
          )}
          tabIndex={0}
          class="overflow-x-auto"
        >
          <table class="w-full text-sm">
            {/* Igual que `QuotaGrid`: sin caption ni scope, un lector de
                pantalla lee 4 números sueltos por fila sin saber a qué
                columna pertenece cada uno. */}
            <caption class="sr-only">
              {translate(
                locale,
                "Registros, primeras acciones y regresos por día",
              )}
            </caption>
            <thead class="bg-muted text-left text-ink-muted">
              <tr>
                <th scope="col" class="px-4 py-2">
                  {translate(locale, "Fecha")}
                </th>
                <th scope="col" class="px-4 py-2">
                  {translate(locale, "Registros")}
                </th>
                <th scope="col" class="px-4 py-2">
                  {translate(locale, "Primera acción")}
                </th>
                <th scope="col" class="px-4 py-2">
                  {translate(locale, "Regresos")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.value.daily.map(([date, row]) => (
                <tr key={date} class="border-t border-subtle">
                  {/* Salía la fecha cruda de Postgres (`2026-08-12`), la única
                      del producto que no pasaba por `formatDate`. */}
                  <th scope="row" class="px-4 py-2 font-normal">
                    <time dateTime={date}>{formatDate(date, locale)}</time>
                  </th>
                  <td class="px-4 py-2 tabular-nums">{row.signup}</td>
                  <td class="px-4 py-2 tabular-nums">{row.first}</td>
                  <td class="px-4 py-2 tabular-nums">{row.return}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p class="mt-4 text-xs text-ink-faint">
        {translate(
          locale,
          "{{count}} perfiles totales. Los conteos del embudo usan usuarios únicos.",
          {
            count: formatNumber(data.value.totalProfiles, locale),
          },
        )}
      </p>
    </div>
  );
});
export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Métricas")} · ${APP_NAME}`,
  meta: [{ name: "robots", content: "noindex" }],
});
