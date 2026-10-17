import { WORLD_H, WORLD_W } from "../game/constants";

/**
 * Kamera mit Zoom und Verschieben. Alle Bildschirmkoordinaten sind Canvas-Pixel;
 * `zoom` ist Canvas-Pixel pro Welt-Pixel (auf Retina-Displays also doppelt so groß
 * wie in CSS-Pixeln gedacht – der Aufrufer rechnet die Pixeldichte ein).
 */
export class Camera {
  /** Weltpunkt in der Bildmitte. */
  x = WORLD_W / 2;
  y = WORLD_H / 2;
  zoom = 0.8;
  viewW = 1280;
  viewH = 720;
  /** Maximaler Zoom (in Canvas-Pixeln pro Welt-Pixel, wird an die Pixeldichte angepasst). */
  maxZoom = 4;
  private manualUntil = 0;

  resize(w: number, h: number): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
    this.zoom = Math.max(this.zoom, this.minZoom);
    this.clamp();
  }

  /** Kleinster Zoom: die Karte füllt die Ansicht, es gibt keinen leeren Rand. */
  get minZoom(): number {
    return Math.max(this.viewW / WORLD_W, this.viewH / WORLD_H);
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom + this.viewW / 2,
      y: (wy - this.y) * this.zoom + this.viewH / 2,
    };
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  /** Zoomt so, dass der Weltpunkt unter (sx, sy) stehen bleibt. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
    this.holdManual();
  }

  /** Verschiebt die Ansicht um Bildschirm-Pixel. */
  pan(dxScreen: number, dyScreen: number): void {
    this.x -= dxScreen / this.zoom;
    this.y -= dyScreen / this.zoom;
    this.clamp();
    this.holdManual();
  }

  /** Verhindert für kurze Zeit das automatische Folgen. */
  holdManual(ms = 2500): void {
    this.manualUntil = performance.now() + ms;
  }

  /** Folgt weich einem Weltpunkt (außer der Spieler steuert die Kamera gerade selbst). */
  follow(tx: number, ty: number, dt: number): void {
    if (performance.now() < this.manualUntil) return;
    const k = 1 - Math.exp(-5 * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
    this.clamp();
  }

  /** Springt sofort zu einem Punkt. */
  snapTo(tx: number, ty: number): void {
    this.x = tx;
    this.y = ty;
    this.clamp();
  }

  clamp(): void {
    const halfW = this.viewW / (2 * this.zoom);
    const halfH = this.viewH / (2 * this.zoom);
    this.x = halfW * 2 >= WORLD_W ? WORLD_W / 2 : Math.min(WORLD_W - halfW, Math.max(halfW, this.x));
    this.y = halfH * 2 >= WORLD_H ? WORLD_H / 2 : Math.min(WORLD_H - halfH, Math.max(halfH, this.y));
  }
}
