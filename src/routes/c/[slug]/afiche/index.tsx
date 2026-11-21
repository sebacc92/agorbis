import { component$ } from "@qwik.dev/core";
import { Link, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import { APP_NAME } from "~/lib/constants";
import { routes } from "~/lib/community";
import { siteOrigin } from "~/lib/http";
import { qrSvgFor } from "~/lib/qr";
import { single } from "~/lib/query";
import { supabase } from "~/lib/session";
import { resolveLocale, translate, useLocale } from "~/lib/i18n";
import { useLocaleLoader } from "~/routes/layout";
import "./poster.css";

export const useCommunityPoster = routeLoader$(async (ev) => {
  const community = await single(
    ev,
    "afiche-comunidad/comunidad",
    supabase(ev)
      .from("communities")
      .select("name, slug, emoji")
      .eq("slug", ev.params.slug)
      .maybeSingle(),
  );
  if (!community)
    throw ev.error(
      404,
      translate(resolveLocale(ev.locale()), "No encontramos esa comunidad."),
    );
  const fullUrl = `${siteOrigin(ev)}${routes.community(community.slug)}`;
  return { community, fullUrl, qr: qrSvgFor(fullUrl) };
});

export default component$(() => {
  const { community, fullUrl, qr } = useCommunityPoster().value;
  const locale = useLocale();
  return (
    <div class="community-poster-shell mx-auto max-w-[210mm]">
      <div class="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href={routes.community(community.slug)}
          class="inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
        >
          {translate(locale, "Volver a {{name}}", { name: community.name })}
        </Link>
        <button
          type="button"
          onClick$={() => window.print()}
          class="inline-flex min-h-11 items-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
        >
          {translate(locale, "Imprimir afiche (o Guardar como PDF)")}
        </button>
      </div>
      <article
        id="community-poster"
        class="rounded-2xl border-2 border-black bg-white p-6 text-center text-black shadow-soft sm:p-10 print:rounded-none print:shadow-none"
      >
        <p class="text-sm font-bold uppercase tracking-widest">
          {APP_NAME} · {translate(locale, "Comunidad Vecinal")}
        </p>
        <span class="mt-7 block text-5xl" aria-hidden="true">
          {community.emoji ?? "🏘️"}
        </span>
        <h1 class="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
          {translate(locale, "¡Vecinos de {{name}}!", { name: community.name })}
        </h1>
        <p class="mx-auto mt-5 max-w-lg text-lg leading-relaxed">
          {translate(
            locale,
            "Conocé los reclamos, encuestas, debates y proyectos de nuestra comunidad.",
          )}
        </p>
        <div class="mx-auto my-8 size-56 max-w-full rounded-xl border-2 border-black bg-white p-3">
          <svg
            role="img"
            aria-label={translate(locale, "Código QR para abrir la comunidad")}
            viewBox={`0 0 ${qr.viewBox} ${qr.viewBox}`}
            shape-rendering="crispEdges"
            class="block size-full"
          >
            <rect width="100%" height="100%" fill="#fff" />
            <path d={qr.path} fill="#000" />
          </svg>
        </div>
        <p class="text-xl font-bold">
          {translate(locale, "Escaneá el código y conocé tu comunidad")}
        </p>
        <p class="mt-3 text-sm">
          {translate(
            locale,
            "También podés ingresar directamente desde tu navegador:",
          )}
        </p>
        <a
          href={fullUrl}
          class="mt-2 block break-all font-mono text-sm font-bold text-black underline"
        >
          {fullUrl}
        </a>
        <p class="mt-8 border-t border-black pt-4 text-sm">
          {translate(
            locale,
            "Podés leer las publicaciones sin crear una cuenta. Para participar, revisá los requisitos de cada comunidad.",
          )}
        </p>
      </article>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue }) => ({
  title: `${translate(resolveValue(useLocaleLoader), "Afiche imprimible")}: ${resolveValue(useCommunityPoster).community.name} · ${APP_NAME}`,
  // Duplicado imprimible del contenido: no se indexa aparte.
  meta: [{ name: "robots", content: "noindex" }],
});
