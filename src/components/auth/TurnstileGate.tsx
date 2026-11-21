import {
  $,
  component$,
  isBrowser,
  type QRL,
  useSignal,
  useTask$,
  useVisibleTask$,
} from "@qwik.dev/core";
import { translate, useLocale } from "~/lib/i18n";
import type { TurnstileAction } from "~/lib/turnstile";

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "auto";
      size: "compact" | "flexible";
      responseField: false;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      "timeout-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
    agorbisTurnstileLoader?: Promise<TurnstileApi>;
  }
}

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (window.agorbisTurnstileLoader) return window.agorbisTurnstileLoader;

  window.agorbisTurnstileLoader = new Promise<TurnstileApi>(
    (resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        "script[data-agorbis-turnstile]",
      );
      const script = existing ?? document.createElement("script");
      const timeout = window.setTimeout(() => {
        delete window.agorbisTurnstileLoader;
        reject(new Error("Turnstile no respondió a tiempo."));
      }, 15_000);
      const loaded = () => {
        window.clearTimeout(timeout);
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error("Turnstile no quedó disponible."));
      };
      const failed = () => {
        window.clearTimeout(timeout);
        // Sin guardar el rechazo: el próximo gate vuelve a intentar.
        delete window.agorbisTurnstileLoader;
        reject(new Error("No se pudo cargar Turnstile."));
      };

      script.addEventListener("load", loaded, { once: true });
      script.addEventListener("error", failed, { once: true });
      if (!existing) {
        script.src =
          "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.agorbisTurnstile = "";
        const nonce =
          document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
        if (nonce) script.nonce = nonce;
        document.head.appendChild(script);
      }
    },
  );
  return window.agorbisTurnstileLoader;
}

/**
 * Estado de la verificación que el formulario puede mirar para no mandar
 * antes de tiempo. `ssr` es el valor inicial: sin JavaScript el botón queda
 * habilitado y la base rechaza; `waiting` dura desde que el widget empieza a
 * cargar hasta que entrega el token; `failed` deja el botón habilitado para
 * que el servidor diga qué pasó.
 */
export type TurnstileGateState = "ssr" | "waiting" | "ready" | "failed";

/** Cuánto se espera un token antes de dar el widget por caído. */
const WAITING_TIMEOUT_MS = 25_000;

/**
 * Objeto compartido con el formulario (`useStore`): una señal pasada como
 * prop llega desenvuelta a su valor, un store llega entero y sus cambios se
 * propagan.
 */
export interface TurnstileGateHandle {
  status: TurnstileGateState;
}

