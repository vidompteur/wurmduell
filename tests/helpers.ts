import { Game } from "../src/game/Game";
import { WORLD_H, WORLD_W } from "../src/game/constants";
import { mulberry32 } from "../src/game/rng";
import type { GeneratedMap } from "../src/terrain/MapGenerator";
import { Terrain } from "../src/terrain/Terrain";
import type { GameEvent } from "../src/game/GameState";
import type { MatchConfig } from "../src/types";
import type { StorageLike } from "../src/ladder/LadderStore";

export const GROUND_Y = 1000;

/** Ebenes Testgelände: Boden ab `GROUND_Y`, sechs Startpunkte im Abstand von 300 px. */
export function flatMap(groundY = GROUND_Y): GeneratedMap {
  const terrain = new Terrain(WORLD_W, WORLD_H);
  for (let y = groundY; y < WORLD_H; y++) terrain.mask.fill(1, y * WORLD_W, (y + 1) * WORLD_W);
  const spawnPoints = [400, 700, 1000, 1300, 1600, 1900].map((x) => ({ x, y: groundY - 1 }));
  return { terrain, spawnPoints, seed: "flat" };
}

export function config(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return {
    mode: "hotseat",
    wormsPerTeam: 3,
    teams: [
      { name: "Rot", controller: { kind: "human", playerId: "p_rot" }, wormNames: ["R1", "R2", "R3"] },
      { name: "Blau", controller: { kind: "human", playerId: "p_blau" }, wormNames: ["B1", "B2", "B3"] },
    ],
    ...overrides,
  };
}

export interface TestGame {
  game: Game;
  events: GameEvent[];
}

export function makeGame(map: GeneratedMap = flatMap(), cfg: MatchConfig = config(), seed = 1): TestGame {
  const events: GameEvent[] = [];
  const game = new Game(cfg, mulberry32(seed), map, (e) => events.push(e));
  // Würmer erst einmal landen lassen.
  for (let i = 0; i < 100; i++) game.tick(0.02);
  return { game, events };
}

/** Lädt die Schussstärke bis `power` auf und lässt die Leertaste los. */
export function shoot(game: Game, power: number): void {
  game.input = { move: 0, aim: 0, charge: true };
  for (let i = 0; i < 400 && game.power < power && game.phase === "turn"; i++) game.tick(0.02);
  game.input = { move: 0, aim: 0, charge: false };
  game.tick(0.02);
}

export function runUntil(game: Game, done: () => boolean, maxSeconds = 120): void {
  for (let i = 0; i < maxSeconds * 50 && !done(); i++) game.tick(0.02);
}

/** Speicher im Arbeitsspeicher (statt localStorage). */
export class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}
