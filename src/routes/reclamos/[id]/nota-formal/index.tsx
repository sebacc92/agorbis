import { $, component$, useSignal } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { cx, triggerHapticFeedback } from "~/components/ui";
import { APP_NAME, CLAIM_STATUS_LABEL } from "~/lib/constants";
import { formatDate, pluralize } from "~/lib/format";
import { isUuid, siteOrigin } from "~/lib/http";
import { qrSvgFor } from "~/lib/qr";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { supabase } from "~/lib/session";
import { single } from "~/lib/query";
import { showToast } from "~/components/ui/Toast";
import { useLocaleLoader } from "~/routes/layout";

export const useFormalLetter = routeLoader$(async (ev) => {
  if (!isUuid(ev.params.id)) {
    throw ev.error(404, "Reclamo no encontrado");
  }
  const db = supabase(ev);
  const locale = resolveLocale(ev.locale());

  const claim = await single(
    ev,
    "reclamos/nota-formal",
    db
      .from("claims")
      .select(
        "id, title, description, location_text, status, support_count, created_at, community:communities!claims_community_id_fkey(id, slug, name, emoji, level, member_count)",
      )
      .eq("id", ev.params.id)
      .maybeSingle(),
  );

  if (!claim || !claim.community) {
    throw ev.error(404, translate(locale, "No encontramos ese reclamo."));
  }

  const origin = siteOrigin(ev);
  const fullUrl = `${origin}/reclamos/${claim.id}`;
  // QR generado acá, en el servidor: sin pedirle nada a un tercero (la CSP
  // lo bloquearía y además le pasaría la URL y la IP de quien imprime).
  const qr = qrSvgFor(fullUrl);

  return {
    claim,
    community: claim.community,
    fullUrl,
    qr,
    today: new Date().toISOString(),
  };
});

