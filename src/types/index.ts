export interface Vec2 {
  x: number;
  y: number;
}

export type WeaponId = "bazooka" | "grenade" | "dynamite" | "shotgun" | "teleport";
export type AiLevel = "easy" | "normal" | "hard";
export type MatchMode = "hotseat" | "vsAi";

export type TeamController =
  | { kind: "human"; playerId: string }
  | { kind: "ai"; level: AiLevel };

export interface TeamConfig {
  name: string;
  controller: TeamController;
  wormNames: string[];
}

export interface MatchConfig {
  mode: MatchMode;
  wormsPerTeam: 2 | 3;
  /** Teleports pro Team (Standard: `CONFIG.rules.teleports`). */
  teleports?: number;
  /** „Pure“-Modus: nur die Bazooka ist verfügbar. */
  pure?: boolean;
  /** Optional: fester Seed (Tests/Debug). Sonst wird pro Partie ein neuer erzeugt. */
  seed?: string;
  teams: [TeamConfig, TeamConfig];
}

/** Eingabe pro Tick – identisch für Menschen und KI. */
export interface InputState {
  /** -1 links, 1 rechts */
  move: -1 | 0 | 1;
  /** 1 = Winkel nach oben, -1 nach unten */
  aim: -1 | 0 | 1;
  /** Leertaste gedrückt */
  charge: boolean;
}

export interface TeamStats {
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  damageTaken: number;
}

export interface TeamResult {
  name: string;
  controller: TeamController;
  stats: TeamStats;
  wormsAlive: number;
}

export interface MatchResult {
  /** Index des Siegerteams, `null` bei Unentschieden. */
  winner: number | null;
  reason: "elimination" | "surrender";
  teams: [TeamResult, TeamResult];
  durationSeconds: number;
  mapSeed: string;
  config: MatchConfig;
}

/** Zeile der Ladder (siehe Spezifikation 7.2). */
export interface LadderEntry {
  playerId: string;
  name: string;
  matches: number;
  wins: number;
  losses: number;
  shotsFired: number;
  shotsHit: number;
  damageDealt: number;
  damageTaken: number;
  bestWinStreak: number;
  currentWinStreak: number;
  updatedAt: string;
}

export interface Ladder {
  version: 1;
  entries: LadderEntry[];
}

export interface Settings {
  soundEnabled: boolean;
  volume: number;
  /** Ansichtsgröße beim Spielstart (Bildschirm-Pixel pro Welt-Pixel). */
  zoom: number;
  /** Steuerungs-Legende im Spiel anzeigen. */
  showLegend: boolean;
  lastSetup: {
    mode: MatchMode;
    aiLevel: AiLevel;
    wormsPerTeam: 2 | 3;
    teleports: number;
    pure: boolean;
    names: [string, string];
  };
}
