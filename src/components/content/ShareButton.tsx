import { $, component$, useId, useSignal, useTask$ } from "@qwik.dev/core";
import {
  Button,
  Icon,
  cx,
  showToast,
  triggerHapticFeedback,
} from "~/components/ui";
import { useLocale, translate, DEFAULT_LOCALE, type Locale } from "~/lib/i18n";
import {
  openShareWindow,
  shareOnWhatsApp,
  telegramShareUrl,
} from "~/lib/share";

type ShareState = "idle" | "copied" | "failed";

export interface ShareButtonProps {
  title: string;
  text?: string;
  url?: string;
  kind?: "claim" | "poll" | "debate" | "project" | "generic";
  isResolved?: boolean;
  communityName?: string;
  /**
   * Sólo el botón principal (hoja del sistema o copia del enlace). En una
   * barra fija, WhatsApp y Telegram empujaban la acción de la página fuera
   * de la línea; siguen disponibles en el cuerpo de la publicación.
   */
  compact?: boolean;
  class?: string;
}

export function formatShareMessage(
  title: string,
  customText?: string,
  kind?: string,
  isResolved?: boolean,
  communityName?: string,
  url?: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (customText) {
    return url ? `${customText}\n\n${url}` : customText;
  }
  const prefix = communityName
    ? translate(locale, " en {{community}}", { community: communityName })
    : "";
  const linkText = url ? ` ${url}` : "";
  const params = { title, place: prefix, link: linkText };

  if (kind === "claim") {
    if (isResolved) {
      return translate(
        locale,
        '🏆 ¡Victoria vecinal{{place}}! Se resolvió el reclamo: "{{title}}". Mirá la solución acá:{{link}}',
        params,
      );
    }
    return translate(
      locale,
      '📣 Vecinos{{place}}: necesitamos su apoyo en este reclamo: "{{title}}". Sumá tu apoyo acá:{{link}}',
      params,
    );
  }
  if (kind === "poll") {
    return translate(
      locale,
      '🗳️ Consulta comunitaria{{place}}: "{{title}}". Participá y votá acá:{{link}}',
      params,
    );
  }
  if (kind === "project") {
    return translate(
      locale,
      '🛠️ Proyecto vecinal{{place}}: "{{title}}". Mirá el avance y sumate acá:{{link}}',
      params,
    );
  }
  return linkText
    ? translate(locale, '📢 "{{title}}"{{place}}. Miralo acá:{{link}}', params)
    : translate(locale, '📢 "{{title}}"{{place}}.', params);
}

