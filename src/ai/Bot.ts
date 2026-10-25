import { AIM_RATE, DROWN_Y, DT, GRAVITY, WORLD_W } from "../game/constants";
import { bodyBlocked } from "../entities/Worm";
import type { Game } from "../game/Game";
import { IDLE_INPUT } from "../game/Game";
import { type Rng, gaussish, randRange } from "../game/rng";
import type { AiLevel, InputState } from "../types";
import { WEAPONS } from "../weapons/weapons";
import { type ShotScore, type SimShot, type SimTarget, scoreShot, simulateShot } from "./ShotSimulator";

export interface LevelParams {
  /** Anzahl simulierter Schüsse pro Planung. */
  samples: number;
  /** Verfeinerungsrunden um den besten Schuss. */
  refineRounds: number;
  /** Streuung des tatsächlich ausgeführten Schusses (Grad / Stärke). */
  angleError: number;
  powerError: number;
  /** Bei den besten K Schüssen zufällig wählen (mehr = fehleranfälliger). */
  pickFromTop: number;
  /** Wie oft der Wurm vor dem Schuss Position suchen darf. */
  repositionRounds: number;
  /** Mindestbewertung für einen „sinnvollen“ Schuss. */
  threshold: number;
  /** Chance, bei schlechter Lage Teleport zu nutzen. */
  teleportChance: number;
  thinkDelay: [number, number];
}

export const LEVELS: Record<AiLevel, LevelParams> = {
  easy: {
    samples: 18,
    refineRounds: 0,
    angleError: 9,
    powerError: 0.15,
    pickFromTop: 4,
    repositionRounds: 1,
    threshold: 6,
    teleportChance: 0.2,
    thinkDelay: [0.9, 1.7],
  },
  normal: {
    samples: 90,
    refineRounds: 1,
    angleError: 3,
    powerError: 0.045,
    pickFromTop: 1,
    repositionRounds: 2,
    threshold: 11,
    teleportChance: 0.5,
    thinkDelay: [0.7, 1.3],
  },
  hard: {
    samples: 220,
    refineRounds: 2,
    angleError: 0.7,
    powerError: 0.012,
    pickFromTop: 1,
    repositionRounds: 3,
    threshold: 16,
    teleportChance: 0.8,
    thinkDelay: [0.5, 1.0],
  },
};

interface Plan extends SimShot {
  score: number;
}

type BotState = "delay" | "plan" | "walk" | "turn-around" | "aim" | "charge" | "settle" | "done";

/** So viele Schuss-Simulationen pro Tick: Die Planung verteilt sich auf viele Bilder statt das Spiel anzuhalten. */
const SIMS_PER_TICK = 8;

/**
 * KI-Gegner. Erzeugt pro Tick denselben `InputState` wie ein Mensch:
 * Der Schuss wird mit Winkelrate und Aufladerate der Spielregeln ausgeführt.
 */
export class Bot {
  private readonly params: LevelParams;
  private state: BotState = "delay";
  private timer = 0;
  private turnNumber = -1;
  private plan: Plan | null = null;
  private roundsLeft = 0;
  private walkDir: -1 | 1 = 1;
  private walkTicks = 0;
  private teleported = false;
  /** Laufende, schrittweise Schussplanung und ihr fertiges Ergebnis. */
  private gen: Generator<void, Plan> | null = null;
  private ready: Plan | null = null;

  constructor(
    level: AiLevel,
    private readonly rng: Rng,
  ) {
    this.params = LEVELS[level];
  }

  /** Liefert die Eingabe für diesen Tick. */
  update(game: Game): InputState {
    if (game.turns.turnNumber !== this.turnNumber) this.startTurn(game);
    if (game.phase !== "turn") return IDLE_INPUT;
    const worm = game.activeWorm;
    if (!worm.alive || !worm.grounded) return IDLE_INPUT;

    switch (this.state) {
      case "delay":
        // Die Planung läuft schon während der „Denkpause“; nach deren Ende liegt meist alles bereit.
        this.timer -= DT;
        if (!this.ready) this.advancePlan(game);
        if (this.timer <= 0 && this.ready) this.decide(game);
        return IDLE_INPUT;

      case "plan":
        if (this.advancePlan(game)) this.decide(game);
        return IDLE_INPUT;

      case "walk": {
        if (this.walkTicks-- <= 0 || !this.canWalk(game, this.walkDir)) {
          this.state = "settle";
          this.timer = 0.25;
          return IDLE_INPUT;
        }
        return { move: this.walkDir, aim: 0, charge: false };
      }

      case "settle":
        this.timer -= DT;
        if (this.timer <= 0) {
          this.ready = null;
          this.gen = null;
          this.state = "plan";
        }
        return IDLE_INPUT;

      case "turn-around": {
        const plan = this.plan!;
        if (worm.facing === plan.facing) {
          this.state = "aim";
          return IDLE_INPUT;
        }
        return { move: plan.facing, aim: 0, charge: false };
      }

      case "aim": {
        const plan = this.plan!;
        const diff = plan.angle - worm.aim;
        if (Math.abs(diff) <= (AIM_RATE * DT) / 2) {
          this.state = "charge";
          return IDLE_INPUT;
        }
        return { move: 0, aim: diff > 0 ? 1 : -1, charge: false };
      }

      case "charge": {
        const plan = this.plan!;
        if (game.power + 0.008 >= plan.power) {
          this.state = "done";
          return IDLE_INPUT; // Loslassen feuert.
        }
        return { move: 0, aim: 0, charge: true };
      }

      default:
        return IDLE_INPUT;
    }
  }

