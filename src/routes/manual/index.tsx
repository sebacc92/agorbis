import { component$ } from "@qwik.dev/core";
import { Link, type DocumentHead } from "@qwik.dev/router";
import { ManualFaq } from "~/components/manual/ManualFaq";
import { ManualNav } from "~/components/manual/ManualNav";
import { Badge, ButtonLink, Card, cx } from "~/components/ui";
import { APP_DESCRIPTION, APP_NAME } from "~/lib/constants";
import { useLocale, translate, type Locale } from "~/lib/i18n";
import {
  MANUAL_EXAMPLE_CHAIN,
  MANUAL_FIRST_STEPS,
  MANUAL_GOOD_POSTS,
  MANUAL_OUTREACH,
  MANUAL_RULES,
  MANUAL_TOOLS,
  MANUAL_TRACKING,
  type ManualLink,
} from "~/lib/manual-content";
import { MANUAL_ESSENTIAL_FAQ } from "~/lib/manual-faq";
import { useLocaleLoader, useViewer } from "../layout";

/** Las secciones quedan debajo del encabezado y, hasta `lg`, de la franja del menú. */
const ANCHOR_OFFSET = "scroll-mt-36 lg:scroll-mt-24";

/** Enlace al lugar donde se hace lo que la tarjeta explica. */
const CardLink = ({ link, locale }: { link: ManualLink; locale: Locale }) => (
  <Link
    href={link.href}
    class="inline-flex min-h-11 items-center text-sm font-medium text-brand hover:underline"
  >
    {translate(locale, link.label)} →
  </Link>
);

