import { describe, expect, it } from "vitest";
import { COLLECTIONS, entryFromSummary, matchRecordsForAccount, mergeLadder, summaryRecord } from "../src/atproto/records";
import { SyncQueue, syncAccount, type PdsClient } from "../src/atproto/sync";
import { LadderStore } from "../src/ladder/LadderStore";
import type { LadderEntry, MatchResult } from "../src/types";
import { MemoryStorage } from "./helpers";

const DID = "did:plc:abc123";

function result(winner: number | null): MatchResult {
  const stats = { shotsFired: 4, shotsHit: 3, damageDealt: 120, damageTaken: 40 };
  return {
    winner,
    reason: "elimination",
    durationSeconds: 95.4,
    mapSeed: "seed",
    config: { mode: "vsAi", wormsPerTeam: 3, teams: [] as never },
    teams: [
      { name: "anna.test", controller: { kind: "human", playerId: DID }, stats, wormsAlive: 1 },
      { name: "Computer (Normal)", controller: { kind: "ai", level: "normal" }, stats: { ...stats, damageDealt: 40 }, wormsAlive: 0 },
    ],
  } as MatchResult;
}

class FakePds implements PdsClient {
  records = new Map<string, unknown>();
  created: { collection: string; record: unknown }[] = [];
  failCreates = false;
  async createRecord(collection: string, record: object): Promise<void> {
    if (this.failCreates) throw new Error("offline");
    this.created.push({ collection, record });
  }
  async getRecord(collection: string, rkey: string): Promise<unknown | null> {
    return this.records.get(`${collection}/${rkey}`) ?? null;
  }
  async putRecord(collection: string, rkey: string, record: object): Promise<void> {
    this.records.set(`${collection}/${rkey}`, record);
  }
}

const entry = (over: Partial<LadderEntry> = {}): LadderEntry => ({
  playerId: DID, name: "anna.test", matches: 1, wins: 1, losses: 0, shotsFired: 4, shotsHit: 3,
  damageDealt: 120, damageTaken: 40, bestWinStreak: 1, currentWinStreak: 1, updatedAt: "2026-01-02T00:00:00.000Z", ...over,
});

describe("ATProto-Records", () => {
  it("erzeugt matchResult nur für das angemeldete Konto, KI als Gegner ohne DID", () => {
    const [rec, ...rest] = matchRecordsForAccount(result(0), DID, "2026-01-01T00:00:00.000Z");
    expect(rest).toHaveLength(0);
    expect(rec).toMatchObject({ $type: COLLECTIONS.matchResult, mode: "vsAi", outcome: "win", opponent: { kind: "ai", name: "Computer (Normal)" }, durationSeconds: 95 });
    expect(rec!.opponent.did).toBeUndefined();
    expect(matchRecordsForAccount(result(0), "did:plc:other", "x")).toHaveLength(0);
  });

  it("merged Summaries nach Spec 9.4", () => {
    const local = entry({ matches: 5, wins: 3, currentWinStreak: 2, updatedAt: "2026-02-01T00:00:00.000Z" });
    const remote = entry({ matches: 7, wins: 2, bestWinStreak: 4, currentWinStreak: 0, updatedAt: "2026-03-01T00:00:00.000Z" });
    const m = mergeLadder(local, remote);
    expect(m).toMatchObject({ matches: 7, wins: 3, bestWinStreak: 4, currentWinStreak: 0, updatedAt: remote.updatedAt });
  });

  it("liest fremde Summary-Daten defensiv ein", () => {
    expect(entryFromSummary("kaputt", DID, "x")).toBeNull();
    const e = entryFromSummary({ matches: -3, wins: "viel", shotsFired: 2.7, updatedAt: "nein" }, DID, "x")!;
    expect(e.matches).toBe(0);
    expect(e.wins).toBe(0);
    expect(e.shotsFired).toBe(2);
    expect(e.updatedAt).toBe(new Date(0).toISOString());
  });
});

describe("PDS-Sync", () => {
  it("schreibt Match und Summary und übernimmt eine vorhandene Remote-Summary", async () => {
    const store = new LadderStore(new MemoryStorage());
    store.bindAccount(DID, "anna.test");
    store.recordResult(result(0));
    const queue = new SyncQueue(new MemoryStorage());
    queue.enqueue(DID, matchRecordsForAccount(result(0), DID, "2026-01-01T00:00:00.000Z"));
    const pds = new FakePds();
    pds.records.set(`${COLLECTIONS.ladderSummary}/self`, summaryRecord(entry({ matches: 9, wins: 6, bestWinStreak: 5, updatedAt: "2020-01-01T00:00:00.000Z" })));

    const merged = await syncAccount({ client: pds, did: DID, name: "anna.test", store, queue });
    expect(pds.created).toHaveLength(1);
    expect(queue.pending(DID)).toHaveLength(0);
    expect(pds.records.has("de.wurmduell.profile/self")).toBe(false); // kein Profil-Record mehr
    expect(merged).toMatchObject({ matches: 9, wins: 6, bestWinStreak: 5 });
    expect(store.entryFor(DID)).toMatchObject({ matches: 9, wins: 6 });
    expect(pds.records.get(`${COLLECTIONS.ladderSummary}/self`)).toMatchObject({ matches: 9, wins: 6 });
  });

  it("behält Matches in der Queue, wenn der PDS nicht erreichbar ist", async () => {
    const store = new LadderStore(new MemoryStorage());
    const queue = new SyncQueue(new MemoryStorage());
    queue.enqueue(DID, matchRecordsForAccount(result(1), DID, "2026-01-01T00:00:00.000Z"));
    const pds = new FakePds();
    pds.failCreates = true;
    await expect(syncAccount({ client: pds, did: DID, name: "anna.test", store, queue })).rejects.toThrow("offline");
    expect(queue.pending(DID)).toHaveLength(1);
    pds.failCreates = false;
    await syncAccount({ client: pds, did: DID, name: "anna.test", store, queue });
    expect(queue.pending(DID)).toHaveLength(0);
    expect(pds.created).toHaveLength(1);
  });

  it("bindAccount nutzt die DID als stabile Spieler-ID", () => {
    const store = new LadderStore(new MemoryStorage());
    store.resolvePlayer("anna.test");
    const p = store.bindAccount(DID, "anna.test");
    expect(p.id).toBe(DID);
    expect(p.name).toBe("anna.test (Konto)");
    expect(store.bindAccount(DID, "neu.test").name).toBe("neu.test");
  });
});
