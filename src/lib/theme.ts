import { writeStoredItem } from "./browser-storage";
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "./constants";

/**
 * Clave del tema elegido a mano. Es una preferencia del dispositivo (D67):
 * figura en `DEVICE_PREFERENCE_KEYS` de `local-data.ts` y la lee el bootstrap
 * de `root.tsx` antes del primer pintado.
 */
export const THEME_STORAGE_KEY = "agorbis-theme";

/**
 * Evento en `window` que anuncia un cambio de tema hecho en esta pestaña.
 *
 * `ThemeToggle` leía el tema una sola vez, al activarse. Si se cambiaba desde
 * la paleta de comandos, el ícono y el `aria-pressed` del header quedaban con
 * el valor viejo: el lector de pantalla anunciaba un estado que contradecía
 * el que se veía.
 */
export const THEME_CHANGED_EVENT = "agorbis:theme-changed";

export interface ThemeChangedDetail {
  dark: boolean;
}

/**
 * Alterna claro/oscuro en el momento: clase `dark` en `<html>`, color de la
 * barra del navegador y preferencia guardada. Devuelve si quedó oscuro.
 *
 * El botón del encabezado y la paleta de comandos tenían cada uno su copia, y
 * las dos llamaban a `localStorage.setItem` sin protección: con el
 * almacenamiento bloqueado tiraba a mitad de camino y el ícono quedaba
 * desfasado del tema. Ahora guardar es lo último y nunca tira.
 *
 * Avisa del cambio con `THEME_CHANGED_EVENT` para que el botón del header se
 * entere también cuando el cambio vino de la paleta.
 */
export function toggleColorScheme(): boolean {
  const root = document.documentElement;
  const next = !root.classList.contains("dark");
  root.classList.toggle("dark", next);
  document
    .getElementById("meta-theme-color")
    ?.setAttribute("content", next ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
  writeStoredItem(THEME_STORAGE_KEY, next ? "dark" : "light");
  window.dispatchEvent(
    new CustomEvent<ThemeChangedDetail>(THEME_CHANGED_EVENT, {
      detail: { dark: next },
    }),
  );
  return next;
}
