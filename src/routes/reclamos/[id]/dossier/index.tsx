import { $, component$, useSignal } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { triggerHapticFeedback } from "~/components/ui";
import {
  APP_NAME,
  CLAIM_CATEGORIES,
  CLAIM_STATUS_LABEL,
} from "~/lib/constants";
import { formatDate, formatInstant } from "~/lib/format";
import { isUuid, siteOrigin } from "~/lib/http";
import { qrSvgFor } from "~/lib/qr";
import {
  DEFAULT_LOCALE,
  resolveLocale,
  translate,
  useLocale,
} from "~/lib/i18n";
import { useTimeZone } from "~/lib/timezone";
import { supabase } from "~/lib/session";
import { many, single } from "~/lib/query";
import { showToast } from "~/components/ui/Toast";
import { useLocaleLoader } from "~/routes/layout";

export const useClaimDossier = routeLoader$(async (ev) => {
  if (!isUuid(ev.params.id)) {
    throw ev.error(404, "Reclamo no encontrado");
  }
  const db = supabase(ev);
  const locale = resolveLocale(ev.locale());

  const claim = await single(
    ev,
    "reclamos/dossier",
    db
      .from("claims")
      .select(
        "id, title, description, category, status, image_url, location_text, support_count, created_at, response_due_at, first_response_at, escalated_at, community:communities!claims_community_id_fkey(id, slug, name, emoji, level, member_count)",
      )
      .eq("id", ev.params.id)
      .maybeSingle(),
  );

  if (!claim || !claim.community) {
    throw ev.error(404, translate(locale, "No encontramos ese reclamo."));
  }

  const events = await many(
    ev,
    "reclamos/dossier-eventos",
    db
      .from("claim_events")
      .select("id, event_type, title, body, created_at")
      .eq("claim_id", claim.id)
      .order("created_at", { ascending: true }),
  );

  const origin = siteOrigin(ev);
  const fullUrl = `${origin}/reclamos/${claim.id}`;
  // QR generado acá, en el servidor: sin pedirle nada a un tercero (la CSP
  // lo bloquearía y además le pasaría la URL y la IP de quien imprime).
  const qr = qrSvgFor(fullUrl);

  const categoryObj = CLAIM_CATEGORIES.find((c) => c.key === claim.category);

  return {
    claim,
    events: events ?? [],
    community: claim.community,
    categoryLabel: categoryObj?.label ?? claim.category,
    categoryEmoji: categoryObj?.emoji ?? "📣",
    fullUrl,
    qr,
    today: new Date().toISOString(),
  };
});

