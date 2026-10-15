/** Injizierbarer Zufall: jede Funktion liefert Zahlen in [0, 1). */
export type Rng = () => number;

/** xmur3-Hash: macht aus einem String einen 32-Bit-Seed. */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

/** mulberry32: kleiner, schneller, deterministischer PRNG. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngFromSeed(seed: string): Rng {
  return mulberry32(hashSeed(seed));
}

/** Erzeugt einen neuen zufälligen Map-Seed (nicht deterministisch). */
export function randomSeed(): string {
  const bytes = new Uint32Array(2);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    bytes[0] = (Math.random() * 4294967296) >>> 0;
    bytes[1] = (Math.random() * 4294967296) >>> 0;
  }
  return bytes[0]!.toString(36) + bytes[1]!.toString(36);
}

export function randRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function randInt(rng: Rng, min: number, maxInclusive: number): number {
  return Math.floor(randRange(rng, min, maxInclusive + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Annähernd normalverteilt (Summe dreier Gleichverteilungen), Bereich ca. [-1, 1]. */
export function gaussish(rng: Rng): number {
  return (rng() + rng() + rng()) / 1.5 - 1;
}
