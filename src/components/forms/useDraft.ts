import {
  $,
  useOnDocument,
  useSignal,
  useTask$,
  useVisibleTask$,
} from "@qwik.dev/core";
import { isServer } from "@qwik.dev/core/build";
import { useNavigate } from "@qwik.dev/router";
import {
  publishedContentPath,
  type PublicationFeedback,
} from "~/lib/content-publication";
import { readStoredJson, removeStoredItem } from "~/lib/browser-storage";
import { useLocale, translate } from "~/lib/i18n";
import { PERSONAL_DATA_CLEARED_EVENT } from "~/lib/local-data";
import {
  restoreDraft,
  saveDraft,
  snapshotDraft,
  type DraftFields,
  type DraftStatus,
} from "./draft-storage";

/** Los borradores siguen separados por cuenta, publicación y comunidad (D67). */
export function draftKey(
  type: string,
  communitySlug: string,
  ownerId: string,
): string {
  return `agorbis:draft:${ownerId}:${type}:${communitySlug}`;
}

/** Guarda tras una pausa al escribir y antes de cualquier navegación interna. */
export function useDraft(
  key: string,
  fields: DraftFields,
  action: { readonly value?: PublicationFeedback },
) {
  const published = useSignal(false);
  // Destino de la ficha ya publicada; lo muestra `PublishedNotice` como salida.
  const publishedTo = useSignal<string | null>(null);
  // El cierre de sesión no debe disparar un render de esta ruta protegida.
  // untrackedValue permite cortar tareas/guards sin invalidar su árbol.
  const stopped = useSignal(false);
  const initialized = useSignal(false);
  const restored = useSignal(false);
  const status = useSignal<DraftStatus>("idle");
  const editing = useSignal(false);
  const lastSaved = useSignal<string>();
  const initial = useSignal(snapshotDraft(fields));
  const navigate = useNavigate();
  const locale = useLocale();

  const save = $(() => {
    if (stopped.untrackedValue || published.value) return true;
    const snapshot = snapshotDraft(fields);
    if (
      !lastSaved.value &&
      JSON.stringify(snapshot) === JSON.stringify(initial.value)
    ) {
      status.value = "idle";
      return true;
    }
    status.value = saveDraft(key, snapshot, initial.value);
    if (status.value !== "error") lastSaved.value = JSON.stringify(snapshot);
    return status.value !== "error";
  });

  const persist = $(() => save());
  const edit = $(() => {
    if (stopped.untrackedValue) return;
    editing.value = true;
  });
  const reset = $(() => {
    if (stopped.untrackedValue) return;
    for (const [name, signal] of Object.entries(fields)) {
      const value = initial.value[name];
      signal.value = Array.isArray(value) ? [...value] : value;
    }
    // El próximo task cancela el timer pendiente y reconoce el estado vacío.
    lastSaved.value = JSON.stringify(initial.value);
    restored.value = false;
    status.value = removeStoredItem(key) ? "idle" : "error";
  });

  useTask$(({ track }) => {
    const value = track(() => action.value);
    if (isServer || stopped.untrackedValue) return;
    editing.value = false;
    if (published.value) return;
    const destination = publishedContentPath(value);
    if (!destination) return;
    published.value = true;
    publishedTo.value = destination;
    removeStoredItem(key);
    // Si la navegación SPA falla, la carga completa llega igual: la base ya
    // confirmó y el borrador ya no está, así que quedarse acá no es opción.
    navigate(destination).catch(() => {
      window.location.assign(destination);
    });
  });

  // Se ejecuta también al entrar por navegación SPA, donde qinit ya ocurrió.
  // eslint-disable-next-line qwik/no-use-visible-task -- recuperar almacenamiento del navegador al montar el formulario
  useVisibleTask$(
    () => {
      const parsed = readStoredJson(key, isDraftPayload);
      if (parsed) {
        restoreDraft(fields, initial.value, parsed);
        restored.value = true;
        lastSaved.value = JSON.stringify(snapshotDraft(fields));
        status.value = "saved";
      }
      initialized.value = true;
    },
    { strategy: "document-ready" },
  );

  useTask$(({ track, cleanup }) => {
    const ready = track(() => initialized.value);
    const done = track(() => published.value);
    const snapshot = Object.fromEntries(
      Object.entries(fields).map(([name, signal]) => [
        name,
        track(() => signal.value),
      ]),
    );
    const serialized = JSON.stringify(snapshot);
    if (
      isServer ||
      stopped.untrackedValue ||
      !ready ||
      done ||
      serialized === lastSaved.value
    )
      return;
    if (!lastSaved.value && serialized === JSON.stringify(initial.value))
      return;
    status.value = "saving";
    const timer = setTimeout(() => {
      // Un descarte o una nueva edición puede llegar antes del cleanup del task.
      if (
        stopped.untrackedValue ||
        published.value ||
        JSON.stringify(snapshotDraft(fields)) !== serialized
      )
        return;
      status.value = saveDraft(key, snapshot, initial.value);
      if (status.value !== "error") lastSaved.value = serialized;
    }, 500);
    cleanup(() => clearTimeout(timer));
  });

  const beforeNavigate = $((target?: number | URL) => {
    // El listener nativo de abajo cubre cerrar/recargar de manera síncrona.
    if (target === undefined || stopped.untrackedValue || published.value)
      return false;
    return save().then((saved) => {
      if (saved) return false;
      return !window.confirm(
        translate(
          locale,
          "No pudimos guardar tu borrador. ¿Querés salir y perder los cambios?",
        ),
      );
    });
  });

  useOnDocument(
    "visibilitychange",
    $(() => {
      if (
        document.visibilityState === "hidden" &&
        !stopped.untrackedValue &&
        !published.value
      )
        void save();
    }),
  );

  // beforeunload debe guardar dentro del evento nativo, sin esperar un QRL.
  // eslint-disable-next-line qwik/no-use-visible-task -- listener síncrono para cerrar/recargar
  useVisibleTask$(
    ({ cleanup }) => {
      const onBeforeUnload = (event: BeforeUnloadEvent) => {
        if (stopped.untrackedValue || published.value) return;
        const snapshot = snapshotDraft(fields);
        const result = saveDraft(key, snapshot, initial.value);
        if (
          result === "idle" ||
          JSON.stringify(snapshot) === JSON.stringify(initial.value)
        )
          return;
        event.preventDefault();
        event.returnValue = true;
      };
      const stopPersonalWrites = () => {
        stopped.untrackedValue = true;
      };
      window.addEventListener(PERSONAL_DATA_CLEARED_EVENT, stopPersonalWrites);
      window.addEventListener("beforeunload", onBeforeUnload);
      cleanup(() => {
        window.removeEventListener(
          PERSONAL_DATA_CLEARED_EVENT,
          stopPersonalWrites,
        );
        window.removeEventListener("beforeunload", onBeforeUnload);
      });
    },
    { strategy: "document-ready" },
  );

  return {
    persist,
    edit,
    reset,
    beforeNavigate,
    editing,
    status,
    initialized,
    restored,
    /**
     * La base ya confirmó y la navegación al detalle está en curso. Entre una
     * cosa y la otra `isRunning` vuelve a `false`: el botón se habilitaba y un
     * segundo toque mandaba otro POST. Los formularios lo usan para seguir
     * bloqueados y avisar "Publicado" hasta que llega la ficha.
     */
    published,
    publishedTo,
  };
}

function isDraftPayload(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
