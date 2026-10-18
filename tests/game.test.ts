import { describe, expect, it } from "vitest";
import { Bot } from "../src/ai/Bot";
import { simulateShot } from "../src/ai/ShotSimulator";
import { TurnManager } from "../src/game/TurnManager";
import { Game } from "../src/game/Game";
import { DROWN_Y, RETREAT_TIME, TURN_TIME } from "../src/game/constants";
import { mulberry32 } from "../src/game/rng";
import { participantsFromResult } from "../src/ladder/LadderStore";
import { generateMap } from "../src/terrain/MapGenerator";
import { WEAPONS } from "../src/weapons/weapons";
import { GROUND_Y, config, flatMap, makeGame, runUntil, shoot } from "./helpers";

describe("TurnManager", () => {
  const alive = new Set([0, 1, 2, 3, 4, 5]);
  const isAlive = (id: number): boolean => alive.has(id);
  const teams = [[0, 2, 4], [1, 3, 5]];

  it("wechselt die Teams ab und rotiert innerhalb des Teams", () => {
    const tm = new TurnManager(teams, mulberry32(3));
    const first = tm.start(isAlive)!;
    const seq = [first];
    for (let i = 0; i < 5; i++) seq.push(tm.nextTurn(isAlive)!);
    expect(seq.map((s) => s.team)).toEqual([first.team, 1 - first.team, first.team, 1 - first.team, first.team, 1 - first.team]);
    const own = seq.filter((s) => s.team === first.team).map((s) => s.wormId);
    expect(new Set(own).size).toBe(3);
  });

  it("überspringt tote Würmer und Teams", () => {
    const tm = new TurnManager(teams, mulberry32(3));
    const dead = new Set([0, 2]);
    const only = (id: number): boolean => !dead.has(id);
    tm.start(only);
    for (let i = 0; i < 6; i++) {
      const slot = tm.nextTurn(only)!;
      expect(dead.has(slot.wormId)).toBe(false);
    }
    expect(tm.nextTurn(() => false)).toBeNull();
  });

  it("setzt Zugzeit auf 45 s, zählt herunter und würfelt Wind in [-1, 1]", () => {
    const tm = new TurnManager(teams, mulberry32(9));
    tm.start(isAlive);
    expect(tm.timeLeft).toBe(TURN_TIME);
    expect(tm.tickTurn(10)).toBe(false);
    expect(tm.timeLeft).toBe(TURN_TIME - 10);
    expect(tm.tickTurn(100)).toBe(true);
    for (let i = 0; i < 50; i++) {
      tm.nextTurn(isAlive);
      expect(Math.abs(tm.wind)).toBeLessThanOrEqual(1);
    }
  });

  it("Rückzugsphase dauert 3 Sekunden", () => {
    const tm = new TurnManager(teams, mulberry32(1));
    tm.start(isAlive);
    tm.startRetreat();
    expect(tm.retreatLeft).toBe(RETREAT_TIME);
    expect(tm.tickRetreat(2.9)).toBe(false);
    expect(tm.tickRetreat(0.2)).toBe(true);
  });
});

