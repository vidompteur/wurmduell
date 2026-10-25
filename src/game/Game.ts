import { Projectile } from "../entities/Projectile";
import type { ProjectileEvent } from "../entities/Projectile";
import { Worm, bodyBlocked, fallDamage } from "../entities/Worm";
import type { GeneratedMap } from "../terrain/MapGenerator";
import type { Terrain } from "../terrain/Terrain";
import type { InputState, MatchConfig, MatchResult, TeamResult, WeaponId } from "../types";
import { explosionDamage, explosionFalloff, shotSpeed } from "../weapons/Weapon";
import type { WeaponDef } from "../weapons/Weapon";
import {
  SHOTGUN_CRATER,
  SHOTGUN_HIT_DAMAGE,
  SHOTGUN_RANGE,
  SHOTGUN_SPREAD_DEG,
  WEAPONS,
} from "../weapons/weapons";
import { MatchStats } from "./MatchStats";
import type { GameEventHandler, Phase, TeamState } from "./GameState";
import { TurnManager } from "./TurnManager";
import {
  AIM_RATE,
  DROWN_Y,
  POWER_RATE,
  SETTLE_MAX,
  SETTLE_TIME,
  WATER_Y,
  WORLD_W,
  WORM_HIT_RADIUS,
} from "./constants";
import type { Rng } from "./rng";

export const IDLE_INPUT: InputState = { move: 0, aim: 0, charge: false };

interface ShotSource {
  shotId: number;
  team: number;
}

/**
 * Spiellogik einer Partie. Kennt weder DOM noch Canvas; Außenwelt erfährt
 * über `emit` (GameEvent), was passiert. Zufall kommt ausschließlich aus `rng`.
 */
export class Game {
  readonly config: MatchConfig;
  readonly seed: string;
  readonly terrain: Terrain;
  readonly worms: Worm[] = [];
  readonly teams: TeamState[];
  readonly projectiles: Projectile[] = [];
  readonly stats: MatchStats;
  readonly turns: TurnManager;

  phase: Phase = "turn";
  /** Spielzeit in Sekunden. */
  time = 0;
  /** Aktuelle Aufladung der Schussstärke in [0, 1]. */
  power = 0;
  /** Eingabe für den aktiven Wurm im nächsten Tick (Mensch oder KI). */
  input: InputState = IDLE_INPUT;
  result: MatchResult | null = null;
  /** Verbleibende Schüsse der gewählten Waffe in diesem Zug (Shotgun: 2). */
  shotsLeft = 0;

  private nextProjectileId = 1;
  private prevCharge = false;
  private chargeLocked = false;
  private shotCooldown = 0;
  private resolveTime = 0;
  private settleTimer = 0;
  private lastCountdown = -1;

  constructor(
    config: MatchConfig,
    private readonly rng: Rng,
    map: GeneratedMap,
    private readonly emit: GameEventHandler = () => {},
  ) {
    this.config = config;
    this.seed = map.seed;
    this.terrain = map.terrain;
    this.stats = new MatchStats(2);

    const n = config.wormsPerTeam;
    this.teams = config.teams.map((t, index) => ({
      index,
      name: t.name,
      controller: t.controller,
      wormIds: [],
      ammo: {
        bazooka: Number.POSITIVE_INFINITY,
        // Pure-Modus: nur Bazooka, alle anderen Waffen sind nicht verfügbar.
        grenade: config.pure ? 0 : Number.POSITIVE_INFINITY,
        dynamite: config.pure ? 0 : (WEAPONS.dynamite.ammo ?? Number.POSITIVE_INFINITY),
        shotgun: config.pure ? 0 : Number.POSITIVE_INFINITY,
        teleport: config.pure ? 0 : (config.teleports ?? WEAPONS.teleport.ammo ?? Number.POSITIVE_INFINITY),
      },
      selectedWeapon: "bazooka" as WeaponId,
    }));

    for (let k = 0; k < n; k++) {
      for (let t = 0; t < 2; t++) {
        const spawn = map.spawnPoints[k * 2 + t] ?? map.spawnPoints[map.spawnPoints.length - 1]!;
        const id = this.worms.length;
        const facing = spawn.x < WORLD_W / 2 ? 1 : -1;
        const name = config.teams[t]!.wormNames[k] ?? `Wurm ${k + 1}`;
        const worm = new Worm(id, t, name, spawn.x, spawn.y, facing);
        worm.aim = 35;
        this.worms.push(worm);
        this.teams[t]!.wormIds.push(id);
      }
    }

    this.turns = new TurnManager(
      this.teams.map((t) => t.wormIds),
      rng,
    );
    this.turns.start((id) => this.worms[id]!.alive);
    this.beginTurn();
  }

