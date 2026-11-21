import type { Messages } from "../types";

/* Cuarta ronda de diseño (D126): perfil público y pasaporte cívico. */
export const enDesignR4Perfil: Messages = {
  "Pasaporte cívico": "Civic passport",
  "Publicaciones por día": "Publications by day",
  // Pestañas y filtros de actividad de /perfil: se traducen por variable y
  // `check-i18n` no los ve, así que en inglés salían en castellano. El msgid
  // no cambia porque los E2E buscan esos nombres exactos.
  "Resumen y Pasaporte": "Summary and passport",
  "Publicaciones y Actividad": "Posts and activity",
  "Guardados y Comunidades": "Saved and communities",
  "Configuración y Cuenta": "Settings and account",
  Comentarios: "Comments",
  "Reclamos apoyados": "Supported claims",
  Compromisos: "Pledges",
};
