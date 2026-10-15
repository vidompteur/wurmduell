import type { Settings } from "../types";

export const SETTINGS_KEY = "wurmduell.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  soundEnabled: true,
  volume: 0.6,
  lastSetup: {
    mode: "vsAi",
    aiLevel: "normal",
    wormsPerTeam: 3,
    names: ["Spieler 1", "Spieler 2"],
  },
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const p = JSON.parse(raw) as Partial<Settings>;
    const last = p.lastSetup;
    return {
      soundEnabled: typeof p.soundEnabled === "boolean" ? p.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
      volume: typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : DEFAULT_SETTINGS.volume,
      lastSetup: {
        mode: last?.mode === "hotseat" || last?.mode === "vsAi" ? last.mode : DEFAULT_SETTINGS.lastSetup.mode,
        aiLevel:
          last?.aiLevel === "easy" || last?.aiLevel === "normal" || last?.aiLevel === "hard"
            ? last.aiLevel
            : DEFAULT_SETTINGS.lastSetup.aiLevel,
        wormsPerTeam: last?.wormsPerTeam === 2 ? 2 : 3,
        names:
          Array.isArray(last?.names) && typeof last.names[0] === "string" && typeof last.names[1] === "string"
            ? [last.names[0], last.names[1]]
            : [...DEFAULT_SETTINGS.lastSetup.names],
      },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* Speicher nicht verfügbar – Einstellungen gelten nur für diese Sitzung */
  }
}
