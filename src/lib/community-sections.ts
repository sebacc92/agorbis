import type { IconName } from "~/components/ui/Icon";
import { LEVEL_CITY, LEVEL_GLOBAL } from "./constants";

/**
 * Qué secciones y herramientas ofrece una comunidad, y dónde (D96).
 *
 * La barra tenía nueve pestañas, y las herramientas sumaban cinco destinos
 * más. Contraste y Comparativa comparaban territorios cada una por su lado.
 * El "Mapa barrial" y la "Rendición de Cuentas Municipal" aparecían también
 * en un país o en la Tierra. Acá se decide qué queda a la vista, qué pasa a
 * "Más" y qué herramienta corresponde a cada nivel. El layout y la portada
 * de la comunidad sólo lo dibujan.
 */
export interface CommunitySection {
  /** Clave de render: Info vive en la raíz y su `segment` es "". */
  id: string;
  segment: string;
  label: string;
  /** Identidad heredada; la interfaz ya no lo dibuja como ícono (D123). */
  emoji: string;
  /** Ícono de trazo propio que reemplaza al emoji en pestañas y menús. */
  icon: IconName;
}

/** Lo que se hace en una comunidad: participar. */
const PRIMARY: readonly CommunitySection[] = [
  { id: "info", segment: "", label: "Info", emoji: "ℹ️", icon: "info" },
  {
    id: "encuestas",
    segment: "encuestas",
    label: "Encuestas",
    emoji: "🗳️",
    icon: "ballot",
  },
  {
    id: "debates",
    segment: "debates",
    label: "Debates",
    emoji: "💬",
    icon: "chat",
  },
  {
    id: "reclamos",
    segment: "reclamos",
    label: "Reclamos",
    emoji: "📣",
    icon: "megaphone",
  },
  {
    id: "proyectos",
    segment: "proyectos",
    label: "Proyectos",
    emoji: "🛠️",
    icon: "hammer",
  },
];

export interface CommunityShape {
  level: number;
  /** `null` si no se pudo contar: se ofrece igual, como antes. */
  childCount: number | null;
  /** `null` si no se pudo consultar (D59). */
  hasBudget: boolean | null;
}

/**
 * Las dos formas de comparar, ahora bajo una sola sección. Entre las hijas
 * hace falta tener al menos dos (D60). Con las del mismo nivel hace falta
 * tener un nivel superior: la Tierra no tiene pares.
 */
export function compareViews({
  level,
  childCount,
}: Pick<CommunityShape, "level" | "childCount">) {
  const views: { segment: "contraste" | "comparativa"; label: string }[] = [];
  if (childCount === null || childCount >= 2) {
    views.push({ segment: "contraste", label: "Entre sus sub-comunidades" });
  }
  if (level > LEVEL_GLOBAL) {
    views.push({
      segment: "comparativa",
      label: "Con comunidades del mismo nivel",
    });
  }
  return views;
}

export function communitySections(shape: CommunityShape): {
  primary: readonly CommunitySection[];
  more: CommunitySection[];
} {
  const more: CommunitySection[] = [
    {
      id: "miembros",
      segment: "miembros",
      label: "Miembros",
      emoji: "👥",
      icon: "users",
    },
  ];
  // Sin partida no hay pestaña: sería un recordatorio de quién no tiene
  // recursos (D59).
  if (shape.hasBudget !== false) {
    more.push({
      id: "presupuesto",
      segment: "presupuesto",
      label: "Presupuesto",
      emoji: "🧾",
      icon: "receipt",
    });
  }
  more.push({
    id: "sub",
    segment: "sub",
    label: "Sub-comunidades",
    emoji: "🗺️",
    icon: "layers",
  });
  const [compare] = compareViews(shape);
  if (compare) {
    more.push({
      id: "comparar",
      segment: compare.segment,
      label: "Comparar",
      emoji: "⚖️",
      icon: "scale",
    });
  }
  return { primary: PRIMARY, more };
}

/** La sección que corresponde a un tramo de URL, si es una sección. */
export function sectionIdFor(segment: string): string | null {
  if (segment === "contraste" || segment === "comparativa") return "comparar";
  if (segment === "") return "info";
  const known = [
    ...PRIMARY.map((section) => section.id),
    "miembros",
    "presupuesto",
    "sub",
  ];
  return known.includes(segment) ? segment : null;
}

export interface CommunityTool {
  segment: string;
  label: string;
  emoji: string;
  icon: IconName;
}

export const COMMUNITY_TOOLS: readonly CommunityTool[] = [
  { segment: "mapa", label: "Mapa barrial", emoji: "🗺️", icon: "map" },
  { segment: "victorias", label: "Victorias", emoji: "🏆", icon: "trophy" },
  { segment: "rendicion", label: "Rendición", emoji: "📊", icon: "list" },
  {
    segment: "instituciones",
    label: "Instituciones",
    emoji: "🏛️",
    icon: "building",
  },
];

/** El mapa barrial y la rendición municipal, de ciudad para abajo. */
const MUNICIPAL_TOOLS = new Set(["mapa", "rendicion"]);

export function isMunicipalLevel(level: number): boolean {
  return level >= LEVEL_CITY;
}

export function communityTools(level: number): CommunityTool[] {
  return COMMUNITY_TOOLS.filter(
    (tool) => isMunicipalLevel(level) || !MUNICIPAL_TOOLS.has(tool.segment),
  );
}
