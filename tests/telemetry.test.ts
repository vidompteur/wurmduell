import { describe, expect, it } from "vitest";
import { buildEvent, clientInfo, telemetryEnabled, initTelemetry, logLogin, logLogout, logMatch, reportError, matchSummary } from "../src/telemetry";
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
  it("ist ohne Host aus und alle Aufrufe sind harmlos", () => {
    expect(telemetryEnabled()).toBe(false);
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
});