  // ---------------------------------------------------------------- Zugriff

  get activeWorm(): Worm {
    return this.worms[this.turns.activeWorm]!;
  }

  get activeTeam(): TeamState {
    return this.teams[this.turns.activeTeam]!;
  }

  get weapon(): WeaponDef {
    return WEAPONS[this.activeTeam.selectedWeapon];
  }

  /** Ist die Partie beendet? */
  get over(): boolean {
    return this.phase === "gameover";
  }

  get wind(): number {
    return this.turns.wind;
  }

  teamWorms(team: number): Worm[] {
    return this.teams[team]!.wormIds.map((id) => this.worms[id]!);
  }

  aliveWorms(team: number): Worm[] {
    return this.teamWorms(team).filter((w) => w.alive);
  }

  enemiesOf(team: number): Worm[] {
    return this.worms.filter((w) => w.alive && w.team !== team);
  }

  /** Kann der aktive Wurm gerade diese Waffe wählen? */
  isWeaponAvailable(team: number, weapon: WeaponId): boolean {
    return this.teams[team]!.ammo[weapon] > 0;
  }

  // -------------------------------------------------------------- Befehle

  selectWeapon(id: WeaponId): boolean {
    if (this.phase !== "turn") return false;
    const team = this.activeTeam;
    if (!this.isWeaponAvailable(team.index, id)) return false;
    team.selectedWeapon = id;
    this.power = 0;
    this.chargeLocked = this.input.charge;
    this.shotsLeft = WEAPONS[id].shotsPerTurn;
    return true;
  }

  /** Teleport-Klick: versetzt den aktiven Wurm, falls das Ziel frei ist. */
  teleportTo(x: number, y: number): boolean {
    if (this.phase !== "turn" || this.activeTeam.selectedWeapon !== "teleport") return false;
    const team = this.activeTeam;
    const worm = this.activeWorm;
    if (!worm.alive || team.ammo.teleport <= 0) return false;
    if (x < 12 || x > this.terrain.width - 12 || y < 24 || y > DROWN_Y - 24) return false;
    if (bodyBlocked(this.terrain, x, y)) return false;
    this.emit({ type: "teleport", fromX: worm.x, fromY: worm.y, toX: x, toY: y });
    worm.placeAt(x, y);
    team.ammo.teleport -= 1;
    team.selectedWeapon = "bazooka";
    this.shotsLeft = WEAPONS.bazooka.shotsPerTurn;
    return true;
  }

  /** Das angegebene Team gibt auf. */
  surrender(team: number): void {
    if (this.over) return;
    this.endMatch(1 - team, "surrender");
  }

  /**
   * Die Partie wird abgebrochen (z. B. Browser geschlossen). Es verliert das Team mit
   * weniger Rest-Lebenspunkten; bei Gleichstand das Team, das die Partie verlassen hat.
   */
  abandon(leaverTeam: number): void {
    if (this.over) return;
    const hp = (team: number): number => this.aliveWorms(team).reduce((sum, w) => sum + w.hp, 0);
    const a = hp(0);
    const b = hp(1);
    const loser = a === b ? leaverTeam : a < b ? 0 : 1;
    this.endMatch(1 - loser, "surrender");
  }

  // ------------------------------------------------------------------ Tick

