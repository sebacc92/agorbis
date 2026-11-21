import type { DocumentMeta } from "@qwik.dev/router";
import { APP_NAME } from "~/lib/constants";
import { summarizeText } from "~/lib/text";

/**
 * Etiquetas de la imagen que se ve al compartir un enlace.
 *
 * Estaban copiadas en las cuatro páginas de contenido —encuesta, debate,
 * reclamo, proyecto— con el mismo comentario de seis líneas cada una, y les
 * faltaba lo mismo a las cuatro: sin `og:image:width`/`height`, Facebook y
 * LinkedIn tienen que bajar la imagen y medirla antes de decidir si la
 * muestran grande o como miniatura, y hasta que eso pasa la primera vez que se
 * comparte un enlace la tarjeta sale chica o sin imagen. Sin `og:image:alt`,
 * quien usa lector de pantalla en la red social recibe una tarjeta muda.
 *
 * La portada ya las declaraba a mano; ahora sale del mismo lugar que el resto.
 */
export const SOCIAL_IMAGE_PATH = "/og.png";

/** Las medidas reales de `public/og.png`, que genera `pnpm gen.images`. */
const SOCIAL_IMAGE_WIDTH = "1200";
const SOCIAL_IMAGE_HEIGHT = "630";

/**
 * Por qué la imagen es un PNG estático y no la tarjeta por contenido:
 * `/social/[type]/[id]` devuelve SVG, y Twitter, Facebook, LinkedIn y WhatsApp
 * no lo renderizan —la tarjeta salía vacía—. `og.png` lo genera
 * `scripts/gen-images.mjs` con sharp en el build, porque el Worker no incluye
 * módulos nativos para rasterizar en caliente. Una imagen por
 * publicación exigiría sacar esa ruta del runtime Edge o pre-generarla.
 */
export function socialImageMeta(url: string, alt: string): DocumentMeta[] {
  return [
    { property: "og:image", content: url },
    { property: "og:image:width", content: SOCIAL_IMAGE_WIDTH },
    { property: "og:image:height", content: SOCIAL_IMAGE_HEIGHT },
    { property: "og:image:alt", content: alt },
    { name: "twitter:card", content: "summary_large_image" },
  ];
}

/** Largo de la descripción que muestran las tarjetas antes de cortarla. */
const SHARE_DESCRIPTION_MAX = 300;

/**
 * Descripción de una comunidad al compartirla.
 *
 * La de la base suele ser sólo el partido ("Partido de General Pueyrredón"):
 * en la tarjeta de WhatsApp no decía qué se hace en Agorbis. Se le suma la
 * invitación, y si no hay descripción queda la invitación sola.
 */
export function communityShareDescription(
  description: string | null | undefined,
  invitation: string,
): string {
  const own = (description ?? "").trim().replace(/[.\s]+$/, "");
  return summarizeText(
    own ? `${own}. ${invitation}` : invitation,
    SHARE_DESCRIPTION_MAX,
  );
}

export interface ShareMetaInput {
  title: string;
  description: string;
  /** URL canónica, sin parámetros: si no, cada variante es otra tarjeta. */
  pageUrl: string;
  imageUrl: string;
}

/**
 * Etiquetas completas para compartir una página de comunidad.
 *
 * Es el enlace que arma el kit de difusión para invitar a los vecinos, y salía
 * sin imagen, sin URL y sin tarjeta de Twitter: en WhatsApp se veía como un
 * enlace pelado.
 */
export function communityShareMeta(input: ShareMetaInput): DocumentMeta[] {
  return [
    { name: "description", content: input.description },
    { property: "og:title", content: input.title },
    { property: "og:description", content: input.description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: input.pageUrl },
    { property: "og:site_name", content: APP_NAME },
    ...socialImageMeta(input.imageUrl, input.title),
    { name: "twitter:image", content: input.imageUrl },
    { name: "twitter:title", content: input.title },
    { name: "twitter:description", content: input.description },
  ];
}
