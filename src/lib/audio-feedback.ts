import { isSoundPreferenceOn } from "./accessibility-preferences";

/**
 * Generador de sonidos cívicos sutiles mediante la Web Audio API nativa.
 * No requiere archivos externos de audio, es completamente determinista y respeta
 * las preferencias de accesibilidad del usuario.
 */

export type CivicSoundType =
  "click" | "vote" | "celebrate" | "toggle" | "reset";

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtxClass) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AudioCtxClass();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isSoundFeedbackEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return isSoundPreferenceOn();
}

export function playCivicSound(type: CivicSoundType = "click"): void {
  if (!isSoundFeedbackEnabled()) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case "click": {
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
        break;
      }
      case "toggle": {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.setValueAtTime(660, now + 0.04);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }
      case "vote": {
        osc.type = "sine";
        osc.frequency.setValueAtTime(392, now); // G4
        osc.frequency.setValueAtTime(523.25, now + 0.06); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
        break;
      }
      case "celebrate": {
        // Melodía triunfal cívica
        osc.type = "triangle";
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        osc.frequency.setValueAtTime(1046.5, now + 0.24); // C6
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
        osc.start(now);
        osc.stop(now + 0.38);
        break;
      }
      case "reset": {
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      }
    }
  } catch {
    // Silencioso ante falta de permisos de audio
  }
}
