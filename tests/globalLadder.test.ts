import { describe, expect, it } from "vitest";
import { EMPTY_GLOBAL_LADDER, type FetchLike, buildGlobalEntries, discoverPlayers, isPlausible, newestLadder, parseGlobalLadder } from "../src/ladder/globalLadder";

const summary = (over: Record<string, unknown> = {}) => ({
  matches: 10, wins: 6, losses: 4, shotsFired: 40, shotsHit: 20, damageDealt: 900, damageTaken: 700,
  bestWinStreak: 3, currentWinStreak: 1, updatedAt: "2026-05-01T00:00:00.000Z", ...over,
});

interface Fake { did: string; handle: string; value?: unknown; error?: "RecordNotFound" | "down" }

/** Fake-Netz: Handle-API, PLC-Verzeichnis und PDS-getRecord. */
function fakeNet(users: Fake[]): FetchLike {
  const res = (status: number, body: unknown) => Promise.resolve({ ok: status === 200, status, json: async () => body });
  return (url) => {
    const u = new URL(url);
    if (u.host === "public.api.bsky.app") {
      const user = users.find((x) => x.handle === u.searchParams.get("handle"));
      return user ? res(200, { did: user.did }) : res(400, { error: "InvalidRequest" });
    }
    if (u.host === "plc.directory") {
      const user = users.find((x) => `/${x.did}` === u.pathname);
      return user
        ? res(200, { alsoKnownAs: [`at://${user.handle}`], service: [{ id: "#atproto_pds", type: "AtprotoPersonalDataServer", serviceEndpoint: `https://pds.${user.handle}` }] })
        : res(404, null);
    }
    const user = users.find((x) => u.host === `pds.${x.handle}`);
    if (!user || user.error === "down") return res(500, null);
    if (user.error === "RecordNotFound") return res(400, { error: "RecordNotFound" });
    return res(200, { value: user.value });
  };
}

describe("Globale Ladder", () => {
  it("löst Handles und DIDs auf und sortiert nach Siegen", async () => {
    const net = fakeNet([
      { did: "did:plc:a", handle: "anna.test", value: summary({ wins: 3, losses: 7 }) },
      { did: "did:plc:b", handle: "ben.test", value: summary({ wins: 8, losses: 2 }) },
    ]);
    const { entries, report } = await buildGlobalEntries({ players: ["@anna.test", "did:plc:b", "did:plc:a"], previous: EMPTY_GLOBAL_LADDER, fetchFn: net });
    expect(entries.map((e) => e.handle)).toEqual(["ben.test", "anna.test"]);
    expect(entries[0]).toMatchObject({ playerId: "did:plc:b", wins: 8, name: "ben.test" });
    expect(report.filter((r) => r.status === "ok")).toHaveLength(3); // Duplikat wird gemeldet
  });

  it("überspringt Spieler ohne Record und unplausible Werte", async () => {
    const net = fakeNet([
      { did: "did:plc:a", handle: "anna.test", error: "RecordNotFound" },
      { did: "did:plc:b", handle: "ben.test", value: summary({ shotsHit: 99, shotsFired: 3 }) },
    ]);
    const { entries, report } = await buildGlobalEntries({ players: ["anna.test", "ben.test"], previous: EMPTY_GLOBAL_LADDER, fetchFn: net });
    expect(entries).toHaveLength(0);
    expect(report.map((r) => r.status)).toEqual(["no-record", "implausible"]);
  });

  it("behält bei PDS-Ausfall den alten Stand", async () => {
    const good = fakeNet([{ did: "did:plc:a", handle: "anna.test", value: summary() }]);
    const first = await buildGlobalEntries({ players: ["anna.test"], previous: EMPTY_GLOBAL_LADDER, fetchFn: good });
    const down = fakeNet([{ did: "did:plc:a", handle: "anna.test", error: "down" }]);
    const second = await buildGlobalEntries({
      players: ["anna.test"],
      previous: { version: 1, updatedAt: "x", entries: first.entries },
      fetchFn: down,
    });
    expect(second.entries).toHaveLength(1);
    expect(second.report[0]!.status).toBe("stale");
  });

  it("meldet nicht auflösbare Handles als Fehler statt abzustürzen", async () => {
    const { entries, report } = await buildGlobalEntries({ players: ["gibt.es.nicht"], previous: EMPTY_GLOBAL_LADDER, fetchFn: fakeNet([]) });
    expect(entries).toHaveLength(0);
    expect(report[0]!.status).toBe("error");
  });

  it("liest ladder.json defensiv und prüft Plausibilität", () => {
    expect(parseGlobalLadder("müll").entries).toHaveLength(0);
    const f = parseGlobalLadder({ version: 1, updatedAt: "2026-05-01T00:00:00.000Z", entries: [{ playerId: "did:plc:a", handle: "a.test", wins: 2, matches: 3 }, 42] });
    expect(f.entries).toHaveLength(1);
    expect(f.entries[0]).toMatchObject({ handle: "a.test", wins: 2, name: "a.test" });
    expect(isPlausible({ ...f.entries[0]!, wins: 5 })).toBe(false);
  });

  it("sperrt Konten aus der Sperrliste (Handle oder DID)", async () => {
    const net = fakeNet([
      { did: "did:plc:a", handle: "anna.test", value: summary() },
      { did: "did:plc:b", handle: "ben.test", value: summary() },
    ]);
    const { entries, report } = await buildGlobalEntries({ players: ["anna.test", "ben.test"], blocked: ["did:plc:b"], previous: EMPTY_GLOBAL_LADDER, fetchFn: net });
    expect(entries.map((e) => e.handle)).toEqual(["anna.test"]);
    expect(/gesperrt/.test(report.find((l) => l.input === "ben.test")?.message ?? "")).toBe(true);
  });

  describe("discoverPlayers", () => {
    const res = (status: number, body: unknown) => Promise.resolve({ ok: status === 200, status, json: async () => body });

    it("liest alle Seiten der Relay-Abfrage", async () => {
      const seen: string[] = [];
      const fetchFn: FetchLike = (url) => {
        seen.push(url);
        const cursor = new URL(url).searchParams.get("cursor");
        return cursor ? res(200, { repos: [{ did: "did:plc:c" }] }) : res(200, { cursor: "next", repos: [{ did: "did:plc:a" }, { did: "did:plc:b" }] });
      };
      const out = await discoverPlayers(fetchFn);
      expect(out).toEqual({ dids: ["did:plc:a", "did:plc:b", "did:plc:c"], error: null });
      expect(seen[0]?.includes("collection=de.wurmduell.ladderSummary")).toBe(true);
    });

    it("liefert bei Relay-Fehlern keine Konten, aber auch keinen Abbruch", async () => {
      const failed = await discoverPlayers(() => res(500, null));
      expect(failed.dids).toEqual([]);
      expect(failed.error?.includes("500")).toBe(true);
      expect(await discoverPlayers(() => Promise.reject(new Error("offline")))).toEqual({ dids: [], error: "offline" });
    });
  });

  it("wählt den jüngeren Stand und kommt mit fehlenden Quellen zurecht", () => {
    const old = { version: 1 as const, updatedAt: "2026-10-20T13:19:00.000Z", entries: [] };
    const neu = { version: 1 as const, updatedAt: "2026-10-24T07:07:00.000Z", entries: [] };
    expect(newestLadder(old, neu)).toBe(neu);
    expect(newestLadder(neu, old)).toBe(neu);
    expect(newestLadder(null, old)).toBe(old);
    expect(newestLadder(null, null)).toBe(null);
    expect(newestLadder({ ...old, updatedAt: null }, old)).toBe(old);
  });
});
