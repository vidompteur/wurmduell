import { describe, expect, it } from "vitest";
import { geoText, parseGeo, shortAgent, buildEvent, clientInfo, telemetryEnabled, initTelemetry, logLogin, logLogout, logMatch, reportError, matchSummary } from "../src/telemetry";
import type { MatchResult } from "../src/types";

const result = {
  winner: 0,
  reason: "elimination",
  durationSeconds: 61.4,
  mapSeed: "abc",
  config: { mode: "vsAi", wormsPerTeam: 2, teleports: 1, pure: false, teams: [] },
  teams: [
    { name: "Anna", controller: { kind: "human", playerId: "did:plc:a" }, stats: { shotsFired: 5, shotsHit: 3, damageDealt: 90, damageTaken: 20 }, wormsAlive: 1 },
    { name: "Computer", controller: { kind: "ai", level: "hard" }, stats: { shotsFired: 4, shotsHit: 1, damageDealt: 20, damageTaken: 90 }, wormsAlive: 0 },
  ],
} as unknown as MatchResult;

describe("Telemetrie", () => {
  it("alle Aufrufe sind unter Node harmlos und senden nichts", () => {
    expect(typeof telemetryEnabled()).toBe("boolean");
    let threw = false;
    try {
      initTelemetry();
      reportError(new Error("x"), "test");
      logLogin("did:plc:a", "anna.test");
      logMatch(result);
      logLogout();
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  it("fasst ein Match mit Sieger, Teams und Statistik zusammen", () => {
    const s = matchSummary(result) as { winner: string; durationSeconds: number; teams: { controller: unknown; damageDealt: number }[] };
    expect(s.winner).toBe("Anna");
    expect(s.durationSeconds).toBe(61);
    expect(s.teams[0]).toMatchObject({ controller: { kind: "human", playerId: "did:plc:a" }, damageDealt: 90 });
    expect(s.teams[1]?.controller).toEqual({ kind: "ai", level: "hard" });
  });

  it("sammelt Browserangaben auch ohne Browser-Umgebung ohne Fehler", () => {
    const info = clientInfo();
    expect(typeof info).toBe("object");
    expect(typeof info.timeZone).toBe("string");
  });

  it("baut Logzeilen mit Zeit, Stufe, Nachricht und Zusatzfeldern", () => {
    const e = buildEvent("info", "Test", { event: "x", n: 1 }, new Date("2026-01-02T03:04:05.000Z"));
    expect(e).toMatchObject({ dt: "2026-01-02T03:04:05.000Z", level: "info", message: "Test", event: "x", n: 1 });
  });

  it("hängt nach dem Login den Nutzer an jede Zeile", () => {
    logLogin("did:plc:a", "anna.test");
    expect(buildEvent("info", "Danach")).toMatchObject({ user: { did: "did:plc:a", handle: "anna.test" } });
    logLogout();
    expect("user" in buildEvent("info", "Nachher")).toBe(false);
  });

  it("kürzt den User-Agent auf Browser und Betriebssystem", () => {
    expect(shortAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:158.0) Gecko/20100101 Firefox/158.0")).toBe("Firefox 158 / macOS");
    expect(shortAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0")).toBe("Edge 130 / Windows");
    expect(shortAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari 17 / iOS");
    expect(shortAgent(undefined)).toBe("unbekannter Browser");
  });

  it("liest IP und Ort aus den Antworten gängiger Dienste", () => {
    const a = parseGeo({ success: true, ip: "1.2.3.4", city: "Berlin", region: "Berlin", country: "Germany", country_code: "DE", connection: { isp: "Telekom" }, latitude: 52.5, longitude: 13.4 });
    expect(a).toMatchObject({ ip: "1.2.3.4", city: "Berlin", countryCode: "DE", org: "Telekom" });
    expect(geoText(a)).toBe("1.2.3.4, Berlin, DE");
    expect(parseGeo({ ip: "5.6.7.8", city: "Wien", country_name: "Austria", org: "A1" })).toMatchObject({ country: "Austria", org: "A1" });
    expect(parseGeo({ success: false })).toBe(null);
    expect(parseGeo("kaputt")).toBe(null);
    expect(geoText(null)).toBe("");
  });
});