describe("Spielregeln", () => {
  it("startet mit zwei Teams à drei Würmern, 100 HP, am Boden", () => {
    const { game } = makeGame();
    expect(game.worms).toHaveLength(6);
    for (const w of game.worms) {
      expect(w.hp).toBe(100);
      expect(w.grounded).toBe(true);
    }
    expect(game.teamWorms(0)).toHaveLength(3);
    expect(game.phase).toBe("turn");
  });

  it("unterstützt Teamgröße 2", () => {
    const { game } = makeGame(flatMap(), config({ wormsPerTeam: 2 }));
    expect(game.worms).toHaveLength(4);
  });

  it("Zugzeit läuft ab: danach wechselt die Kontrolle zum anderen Team", () => {
    const { game, events } = makeGame();
    const first = game.turns.activeTeam;
    runUntil(game, () => game.turns.activeTeam !== first, 60);
    expect(game.turns.activeTeam).toBe(1 - first);
    expect(events.filter((e) => e.type === "turnStart")).toHaveLength(2);
  });

  it("Schuss: Rückzugsphase, Explosion reißt ein Loch, danach Teamwechsel", () => {
    const { game, events } = makeGame();
    const team = game.turns.activeTeam;
    const shooter = game.activeWorm;
    shooter.facing = 1;
    shooter.aim = 80;
    const before = game.terrain.mask.reduce((n, v) => n + v, 0);
    shoot(game, 0.35);
    expect(game.phase).toBe("retreat");
    runUntil(game, () => game.turns.activeTeam !== team);
    const after = game.terrain.mask.reduce((n, v) => n + v, 0);
    expect(after).toBeLessThan(before);
    expect(events.some((e) => e.type === "explosion")).toBe(true);
    expect(game.turns.activeTeam).toBe(1 - team);
    expect(game.stats.teams[team]!.shotsFired).toBe(1);
  });

  it("Treffer zählt, wenn ein Gegner mindestens 1 Schaden nimmt", () => {
    const { game } = makeGame();
    const team = game.turns.activeTeam;
    const shooter = game.activeWorm;
    const victim = game.enemiesOf(team)[0]!;
    shooter.x = 500;
    shooter.facing = 1;
    shooter.aim = 0;
    victim.x = 590;
    for (let i = 0; i < 50; i++) game.tick(0.02);
    shoot(game, 0.4);
    runUntil(game, () => game.turns.activeTeam !== team);
    const s = game.stats.teams[team]!;
    expect(victim.hp).toBeLessThan(100);
    expect(s.shotsFired).toBe(1);
    expect(s.shotsHit).toBe(1);
    // Sturzschaden durch den Krater zählt nicht zum Schuss-Schaden.
    expect(s.damageDealt).toBeGreaterThan(0);
    expect(s.damageDealt).toBeLessThanOrEqual(100 - victim.hp);
    expect(game.stats.teams[1 - team]!.damageTaken).toBe(s.damageDealt);
  });

  it("Selbstschaden zählt nicht als Treffer", () => {
    const { game } = makeGame();
    const team = game.turns.activeTeam;
    const shooter = game.activeWorm;
    shooter.facing = 1;
    shooter.aim = 85;
    shoot(game, 0.02); // fällt fast senkrecht zurück
    runUntil(game, () => game.turns.activeTeam !== team);
    const s = game.stats.teams[team]!;
    expect(s.shotsFired).toBe(1);
    expect(s.shotsHit).toBe(0);
    expect(s.damageDealt).toBe(0);
  });

  it("Wasser tötet sofort; wer ins Wasser fällt, ist raus", () => {
    const { game, events } = makeGame();
    const victim = game.worms[1]!;
    victim.x = 700;
    game.terrain.carveCircle(700, GROUND_Y + 10, 400); // Grube bis unter den Wasserspiegel
    game.terrain.carveCircle(700, GROUND_Y + 250, 400);
    runUntil(game, () => !victim.alive, 10);
    expect(victim.alive).toBe(false);
    expect(victim.y).toBeGreaterThan(DROWN_Y - 40);
    expect(events.some((e) => e.type === "died" && e.cause === "water")).toBe(true);
  });

  it("Spielende: Team ohne lebende Würmer verliert, Ergebnis enthält Seed und Statistik", () => {
    const { game, events } = makeGame();
    for (const w of game.teamWorms(1)) {
      w.alive = false;
      w.hp = 0;
    }
    runUntil(game, () => game.over, 60);
    expect(game.over).toBe(true);
    expect(game.result!.winner).toBe(0);
    expect(game.result!.mapSeed).toBe("flat");
    expect(events.filter((e) => e.type === "matchEnd")).toHaveLength(1);
  });

  it("Unentschieden, wenn beide Teams gleichzeitig ausgelöscht werden", () => {
    const { game } = makeGame();
    for (const w of game.worms) {
      w.alive = false;
      w.hp = 0;
    }
    runUntil(game, () => game.over, 60);
    expect(game.result!.winner).toBeNull();
  });

  it("Aufgeben beendet die Partie als Niederlage des aufgebenden Teams", () => {
    const { game } = makeGame();
    game.surrender(0);
    expect(game.over).toBe(true);
    expect(game.result!.winner).toBe(1);
    expect(game.result!.reason).toBe("surrender");
    const parts = participantsFromResult(game.result!);
    expect(parts.find((p) => p.playerId === "p_rot")!.outcome).toBe("loss");
    expect(parts.find((p) => p.playerId === "p_blau")!.outcome).toBe("win");
  });

  it("Abbruch lässt das Team mit weniger Rest-Lebenspunkten verlieren", () => {
    const { game } = makeGame();
    for (const w of game.worms) if (w.team === 0) w.hp = 30;
    game.abandon(1); // Blau verlässt die Partie, liegt aber vorn
    expect(game.result!.winner).toBe(1);
    expect(game.result!.reason).toBe("surrender");
  });

  it("Abbruch bei Gleichstand wertet das verlassende Team als Verlierer", () => {
    const { game } = makeGame();
    game.abandon(1);
    expect(game.result!.winner).toBe(0);
  });

  it("Teleport setzt den Wurm auf freie Fläche und verbraucht Munition", () => {
    const { game } = makeGame();
    const team = game.activeTeam;
    const worm = game.activeWorm;
    expect(game.selectWeapon("teleport")).toBe(true);
    expect(game.teleportTo(worm.x + 5, GROUND_Y + 20)).toBe(false); // im Boden
    expect(game.teleportTo(1200, GROUND_Y - 200)).toBe(true);
    expect(team.ammo.teleport).toBe(WEAPONS.teleport.ammo! - 1);
    expect(WEAPONS.teleport.ammo).toBe(1);
    runUntil(game, () => worm.grounded, 5);
    expect(Math.abs(worm.x - 1200)).toBeLessThan(5);
  });

  it("Anzahl der Teleports ist pro Partie einstellbar", () => {
    expect(makeGame().game.activeTeam.ammo.teleport).toBe(1);
    const three = new Game(config({ teleports: 3 }), mulberry32(1), flatMap(), () => {});
    expect(three.teams.every((t) => t.ammo.teleport === 3)).toBe(true);
    const none = new Game(config({ teleports: 0 }), mulberry32(1), flatMap(), () => {});
    expect(none.isWeaponAvailable(0, "teleport")).toBe(false);
  });

  it("Bazooka reicht (ohne Wind, auf ebenem Grund) 30 % weiter als im Original", () => {
    // Wurfweite bei 45° ~ v² / g; Ursprungsgeschwindigkeit war 1150 px/s.
    expect(WEAPONS.bazooka.maxSpeed ** 2 / 1150 ** 2).toBeCloseTo(1.3, 5);
  });

  it("Dynamit ist begrenzt", () => {
    const { game } = makeGame();
    expect(game.activeTeam.ammo.dynamite).toBe(3);
    expect(game.isWeaponAvailable(game.activeTeam.index, "dynamite")).toBe(true);
  });

  it("Shotgun erlaubt zwei Schüsse pro Zug", () => {
    const { game } = makeGame();
    const team = game.turns.activeTeam;
    const shooter = game.activeWorm;
    shooter.facing = 1;
    shooter.aim = 0;
    game.selectWeapon("shotgun");
    const press = (): void => {
      game.input = { move: 0, aim: 0, charge: true };
      game.tick(0.02);
      game.input = { move: 0, aim: 0, charge: false };
      game.tick(0.02);
    };
    press();
    expect(game.stats.teams[team]!.shotsFired).toBe(1);
    for (let i = 0; i < 40; i++) game.tick(0.02); // Nachladezeit
    press();
    expect(game.stats.teams[team]!.shotsFired).toBe(2);
    for (let i = 0; i < 40; i++) game.tick(0.02);
    press();
    expect(game.stats.teams[team]!.shotsFired).toBe(2); // dritter Schuss nicht möglich
  });
});

