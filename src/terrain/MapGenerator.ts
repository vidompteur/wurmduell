import { DROWN_Y, WATER_Y, WORLD_H, WORLD_W } from "../game/constants";
import { type Rng, randRange, rngFromSeed, shuffle } from "../game/rng";
import type { Vec2 } from "../types";
import { Terrain } from "./Terrain";

export interface GeneratedMap {
  terrain: Terrain;
  /** Mögliche Startpunkte (Füße der Würmer), über die Karte verteilt, gemischt. */
  spawnPoints: Vec2[];
  seed: string;
}

export interface MapOptions {
  /** Offscreen-Bitmap erzeugen (nur im Browser). */
  withCanvas?: boolean;
  width?: number;
  height?: number;
  minSpawnPoints?: number;
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/** Wertrauschen in 1D mit Kosinus-Interpolation. */
function makeNoise1d(rng: Rng, size: number): (x: number) => number {
  const lattice = Array.from({ length: size + 2 }, () => rng());
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const t = (1 - Math.cos(f * Math.PI)) / 2;
    const a = lattice[Math.min(size, Math.max(0, i))]!;
    const b = lattice[Math.min(size + 1, Math.max(0, i + 1))]!;
    return a * (1 - t) + b * t;
  };
}

/**
 * Zufällige Inselkarte. Gleicher Seed → gleiche Karte.
 * Aufbau: Höhenprofil aus Rauschen, Wasserrinnen zwischen den Inseln,
 * Höhlen und kleine schwebende Inseln.
 */
export function generateMap(seed: string, options: MapOptions = {}): GeneratedMap {
  const width = options.width ?? WORLD_W;
  const height = options.height ?? WORLD_H;
  const minSpawns = options.minSpawnPoints ?? 6;
  const rng = rngFromSeed(seed);
  const terrain = new Terrain(width, height);

  const n1 = makeNoise1d(rng, Math.ceil(width / 380) + 2);
  const n2 = makeNoise1d(rng, Math.ceil(width / 130) + 2);
  const n3 = makeNoise1d(rng, Math.ceil(width / 45) + 2);

  const baseY = WATER_Y - randRange(rng, 400, 520);
  const heights = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const v = n1(x / 380) * 190 + n2(x / 130) * 70 + n3(x / 45) * 18;
    heights[x] = baseY + v - 140;
  }

  // Wasserrinnen: die Oberfläche sinkt weich unter den Wasserspiegel.
  const gapCount = 2 + Math.floor(rng() * 2);
  const sectionW = width / (gapCount + 1);
  for (let g = 1; g <= gapCount; g++) {
    const center = g * sectionW + randRange(rng, -sectionW * 0.22, sectionW * 0.22);
    const half = randRange(rng, 120, 200);
    const falloff = half * 0.7;
    for (let x = Math.max(0, Math.floor(center - half - falloff)); x < Math.min(width, center + half + falloff); x++) {
      const d = Math.abs(x - center);
      const s = 1 - smoothstep((d - half) / falloff);
      heights[x] = heights[x]! + (WATER_Y + 80 - heights[x]!) * s;
    }
  }
  // Ränder der Karte laufen ins Wasser aus.
  const edge = 150;
  for (let x = 0; x < edge; x++) {
    const s = 1 - smoothstep(x / edge);
    heights[x] = heights[x]! + (WATER_Y + 80 - heights[x]!) * s;
    const xr = width - 1 - x;
    heights[xr] = heights[xr]! + (WATER_Y + 80 - heights[xr]!) * s;
  }

  for (let x = 0; x < width; x++) {
    const top = Math.max(0, Math.round(heights[x]!));
    for (let y = top; y < height; y++) terrain.mask[y * width + x] = 1;
  }

  // Höhlen
  const caves = 7 + Math.floor(rng() * 5);
  for (let i = 0; i < caves; i++) {
    const cx = randRange(rng, edge, width - edge);
    const top = heights[Math.floor(cx)]!;
    if (top > WATER_Y - 150) continue;
    terrain.carveCircle(cx, top + randRange(rng, 60, 260), randRange(rng, 24, 56));
  }

  // Schwebende Inselchen
  const islets = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < islets; i++) {
    const cx = randRange(rng, edge + 100, width - edge - 100);
    const cy = baseY - randRange(rng, 150, 330);
    const rx = randRange(rng, 40, 85);
    for (let k = 0; k < 4; k++) {
      terrain.fillCircle(cx + randRange(rng, -rx, rx), cy + randRange(rng, -10, 14), randRange(rng, 18, 34));
    }
  }

  return { terrain, spawnPoints: pickSpawns(terrain, heights, rng, minSpawns), seed };
}

/** Wählt Startpunkte auf flachem Land, gleichmäßig über die Breite verteilt. */
function pickSpawns(terrain: Terrain, heights: Float32Array, rng: Rng, count: number): Vec2[] {
  const { width } = terrain;
  const margin = 110;
  const minGap = 110;
  const candidates: Vec2[] = [];
  for (let x = margin; x < width - margin; x += 6) {
    const y = findStandableY(terrain, x, heights[x]!);
    if (y !== null) candidates.push({ x, y });
  }

  const chosen: Vec2[] = [];
  const slotW = (width - 2 * margin) / count;
  for (let s = 0; s < count; s++) {
    const lo = margin + s * slotW;
    const hi = lo + slotW;
    const inSlot = candidates.filter(
      (c) => c.x >= lo && c.x < hi && chosen.every((o) => Math.abs(o.x - c.x) >= minGap),
    );
    if (inSlot.length > 0) chosen.push(inSlot[Math.floor(rng() * inSlot.length)]!);
  }

  // Fehlende Plätze aus allen übrigen Kandidaten auffüllen.
  const rest = shuffle(rng, candidates);
  for (const c of rest) {
    if (chosen.length >= count) break;
    if (chosen.every((o) => Math.abs(o.x - c.x) >= minGap)) chosen.push(c);
  }
  // Letzte Rettung: Abstand lockern.
  for (const c of rest) {
    if (chosen.length >= count) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  return shuffle(rng, chosen);
}

/**
 * Oberfläche des eigentlichen Landes (nicht der schwebenden Inselchen): Die Suche
 * beginnt knapp über dem Höhenprofil. Verlangt freien Himmel, flachen Boden und
 * ausreichend Abstand zum Wasser.
 */
function findStandableY(terrain: Terrain, x: number, groundTop: number): number | null {
  const y = terrain.findSurfaceY(x, Math.max(0, groundTop - 30));
  if (y <= 20 || y > DROWN_Y - 90 || y >= WORLD_H) return null;
  // Freiraum über dem Wurm
  for (let k = 1; k <= 24; k++) if (terrain.isSolid(x, y - k)) return null;
  // flach genug
  const l = terrain.findSurfaceY(x - 8, y - 40);
  const r = terrain.findSurfaceY(x + 8, y - 40);
  if (l < 0 || r < 0 || Math.abs(l - y) > 8 || Math.abs(r - y) > 8) return null;
  return y - 1;
}
