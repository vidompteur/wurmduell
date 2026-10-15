import { DT } from "./constants";

/**
 * Fester Zeitschritt: Die Simulation läuft mit exakt `TICK_RATE` Ticks pro
 * Sekunde, unabhängig von der Bildrate. Gezeichnet wird pro Animationsframe.
 */
export class GameLoop {
  paused = false;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (frameDt: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Beendet die Schleife endgültig (Aufräumen am Matchende). */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const frameDt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    if (!this.paused) {
      this.acc += frameDt;
      let steps = 0;
      while (this.acc >= DT && steps < 12) {
        this.update(DT);
        this.acc -= DT;
        steps++;
      }
      if (steps === 12) this.acc = 0;
    }
    this.render(frameDt);
    this.raf = requestAnimationFrame(this.frame);
  };
}
