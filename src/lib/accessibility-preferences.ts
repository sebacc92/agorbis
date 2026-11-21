/**
 * Preferencias de accesibilidad del dispositivo (tamaño de texto, contraste,
 * lectura facilitada, movimiento, foco, sonido y vibración).
 *
 * Antes las claves y las clases estaban escritas a mano en cuatro lugares
 * (el panel, el háptico, el sonido y la limpieza de datos locales) y se
 * aplicaban recién cuando el panel —que vive en el pie— entraba en pantalla:
 * en una página larga, quien necesitaba letra grande la veía chica hasta
 * llegar al final, y ahí todo saltaba. Ahora se aplican en el bootstrap del
 * `<head>` (`A11Y_BOOTSTRAP`, desde `root.tsx`), antes del primer pintado,
 * y el panel sólo refleja y cambia lo guardado.
 *
 * Son preferencias del dispositivo (D67): sobreviven al cierre de sesión. Las
 * claves figuran en `DEVICE_PREFERENCE_KEYS`/`DEVICE_PREFERENCE_PREFIXES` de
 * `src/lib/local-data.ts`.
 */
import {
  readStoredItem,
  removeStoredItem,
  writeStoredItem,
} from "./browser-storage";

export const FONT_SCALES = [90, 100, 110, 120, 130] as const;
export const DEFAULT_FONT_SCALE = 100;

export const A11Y_STORAGE_KEYS = {
  fontScale: "agorbis_a11y_font_scale",
  highContrast: "agorbis_high_contrast",
  dyslexia: "agorbis_a11y_dyslexia",
  reducedMotion: "agorbis_a11y_motion",
  enhancedFocus: "agorbis_a11y_focus",
  sound: "agorbis_a11y_sound",
  haptic: "agorbis_a11y_haptic",
  shortcuts: "agorbis_a11y_shortcuts",
} as const;

/** Clase que cada preferencia visual pone en `<html>` (ver `global.css`). */
export const A11Y_ROOT_CLASSES = {
  highContrast: "contrast-more",
  dyslexia: "civic-dyslexia",
  reducedMotion: "civic-reduced-motion",
  enhancedFocus: "civic-enhanced-focus",
} as const;

export type A11yVisualFlag = keyof typeof A11Y_ROOT_CLASSES;
export type A11yFlag = A11yVisualFlag | "sound" | "haptic" | "shortcuts";

export interface A11yPreferences {
  fontScale: number;
  highContrast: boolean;
  dyslexia: boolean;
  reducedMotion: boolean;
  enhancedFocus: boolean;
  sound: boolean;
  /**
   * La vibración viene apagada, como el sonido. Antes venía encendida y cada
   * botón vibraba al apoyar el dedo, incluso al empezar a desplazarse (D96).
   */
  haptic: boolean;
  /**
   * Atajos de una sola tecla (`/`, `?`, `H`, `E`). Vienen encendidos; WCAG
   * 2.1.4 exige poder apagarlos: quien dicta por voz o toca una tecla sin
   * querer cambiaba de página. Se guarda `"false"` para apagarlos.
   */
  shortcuts: boolean;
}

export const DEFAULT_A11Y_PREFERENCES: A11yPreferences = {
  fontScale: DEFAULT_FONT_SCALE,
  highContrast: false,
  dyslexia: false,
  reducedMotion: false,
  enhancedFocus: false,
  sound: false,
  haptic: false,
  shortcuts: true,
};

function isFontScale(value: number): boolean {
  return (FONT_SCALES as readonly number[]).includes(value);
}

/** Interpreta lo guardado; cualquier valor raro cae en el predeterminado. */
export function parseA11yPreferences(
  read: (key: string) => string | null,
): A11yPreferences {
  const scale = Number(read(A11Y_STORAGE_KEYS.fontScale) || DEFAULT_FONT_SCALE);
  return {
    fontScale: isFontScale(scale) ? scale : DEFAULT_FONT_SCALE,
    highContrast: read(A11Y_STORAGE_KEYS.highContrast) === "true",
    dyslexia: read(A11Y_STORAGE_KEYS.dyslexia) === "true",
    reducedMotion: read(A11Y_STORAGE_KEYS.reducedMotion) === "true",
    enhancedFocus: read(A11Y_STORAGE_KEYS.enhancedFocus) === "true",
    sound: read(A11Y_STORAGE_KEYS.sound) === "true",
    haptic: read(A11Y_STORAGE_KEYS.haptic) === "true",
    shortcuts: read(A11Y_STORAGE_KEYS.shortcuts) !== "false",
  };
}

