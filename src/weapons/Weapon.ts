import type { WeaponId } from "../types";

export interface WeaponDef {
  id: WeaponId;
  /** Taste in der Waffenleiste. */
  key: string;
  kind: "projectile" | "hitscan" | "utility";
  /** Winkel einstellbar? */
  aimable: boolean;
  /** Stärke wird durch Halten der Leertaste aufgeladen? */
  chargeable: boolean;
  /** Abschussgeschwindigkeit bei voller Stärke (px/s). */
  maxSpeed: number;
  /** Anteil der Maximalgeschwindigkeit bei Stärke 0. */
  minSpeedFraction: number;
  /** Radius des Kraters (px). */
  explosionRadius: number;
  /** Schaden im Explosionszentrum. */
  maxDamage: number;
  /** Rückstoß im Zentrum (px/s). */
  knockback: number;
  /** Zündzeit in Sekunden (Granate, Dynamit). */
  fuse?: number;
  /** Schüsse pro Zug. */
  shotsPerTurn: number;
  /** Begrenzte Munition pro Team und Partie; `null` = unbegrenzt. */
  ammo: number | null;
  /** Zählt als Schuss für die Zielgenauigkeit. */
  countsAsShot: boolean;
}

/** Wie weit (Faktor auf den Kraterradius) ein Wurm vom Explosionszentrum noch Schaden nimmt. */
export const DAMAGE_REACH = 1.5;

/**
 * Explosionsschaden in Abhängigkeit vom Abstand zum Zentrum: linear fallend,
 * 0 jenseits der Reichweite.
 */
export function explosionDamage(def: Pick<WeaponDef, "explosionRadius" | "maxDamage">, distance: number): number {
  const reach = def.explosionRadius * DAMAGE_REACH;
  if (distance >= reach) return 0;
  return Math.round(def.maxDamage * (1 - distance / reach));
}

/** Stärke des Rückstoßes in [0, 1] abhängig vom Abstand. */
export function explosionFalloff(def: Pick<WeaponDef, "explosionRadius">, distance: number): number {
  const reach = def.explosionRadius * DAMAGE_REACH;
  if (distance >= reach) return 0;
  return 1 - distance / reach;
}

/** Abschussgeschwindigkeit (px/s) für eine Stärke in [0, 1]. */
export function shotSpeed(def: Pick<WeaponDef, "maxSpeed" | "minSpeedFraction">, power: number): number {
  const p = Math.min(1, Math.max(0, power));
  return def.maxSpeed * (def.minSpeedFraction + (1 - def.minSpeedFraction) * p);
}
