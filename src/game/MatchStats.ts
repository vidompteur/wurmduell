import type { TeamStats } from "../types";

export function emptyStats(): TeamStats {
  return { shotsFired: 0, shotsHit: 0, damageDealt: 0, damageTaken: 0 };
}

export function accuracyOf(stats: Pick<TeamStats, "shotsFired" | "shotsHit">): number {
  return stats.shotsFired === 0 ? 0 : stats.shotsHit / stats.shotsFired;
}

/**
 * Statistik pro Team.
 *
 * - Ein Schuss ist ein Treffer, wenn er mindestens 1 Schaden an einem
 *   gegnerischen Wurm verursacht (pro Schuss höchstens ein Treffer).
 * - Selbst- und Teamschaden zählt weder als Treffer noch als verursachter Schaden.
 * - Fall- und Wasserschaden gehören keinem Schuss und werden nicht gezählt.
 */
export class MatchStats {
  readonly teams: TeamStats[];
  private readonly shots = new Map<number, { team: number; hit: boolean }>();
  private nextShotId = 1;

  constructor(teamCount: number) {
    this.teams = Array.from({ length: teamCount }, emptyStats);
  }

  /** Registriert einen abgefeuerten Schuss und gibt seine ID zurück. */
  registerShot(team: number): number {
    const id = this.nextShotId++;
    this.shots.set(id, { team, hit: false });
    this.teams[team]!.shotsFired++;
    return id;
  }

  /** Verbucht tatsächlich verlorene Lebenspunkte eines Wurms durch einen Schuss. */
  recordDamage(shotId: number, victimTeam: number, amount: number): void {
    const shot = this.shots.get(shotId);
    if (!shot || amount < 1 || shot.team === victimTeam) return;
    this.teams[shot.team]!.damageDealt += amount;
    this.teams[victimTeam]!.damageTaken += amount;
    if (!shot.hit) {
      shot.hit = true;
      this.teams[shot.team]!.shotsHit++;
    }
  }
}