export const ShareButton = component$<ShareButtonProps>((props) => {
  const {
    title,
    text,
    url,
    kind = "generic",
    isResolved = false,
    communityName,
    class: className,
  } = props;
  const state = useSignal<ShareState>("idle");
  const nativeFailed = useSignal(false);
  const manualUrl = useSignal("");
  const manualInput = useSignal<HTMLInputElement>();
  const instanceId = useId();
  const manualId = `share-manual-${instanceId}`;
  const locale = useLocale();
  /**
   * El temporizador que devuelve el botón a "Compartir". Se guarda para poder
   * cancelarlo: al tocar dos veces seguidas, el timer del primer click volvía
   * a "Compartir" mientras el segundo recién empezaba a mostrar "Enlace
   * copiado", así que el aviso duraba un parpadeo o desaparecía antes de
   * leerse.
   */
  const resetTimer = useSignal(0);
  useTask$(({ track, cleanup }) => {
    track(() => props.url);
    state.value = "idle";
    nativeFailed.value = false;
    manualUrl.value = "";
    cleanup(() => {
      if (typeof window !== "undefined") window.clearTimeout(resetTimer.value);
    });
  });

  const copyLink = $(async (shareUrl: string) => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      state.value = "copied";
      manualUrl.value = "";
      nativeFailed.value = false;
      triggerHapticFeedback("success");
      showToast(translate(locale, "Enlace copiado al portapapeles"), "success");
    } catch {
      state.value = "failed";
      manualUrl.value = shareUrl;
      triggerHapticFeedback("warning");
      showToast(translate(locale, "No se pudo copiar el enlace"), "danger");
    }
    window.clearTimeout(resetTimer.value);
    if (state.value === "copied")
      resetTimer.value = window.setTimeout(() => (state.value = "idle"), 2400);
  });

  const shareNative = $(async () => {
    const shareUrl = url
      ? new URL(url, window.location.origin).href
      : window.location.href;
    const shareText = formatShareMessage(
      title,
      text,
      kind,
      isResolved,
      communityName,
      shareUrl,
      locale,
    );
    const data = { title, text: shareText, url: shareUrl };

    if (navigator.share) {
      nativeFailed.value = false;
      state.value = "idle";
      try {
        await navigator.share(data);
        manualUrl.value = "";
        triggerHapticFeedback("success");
        showToast(translate(locale, "¡Gracias por compartir!"), "success");
        return;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "name" in error &&
          error.name === "AbortError"
        )
          return;
        nativeFailed.value = true;
        triggerHapticFeedback("warning");
        showToast(
          translate(
            locale,
            "No pudimos compartir. Podés volver a intentarlo o copiar el enlace.",
          ),
          "danger",
        );
        return;
      }
    }

    await copyLink(shareUrl);
  });

  const shareWhatsApp = $(() => {
    triggerHapticFeedback("selection");
    const shareUrl = url
      ? new URL(url, window.location.origin).href
      : window.location.href;
    const shareText = formatShareMessage(
      title,
      text,
      kind,
      isResolved,
      communityName,
      shareUrl,
      locale,
    );
    shareOnWhatsApp(shareText);
  });

  const shareTelegram = $(() => {
    triggerHapticFeedback("selection");
    const shareUrl = url
      ? new URL(url, window.location.origin).href
      : window.location.href;
    const shareText = formatShareMessage(
      title,
      text,
      kind,
      isResolved,
      communityName,
      shareUrl,
      locale,
    );
    openShareWindow(telegramShareUrl(shareUrl, shareText));
  });

  const label = {
    idle: "Compartir",
    copied: "¡Enlace copiado!",
    failed: "No se pudo copiar",
  }[state.value];
  const currentUrl = $(() =>
    url ? new URL(url, window.location.origin).href : window.location.href,
  );

  return (
    <div
      data-share-group
      class={cx("inline-flex flex-wrap items-center gap-2", className)}
    >
      {/* Un solo "Compartir" (D124): la hoja del sistema o la copia del
          enlace al tocar, y las otras formas detrás de un desplegable que
          funciona sin JavaScript. Antes WhatsApp y Telegram eran dos botones
          más, del mismo peso que la acción de la página. */}
      <div class="inline-flex items-stretch">
        <Button
          type="button"
          variant={state.value === "copied" ? "success" : "secondary"}
          size="sm"
          onClick$={shareNative}
          class={cx(
            "transition-all duration-200 touch-manipulation",
            !props.compact && "rounded-r-none border-r-0",
            state.value === "copied" && "animate-scale-pop font-bold",
          )}
        >
          <Icon
            name={
              state.value === "failed"
                ? "alert"
                : state.value === "copied"
                  ? "check"
                  : "share"
            }
            class="text-base"
          />
          {translate(locale, label)}
        </Button>
        {!props.compact && (
          <details class="group relative">
            <summary
              data-share-more
              class="flex h-full min-h-[44px] cursor-pointer list-none items-center rounded-r-xl border border-control bg-surface px-2 text-ink-muted transition-colors hover:border-brand-500 hover:bg-muted [&::-webkit-details-marker]:hidden"
              aria-label={translate(locale, "Más formas de compartir")}
            >
              <Icon
                name="chevron-down"
                class="text-sm transition-transform group-open:rotate-180"
              />
            </summary>
            <ul class="animate-scale-pop absolute left-0 top-full z-40 mt-1.5 w-56 rounded-xl border border-subtle bg-surface p-1.5 shadow-lift">
              <li>
                <button
                  type="button"
                  onClick$={shareWhatsApp}
                  class="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-ink hover:bg-muted"
                  title={translate(
                    locale,
                    "Compartir directamente por WhatsApp",
                  )}
                >
                  <Icon name="chat" class="text-base text-success" />
                  <span>{translate(locale, "WhatsApp")}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick$={shareTelegram}
                  class="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-ink hover:bg-muted"
                  title={translate(locale, "Compartir por Telegram")}
                >
                  <Icon name="send" class="text-base text-kind-poll-text" />
                  <span>{translate(locale, "Telegram")}</span>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick$={async () => copyLink(await currentUrl())}
                  class="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm text-ink hover:bg-muted"
                >
                  <Icon name="link" class="text-base text-ink-muted" />
                  <span>{translate(locale, "Copiar enlace")}</span>
                </button>
              </li>
            </ul>
          </details>
        )}
      </div>
      {nativeFailed.value && (
        <div class="flex w-full flex-wrap items-center gap-2 text-sm text-danger">
          <p role="alert">
            {translate(
              locale,
              "No pudimos compartir. Podés volver a intentarlo o copiar el enlace.",
            )}
          </p>
          <button
            type="button"
            class="inline-flex min-h-11 items-center rounded-lg border border-control px-3 text-sm font-medium text-brand hover:bg-muted"
            onClick$={() =>
              copyLink(
                url
                  ? new URL(url, window.location.origin).href
                  : window.location.href,
              )
            }
          >
            {translate(locale, "Copiar enlace")}
          </button>
        </div>
      )}
      {manualUrl.value &&
        (!url || new URL(url, manualUrl.value).href === manualUrl.value) && (
          <div class="w-full space-y-2 rounded-xl border border-subtle bg-surface p-3 text-sm">
            <p role="alert" id={`${manualId}-hint`}>
              {translate(
                locale,
                "No pudimos copiar el enlace. Podés seleccionarlo y copiarlo manualmente.",
              )}
            </p>
            <label for={manualId} class="block font-medium">
              {translate(locale, "Enlace para compartir")}
            </label>
            <input
              id={manualId}
              ref={manualInput}
              type="text"
              readOnly
              value={manualUrl.value}
              aria-describedby={`${manualId}-hint`}
              class="block min-h-11 w-full rounded-lg border border-control bg-surface px-3 text-sm focus:outline-2 focus:outline-brand-500"
            />
            <button
              type="button"
              onClick$={() => {
                manualInput.value?.focus();
                manualInput.value?.select();
              }}
              class="inline-flex min-h-11 items-center rounded-lg border border-control px-3 font-semibold text-brand"
            >
              {translate(locale, "Seleccionar enlace")}
            </button>
          </div>
        )}
      {/* El cambio de texto dentro del botón no se anuncia por sí solo: el
            foco sigue en el botón y su nombre accesible cambia sin evento. Este
            `status` sí se lee, y en el fallo da la salida alternativa. */}
      <span role="status" aria-live="polite" class="sr-only">
        {state.value === "copied" &&
          translate(locale, "Enlace copiado al portapapeles")}
      </span>
    </div>
  );
});