export const TurnstileGate = component$<{
  action: TurnstileAction;
  submitting: boolean;
  /** Avisa cuando hay un token nuevo, p. ej. para borrar un rechazo viejo. */
  onVerified$?: QRL<() => void>;
  /**
   * Señal del formulario: mientras vale `waiting`, el botón de envío se
   * deshabilita. Tocar "Ingresar" antes del token devolvía un 403 y, por la
   * recarga de documento, borraba la contraseña escrita.
   */
  state?: TurnstileGateHandle;
}>((props) => {
  const locale = useLocale();
  const container = useSignal<HTMLElement>();
  const tokenInput = useSignal<HTMLInputElement>();
  const widgetId = useSignal("");
  const failed = useSignal(false);
  const submitted = useSignal(false);
  // Vigilante de la espera: si el widget carga pero nunca responde (ni token
  // ni error), el botón no puede quedar muerto; pasa a `failed`, se habilita
  // y el servidor explica.
  const watchdog = useSignal<number | null>(null);
  const setGate = $((next: TurnstileGateState) => {
    if (!props.state) return;
    props.state.status = next;
    if (watchdog.value !== null) {
      clearTimeout(watchdog.value);
      watchdog.value = null;
    }
    if (next === "waiting") {
      failed.value = false;
      // Temporizadores globales, no de `window`: en el navegador son los
      // mismos y así el gate no exige una ventana para esperar.
      // En el navegador el id es un número; el tipo de Node es un objeto que
      // el store no podría serializar.
      watchdog.value = setTimeout(() => {
        if (props.state?.status !== "waiting") return;
        failed.value = true;
        props.state.status = "failed";
      }, WAITING_TIMEOUT_MS) as unknown as number;
    }
  });

  // El SDK depende del DOM y debe cargarse sólo cuando este formulario Auth
  // está visible; no puede ejecutarse durante SSR ni quedar global en el sitio.
  // "document-ready" y no la estrategia por defecto (intersección): en
  // registro el gate queda al final de un formulario largo y, sin scroll,
  // nunca se armaba; un Enter arriba mandaba con estado `ssr` y sin token.
  // eslint-disable-next-line qwik/no-use-visible-task -- el SDK de Turnstile necesita el DOM y se carga sólo con el formulario a la vista
  useVisibleTask$(
    async ({ cleanup }) => {
      let disposed = false;
      let activeApi: TurnstileApi | undefined;
      let resizeObserver: ResizeObserver | undefined;
      let currentSize: "compact" | "flexible" | undefined;
      let generation = 0;
      const setState = (next: TurnstileGateState) => void setGate(next);
      setState("waiting");
      cleanup(() => {
        disposed = true;
        resizeObserver?.disconnect();
        if (widgetId.value && activeApi) activeApi.remove(widgetId.value);
        // Al cambiar de modo (contraseña ↔ enlace) el gate se desmonta: el
        // store no puede quedar en `ready` para un gate nuevo sin token.
        setState("ssr");
      });
      try {
        const turnstile = await loadTurnstile();
        if (disposed || !container.value) return;
        activeApi = turnstile;
        const render = () => {
          const element = container.value;
          if (disposed || !element || element.clientWidth === 0) return;
          // Flexible conserva un mínimo de 300px; compact cabe en formularios
          // angostos sin recortar ni reducir los controles de la verificación.
          const size = element.clientWidth < 300 ? "compact" : "flexible";
          if (size === currentSize) return;
          currentSize = size;
          const renderedGeneration = ++generation;
          if (widgetId.value) turnstile.remove(widgetId.value);
          if (tokenInput.value) tokenInput.value.value = "";
          // Un re-render (cambio de ancho) pide token nuevo: hasta que llegue
          // se espera, y si el SDK no puede dibujar se dice.
          setState("waiting");
          try {
            widgetId.value = turnstile.render(element, {
              sitekey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY,
              action: props.action,
              theme: "auto",
              size,
              responseField: false,
              callback: (token) => {
                if (disposed || renderedGeneration !== generation) return;
                if (tokenInput.value) tokenInput.value.value = token;
                failed.value = false;
                setState("ready");
                void props.onVerified$?.();
              },
              "expired-callback": () => {
                if (disposed || renderedGeneration !== generation) return;
                if (tokenInput.value) tokenInput.value.value = "";
                // Turnstile renueva el token solo: no es un fallo y el botón
                // espera, en vez de habilitarse y mandar vacío.
                setState("waiting");
              },
              "error-callback": () => {
                if (disposed || renderedGeneration !== generation) return;
                if (tokenInput.value) tokenInput.value.value = "";
                failed.value = true;
                setState("failed");
              },
              "timeout-callback": () => {
                if (disposed || renderedGeneration !== generation) return;
                if (tokenInput.value) tokenInput.value.value = "";
                failed.value = true;
                setState("failed");
              },
            });
          } catch {
            failed.value = true;
            setState("failed");
          }
        };
        render();
        resizeObserver = new ResizeObserver(render);
        resizeObserver.observe(container.value);
      } catch {
        if (!disposed) {
          failed.value = true;
          setState("failed");
        }
      }
    },
    { strategy: "document-ready" },
  );

  useTask$(({ track }) => {
    const running = track(() => props.submitting);
    if (!isBrowser) return;
    if (running) {
      submitted.value = true;
      return;
    }
    if (!submitted.value) return;
    submitted.value = false;
    if (tokenInput.value) tokenInput.value.value = "";
    if (widgetId.value && window.turnstile) {
      // El reinicio pide un token nuevo: hasta que llegue, el botón espera;
      // si el SDK no puede reiniciar, no se queda esperando para siempre.
      void setGate("waiting");
      try {
        window.turnstile.reset(widgetId.value);
      } catch {
        failed.value = true;
        void setGate("failed");
      }
    }
  });

  return (
    <div class="space-y-2">
      <input ref={tokenInput} type="hidden" name="turnstile_token" value="" />
      {/* Sin alto reservado: en Producción el widget A es invisible (D109) y
          un hueco de 65px quedaría en blanco. */}
      <div
        ref={container}
        role="group"
        aria-label={translate(locale, "Verificación antiabuso")}
      />
      {/* Región viva siempre presente: una que aparece ya con texto no se
          anuncia de forma fiable. El texto sólo existe mientras se espera. */}
      <p
        role="status"
        aria-live="polite"
        class="text-xs text-ink-muted empty:hidden"
      >
        {props.state?.status === "waiting" &&
          translate(locale, "Verificando que sos una persona antes de enviar…")}
      </p>
      {failed.value && (
        <p role="alert" class="text-sm text-danger">
          {translate(
            locale,
            "No pudimos cargar la verificación antiabuso. Revisá tu conexión y probá de nuevo.",
          )}
        </p>
      )}
    </div>
  );
});
