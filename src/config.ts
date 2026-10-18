/**
 * Zentrale Standardwerte für alles, was Spieler:innen einstellen können.
 * Hier anpassen, um Defaults zu ändern; gespeicherte Einstellungen im Browser
 * (localStorage) haben weiterhin Vorrang.
 *
 * Physik- und Regelkonstanten (Zugzeit, Schwerkraft, Wurmgröße, …) liegen
 * bewusst in `game/constants.ts`, weil Tests und KI davon abhängen.
 */
import type { AiLevel, MatchMode } from "./types";

export const CONFIG = {
  view: {
    /** Start-Ansichtsgröße in Bildschirm-Pixeln pro Welt-Pixel (Retina-bereinigt). */
    zoomDefault: 1.4,
    zoomMin: 1,
    zoomMax: 3,
    /** Schrittweite des Reglers in den Einstellungen. */
    zoomSliderStep: 0.2,
    /** Faktor pro Tastendruck (+ / −) im Spiel. */
    zoomKeyFactor: 1.15,
    /** Obergrenze für die Pixeldichte, damit Retina/4K nicht unnötig viel rendert. */
    maxDpr: 2,
  },
  audio: {
    enabled: true,
    volume: 0.6,
  },
  hud: {
    /** Dezente Steuerungs-Legende im Spiel anzeigen. */
    showLegend: true,
  },
  rules: {
    /**
     * Bazooka-Reichweite relativ zum Ursprungswert (1 = original, 1.3 = 30 % weiter).
     * Die Reichweite wächst mit dem Quadrat der Abschussgeschwindigkeit, daher Wurzel.
     */
    bazookaRange: 1.3,
    /** Teleports pro Team und Partie (im Match-Setup einstellbar). */
    teleports: 1,
    /** Höchstwert, der im Match-Setup angeboten wird. */
    teleportsMax: 3,
  },
  setup: {
    mode: "vsAi" as MatchMode,
    aiLevel: "normal" as AiLevel,
    wormsPerTeam: 2 as 2 | 3,
    names: ["Spieler 1", "Spieler 2"] as [string, string],
  },
} as const;
