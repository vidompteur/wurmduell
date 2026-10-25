import { describe, expect, it } from "vitest";
import { QualityMonitor } from "../src/render/quality";

/** Füttert den Monitor mit n gleich langen Bildern und liefert das letzte Ergebnis. */
function feed(m: QualityMonitor, ms: number, n: number, dpr: number): number | null {
  let out: number | null = null;
  for (let i = 0; i < n; i++) out = m.push(ms / 1000, dpr);
  return out;
}

describe("QualityMonitor", () => {
  it("lässt flüssiges Spiel unverändert", () => {
    expect(feed(new QualityMonitor(), 16.7, 200, 2) === null).toBe(true);
  });

  it("lässt eine 30-fps-Begrenzung (33,3 ms) in Ruhe", () => {
    expect(feed(new QualityMonitor(), 33.4, 300, 1.5) === null).toBe(true);
  });

  it("senkt die Pixeldichte bei wirklich zu langsamen Bildern schrittweise bis 1", () => {
    const m = new QualityMonitor();
    const a = feed(m, 60, 45, 2);
    expect(a).toBe(1.6);
    const b = feed(m, 60, 45, a ?? 2);
    expect(b).toBe(1.28);
    const c = feed(m, 60, 45, b ?? 2);
    expect(c).toBe(1.02);
    expect(feed(m, 60, 45, 1) === null).toBe(true);
  });

  it("geht nie unter die Untergrenze", () => {
    expect(feed(new QualityMonitor(), 80, 45, 1.1)).toBe(1);
  });

  it("ignoriert Ausreißer wie pausierte Tabs", () => {
    const m = new QualityMonitor();
    expect(feed(m, 60, 30, 2) === null).toBe(true);
    expect(m.push(5, 2) === null).toBe(true); // Tab war im Hintergrund: Messung beginnt neu
    expect(feed(m, 10, 100, 2) === null).toBe(true);
  });
});
