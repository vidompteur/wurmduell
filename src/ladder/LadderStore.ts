import type { Ladder, LadderEntry, MatchResult, TeamStats } from "../types";

export const LADDER_KEY = "wurmduell.ladder.v1";
export const PLAYER_IDS_KEY = "wurmduell.playerIds.v1";

/** Minimales Storage-Interface (localStorage oder Testdouble). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PlayerRecord {
  id: string;
  name: string;
}

interface PlayerRegistry {
  version: 1;
  players: PlayerRecord[];
}

export type Outcome = "win" | "loss" | "draw";

export interface MatchParticipant {
  playerId: string;
  name: string;
  outcome: Outcome;
  stats: TeamStats;
}

/** Trefferquote in [0, 1]; bei 0 Schüssen 0. */
export function accuracy(e: Pick<LadderEntry, "shotsFired" | "shotsHit">): number {
  return e.shotsFired === 0 ? 0 : e.shotsHit / e.shotsFired;
}

export function winRate(e: Pick<LadderEntry, "wins" | "matches">): number {
  return e.matches === 0 ? 0 : e.wins / e.matches;
}

/** Standard-Sortierung: Siege, Zielgenauigkeit, Schaden (alle absteigend), dann Name. */
export function sortEntries(entries: readonly LadderEntry[]): LadderEntry[] {
  return entries.slice().sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const acc = accuracy(b) - accuracy(a);
    if (acc !== 0) return acc;
    if (b.damageDealt !== a.damageDealt) return b.damageDealt - a.damageDealt;
    return a.name.localeCompare(b.name, "de");
  });
}

/**
 * Nur menschliche Teams zählen für die Ladder. KI-Gegner sind keine
 * Ladder-Teilnehmer; gegen die KI wird nur das menschliche Profil aktualisiert.
 */
