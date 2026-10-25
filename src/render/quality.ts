/**
 * Passt die Render-Auflösung an die Leistung des Geräts an: Läuft das Spiel zu langsam
 * (typisch auf Retina-Displays ohne starke GPU), sinkt die Pixeldichte schrittweise,
 * bis die Bildrate stimmt. Sie steigt nie wieder, damit nichts hin und her springt.
 */
export class QualityMonitor {
  private sum = 0;
  private count = 0;

  constructor(
    /** Schwelle in Millisekunden pro Bild, ab der heruntergeregelt wird (22 ≈ unter 45 Bilder/s). */
    private readonly slowMs = 22,
    /** So viele Bilder werden pro Messung gemittelt. */
    private readonly window = 45,
    /** Faktor pro Stufe. */
    private readonly step = 0.8,
    /** Kleinste Pixeldichte. */
    private readonly floor = 1,
  ) {}

  /** Meldet die Dauer eines Bildes in Sekunden; liefert die neue Pixeldichte, wenn sie sinken soll. */
  push(frameSeconds: number, currentDpr: number): number | null {
    // Pausierte Tabs, Ladehänger und Debugger-Stopps (große Werte) zählen nicht.
    if (!(frameSeconds > 0) || frameSeconds > 0.2) {
      this.reset();
      return null;
    }
    this.sum += frameSeconds * 1000;
    this.count++;
    if (this.count < this.window) return null;
    const avg = this.sum / this.count;
    this.reset();
    if (avg <= this.slowMs || currentDpr <= this.floor) return null;
    return Math.max(this.floor, Math.round(currentDpr * this.step * 100) / 100);
  }

  reset(): void {
    this.sum = 0;
    this.count = 0;
  }
}
