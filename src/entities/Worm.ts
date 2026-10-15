import {
  AIM_MAX,
  AIM_MIN,
  CLIMB_STEP,
  DROWN_Y,
  FALL_DAMAGE_MAX,
  FALL_DAMAGE_THRESHOLD,
  GRAVITY,
  WALK_SPEED,
  WORLD_W,
  WORM_BODY_H,
  WORM_CENTER_OFFSET,
  WORM_HALF_W,
  WORM_MAX_HP,
} from "../game/constants";
import type { Terrain } from "../terrain/Terrain";

export interface WormStepResult {
  /** Fallhöhe in Pixeln, falls der Wurm in diesem Tick gelandet ist. */
  landedFall?: number;
  drowned?: boolean;
}

const SAMPLE_DX = [-WORM_HALF_W, 0, WORM_HALF_W] as const;
const SAMPLE_DY = [0, 5, 10, WORM_BODY_H] as const;

/** Prüft, ob der Körper eines Wurms mit den Füßen bei (x, y) im Terrain steckt. */
export function bodyBlocked(terrain: Terrain, x: number, y: number): boolean {
  for (const dx of SAMPLE_DX) {
    for (const dy of SAMPLE_DY) {
      if (terrain.isSolid(x + dx, y - dy)) return true;
    }
  }
  return false;
}

/**
 * Steht der Wurm auf festem Grund? Verwendet dieselbe Körperprüfung wie die
 * Landung (`bodyBlocked` eine Zeile tiefer), damit „gelandet“ und „steht“
 * nie auseinanderlaufen.
 */
export function standingOnGround(terrain: Terrain, x: number, y: number): boolean {
  return bodyBlocked(terrain, x, Math.floor(y) + 1);
}

/** Wurm: Position bezeichnet die Füße (x = Mitte, y = unterste Körperzeile). */
export class Worm {
  readonly id: number;
  readonly team: number;
  readonly name: string;
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  hp = WORM_MAX_HP;
  facing: 1 | -1;
  /** Zielwinkel in Grad über der Waagerechten (positiv = nach oben). */
  aim = 30;
  /** Lebt, solange HP > 0 und nicht ertrunken. */
  alive = true;
  /** Gestorben durch HP-Verlust: bleibt als Grabstein liegen und fällt weiter. */
  grave = false;
  grounded = false;
  /** Höchster Punkt (kleinstes y) seit Beginn der Flugphase. */
  private airTopY: number;
  private airborne = false;
  private walkCarry = 0;

  constructor(id: number, team: number, name: string, x: number, y: number, facing: 1 | -1) {
    this.id = id;
    this.team = team;
    this.name = name;
    this.x = x;
    this.y = y;
    this.facing = facing;
    this.airTopY = y;
  }

  get centerX(): number {
    return this.x;
  }

  get centerY(): number {
    return this.y - WORM_CENTER_OFFSET;
  }

  /** Verhält sich physikalisch noch (lebendig oder Grabstein). */
  get active(): boolean {
    return this.alive || this.grave;
  }

  /** Bewegt sich noch (für die Auswertungsphase). */
  get moving(): boolean {
    return this.active && (!this.grounded || Math.abs(this.vx) > 4 || Math.abs(this.vy) > 4);
  }

  changeAim(delta: number): void {
    this.aim = Math.min(AIM_MAX, Math.max(AIM_MIN, this.aim + delta));
  }

