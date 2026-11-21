import { component$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { APP_NAME, CLAIM_CATEGORIES } from "~/lib/constants";
import { formatDate } from "~/lib/format";
import { isUuid, siteOrigin } from "~/lib/http";
import { qrSvgFor } from "~/lib/qr";
import {
  DEFAULT_LOCALE,
  resolveLocale,
  translate,
  useLocale,
} from "~/lib/i18n";
import { supabase } from "~/lib/session";
import { single } from "~/lib/query";
import { useLocaleLoader } from "~/routes/layout";

export const useClaimPetitionSheet = routeLoader$(async (ev) => {
  if (!isUuid(ev.params.id)) {
    throw ev.error(404, "Reclamo no encontrado");
  }
  const db = supabase(ev);
  const locale = resolveLocale(ev.locale());

  const claim = await single(
    ev,
    "reclamos/planilla",
    db
      .from("claims")
      .select(
        "id, title, description, location_text, category, status, support_count, created_at, community:communities!claims_community_id_fkey(id, slug, name, emoji, level, member_count)",
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
  const categoryObj = CLAIM_CATEGORIES.find((c) => c.key === claim.category);

  return {
    claim,
    community: claim.community,
    categoryLabel: categoryObj?.label ?? claim.category,
    categoryEmoji: categoryObj?.emoji ?? "📣",
    fullUrl,
    qr,
    today: new Date().toISOString(),
  };
});

export default component$(() => {
  const data = useClaimPetitionSheet();
  const locale = useLocale();
  const { claim, community, categoryLabel, categoryEmoji, fullUrl, qr, today } =
    data.value;

  // 12 renglones preformateados para firmas físicas en una asamblea o recorrida
  const rows = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div class="min-h-screen bg-neutral-100 p-4 font-sans text-neutral-900 print:bg-white print:p-0">
      {/* Controles de pantalla */}
      <div class="mx-auto mb-6 flex max-w-4xl items-center justify-between rounded-xl bg-white p-4 shadow-sm print:hidden">
        <Link
          href={`/reclamos/${claim.id}`}
          class="inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 hover:text-neutral-900 hover:underline"
        >
          ← {translate(locale, "Volver al reclamo")}
        </Link>
        <div class="flex items-center gap-3">
          <button
            type="button"
            onClick$={() => window.print()}
            class="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-neutral-800"
          >
            <span>🖨️</span>
            <span>{translate(locale, "Imprimir Planilla A4")}</span>
          </button>
        </div>
      </div>

      {/* Hoja A4 Imprimible */}
      <div class="mx-auto max-w-4xl bg-white p-8 shadow-md print:max-w-none print:p-4 print:shadow-none">
        {/* Encabezado Institucional y Petitorio */}
        <div class="border-b-2 border-neutral-900 pb-4">
          <div class="flex items-start justify-between gap-4">
            <div>
              <p class="text-xs font-bold uppercase tracking-widest text-neutral-500">
                {translate(locale, "PLANILLA DE ADHESIÓN Y FIRMAS VECINALES")}
              </p>
              <h1 class="mt-1 text-xl font-extrabold tracking-tight text-neutral-950 sm:text-2xl">
                {claim.title}
              </h1>
              <p class="mt-1 text-xs text-neutral-600">
                {community.emoji} {community.name} · {categoryEmoji}{" "}
                {categoryLabel} · {translate(locale, "Expediente cívico:")} #
                {claim.id.slice(0, 8)}
              </p>
            </div>
            <div class="text-right shrink-0">
              <svg
                viewBox={`0 0 ${qr.viewBox} ${qr.viewBox}`}
                role="img"
                aria-label={translate(locale, "Código QR del reclamo")}
                shape-rendering="crispEdges"
                class="block size-20 rounded border border-neutral-300 print:size-16"
              >
                <rect width="100%" height="100%" fill="#fff" />
                <path d={qr.path} fill="#000" />
              </svg>
              <span class="mt-0.5 block text-[9px] font-mono text-neutral-500">
                {translate(locale, "Apoyar en línea")}
              </span>
            </div>
          </div>

          <div class="mt-3 rounded-lg bg-neutral-50 p-2.5 text-xs text-neutral-700 border border-neutral-200">
            <p>
              <strong>{translate(locale, "Petitorio vecinal:")}</strong>{" "}
              {translate(
                locale,
                "Los abajo firmantes, residentes y vecinos de {{community}}, manifestamos nuestro respaldo formal y solicitamos la urgente intervención oficial para solucionar la problemática descrita:",
                { community: community.name },
              )}
            </p>
            <p class="mt-1 italic text-neutral-600">
              "{claim.description}"
              {claim.location_text ? ` (${claim.location_text})` : ""}
            </p>
          </div>
        </div>

        {/* Grilla de Firmas Físicas. Sin DNI, domicilio ni teléfono: son datos
            de terceros que Agorbis no necesita, que la planilla circularía en
            papel y que nadie debería fotografiar ni subir a un reclamo público.
            Alcanza con nombre, cuadra aproximada (opcional) y firma. */}
        <div class="mt-4">
          <table class="w-full border-collapse text-left text-xs">
            <thead>
              <tr class="border-b-2 border-neutral-900 bg-neutral-100 text-neutral-800">
                <th class="w-8 py-2 px-1 text-center font-bold">#</th>
                <th class="py-2 px-2 font-bold">
                  {translate(locale, "Nombre y Apellido")}
                </th>
                <th class="w-56 py-2 px-2 font-bold">
                  {translate(locale, "Cuadra aproximada (opcional)")}
                </th>
                <th class="w-40 py-2 px-2 text-center font-bold">
                  {translate(locale, "Firma")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((rowNumber) => (
                <tr
                  key={rowNumber}
                  class="border-b border-neutral-300 h-10 print:h-9 hover:bg-neutral-50"
                >
                  <td class="px-1 text-center font-mono font-medium text-neutral-400">
                    {rowNumber}
                  </td>
                  <td class="px-2 border-r border-neutral-200"></td>
                  <td class="px-2 border-r border-neutral-200"></td>
                  <td class="px-2"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pie de página con instrucciones de digitalización */}
        <div class="mt-6 border-t border-neutral-200 pt-3 flex items-center justify-between text-[10px] text-neutral-500">
          <div>
            <p class="font-semibold text-neutral-700">
              {translate(locale, "Instrucciones para vecinos organizadores:")}
            </p>
            <p>
              {translate(
                locale,
                "Esta planilla es sólo para presentar en papel. No la fotografíes ni la subas a {{appName}}: tiene nombres y firmas de otras personas y las firmas en papel no se suman a los apoyos de la app.",
                { appName: APP_NAME },
              )}
            </p>
          </div>
          <div class="text-right shrink-0">
            <p>{formatDate(today, locale)}</p>
            <p class="font-mono text-[9px] text-neutral-400 truncate max-w-xs">
              {fullUrl}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useClaimPetitionSheet);
  const locale = resolveValue(useLocaleLoader) ?? DEFAULT_LOCALE;
  const title = data?.claim.title ?? translate(locale, "Planilla de Firmas");

  return {
    title: `${translate(locale, "Planilla de Firmas")} · ${title} · ${APP_NAME}`,
    // Duplicado imprimible del contenido: no se indexa aparte.
    meta: [{ name: "robots", content: "noindex" }],
  };
};