export default component$(() => {
  const data = useFormalLetter();
  const locale = useLocale();
  const isZenMode = useSignal(false);
  const showLetterhead = useSignal(true);
  const copied = useSignal(false);
  const fontSize = useSignal<"sm" | "base" | "lg">("base");
  const { claim, community, fullUrl, qr, today } = data.value;

  const copyFormalEmail$ = $(async () => {
    const lines = [
      `ASUNTO: RECLAMO CIUDADANO - ${claim.title.toUpperCase()} (AGB-${claim.id.slice(0, 8).toUpperCase()})`,
      "",
      `A las Autoridades de ${community.name}:`,
      "",
      `Por medio de la presente, presentamos formalmente la siguiente petición ciudadana registrada en la comunidad ${community.name}:`,
      "",
      `• Expediente Digital: AGB-${claim.id.slice(0, 8).toUpperCase()}`,
      `• Reclamo: ${claim.title}`,
      `• Ubicación: ${claim.location_text || "No especificada"}`,
      `• Apoyos vecinales registrados: ${claim.support_count}`,
      `• Fecha de Emisión: ${formatDate(today, locale)}`,
      "",
      `DESCRIPCIÓN DE LA SITUACIÓN:`,
      claim.description,
      "",
      `Consulta pública del reclamo y sus apoyos:`,
      fullUrl,
      "",
      `Esperamos su pronta gestión y respuesta formal.`,
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
    <div
      class={cx(
        "min-h-screen p-4 font-serif text-neutral-900 transition-colors duration-300 print:bg-white print:p-0",
        isZenMode.value
          ? "bg-amber-50/40 dark:bg-stone-950 dark:text-stone-100"
          : "bg-neutral-100 dark:bg-neutral-900 dark:text-stone-100",
      )}
    >
      {/* Controles de pantalla */}
      <div
        class={cx(
          "mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 font-sans shadow-sm transition-all print:hidden dark:bg-stone-900 dark:text-stone-100",
          isZenMode.value && "hidden",
        )}
      >
        <Link
          href={`/reclamos/${claim.id}`}
          class="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 hover:text-neutral-900 hover:underline dark:text-stone-400 dark:hover:text-stone-100"
        >
          ← {translate(locale, "Volver al reclamo")}
        </Link>
        <div class="flex flex-wrap items-center gap-2">
          {/* Zoom tipográfico */}
          <div class="flex items-center rounded-xl border border-neutral-200 bg-neutral-50 p-0.5 dark:border-stone-700 dark:bg-stone-800">
            <button
              type="button"
              onClick$={() => {
                if (fontSize.value === "lg") fontSize.value = "base";
                else if (fontSize.value === "base") fontSize.value = "sm";
              }}
              title={translate(locale, "Reducir texto")}
              aria-label={translate(locale, "Reducir texto")}
              class="rounded-lg px-2 py-1 text-xs font-bold text-neutral-600 hover:bg-white dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {"A-"}
            </button>
            <button
              type="button"
              onClick$={() => {
                if (fontSize.value === "sm") fontSize.value = "base";
                else if (fontSize.value === "base") fontSize.value = "lg";
              }}
              title={translate(locale, "Aumentar texto")}
              aria-label={translate(locale, "Aumentar texto")}
              class="rounded-lg px-2 py-1 text-xs font-bold text-neutral-600 hover:bg-white dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {"A+"}
            </button>
          </div>

          <button
            type="button"
            onClick$={() => {
              triggerHapticFeedback("selection");
              showLetterhead.value = !showLetterhead.value;
            }}
            aria-pressed={showLetterhead.value}
            class={cx(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-xs transition-colors",
              showLetterhead.value
                ? "border-brand-500 bg-brand-50 text-brand-800 dark:border-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200",
            )}
            title={translate(locale, "Alternar membrete cívico oficial")}
          >
            <span aria-hidden="true">🏛️</span>
            <span>{translate(locale, "Membrete")}</span>
          </button>

          <button
            type="button"
            onClick$={copyFormalEmail$}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-xs transition-colors hover:border-neutral-400 active:scale-95 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
            title={translate(
              locale,
              "Copiar texto preparado para correo electrónico o WhatsApp",
            )}
          >
            <span aria-hidden="true">{copied.value ? "✅" : "📋"}</span>
            <span>
              {copied.value
                ? translate(locale, "¡Copiado!")
                : translate(locale, "Copiar p/ Email")}
            </span>
          </button>

          <button
            type="button"
            onClick$={() => (isZenMode.value = true)}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-xs transition-colors hover:border-neutral-400 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200"
          >
            <span>📖</span>
            <span>{translate(locale, "Modo lectura")}</span>
          </button>

          <button
            type="button"
            onClick$={() => window.print()}
            class="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-neutral-800 dark:bg-stone-100 dark:text-stone-900"
          >
            <span>🖨️</span>
            <span>
              {translate(locale, "Imprimir nota para Mesa de Entradas")}
            </span>
          </button>
        </div>
      </div>

      {/* Botón flotante para salir de Modo Lectura */}
      {isZenMode.value && (
        <div class="fixed right-4 top-4 z-40 flex items-center gap-2 print:hidden">
          <div class="flex items-center rounded-full border border-stone-300 bg-white/95 p-0.5 shadow-md backdrop-blur-md dark:border-stone-700 dark:bg-stone-800/95">
            <button
              type="button"
              onClick$={() => {
                if (fontSize.value === "lg") fontSize.value = "base";
                else if (fontSize.value === "base") fontSize.value = "sm";
              }}
              title={translate(locale, "Reducir texto")}
              aria-label={translate(locale, "Reducir texto")}
              class="rounded-full px-2.5 py-1 text-xs font-bold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {"A-"}
            </button>
            <button
              type="button"
              onClick$={() => {
                if (fontSize.value === "sm") fontSize.value = "base";
                else if (fontSize.value === "base") fontSize.value = "lg";
              }}
              title={translate(locale, "Aumentar texto")}
              aria-label={translate(locale, "Aumentar texto")}
              class="rounded-full px-2.5 py-1 text-xs font-bold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-700"
            >
              {"A+"}
            </button>
          </div>
          <button
            type="button"
            onClick$={() => (isZenMode.value = false)}
            class="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white/95 px-4 py-1.5 text-xs font-semibold text-stone-800 shadow-md backdrop-blur-md transition-colors hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800/95 dark:text-stone-100"
          >
            <span>✕</span>
            <span>{translate(locale, "Salir del modo lectura")}</span>
          </button>
        </div>
      )}

      {/* Hoja A4 para imprimir / leer */}
      <article
        class={cx(
          "mx-auto rounded-2xl bg-white p-8 shadow-md transition-all print:max-w-none print:rounded-none print:p-12 print:shadow-none dark:bg-stone-900 dark:text-stone-100 sm:p-10",
          isZenMode.value
            ? "max-w-4xl border border-stone-200/80 shadow-lift dark:border-stone-800"
            : "max-w-3xl",
          fontSize.value === "sm" && "text-xs",
          fontSize.value === "base" && "text-sm",
          fontSize.value === "lg" && "text-base",
        )}
      >
        {/* Membrete Cívico Oficial Opcional */}
        {showLetterhead.value && (
          <div class="mb-6 flex items-center justify-between border-b-2 border-double border-neutral-900 pb-4 font-sans text-neutral-800 dark:border-stone-700 dark:text-stone-200">
            <div class="flex items-center gap-3">
              <span class="text-3xl" aria-hidden="true">
                🏛️
              </span>
              <div>
                <p class="text-[11px] font-black uppercase tracking-widest text-neutral-900 dark:text-stone-100">
                  {translate(locale, "Constancia de Petición Ciudadana")}
                </p>
                <p class="text-[10px] text-neutral-600 dark:text-stone-400">
                  {translate(
                    locale,
                    "Plataforma Vecinal Abierta · Expediente Digital No Vinculante",
                  )}
                </p>
              </div>
            </div>
            <div class="text-right font-mono text-[10px] text-neutral-500 dark:text-stone-400">
              <p>
                {translate(locale, "ID:")} {claim.id.slice(0, 13).toUpperCase()}
              </p>
              <p>{formatDate(today, locale)}</p>
            </div>
          </div>
        )}

        {/* Cabecera formal */}
        <header class="border-b-2 border-neutral-900 pb-6 text-center">
          <p class="font-sans text-xs uppercase tracking-widest text-neutral-600">
            {translate(locale, "Presentación Formal de Reclamo Ciudadano")}
          </p>
          <h1 class="mt-1 text-2xl font-bold tracking-tight text-neutral-900">
            {translate(locale, "NOTA A MESA DE ENTRADAS")}
          </h1>
          <p class="mt-1 font-sans text-sm text-neutral-700">
            {translate(locale, "Jurisdicción:")}{" "}
            <strong class="uppercase">{community.name}</strong>
          </p>
        </header>

        {/* Metadatos de la nota */}
        <div class="mt-6 flex flex-wrap items-start justify-between gap-4 font-sans text-xs text-neutral-700">
          <div>
            <p>
              <strong>{translate(locale, "Expediente digital:")}</strong>{" "}
              {`AGB-${claim.id.slice(0, 8).toUpperCase()}`}
            </p>
            <p class="mt-1">
              <strong>{translate(locale, "Fecha de emisión:")}</strong>{" "}
              {formatDate(today, locale)}
            </p>
          </div>
          <div class="text-right">
            <p>
              <strong>
                {translate(locale, "Apoyos registrados en la plataforma:")}
              </strong>{" "}
              {pluralize(claim.support_count, "vecino", "vecinos", locale)}
            </p>
            <p class="mt-1">
              <strong>{translate(locale, "Estado en plataforma:")}</strong>{" "}
              {translate(
                locale,
                CLAIM_STATUS_LABEL[claim.status]?.label ?? "Abierto",
              )}
            </p>
          </div>
        </div>

        {/* Destinatario */}
        <div class="mt-8 font-sans text-sm leading-relaxed text-neutral-800">
          <p class="font-bold uppercase">
            {translate(
              locale,
              "A las Autoridades Municipales y de Gobierno de {{name}}:",
              {
                name: community.name,
              },
            )}
          </p>
          <p class="mt-1 italic text-neutral-600">
            {translate(
              locale,
              "Área de Mesa de Entradas / Atención al Ciudadano / Obras y Servicios Públicos",
            )}
          </p>
        </div>

        {/* Cuerpo formal */}
        <div class="mt-6 space-y-4 text-justify text-sm leading-relaxed text-neutral-900">
          <p>
            {translate(
              locale,
              "De nuestra consideración: Por medio de la presente, vecinos y residentes de {{name}}, venimos a poner en formal conocimiento y solicitar la urgente intervención oficial ante la siguiente problemática comunitaria:",
              { name: community.name },
            )}
          </p>

          <div class="rounded-lg border border-neutral-300 bg-neutral-50 p-4 font-sans text-xs leading-relaxed text-neutral-900">
            <p>
              <strong>{translate(locale, "ASUNTO:")}</strong>{" "}
              <span dir="auto">{claim.title}</span>
            </p>
            {claim.location_text && (
              <p class="mt-2">
                <strong>{translate(locale, "UBICACIÓN:")}</strong>{" "}
                <span dir="auto">{claim.location_text}</span>
              </p>
            )}
            <p class="mt-2">
              <strong>{translate(locale, "DETALLE DEL RECLAMO:")}</strong>
            </p>
            <div dir="auto" class="mt-1 whitespace-pre-line text-neutral-800">
              {claim.description}
            </div>
          </div>

          <p>
            {translate(
              locale,
              "Hacemos constar que este reclamo ha sido respaldado por {{count}} vecinos mediante la plataforma cívica comunitaria Agorbis. Solicitamos se arbitren los medios inspectivos y operativos necesarios para subsanar este inconveniente a la brevedad posible, informando el número de expediente administrativo asignado.",
              { count: claim.support_count },
            )}
          </p>
        </div>

        {/* Verificación QR */}
        <div class="mt-8 flex items-center justify-between gap-4 rounded-xl border border-neutral-300 p-4 font-sans text-xs">
          <div class="min-w-0 flex-1">
            <p class="font-bold text-neutral-900">
              {translate(locale, "Seguimiento digital del reclamo:")}
            </p>
            <p class="mt-1 text-neutral-600">
              {translate(
                locale,
                "Escaneá este código QR o ingresá al enlace para ver los apoyos y las novedades del reclamo:",
              )}
            </p>
            <p class="mt-2 font-mono text-[11px] font-semibold text-neutral-900 break-all">
              {fullUrl}
            </p>
          </div>
          <svg
            viewBox={`0 0 ${qr.viewBox} ${qr.viewBox}`}
            role="img"
            aria-label={translate(locale, "Código QR del reclamo")}
            shape-rendering="crispEdges"
            class="block size-20 shrink-0 rounded border border-neutral-300"
          >
            <rect width="100%" height="100%" fill="#fff" />
            <path d={qr.path} fill="#000" />
          </svg>
        </div>

        {/* Tabla de firmas presenciales de vecinos */}
        {/* Sin DNI ni domicilio, igual que la planilla: son datos de terceros
            que Agorbis no necesita y que la nota circularía en papel. Alcanza
            con nombre, cuadra aproximada (opcional) y firma. */}
        <div class="mt-8">
          <h2 class="font-sans text-xs font-bold uppercase tracking-wider text-neutral-800">
            {translate(
              locale,
              "Adhesión complementaria de vecinos de la cuadra:",
            )}
          </h2>
          <table class="mt-3 w-full border-collapse font-sans text-[11px] text-neutral-800">
            <thead>
              <tr class="border-b-2 border-neutral-800 text-left">
                <th class="py-2 pr-2">
                  {translate(locale, "Nombre y Apellido")}
                </th>
                <th class="py-2 px-2">
                  {translate(locale, "Cuadra aproximada (opcional)")}
                </th>
                <th class="py-2 pl-2 text-right">
                  {translate(locale, "Firma")}
                </th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6].map((row) => (
                <tr key={row} class="border-b border-neutral-300">
                  <td class="h-10 py-1 pr-2"></td>
                  <td class="h-10 py-1 px-2"></td>
                  <td class="h-10 py-1 pl-2"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pie de página institucional */}
        <footer class="mt-10 border-t border-neutral-300 pt-4 text-center font-sans text-[10px] text-neutral-500">
          <p>
            {translate(
              locale,
              "Documento generado para fines cívicos vecinales a través de {{appName}} · Participación ciudadana directa.",
              {
                appName: APP_NAME,
              },
            )}
          </p>
        </footer>
      </article>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useFormalLetter);
  const locale = resolveValue(useLocaleLoader) ?? "es";
  const claimTitle = data?.claim.title ?? translate(locale, "Reclamo");

  return {
    title: `${translate(locale, "Nota Formal")} - ${claimTitle} · ${APP_NAME}`,
    // Duplicado imprimible del contenido: no se indexa aparte.
    meta: [{ name: "robots", content: "noindex" }],
  };
};
