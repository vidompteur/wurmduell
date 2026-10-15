import { WORLD_H, WORLD_W } from "../game/constants";

/**
 * Pixelbasiertes, zerstörbares Terrain.
 *
 * Die Kollisionsmaske (`mask`) ist die Wahrheit für Physik und KI und lebt als
 * flaches Byte-Array – dadurch ist sie auch ohne DOM testbar. Zusätzlich hält
 * das Terrain optional eine Offscreen-Bitmap (`canvas`), auf der es gezeichnet
 * wird. Ein Pixel ist solide, wenn sein Alpha-Wert in der Bitmap > 0 ist; die
 * Maske wird bei jeder Änderung synchron gehalten.
 */
export class Terrain {
  readonly width: number;
  readonly height: number;
  readonly mask: Uint8Array;
  canvas: HTMLCanvasElement | null = null;
  /** Wird bei jeder Zerstörung erhöht (z. B. zum Cachen). */
  version = 0;
  private ctx: CanvasRenderingContext2D | null = null;

  constructor(width = WORLD_W, height = WORLD_H, mask?: Uint8Array) {
    this.width = width;
    this.height = height;
    this.mask = mask ?? new Uint8Array(width * height);
  }

  /** Außerhalb links/rechts/oben ist leer (man fällt), unten ist fester Boden. */
  isSolid(x: number, y: number): boolean {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || ix >= this.width || iy < 0) return false;
    if (iy >= this.height) return true;
    return this.mask[iy * this.width + ix] !== 0;
  }

  /** Erste feste Zeile ab `fromY` in Spalte `x`, sonst -1. */
  findSurfaceY(x: number, fromY = 0): number {
    const ix = Math.floor(x);
    if (ix < 0 || ix >= this.width) return -1;
    for (let y = Math.max(0, Math.floor(fromY)); y < this.height; y++) {
      if (this.mask[y * this.width + ix] !== 0) return y;
    }
    return -1;
  }

  fillCircle(cx: number, cy: number, r: number): void {
    this.setCircle(cx, cy, r, 1);
  }

  /** Entfernt Terrain in einem Kreis (Explosion). */
  carveCircle(cx: number, cy: number, r: number): void {
    this.setCircle(cx, cy, r, 0);
    if (this.ctx) {
      this.ctx.globalCompositeOperation = "destination-out";
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.globalCompositeOperation = "source-over";
    }
    this.version++;
  }

  private setCircle(cx: number, cy: number, r: number, value: 0 | 1): void {
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      const row = y * this.width;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) this.mask[row + x] = value;
      }
    }
  }

  /** Erzeugt die Offscreen-Bitmap aus der Maske (prozedurale Textur). */
  attachCanvas(): void {
    if (typeof document === "undefined") return;
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const image = ctx.createImageData(this.width, this.height);
    paintTexture(this.mask, this.width, this.height, image.data);
    ctx.putImageData(image, 0, 0);
    this.canvas = canvas;
    this.ctx = ctx;
  }

  /** Gibt Canvas-Ressourcen frei. */
  dispose(): void {
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    this.canvas = null;
    this.ctx = null;
  }
}

function noise(x: number, y: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) & 255) / 255;
}

/** Gras oben, darunter Erde, tief unten Fels. Abhängig von der Tiefe unter der Oberkante. */
function paintTexture(
  mask: Uint8Array,
  width: number,
  height: number,
  out: Uint8ClampedArray,
): void {
  for (let x = 0; x < width; x++) {
    let depth = 0;
    for (let y = 0; y < height; y++) {
      const i = y * width + x;
      if (mask[i] === 0) {
        depth = 0;
        continue;
      }
      depth++;
      const n = noise(x, y);
      let r: number;
      let g: number;
      let b: number;
      if (depth <= 6) {
        const t = depth <= 2 ? 1 : 0.8;
        r = (70 + n * 30) * t;
        g = (150 + n * 50) * t;
        b = (55 + n * 20) * t;
      } else if (depth <= 46) {
        const f = 1 - (depth - 6) / 80;
        r = (140 + n * 30) * f;
        g = (92 + n * 22) * f;
        b = (58 + n * 16) * f;
      } else {
        const shade = 1 - Math.min(0.5, (y / height) * 0.5);
        const spot = n > 0.93 ? 1.3 : 1;
        r = (96 + n * 22) * shade * spot;
        g = (84 + n * 20) * shade * spot;
        b = (86 + n * 22) * shade * spot;
      }
      const o = i * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 255;
    }
  }
}