  /** Ein fester Simulationsschritt. */
  tick(dt: number): void {
    if (this.over) {
      this.rememberPositions();
      this.stepPhysics(dt);
      return;
    }
    this.time += dt;
    this.shotCooldown = Math.max(0, this.shotCooldown - dt);
    this.rememberPositions();
    this.stepPhysics(dt);
    if (this.over) return;

    switch (this.phase) {
      case "turn":
        this.controlActive(dt, true);
        if (this.turns.tickTurn(dt) || !this.activeWorm.alive) {
          this.toResolve();
        } else {
          const s = Math.ceil(this.turns.timeLeft);
          if (s <= 5 && s !== this.lastCountdown) {
            this.lastCountdown = s;
            this.emit({ type: "countdown", seconds: s });
          }
        }
        break;
      case "retreat":
        this.controlActive(dt, true);
        if (this.turns.tickRetreat(dt) || !this.activeWorm.alive) this.toResolve();
        break;
      case "resolve":
        this.updateResolve(dt);
        break;
      default:
        break;
    }

    if ((this.phase === "turn" || this.phase === "retreat") && this.aliveTeams().length <= 1) {
      this.toResolve();
    }
  }

  // ------------------------------------------------------------- Steuerung

  private controlActive(dt: number, canAttack: boolean): void {
    const worm = this.activeWorm;
    const inp = this.input;
    if (!worm.alive) return;
    const def = this.weapon;

    if (inp.move !== 0 && this.power === 0) worm.walk(this.terrain, inp.move, dt);
    if (def.aimable && inp.aim !== 0 && this.phase === "turn") worm.changeAim(inp.aim * AIM_RATE * dt);
    // In der Rückzugsphase bleibt die Shotgun zielbar.
    if (def.id === "shotgun" && inp.aim !== 0 && this.phase === "retreat") worm.changeAim(inp.aim * AIM_RATE * dt);

    const usable = canAttack && worm.grounded && this.canFire(def);
    if (!usable) {
      this.power = 0;
      this.prevCharge = inp.charge;
      return;
    }

    if (def.chargeable) {
      if (!inp.charge) this.chargeLocked = false;
      if (inp.charge && !this.chargeLocked) {
        this.power = Math.min(1, this.power + POWER_RATE * dt);
        if (this.power >= 1) {
          this.fire(worm, def, 1);
          this.chargeLocked = true;
        }
      } else if (!inp.charge && this.prevCharge && this.power > 0) {
        this.fire(worm, def, this.power);
      }
    } else if (inp.charge && !this.prevCharge && !this.chargeLocked) {
      this.fire(worm, def, 0);
    }
    if (!inp.charge) this.chargeLocked = false;
    this.prevCharge = inp.charge;
  }

  private canFire(def: WeaponDef): boolean {
    if (def.kind === "utility") return false;
    if (this.activeTeam.ammo[def.id] <= 0) return false;
    if (def.id === "shotgun") return this.shotsLeft > 0 && this.shotCooldown <= 0;
    // Außer der Shotgun sind nach dem Angriff keine weiteren Schüsse erlaubt.
    return this.phase === "turn";
  }

  private fire(worm: Worm, def: WeaponDef, power: number): void {
    const team = this.activeTeam;
    const dirX = worm.facing * Math.cos((worm.aim * Math.PI) / 180);
    const dirY = -Math.sin((worm.aim * Math.PI) / 180);
    const cx = worm.centerX;
    const cy = worm.centerY;
    this.power = 0;

    if (def.id === "bazooka" || def.id === "grenade") {
      const speed = shotSpeed(def, power);
      const shotId = this.stats.registerShot(team.index);
      let px = cx + dirX * 14;
      let py = cy + dirY * 14;
      if (this.terrain.isSolid(px, py)) {
        px = cx;
        py = cy;
      }
      this.projectiles.push(
        new Projectile(this.nextProjectileId++, def.id, px, py, dirX * speed, dirY * speed, def.fuse ?? null, shotId, team.index, worm.id),
      );
      this.emit({ type: "shoot", weapon: def.id, x: px, y: py });
    } else if (def.id === "dynamite") {
      const shotId = this.stats.registerShot(team.index);
      let px = worm.x + worm.facing * 8;
      const py = worm.y - 4;
      if (this.terrain.isSolid(px, py)) px = worm.x;
      this.projectiles.push(
        new Projectile(this.nextProjectileId++, "dynamite", px, py, worm.facing * 60, -40, def.fuse ?? 5, shotId, team.index, worm.id),
      );
      this.emit({ type: "shoot", weapon: "dynamite", x: px, y: py });
    } else if (def.id === "shotgun") {
      this.fireShotgun(worm, dirX, dirY);
    }

    if (Number.isFinite(team.ammo[def.id])) team.ammo[def.id] -= 1;
    this.shotsLeft = def.id === "shotgun" ? this.shotsLeft - 1 : 0;
    this.shotCooldown = 0.55;
    this.phase = "retreat";
    this.turns.startRetreat();
    this.emit({ type: "retreat" });
  }

