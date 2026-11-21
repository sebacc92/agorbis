import type { IconName } from "~/components/ui/Icon";
import type { ContentType } from "./database.types.helpers";

/**
 * Qué es cada tipo de contenido y cómo se ve (D123).
 *
 * Nombre, plural, ícono y familia de color viven en un solo lugar: antes
 * el feed, la barra inferior y las secciones de comunidad tenían cada uno
 * su tabla con emojis. Las clases son cadenas completas porque Tailwind
 * sólo genera lo que encuentra escrito.
 */
export type ContentKind = ContentType | "agreement";

export interface ContentKindMeta {
  label: string;
  /** Plural en minúscula para líneas como "Mostrando encuestas de…". */
  plural: string;
  icon: IconName;
  /** Identidad heredada; la interfaz ya no lo dibuja como ícono. */
  emoji: string;
  /** Singular y plural del dato de participación que muestra el feed. */
  engagement: [string, string];
}

export const CONTENT_KINDS: Record<ContentKind, ContentKindMeta> = {
  claim: {
    label: "Reclamo",
    plural: "reclamos",
    icon: "megaphone",
    emoji: "📣",
    engagement: ["apoyo", "apoyos"],
  },
  poll: {
    label: "Encuesta",
    plural: "encuestas",
    icon: "ballot",
    emoji: "🗳️",
    engagement: ["votante", "votantes"],
  },
  debate: {
    label: "Debate",
    plural: "debates",
    icon: "chat",
    emoji: "💬",
    engagement: ["comentario", "comentarios"],
  },
  project: {
    label: "Proyecto",
    plural: "proyectos",
    icon: "hammer",
    emoji: "🛠️",
    engagement: ["aporte", "aportes"],
  },
  // D118: la base entrega comunidades adheridas, nunca votos (D68).
  agreement: {
    label: "Acuerdo",
    plural: "acuerdos",
    icon: "handshake",
    emoji: "🤝",
    engagement: ["comunidad adhirió", "comunidades adhirieron"],
  },
};

export interface ContentKindTone {
  /** Texto del color del tipo, con contraste AA en ambos temas. */
  text: string;
  /** Fondo suave del tipo. */
  bg: string;
  /** Borde o acento del tipo. */
  border: string;
  /** Badge completo: fondo, texto y borde. */
  badge: string;
  /** Chip seleccionado: relleno del acento con texto blanco. */
  selected: string;
  /** Franja izquierda de una tarjeta. */
  accent: string;
}

export const CONTENT_KIND_TONES: Record<ContentKind, ContentKindTone> = {
  claim: {
    text: "text-kind-claim-text",
    bg: "bg-kind-claim-bg",
    border: "border-kind-claim/40",
    badge: "bg-kind-claim-bg text-kind-claim-text border border-kind-claim/30",
    selected: "bg-kind-claim text-white border-kind-claim",
    accent: "border-l-kind-claim",
  },
  poll: {
    text: "text-kind-poll-text",
    bg: "bg-kind-poll-bg",
    border: "border-kind-poll/40",
    badge: "bg-kind-poll-bg text-kind-poll-text border border-kind-poll/30",
    selected: "bg-kind-poll text-white border-kind-poll",
    accent: "border-l-kind-poll",
  },
  debate: {
    text: "text-kind-debate-text",
    bg: "bg-kind-debate-bg",
    border: "border-kind-debate/40",
    badge:
      "bg-kind-debate-bg text-kind-debate-text border border-kind-debate/30",
    selected: "bg-kind-debate text-white border-kind-debate",
    accent: "border-l-kind-debate",
  },
  project: {
    text: "text-kind-project-text",
    bg: "bg-kind-project-bg",
    border: "border-kind-project/40",
    badge:
      "bg-kind-project-bg text-kind-project-text border border-kind-project/30",
    selected: "bg-kind-project text-white border-kind-project",
    accent: "border-l-kind-project",
  },
  agreement: {
    text: "text-kind-agreement-text",
    bg: "bg-kind-agreement-bg",
    border: "border-kind-agreement/40",
    badge:
      "bg-kind-agreement-bg text-kind-agreement-text border border-kind-agreement/30",
    selected: "bg-kind-agreement text-ink-strong border-kind-agreement",
    accent: "border-l-kind-agreement",
  },
};

export function isContentKind(value: string): value is ContentKind {
  return Object.prototype.hasOwnProperty.call(CONTENT_KINDS, value);
}
