import { RETREAT_TIME, TURN_TIME } from "./constants";
import type { Rng } from "./rng";

export interface TurnSlot {
  team: number;
  wormId: number;
}

/**
 * Verwaltet Zugreihenfolge, Zugzeit, Rückzugsphase und Wind.
 * Reine Logik ohne DOM, vollständig deterministisch über den injizierten RNG.
 */
export class TurnManager {
  activeTeam = -1;
  activeWorm = -1;
  turnNumber = 0;
  timeLeft = TURN_TIME;
  retreatLeft = 0;
  /** Wind in [-1, 1]; negativ = nach links. */
  wind = 0;
  private readonly cursor: number[];

  constructor(
    private readonly teamWorms: readonly (readonly number[])[],
    private readonly rng: Rng,
  ) {
    this.cursor = teamWorms.map(() => -1);
  }

  /** Beginnt die Partie mit einem zufälligen Team. */
  start(isAlive: (wormId: number) => boolean): TurnSlot | null {
    const first = Math.floor(this.rng() * this.teamWorms.length);
    this.activeTeam = (first - 1 + this.teamWorms.length) % this.teamWorms.length;
    return this.nextTurn(isAlive);
  }

  /** Wechselt zum nächsten lebenden Team und dessen nächstem lebenden Wurm. */
  nextTurn(isAlive: (wormId: number) => boolean): TurnSlot | null {
    const n = this.teamWorms.length;
    for (let i = 1; i <= n; i++) {
      const team = (this.activeTeam + i) % n;
      const worms = this.teamWorms[team]!;
      for (let k = 1; k <= worms.length; k++) {
        const idx = (this.cursor[team]! + k + worms.length) % worms.length;
        const wormId = worms[idx]!;
        if (isAlive(wormId)) {
          this.cursor[team] = idx;
          this.activeTeam = team;
          this.activeWorm = wormId;
          this.turnNumber++;
          this.timeLeft = TURN_TIME;
          this.retreatLeft = 0;
          this.wind = this.rollWind();
          return { team, wormId };
        }
      }
    }
    return null;
  }

  private rollWind(): number {
    // Dreiecksverteilung: schwacher Wind ist häufiger als starker.
    const w = this.rng() + this.rng() - 1;
    return Math.round(w * 20) / 20;
  }

  /** Zählt die Zugzeit herunter; `true`, wenn sie abgelaufen ist. */
  tickTurn(dt: number): boolean {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    return this.timeLeft <= 0;
  }

  startRetreat(): void {
    this.retreatLeft = RETREAT_TIME;
  }

  /** Zählt die Rückzugszeit herunter; `true`, wenn sie abgelaufen ist. */
  tickRetreat(dt: number): boolean {
    this.retreatLeft = Math.max(0, this.retreatLeft - dt);
    return this.retreatLeft <= 0;
  }
}