  private fireShotgun(worm: Worm, dirX: number, dirY: number): void {
    const team = this.activeTeam.index;
    const shotId = this.stats.registerShot(team);
    const spread = ((this.rng() - 0.5) * 2 * SHOTGUN_SPREAD_DEG * Math.PI) / 180;
    const cos = Math.cos(spread);
    const sin = Math.sin(spread);
    const dx = dirX * cos - dirY * sin;
    const dy = dirX * sin + dirY * cos;
    const x0 = worm.centerX + dx * 10;
    const y0 = worm.centerY + dy * 10;
    this.emit({ type: "shoot", weapon: "shotgun", x: x0, y: y0 });

    let x = x0;
    let y = y0;
    let hitWorm: Worm | null = null;
    let travelled = 0;
    while (travelled < SHOTGUN_RANGE) {
      x += dx * 3;
      y += dy * 3;
      travelled += 3;
      if (y >= WATER_Y) {
        this.emit({ type: "splash", x, y: WATER_Y });
        break;
      }
      if (this.terrain.isSolid(x, y)) {
        this.terrain.carveCircle(x, y, SHOTGUN_CRATER);
        this.emit({ type: "explosion", x, y, radius: SHOTGUN_CRATER });
        break;
      }
      const target = this.worms.find(
        (w) => w.alive && w.id !== worm.id && Math.hypot(w.centerX - x, w.centerY - y) <= WORM_HIT_RADIUS - 1,
      );
      if (target) {
        hitWorm = target;
        break;
      }
    }
    this.emit({ type: "tracer", x1: x0, y1: y0, x2: x, y2: y });
    if (hitWorm) {
      this.applyDamage(hitWorm, SHOTGUN_HIT_DAMAGE, { shotId, team }, "damage");
      hitWorm.launch(dx * WEAPONS.shotgun.knockback, dy * WEAPONS.shotgun.knockback - 90);
    }
  }

  // ---------------------------------------------------------------- Physik

  /** Merkt die Positionen vor dem Tick, damit der Renderer dazwischen interpolieren kann. */
  private rememberPositions(): void {
    for (const w of this.worms) {
      w.px = w.x;
      w.py = w.y;
    }
    for (const p of this.projectiles) {
      p.px = p.x;
      p.py = p.y;
    }
  }

  private stepPhysics(dt: number): void {
    const wind = this.turns.wind;
    for (const p of this.projectiles.slice()) {
      const events = p.update(this.terrain, dt, wind, (x, y) => this.projectileContact(p, x, y));
      for (const e of events) this.handleProjectileEvent(p, e);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      if (!this.projectiles[i]!.alive) this.projectiles.splice(i, 1);
    }

    for (const w of this.worms) {
      if (!w.active) continue;
      const r = w.update(this.terrain, dt);
      if (r.drowned) {
        this.emit({ type: "splash", x: w.x, y: WATER_Y });
        this.emit({ type: "died", wormId: w.id, cause: "water", x: w.x, y: WATER_Y });
      } else if (r.landedFall !== undefined && w.alive) {
        const dmg = fallDamage(r.landedFall);
        if (dmg > 0) this.applyDamage(w, dmg, null, "damage");
      }
    }
  }

  private projectileContact(p: Projectile, x: number, y: number): boolean {
    for (const w of this.worms) {
      if (!w.alive) continue;
      if (w.id === p.ownerWorm && p.age < 0.3) continue;
      if (Math.hypot(w.centerX - x, w.centerY - y) <= WORM_HIT_RADIUS) return true;
    }
    return false;
  }

