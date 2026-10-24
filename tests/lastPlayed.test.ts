import { describe, expect, it } from "vitest";
import { lastPlayed } from "../src/ladder/format";

describe("Letztes Spiel", () => {
  it("formatiert den Zeitpunkt und zeigt „–“ für unbekannte Werte", () => {
    expect(lastPlayed("2026-10-24T07:07:17.464Z").includes("26")).toBe(true);
    expect(lastPlayed(new Date(0).toISOString())).toBe("–");
    expect(lastPlayed("kaputt")).toBe("–");
  });
});
