import type { MatchResult, TeamController, WeaponId } from "../types";

export type Phase = "turn" | "retreat" | "resolve" | "gameover";

export interface TeamState {
  index: number;
  name: string;
  controller: TeamController;
  wormIds: number[];
  /** Restmunition pro Waffe; `Infinity` = unbegrenzt. */
  ammo: Record<WeaponId, number>;
  selectedWeapon: WeaponId;
}

/** Ereignisse, die Spiellogik nach außen meldet (Rendering, Sound). */
export type GameEvent =
  | { type: "turnStart"; team: number; wormId: number; wind: number }
  | { type: "shoot"; weapon: WeaponId; x: number; y: number }
  | { type: "explosion"; x: number; y: number; radius: number }
  | { type: "bounce"; x: number; y: number }
  | { type: "splash"; x: number; y: number }
  | { type: "damage"; wormId: number; amount: number; x: number; y: number }
  | { type: "died"; wormId: number; cause: "damage" | "water"; x: number; y: number }
  | { type: "tracer"; x1: number; y1: number; x2: number; y2: number }
  | { type: "teleport"; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "countdown"; seconds: number }
  | { type: "retreat" }
  | { type: "matchEnd"; result: MatchResult };

export type GameEventHandler = (event: GameEvent) => void;