export function readA11yPreferences(): A11yPreferences {
  return parseA11yPreferences((key) => readStoredItem(key));
}

export function isSoundPreferenceOn(): boolean {
  return readStoredItem(A11Y_STORAGE_KEYS.sound) === "true";
}

export function isHapticPreferenceOn(): boolean {
  return readStoredItem(A11Y_STORAGE_KEYS.haptic) === "true";
}

/** ¿Siguen activos los atajos de una sola tecla? Sólo `"false"` los apaga. */
export function isSingleKeyShortcutsOn(): boolean {
  return readStoredItem(A11Y_STORAGE_KEYS.shortcuts) !== "false";
}

/**
 * ¿Hay que evitar animaciones? Vale la preferencia del sistema o el
 * interruptor propio del panel, que sólo pone una clase en `<html>`. El
 * confeti, los avisos y el mapa miraban sólo el sistema, así que apagar el
 * movimiento desde Agorbis no los frenaba.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return (
    document.documentElement.classList.contains(
      A11Y_ROOT_CLASSES.reducedMotion,
    ) || window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Siguiente escala dentro de `FONT_SCALES`, sin pasarse de los extremos. */
export function stepFontScale(current: number, delta: number): number {
  const index = FONT_SCALES.indexOf(current as (typeof FONT_SCALES)[number]);
  const from = index < 0 ? FONT_SCALES.indexOf(DEFAULT_FONT_SCALE) : index;
  const next = Math.max(0, Math.min(FONT_SCALES.length - 1, from + delta));
  return FONT_SCALES[next];
}

/**
 * Cuántas preferencias se apartan de lo predeterminado, para el contador del
 * botón. Desde que la vibración viene apagada, encenderla también cuenta.
 */
export function countActiveA11yPreferences(prefs: A11yPreferences): number {
  return [
    prefs.fontScale !== DEFAULT_FONT_SCALE,
    prefs.highContrast,
    prefs.dyslexia,
    prefs.reducedMotion,
    prefs.enhancedFocus,
    prefs.sound,
    prefs.haptic,
    !prefs.shortcuts,
  ].filter(Boolean).length;
}

/** Aplica la escala de texto a `<html>` (100 % deja el valor del CSS). */
export function applyFontScale(root: HTMLElement, scale: number): void {
  root.style.fontSize = scale === DEFAULT_FONT_SCALE ? "" : `${scale}%`;
}

export function applyVisualFlag(
  root: HTMLElement,
  flag: A11yVisualFlag,
  on: boolean,
): void {
  root.classList.toggle(A11Y_ROOT_CLASSES[flag], on);
}

/**
 * Guarda una preferencia. Si el almacenamiento está bloqueado no se guarda,
 * pero el cambio en pantalla ya se aplicó: dura lo que dure la visita.
 */
export function persistA11yFlag(flag: A11yFlag, value: boolean): void {
  writeStoredItem(A11Y_STORAGE_KEYS[flag], String(value));
}

export function persistFontScale(scale: number): void {
  writeStoredItem(A11Y_STORAGE_KEYS.fontScale, String(scale));
}

export function clearA11yPreferences(): void {
  for (const key of Object.values(A11Y_STORAGE_KEYS)) removeStoredItem(key);
}

/**
 * Fragmento para el script inline del `<head>` (`root.tsx`). Corre dentro de
 * su `try` y antes del primer pintado. Se arma con las mismas constantes de
 * arriba para que el panel y el bootstrap no puedan desincronizarse; son
 * literales fijos, sin nada que venga de la persona.
 */
export const A11Y_BOOTSTRAP = [
  `var fs=Number(localStorage.getItem(${JSON.stringify(A11Y_STORAGE_KEYS.fontScale)}));`,
  `if(${JSON.stringify(FONT_SCALES.filter((s) => s !== DEFAULT_FONT_SCALE))}.indexOf(fs)>=0)document.documentElement.style.fontSize=fs+'%';`,
  `var a11y=${JSON.stringify(
    Object.fromEntries(
      (Object.keys(A11Y_ROOT_CLASSES) as A11yVisualFlag[]).map((flag) => [
        A11Y_STORAGE_KEYS[flag],
        A11Y_ROOT_CLASSES[flag],
      ]),
    ),
  )};`,
  `for(var k in a11y)if(localStorage.getItem(k)==='true')document.documentElement.classList.add(a11y[k]);`,
].join("\n");
