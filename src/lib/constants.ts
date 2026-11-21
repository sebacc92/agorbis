import type {
  ClaimCategory,
  InfoCategory,
  PollCategory,
  PollType,
  ProjectStatus,
} from "./database.types.helpers";

/** Nombre y promesa del producto, en un solo lugar. */
export const APP_NAME = "Agorbis";

/**
 * Color del cromo del navegador en cada tema. Coincide con `--surface-app`
 * (`mist-50` / `night-950`) y no con el violeta de marca: el header es
 * translúcido y está pegado arriba, así que lo que tiene que continuar sin
 * costura es el fondo de la app, no un color de acento.
 *
 * Se usan literales y no `var(--surface-app)` porque `<meta name="theme-color">`
 * no resuelve variables CSS.
 */
export const THEME_COLOR_LIGHT = "#faf9fc";
export const THEME_COLOR_DARK = "#12101f";
export const APP_TAGLINE = "Unir a la humanidad, una comunidad a la vez";
export const APP_DESCRIPTION =
  "Agorbis organiza a la humanidad en comunidades geográficas para conocerse, decidir juntos, debatir y proponer proyectos.";

/**
 * Desde la iteración 2 cualquier residente puede crear contenido; lo que lo
 * regula es la cuota mensual por nivel geográfico, configurada en la tabla
 * `content_quotas` y aplicada por el trigger `enforce_content_quota`.
 * Ver `src/lib/quota.ts` y D27 en DECISIONS.md.
 */

/** Máximo ADM1 observado: Eslovenia tiene 212 municipios; deja margen sin truncar la vista previa. */
export const MAX_DEBATE_COLUMNS = 300;

/** Paginación por cursor en todos los listados. */
export const PAGE_SIZE = 20;

/** Un reclamo admite evidencia visual, sin convertir la publicación en un álbum. */
export const MAX_CLAIM_IMAGES = 4;
/** Opciones por encuesta; vale para crearla y para votar. */
export const MAX_POLL_OPTIONS = 10;

/**
 * Cuatro archivos más los campos multipart deben quedar holgadamente debajo
 * del límite propio de 5 MiB del Worker. El navegador intenta alcanzar este
 * tamaño y el servidor/bucket lo vuelven autoritativo.
 */
export const MAX_CLAIM_IMAGE_BYTES = 950 * 1024;

/** Tope autoritativo de una promesa individual; la base aplica el mismo valor. */
export const MAX_PROJECT_PLEDGE_AMOUNT = 1_000_000_000;

/** Avatares por página en el listado de miembros: son chicos, entran más. */
export const MEMBERS_PAGE_SIZE = 100;

/**
 * Tope al leer instituciones verificadas.
 *
 * Se consulta en tres lugares —el listado de `/instituciones` y los selectores
 * que eligen a quién dirigir un reclamo o un proyecto— y ninguno tenía
 * `limit`.
 * `organizations` es una tabla global que sólo crece: sin tope, cada una de
 * esas tres páginas se vuelve más lenta a medida que se verifican más
 * instituciones, sin que nada avise. Alto de sobra para el uso real.
 */
export const ORGANIZATIONS_LIMIT = 500;

/**
 * Mensaje del 500 cuando una consulta falla al cargar una página.
 *
 * Existe para que no se confunda con un 404. Las páginas de contenido y el
 * layout de comunidad hacían `if (!fila) throw error(404)` sin mirar el
 * `error` de la consulta: un problema momentáneo de la base se presentaba como
 * "no encontramos ese reclamo". Para quien lo publicó eso es su reclamo
 * borrado, y para un buscador es una orden de sacar la URL del índice —un 404
 * es permanente, un 500 se reintenta—.
 */
export const LOAD_FAILED =
  "No pudimos cargar esta página. Probá de nuevo en un momento.";

/** Rate limit de comentarios, en segundos. También lo aplica un trigger. */
export const COMMENT_COOLDOWN_SECONDS = 15;

/** Días entre cambios de residencia. También lo aplica un trigger. */
export const RESIDENCE_COOLDOWN_DAYS = 30;

export const LEVEL_NAMES: Record<number, string> = {
  0: "Global",
  1: "Continente",
  2: "País",
  3: "Provincia o estado",
  4: "Ciudad o municipio",
  // D127: el nivel 5 también aloja localidades que no son gobierno propio,
  // como Mar del Plata dentro de General Pueyrredón.
  5: "Localidad o barrio",
};

/**
 * Niveles con nombre propio, para no volver a escribir un número a mano en
 * ninguna consulta ni en la portada.
 */
export const LEVEL_GLOBAL = 0;
export const LEVEL_CONTINENT = 1;
export const LEVEL_COUNTRY = 2;
export const LEVEL_CITY = 4;

/** Cómo se llama el conjunto de hijos de una comunidad de cada nivel. */
export const CHILD_LEVEL_LABEL: Record<number, string> = {
  0: "Continentes",
  1: "Países",
  2: "Provincias o estados",
  3: "Ciudades y municipios",
  4: "Localidades y barrios",
};

/* Subconjunto de `IconName` que usan las fichas; se declara acá para que
   `constants.ts` no dependa de un componente. */
type InfoCategoryIcon =
  "scroll" | "map" | "masks" | "chart" | "utensils" | "building" | "bulb";