describe("KI", () => {
  it("simuliert denselben Schuss wie das Spiel (gleiche Physik)", () => {
    let explosion: { x: number; y: number } | null = null;
    const game = new Game(config(), mulberry32(1), flatMap(), (e) => {
      if (e.type === "explosion") explosion = { x: e.x, y: e.y };
    });
    for (let i = 0; i < 100; i++) game.tick(0.02);
    const worm = game.activeWorm;
    worm.facing = 1;
    worm.aim = 50;
    const sim = simulateShot(
      game.terrain,
      WEAPONS.bazooka,
      { x: worm.centerX, y: worm.centerY },
      { facing: 1, angle: 50, power: 0.7 },
      game.wind,
      game.worms.map((w) => ({ id: w.id, team: w.team, x: w.centerX, y: w.centerY })),
      worm.id,
    );
    expect(sim.impact).not.toBeNull();
    const team = game.turns.activeTeam;
    shoot(game, 0.7);
    runUntil(game, () => explosion !== null || game.turns.activeTeam !== team, 10);
    expect(explosion).not.toBeNull();
    // Die Stärke lädt in Ticks auf (0,016 pro Tick): kleine Abweichung ist erlaubt.
    expect(Math.abs(explosion!.x - sim.impact!.x)).toBeLessThan(60);
  });

  it("spielt komplette KI-gegen-KI-Partien bis zum Ende, deterministisch pro Seed", () => {
    const play = (seed: string): { winner: number | null; turns: number } => {
      const rng = mulberry32(42);
      const map = generateMap(seed);
      const cfg = config({
        mode: "vsAi",
        wormsPerTeam: 2,
        teams: [
          { name: "A", controller: { kind: "ai", level: "hard" }, wormNames: ["a1", "a2"] },
          { name: "B", controller: { kind: "ai", level: "normal" }, wormNames: ["b1", "b2"] },
        ],
      });
      const game = new Game(cfg, rng, map);
      const bots = [new Bot("hard", rng), new Bot("normal", rng)];
      for (let t = 0; t < 50 * 60 * 20 && !game.over; t++) {
        game.input = bots[game.turns.activeTeam]!.update(game);
        game.tick(0.02);
      }
      expect(game.over).toBe(true);
      return { winner: game.result!.winner, turns: game.turns.turnNumber };
    };
    const a = play("seed-ki");
    expect(a.turns).toBeGreaterThan(1);
    expect(play("seed-ki")).toEqual(a);
  });
});