  private startTurn(game: Game): void {
    this.turnNumber = game.turns.turnNumber;
    this.state = "delay";
    this.timer = randRange(this.rng, ...this.params.thinkDelay);
    this.plan = null;
    this.gen = null;
    this.ready = null;
    this.roundsLeft = this.params.repositionRounds;
    this.teleported = false;
  }

  /** Nach Wartezeit oder Positionswechsel: Schuss planen, sonst Position verbessern. */
  private decide(game: Game): void {
    const plan = this.ready!;
    this.ready = null;
    this.plan = plan;
    const enemies = game.enemiesOf(game.activeTeam.index);
    if (enemies.length === 0) {
      this.state = "done";
      return;
    }

    if (plan.score < this.params.threshold) {
      if (this.roundsLeft > 0) {
        const dir = this.directionToNearest(game);
        if (this.canWalk(game, dir)) {
          this.roundsLeft--;
          this.walkDir = dir;
          this.walkTicks = 30 + Math.floor(this.rng() * 30);
          this.state = "walk";
          return;
        }
        this.roundsLeft = 0;
      }
      if (!this.teleported && this.tryTeleport(game)) return;
    }

    this.state = "turn-around";
    this.applyError(plan);
  }

  private tryTeleport(game: Game): boolean {
    const team = game.activeTeam;
    if (team.ammo.teleport <= 0 || this.rng() > this.params.teleportChance) return false;
    const worm = game.activeWorm;
    const enemies = game.enemiesOf(team.index);
    if (enemies.length === 0) return false;
    let best: { x: number; y: number; cost: number } | null = null;
    for (let i = 0; i < 60; i++) {
      const x = randRange(this.rng, 80, WORLD_W - 80);
      const surface = game.terrain.findSurfaceY(x, 0);
      if (surface < 0 || surface > DROWN_Y - 100) continue;
      const y = surface - 1;
      if (bodyBlocked(game.terrain, x, y)) continue;
      const nearest = Math.min(...enemies.map((e) => Math.hypot(e.x - x, e.y - y)));
      if (nearest < 220) continue; // nicht direkt vor die Füße des Gegners
      const cost = nearest;
      if (!best || cost < best.cost) best = { x, y, cost };
    }
    if (!best || Math.abs(best.x - worm.x) < 120) return false;
    if (!game.selectWeapon("teleport")) return false;
    if (!game.teleportTo(best.x, best.y)) {
      game.selectWeapon("bazooka");
      return false;
    }
    this.teleported = true;
    this.state = "settle";
    this.timer = 0.6;
    return true;
  }

  private directionToNearest(game: Game): -1 | 1 {
    const worm = game.activeWorm;
    const enemies = game.enemiesOf(game.activeTeam.index);
    let nearest = enemies[0]!;
    for (const e of enemies) {
      if (Math.abs(e.x - worm.x) < Math.abs(nearest.x - worm.x)) nearest = e;
    }
    return nearest.x >= worm.x ? 1 : -1;
  }

  /** Läuft der Wurm in sicherem Gelände (kein Wasser/Abgrund voraus)? */
  private canWalk(game: Game, dir: -1 | 1): boolean {
    const worm = game.activeWorm;
    for (const ahead of [14, 30]) {
      const x = worm.x + dir * ahead;
      if (x < 40 || x > WORLD_W - 40) return false;
      const surface = game.terrain.findSurfaceY(x, Math.max(0, worm.y - 40));
      if (surface < 0 || surface > DROWN_Y - 45 || surface - worm.y > 40) return false;
    }
    return true;
  }

