import { describe, expect, it } from "vitest";
import {
  LADDER_KEY,
  LadderStore,
  accuracy,
  participantsFromResult,
  sortEntries,
  winRate,
} from "../src/ladder/LadderStore";
import type { LadderEntry, MatchResult, TeamStats } from "../src/types";
import { MemoryStorage } from "./helpers";

const stats = (over: Partial<TeamStats> = {}): TeamStats => ({
  shotsFired: 4,
  shotsHit: 2,
  damageDealt: 60,
  damageTaken: 40,
  ...over,
});

function entry(over: Partial<LadderEntry>): LadderEntry {
  return {
    playerId: "x",
    name: "X",
    matches: 0,
    wins: 0,
    losses: 0,
    shotsFired: 0,
    shotsHit: 0,
    damageDealt: 0,
    damageTaken: 0,
    bestWinStreak: 0,
    currentWinStreak: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("Ladder-Auswertung", () => {
  it("zählt Match, Sieg und Statistiken", () => {
    const store = new LadderStore(new MemoryStorage());
    store.recordMatch([{ playerId: "a", name: "Anna", outcome: "win", stats: stats() }]);
    const e = store.entryFor("a")!;
    expect(e.matches).toBe(1);
    expect(e.wins).toBe(1);
    expect(e.losses).toBe(0);
    expect(e.shotsFired).toBe(4);
    expect(e.shotsHit).toBe(2);
    expect(e.damageDealt).toBe(60);
    expect(e.damageTaken).toBe(40);
  });

  it("aktualisiert Hotseat-Spieler beide", () => {
    const store = new LadderStore(new MemoryStorage());
    store.recordMatch([
      { playerId: "a", name: "Anna", outcome: "win", stats: stats() },
      { playerId: "b", name: "Ben", outcome: "loss", stats: stats({ shotsHit: 1 }) },
    ]);
    expect(store.entryFor("a")!.wins).toBe(1);
    expect(store.entryFor("b")!.losses).toBe(1);
    expect(store.entryFor("b")!.matches).toBe(1);
  });

  it("führt Siegesserien und beste Serie", () => {
    const store = new LadderStore(new MemoryStorage());
    const play = (outcome: "win" | "loss"): void =>
      store.recordMatch([{ playerId: "a", name: "Anna", outcome, stats: stats() }]);
    play("win");
    play("win");
    play("win");
    expect(store.entryFor("a")!.currentWinStreak).toBe(3);
    play("loss");
    const e = store.entryFor("a")!;
    expect(e.currentWinStreak).toBe(0);
    expect(e.bestWinStreak).toBe(3);
    play("win");
    expect(store.entryFor("a")!.currentWinStreak).toBe(1);
    expect(store.entryFor("a")!.bestWinStreak).toBe(3);
  });

  it("Genauigkeit ist 0 ohne Schüsse, sonst Treffer/Schüsse", () => {
    expect(accuracy({ shotsFired: 0, shotsHit: 0 })).toBe(0);
    expect(accuracy({ shotsFired: 8, shotsHit: 2 })).toBeCloseTo(0.25);
    expect(winRate({ wins: 0, matches: 0 })).toBe(0);
    expect(winRate({ wins: 3, matches: 4 })).toBeCloseTo(0.75);
  });

  it("wertet nur menschliche Teams und gegen die KI nur das Profil des Menschen", () => {
    const result = {
      winner: 1,
      reason: "elimination",
      durationSeconds: 90,
      mapSeed: "s",
      config: {} as MatchResult["config"],
      teams: [
        { name: "Anna", controller: { kind: "human", playerId: "a" }, stats: stats(), wormsAlive: 0 },
        { name: "Computer (Normal)", controller: { kind: "ai", level: "normal" }, stats: stats(), wormsAlive: 2 },
      ],
    } as MatchResult;
    const parts = participantsFromResult(result);
    expect(parts).toHaveLength(1);
    expect(parts[0]!.playerId).toBe("a");
    expect(parts[0]!.outcome).toBe("loss");
  });

  it("Unentschieden zählt als Match ohne Sieg oder Niederlage und beendet die Serie", () => {
    const store = new LadderStore(new MemoryStorage());
    store.recordMatch([{ playerId: "a", name: "Anna", outcome: "win", stats: stats() }]);
    store.recordMatch([{ playerId: "a", name: "Anna", outcome: "draw", stats: stats() }]);
    const e = store.entryFor("a")!;
    expect(e.matches).toBe(2);
    expect(e.wins).toBe(1);
    expect(e.losses).toBe(0);
    expect(e.currentWinStreak).toBe(0);
  });
});

describe("Rangliste", () => {
  it("sortiert nach Siegen, Genauigkeit, Schaden, Name", () => {
    const sorted = sortEntries([
      entry({ playerId: "1", name: "Zoe", wins: 2, shotsFired: 10, shotsHit: 5, damageDealt: 100 }),
      entry({ playerId: "2", name: "Ben", wins: 3, shotsFired: 10, shotsHit: 1, damageDealt: 10 }),
      entry({ playerId: "3", name: "Cleo", wins: 2, shotsFired: 10, shotsHit: 8, damageDealt: 50 }),
      entry({ playerId: "4", name: "Anna", wins: 2, shotsFired: 10, shotsHit: 5, damageDealt: 100 }),
      entry({ playerId: "5", name: "Dora", wins: 2, shotsFired: 10, shotsHit: 5, damageDealt: 120 }),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["Ben", "Cleo", "Dora", "Anna", "Zoe"]);
  });
});

describe("Persistenz", () => {
  it("übersteht ein erneutes Laden (neue Store-Instanz auf demselben Speicher)", () => {
    const storage = new MemoryStorage();
    new LadderStore(storage).recordMatch([{ playerId: "a", name: "Anna", outcome: "win", stats: stats() }]);
    const reloaded = new LadderStore(storage);
    expect(reloaded.entries()).toHaveLength(1);
    expect(reloaded.entryFor("a")!.wins).toBe(1);
  });

  it("speichert sofort unter dem versionierten Schlüssel", () => {
    const storage = new MemoryStorage();
    new LadderStore(storage).recordMatch([{ playerId: "a", name: "Anna", outcome: "win", stats: stats() }]);
    const raw = JSON.parse(storage.getItem(LADDER_KEY)!);
    expect(raw.version).toBe(1);
    expect(raw.entries[0].playerId).toBe("a");
  });

  it("verträgt beschädigte Daten", () => {
    const storage = new MemoryStorage();
    storage.setItem(LADDER_KEY, "{kaputt");
    expect(new LadderStore(storage).entries()).toEqual([]);
  });

  it("arbeitet auch ohne Speicher im Arbeitsspeicher weiter", () => {
    const store = new LadderStore(null);
    store.recordMatch([{ playerId: "a", name: "Anna", outcome: "win", stats: stats() }]);
    expect(store.entryFor("a")!.matches).toBe(1);
  });

  it("Reset leert die Ladder", () => {
    const store = new LadderStore(new MemoryStorage());
    store.recordMatch([{ playerId: "a", name: "Anna", outcome: "win", stats: stats() }]);
    store.reset();
    expect(store.entries()).toEqual([]);
  });
});

describe("Spieler-Identität", () => {
  it("liefert für denselben Namen dieselbe stabile ID", () => {
    const storage = new MemoryStorage();
    const a = new LadderStore(storage).resolvePlayer("Anna");
    const again = new LadderStore(storage).resolvePlayer("anna");
    expect(again.id).toBe(a.id);
  });

  it("Umbenennen ändert den Namen, nicht die ID – auch in der Ladder", () => {
    const store = new LadderStore(new MemoryStorage());
    const p = store.resolvePlayer("Anna");
    store.recordMatch([{ playerId: p.id, name: p.name, outcome: "win", stats: stats() }]);
    expect(store.renamePlayer(p.id, "Annabelle")).toBe(true);
    expect(store.entryFor(p.id)!.name).toBe("Annabelle");
    expect(store.resolvePlayer("Annabelle").id).toBe(p.id);
  });

  it("lehnt doppelte Namen beim Umbenennen ab", () => {
    const store = new LadderStore(new MemoryStorage());
    const a = store.resolvePlayer("Anna");
    store.resolvePlayer("Ben");
    expect(store.renamePlayer(a.id, "ben")).toBe(false);
  });
});
