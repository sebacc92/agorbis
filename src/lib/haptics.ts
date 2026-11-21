import { isHapticPreferenceOn } from "./accessibility-preferences";

export type HapticPreset =
  "light" | "medium" | "heavy" | "selection" | "success" | "warning";

const PRESET_PATTERNS: Record<HapticPreset, number | number[]> = {
  light: 12,
  selection: 10,
  medium: 25,
  heavy: 45,
  success: [15, 50, 20],
  warning: [30, 60, 30],
};

export function isHapticFeedbackEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return isHapticPreferenceOn();
}

/**
 * Vibra en teléfonos compatibles si la persona encendió la vibración en el
 * panel de accesibilidad (viene apagada, D96). Va después de que algo pasó
 * —un toque que cambió algo o un resultado que la base confirmó—, nunca en
 * `onPointerDown$`: ahí vibraba también al empezar a desplazarse.
 * Acepta presets semánticos ("selection", "success", etc.) o duraciones en ms.
 */
export const triggerHapticFeedback = (
  pattern: number | number[] | HapticPreset = 15,
) => {
  if (typeof window === "undefined" || !("vibrate" in navigator)) return;
  if (!isHapticFeedbackEnabled()) return;
  try {
    const vibration =
      typeof pattern === "string" ? PRESET_PATTERNS[pattern] : pattern;
    navigator.vibrate(vibration);
  } catch {
    // Silencioso ante falta de permisos o políticas del navegador
  }
};
