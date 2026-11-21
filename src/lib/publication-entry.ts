import { onboardingPath, withAuthNext } from "./auth-navigation";
import type { ContentType } from "./database.types.helpers";
import { publicationChooserHref } from "./publication-eligibility";
import { CONTENT_TYPES } from "./quota";

export interface PublicationEntry {
  communitySlug: string;
  type: ContentType;
  isAuthenticated: boolean;
  hasResidence: boolean;
  isMember: boolean;
}

/**
 * A dónde lleva un llamado a publicar, según lo que la página ya sabe de la
 * persona. Reproduce el orden de los loaders del servidor (`requireUser`,
 * `requireResident`, `publicationBlockReason`) para que el enlace acierte de
 * entrada en lugar de llegar al formulario y ser redirigido a mitad del dibujo:
 * en el beta del router esa redirección interna podía dejar la pantalla rota
 * (D115). La base y los loaders siguen decidiendo; esto sólo evita el rodeo en
 * los casos que la página puede prever. El cupo agotado no se conoce acá, así
 * que ese caso sigue redirigiendo en el servidor.
 */
export function publicationEntryHref(entry: PublicationEntry): string {
  const form = `/c/${entry.communitySlug}/${CONTENT_TYPES[entry.type].newPath}`;
  if (!entry.isAuthenticated) return withAuthNext("/ingresar", form);
  if (!entry.hasResidence) return onboardingPath(form);
  if (!entry.isMember)
    return publicationChooserHref(entry.communitySlug, entry.type);
  return form;
}
