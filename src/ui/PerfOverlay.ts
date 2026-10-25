import { h } from "./dom";

/**
 * Diagnose-Anzeige für die Leistung (nur mit `?perf` in der Adresse): Bildrate, Bildzeiten,
 * Zeit in Spiellogik und Zeichnen, Canvas-Größe und die vom Browser gemeldete Grafikkarte.
 * Hilft zu erkennen, ob der Browser ohne Hardware-Beschleunigung (Software-Rendering) zeichnet.
 */
export class PerfOverlay {
  readonly el = h("pre", { class: "perf-overlay" });
  private frames = 0;
  private sum = 0;
  private max = 0;
  private update = 0;
  private render = 0;
  private since = performance.now();
  private readonly gpu = gpuName();

  /** Wird pro Bild aufgerufen (Zeiten in Millisekunden). */
  frame(frameMs: number, updateMs: number, renderMs: number, canvas: HTMLCanvasElement, dpr: number): void {
    this.frames++;
    this.sum += frameMs;
    this.max = Math.max(this.max, frameMs);
    this.update += updateMs;
    this.render += renderMs;
    const now = performance.now();
    if (now - this.since < 500) return;
    const n = this.frames;
    this.el.textContent =
      `${((n * 1000) / (now - this.since)).toFixed(0)} fps · Bild ${(this.sum / n).toFixed(1)} ms (max ${this.max.toFixed(0)})\n` +
      `Logik ${(this.update / n).toFixed(2)} ms · Zeichnen (JS) ${(this.render / n).toFixed(2)} ms\n` +
      `Canvas ${canvas.width}×${canvas.height} · dpr ${dpr.toFixed(2)}\n` +
      `GPU ${this.gpu}`;
    this.frames = 0;
    this.sum = 0;
    this.max = 0;
    this.update = 0;
    this.render = 0;
    this.since = now;
  }
}

function gpuName(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    if (gl && ext) return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    return gl ? "unbekannt" : "kein WebGL";
  } catch {
    return "unbekannt";
  }
}
