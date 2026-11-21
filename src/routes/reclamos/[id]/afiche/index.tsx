import { component$, useSignal } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { APP_NAME } from "~/lib/constants";
import { formatNumber, pluralize } from "~/lib/format";
import { isUuid, siteOrigin } from "~/lib/http";
import { qrSvgFor } from "~/lib/qr";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { supabase } from "~/lib/session";
import { single } from "~/lib/query";
import { escalationThreshold } from "~/lib/claim-escalation";
import { useLocaleLoader } from "~/routes/layout";
import { playCivicSound } from "~/lib/audio-feedback";
import { triggerHapticFeedback, cx } from "~/components/ui";

export const useClaimPoster = routeLoader$(async (ev) => {
  if (!isUuid(ev.params.id)) {
    throw ev.error(404, "Reclamo no encontrado");
  }
  const db = supabase(ev);
  const locale = resolveLocale(ev.locale());

  const claim = await single(
    ev,
    "reclamos/afiche",
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
  const threshold = escalationThreshold(claim.community.member_count);
  const missing = Math.max(0, threshold - claim.support_count);

  return {
    claim,
    community: claim.community,
    fullUrl,
    qr,
    threshold,
    missing,
  };
});

export default component$(() => {
  const data = useClaimPoster();
  const locale = useLocale();
  const { claim, community, fullUrl, qr, missing } = data.value;

  const posterFormat = useSignal<"a4" | "a5" | "flyer">("a4");
  const posterTone = useSignal<"urgent" | "civic" | "bw">("urgent");

  return (
    <div class="min-h-screen bg-slate-100 p-4 font-sans text-slate-900 print:bg-white print:p-0">
      {/* Barra de control para pantalla (oculta al imprimir) */}
      <div class="mx-auto mb-6 max-w-3xl rounded-2xl bg-white p-4 shadow-sm print:hidden space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/reclamos/${claim.id}`}
            class="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:underline"
          >
            ← {translate(locale, "Volver al reclamo")}
          </Link>

          <button
            type="button"
            onClick$={() => {
              playCivicSound("click");
              triggerHapticFeedback("medium");
              window.print();
            }}
            class="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
          >
            <span aria-hidden="true">🖨️</span>
            <span>
              {translate(locale, "Imprimir afiche (o Guardar como PDF)")}
            </span>
          </button>
        </div>

        {/* Selectores de Formato y Tono */}
        <div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200 text-xs">
          <div class="flex items-center gap-1.5">
            <span class="font-semibold text-slate-500">
              {translate(locale, "Formato:")}
            </span>
            {(
              [
                ["a4", "A4 (Pared / Poste)"],
                ["a5", "A5 (Comercio / Buzón)"],
                ["flyer", "Flyer de mano"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick$={() => {
                  posterFormat.value = key;
                  playCivicSound("toggle");
                  triggerHapticFeedback("selection");
                }}
                class={cx(
                  "px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer",
                  posterFormat.value === key
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {translate(locale, label)}
              </button>
            ))}
          </div>

          <div class="flex items-center gap-1.5">
            <span class="font-semibold text-slate-500">
              {translate(locale, "Estilo:")}
            </span>
            {(
              [
                ["urgent", "🚨 Urgente"],
                ["civic", "🌱 Comunitario"],
                ["bw", "📄 Blanco y Negro"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick$={() => {
                  posterTone.value = key;
                  playCivicSound("toggle");
                  triggerHapticFeedback("selection");
                }}
                class={cx(
                  "px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer",
                  posterTone.value === key
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {translate(locale, label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hoja del afiche responsiva */}
      <div
        class={cx(
          "mx-auto bg-white shadow-lg print:max-w-none print:border-none print:shadow-none transition-all",
          posterFormat.value === "a4"
            ? "max-w-[210mm] p-10 border-2"
            : posterFormat.value === "a5"
              ? "max-w-[148mm] p-6 border-2"
              : "max-w-[120mm] p-5 border",
          posterTone.value === "urgent"
            ? "border-amber-600"
            : posterTone.value === "civic"
              ? "border-emerald-600"
              : "border-slate-900",
        )}
      >
        {/* Cabecera */}
        <div class="border-b-4 border-slate-900 pb-5 text-center">
          <p class="text-xs font-black uppercase tracking-widest text-slate-500">
            {APP_NAME} · {translate(locale, "Comunidad Vecinal")}
          </p>
          <h1 class="mt-2 text-3xl font-black uppercase tracking-tight sm:text-4xl">
            {translate(locale, "¡Vecinos de {{name}}!", {
              name: community.name,
            })}
          </h1>
          <p class="mt-1 text-lg font-semibold text-slate-700">
            {translate(
              locale,
              "Necesitamos tu apoyo para visibilizar este problema en nuestra zona",
            )}
          </p>
        </div>

        {/* Problema y Reclamo */}
        <div class="my-6 rounded-2xl border-2 border-slate-900 bg-slate-50 p-6 text-center">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500">
            {translate(locale, "Reclamo Comunitario")}
          </p>
          <h2 class="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
            "{claim.title}"
          </h2>
          {claim.location_text && (
            <p class="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-1 text-sm font-bold text-slate-800">
              <span aria-hidden="true">📍</span> {claim.location_text}
            </p>
          )}
        </div>

        {/* Descripción del problema */}
        <div class="my-6 text-base leading-relaxed text-slate-700">
          <p class="line-clamp-6 text-justify whitespace-pre-line">
            {claim.description}
          </p>
        </div>

        {/* Estado y meta de apoyos */}
        <div class="my-6 flex items-center justify-around rounded-xl border border-dashed border-slate-400 bg-slate-100 p-4 text-center">
          <div>
            <p class="text-xs font-bold uppercase text-slate-500">
              {translate(locale, "Apoyos actuales")}
            </p>
            <p class="text-3xl font-black text-slate-900">
              {pluralize(claim.support_count, "vecino", "vecinos", locale)}
            </p>
          </div>
          {missing > 0 ? (
            <div>
              <p class="text-xs font-bold uppercase text-slate-500">
                {translate(locale, "Meta vecinal")}
              </p>
              <p class="text-2xl font-black text-brand-700">
                {translate(locale, "Faltan {{count}} apoyos", {
                  count: formatNumber(missing, locale),
                })}
              </p>
            </div>
          ) : (
            <div>
              <p class="text-xs font-bold uppercase text-slate-500">
                {translate(locale, "Estado cívico")}
              </p>
              <p class="text-2xl font-black text-emerald-700">
                {translate(locale, "Meta de apoyos alcanzada")}
              </p>
            </div>
          )}
        </div>

        {/* Llamado a la Acción y Código QR */}
        <div class="mt-8 flex flex-col items-center justify-center border-t-2 border-slate-900 pt-6 text-center sm:flex-row sm:gap-8 sm:text-left">
          <div class="size-48 shrink-0 overflow-hidden rounded-2xl border-2 border-slate-900 bg-white p-2 shadow-sm">
            <svg
              viewBox={`0 0 ${qr.viewBox} ${qr.viewBox}`}
              role="img"
              aria-label={translate(locale, "Código QR para sumar tu apoyo")}
              shape-rendering="crispEdges"
              class="block size-full"
            >
              <rect width="100%" height="100%" fill="#fff" />
              <path d={qr.path} fill="#000" />
            </svg>
          </div>
          <div class="mt-4 sm:mt-0">
            <h3 class="text-xl font-black uppercase tracking-tight text-slate-950">
              {translate(locale, "Escaneá y sumá tu apoyo:")}
            </h3>
            <ol class="mt-2 list-decimal space-y-1 pl-4 text-sm font-medium text-slate-700">
              <li>{translate(locale, "Abrí la cámara de tu celular.")}</li>
              <li>
                {translate(locale, "Apuntá al código QR de la izquierda.")}
              </li>
              <li>
                {translate(
                  locale,
                  "Tocá 'Me afecta también' para sumar tu apoyo.",
                )}
              </li>
            </ol>
            <p class="mt-3 text-xs text-slate-500">
              {translate(
                locale,
                "También podés ingresar directamente desde tu navegador:",
              )}
              <br />
              <strong class="font-mono text-slate-800 break-all">
                {fullUrl}
              </strong>
            </p>
          </div>
        </div>

        {/* Pie institucional de comunidad */}
        <div class="mt-10 border-t border-slate-200 pt-3 text-center text-xs text-slate-400 print:mt-8">
          <p>
            {APP_NAME} · {translate(locale, "Plataforma cívica comunitaria")} ·{" "}
            {community.name}
          </p>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useClaimPoster);
  const locale = resolveValue(useLocaleLoader);
  const title = data?.claim.title ?? translate(locale, "Reclamo");

  return {
    title: `${translate(locale, "Afiche imprimible")}: ${title} · ${APP_NAME}`,
    // Duplicado imprimible del contenido: no se indexa aparte.
    meta: [{ name: "robots", content: "noindex" }],
  };
};