export const INFO_CATEGORIES: {
  key: InfoCategory;
  label: string;
  /** Identidad heredada; la interfaz dibuja `icon` (D123). */
  emoji: string;
  icon: InfoCategoryIcon;
  hint: string;
}[] = [
  {
    key: "historia",
    label: "Historia",
    emoji: "📜",
    icon: "scroll",
    hint: "Cómo llegamos hasta acá",
  },
  {
    key: "geografia",
    label: "Geografía",
    emoji: "🗺️",
    icon: "map",
    hint: "El territorio y su forma",
  },
  {
    key: "cultura",
    label: "Cultura",
    emoji: "🎭",
    icon: "masks",
    hint: "Lo que nos hace reconocibles",
  },
  {
    key: "economia",
    label: "Economía",
    emoji: "📊",
    icon: "chart",
    hint: "De qué se vive",
  },
  {
    key: "gastronomia",
    label: "Gastronomía",
    emoji: "🍽️",
    icon: "utensils",
    hint: "Lo que se come",
  },
  {
    key: "simbolo",
    label: "Símbolo",
    emoji: "🏛️",
    icon: "building",
    hint: "La imagen que nos representa",
  },
  {
    key: "dato_curioso",
    label: "Dato curioso",
    emoji: "💡",
    icon: "bulb",
    hint: "Eso que no sabías",
  },
];

/** Íconos propios de las categorías (D125); `emoji` queda como identidad heredada. */
export type CategoryIcon =
  | "cone"
  | "wrench"
  | "shield"
  | "heart"
  | "book-open"
  | "leaf"
  | "bus"
  | "tag"
  | "home-group"
  | "masks"
  | "ball"
  | "chart"
  | "bulb";

export const CLAIM_CATEGORIES: {
  key: ClaimCategory;
  label: string;
  emoji: string;
  icon: CategoryIcon;
}[] = [
  {
    key: "infraestructura",
    label: "Infraestructura",
    emoji: "🚧",
    icon: "cone",
  },
  { key: "servicios", label: "Servicios", emoji: "🔧", icon: "wrench" },
  { key: "seguridad", label: "Seguridad", emoji: "🚨", icon: "shield" },
  { key: "salud", label: "Salud", emoji: "🏥", icon: "heart" },
  { key: "educacion", label: "Educación", emoji: "📚", icon: "book-open" },
  { key: "ambiente", label: "Ambiente", emoji: "🌱", icon: "leaf" },
  { key: "transporte", label: "Transporte", emoji: "🚌", icon: "bus" },
  { key: "otro", label: "Otro", emoji: "📌", icon: "tag" },
];

export const CLAIM_STATUS_LABEL: Record<
  string,
  { label: string; tone: string }
> = {
  open: { label: "Abierto", tone: "warn" },
  under_review: { label: "En evaluación", tone: "brand" },
  acknowledged: { label: "Recibido", tone: "brand" },
  in_progress: { label: "En ejecución", tone: "brand" },
  resolved: { label: "Resuelto", tone: "success" },
  rejected: { label: "Respuesta negativa", tone: "danger" },
  removed: { label: "Eliminado", tone: "danger" },
};

export const PROJECT_STATUS_LABEL: Record<
  ProjectStatus,
  { label: string; tone: string }
> = {
  proposal: { label: "Propuesta", tone: "neutral" },
  funding: { label: "Juntando apoyo", tone: "brand" },
  in_progress: { label: "En ejecución", tone: "success" },
  completed: { label: "Completado", tone: "success" },
  removed: { label: "Eliminado", tone: "danger" },
};

export const POLL_TYPE_LABEL: Record<PollType, string> = {
  single: "Elegí una opción",
  multiple: "Elegí las que quieras",
  binary: "Sí o no",
};

export const POLL_CATEGORIES: {
  key: PollCategory;
  label: string;
  emoji: string;
  icon: CategoryIcon;
}[] = [
  { key: "comunidad", label: "Comunidad", emoji: "🏘️", icon: "home-group" },
  { key: "ambiente", label: "Ambiente", emoji: "🌱", icon: "leaf" },
  { key: "salud", label: "Salud", emoji: "🏥", icon: "heart" },
  { key: "educacion", label: "Educación", emoji: "📚", icon: "book-open" },
  { key: "transporte", label: "Transporte", emoji: "🚌", icon: "bus" },
  { key: "cultura", label: "Cultura", emoji: "🎭", icon: "masks" },
  { key: "deportes", label: "Deportes", emoji: "⚽", icon: "ball" },
  { key: "economia", label: "Economía", emoji: "💼", icon: "chart" },
  { key: "tecnologia", label: "Tecnología", emoji: "💡", icon: "bulb" },
  { key: "seguridad", label: "Seguridad", emoji: "🛟", icon: "shield" },
];

export const POLL_CATEGORY_BY_KEY = Object.fromEntries(
  POLL_CATEGORIES.map((category) => [category.key, category]),
) as Record<PollCategory, (typeof POLL_CATEGORIES)[number]>;

/** El disclaimer de reclamos es una promesa del producto: siempre visible. */
export const CLAIMS_DISCLAIMER =
  "Agorbis da visibilidad a los reclamos; no garantiza su resolución.";

export const PLEDGE_DISCLAIMER =
  "Compromiso público, no un pago: nadie transfiere dinero a través de Agorbis.";
