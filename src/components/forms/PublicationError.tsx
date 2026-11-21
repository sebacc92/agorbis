import {
  component$,
  useSignal,
  useVisibleTask$,
  type Signal,
} from "@qwik.dev/core";
import { holdFocus } from "~/lib/focus-when-rendered";
import { useLocale, translate } from "~/lib/i18n";
import type { PublicationFeedback } from "~/lib/content-publication";

export const PublicationError = component$<{
  value: PublicationFeedback | undefined;
  title?: string;
  fieldIdPrefix?: string;
  focusRef?: Signal<HTMLDivElement | undefined>;
}>((props) => {
  const locale = useLocale();
  const ownBox = useSignal<HTMLDivElement>();
  const box = props.focusRef ?? ownBox;
  const data =
    props.value && typeof props.value === "object" ? props.value : {};
  const message =
    "message" in data && typeof data.message === "string" ? data.message : "";
  // Con la red cortada el POST pudo haber llegado: "no se publicó" sería una
  // afirmación sin respaldo (D74). El título lo dice tal cual.
  const undelivered = "undelivered" in data && data.undelivered === true;
  const fields =
    "fieldErrors" in data &&
    data.fieldErrors &&
    typeof data.fieldErrors === "object"
      ? Object.entries(data.fieldErrors).flatMap(([name, errors]) => {
          const first = Array.isArray(errors) ? errors[0] : errors;
          return typeof first === "string" ? [{ name, message: first }] : [];
        })
      : [];

  // La estrategia visible espera a que el aviso entre en pantalla: no sirve
  // para acercar un error que quedó por encima de un formulario largo.
  // eslint-disable-next-line qwik/no-use-visible-task -- foco tras actualizar el DOM
  useVisibleTask$(
    ({ track, cleanup }) => {
      track(() => props.value);
      const frame = requestAnimationFrame(() => {
        const element = box.value;
        if (!element) return;
        element.focus({ preventScroll: true });
        element.scrollIntoView({ block: "center", behavior: "auto" });
        // Al terminar la acción el layout puede reinsertar la página, y el foco se
        // iría al `body`: quien usa lector de pantalla no se enteraría del rechazo.
        holdFocus(element);
      });
      cleanup(() => cancelAnimationFrame(frame));
    },
    { strategy: "document-ready" },
  );

  if (!message && fields.length === 0) return null;
  return (
    <div
      ref={box}
      role="alert"
      tabIndex={-1}
      class="rounded-2xl border border-danger-500/30 bg-danger-500/8 p-4 text-sm text-danger focus:outline-2 focus:outline-offset-2 focus:outline-danger-500"
    >
      <p class="font-semibold">
        {translate(
          locale,
          undelivered
            ? "No sabemos si se publicó"
            : (props.title ?? "No se publicó todavía"),
        )}
      </p>
      <p class="mt-1">
        {translate(
          locale,
          message ||
            "Revisá los campos indicados y volvé a intentarlo. Tu borrador se conserva.",
        )}
      </p>
      {fields.length > 0 && (
        <ul class="mt-2 space-y-1">
          {fields.map((field) => (
            <li key={field.name}>
              <a
                href={`#${encodeURIComponent((props.fieldIdPrefix ?? "") + field.name)}`}
                class="inline-flex min-h-11 items-center underline underline-offset-2"
                preventdefault:click
                onClick$={() => {
                  const scope =
                    box.value?.closest("form") ?? box.value?.closest("main");
                  const input = scope?.querySelector<
                    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                  >(`[name="${CSS.escape(field.name)}"]`);
                  if (input?.getAttribute("type") === "hidden") {
                    const target = document.getElementById(
                      (props.fieldIdPrefix ?? "") + field.name,
                    );
                    if (target && scope?.contains(target)) target.focus();
                  } else input?.focus();
                }}
              >
                {translate(locale, field.message)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