export default component$(() => {
  const locale = useLocale();
  const viewer = useViewer();
  const signedIn = !!viewer.value.userId;

  return (
    <div class="container-content py-10 sm:py-14">
      <header class="mx-auto max-w-3xl text-center">
        <Badge tone="brand">
          {translate(locale, "Manual de la comunidad")}
        </Badge>
        <h1 class="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-5xl">
          {translate(locale, "Cómo funciona Agorbis")}
        </h1>
        <p class="mx-auto mt-4 max-w-2xl text-balance text-lg text-ink-muted">
          {translate(
            locale,
            "Una guía clara para entender la idea, elegir tu comunidad y participar con información útil, desde tu ciudad hasta la Tierra.",
          )}
        </p>
        <div class="mt-7 flex flex-wrap justify-center gap-3">
          {/* A quien ya ingresó no se le ofrece crear una cuenta. */}
          {signedIn ? (
            <ButtonLink href="/inicio" size="lg" class="w-full sm:w-auto">
              {translate(locale, "Ir a mi inicio")}
            </ButtonLink>
          ) : (
            <ButtonLink href="/registro" size="lg" class="w-full sm:w-auto">
              {translate(locale, "Crear una cuenta")}
            </ButtonLink>
          )}
          <ButtonLink
            href="/explorar"
            variant="secondary"
            size="lg"
            class="w-full sm:w-auto"
          >
            {translate(locale, "Explorar comunidades")}
          </ButtonLink>
        </div>
      </header>

      <div class="mt-10 lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <ManualNav />

        <div class="min-w-0">
          <section
            id="idea"
            class={cx("py-10 lg:pt-0", ANCHOR_OFFSET)}
            aria-labelledby="idea-title"
          >
            <div class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p class="text-sm font-semibold text-brand">
                  {translate(locale, "La idea central")}
                </p>
                <h2
                  id="idea-title"
                  class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
                >
                  {translate(
                    locale,
                    "Un lugar de participación para cada escala",
                  )}
                </h2>
                <div class="mt-4 max-w-2xl space-y-4 leading-relaxed text-ink-muted">
                  <p>
                    {translate(
                      locale,
                      "Agorbis organiza la conversación pública con una estructura que ya conocemos: el lugar donde vivimos. Una persona pertenece a varias comunidades al mismo tiempo y cada problema encuentra la escala donde tiene sentido tratarlo.",
                    )}
                  </p>
                  <p>
                    {translate(
                      locale,
                      "Si vivís en Mar del Plata, por ejemplo, también formás parte de General Pueyrredón, Buenos Aires, Argentina, América del Sur y la Tierra. Podés participar en las seis sin crear grupos separados ni demostrar la misma residencia una y otra vez.",
                    )}
                  </p>
                </div>
              </div>

              <Card class="p-5 sm:p-6">
                <p class="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {translate(locale, "Ejemplo de pertenencia")}
                </p>
                <ol
                  class="mt-4 space-y-2"
                  aria-label={translate(
                    locale,
                    "Cadena geográfica de Mar del Plata",
                  )}
                >
                  {MANUAL_EXAMPLE_CHAIN.map((place, index) => (
                    <li key={place} class="flex items-center gap-3">
                      <span class="grid size-7 place-items-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 dark:bg-brand-900/60 dark:text-brand-200">
                        {index + 1}
                      </span>
                      <span class="font-medium text-ink-strong">
                        {translate(locale, place)}
                      </span>
                    </li>
                  ))}
                </ol>
                <p class="mt-5 rounded-2xl bg-muted p-3 text-sm text-ink-muted">
                  {translate(
                    locale,
                    "Las demás comunidades son públicas: podés explorarlas y seguirlas, aunque la participación queda reservada a quienes viven allí.",
                  )}
                </p>
              </Card>
            </div>
          </section>

          <section
            id="amor-civico"
            class={cx("py-10", ANCHOR_OFFSET)}
            aria-labelledby="civic-love-title"
          >
            <div class="rounded-3xl border border-brand-200 bg-brand-50 p-6 sm:p-9 dark:border-brand-800 dark:bg-brand-950/50">
              <p class="text-sm font-semibold text-brand">
                {translate(locale, "El espíritu de Agorbis")}
              </p>
              <h2
                id="civic-love-title"
                class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                {translate(locale, "Amor cívico: cuidar lo que compartimos")}
              </h2>
              {/* En escritorio la frase destacada va al costado del texto: con
                  el texto limitado a su ancho de lectura, la tarjeta dejaba el
                  40 % derecho vacío. */}
              <div class="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center lg:gap-10">
                <div class="mt-4 max-w-3xl space-y-4 leading-relaxed text-ink-muted">
                  <p>
                    {translate(
                      locale,
                      "Amor cívico es sentir que la comunidad también es tuya: que el bienestar de personas que quizá no conocés importa y que podés aportar, aunque sea de manera pequeña, a construirla.",
                    )}
                  </p>
                  <p>
                    {translate(
                      locale,
                      "No es obedecer a un gobierno ni pensar que tu país siempre tiene razón. Informarse, pedir explicaciones, señalar un problema o proponer una mejora también pueden ser formas de compromiso con lo común.",
                    )}
                  </p>
                  <p>
                    {translate(
                      locale,
                      "Tampoco exige pensar igual. En una comunidad democrática, podés creer que una solución está equivocada sin convertir a quien la propone en un enemigo. Agorbis busca ampliar el “nosotros” y hacer lugar para desacuerdos honestos, con contexto, respeto y ganas de mejorar.",
                    )}
                  </p>
                </div>
                <p class="mt-6 border-l-2 border-brand-500 pl-4 text-base font-medium text-ink-strong lg:mt-4 lg:text-xl lg:leading-snug">
                  {translate(
                    locale,
                    "Lo común también es un poco tuyo: participar es una forma de cuidarlo.",
                  )}
                </p>
              </div>
            </div>
          </section>

          <section
            id="primeros-pasos"
            class={cx("py-10", ANCHOR_OFFSET)}
            aria-labelledby="steps-title"
          >
            <p class="text-sm font-semibold text-brand">
              {translate(locale, "Empezar lleva pocos minutos")}
            </p>
            <h2
              id="steps-title"
              class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {translate(locale, "Tus primeros pasos")}
            </h2>
            <ol class="mt-7 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              {MANUAL_FIRST_STEPS.map((step) => (
                <li key={step.number}>
                  <Card class="h-full p-5">
                    <span class="text-xs font-semibold tabular-nums text-brand">
                      {step.number}
                    </span>
                    <h3 class="mt-3 text-base font-semibold">
                      {translate(locale, step.title)}
                    </h3>
                    <p class="mt-2 text-sm leading-relaxed text-ink-muted">
                      {translate(locale, step.body)}
                    </p>
                  </Card>
                </li>
              ))}
            </ol>
            <p class="mt-4 text-sm text-ink-muted">
              <a
                href="#registro-paso-a-paso"
                class="inline-flex min-h-11 items-center font-medium text-brand hover:underline"
              >
                {translate(locale, "¿Cómo es el registro, paso a paso?")}
              </a>
            </p>
          </section>

          <section
            id="herramientas"
            class={cx("py-10", ANCHOR_OFFSET)}
            aria-labelledby="tools-title"
          >
            <p class="text-sm font-semibold text-brand">
              {translate(locale, "Cinco formas de participar")}
            </p>
            <h2
              id="tools-title"
              class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {translate(
                locale,
                "Elegí la herramienta según lo que querés lograr",
              )}
            </h2>
            <div class="mt-7 grid gap-4 md:grid-cols-2">
              {MANUAL_TOOLS.map((tool, index) => (
                <Card
                  key={tool.title}
                  // Son cinco: la última ocupa la fila entera en vez de dejar
                  // un hueco a su derecha.
                  class={cx(
                    "p-5 sm:p-6",
                    index === MANUAL_TOOLS.length - 1 &&
                      MANUAL_TOOLS.length % 2 === 1 &&
                      "md:col-span-2",
                  )}
                >
                  <div class="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      class="grid size-11 shrink-0 place-items-center rounded-2xl bg-muted text-xl"
                    >
                      {tool.emoji}
                    </span>
                    <div>
                      <h3 class="text-lg font-semibold">
                        {translate(locale, tool.title)}
                      </h3>
                      <p class="text-sm font-medium text-brand">
                        {translate(locale, tool.purpose)}
                      </p>
                    </div>
                  </div>
                  <p class="mt-4 text-sm leading-relaxed text-ink-muted">
                    {translate(locale, tool.detail)}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          <section
            id="seguimiento"
            class={cx("py-10", ANCHOR_OFFSET)}
            aria-labelledby="tracking-title"
          >
            <p class="text-sm font-semibold text-brand">
              {translate(locale, "Del tema a los resultados")}
            </p>
            <h2
              id="tracking-title"
              class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {translate(locale, "La participación no termina al publicar")}
            </h2>
            <div class="mt-7 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              {MANUAL_TRACKING.map((card) => (
                <Card key={card.title} class="flex flex-col p-5">
                  <span aria-hidden="true" class="text-xl">
                    {card.emoji}
                  </span>
                  <h3 class="mt-3 font-semibold">
                    {translate(locale, card.title)}
                  </h3>
                  <p class="mt-2 text-sm leading-relaxed text-ink-muted">
                    {translate(locale, card.body)}
                  </p>
                  {card.link && (
                    <p class="mt-auto pt-2">
                      <CardLink link={card.link} locale={locale} />
                    </p>
                  )}
                </Card>
              ))}
            </div>
          </section>

          <section
            id="difundir"
            class={cx("py-10", ANCHOR_OFFSET)}
            aria-labelledby="outreach-title"
          >
            <p class="text-sm font-semibold text-brand">
              {translate(locale, "Fuera de la pantalla")}
            </p>
            <h2
              id="outreach-title"
              class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {translate(locale, "Imprimir, compartir y seguir resultados")}
            </h2>
            <p class="mt-4 max-w-3xl leading-relaxed text-ink-muted">
              {translate(
                locale,
                "Estas herramientas usan sólo lo que ya está publicado en Agorbis. Ayudan a difundir un tema y a ver cómo avanza, pero no hacen trámites por vos.",
              )}
            </p>
            <div class="mt-7 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {MANUAL_OUTREACH.map((tool) => (
                <Card key={tool.title} class="p-5">
                  <span aria-hidden="true" class="text-xl">
                    {tool.emoji}
                  </span>
                  <h3 class="mt-3 font-semibold">
                    {translate(locale, tool.title)}
                  </h3>
                  <p class="mt-2 text-sm leading-relaxed text-ink-muted">
                    {translate(locale, tool.body)}
                  </p>
                </Card>
              ))}
            </div>
          </section>

          <section
            id="publicar"
            class={cx("py-10", ANCHOR_OFFSET)}
            aria-labelledby="publish-title"
          >
            <div class="rounded-3xl bg-brand-950 p-6 text-white shadow-lift sm:p-9 dark:bg-brand-900">
              <p class="text-sm font-semibold text-brand-200">
                {translate(locale, "Antes de publicar")}
              </p>
              <h2
                id="publish-title"
                class="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl"
              >
                {translate(locale, "Una buena publicación ayuda a actuar")}
              </h2>
              <div class="mt-7 grid gap-5 sm:grid-cols-2">
                {MANUAL_GOOD_POSTS.map((item) => (
                  <div
                    key={item.title}
                    class="border-l-2 border-brand-400 pl-4"
                  >
                    <h3 class="font-semibold text-white">
                      {translate(locale, item.title)}
                    </h3>
                    <p class="mt-1 text-sm leading-relaxed text-brand-100/80">
                      {translate(locale, item.body)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section
            id="reglas"
            class={cx("py-10", ANCHOR_OFFSET)}
            aria-labelledby="rules-title"
          >
            <p class="text-sm font-semibold text-brand">
              {translate(locale, "Confianza y convivencia")}
            </p>
            <h2
              id="rules-title"
              class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {translate(locale, "Reglas simples, aplicadas desde el diseño")}
            </h2>
            <div class="mt-7 grid gap-4 md:grid-cols-3">
              {MANUAL_RULES.map((rule) => (
                <Card key={rule.title} class="flex flex-col p-5">
                  <span aria-hidden="true" class="text-xl">
                    {rule.emoji}
                  </span>
                  <h3 class="mt-3 font-semibold">
                    {translate(locale, rule.title)}
                  </h3>
                  <p class="mt-2 text-sm leading-relaxed text-ink-muted">
                    {translate(locale, rule.body)}
                  </p>
                  {rule.links.length > 0 && (
                    <ul class="mt-auto pt-2">
                      {rule.links.map((link) => (
                        <li key={link.href}>
                          <CardLink link={link} locale={locale} />
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </section>

          <ManualFaq />

          <section class="mt-10 rounded-3xl border border-brand-200 bg-brand-50 p-7 text-center dark:border-brand-800 dark:bg-brand-950/50">
            <h2 class="text-2xl font-semibold tracking-tight">
              {translate(locale, "La mejor forma de entenderlo es probarlo")}
            </h2>
            <p class="mx-auto mt-2 max-w-xl text-ink-muted">
              {translate(
                locale,
                "Explorá una comunidad, mirá qué temas se están tratando y sumate cuando encuentres tu lugar.",
              )}
            </p>
            <div class="mt-6 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/explorar" class="w-full sm:w-auto">
                {translate(locale, "Explorar comunidades")}
              </ButtonLink>
              <Link
                href="/"
                class="inline-flex min-h-11 w-full items-center justify-center rounded-xl px-3 text-sm font-medium text-brand hover:bg-brand-100/60 hover:underline sm:w-auto dark:hover:bg-brand-900/50"
              >
                {translate(locale, "Volver al inicio")}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = ({ resolveValue, url }) => {
  const locale = resolveValue(useLocaleLoader);
  const title = translate(locale, "Cómo funciona Agorbis");
  const description = translate(
    locale,
    "Manual de Agorbis: qué es, cómo elegir tu comunidad y cómo participar con encuestas, debates, reclamos, proyectos y acuerdos. {{description}}",
    {
      description: translate(locale, APP_DESCRIPTION),
    },
  );
  return {
    title: `${translate(locale, "Cómo funciona")} · ${APP_NAME}`,
    meta: [
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: `${url.origin}/manual/` },
    ],
    // Datos estructurados de las preguntas esenciales, que son las que están
    // en la página tal cual. Es un bloque de datos, no código: el navegador no
    // lo ejecuta y la CSP con nonce (D64) no cambia.
    scripts: [
      {
        props: { type: "application/ld+json" },
        script: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: MANUAL_ESSENTIAL_FAQ.map((item) => ({
            "@type": "Question",
            name: translate(locale, item.question),
            acceptedAnswer: {
              "@type": "Answer",
              text: item.answer
                .map((paragraph) => translate(locale, paragraph))
                .join(" "),
            },
          })),
        }).replace(/</g, "\\u003c"),
      },
    ],
  };
};