  /** Setzt den Wurm an eine neue Position (Teleport); die Fallhöhe beginnt dort bei null. */
  placeAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.airborne = true;
    this.airTopY = y;
  }

  /** Stößt den Wurm weg (Explosion). */
  launch(vx: number, vy: number): void {
    this.vx += vx;
    this.vy += vy;
    this.grounded = false;
  }

  /** Läuft einen Tick in Richtung `dir`, klettert kleine Stufen. */
  walk(terrain: Terrain, dir: -1 | 1, dt: number): void {
    if (!this.active || !this.grounded) return;
    this.facing = dir;
    this.walkCarry += WALK_SPEED * dt;
    while (this.walkCarry >= 1) {
      this.walkCarry -= 1;
      const nx = this.x + dir;
      if (!bodyBlocked(terrain, nx, this.y)) {
        this.x = nx;
      } else {
        let climbed = false;
        for (let up = 1; up <= CLIMB_STEP; up++) {
          if (!bodyBlocked(terrain, nx, this.y - up)) {
            this.x = nx;
            this.y -= up;
            climbed = true;
            break;
          }
        }
        if (!climbed) {
          this.walkCarry = 0;
          return;
        }
      }
      // Bergab folgen, solange der Boden nah ist.
      if (!standingOnGround(terrain, this.x, this.y)) {
        for (let down = 1; down <= CLIMB_STEP; down++) {
          if (standingOnGround(terrain, this.x, this.y + down) && !bodyBlocked(terrain, this.x, this.y + down)) {
            this.y += down;
            break;
          }
        }
      }
      if (this.x < 0 || this.x >= WORLD_W) return;
    }
  }

  /** Ein Physik-Tick. */
  update(terrain: Terrain, dt: number): WormStepResult {
    const result: WormStepResult = {};
    if (!this.active) return result;

    const ground = this.vy >= 0 && standingOnGround(terrain, this.x, this.y);

    if (ground) {
      if (this.airborne) {
        this.land(result);
      }
      this.grounded = true;
      this.vy = 0;
      this.vx *= 0.72;
      if (Math.abs(this.vx) < 4) this.vx = 0;
      if (this.vx !== 0) this.slide(terrain, dt);
    } else {
      if (!this.airborne) {
        this.airborne = true;
        this.airTopY = this.y;
      }
      this.grounded = false;
      this.vy += GRAVITY * dt;
      this.fly(terrain, dt, result);
    }

    if (this.alive && (this.y >= DROWN_Y || this.x < -40 || this.x > WORLD_W + 40)) {
      this.alive = false;
      this.grave = false;
      this.hp = 0;
      this.grounded = false;
      result.drowned = true;
    }
    return result;
  }

  private land(result: WormStepResult): void {
    const fall = this.y - this.airTopY;
    this.airborne = false;
    this.airTopY = this.y;
    if (fall > FALL_DAMAGE_THRESHOLD) result.landedFall = fall;
  }

  private slide(terrain: Terrain, dt: number): void {
    const steps = Math.max(1, Math.ceil(Math.abs(this.vx * dt)));
    const sx = (this.vx * dt) / steps;
    for (let i = 0; i < steps; i++) {
      const nx = this.x + sx;
      if (!bodyBlocked(terrain, nx, this.y)) {
        this.x = nx;
      } else {
        let climbed = false;
        for (let up = 1; up <= CLIMB_STEP; up++) {
          if (!bodyBlocked(terrain, nx, this.y - up)) {
            this.x = nx;
            this.y -= up;
            climbed = true;
            break;
          }
        }
        if (!climbed) {
          this.vx = 0;
          return;
        }
      }
    }
  }

  private fly(terrain: Terrain, dt: number, result: WormStepResult): void {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(this.vx), Math.abs(this.vy)) * dt));
    const sx = (this.vx * dt) / steps;
    const sy = (this.vy * dt) / steps;
    for (let i = 0; i < steps; i++) {
      if (sx !== 0) {
        const nx = this.x + sx;
        if (!bodyBlocked(terrain, nx, this.y)) {
          this.x = nx;
        } else {
          this.vx *= -0.3;
        }
      }
      const ny = this.y + sy;
      if (sy > 0) {
        if (!bodyBlocked(terrain, this.x, ny)) {
          this.y = ny;
          this.airTopY = Math.min(this.airTopY, this.y);
          if (this.y >= DROWN_Y) return;
        } else {
          this.y = Math.floor(this.y);
          this.vy = 0;
          this.grounded = true;
          this.land(result);
          return;
        }
      } else if (sy < 0) {
        if (!bodyBlocked(terrain, this.x, ny)) {
          this.y = ny;
          this.airTopY = Math.min(this.airTopY, this.y);
        } else {
          this.vy = 0;
        }
      }
    }
  }
}

/** Fallschaden aus der Fallhöhe (0 unterhalb der Schwelle). */
export function fallDamage(fallHeight: number): number {
  if (fallHeight <= FALL_DAMAGE_THRESHOLD) return 0;
  return Math.min(FALL_DAMAGE_MAX, Math.ceil((fallHeight - FALL_DAMAGE_THRESHOLD) * 0.2));
}
