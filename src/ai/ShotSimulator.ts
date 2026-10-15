import { DT, WORLD_W } from "../game/constants";
import { Projectile } from "../entities/Projectile";
import type { Terrain } from "../terrain/Terrain";
import { explosionDamage, shotSpeed } from "../weapons/Weapon";
import type { WeaponDef } from "../weapons/Weapon";
import { WORM_HIT_RADIUS } from "../game/constants";

export interface SimTarget {
  id: number;
  team: number;
  /** Mittelpunkt des Wurms. */
  x: number;
  y: number;
}

export interface SimShot {
  facing: 1 | -1;
  /** Winkel in Grad über der Waagerechten. */
  angle: number;
  /** Stärke in [0, 1]. */
  power: number;
}

export interface SimResult {
  /** Detonation (Aufschlag oder Treffer); `null`, wenn der Schuss im Wasser/ins Leere ging. */
  impact: { x: number; y: number } | null;
  /** Schuss traf unmittelbar einen Wurm. */
  directHitId: number | null;
  splashed: boolean;
  /** Flugzeit in Sekunden. */
  time: number;
}

const MAX_SIM_TIME = 8;

/**
 * Simuliert einen Bazooka-Schuss. Verwendet dieselbe `Projectile`-Physik wie
 * das Spiel, aber ohne Rendering, Ereignisse oder Schadensverteilung.
 */
export function simulateShot(
  terrain: Terrain,
  def: WeaponDef,
  origin: { x: number; y: number },
  shot: SimShot,
  wind: number,
  targets: readonly SimTarget[],
  shooterId: number,
): SimResult {
  const rad = (shot.angle * Math.PI) / 180;
  const dirX = shot.facing * Math.cos(rad);
  const dirY = -Math.sin(rad);
  const speed = shotSpeed(def, shot.power);
  let px = origin.x + dirX * 14;
  let py = origin.y + dirY * 14;
  if (terrain.isSolid(px, py)) {
    px = origin.x;
    py = origin.y;
  }
  const p = new Projectile(0, "bazooka", px, py, dirX * speed, dirY * speed, null, 0, -1, shooterId);

  let directHitId: number | null = null;
  const contact = (x: number, y: number): boolean => {
    for (const t of targets) {
      if (t.id === shooterId && p.age < 0.3) continue;
      if (Math.hypot(t.x - x, t.y - y) <= WORM_HIT_RADIUS) {
        directHitId = t.id;
        return true;
      }
    }
    return false;
  };

  let time = 0;
  while (p.alive && time < MAX_SIM_TIME) {
    const events = p.update(terrain, DT, wind, contact);
    time += DT;
    for (const e of events) {
      if (e.type === "explode") return { impact: { x: e.x, y: e.y }, directHitId, splashed: false, time };
      if (e.type === "splash") return { impact: null, directHitId: null, splashed: true, time };
    }
  }
  return { impact: null, directHitId: null, splashed: false, time };
}

export interface ShotScore {
  score: number;
  expectedDamage: number;
}

/**
 * Bewertet einen simulierten Schuss.
 * Direkter Treffer und Nähe sind Bonus, eigener Schaden ein starker Malus,
 * Terraintreffer ohne Gegnerschaden neutral bis leicht negativ.
 */
export function scoreShot(
  result: SimResult,
  def: WeaponDef,
  shooter: SimTarget,
  targets: readonly SimTarget[],
  /** Ist der Schütze nahe am Wasser (Risiko, selbst hineingestoßen zu werden)? */
  shooterNearWater: boolean,
): ShotScore {
  if (!result.impact) return { score: -8, expectedDamage: 0 };
  const { x, y } = result.impact;
  let enemyDamage = 0;
  let ownDamage = 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (const t of targets) {
    const d = Math.hypot(t.x - x, t.y - y);
    const dmg = explosionDamage(def, d);
    if (t.id === shooter.id) {
      ownDamage += dmg * 3;
    } else if (t.team === shooter.team) {
      ownDamage += dmg * 2;
    } else {
      enemyDamage += dmg;
      nearest = Math.min(nearest, d);
    }
  }
  let score = enemyDamage - ownDamage;
  if (result.directHitId !== null) {
    const hit = targets.find((t) => t.id === result.directHitId);
    if (hit && hit.team !== shooter.team) score += 14;
  }
  if (Number.isFinite(nearest)) score += 24 / (1 + nearest / 40);
  if (enemyDamage === 0 && ownDamage === 0) score -= 2;
  // Selbstgefährdung: in der Nähe des Wassers wird Eigenschaden zusätzlich bestraft.
  const selfDist = Math.hypot(shooter.x - x, shooter.y - y);
  if (shooterNearWater && selfDist < def.explosionRadius * 2.2) score -= 25;
  if (x < 0 || x > WORLD_W) score -= 5;
  return { score, expectedDamage: enemyDamage - ownDamage };
}