  private handleProjectileEvent(p: Projectile, e: ProjectileEvent): void {
    switch (e.type) {
      case "explode":
        this.explode(e.x, e.y, WEAPONS[p.kind === "dynamite" ? "dynamite" : p.kind], {
          shotId: p.shotId,
          team: p.ownerTeam,
        });
        break;
      case "splash":
        this.emit({ type: "splash", x: e.x, y: e.y });
        break;
      case "bounce":
        this.emit({ type: "bounce", x: e.x, y: e.y });
        break;
    }
  }

  private explode(x: number, y: number, def: WeaponDef, source: ShotSource): void {
    this.terrain.carveCircle(x, y, def.explosionRadius);
    this.emit({ type: "explosion", x, y, radius: def.explosionRadius });
    for (const w of this.worms) {
      if (!w.active) continue;
      const dx = w.centerX - x;
      const dy = w.centerY - y;
      const d = Math.hypot(dx, dy);
      const falloff = explosionFalloff(def, d);
      if (falloff <= 0) continue;
      if (w.alive) {
        const dmg = explosionDamage(def, d);
        if (dmg > 0) this.applyDamage(w, dmg, source, "damage");
      }
      const nx = d < 1 ? 0 : dx / d;
      const ny = d < 1 ? -1 : dy / d;
      w.launch(nx * def.knockback * falloff, ny * def.knockback * falloff - 150 * falloff);
    }
  }

  private applyDamage(w: Worm, amount: number, source: ShotSource | null, cause: "damage" | "water"): void {
    const dmg = Math.min(amount, w.hp);
    if (dmg <= 0) return;
    w.hp -= dmg;
    if (source) this.stats.recordDamage(source.shotId, w.team, dmg);
    this.emit({ type: "damage", wormId: w.id, amount: dmg, x: w.x, y: w.y - 22 });
    if (w.hp <= 0) {
      w.alive = false;
      w.grave = true;
      this.emit({ type: "died", wormId: w.id, cause, x: w.x, y: w.y });
    }
  }

  // ------------------------------------------------------------ Zugwechsel

  private beginTurn(): void {
    const team = this.activeTeam;
    team.selectedWeapon = "bazooka";
    this.shotsLeft = WEAPONS.bazooka.shotsPerTurn;
    this.power = 0;
    this.chargeLocked = false;
    this.prevCharge = false;
    this.shotCooldown = 0;
    this.lastCountdown = -1;
    this.phase = "turn";
    this.emit({ type: "turnStart", team: team.index, wormId: this.turns.activeWorm, wind: this.turns.wind });
  }

  private toResolve(): void {
    this.phase = "resolve";
    this.power = 0;
    this.resolveTime = 0;
    this.settleTimer = 0;
  }

  private updateResolve(dt: number): void {
    this.resolveTime += dt;
    const quiet = this.projectiles.length === 0 && this.worms.every((w) => !w.moving);
    this.settleTimer = quiet ? this.settleTimer + dt : 0;
    if (this.settleTimer < SETTLE_TIME && this.resolveTime < SETTLE_MAX) return;

    const alive = this.aliveTeams();
    if (alive.length <= 1) {
      this.endMatch(alive.length === 1 ? alive[0]! : null, "elimination");
      return;
    }
    const next = this.turns.nextTurn((id) => this.worms[id]!.alive);
    if (!next) {
      this.endMatch(null, "elimination");
      return;
    }
    this.beginTurn();
  }

  private aliveTeams(): number[] {
    return this.teams.filter((t) => t.wormIds.some((id) => this.worms[id]!.alive)).map((t) => t.index);
  }

  private endMatch(winner: number | null, reason: MatchResult["reason"]): void {
    this.phase = "gameover";
    this.power = 0;
    const teams = this.teams.map((t): TeamResult => ({
      name: t.name,
      controller: t.controller,
      stats: { ...this.stats.teams[t.index]! },
      wormsAlive: this.aliveWorms(t.index).length,
    })) as [TeamResult, TeamResult];
    this.result = {
      winner,
      reason,
      teams,
      durationSeconds: Math.round(this.time),
      mapSeed: this.seed,
      config: this.config,
    };
    this.emit({ type: "matchEnd", result: this.result });
  }
}