export function participantsFromResult(result: MatchResult): MatchParticipant[] {
  const out: MatchParticipant[] = [];
  result.teams.forEach((team, index) => {
    if (team.controller.kind !== "human") return;
    const outcome: Outcome = result.winner === null ? "draw" : result.winner === index ? "win" : "loss";
    out.push({ playerId: team.controller.playerId, name: team.name, outcome, stats: team.stats });
  });
  return out;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null; // z. B. blockierter Speicher
  }
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function sanitizeEntry(raw: unknown): LadderEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.playerId !== "string" || typeof r.name !== "string") return null;
  return {
    playerId: r.playerId,
    name: r.name,
    matches: num(r.matches),
    wins: num(r.wins),
    losses: num(r.losses),
    shotsFired: num(r.shotsFired),
    shotsHit: num(r.shotsHit),
    damageDealt: num(r.damageDealt),
    damageTaken: num(r.damageTaken),
    bestWinStreak: num(r.bestWinStreak),
    currentWinStreak: num(r.currentWinStreak),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date(0).toISOString(),
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `p_${crypto.randomUUID()}`;
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Lokale Ladder und Spielerverzeichnis auf Basis von `localStorage`.
 * Liest bei jedem Zugriff aus dem Speicher (mehrere Tabs bleiben konsistent) und
 * fällt auf einen In-Memory-Speicher zurück, wenn der Browser den Zugriff verweigert.
 */
export class LadderStore {
  private memLadder: Ladder = { version: 1, entries: [] };
  private memPlayers: PlayerRegistry = { version: 1, players: [] };

  constructor(
    private readonly storage: StorageLike | null = defaultStorage(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ---------------------------------------------------------------- Ladder

  load(): Ladder {
    const raw = this.read(LADDER_KEY);
    if (raw === null) return this.memLadder;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && (parsed as Ladder).version === 1) {
        const entries = ((parsed as Ladder).entries ?? [])
          .map(sanitizeEntry)
          .filter((e): e is LadderEntry => e !== null);
        return { version: 1, entries };
      }
    } catch {
      /* beschädigte Daten → leere Ladder */
    }
    return { version: 1, entries: [] };
  }

  entries(): LadderEntry[] {
    return sortEntries(this.load().entries);
  }

  entryFor(playerId: string): LadderEntry | undefined {
    return this.load().entries.find((e) => e.playerId === playerId);
  }

  /** Verbucht eine beendete Partie für alle menschlichen Teilnehmer und speichert sofort. */
  recordMatch(participants: readonly MatchParticipant[]): void {
    const ladder = this.load();
    const stamp = this.now().toISOString();
    for (const p of participants) {
      let entry = ladder.entries.find((e) => e.playerId === p.playerId);
      if (!entry) {
        entry = {
          playerId: p.playerId,
          name: p.name,
          matches: 0,
          wins: 0,
          losses: 0,
          shotsFired: 0,
          shotsHit: 0,
          damageDealt: 0,
          damageTaken: 0,
          bestWinStreak: 0,
          currentWinStreak: 0,
          updatedAt: stamp,
        };
        ladder.entries.push(entry);
      }
      entry.name = p.name;
      entry.matches += 1;
      entry.shotsFired += p.stats.shotsFired;
      entry.shotsHit += p.stats.shotsHit;
      entry.damageDealt += p.stats.damageDealt;
      entry.damageTaken += p.stats.damageTaken;
      if (p.outcome === "win") {
        entry.wins += 1;
        entry.currentWinStreak += 1;
        entry.bestWinStreak = Math.max(entry.bestWinStreak, entry.currentWinStreak);
      } else {
        // Niederlage und Unentschieden beenden eine Siegesserie.
        if (p.outcome === "loss") entry.losses += 1;
        entry.currentWinStreak = 0;
      }
      entry.updatedAt = stamp;
    }
    this.save(ladder);
  }

  recordResult(result: MatchResult): void {
    this.recordMatch(participantsFromResult(result));
  }

  /** Ersetzt (oder legt an) den Ladder-Eintrag eines Spielers, z. B. nach dem PDS-Abgleich. */
  upsertEntry(entry: LadderEntry): void {
    const ladder = this.load();
    const i = ladder.entries.findIndex((e) => e.playerId === entry.playerId);
    if (i >= 0) ladder.entries[i] = entry;
    else ladder.entries.push(entry);
    this.save(ladder);
  }

  reset(): void {
    this.save({ version: 1, entries: [] });
  }

  // --------------------------------------------------------------- Spieler

  players(): PlayerRecord[] {
    return this.loadPlayers().players;
  }

  /**
   * Liefert den (stabilen) Spieler zu einem Namen; legt ihn an, falls er noch
   * nicht bekannt ist. Der Name darf später geändert werden, die ID bleibt.
   */
  resolvePlayer(name: string): PlayerRecord {
    const clean = name.trim();
    const reg = this.loadPlayers();
    const found = reg.players.find((p) => p.name.toLowerCase() === clean.toLowerCase());
    if (found) return found;
    const created = { id: newId(), name: clean };
    reg.players.push(created);
    this.savePlayers(reg);
    return created;
  }

  /**
   * Verknüpft ein ATProto-Konto mit einem lokalen Spieler. Die DID ist die stabile ID
   * (Handles können sich ändern); der angezeigte Name folgt dem aktuellen Handle.
   */
  bindAccount(did: string, name: string, conflictSuffix = " (Konto)"): PlayerRecord {
    const clean = name.trim() || did;
    const reg = this.loadPlayers();
    const existing = reg.players.find((p) => p.id === did);
    const taken = (n: string): boolean => reg.players.some((p) => p.id !== did && p.name.toLowerCase() === n.toLowerCase());
    const finalName = taken(clean) ? `${clean}${conflictSuffix}` : clean;
    if (existing) {
      existing.name = finalName;
    } else {
      reg.players.push({ id: did, name: finalName });
    }
    this.savePlayers(reg);
    const ladder = this.load();
    const entry = ladder.entries.find((e) => e.playerId === did);
    if (entry && entry.name !== finalName) {
      entry.name = finalName;
      this.save(ladder);
    }
    return { id: did, name: finalName };
  }

  /** Benennt einen Spieler um, ohne seine ID zu ändern. Liefert false bei Namenskonflikt. */
  renamePlayer(playerId: string, newName: string): boolean {
    const clean = newName.trim();
    if (!clean) return false;
    const reg = this.loadPlayers();
    if (reg.players.some((p) => p.id !== playerId && p.name.toLowerCase() === clean.toLowerCase())) return false;
    const player = reg.players.find((p) => p.id === playerId);
    if (player) player.name = clean;
    this.savePlayers(reg);
    const ladder = this.load();
    const entry = ladder.entries.find((e) => e.playerId === playerId);
    if (entry) {
      entry.name = clean;
      this.save(ladder);
    }
    return Boolean(player || entry);
  }

  // ---------------------------------------------------------------- Intern

  private loadPlayers(): PlayerRegistry {
    const raw = this.read(PLAYER_IDS_KEY);
    if (raw === null) return this.memPlayers;
    try {
      const parsed = JSON.parse(raw) as Partial<PlayerRegistry>;
      if (parsed.version === 1 && Array.isArray(parsed.players)) {
        const players = parsed.players.filter(
          (p): p is PlayerRecord => typeof p?.id === "string" && typeof p?.name === "string",
        );
        return { version: 1, players };
      }
    } catch {
      /* ignorieren */
    }
    return { version: 1, players: [] };
  }

  private savePlayers(reg: PlayerRegistry): void {
    this.memPlayers = reg;
    this.write(PLAYER_IDS_KEY, JSON.stringify(reg));
  }

  private save(ladder: Ladder): void {
    this.memLadder = ladder;
    this.write(LADDER_KEY, JSON.stringify(ladder));
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      /* Speicher voll oder gesperrt: In-Memory-Stand bleibt erhalten */
    }
  }
}