export default component$(() => {
  const data = useClaimDossier();
  const locale = useLocale();
  const timeZone = useTimeZone();
  const copied = useSignal(false);
  const {
    claim,
    events,
    community,
    categoryLabel,
    categoryEmoji,
    fullUrl,
    qr,
    today,
  } = data.value;

  const copyDossier$ = $(async () => {
    const lines = [
      `COMUNICADO DE PRENSA / REPORTE CIUDADANO`,
      `OBSERVATORIO VECINAL - ${community.name.toUpperCase()}`,
      `Fecha: ${formatDate(today, locale)}`,
      "",
      `TITULAR: ${claim.title}`,
      `Categoría: ${categoryEmoji} ${categoryLabel}`,
      `Ubicación: ${claim.location_text || "Comunidad " + community.name}`,
      `Apoyos registrados en ${APP_NAME}: ${claim.support_count}`,
      "",
      `RESUMEN DEL HECHO:`,
      claim.description,
      "",
      `HISTORIAL DEL CASO:`,
      ...events.map(
        (e) =>
          `• [${formatDate(e.created_at, locale)}] ${e.title}${e.body ? `: ${e.body}` : ""}`,
      ),
      "",
      `Consulta pública del reclamo:`,
      fullUrl,
    ];
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      triggerHapticFeedback("success");
      copied.value = true;
      setTimeout(() => {
        copied.value = false;
      }, 2500);
    } catch {
      // Sin permiso de portapapeles (o fuera de HTTPS) el botón no puede
      // quedarse callado: la persona creería que copió.
      triggerHapticFeedback("warning");
      showToast(translate(locale, "No se pudo copiar"), "danger");
    }
  });

  return (
    <div class="min-h-screen bg-neutral-100 p-4 font-sans text-neutral-900 print:bg-white print:p-0">
      {/* Controles de navegación y exportación */}
      <div class="mx-auto mb-6 flex max-w-4xl items-center justify-between rounded-2xl bg-white p-4 shadow-sm print:hidden">
        <Link
          href={`/reclamos/${claim.id}`}
          class="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 hover:text-neutral-900 hover:underline"
        >
          {"←"} {translate(locale, "Volver al reclamo")}
        </Link>
        <div class="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick$={copyDossier$}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-xs transition hover:border-neutral-400 active:scale-95"
            title={translate(locale, "Copiar nota de prensa al portapapeles")}
          >
            <span aria-hidden="true">{copied.value ? "✅" : "📋"}</span>
            <span>
              {copied.value
                ? translate(locale, "¡Copiado!")
                : translate(locale, "Copiar nota de prensa")}
            </span>
          </button>
          <button
            type="button"
            onClick$={() => window.print()}
            class="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-neutral-800"
          >
            <span aria-hidden="true">🖨️</span>
            <span>{translate(locale, "Imprimir / Guardar como PDF")}</span>
          </button>
        </div>
      </div>

      {/* Hoja A4 de Dossier de Prensa */}
      <article class="mx-auto max-w-4xl border border-neutral-300 bg-white p-8 shadow-md print:max-w-none print:border-none print:p-0 print:shadow-none sm:p-12">
        {/* Cabecera institucional */}
        <header class="border-b-2 border-neutral-900 pb-6">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p class="text-xs font-bold tracking-widest text-neutral-500 uppercase">
                {translate(locale, "Dossier de Prensa y Reporte Ciudadano")}
              </p>
              <h1 class="mt-1 text-2xl font-black tracking-tight text-neutral-900 uppercase sm:text-3xl">
                {APP_NAME} {"·"} {translate(locale, "Observatorio Comunitario")}
              </h1>
            </div>
            <div class="text-right text-xs text-neutral-600">
              <p>
                <strong>{translate(locale, "Fecha de emisión:")}</strong>{" "}
                {formatDate(today, locale)}
              </p>
              <p class="mt-0.5">
                <strong>{translate(locale, "Expediente cívico:")}</strong>{" "}
                {`AGB-${claim.id.slice(0, 8).toUpperCase()}`}
              </p>
            </div>
          </div>
        </header>

        {/* Ficha Resumen */}
        <section class="mt-6 rounded-2xl bg-neutral-50 p-6 border border-neutral-200">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <span class="inline-block rounded-full bg-neutral-200 px-3 py-1 text-xs font-bold text-neutral-800 uppercase">
                {categoryEmoji} {categoryLabel}
              </span>
              <h2 class="mt-2 text-xl font-bold text-neutral-900">
                {claim.title}
              </h2>
              <p class="mt-1 text-sm font-medium text-neutral-600">
                📍 {community.name}
                {claim.location_text ? ` · ${claim.location_text}` : ""}
              </p>
            </div>

            <div class="rounded-xl border-2 border-orange-500 bg-orange-50 px-5 py-3 text-center text-orange-950">
              <p class="text-2xl font-black tabular-nums">
                {claim.support_count}
              </p>
              <p class="text-[11px] font-bold tracking-wide uppercase">
                {translate(locale, "Apoyos en Agorbis")}
              </p>
            </div>
          </div>

          <div class="mt-4 border-t border-neutral-200 pt-3 text-xs text-neutral-600 grid gap-2 sm:grid-cols-3">
            <div>
              <span class="font-semibold">
                {translate(locale, "Fecha de reporte:")}
              </span>{" "}
              {formatDate(claim.created_at, locale)}
            </div>
            <div>
              <span class="font-semibold">{translate(locale, "Estado:")}</span>{" "}
              {translate(
                locale,
                CLAIM_STATUS_LABEL[claim.status]?.label ?? "Abierto",
              )}
            </div>
            <div>
              {/* El reloj es una convención de la plataforma (0026, D58), no
                  lo fija ninguna ley; nulo significa que este nivel no lo tiene. */}
              <span class="font-semibold">
                {translate(locale, "Plazo de respuesta en la plataforma:")}
              </span>{" "}
              {claim.response_due_at
                ? formatInstant(claim.response_due_at, locale, timeZone)
                : translate(locale, "Sin plazo en este nivel")}
            </div>
          </div>
        </section>

        {/* Detalle y Fundamentación */}
        <section class="mt-6">
          <h3 class="text-sm font-bold tracking-wide text-neutral-900 uppercase">
            {translate(locale, "Descripción de la problemática:")}
          </h3>
          <p class="mt-2 text-sm leading-relaxed text-neutral-700 whitespace-pre-line">
            {claim.description}
          </p>
        </section>

        {/* Foto de Evidencia si existe */}
        {claim.image_url && (
          <section class="mt-6">
            <h3 class="text-sm font-bold tracking-wide text-neutral-900 uppercase">
              {translate(locale, "Evidencia fotográfica documentada:")}
            </h3>
            <div class="mt-2 overflow-hidden rounded-xl border border-neutral-300">
              <img
                src={claim.image_url}
                alt={claim.title}
                width={800}
                height={500}
                class="max-h-80 w-full object-cover"
              />
            </div>
          </section>
        )}

        {/* Línea de Tiempo y Vencimientos */}
        <section class="mt-6">
          <h3 class="text-sm font-bold tracking-wide text-neutral-900 uppercase">
            {translate(locale, "Cronología y actuaciones registradas:")}
          </h3>
          <div class="mt-3 border-l-2 border-neutral-300 pl-4 space-y-3">
            <div class="text-xs">
              <p class="font-bold text-neutral-900">
                {formatDate(claim.created_at, locale)} {"·"}{" "}
                {translate(locale, "Publicación inicial del reclamo")}
              </p>
              <p class="text-neutral-600">
                {translate(
                  locale,
                  "Iniciado en la plataforma vecinal e impulsado por vecinos de {{name}}.",
                  { name: community.name },
                )}
              </p>
            </div>

            {events.map((evt) => (
              <div key={evt.id} class="text-xs">
                <p class="font-bold text-neutral-900">
                  {formatDate(evt.created_at, locale)} {"·"} {evt.title}
                </p>
                {evt.body && <p class="text-neutral-600">{evt.body}</p>}
              </div>
            ))}

            {claim.escalated_at && (
              <div class="text-xs text-orange-800">
                <p class="font-bold">
                  {formatDate(claim.escalated_at, locale)} {"·"}{" "}
                  {translate(
                    locale,
                    "Visible también en la comunidad superior",
                  )}
                </p>
                <p>
                  {translate(
                    locale,
                    "Sin acuse de recibo dentro del plazo y con el umbral de apoyos alcanzado, el reclamo pasó a mostrarse también en la comunidad superior.",
                  )}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Declaración de los vecinos a la prensa */}
        <section class="mt-8 rounded-xl border border-neutral-300 bg-neutral-50 p-5 text-xs leading-relaxed text-neutral-700">
          <h4 class="font-bold text-neutral-900 uppercase">
            {translate(locale, "Nota de los vecinos a medios y periodistas:")}
          </h4>
          <p class="mt-1.5">
            {translate(
              locale,
              "Este informe ha sido emitido de manera legítima por vecinos afectados de {{community}}. Agradecemos la cobertura periodística, difusión en radios y medios digitales para visibilizar este pedido y garantizar una pronta respuesta oficial.",
              { community: community.name },
            )}
          </p>
        </section>

        {/* Verificación Digital con QR */}
        <footer class="mt-8 flex flex-wrap items-center justify-between gap-6 border-t-2 border-neutral-200 pt-6">
          <div class="min-w-0 flex-1 text-xs text-neutral-500">
            <p class="font-bold text-neutral-800">
              {translate(locale, "Verificación en tiempo real:")}
            </p>
            <p class="mt-1">
              {translate(
                locale,
                "Para ver la cantidad actual de apoyos y las novedades, escaneá el código QR o ingresá a:",
              )}
            </p>
            <p class="mt-1 font-mono text-[11px] text-neutral-900 break-all">
              {fullUrl}
            </p>
          </div>
          <div class="shrink-0 text-center">
            <svg
              viewBox={`0 0 ${qr.viewBox} ${qr.viewBox}`}
              role="img"
              aria-label={translate(locale, "Código QR del reclamo")}
              shape-rendering="crispEdges"
              class="mx-auto block size-24 border border-neutral-300"
            >
              <rect width="100%" height="100%" fill="#fff" />
              <path d={qr.path} fill="#000" />
            </svg>
            <p class="mt-1 text-[10px] text-neutral-500 uppercase">
              {translate(locale, "Escanear QR")}
            </p>
          </div>
        </footer>
      </article>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useClaimDossier);
  const locale = resolveValue(useLocaleLoader) ?? DEFAULT_LOCALE;
  const title = data?.claim.title ?? translate(locale, "Reclamo");

  return {
    title: `${translate(locale, "Dossier de Prensa")} · ${title} · ${APP_NAME}`,
    // Duplicado imprimible del contenido: no se indexa aparte.
    meta: [{ name: "robots", content: "noindex" }],
  };
};
