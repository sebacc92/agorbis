import {
  $,
  component$,
  Slot,
  useErrorBoundary,
  useOnWindow,
  useSignal,
  useTask$,
} from "@qwik.dev/core";
import { isServer } from "@qwik.dev/core/build";
import { Link, useLocation } from "@qwik.dev/router";
import {
  cameFromNavigation,
  hasRecovered,
  recoveryDecision,
  RELOAD_TIMEOUT_MS,
  withRecoveredMark,
} from "~/lib/error-recovery";
import { useLocale, translate } from "~/lib/i18n";

/**
 * Como el `ErrorBoundary` del router (mismo `useErrorBoundary`, que el core
 * llena con los errores de render, y el mismo oyente de `qerror`, por donde el
 * cargador avisa de un manejador que lanza o un chunk que no carga), pero se
 * recupera: si el error llegó poco después de un cambio de ruta, recarga la
 * página una sola vez por entrada del historial. La URL ya es la final (la
 * redirección del servidor que provocó el fallo ya se aplicó), así que la
 * recarga sirve la página correcta; mientras tanto se muestra un estado
 * neutro, con un tope: si la recarga no ocurre (un `beforeunload` cancelado,
 * `history` que rechaza la marca), cede al aviso de siempre. Si tras recargar
 * vuelve a fallar, o si el error no vino de una navegación, muestra el aviso.
 * La regla está en `src/lib/error-recovery.ts` (D115); es un rodeo al beta
 * que D75 revisa en cada actualización.
 */
/**
 * El aviso de una ruta que explotó al dibujarse. Vive acá y no llega como
 * `fallback$` desde el layout raíz: esa función era una QRL nueva en cada
 * dibujo del raíz, el límite se redibujaba con ella y, como es quien proyecta
 * la página en el `<main>`, Qwik (beta.40) la quitaba del documento y la volvía
 * a poner en cada navegación. Un nodo que sale y entra pierde el scroll de sus
 * filas, el foco y las animaciones en curso (D75).
 */
const RouteErrorNotice = component$(() => {
  const locale = useLocale();
  return (
    <div class="container-reading py-16 text-center">
      <div class="text-5xl" aria-hidden="true">
        ⚠️
      </div>
      <h1 class="mt-4 text-2xl font-semibold tracking-tight">
        {translate(locale, "Se rompió algo de esta página")}
      </h1>
      <p class="mt-2 text-ink-muted">
        {translate(
          locale,
          "El resto del sitio sigue funcionando. Probá recargar; si vuelve a pasar, contanos qué estabas haciendo.",
        )}
      </p>
      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick$={() => window.location.reload()}
          class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 text-sm font-medium text-white shadow-soft transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.985]"
        >
          <svg
            viewBox="0 0 20 20"
            class="size-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {translate(locale, "Recargar página")}
        </button>
        <Link
          href="/"
          class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-control bg-surface px-5 text-sm font-medium text-ink-strong transition-colors hover:bg-muted"
        >
          {translate(locale, "Volver al inicio")}
        </Link>
      </div>
    </div>
  );
});

export const RecoveringErrorBoundary = component$(() => {
  const store = useErrorBoundary();
  const loc = useLocation();
  const locale = useLocale();
  // `performance.now()`: monótono, a diferencia del reloj de pared.
  const lastPathChangeAt = useSignal<number | null>(null);
  const reloading = useSignal(false);

  useOnWindow(
    "qerror",
    $((event: Event) => {
      const detail = (event as CustomEvent<{ error?: unknown }>).detail;
      store.error = detail?.error ?? new Error("qerror");
    }),
  );

  // Momento del último cambio de ruta: un error recién llegada la ruta nueva
  // vino de esa navegación. Sólo `pathname`: la query cambia con un filtro y
  // `isNavigating` también se enciende con una acción, y en ninguno de los dos
  // casos corresponde recargar.
  useTask$(({ track }) => {
    track(() => loc.url.pathname);
    if (!isServer) lastPathChangeAt.value = performance.now();
  });

  useTask$(({ track, cleanup }) => {
    const error = track(() => store.error);
    if (isServer || !error) return;
    const decision = recoveryDecision({
      error,
      navigating: cameFromNavigation({
        msSincePathChange:
          lastPathChangeAt.value === null
            ? null
            : performance.now() - lastPathChangeAt.value,
      }),
      alreadyRecovered: hasRecovered(history.state),
    });
    if (decision !== "reload") return;
    // Señal mínima para quien mire la consola: sólo el tipo del error, sin
    // mensaje ni URL (invariante 10). La recarga la borra, salvo con "preservar".
    console.warn(
      "[agorbis] error de render tras una navegación; se recarga una vez",
      error instanceof Error ? error.name : typeof error,
    );
    try {
      // La marca sobrevive a la recarga y se va con la próxima navegación, que
      // guarda su propio `state`: una recarga por entrada, nunca un bucle.
      history.replaceState(withRecoveredMark(history.state), "", location.href);
      reloading.value = true;
      location.reload();
    } catch {
      // Sin marca no se recarga (sería un bucle sin tope): queda el aviso.
      reloading.value = false;
      return;
    }
    // Si la página sigue viva (un `beforeunload` cancelado), el aviso aparece.
    const timer = setTimeout(() => {
      reloading.value = false;
    }, RELOAD_TIMEOUT_MS);
    cleanup(() => clearTimeout(timer));
  });

  if (store.error && reloading.value)
    return (
      <div role="status" class="container-reading py-16 text-center">
        <p class="text-ink-muted">{translate(locale, "Un momento…")}</p>
      </div>
    );
  if (store.error) return <RouteErrorNotice />;
  return <Slot />;
});
