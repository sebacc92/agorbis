/**
 * Enlaces para compartir por WhatsApp y Telegram.
 *
 * Había una docena de componentes armando la URL a mano, con dos dominios
 * distintos para WhatsApp (`wa.me` y `api.whatsapp.com`) y el mismo bloque
 * "si hay `navigator.share` usalo, si no abrí WhatsApp" copiado en cuatro
 * lugares. Acá queda una sola forma, probada.
 *
 * Son siempre navegaciones que inicia la persona (un enlace o un clic): no se
 * carga nada de esos servicios por adelantado ni se les manda nada que la
 * persona no vea en el mensaje.
 */

/**
 * `encodeURIComponent` tira `URIError` ante un surrogate suelto, y eso pasa
 * con títulos de usuario cortados con `slice` justo en medio de un emoji. Un
 * botón de compartir que tira no hace nada; mejor reemplazar el pedazo roto
 * por el carácter de reemplazo y compartir igual.
 *
 * Se recorre a mano y no con una regex: la versión anterior usaba un
 * lookbehind (`(?<!…)`), que Safari recién entiende desde 16.4. En 16.0–16.3
 * es un `SyntaxError` al parsear, así que no fallaba el botón sino el chunk
 * entero —y la comunidad lo usa durante el render—. El target por defecto de
 * Vite incluye safari16 y el bundler no puede bajar un lookbehind.
 */
export function replaceLoneSurrogates(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        // Par completo: se copian las dos mitades y se saltea la segunda.
        out += value[i] + value[i + 1];
        i++;
      } else {
        out += "\uFFFD";
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // Mitad baja sin su alta delante: el par válido ya se consumió arriba.
      out += "\uFFFD";
    } else {
      out += value[i];
    }
  }
  return out;
}

export function encodeShareComponent(value: string): string {
  return encodeURIComponent(replaceLoneSurrogates(value));
}

/**
 * Une el texto y el enlace en un solo mensaje. Si el texto ya trae el enlace
 * (muchas traducciones lo interpolan con `{{url}}`) no se lo repite.
 */
export function composeShareMessage(text: string, url?: string | null): string {
  const cleanText = text.trim();
  const cleanUrl = url?.trim() ?? "";
  if (!cleanUrl || cleanText.includes(cleanUrl)) return cleanText;
  return cleanText ? `${cleanText} ${cleanUrl}` : cleanUrl;
}

/**
 * Enlace de WhatsApp con el mensaje prellenado. `api.whatsapp.com/send` abre
 * la app en el teléfono y WhatsApp Web en la computadora, sin elegir contacto.
 */
export function whatsAppShareUrl(text: string, url?: string | null): string {
  return `https://api.whatsapp.com/send?text=${encodeShareComponent(
    composeShareMessage(text, url),
  )}`;
}

/**
 * Enlace de Telegram. Telegram muestra `url` como vista previa y `text` como
 * mensaje, así que van por separado; `text` es opcional.
 */
export function telegramShareUrl(url: string, text?: string | null): string {
  const base = `https://t.me/share/url?url=${encodeShareComponent(url)}`;
  const message = text?.trim();
  return message ? `${base}&text=${encodeShareComponent(message)}` : base;
}

/** URL de la página actual, o vacío en el SSR. */
export function currentPageUrl(): string {
  return typeof window !== "undefined" ? window.location.href : "";
}

/**
 * Abre un enlace para compartir en otra pestaña, sin `opener` ni `referrer`:
 * el servicio no tiene por qué saber desde qué página de Agorbis vino.
 */
export function openShareWindow(href: string): void {
  if (typeof window === "undefined") return;
  window.open(href, "_blank", "noopener,noreferrer");
}

/** Abre WhatsApp con el mensaje prellenado. */
export function shareOnWhatsApp(text: string, url?: string | null): void {
  openShareWindow(whatsAppShareUrl(text, url));
}

export type ShareChannel = "native" | "whatsapp" | "none";

/**
 * Usa la hoja de compartir del sistema si existe (móvil, sobre todo) y si no,
 * WhatsApp. Devuelve qué camino tomó para que quien llama decida si avisa:
 * la hoja nativa ya da su propia respuesta, WhatsApp abre otra pestaña.
 *
 * Que la persona cierre la hoja nativa sin compartir rechaza la promesa; no
 * es un error y no se informa.
 */
export function shareNativeOrWhatsApp(payload: {
  title?: string;
  text: string;
  url?: string;
}): ShareChannel {
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function"
  ) {
    navigator
      .share({ title: payload.title, text: payload.text, url: payload.url })
      .catch(() => {});
    return "native";
  }
  if (typeof window === "undefined") return "none";
  shareOnWhatsApp(payload.text, payload.url);
  return "whatsapp";
}
