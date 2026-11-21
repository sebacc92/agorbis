import type { Messages } from "../types";

export const enContrast: Messages = {
  Contraste: "Contrast",
  "Contraste entre las sub-comunidades": "Contrast across subcommunities",
  "En qué se parecen y en qué difieren los territorios que componen {{community}}. No es un ranking: cada eje se lee por separado.":
    "How the territories that make up {{community}} resemble and differ from each other. This is not a ranking: each dimension stands on its own.",
  "En qué coinciden y en qué difieren las sub-comunidades de {{community}}.":
    "Where the subcommunities of {{community}} agree and where they differ.",

  "Todavía no hay suficientes datos para contrastar":
    "There isn't enough data to compare yet",
  "Hace falta que al menos dos sub-comunidades participen para poder compararlas sin exponer a nadie.":
    "At least two subcommunities need to take part before they can be compared without exposing anyone.",

  // --- Coincidencia y diferencia, siempre juntas (D60) ---
  "Donde más coincidimos": "Where we agree most",
  "Donde más diferimos": "Where we differ most",
  "{{agree}} de {{total}} coinciden en “{{option}}”":
    "{{agree}} of {{total}} agree on “{{option}}”",
  "{{points}} puntos de diferencia": "{{points}} points apart",
  "El apoyo a “{{option}}” va de {{min}}% a {{max}}%":
    "Support for “{{option}}” ranges from {{min}}% to {{max}}%",
  "Sólo entran las sub-comunidades con al menos {{count}} votos en esa encuesta: con menos, el desglose permitiría deducir votos individuales.":
    "Only subcommunities with at least {{count}} votes in that poll are included: with fewer, the breakdown would let individual votes be inferred.",

  // --- Perfil de reclamos ---
  "Qué reclama cada territorio": "What each territory raises",
  "Más reclamos no significa peor lugar: suele significar que ahí la gente está más organizada para publicarlos. Las tasas van por cada mil habitantes para que el tamaño no distorsione la comparación.":
    "More claims does not mean a worse place: it usually means people there are better organized about filing them. Rates are per thousand residents so that size doesn't distort the comparison.",
  "{{rate}}% con respuesta": "{{rate}}% acknowledged",
  "{{count}} reclamos": "{{count}} claims",
  "{{rate}} por mil hab. · {{count}} en total":
    "{{rate}} per thousand residents · {{count}} in total",
};
