import { describe, expect, it } from "vitest";
import { Projectile } from "../src/entities/Projectile";
import type { ProjectileEvent } from "../src/entities/Projectile";
import { Worm, fallDamage } from "../src/entities/Worm";
import { DROWN_Y, GRAVITY, WORLD_H, WORLD_W } from "../src/game/constants";
import { hashSeed, mulberry32, rngFromSeed } from "../src/game/rng";
import { generateMap } from "../src/terrain/MapGenerator";
import { Terrain } from "../src/terrain/Terrain";
import { DAMAGE_REACH, explosionDamage, shotSpeed } from "../src/weapons/Weapon";
import { WEAPONS } from "../src/weapons/weapons";
import { GROUND_Y, flatMap } from "./helpers";

function settle(worm: Worm, terrain: Terrain, seconds = 4): { falls: number[] } {
  const falls: number[] = [];
  for (let i = 0; i < seconds * 50; i++) {
    const r = worm.update(terrain, 0.02);
    if (r.landedFall !== undefined) falls.push(r.landedFall);
  }
  return { falls };
}

function sameMask(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe("RNG", () => {
  it("ist bei gleichem Seed deterministisch", () => {
    const a = mulberry32(hashSeed("abc"));
    const b = mulberry32(hashSeed("abc"));
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("liefert Werte in [0, 1)", () => {
    const r = rngFromSeed("x");
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("Terrain", () => {
  it("Explosionen entfernen Terrain in einem Kreis", () => {
    const { terrain } = flatMap();
    expect(terrain.isSolid(500, GROUND_Y + 10)).toBe(true);
    terrain.carveCircle(500, GROUND_Y + 10, 30);
    expect(terrain.isSolid(500, GROUND_Y + 10)).toBe(false);
    expect(terrain.isSolid(500, GROUND_Y + 38)).toBe(false); // noch im Radius
    expect(terrain.isSolid(500, GROUND_Y + 45)).toBe(true); // außerhalb
    expect(terrain.isSolid(535, GROUND_Y + 10)).toBe(true);
  });

  it("außerhalb links/rechts ist leer, am Boden fest", () => {
    const { terrain } = flatMap();
    expect(terrain.isSolid(-5, GROUND_Y + 5)).toBe(false);
    expect(terrain.isSolid(WORLD_W + 5, GROUND_Y + 5)).toBe(false);
    expect(terrain.isSolid(100, WORLD_H + 5)).toBe(true);
  });

  it("findSurfaceY liefert die erste feste Zeile", () => {
    const { terrain } = flatMap();
    expect(terrain.findSurfaceY(300)).toBe(GROUND_Y);
    terrain.carveCircle(300, GROUND_Y, 20);
    expect(terrain.findSurfaceY(300)).toBeGreaterThan(GROUND_Y);
  });
});

describe("Kartengenerator", () => {
  it("ist bei gleichem Seed identisch und bei anderem Seed verschieden", () => {
    const a = generateMap("alpha");
    const b = generateMap("alpha");
    const c = generateMap("beta");
    expect(sameMask(a.terrain.mask, b.terrain.mask)).toBe(true);
    expect(sameMask(a.terrain.mask, c.terrain.mask)).toBe(false);
    expect(a.spawnPoints).toEqual(b.spawnPoints);
  });

  it("hat Standardgröße 2560×1440 und genug gültige Startpunkte", () => {
    for (const seed of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
      const m = generateMap(seed);
      expect(m.terrain.width).toBe(2560);
      expect(m.terrain.height).toBe(1440);
      expect(m.spawnPoints.length).toBeGreaterThanOrEqual(6);
      for (const p of m.spawnPoints) {
        expect(m.terrain.isSolid(p.x, p.y + 1)).toBe(true);
        expect(m.terrain.isSolid(p.x, p.y)).toBe(false);
        expect(p.y).toBeLessThan(DROWN_Y);
      }
    }
  });
});

describe("Würmer", () => {
  it("landen auf dem Boden und bleiben stehen", () => {
    const { terrain } = flatMap();
    const w = new Worm(0, 0, "W", 500, GROUND_Y - 30, 1);
    settle(w, terrain);
    expect(w.grounded).toBe(true);
    expect(w.y).toBe(GROUND_Y - 1);
    expect(w.alive).toBe(true);
  });

  it("nehmen erst ab etwa 60 px Fallhöhe Schaden, der mit der Höhe wächst", () => {
    expect(fallDamage(40)).toBe(0);
    expect(fallDamage(60)).toBe(0);
    expect(fallDamage(100)).toBeGreaterThan(0);
    expect(fallDamage(300)).toBeGreaterThan(fallDamage(100));
    expect(fallDamage(5000)).toBeLessThanOrEqual(50);
  });

  it("melden eine Landung mit Fallhöhe nur bei hohem Fall", () => {
    const { terrain } = flatMap();
    const low = new Worm(0, 0, "L", 500, GROUND_Y - 40, 1);
    expect(settle(low, terrain).falls).toEqual([]);
    const high = new Worm(1, 0, "H", 800, GROUND_Y - 200, 1);
    const { falls } = settle(high, terrain);
    expect(falls).toHaveLength(1);
    expect(falls[0]!).toBeGreaterThan(150);
  });

  it("ertrinken im Wasser", () => {
    const terrain = new Terrain(WORLD_W, WORLD_H); // leere Karte, nur Wasser unten
    const w = new Worm(0, 0, "W", 500, 1000, 1);
    for (let i = 0; i < 600 && w.alive; i++) w.update(terrain, 0.02);
    expect(w.alive).toBe(false);
    expect(w.hp).toBe(0);
  });

  it("fallen in Löcher, die Explosionen reißen", () => {
    const { terrain } = flatMap();
    const w = new Worm(0, 0, "W", 500, GROUND_Y - 1, 1);
    settle(w, terrain, 1);
    terrain.carveCircle(500, GROUND_Y, 60);
    settle(w, terrain, 2);
    expect(w.y).toBeGreaterThan(GROUND_Y + 30);
  });

  it("laufen und klettern kleine Stufen", () => {
    const { terrain } = flatMap();
    terrain.fillCircle(560, GROUND_Y, 4); // kleine Erhebung
    const w = new Worm(0, 0, "W", 540, GROUND_Y - 1, 1);
    settle(w, terrain, 1);
    const x0 = w.x;
    for (let i = 0; i < 100; i++) w.walk(terrain, 1, 0.02);
    settle(w, terrain, 1);
    expect(w.x).toBeGreaterThan(x0 + 30);
  });
});

describe("Waffen und Schaden", () => {
  it("Explosionsschaden nimmt mit der Entfernung ab und endet an der Reichweite", () => {
    const def = WEAPONS.bazooka;
    const reach = def.explosionRadius * DAMAGE_REACH;
    expect(explosionDamage(def, 0)).toBe(def.maxDamage);
    expect(explosionDamage(def, reach * 0.5)).toBeLessThan(explosionDamage(def, 0));
    expect(explosionDamage(def, reach * 0.9)).toBeLessThan(explosionDamage(def, reach * 0.5));
    expect(explosionDamage(def, reach)).toBe(0);
    expect(explosionDamage(def, reach + 100)).toBe(0);
  });

  it("Radius und Maximalschaden sind pro Waffe konfiguriert", () => {
    expect(WEAPONS.dynamite.explosionRadius).toBeGreaterThan(WEAPONS.bazooka.explosionRadius);
    expect(WEAPONS.dynamite.maxDamage).toBeGreaterThan(WEAPONS.bazooka.maxDamage);
  });

  it("Schussgeschwindigkeit wächst mit der Stärke", () => {
    const def = WEAPONS.bazooka;
    expect(shotSpeed(def, 1)).toBe(def.maxSpeed);
    expect(shotSpeed(def, 0.5)).toBeLessThan(shotSpeed(def, 1));
    expect(shotSpeed(def, 0)).toBeGreaterThan(0);
  });
});

describe("Projektile", () => {
  it("Bazooka folgt einer Parabel unter Gravitation", () => {
    const { terrain } = flatMap();
    const p = new Projectile(1, "bazooka", 400, 500, 300, 0, null, 1, 0, 0);
    for (let i = 0; i < 25; i++) p.update(terrain, 0.02, 0);
    // 0,5 s: x ≈ 150 px weiter, y ≈ ½·g·t² tiefer
    expect(p.x).toBeCloseTo(550, -1);
    expect(p.y - 500).toBeCloseTo(0.5 * GRAVITY * 0.5 * 0.5, -1);
  });

  it("Wind lenkt die Bazooka seitlich ab, die Granate nicht", () => {
    const { terrain } = flatMap();
    const rocket = new Projectile(1, "bazooka", 400, 500, 0, -200, null, 1, 0, 0);
    const nade = new Projectile(2, "grenade", 400, 500, 0, -200, 3, 2, 0, 0);
    for (let i = 0; i < 20; i++) {
      rocket.update(terrain, 0.02, 1);
      nade.update(terrain, 0.02, 1);
    }
    expect(rocket.x).toBeGreaterThan(400);
    expect(nade.x).toBe(400);
  });

  it("Bazooka explodiert beim Aufschlag", () => {
    const { terrain } = flatMap();
    const p = new Projectile(1, "bazooka", 400, GROUND_Y - 100, 0, 400, null, 1, 0, 0);
    let exploded = false;
    for (let i = 0; i < 100 && p.alive; i++) {
      if (p.update(terrain, 0.02, 0).some((e) => e.type === "explode")) exploded = true;
    }
    expect(exploded).toBe(true);
    expect(p.alive).toBe(false);
  });

  it("Granate springt ab und explodiert nach 3 Sekunden", () => {
    const { terrain } = flatMap();
    const g = new Projectile(1, "grenade", 400, GROUND_Y - 100, 120, 0, 3, 1, 0, 0);
    let bounced = false;
    let explodedAt = -1;
    for (let i = 0; i < 400 && g.alive; i++) {
      for (const e of g.update(terrain, 0.02, 0)) {
        if (e.type === "bounce") bounced = true;
        if (e.type === "explode") explodedAt = g.age;
      }
    }
    expect(bounced).toBe(true);
    expect(explodedAt).toBeGreaterThan(2.9);
    expect(explodedAt).toBeLessThan(3.1);
  });

  it("Dynamit bleibt liegen und zündet nach 5 Sekunden", () => {
    const { terrain } = flatMap();
    const d = new Projectile(1, "dynamite", 400, GROUND_Y - 20, 0, 0, 5, 1, 0, 0);
    let explodedAt = -1;
    for (let i = 0; i < 400 && d.alive; i++) {
      for (const e of d.update(terrain, 0.02, 0)) if (e.type === "explode") explodedAt = d.age;
    }
    expect(explodedAt).toBeGreaterThan(4.9);
    expect(explodedAt).toBeLessThan(5.1);
    expect(d.y).toBeLessThan(GROUND_Y + 2);
  });

  it("Geschosse im Wasser verschwinden ohne Explosion", () => {
    const terrain = new Terrain(WORLD_W, WORLD_H);
    const p = new Projectile(1, "bazooka", 400, 1200, 0, 400, null, 1, 0, 0);
    const events: ProjectileEvent[] = [];
    for (let i = 0; i < 50 && p.alive; i++) events.push(...p.update(terrain, 0.02, 0));
    expect(events.some((e) => e.type === "splash")).toBe(true);
    expect(events.some((e) => e.type === "explode")).toBe(false);
  });
});
