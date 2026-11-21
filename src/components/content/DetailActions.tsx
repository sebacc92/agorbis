import { component$ } from "@qwik.dev/core";
import { cx } from "~/components/ui";
import { BookmarkButton } from "./BookmarkButton";
import { ShareButton } from "./ShareButton";

export interface DetailActionsProps {
  type: "claim" | "poll" | "debate" | "project";
  id: string;
  title: string;
  url: string;
  communityName: string;
  /**
   * El reclamo ya comparte desde su barra fija y desde "Difundir" (D95):
   * un tercer botón volvería a la dispersión que se sacó.
   */
  share?: boolean;
  /** Reemplaza el margen superior cuando la fila va dentro de otra. */
  class?: string;
}

/**
 * Guardar y compartir, en el mismo lugar de cada detalle (D96).
 *
 * Cada tipo los ponía en otro lado: la encuesta en la columna lateral, el
 * debate en la cabecera, el proyecto debajo de sus etapas. Guardar en
 * favoritos existía sólo en reclamos. Ahora van en esta fila, debajo del
 * título y sus datos. Reportar queda siempre al final del artículo: es poco
 * frecuente y no compite con la acción principal.
 *
 * Sin `Slot` a propósito: las herramientas propias de un tipo, como el
 * proyector del debate, van al lado y no adentro. Proyectado acá, el
 * redibujado que sigue a la hidratación volvía a montar el `<dialog>` del
 * proyector, y si alguien lo había abierto en ese instante se cerraba solo.
 */
export const DetailActions = component$<DetailActionsProps>(
  ({ type, id, title, url, communityName, share = true, class: cls }) => (
    <div
      data-detail-actions
      class={cx("flex flex-wrap items-center gap-2", cls ?? "mt-4")}
    >
      {/* Sin "Compartir" al lado (el reclamo), la estrella quedaba sola en
          su fila y no se leía como acción: ahí lleva su nombre (D126). */}
      <BookmarkButton
        id={id}
        type={type}
        title={title}
        url={url}
        communityName={communityName}
        showLabel={!share}
      />
      {share && (
        <ShareButton
          title={title}
          url={url}
          kind={type}
          communityName={communityName}
        />
      )}
    </div>
  ),
);
