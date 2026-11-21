import { component$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { APP_NAME } from "~/lib/constants";
import { formatMoney } from "~/lib/format";
import { isUuid, siteOrigin } from "~/lib/http";
import { qrSvgFor } from "~/lib/qr";
import { single } from "~/lib/query";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { supabase } from "~/lib/session";
import { useLocaleLoader } from "~/routes/layout";

export const useProjectPoster = routeLoader$(async (ev) => {
  if (!isUuid(ev.params.id)) {
    throw ev.error(404, "Proyecto no encontrado");
  }
  const db = supabase(ev);
  const locale = resolveLocale(ev.locale());

  // `single` corta con 500 ante un fallo de la base: un error transitorio no
  // es un "no existe" (lo mismo que hacen los demás imprimibles).
  const project = await single(
    ev,
    "proyectos/afiche",
    db
      .from("projects")
      .select(
        "id, title, summary, resources_needed, time_estimate, budget_amount, currency, status, created_at, community:communities!projects_community_id_fkey(id, slug, name, emoji, level, member_count)",
      )
      .eq("id", ev.params.id)
      .maybeSingle(),
  );

  if (!project || !project.community) {
    throw ev.error(404, translate(locale, "No encontramos ese proyecto."));
  }

  const origin = siteOrigin(ev);
  const fullUrl = `${origin}/proyectos/${project.id}`;
  // QR generado acá, en el servidor: sin pedirle nada a un tercero (la CSP
  // lo bloquearía y además le pasaría la URL y la IP de quien imprime).
  const qr = qrSvgFor(fullUrl);

  return {
    project,
    community: project.community,
    fullUrl,
    qr,
  };
});

export default component$(() => {
  const data = useProjectPoster();
  const locale = useLocale();
  const { project, community, fullUrl, qr } = data.value;

  return (
    <div class="min-h-screen bg-slate-100 p-4 font-sans text-slate-900 print:bg-white print:p-0">
      {/* Barra de control para pantalla (oculta al imprimir) */}
      <div class="mx-auto mb-6 flex max-w-2xl items-center justify-between rounded-2xl bg-white p-4 shadow-xs print:hidden">
        <Link
          href={`/proyectos/${project.id}`}
          class="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:underline"
        >
          ← {translate(locale, "Volver al proyecto")}
        </Link>
        <button
          type="button"
          onClick$={() => window.print()}
          class="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-xs transition hover:bg-slate-800 active:scale-95"
        >
          <span aria-hidden="true">🖨️</span>
          <span>
            {translate(locale, "Imprimir afiche (o Guardar como PDF)")}
          </span>
        </button>
      </div>

      {/* Hoja A4 del afiche */}
      <div class="mx-auto max-w-[210mm] border border-slate-300 bg-white p-10 shadow-lg print:max-w-none print:border-none print:p-8 print:shadow-none">
        {/* Cabecera */}
        <div class="border-b-4 border-slate-900 pb-5 text-center">
          <p class="text-xs font-black uppercase tracking-widest text-slate-500">
            {APP_NAME} · {translate(locale, "Proyecto Vecinal")}
          </p>
          <h1 class="mt-2 text-3xl font-black uppercase tracking-tight sm:text-4xl">
            {translate(locale, "¡Vecinos de {{name}}!", {
              name: community.name,
            })}
          </h1>
          <p class="mt-1 text-lg font-semibold text-slate-700">
            {translate(
              locale,
              "Nos organizamos para transformar y mejorar nuestro espacio común",
            )}
          </p>
        </div>

        {/* Título del proyecto */}
        <div class="my-6 rounded-2xl border-2 border-slate-900 bg-slate-50 p-6 text-center">
          <p class="text-xs font-bold uppercase tracking-wider text-slate-500">
            {translate(locale, "Iniciativa Comunitaria")}
          </p>
          <h2 class="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
            "{project.title}"
          </h2>
          {project.summary && (
            <p class="mt-3 text-base font-medium leading-relaxed text-slate-700">
              {project.summary}
            </p>
          )}
        </div>

        {/* Ficha de Detalles Clave */}
        <div class="my-6 grid grid-cols-2 gap-4 border-y-2 border-slate-200 py-4 text-center sm:grid-cols-3">
          {project.time_estimate && (
            <div class="p-2">
              <span class="block text-xs font-bold uppercase tracking-wider text-slate-500">
                ⏱️ {translate(locale, "Tiempo estimado")}
              </span>
              <span class="mt-1 block font-bold text-slate-900">
                {project.time_estimate}
              </span>
            </div>
          )}

          {project.budget_amount && (
            <div class="p-2">
              <span class="block text-xs font-bold uppercase tracking-wider text-slate-500">
                💰 {translate(locale, "Presupuesto")}
              </span>
              <span class="mt-1 block font-bold text-slate-900">
                {formatMoney(project.budget_amount, project.currency, locale)}
              </span>
            </div>
          )}

          <div class="col-span-2 p-2 sm:col-span-1">
            <span class="block text-xs font-bold uppercase tracking-wider text-slate-500">
              📍 {translate(locale, "Comunidad")}
            </span>
            <span class="mt-1 block font-bold text-slate-900">
              {community.emoji} {community.name}
            </span>
          </div>
        </div>

        {/* Recursos y Manos necesarias */}
        {project.resources_needed && (
          <div class="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600">
              🛠️ {translate(locale, "¿Qué necesitamos para lograrlo?")}
            </h3>
            <p class="mt-1.5 text-sm font-medium leading-relaxed text-slate-800">
              {project.resources_needed}
            </p>
          </div>
        )}

        {/* Llamado a la Acción y Código QR */}
        <div class="my-8 flex flex-col items-center justify-between gap-6 rounded-3xl border-4 border-slate-900 bg-emerald-50/40 p-6 sm:flex-row">
          <div class="flex-1 text-center sm:text-left">
            <span class="inline-block rounded-full bg-emerald-600 px-3 py-1 text-xs font-black uppercase tracking-wider text-white">
              {translate(locale, "Sumate al proyecto")}
            </span>
            <h3 class="mt-2 text-2xl font-black text-slate-900">
              {translate(locale, "Escaneá para ver el proyecto y sumarte")}
            </h3>
            <p class="mt-1 text-sm font-medium text-slate-600">
              {translate(
                locale,
                "Apuntá la cámara de tu celular al código QR para comprometer un aporte, ofrecer tiempo o materiales y hacer preguntas.",
              )}
            </p>
            <p class="mt-3 font-mono text-xs font-bold text-slate-500 break-all">
              {fullUrl}
            </p>
          </div>

          <div class="flex flex-col items-center">
            <div class="rounded-2xl border-2 border-slate-900 bg-white p-2 shadow-md">
              <svg
                viewBox={`0 0 ${qr.viewBox} ${qr.viewBox}`}
                role="img"
                aria-label={translate(
                  locale,
                  "Código QR para sumarse al proyecto",
                )}
                shape-rendering="crispEdges"
                class="block size-36 sm:size-40"
              >
                <rect width="100%" height="100%" fill="#fff" />
                <path d={qr.path} fill="#000" />
              </svg>
            </div>
            <span class="mt-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
              {translate(locale, "Escanear con celular")}
            </span>
          </div>
        </div>

        {/* Pestañas recortables al pie del afiche (tear-off strips) */}
        <div class="mt-8 border-t-2 border-dashed border-slate-400 pt-4">
          <p class="mb-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
            ✂️ {translate(locale, "Pestañas recortables para llevar")}
          </p>
          <div class="grid grid-cols-5 gap-2 text-center text-[10px]">
            {[1, 2, 3, 4, 5].map((idx) => (
              <div
                key={`tear-${idx}`}
                class="flex flex-col justify-between rounded-lg border border-slate-300 p-2 text-slate-700"
              >
                <span class="font-bold line-clamp-1">{project.title}</span>
                <span class="mt-1 font-mono text-[9px] text-slate-500">
                  {community.name}
                </span>
                <span class="mt-1 font-bold text-emerald-800">
                  {new URL(fullUrl).host}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Pie institucional */}
        <div class="mt-6 border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
          <p>
            {APP_NAME} ·{" "}
            {translate(
              locale,
              "Plataforma cívica comunitaria. La participación barrial transforma nuestro entorno.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => {
  const data = resolveValue(useProjectPoster);
  const locale = resolveValue(useLocaleLoader);
  const title = data?.project.title ?? translate(locale, "Proyecto");

  return {
    title: `${translate(locale, "Afiche Comunitario")} · ${title} · ${APP_NAME}`,
    // Duplicado imprimible del contenido: no se indexa aparte.
    meta: [{ name: "robots", content: "noindex" }],
  };
};
