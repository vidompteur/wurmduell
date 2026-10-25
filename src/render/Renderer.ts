import { CONFIG } from "../config";
import { t } from "../i18n";
import { WATER_Y, WORLD_H, WORLD_W } from "../game/constants";
import type { Game } from "../game/Game";
import type { GameEvent } from "../game/GameState";
import type { Projectile } from "../entities/Projectile";
import type { Worm } from "../entities/Worm";
import { Camera } from "./Camera";
import { QualityMonitor } from "./quality";

export const TEAM_COLORS = ["#ff5d6c", "#4db2ff"] as const;
export const TEAM_DARK = ["#a3243a", "#1e5fa8"] as const;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  fade: boolean;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  age: number;
}

interface Tracer {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  age: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  age: number;
  color: string;
}

/** Zeichnet Welt, Würmer, Geschosse und Effekte. Verändert nie den Spielzustand. */
export class Renderer {
  readonly camera = new Camera();
  private readonly ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private tracers: Tracer[] = [];
  private texts: FloatText[] = [];
  private shake = 0;
  private time = 0;
  /** Canvas-Pixel pro CSS-Pixel (Retina = 2). */
  dpr = 1;
  /** Aktuelle Obergrenze der Pixeldichte; sinkt bei zu geringer Bildrate (siehe QualityMonitor). */
  private dprCap: number = CONFIG.view.maxDpr;
  private readonly quality = new QualityMonitor();
  private fixedDpr = false;
  private skyCache: HTMLCanvasElement | null = null;
  private skyKey = "";

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly game: Game,
  ) {
    // Undurchsichtig (der Himmel füllt alles) und mit Low-Latency-Hinweis: schneller im Compositing von Chrome/Safari.
    const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    if (!ctx) throw new Error(t("match.error.canvas"));
    this.ctx = ctx;
    // `?dpr=1` erzwingt eine feste Pixeldichte (zum Testen der Leistung).
    const forced = Number(new URLSearchParams(location.search).get("dpr"));
    if (forced >= 0.5 && forced <= 3) {
      this.dprCap = forced;
      this.fixedDpr = true;
    }
  }

  /** Passt die Canvas-Auflösung an die Anzeigegröße an. */
  resize(): void {
    const dpr = Math.min(this.dprCap, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.camera.maxZoom = 4 * dpr;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.camera.resize(w, h);
  }

  /** Beobachtet die Bildrate und senkt bei Bedarf die Auflösung; die sichtbare Größe bleibt gleich. */
  adaptQuality(frameDt: number): void {
    if (!CONFIG.view.adaptiveQuality || this.fixedDpr) return;
    const next = this.quality.push(frameDt, this.dpr);
    if (next === null) return;
    const before = this.dpr;
    this.dprCap = next;
    this.resize();
    if (this.dpr !== before) this.camera.zoom = Math.max(this.camera.minZoom, (this.camera.zoom * this.dpr) / before);
  }

  // --------------------------------------------------------------- Ereignisse

  handleEvent(e: GameEvent): void {
    switch (e.type) {
      case "explosion": {
        this.rings.push({ x: e.x, y: e.y, r: e.radius, age: 0 });
        this.shake = Math.max(this.shake, Math.min(14, e.radius / 5));
        const n = Math.round(e.radius / 2.5);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 80 + Math.random() * 380;
          this.particles.push({
            x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120,
            life: 0, max: 0.6 + Math.random() * 0.8, size: 2 + Math.random() * 4,
            color: Math.random() < 0.5 ? "#8a5a38" : "#6b6470", gravity: 900, fade: false,
          });
        }
        for (let i = 0; i < n / 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 20 + Math.random() * 140;
          this.particles.push({
            x: e.x, y: e.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60,
            life: 0, max: 0.7 + Math.random() * 0.7, size: 8 + Math.random() * 14,
            color: "rgba(70,66,76,0.55)", gravity: -40, fade: true,
          });
        }
        break;
      }
      case "splash":
        for (let i = 0; i < 22; i++) {
          this.particles.push({
            x: e.x + (Math.random() - 0.5) * 16, y: e.y,
            vx: (Math.random() - 0.5) * 220, vy: -150 - Math.random() * 330,
            life: 0, max: 0.6 + Math.random() * 0.5, size: 2 + Math.random() * 3,
            color: "#bfe6ff", gravity: 900, fade: true,
          });
        }
        break;
      case "shoot":
        for (let i = 0; i < 6; i++) {
          this.particles.push({
            x: e.x, y: e.y, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80,
            life: 0, max: 0.3, size: 4 + Math.random() * 4, color: "rgba(255,230,160,0.8)", gravity: 0, fade: true,
          });
        }
        break;
      case "tracer":
        this.tracers.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, age: 0 });
        break;
      case "damage":
        this.texts.push({ x: e.x, y: e.y, text: `-${e.amount}`, age: 0, color: "#ffe066" });
        break;
      case "bounce":
        for (let i = 0; i < 4; i++) {
          this.particles.push({
            x: e.x, y: e.y, vx: (Math.random() - 0.5) * 120, vy: -Math.random() * 100,
            life: 0, max: 0.35, size: 2, color: "#c9b79c", gravity: 500, fade: true,
          });
        }
        break;
      case "teleport":
        for (const [px, py] of [[e.fromX, e.fromY], [e.toX, e.toY]] as const) {
          for (let i = 0; i < 18; i++) {
            const a = Math.random() * Math.PI * 2;
            this.particles.push({
              x: px, y: py - 8, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140,
              life: 0, max: 0.6, size: 3, color: "#d9a8ff", gravity: 0, fade: true,
            });
          }
        }
        break;
      case "died":
        this.texts.push({ x: e.x, y: e.y - 30, text: e.cause === "water" ? t("hud.floatingDrown") : "†", age: 0, color: "#ffffff" });
        break;
      default:
        break;
    }
  }

  /** Effekte um `dt` Sekunden weiterbewegen (pro Frame, nicht pro Tick). */
  updateEffects(dt: number): void {
    this.time += dt;
    for (const p of this.particles) {
      p.life += dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter((r) => r.age < 0.35);
    for (const t of this.tracers) t.age += dt;
    this.tracers = this.tracers.filter((t) => t.age < 0.14);
    for (const t of this.texts) t.age += dt;
    this.texts = this.texts.filter((t) => t.age < 1.3);
    this.shake = Math.max(0, this.shake - dt * 30);
  }

  /** Wohin die Kamera schauen soll. */
  focusPoint(): { x: number; y: number } {
    const p = this.game.projectiles.find((q) => q.alive);
    if (p) return { x: p.x, y: p.y };
    const w = this.game.activeWorm;
    return { x: w.x, y: w.centerY };
  }

  // ------------------------------------------------------------------ Zeichnen

  render(): void {
    const { ctx, canvas, camera } = this;
    const w = canvas.width;
    const h = canvas.height;
    this.drawSky(w, h);

    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    ctx.save();
    ctx.setTransform(camera.zoom, 0, 0, camera.zoom, w / 2 - camera.x * camera.zoom + sx, h / 2 - camera.y * camera.zoom + sy);

    this.drawWaterBack();
    const tc = this.game.terrain.canvas;
    if (tc) this.drawTerrain(tc);
    for (const worm of this.game.worms) if (worm.grave) this.drawGrave(worm);
    for (const worm of this.game.worms) if (worm.alive) this.drawWorm(worm);
    for (const p of this.game.projectiles) this.drawProjectile(p);
    this.drawEffects();
    this.drawWaterFront();
    this.drawLabels();
    this.drawAim();
    ctx.restore();
    this.drawTexts();
  }

  /** Zeichnet nur den sichtbaren Ausschnitt der großen Gelände-Bitmap. */
  private drawTerrain(tc: HTMLCanvasElement): void {
    const { camera } = this;
    const margin = 24 + this.shake;
    const x0 = Math.max(0, Math.floor(camera.x - camera.viewW / (2 * camera.zoom) - margin));
    const y0 = Math.max(0, Math.floor(camera.y - camera.viewH / (2 * camera.zoom) - margin));
    const x1 = Math.min(tc.width, Math.ceil(camera.x + camera.viewW / (2 * camera.zoom) + margin));
    const y1 = Math.min(tc.height, Math.ceil(camera.y + camera.viewH / (2 * camera.zoom) + margin));
    if (x1 <= x0 || y1 <= y0) return;
    this.ctx.drawImage(tc, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  }

  /**
   * Himmel, Sonne und Hügel: wird nur neu gezeichnet, wenn sich Größe oder (auf ganze Pixel
   * gerundete) Parallaxe ändern. Steht die Kamera still, kostet der Hintergrund nur ein drawImage
   * statt mehrerer bildschirmgroßer Füllungen (merklich in Safari ohne Hardware-Beschleunigung).
   */
  private drawSky(w: number, h: number): void {
    const { ctx, camera } = this;
    const px = Math.round((camera.x / WORLD_W - 0.5) * -60);
    const par0 = Math.round((camera.x / WORLD_W - 0.5) * -120);
    const par1 = Math.round((camera.x / WORLD_W - 0.5) * -220);
    const key = `${w}x${h}|${px}|${par0}|${par1}`;
    if (typeof document !== "undefined") {
      let c = this.skyCache;
      if (!c || c.width !== w || c.height !== h) {
        c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        this.skyCache = c;
        this.skyKey = "";
      }
      if (this.skyKey !== key) {
        const cctx = c.getContext("2d", { alpha: false });
        if (cctx) {
          this.paintSky(cctx, w, h, px, [par0, par1]);
          this.skyKey = key;
        }
      }
      if (this.skyKey === key) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(c, 0, 0);
        return;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.paintSky(ctx, w, h, px, [par0, par1]);
  }

  private paintSky(ctx: CanvasRenderingContext2D, w: number, h: number, px: number, par: [number, number]): void {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#2b5fa8");
    g.addColorStop(0.55, "#7fb8e6");
    g.addColorStop(1, "#f3d9b1");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Sonne und ferne Hügel mit leichter Parallaxe
    ctx.fillStyle = "rgba(255,244,200,0.9)";
    ctx.beginPath();
    ctx.arc(w * 0.78 + px, h * 0.2, Math.max(24, Math.min(w, h) * 0.07), 0, Math.PI * 2);
    ctx.fill();
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer === 0 ? "rgba(70,110,150,0.35)" : "rgba(50,90,110,0.45)";
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 24) {
        const y = h * (0.7 + layer * 0.08) + Math.sin((x + par[layer]!) / (140 - layer * 40) + layer * 2) * h * 0.04;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  private waveY(x: number, amp: number, phase: number): number {
    return WATER_Y + Math.sin(x / 38 + this.time * 1.6 + phase) * amp + Math.sin(x / 91 + this.time * 0.9) * amp * 0.8;
  }

  private drawWaterBack(): void {
    const { ctx } = this;
    const [x0, x1] = this.visibleX();
    ctx.fillStyle = "rgba(20,60,120,0.9)";
    ctx.fillRect(x0, WATER_Y + 6, x1 - x0, WORLD_H - WATER_Y + 1500);
  }

  /** Sichtbarer Weltbereich in x (mit Rand), auf 16er-Raster gerundet. */
  private visibleX(): [number, number] {
    const { camera } = this;
    const half = camera.viewW / (2 * camera.zoom) + 48 + this.shake;
    return [Math.floor((camera.x - half) / 16) * 16, Math.ceil((camera.x + half) / 16) * 16];
  }

  private drawWaterFront(): void {
    const { ctx } = this;
    const [x0, x1] = this.visibleX();
    ctx.beginPath();
    ctx.moveTo(x0, WORLD_H + 1500);
    for (let x = x0; x <= x1; x += 16) ctx.lineTo(x, this.waveY(x, 4, 0));
    ctx.lineTo(x1, WORLD_H + 1500);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, WATER_Y - 10, 0, WATER_Y + 160);
    g.addColorStop(0, "rgba(90,170,235,0.62)");
    g.addColorStop(1, "rgba(18,56,120,0.82)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "rgba(220,245,255,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 16) {
      const y = this.waveY(x, 4, 0);
      if (x === x0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  private drawWorm(w: Worm): void {
    const { ctx } = this;
    const active = this.game.phase !== "gameover" && w.id === this.game.turns.activeWorm;
    const color = TEAM_COLORS[w.team]!;
    const dark = TEAM_DARK[w.team]!;
    const bob = w.grounded && w.vx === 0 ? Math.sin(this.time * 3 + w.id) * 0.6 : 0;
    const cx = w.x;
    const cy = w.y - 8 + bob;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(w.facing, 1);

    // Körper
    ctx.fillStyle = "#f4a6b8";
    ctx.strokeStyle = "#b8607a";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, 1, 6.5, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Teamband
    ctx.fillStyle = color;
    ctx.fillRect(-6.5, -4.5, 13, 3.4);
    ctx.fillStyle = dark;
    ctx.fillRect(-6.5, -1.5, 13, 0.9);
    // Augen
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(1.5, -1, 2.6, 0, Math.PI * 2);
    ctx.arc(5, -1, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1b1b2b";
    ctx.beginPath();
    ctx.arc(2.4, -0.8, 1.1, 0, Math.PI * 2);
    ctx.arc(5.7, -0.8, 1, 0, Math.PI * 2);
    ctx.fill();
    // Mund
    ctx.strokeStyle = "#8c3550";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(3.8, 3.2, 2, 0.1, Math.PI - 0.1);
    ctx.stroke();
    ctx.restore();

    if (active) this.drawHeldWeapon(w, cx, cy);
  }

  private drawHeldWeapon(w: Worm, cx: number, cy: number): void {
    const { ctx } = this;
    const def = this.game.weapon;
    if (!def.aimable || this.game.phase === "resolve") return;
    const a = (w.aim * Math.PI) / 180;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-a * w.facing);
    ctx.scale(w.facing, 1);
    if (def.id === "bazooka") {
      ctx.fillStyle = "#4b5a45";
      ctx.fillRect(2, -2.5, 17, 5);
      ctx.fillStyle = "#2f382c";
      ctx.fillRect(16, -3.2, 4, 6.4);
    } else if (def.id === "shotgun") {
      ctx.fillStyle = "#3a2c22";
      ctx.fillRect(2, -1.6, 16, 3.2);
      ctx.fillStyle = "#8c8f96";
      ctx.fillRect(10, -1.2, 12, 2.4);
    } else {
      ctx.fillStyle = "#3e8e41";
      ctx.beginPath();
      ctx.arc(9, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawGrave(w: Worm): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.fillStyle = "#b9b4c0";
    ctx.strokeStyle = "#6d6878";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-6, -11);
    ctx.arc(0, -11, 6, Math.PI, 0);
    ctx.lineTo(6, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = TEAM_COLORS[w.team]!;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-3, -9);
    ctx.lineTo(3, -9);
    ctx.moveTo(0, -12);
    ctx.lineTo(0, -5);
    ctx.stroke();
    ctx.restore();
  }

  private drawProjectile(p: Projectile): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.kind === "bazooka") {
      ctx.rotate(p.angle);
      ctx.fillStyle = "#ffb347";
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-15 - Math.random() * 6, -2.5);
      ctx.lineTo(-15 - Math.random() * 6, 2.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#d9dde3";
      ctx.fillRect(-7, -2.6, 13, 5.2);
      ctx.fillStyle = "#c0392b";
      ctx.beginPath();
      ctx.moveTo(6, -2.6);
      ctx.lineTo(10, 0);
      ctx.lineTo(6, 2.6);
      ctx.closePath();
      ctx.fill();
      if (Math.random() < 0.7) {
        this.particles.push({
          x: p.x - Math.cos(p.angle) * 8, y: p.y - Math.sin(p.angle) * 8,
          vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
          life: 0, max: 0.5, size: 4 + Math.random() * 4, color: "rgba(200,200,200,0.5)", gravity: -20, fade: true,
        });
      }
    } else if (p.kind === "grenade") {
      ctx.rotate(p.age * 6);
      ctx.fillStyle = "#3e8e41";
      ctx.strokeStyle = "#1f4d22";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#222";
      ctx.fillRect(-1.5, -7, 3, 3);
      ctx.rotate(-p.age * 6);
      this.drawFuseNumber(p.fuse);
    } else {
      ctx.fillStyle = "#d33";
      ctx.fillRect(-4, -9, 8, 18);
      ctx.fillStyle = "#fff";
      ctx.fillRect(-4, -3, 8, 3);
      ctx.fillStyle = "#222";
      ctx.fillRect(-0.7, -13, 1.4, 5);
      if (Math.random() < 0.8) {
        ctx.fillStyle = "#ffd24d";
        ctx.beginPath();
        ctx.arc(0, -14, 2 + Math.random() * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      this.drawFuseNumber(p.fuse, -20);
    }
    ctx.restore();
  }

  private drawFuseNumber(fuse: number | null, y = -14): void {
    if (fuse === null) return;
    const { ctx } = this;
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.7)";
    ctx.lineWidth = 3;
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    const txt = String(Math.max(0, Math.ceil(fuse)));
    ctx.strokeText(txt, 0, y);
    ctx.fillText(txt, 0, y);
  }

  private drawEffects(): void {
    const { ctx } = this;
    for (const r of this.rings) {
      const t = r.age / 0.35;
      ctx.fillStyle = `rgba(255,${Math.round(220 - 120 * t)},80,${0.85 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r * (0.7 + 0.6 * t), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - t)})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    for (const p of this.particles) {
      const a = p.fade ? 1 - p.life / p.max : 1;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of this.tracers) {
      ctx.strokeStyle = `rgba(255,240,170,${1 - t.age / 0.14})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
    }
  }

  /**
   * Maßstab für Beschriftungen: Name, Lebensbalken, Pfeil und Schadenszahlen bleiben
   * unabhängig vom Zoom in etwa gleich groß auf dem Bildschirm (nur Würmer und Welt skalieren).
   */
  private labelScale(): number {
    return Math.min(2, Math.max(0.35, this.dpr / this.camera.zoom));
  }

  private drawLabels(): void {
    const { ctx } = this;
    const k = this.labelScale();
    ctx.textAlign = "center";
    ctx.font = "bold 12px system-ui, sans-serif";
    for (const w of this.game.worms) {
      if (!w.alive) continue;
      // Anker knapp über dem Kopf; ab hier wird in Bildschirmgröße gezeichnet.
      ctx.save();
      ctx.translate(w.x, w.y - 22);
      ctx.scale(k, k);
      const tw = ctx.measureText(w.name).width;
      ctx.fillStyle = "rgba(10,14,28,0.65)";
      ctx.fillRect(-tw / 2 - 4, -22, tw + 8, 16);
      ctx.fillStyle = TEAM_COLORS[w.team]!;
      ctx.fillText(w.name, 0, -10);
      ctx.fillStyle = "rgba(10,14,28,0.75)";
      ctx.fillRect(-15, -4, 30, 6);
      ctx.fillStyle = w.hp > 50 ? "#69db7c" : w.hp > 25 ? "#ffd43b" : "#ff6b6b";
      ctx.fillRect(-14, -3, 28 * (w.hp / 100), 4);
      ctx.restore();
    }
    // Pfeil über dem aktiven Wurm
    const g = this.game;
    if (g.phase === "turn" || g.phase === "retreat") {
      const w = g.activeWorm;
      if (w.alive) {
        const y = -38 + Math.sin(this.time * 6) * 3;
        ctx.save();
        ctx.translate(w.x, w.y - 22);
        ctx.scale(k, k);
        ctx.fillStyle = TEAM_COLORS[w.team]!;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y + 8);
        ctx.lineTo(-7, y - 4);
        ctx.lineTo(7, y - 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  private drawAim(): void {
    const g = this.game;
    if (g.phase !== "turn" && !(g.phase === "retreat" && g.weapon.id === "shotgun")) return;
    const w = g.activeWorm;
    const def = g.weapon;
    if (!w.alive || !def.aimable) return;
    const { ctx } = this;
    const a = (w.aim * Math.PI) / 180;
    const dx = w.facing * Math.cos(a);
    const dy = -Math.sin(a);
    const dist = 62 + (def.chargeable ? g.power * 40 : 0);
    const x = w.x + dx * dist;
    const y = w.centerY + dy * dist;
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x, y + 11);
    ctx.stroke();
    if (def.chargeable && g.power > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(w.x + dx * 18, w.centerY + dy * 18);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Schwebende Texte (Schaden etc.): Position in Weltkoordinaten, Größe in Bildschirmmaß. */
  private drawTexts(): void {
    const { ctx, camera, canvas } = this;
    const scale = this.labelScale();
    ctx.save();
    ctx.setTransform(camera.zoom, 0, 0, camera.zoom, canvas.width / 2 - camera.x * camera.zoom, canvas.height / 2 - camera.y * camera.zoom);
    ctx.textAlign = "center";
    ctx.font = "bold 18px system-ui, sans-serif";
    for (const t of this.texts) {
      const k = t.age / 1.3;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.fillStyle = t.color;
      ctx.save();
      ctx.translate(t.x, t.y - 40 * k * scale);
      ctx.scale(scale, scale);
      ctx.strokeText(t.text, 0, 0);
      ctx.fillText(t.text, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
}
