import type { Outcome } from "../ladder/LadderStore";
import { participantsFromResult } from "../ladder/LadderStore";
import type { LadderEntry, MatchResult } from "../types";

/** Collection-Namen (NSIDs) der Wurmduell-Records im PDS, siehe `lexicons/`. */
export const COLLECTIONS = {
  ladderSummary: "de.wurmduell.ladderSummary",
  matchResult: "de.wurmduell.matchResult",
} as const;

export type SummaryRecord = {
  $type: typeof COLLECTIONS.ladderSummary;
} & Omit<LadderEntry, "playerId" | "name">;

export interface MatchResultRecord {
  $type: typeof COLLECTIONS.matchResult;
  mode: "hotseat" | "vsAi";
  outcome: Outcome;
  opponent: { kind: "human" | "ai"; did?: string; name: string };
  stats: { shotsFired: number; shotsHit: number; damageDealt: number; damageTaken: number };
  durationSeconds: number;
  mapSeed: string;
  createdAt: string;
}

export const isDid = (id: string): boolean => id.startsWith("did:");

/** Baut den `matchResult`-Record für ein menschliches Team (Index in `result.teams`). */
export function matchResultRecord(result: MatchResult, teamIndex: number, createdAt: string): MatchResultRecord {
  const me = result.teams[teamIndex]!;
  const other = result.teams[1 - teamIndex]!;
  const outcome: Outcome = result.winner === null ? "draw" : result.winner === teamIndex ? "win" : "loss";
  const opponent: MatchResultRecord["opponent"] = {
    kind: other.controller.kind === "human" ? "human" : "ai",
    name: other.name,
  };
  if (other.controller.kind === "human" && isDid(other.controller.playerId)) opponent.did = other.controller.playerId;
  return {
    $type: COLLECTIONS.matchResult,
    mode: result.config.mode,
    outcome,
    opponent,
    stats: {
      shotsFired: me.stats.shotsFired,
      shotsHit: me.stats.shotsHit,
      damageDealt: me.stats.damageDealt,
      damageTaken: me.stats.damageTaken,
    },
    durationSeconds: Math.max(0, Math.round(result.durationSeconds)),
    mapSeed: result.mapSeed,
    createdAt,
  };
}

/** Alle `matchResult`-Records, die aus einem Ergebnis für das angegebene Konto entstehen. */
export function matchRecordsForAccount(result: MatchResult, did: string, createdAt: string): MatchResultRecord[] {
  const mine = participantsFromResult(result).filter((p) => p.playerId === did);
  if (mine.length === 0) return [];
  const out: MatchResultRecord[] = [];
  result.teams.forEach((team, index) => {
    if (team.controller.kind === "human" && team.controller.playerId === did) out.push(matchResultRecord(result, index, createdAt));
  });
  return out;
}

export function summaryRecord(entry: LadderEntry): SummaryRecord {
  const { playerId: _id, name: _name, ...rest } = entry;
  return { $type: COLLECTIONS.ladderSummary, ...rest };
}

const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/** Liest einen (nicht vertrauenswürdigen) Summary-Record aus dem PDS defensiv ein. */
export function entryFromSummary(raw: unknown, playerId: string, name: string): LadderEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  return {
    playerId,
    name,
    matches: int(r.matches),
    wins: int(r.wins),
    losses: int(r.losses),
    shotsFired: int(r.shotsFired),
    shotsHit: int(r.shotsHit),
    damageDealt: int(r.damageDealt),
    damageTaken: int(r.damageTaken),
    bestWinStreak: int(r.bestWinStreak),
    currentWinStreak: int(r.currentWinStreak),
    updatedAt: typeof r.updatedAt === "string" && !Number.isNaN(Date.parse(r.updatedAt)) ? r.updatedAt : new Date(0).toISOString(),
  };
}

/**
 * Merge-Regel aus der Spezifikation (9.4): Zähler nehmen jeweils den höheren Wert,
 * Serie und Zeitstempel kommen von der neueren Seite.
 */
export function mergeLadder(local: LadderEntry, remote: LadderEntry): LadderEntry {
  const remoteNewer = Date.parse(remote.updatedAt) > Date.parse(local.updatedAt);
  return {
    ...local,
    matches: Math.max(local.matches, remote.matches),
    wins: Math.max(local.wins, remote.wins),
    losses: Math.max(local.losses, remote.losses),
    shotsFired: Math.max(local.shotsFired, remote.shotsFired),
    shotsHit: Math.max(local.shotsHit, remote.shotsHit),
    damageDealt: Math.max(local.damageDealt, remote.damageDealt),
    damageTaken: Math.max(local.damageTaken, remote.damageTaken),
    bestWinStreak: Math.max(local.bestWinStreak, remote.bestWinStreak),
    currentWinStreak: remoteNewer ? remote.currentWinStreak : local.currentWinStreak,
    updatedAt: remoteNewer ? remote.updatedAt : local.updatedAt,
  };
}
