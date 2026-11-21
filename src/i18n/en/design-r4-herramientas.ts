import type { Messages } from "../types";

/* Cuarta ronda de diseño (D126): herramientas de la comunidad. */
export const enDesignR4Herramientas: Messages = {
  "Tasa de resolución": "Resolution rate",
  "Todavía ninguna": "None yet",
  "Victorias de {{community}}": "Victories in {{community}}",
  "Instituciones de {{community}}": "Organizations in {{community}}",
  "{{count}} en curso": "{{count}} in progress",
  "Categorías sin reclamos": "Categories without claims",
  "Cuando se publiquen reclamos, acá vas a ver cuántos hay por categoría y cuántos figuran como resueltos.":
    "Once claims are published, this page shows how many there are per category and how many are marked resolved.",
  // Pestañas de victorias: antes se traducían por variable y `check-i18n`
  // no las veía, así que en inglés salían en español.
  "Todas las victorias": "All victories",
  "Reclamos solucionados": "Resolved claims",
  "Proyectos completados": "Completed projects",
  "Tipo de victoria": "Victory type",
  // Plural que arma `pluralize` en ClaimCard (y ahora en victorias, que la
  // usa); tampoco estaba en el catálogo.
  "vecino apoyó": "neighbor backed it",
  "vecinos apoyaron": "neighbors backed it",
  "Cuando un reclamo se marca como resuelto o un proyecto como completado, aparece acá.":
    "When a claim is marked resolved or a project completed, it shows up here.",
  "Victorias para compartir": "Victories to share",
  "Hitos de {{name}}": "{{name}} milestones",
  "Lo que {{name}} ya alcanzó y lo que falta, con los números de hoy.":
    "What {{name}} has reached and what is left, with today's numbers.",
};