  private snapshotTargets(game: Game): SimTarget[] {
    return game.worms
      .filter((w) => w.alive)
      .map((w) => ({ id: w.id, team: w.team, x: w.centerX, y: w.centerY }));
  }

  /** Rechnet einige Simulationen weiter; liefert true, sobald die Planung fertig ist (Ergebnis in `ready`). */
  private advancePlan(game: Game): boolean {
    this.gen ??= this.planShotSteps(game);
    for (let i = 0; i < SIMS_PER_TICK; i++) {
      const r = this.gen.next();
      if (r.done) {
        this.ready = r.value;
        this.gen = null;
        return true;
      }
    }
    return false;
  }

  /** Simuliert viele Schüsse (nach jeder Simulation wird abgegeben) und gibt den besten zurück. */
  private *planShotSteps(game: Game): Generator<void, Plan> {
    const worm = game.activeWorm;
    const def = WEAPONS.bazooka;
    const targets = this.snapshotTargets(game);
    const me: SimTarget = { id: worm.id, team: worm.team, x: worm.centerX, y: worm.centerY };
    const enemies = targets
      .filter((t) => t.team !== worm.team)
      .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))
      .slice(0, 3);
    const nearWater = worm.y > DROWN_Y - 140;
    const origin = { x: worm.centerX, y: worm.centerY };
    const wind = game.wind;

    const results: Plan[] = [];
    const evaluate = (shot: SimShot): Plan => {
      const sim = simulateShot(game.terrain, def, origin, shot, wind, targets, worm.id);
      const s: ShotScore = scoreShot(sim, def, me, targets, nearWater);
      const plan: Plan = { ...shot, score: s.score };
      results.push(plan);
      return plan;
    };

    if (enemies.length === 0) {
      return { facing: worm.facing, angle: worm.aim, power: 0.5, score: 0 };
    }

    for (let i = 0; i < this.params.samples; i++) {
      const enemy = enemies[i % enemies.length]!;
      const facing: 1 | -1 = enemy.x >= me.x ? 1 : -1;
      const angle = randRange(this.rng, 6, 80);
      const power = guessPower(def.maxSpeed, def.minSpeedFraction, Math.abs(enemy.x - me.x), me.y - enemy.y, angle, this.rng);
      evaluate({ facing, angle, power });
      yield;
    }

    for (let round = 0; round < this.params.refineRounds && results.length > 0; round++) {
      const best = bestOf(results);
      const spread = round === 0 ? 1 : 0.4;
      for (let i = 0; i < 40; i++) {
        evaluate({
          facing: best.facing,
          angle: clamp(best.angle + gaussish(this.rng) * 3 * spread, 2, 85),
          power: clamp(best.power + gaussish(this.rng) * 0.06 * spread, 0.05, 1),
        });
        yield;
      }
    }

    if (results.length === 0) return { facing: worm.facing, angle: worm.aim, power: 0.6, score: -100 };
    results.sort((a, b) => b.score - a.score);
    const k = Math.min(this.params.pickFromTop, results.length);
    return { ...results[Math.floor(this.rng() * k)]! };
  }

  /** Fügt die schwierigkeitsabhängige Ungenauigkeit hinzu. */
  private applyError(plan: Plan): void {
    plan.angle = clamp(plan.angle + gaussish(this.rng) * this.params.angleError, 0, 85);
    plan.power = clamp(plan.power + gaussish(this.rng) * this.params.powerError, 0.05, 1);
  }
}

function bestOf(plans: readonly Plan[]): Plan {
  let best = plans[0]!;
  for (const p of plans) if (p.score > best.score) best = p;
  return best;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Stärke für einen Wurf ohne Wind: Parabelformel nach dem Abstand `dx` und der
 * Höhe des Ziels `dyUp` (positiv = Ziel liegt höher). Mit etwas Streuung, damit
 * die Simulation den Windeinfluss „abtasten“ kann.
 */
function guessPower(maxSpeed: number, minFrac: number, dx: number, dyUp: number, angleDeg: number, rng: Rng): number {
  const a = (angleDeg * Math.PI) / 180;
  const denom = 2 * Math.cos(a) ** 2 * (dx * Math.tan(a) - dyUp);
  let power: number;
  if (denom <= 1e-6) {
    power = randRange(rng, 0.5, 1);
  } else {
    const v = Math.sqrt((GRAVITY * dx * dx) / denom);
    power = (v / maxSpeed - minFrac) / (1 - minFrac);
  }
  return clamp(power * (1 + (rng() - 0.5) * 0.3), 0.05, 1);
}
