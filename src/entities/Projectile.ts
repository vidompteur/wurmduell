import { GRAVITY, WATER_Y, WIND_ACCEL, WORLD_H, WORLD_W } from "../game/constants";
import type { Terrain } from "../terrain/Terrain";

export type ProjectileKind = "bazooka" | "grenade" | "dynamite";

export type ProjectileEvent =
  | { type: "explode"; x: number; y: number }
  | { type: "splash"; x: number; y: number }
  | { type: "bounce"; x: number; y: number; speed: number };

/** Callback: liefert true, wenn bei (x, y) ein Wurm getroffen wird. */
export type ContactTest = (x: number, y: number) => boolean;

const SUBSTEP = 1.5;

interface MaterialParams {
  /** Anteil der Normalgeschwindigkeit, der beim Aufprall zurückfedert. */
  restitution: number;
  /** Anteil der Tangentialgeschwindigkeit, der erhalten bleibt. */
  friction: number;
}

const MATERIAL: Record<ProjectileKind, MaterialParams> = {
  bazooka: { restitution: 0, friction: 0 },
  grenade: { restitution: 0.5, friction: 0.78 },
  dynamite: { restitution: 0.05, friction: 0.4 },
};

/**
 * Flugkörper. Diese Klasse ist die einzige Implementierung der Schussphysik:
 * Spiel und KI-Simulation (`ShotSimulator`) verwenden sie gleichermaßen.
 */
export class Projectile {
  readonly id: number;
  readonly kind: ProjectileKind;
  /** Schuss, zu dem dieses Projektil gehört (für Statistiken). */
  readonly shotId: number;
  readonly ownerTeam: number;
  readonly ownerWorm: number;
  x: number;
  /** Position zu Beginn des letzten Ticks (nur für die interpolierte Darstellung). */
  px = Number.NaN;
  py = Number.NaN;
  y: number;
  vx: number;
  vy: number;
  /** Restzeit bis zur Zündung, `null` = Aufschlagzünder. */
  fuse: number | null;
  age = 0;
  alive = true;
  resting = false;
  bounces = 0;
  /** Drehwinkel zur Darstellung. */
  angle = 0;

  constructor(
    id: number,
    kind: ProjectileKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    fuse: number | null,
    shotId: number,
    ownerTeam: number,
    ownerWorm: number,
  ) {
    this.id = id;
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.fuse = fuse;
    this.shotId = shotId;
    this.ownerTeam = ownerTeam;
    this.ownerWorm = ownerWorm;
  }

  /** Ein Physik-Tick. Gibt die dabei eingetretenen Ereignisse zurück. */
  update(terrain: Terrain, dt: number, wind: number, contact?: ContactTest): ProjectileEvent[] {
    const events: ProjectileEvent[] = [];
    if (!this.alive) return events;
    this.age += dt;

    if (this.fuse !== null) {
      this.fuse -= dt;
      if (this.fuse <= 0) {
        this.alive = false;
        events.push({ type: "explode", x: this.x, y: this.y });
        return events;
      }
    }

    if (this.resting) {
      if (terrain.isSolid(this.x, this.y + 2)) return events;
      this.resting = false;
    }

    this.vy += GRAVITY * dt;
    if (this.kind === "bazooka") this.vx += wind * WIND_ACCEL * dt;

    const speed = Math.hypot(this.vx, this.vy);
    const steps = Math.max(1, Math.ceil((speed * dt) / SUBSTEP));
    const sx = (this.vx * dt) / steps;
    const sy = (this.vy * dt) / steps;
    if (speed > 1) this.angle = Math.atan2(this.vy, this.vx);

    for (let i = 0; i < steps; i++) {
      this.x += sx;
      this.y += sy;

      if (this.y >= WATER_Y) {
        this.alive = false;
        events.push({ type: "splash", x: this.x, y: WATER_Y });
        return events;
      }
      if (this.x < -500 || this.x > WORLD_W + 500 || this.y > WORLD_H + 300) {
        this.alive = false;
        return events;
      }

      if (this.kind === "bazooka") {
        if ((contact && contact(this.x, this.y)) || terrain.isSolid(this.x, this.y)) {
          this.alive = false;
          events.push({ type: "explode", x: this.x, y: this.y });
          return events;
        }
      } else if (terrain.isSolid(this.x, this.y)) {
        this.x -= sx;
        this.y -= sy;
        this.bounce(terrain, events);
        if (this.resting) return events;
        break;
      }
    }
    return events;
  }

  private bounce(terrain: Terrain, events: ProjectileEvent[]): void {
    const mat = MATERIAL[this.kind];
    const n = surfaceNormal(terrain, this.x + this.vx * 0.001, this.y + this.vy * 0.001, this.vx, this.vy);
    const vn = this.vx * n.x + this.vy * n.y;
    const incoming = vn < 0 ? -vn : 0;
    const tx = this.vx - vn * n.x;
    const ty = this.vy - vn * n.y;
    this.vx = tx * mat.friction + n.x * incoming * mat.restitution;
    this.vy = ty * mat.friction + n.y * incoming * mat.restitution;
    this.bounces++;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed < 28) {
      this.vx = 0;
      this.vy = 0;
      this.resting = true;
    } else {
      events.push({ type: "bounce", x: this.x, y: this.y, speed });
    }
  }
}

/** Näherung der Oberflächennormalen aus der Umgebung des Auftreffpunkts (zeigt in den freien Raum). */
export function surfaceNormal(
  terrain: Terrain,
  x: number,
  y: number,
  vx: number,
  vy: number,
): { x: number; y: number } {
  let nx = 0;
  let ny = 0;
  const r = 4;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      if (!terrain.isSolid(x + dx, y + dy)) {
        nx += dx;
        ny += dy;
      }
    }
  }
  const len = Math.hypot(nx, ny);
  if (len < 0.5) {
    const v = Math.hypot(vx, vy) || 1;
    return { x: -vx / v, y: -vy / v };
  }
  return { x: nx / len, y: ny / len };
}
