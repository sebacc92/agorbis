import type { Messages } from "../types";

/* Cuarta ronda de diseño (D126): controles globales. */
export const enDesignR4Controles: Messages = {
  "Preferencias de accesibilidad": "Accessibility preferences",
  // El pie de la paleta: cada tecla es un ícono con nombre y una palabra.
  Navegar: "Navigate",
  Abrir: "Open",
  "Flecha arriba": "Up arrow",
  "Flecha abajo": "Down arrow",
  Enter: "Enter",
  // El pie traduce sus etiquetas por variable y `check-i18n` no las ve: sin
  // estas tres, el pie en inglés las mostraba en castellano.
  "Legal y convivencia": "Legal and community",
  Privacidad: "Privacy",
  "Moderación y apelaciones": "Moderation and appeals",
};
