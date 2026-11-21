/**
 * Qué decirle a una persona sobre su residencia en una comunidad (D116).
 *
 * Cabecera y estado vacío deciden texto y botón con la misma función: así no
 * pueden desacoplarse. "Residencia declarada" sólo le corresponde a quien la
 * declaró; a quien no eligió se le ofrece elegir, y si el perfil no se pudo
 * leer no se afirma nada sobre la persona ni se la manda a elegir de nuevo.
 */
export type ResidenceHint =
  "member" | "signin" | "unknown" | "choose" | "elsewhere";

export function residenceHint(viewer: {
  isMember: boolean;
  isAuthenticated: boolean;
  hasResidence: boolean;
  residenceUnknown: boolean;
}): ResidenceHint {
  if (viewer.isMember) return "member";
  if (!viewer.isAuthenticated) return "signin";
  if (viewer.residenceUnknown) return "unknown";
  if (!viewer.hasResidence) return "choose";
  return "elsewhere";
}
